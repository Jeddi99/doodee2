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

from .models import ConsentEvent, PromoCode, PromoRedemption, Scan, Simulation, SimulationPreviewUsage
from .procedures import PROCEDURES
from .serializers import ScanSerializer, SimulationSerializer
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
