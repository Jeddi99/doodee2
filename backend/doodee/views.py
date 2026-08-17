import os
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta

import cv2
import numpy as np
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    ChatConversation, ChatMessage, ChatUsage, ConsentEvent, Order, Plan, PromoCode,
    PromoRedemption, Scan, Simulation, SimulationPreviewUsage,
)
from .billing import CouponError, create_order, quote, sync_entitlement, validate_coupon
from .demo_data import create_demo_scan
from .procedures import PROCEDURES
from .chat import (
    HISTORY_TURNS, MAX_QUESTION_CHARS, ChatUnavailable, chat_enabled, reply as chat_reply,
    scan_context, title_for,
)
from .serializers import (
    ChatConversationDetailSerializer, ChatConversationSerializer, ChatMessageSerializer,
    OrderSerializer, PlanSerializer, ScanSerializer, SimulationSerializer,
)
from .analysis_engine import PROFILE_VIEWS, SCAN_VIEW_MODES, DEFAULT_SCAN_MODE, scan_views_for_mode
from .reference_scoring import REFERENCE_POPULATIONS
from .percentile import score_card as build_score_card
from .simulation_engine import has_profile_images, related_union, simulate, source_for_scan, validate_selections
from .storage import delete_image, download_image, signed_url, upload_image
from .tasks import cleanup_scan, process_scan, process_simulation, request_scan_deletion


SCAN_VIEWS = SCAN_VIEW_MODES["full"]
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


@api_view(("GET",))
def session(request):
    sync_entitlement(request.user)
    plan = _user_plan(request.user)
    now = timezone.now()
    usage = SimulationPreviewUsage.objects.filter(user=request.user, period=now.date().replace(day=1)).first()
    saved = Simulation.objects.filter(scan__user=request.user, created_at__year=now.year, created_at__month=now.month).exclude(status=Simulation.Status.FAILED).count()
    return Response({
        "id": request.user.id, "email": request.user.email, "plan": plan,
        # Lets the client say the feature is off before a button is pressed, instead of
        # letting every request come back 503.
        "simulation_enabled": settings.SIMULATION_ENABLED,
        "redeem_enabled": settings.REDEEM_CODES_ENABLED,
        "simulation_locked": plan == "free",
        # Decided here rather than from `plan` on the client, so the entitlement rule lives in
        # one place — the same reason simulation_locked is a server field.
        "score_card_locked": plan == "free",
        "chat_enabled": chat_enabled(),
        "demo_scans_enabled": settings.DEMO_SCANS_ENABLED,
        # Same reasoning as preview_remaining: the client shows the counter and the upgrade
        # prompt, but the number it shows is the one the server will actually enforce.
        "chat_remaining": _chat_remaining(request.user),
        "vip_expires_at": _vip_expires_at(request.user),
        "preview_remaining": None if plan != "free" else max(0, 3 - (usage.count if usage else 0)),
        "saved_remaining": max(0, 3 - saved),
    })


def _preview_remaining(user):
    if _user_plan(user) != "free":
        return None
    usage = SimulationPreviewUsage.objects.filter(user=user, period=timezone.localdate().replace(day=1)).first()
    return max(0, 3 - (usage.count if usage else 0))


def _cohort_labels(scan):
    """Whether this user falls inside the published cohort, so the client can say so.

    The score itself is never rescaled for people outside it.
    """
    scores = (scan.analysis_data or {}).get("reference_scores") or {}
    return {
        "cohort_match": scores.get("cohort_match"),
        "population_match": scores.get("population_match"),
        "reference_profile": scan.reference_profile,
    }


REDEEM_FAILURE_LIMIT = 10


@api_view(("POST",))
def redeem(request):
    if not settings.REDEEM_CODES_ENABLED:
        return Response({"detail": "redeem_disabled"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    code = str(request.data.get("code", "")).strip().upper()
    if not code:
        raise ValidationError({"code": "invalid_code"})

    # Only wrong guesses are counted, so someone redeeming a code they hold is never locked out.
    failure_key = f"redeem-fail:{request.user.id}:{timezone.now():%Y%m%d%H}"
    if (cache.get(failure_key) or 0) >= REDEEM_FAILURE_LIMIT:
        return Response({"detail": "too_many_attempts"}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    promo = PromoCode.objects.filter(code=code, is_active=True).first()
    if not promo:
        # A disabled code and a code that never existed answer identically, so the response
        # cannot be used to discover which codes are real.
        cache.add(failure_key, 0, timeout=3700)
        cache.incr(failure_key)
        raise ValidationError({"code": "invalid_code"})

    redemption = PromoRedemption.objects.create(
        user=request.user,
        promo_code=promo,
        expires_at=timezone.now() + timedelta(days=promo.days),
    )
    return Response({
        "plan": _user_plan(request.user),
        "vip_expires_at": _vip_expires_at(request.user),
        "days": promo.days,
        "redeemed_at": redemption.redeemed_at,
    })


def _simulation_locked(user):
    """Simulation is entitlement-only.

    Enforced here rather than by hiding the button, or anyone calling the API directly would
    walk straight past it.
    """
    return _user_plan(user) == "free"


def _vip_expires_at(user):
    """When the current promo entitlement runs out, or None.

    Read at request time rather than expired by a scheduled job: a job that fails to run would
    leave paid entitlement switched on indefinitely.
    """
    latest = PromoRedemption.objects.filter(user=user, expires_at__gt=timezone.now()).order_by("-expires_at").first()
    return latest.expires_at if latest else None


def _user_plan(user):
    groups = set(user.groups.values_list("name", flat=True))
    if "clinic_partner" in groups:
        return "clinic"
    if "pro_member" in groups:
        return "member"
    # A redeemed code never demotes someone who actually pays, so it is checked last.
    return "vip" if _vip_expires_at(user) else "free"


def _selections_from(data):
    """One request shape for stacked and single selections.

    The mobile app still sends a lone `region`/`preset_id` pair, so that pair is folded into a
    one-item stack here instead of being kept as a second code path through quota, locking and
    the worker. Sending both shapes at once is refused rather than guessed at: the two could
    disagree, and picking a winner silently would render something nobody asked for.
    """
    if "selections" in data:
        if "region" in data or "preset_id" in data:
            raise ValidationError({"selections": "conflicting_selection_fields"})
        return data["selections"]
    return [{"region": data.get("region"), "preset_id": data.get("preset_id")}]


def _resolve_stack(scan, data):
    """Returns `(selections, presets, targets)` with the whole stack already validated."""
    selections = _selections_from(data)
    try:
        presets, targets = validate_selections(scan, selections, has_profile_images(scan))
    except ValueError as exc:
        raise ValidationError({"preset_id": str(exc)}) from exc
    return selections, presets, targets


def _record_simulation_consent(user, version):
    if not ConsentEvent.objects.filter(user=user, purpose=ConsentEvent.Purpose.SIMULATION, policy_version=version, accepted=True).exists():
        ConsentEvent.objects.create(user=user, purpose=ConsentEvent.Purpose.SIMULATION, policy_version=version)


def _claim_free_preview(user):
    """Unreachable while simulation is entitlement-only, and kept deliberately.

    `_simulation_locked` turns free accounts away before this runs. Locking is a product
    decision that may be relaxed back to a free trial, so the metering stays wired up rather
    than being deleted and rebuilt.
    """
    period = timezone.localdate().replace(day=1)
    with transaction.atomic():
        usage, _ = SimulationPreviewUsage.objects.select_for_update().get_or_create(user=user, period=period)
        if usage.count >= 3:
            return None
        usage.count += 1
        usage.save(update_fields=("count",))
        return 3 - usage.count


def _restore_free_preview(user):
    SimulationPreviewUsage.objects.filter(user=user, period=timezone.localdate().replace(day=1), count__gt=0).update(count=F("count") - 1)


def _read_image(upload):
    if upload.content_type not in ALLOWED_TYPES:
        raise ValidationError({upload.name: "Only JPEG, PNG, and WebP images are accepted"})
    data = upload.read(MAX_IMAGE_BYTES + 1)
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValidationError({upload.name: "Each image must be between 1 byte and 10 MB"})
    if cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) is None:
        raise ValidationError({upload.name: "Image could not be decoded"})
    return data


class ScanViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin):
    serializer_class = ScanSerializer
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        return Scan.objects.filter(user=self.request.user).exclude(status=Scan.Status.DELETION_PENDING)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset().filter(age_band=Scan.AgeBand.ADULT)
        return Response(self.get_serializer(queryset, many=True).data)

    def create(self, request):
        age_band = request.data.get("age_band")
        if age_band not in Scan.AgeBand.values:
            raise ValidationError({"age_band": "Must be adult or minor"})
        reference_age_band = str(request.data.get("reference_age_band", "")).strip()
        reference_profile = str(request.data.get("reference_profile", "")).strip()
        if age_band == Scan.AgeBand.ADULT:
            if reference_age_band not in ("18_35", "36_plus"):
                raise ValidationError({"reference_age_band": "Must be 18_35 or 36_plus for adults"})
            if reference_profile not in ("neutral", "masculine", "feminine"):
                raise ValidationError({"reference_profile": "Must be neutral, masculine, or feminine"})
        else:
            reference_age_band, reference_profile = "under_18", "neutral"
        reference_population = str(request.data.get("reference_population", "TH")).strip().upper() or "TH"
        if reference_population not in REFERENCE_POPULATIONS:
            raise ValidationError({"reference_population": f"Must be one of {', '.join(REFERENCE_POPULATIONS)}"})
        consent_version = str(request.data.get("analysis_consent_version", "")).strip()
        if not consent_version:
            raise ValidationError({"analysis_consent_version": "Consent is required"})
        scan_mode = str(request.data.get("scan_mode", DEFAULT_SCAN_MODE)).strip().lower() or DEFAULT_SCAN_MODE
        if scan_mode not in SCAN_VIEW_MODES:
            raise ValidationError({"scan_mode": f"Must be one of {', '.join(SCAN_VIEW_MODES)}"})
        required_views = tuple(v for v in scan_views_for_mode(scan_mode))
        missing = [view for view in required_views if view not in request.FILES]
        if missing:
            raise ValidationError({"missing_views": missing})
        payloads = {view: _read_image(request.FILES[view]) for view in required_views}
        expires_at = timezone.now() + timedelta(hours=24 if age_band == Scan.AgeBand.MINOR else 30 * 24)
        uploaded = {}
        token = os.urandom(16).hex()
        upload_error = None
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {}
            for view in required_views:
                object_name = f"users/{request.user.id}/scans/{token}/{view}"
                future = pool.submit(upload_image, object_name, payloads[view], request.FILES[view].content_type)
                futures[future] = view
            for future in as_completed(futures):
                view = futures[future]
                try:
                    uploaded[view] = future.result()
                except Exception as exc:
                    upload_error = upload_error or exc
        if upload_error:
            for object_name in uploaded.values():
                try:
                    delete_image(object_name)
                except Exception:
                    pass
            return Response({"detail": "Image storage is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            with transaction.atomic():
                scan = Scan.objects.create(
                    user=request.user,
                    age_band=age_band,
                    reference_age_band=reference_age_band,
                    reference_profile=reference_profile,
                    reference_population=reference_population,
                    scan_mode=scan_mode,
                    image_objects=uploaded,
                    expires_at=expires_at,
                )
                ConsentEvent.objects.create(
                    user=request.user,
                    purpose=ConsentEvent.Purpose.ANALYSIS,
                    policy_version=consent_version,
                )
                if age_band == Scan.AgeBand.ADULT:
                    ConsentEvent.objects.create(
                        user=request.user,
                        purpose=ConsentEvent.Purpose.STORAGE,
                        policy_version=consent_version,
                    )
        except Exception:
            for object_name in uploaded.values():
                try:
                    delete_image(object_name)
                except Exception:
                    pass
            raise
        try:
            process_scan.delay(str(scan.id))
        except Exception:
            for object_name in uploaded.values():
                try:
                    delete_image(object_name)
                except Exception:
                    pass
            scan.delete()
            return Response({"detail": "Analysis queue is unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(scan).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=("get",))
    def status(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=("get",), url_path="score-card")
    def score_card(self, request, pk=None):
        """Entitlement-gated similarity card for one scan.

        Gated on the server rather than by hiding the route on the client: a locked feature
        that still answers over HTTP is not locked. Mirrors the 403 shape the simulation
        endpoints use so the client can reuse its handling.
        """
        if _user_plan(request.user) == "free":
            return Response(
                {"detail": "score_card_requires_entitlement"},
                status=status.HTTP_403_FORBIDDEN,
            )
        scan = self.get_object()
        card = build_score_card(scan.analysis_data)
        if card is None:
            return Response(
                {"detail": "score_card_unavailable", "scan_status": scan.status},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({**card, "scan_id": str(scan.id), "front_url": ScanSerializer(scan).data.get("front_url")})

    def destroy(self, request, pk=None):
        request_scan_deletion(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)


class SimulationViewSet(viewsets.GenericViewSet, mixins.RetrieveModelMixin):
    serializer_class = SimulationSerializer

    def get_queryset(self):
        return Simulation.objects.filter(scan__user=self.request.user).exclude(status=Simulation.Status.DELETION_PENDING)

    def create(self, request):
        if not settings.SIMULATION_ENABLED:
            return Response({"detail": "Simulation is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if _simulation_locked(request.user):
            return Response({"detail": "simulation_requires_entitlement"}, status=status.HTTP_403_FORBIDDEN)
        allowed_fields = {"scan_id", "region", "preset_id", "selections", "simulation_consent_version"}
        if set(request.data) - allowed_fields:
            raise ValidationError({"detail": "Only scan_id, selections (or region and preset_id), and simulation_consent_version are accepted"})
        consent_version = str(request.data.get("simulation_consent_version", "")).strip()
        if not consent_version:
            raise ValidationError({"simulation_consent_version": "Separate simulation consent is required"})
        try:
            scan = Scan.objects.get(pk=request.data.get("scan_id"), user=request.user)
        except (Scan.DoesNotExist, ValueError, TypeError):
            raise NotFound("Scan not found")
        if scan.age_band != Scan.AgeBand.ADULT:
            raise ValidationError({"scan_id": "Simulation is unavailable to minors"})
        if scan.status != Scan.Status.COMPLETED or scan.expires_at <= timezone.now() or not scan.image_objects.get("front"):
            raise ValidationError({"scan_id": "A completed scan with an unexpired front image is required"})
        selections, presets, targets = _resolve_stack(scan, request.data)
        if any(target and target["already_near_reference"] for target in targets):
            raise ValidationError({"preset_id": "already_near_reference"})
        active = self.get_queryset().filter(status__in=(Simulation.Status.QUEUED, Simulation.Status.PROCESSING)).exists()
        if active:
            return Response({"detail": "Only one simulation can run at a time"}, status=status.HTTP_409_CONFLICT)
        now = timezone.now()
        monthly = self.get_queryset().filter(
            created_at__year=now.year,
            created_at__month=now.month,
        ).exclude(status=Simulation.Status.FAILED).count()
        if monthly >= 3:
            return Response({"detail": "Monthly simulation quota reached"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        simulation = Simulation.objects.create(
            scan=scan,
            selections=selections,
            # The first item is mirrored into the old single-value columns so existing readers
            # — the serializer's `preset`, the admin, saved rows from before stacking — still work.
            region=selections[0]["region"],
            preset_id=selections[0]["preset_id"],
            parameters={"delta": presets[0]["delta"],
                        "deltas": [{"region": p["region"], "preset_id": p["id"], "delta": p["delta"]} for p in presets]},
            model_version="local-mediapipe-opencv-1",
            related_procedures=related_union(presets),
            expires_at=now + timedelta(days=30),
        )
        _record_simulation_consent(request.user, consent_version)
        try:
            process_simulation.delay(str(simulation.id))
        except Exception:
            simulation.delete()
            return Response({"detail": "Simulation queue is unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(simulation).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=("post",), url_path="preview")
    def preview(self, request):
        if not settings.SIMULATION_ENABLED:
            return Response({"detail": "Simulation is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if _simulation_locked(request.user):
            return Response({"detail": "simulation_requires_entitlement"}, status=status.HTTP_403_FORBIDDEN)
        allowed_fields = {"scan_id", "region", "preset_id", "selections", "simulation_consent_version"}
        if set(request.data) - allowed_fields:
            raise ValidationError({"detail": "Only scan_id, selections (or region and preset_id), and simulation_consent_version are accepted"})
        consent_version = str(request.data.get("simulation_consent_version", "")).strip()
        if not consent_version:
            raise ValidationError({"simulation_consent_version": "Separate simulation consent is required"})
        try:
            scan = Scan.objects.get(pk=request.data.get("scan_id"), user=request.user)
        except (Scan.DoesNotExist, ValueError, TypeError):
            raise NotFound("Scan not found")
        if scan.age_band != Scan.AgeBand.ADULT:
            raise ValidationError({"scan_id": "Simulation is unavailable to minors"})
        if scan.status != Scan.Status.COMPLETED or scan.expires_at <= timezone.now():
            raise ValidationError({"scan_id": "A completed unexpired scan is required"})
        # The whole stack is resolved before quota, lock or storage is touched, so a request
        # that cannot be rendered in full costs nothing and renders nothing partial.
        _selections, presets, targets = _resolve_stack(scan, request.data)
        preset, target = presets[0], targets[0]
        cohort = _cohort_labels(scan)
        # Answered before any quota is claimed: an invisible warp should not cost a preview.
        if target and target["already_near_reference"]:
            return Response({"preset": preset, "presets": presets, "already_near_reference": True, "after_data_url": None,
                             "measurements": [target], "related_procedures": [], **cohort,
                             "entitlement": {"plan": _user_plan(request.user), "preview_remaining": _preview_remaining(request.user)}})

        plan = _user_plan(request.user)
        lock_key = f"simulation-preview-lock:{request.user.id}"
        if not cache.add(lock_key, 1, timeout=15):
            return Response({"detail": "preview_in_progress"}, status=status.HTTP_409_CONFLICT)
        remaining = None
        claimed = False
        try:
            if plan == "free":
                remaining = _claim_free_preview(request.user)
                if remaining is None:
                    return Response({"detail": "monthly_preview_quota_reached"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
                claimed = True
            else:
                hourly_key = f"simulation-preview-hour:{request.user.id}:{timezone.now():%Y%m%d%H}"
                cache.add(hourly_key, 0, timeout=3700)
                if cache.incr(hourly_key) > 120:
                    return Response({"detail": "preview_rate_limited"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            source, source_object, source_view = source_for_scan(scan, preset, download_image)
            # 768 was rendering roughly half the pixels the viewer displays on a retina screen,
            # so every preview arrived visibly softer than the untouched before image next to it.
            output, measurements, focus_boxes = simulate(source, presets, max_side=1280, output_format=".webp")
            _record_simulation_consent(request.user, consent_version)
            return Response({
                # `preset` and `focus_box` are the first item, kept for clients that predate stacking.
                "preset": preset, "presets": presets, "source_view": source_view, "before_url": signed_url(source_object),
                "after_data_url": f"data:image/webp;base64,{base64.b64encode(output).decode('ascii')}",
                "measurements": measurements, "related_procedures": related_union(presets),
                "focus_boxes": focus_boxes, "focus_box": focus_boxes[preset["region"]],
                "already_near_reference": False, **cohort,
                "entitlement": {"plan": plan, "preview_remaining": remaining},
            })
        except ValueError as exc:
            if claimed:
                _restore_free_preview(request.user)
            raise ValidationError({"detail": str(exc)}) from exc
        except Exception:
            if claimed:
                _restore_free_preview(request.user)
            return Response({"detail": "preview_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        finally:
            cache.delete(lock_key)

    @action(detail=True, methods=("get",))
    def status(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)


class ProcedureList(APIView):
    def get(self, request, procedure_id=None):
        if procedure_id:
            procedure = next((item for item in PROCEDURES if item["id"] == procedure_id), None)
            if not procedure:
                raise NotFound("Procedure not found")
            return Response(procedure)
        region = request.query_params.get("region")
        return Response([item for item in PROCEDURES if not region or item["region"] == region])


@api_view(("DELETE",))
def delete_account(request):
    user = request.user
    user.is_active = False
    user.save(update_fields=("is_active",))
    scans = list(user.scans.exclude(status=Scan.Status.DELETION_PENDING))
    for scan in scans:
        request_scan_deletion(scan)
    if not scans:
        user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


def _chat_limit(user):
    """Turns allowed this month. Free is a hard cap; paid is a soft cap against abuse."""
    return settings.CHAT_FREE_TURNS if _user_plan(user) == "free" else settings.CHAT_PAID_TURNS


def _chat_remaining(user):
    usage = ChatUsage.objects.filter(user=user, period=timezone.localdate().replace(day=1)).first()
    return max(0, _chat_limit(user) - (usage.count if usage else 0))


def _claim_chat_turn(user):
    """Reserve one turn, or None when the month's allowance is gone.

    `select_for_update` for the same reason `_claim_free_preview` uses it: two requests landing
    together would otherwise both read the old count and both spend the last turn.
    """
    period = timezone.localdate().replace(day=1)
    limit = _chat_limit(user)
    with transaction.atomic():
        usage, _ = ChatUsage.objects.select_for_update().get_or_create(user=user, period=period)
        if usage.count >= limit:
            return None
        usage.count += 1
        usage.save(update_fields=("count",))
        return limit - usage.count


def _refund_chat_turn(user):
    """Give the turn back when the model never answered — nobody pays for a 502."""
    ChatUsage.objects.filter(user=user, period=timezone.localdate().replace(day=1), count__gt=0).update(count=F("count") - 1)


class ChatViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin):
    """DOODEE Chat.

    A turn is `POST /chat/` with `{message, conversation_id?, scan_id?}`; the reply comes back
    on the same response because gunicorn's sync workers cannot stream (compose.yaml:43).
    """

    def get_queryset(self):
        return ChatConversation.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        return ChatConversationDetailSerializer if self.action == "retrieve" else ChatConversationSerializer

    def _scan_for(self, request, scan_id):
        """The scan whose numbers back this conversation, or None.

        Restricted to the caller's own completed scans — a scan_id from the request body is
        untrusted input, and nothing else in this method would stop it naming someone else's.
        """
        scans = Scan.objects.filter(user=request.user, status=Scan.Status.COMPLETED, age_band=Scan.AgeBand.ADULT)
        if scan_id:
            scan = scans.filter(id=scan_id).first()
            if not scan:
                raise NotFound("Scan not found")
            return scan
        return scans.order_by("-created_at").first()

    def create(self, request):
        if not chat_enabled():
            return Response({"detail": "chat_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        question = str(request.data.get("message", "")).strip()[:MAX_QUESTION_CHARS]
        if not question:
            raise ValidationError({"message": "message_required"})

        conversation_id = request.data.get("conversation_id")
        if conversation_id:
            conversation = self.get_queryset().filter(id=conversation_id).first()
            if not conversation:
                raise NotFound("Conversation not found")
        else:
            conversation = None

        scan = conversation.scan if conversation else self._scan_for(request, request.data.get("scan_id"))

        remaining = _claim_chat_turn(request.user)
        if remaining is None:
            return Response(
                {"detail": "chat_quota_exhausted", "chat_remaining": 0, "plan": _user_plan(request.user)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # History is read before the new question is stored, so the question is appended once.
        history = []
        if conversation:
            for message in conversation.messages.all()[max(0, conversation.messages.count() - HISTORY_TURNS * 2):]:
                history.append({"role": message.role, "content": message.content})
        history.append({"role": "user", "content": question})

        try:
            answer, usage = chat_reply(scan_context(scan), history)
        except ChatUnavailable as exc:
            # The turn was reserved before the call; an upstream failure must not spend it.
            _refund_chat_turn(request.user)
            return Response(
                {"detail": "chat_upstream_error", "reason": str(exc)[:200]},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Written only after a successful reply, so a failed turn leaves no half-conversation.
        with transaction.atomic():
            if conversation is None:
                conversation = ChatConversation.objects.create(user=request.user, scan=scan, title=title_for(question))
            ChatMessage.objects.create(conversation=conversation, role=ChatMessage.Role.USER, content=question)
            message = ChatMessage.objects.create(
                conversation=conversation, role=ChatMessage.Role.ASSISTANT, content=answer, **usage
            )
            conversation.save(update_fields=("updated_at",))

        return Response({
            "conversation_id": str(conversation.id),
            "title": conversation.title,
            "scan_id": str(scan.id) if scan else None,
            "message": ChatMessageSerializer(message).data,
            "chat_remaining": remaining,
        }, status=status.HTTP_201_CREATED)


COUPON_FAILURE_LIMIT = 20


@api_view(("GET",))
def plans(request):
    """The price list. One source of truth, read by the pricing panel.

    Inactive plans are hidden rather than marked, so switching a tier off removes it from sale
    everywhere at once instead of in each client that remembers to check a flag.
    """
    return Response(PlanSerializer(Plan.objects.filter(is_active=True), many=True).data)


def _plan_or_400(code):
    plan = Plan.objects.filter(code=str(code or "").strip(), is_active=True).first()
    if not plan:
        raise ValidationError({"plan": "unknown_plan"})
    return plan


def _guard_coupon_guessing(user):
    """Rate-limits wrong codes only, exactly as `redeem` does.

    Without it the validate endpoint is a free oracle for brute-forcing discount codes, since
    it is unauthenticated-cheap and answers instantly. Only failures count, so nobody typing
    a coupon they actually hold is ever locked out.
    """
    key = f"coupon-fail:{user.id}:{timezone.now():%Y%m%d%H}"
    if (cache.get(key) or 0) >= COUPON_FAILURE_LIMIT:
        return False
    return key


@api_view(("POST",))
def validate_coupon_view(request):
    """The price after a coupon, without consuming anything.

    Nothing is reserved here on purpose: holding a limited coupon because someone typed it into
    a box would let one user sit on the last use indefinitely.
    """
    plan = _plan_or_400(request.data.get("plan"))
    code = str(request.data.get("code", "")).strip()
    if not code:
        raise ValidationError({"code": "code_required"})

    failure_key = _guard_coupon_guessing(request.user)
    if not failure_key:
        return Response({"detail": "too_many_attempts"}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    try:
        coupon = validate_coupon(code, plan, request.user)
    except CouponError as exc:
        cache.add(failure_key, 0, timeout=3700)
        cache.incr(failure_key)
        return Response({"detail": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response(quote(plan, coupon))


class OrderViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin):
    """Orders the user placed.

    There is no card form behind this yet: an Omise merchant account needs a registered
    company. `POST` therefore creates a pending order to be settled by bank transfer and
    confirmed by a superuser in admin. The entitlement it grants runs through the same
    `billing.activate()` a provider webhook will call, so nothing about the grant changes when
    a provider is added.
    """

    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).select_related("plan", "coupon")

    def create(self, request):
        plan = _plan_or_400(request.data.get("plan"))
        if not plan.self_serve:
            return Response({"detail": "plan_not_self_serve"}, status=status.HTTP_400_BAD_REQUEST)
        if plan.price_satang == 0:
            # Nothing to charge for, and an order for ฿0 would create a payment record that
            # never settles and a subscription nobody bought.
            return Response({"detail": "plan_is_free"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = create_order(request.user, plan, request.data.get("coupon"))
        except CouponError as exc:
            return Response({"detail": exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {**OrderSerializer(order).data, "payment_instructions": "manual_transfer"},
            status=status.HTTP_201_CREATED,
        )


@api_view(("POST",))
def demo_scan(request):
    """Mint a completed sample scan for the caller.

    Everything gated on "you must have a scan" — chat, the score card, the paid upsells — is
    unreachable without a camera, MediaPipe, Celery and Supabase all working. This produces the
    same `analysis_data` the real pipeline would, from the real scoring module, so the features
    downstream are exercised rather than mocked.

    Off unless DEMO_SCANS_ENABLED. On a real deployment this would let anyone manufacture a
    scan they never took, and every figure on the admin overview would count it as genuine.
    """
    if not settings.DEMO_SCANS_ENABLED:
        return Response({"detail": "demo_scans_disabled"}, status=status.HTTP_403_FORBIDDEN)
    # One at a time: the point is to unblock the dashboard, not to let a held-down button fill
    # the table. An existing demo scan is returned rather than duplicated.
    existing = Scan.objects.filter(user=request.user, is_demo=True, status=Scan.Status.COMPLETED).first()
    scan = existing or create_demo_scan(request.user)
    return Response(
        ScanSerializer(scan).data,
        status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED,
    )
