import os
import hashlib
import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import cv2
import numpy as np
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import (
    action, api_view, authentication_classes, parser_classes, permission_classes,
    throttle_classes,
)
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AIUsageLedger, ChatConversation, ChatMessage, ChatRole, ChatSetting, ChatTopic, ChatUsage, ConsentEvent,
    CouponGrant, CreditLedger, Notification, Order, PayoutAccount, Plan, PromoCode,
    PromoRedemption, PushToken, Scan, Simulation, SimulationPreviewUsage, SiteSetting,
    WithdrawalRequest,
)
from . import ai_budget, attribution, consent, payout, referral, skin_engine, skin_vision
from .authentication import identity_is_verified
from .notifications import unread_count
from .billing import CouponError, activate, create_order, quote, sync_entitlement, validate_coupon
from . import entitlement
from .entitlement import CHAT_TURNS, PREVIEWS, SAVES
from .omise import (
    OmiseError, configured as omise_configured, create_promptpay_charge,
    verify_signature as verify_omise_signature,
)
from .demo_data import create_demo_scan
from . import procedure_catalog
from .chat import (
    HISTORY_TURNS, MAX_QUESTION_CHARS, ChatUnavailable, chat_enabled, reply as chat_reply,
    scan_context, system_prompt, title_for,
)
from .chat_facts import answer as topic_answer, available_topics
from .serializers import (
    ChatConversationDetailSerializer, ChatConversationSerializer, ChatMessageSerializer,
    OrderSerializer, PlanSerializer, ScanSerializer, SimulationSerializer,
)
from .analysis_engine import PROFILE_VIEWS, SCAN_VIEW_MODES, DEFAULT_SCAN_MODE, scan_views_for_mode
from .reference_scoring import REFERENCE_POPULATIONS
from .percentile import score_card as build_score_card
from .development_plan import build as build_development_plan
from .simulation_engine import (
    has_profile_images, related_union, simulate, simulation_columns, source_for_scan, validate_selections,
)
from .storage import delete_image, download_image, signed_upload_url, signed_url, upload_image
from .tasks import cleanup_scan, process_scan, process_simulation, request_scan_deletion


logger = logging.getLogger(__name__)

SCAN_VIEWS = SCAN_VIEW_MODES["full"]
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
HEAVY_QUEUE_MAX = int(os.getenv("HEAVY_QUEUE_MAX", "100"))
HEAVY_QUEUE_MAX_AGE_SECONDS = int(os.getenv("HEAVY_QUEUE_MAX_AGE_SECONDS", "600"))
# Roughly one arrival per browser per day is the honest rate; a hundred a minute from one
# address is not a marketing channel. Generous enough for an office behind one NAT.
VISIT_RATE_PER_MINUTE = 30


@api_view(("POST",))
@authentication_classes(())
@permission_classes((AllowAny,))
@parser_classes((JSONParser,))
# Exempt from the global throttles on purpose. DRF answers 429, and the docstring below explains
# why this endpoint must answer 204 even when it is dropping the write: a beacon that learns it
# was throttled is a beacon that retries. Its own limiter is three lines further down.
@throttle_classes(())
def visit(request):
    """Count one arrival. Unauthenticated by design — the point is the people with no account.

    No authentication class at all, which matters more than it looks. With FirebaseAuthentication
    attached, two things break. An expired token — and they last an hour, while a tab stays open
    for days — raises AuthenticationFailed and the beacon 401s, silently losing the visit. Worse,
    `api.js` signs the browser in anonymously when nobody is logged in, and a *valid* anonymous
    token falls into `FirebaseAuthentication`'s create_user branch: every visitor would be issued
    a real Django account, and those accounts pass `real_users()`, so the visitor counter would
    inflate the signup figure this page exists to measure.

    Always 204, including when rate-limited: a client that learns it was throttled is a client
    that retries, and there is nothing here worth telling anyone about.
    """
    ip_hash = referral.hash_ip(referral.client_ip(request))
    if ip_hash:
        key = f"visit-rate:{ip_hash}:{timezone.now():%Y%m%d%H%M}"
        try:
            # add() first because incr() raises when the key is missing, and the window is a
            # whole minute of wall clock rather than a sliding one — cheap, and precise enough
            # for something whose only job is to stop a script hammering the table.
            cache.add(key, 0, timeout=60)
            if cache.incr(key) > VISIT_RATE_PER_MINUTE:
                return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception:  # noqa: BLE001 - a cache outage must not stop the counting
            pass
    attribution.record_visit(request.data)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(("POST",))
def attribution_view(request):
    """First-touch source for the account that just signed in. Written once, never updated.

    Separate from `visit` above because that one must not have a `request.user` — see its
    docstring. This one is authenticated by the project defaults, and the browser sends the same
    tags it sent then, having held them in sessionStorage across the sign-in.
    """
    attribution.attach_attribution(request.user, request.data)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(("GET",))
def session(request):
    sync_entitlement(request.user)
    plan = _user_plan(request.user)
    # The row that decides every allowance below. Fetched once and passed down rather than
    # resolved per field, so a session response can never describe two different plans.
    tier = entitlement.current_plan(request.user)
    return Response({
        "id": request.user.id, "email": request.user.email, "plan": plan,
        # What the plan is called on the price list, so the client can say "อัปเกรดเป็นโปร"
        # without keeping its own copy of the tier names.
        "plan_name_th": tier.name_th, "plan_name_en": tier.name_en,
        # Lets the client say the feature is off before a button is pressed, instead of
        # letting every request come back 503.
        "simulation_enabled": settings.SIMULATION_ENABLED,
        "redeem_enabled": settings.REDEEM_CODES_ENABLED,
        "simulation_locked": _simulation_locked(request.user, tier),
        # Decided here rather than from `plan` on the client, so the entitlement rule lives in
        # one place — the same reason simulation_locked is a server field. Redacted rather than
        # locked: a free account now sees the overall score and a couple of metrics, and the
        # withholding happens in `percentile.score_card`, not in the client's CSS.
        "score_card_redacted": tier.analysis_depth == Plan.AnalysisDepth.PARTIAL,
        "development_plan_enabled": tier.has_development_plan,
        "chat_enabled": chat_enabled(),
        # Who the measurements actually go to. The privacy line under the composer names this
        # recipient, and naming the wrong one is a false statement about where a user's data
        # went — so it is read from the live setting, never hardcoded in the client.
        "chat_provider": _chat_provider_label(),
        # Whether this user has a *current* consent to send their photograph, and who would
        # receive it. Both are server-decided for the same reason `chat_provider` is: a screen
        # that names the wrong recipient, or shows the toggle on when the consent was
        # withdrawn, is a false statement about where a user's face went.
        "skin_vision_enabled": skin_vision.configured(),
        "skin_vision_consented": consent.granted(request.user, ConsentEvent.Purpose.SKIN_VISION),
        "skin_vision_provider": skin_vision.provider_label(),
        "skin_vision_consent_version": skin_vision.SKIN_VISION_CONSENT_VERSION,
        "demo_scans_enabled": settings.DEMO_SCANS_ENABLED,
        # Same reasoning as preview_remaining: the client shows the counter and the upgrade
        # prompt, but the number it shows is the one the server will actually enforce.
        # null means the plan has no ceiling — never a large number, because a sentinel that
        # reaches a UI as an integer is how a plan sold as unlimited ends up showing a countdown.
        "chat_remaining": entitlement.remaining(request.user, CHAT_TURNS, tier),
        "vip_expires_at": _vip_expires_at(request.user),
        "preview_remaining": entitlement.remaining(request.user, PREVIEWS, tier),
        "saved_remaining": entitlement.remaining(request.user, SAVES, tier),
        "referral_enabled": SiteSetting.current().referral_enabled,
        # Credit is money the user already holds, so it belongs on the same payload the header
        # reads rather than behind a second request the checkout page has to remember to make.
        "credit_balance_satang": referral.credit_balance(request.user),
        "unread_notifications": unread_count(request.user),
    })


@api_view(["POST"])
def skin_vision_consent(request):
    """Turn sending the photograph on or off.

    A POST either way, rather than a DELETE for withdrawal, because both write a row: the log is
    append-only and a withdrawal is an event worth keeping, not the absence of one. The client
    sends the version string it displayed, so the record says which wording was agreed to and a
    later change of terms cannot be back-dated onto this decision.
    """
    accepted = bool(request.data.get("accepted"))
    version = str(request.data.get("policy_version") or "").strip()
    if accepted and version != skin_vision.SKIN_VISION_CONSENT_VERSION:
        # Agreeing to wording we are no longer showing is not agreement. Withdrawal is exempt:
        # a user must always be able to switch this off, whatever version they signed.
        raise ValidationError({"detail": "stale_consent_version"})

    consent.record(
        request.user, ConsentEvent.Purpose.SKIN_VISION,
        version or skin_vision.SKIN_VISION_CONSENT_VERSION, accepted=accepted,
    )
    return Response({"skin_vision_consented": accepted})


def _chat_provider_label(config=None):
    """A human name for whoever receives a typed question.

    Derived from the configured base URL rather than a stored label: the two could drift, and
    the one the user is shown has to be the one that actually gets their measurements. An
    unrecognised host is reported as its own hostname — vague is acceptable here, wrong is not.
    """
    from urllib.parse import urlparse

    config = config or ChatSetting.current()
    if config.provider == ChatSetting.Provider.GEMINI:
        return "Google Gemini"
    if config.provider != ChatSetting.Provider.OPENAI:
        return "Anthropic"
    host = (urlparse(config.base_url).hostname or "").lower()
    for fragment, name in (("groq", "Groq"), ("openrouter", "OpenRouter"), ("openai.com", "OpenAI")):
        if fragment in host:
            return name
    if host in ("localhost", "127.0.0.1", "host.docker.internal"):
        # Ollama and friends: nothing leaves the machine, and saying otherwise would be worse
        # than saying nothing.
        return ""
    return host or "ผู้ให้บริการโมเดลภายนอก"


def _preview_remaining(user, plan=None):
    return entitlement.remaining(user, PREVIEWS, plan)


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


def _simulation_locked(user, plan=None):
    """Whether this user's plan grants no simulations at all.

    A plan-level zero, not a spent monthly allowance: someone on Plus who has used all twenty
    previews this month is rate-limited (429), not locked (403), and the client says something
    different for each. Enforced on the server rather than by hiding the button, or anyone
    calling the API directly would walk straight past it.
    """
    return entitlement.quota(user, PREVIEWS, plan) == 0


def _vip_expires_at(user):
    """When the current promo entitlement runs out, or None.

    Read at request time rather than expired by a scheduled job: a job that fails to run would
    leave paid entitlement switched on indefinitely.
    """
    latest = PromoRedemption.objects.filter(user=user, expires_at__gt=timezone.now()).order_by("-expires_at").first()
    return latest.expires_at if latest else None


def _user_plan(user):
    """The plan label. Kept as a function here because roughly a dozen call sites read it.

    The group ladder this used to be moved to `entitlement.plan_code`, which also honours
    subscriptions and the grace window. The vocabulary it answers with is unchanged.
    """
    return entitlement.plan_code(user)


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


def _record_chat_consent(user, version):
    """Recorded once per user per policy version, before the first question is sent.

    Only the free-text path calls this. Topic answers are computed here from numbers already
    in the database and reach no third party, so asking for consent to forward data would be
    describing something that does not happen.
    """
    if not ConsentEvent.objects.filter(user=user, purpose=ConsentEvent.Purpose.CHAT, policy_version=version, accepted=True).exists():
        ConsentEvent.objects.create(user=user, purpose=ConsentEvent.Purpose.CHAT, policy_version=version)


def _claim_preview(user, limit):
    """Reserve one preview. Returns `(claimed, remaining)`.

    A tuple rather than a bare number because `remaining` has two legitimate reasons to be None —
    an uncapped plan, and an exhausted one — and a caller that cannot tell those apart either
    refuses an unlimited subscriber or hands out a free preview past the cap.

    `limit` is the plan's ceiling; None means uncapped, which still increments the counter. The
    admin's abuse view is the reason to keep counting something uncapped: a row that stops being
    written is a row that stops being evidence.

    `select_for_update` for the same reason `_claim_chat_turn` uses it: two requests landing
    together would otherwise both read the old count and both spend the last preview.
    """
    period = timezone.localdate().replace(day=1)
    with transaction.atomic():
        usage, _ = SimulationPreviewUsage.objects.select_for_update().get_or_create(user=user, period=period)
        if limit is not None and usage.count >= limit:
            return False, 0
        usage.count += 1
        usage.save(update_fields=("count",))
        return True, None if limit is None else limit - usage.count


def _restore_preview(user):
    """Give the preview back when nothing was rendered — nobody pays for a 503."""
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


def _validate_image_bytes(data, name="image"):
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValidationError({name: "Each image must be between 1 byte and 10 MB"})
    if cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) is None:
        raise ValidationError({name: "Image could not be decoded"})


def _heavy_queue_available():
    queued_scans = Scan.objects.filter(status=Scan.Status.QUEUED)
    queued_simulations = Simulation.objects.filter(status=Simulation.Status.QUEUED)
    if queued_scans.count() + queued_simulations.count() >= HEAVY_QUEUE_MAX:
        return False
    oldest = min(
        (value for value in (
            queued_scans.order_by("created_at").values_list("created_at", flat=True).first(),
            queued_simulations.order_by("created_at").values_list("created_at", flat=True).first(),
        ) if value),
        default=None,
    )
    return oldest is None or (timezone.now() - oldest).total_seconds() < HEAVY_QUEUE_MAX_AGE_SECONDS


def _queue_busy_response():
    return Response(
        {"detail": "heavy_queue_busy", "retry_after": 60},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
        headers={"Retry-After": "60"},
    )


def _scan_fields(data):
    age_band = data.get("age_band")
    if age_band not in Scan.AgeBand.values:
        raise ValidationError({"age_band": "Must be adult or minor"})
    reference_age_band = str(data.get("reference_age_band", "")).strip()
    reference_profile = str(data.get("reference_profile", "")).strip()
    if age_band == Scan.AgeBand.ADULT:
        if reference_age_band not in ("18_35", "36_plus"):
            raise ValidationError({"reference_age_band": "Must be 18_35 or 36_plus for adults"})
        if reference_profile not in ("neutral", "masculine", "feminine"):
            raise ValidationError({"reference_profile": "Must be neutral, masculine, or feminine"})
    else:
        reference_age_band, reference_profile = "under_18", "neutral"
    reference_population = str(data.get("reference_population", "TH")).strip().upper() or "TH"
    if reference_population not in REFERENCE_POPULATIONS:
        raise ValidationError({"reference_population": f"Must be one of {', '.join(REFERENCE_POPULATIONS)}"})
    consent_version = str(data.get("analysis_consent_version", "")).strip()
    if not consent_version:
        raise ValidationError({"analysis_consent_version": "Consent is required"})
    scan_mode = str(data.get("scan_mode", DEFAULT_SCAN_MODE)).strip().lower() or DEFAULT_SCAN_MODE
    if scan_mode not in SCAN_VIEW_MODES:
        raise ValidationError({"scan_mode": f"Must be one of {', '.join(SCAN_VIEW_MODES)}"})
    capture_method = str(data.get("capture_method", "")).strip().lower()
    if capture_method and capture_method not in Scan.CaptureMethod.values:
        raise ValidationError({"capture_method": f"Must be one of {', '.join(Scan.CaptureMethod.values)}"})
    # A photograph picked from a folder may be of anybody, and nothing downstream can tell: the
    # engine measures light, blur and head angle, all of which a picture of somebody else passes.
    # So the client has to say whose face it is, and it has to say so here rather than only in a
    # checkbox — a confirmation the server never sees is a decoration the client can skip.
    attestation_version = str(data.get("upload_attestation_version", "")).strip()
    if capture_method == Scan.CaptureMethod.UPLOAD and not attestation_version:
        raise ValidationError(
            {"upload_attestation_version": "Required when any image was uploaded rather than captured"},
        )
    return {
        "age_band": age_band, "reference_age_band": reference_age_band,
        "reference_profile": reference_profile, "reference_population": reference_population,
        "scan_mode": scan_mode, "capture_method": capture_method,
        "expires_at": timezone.now() + timedelta(hours=24 if age_band == Scan.AgeBand.MINOR else 30 * 24),
    }, consent_version, tuple(scan_views_for_mode(scan_mode)), attestation_version


def _record_scan_consents(user, age_band, consent_version, capture_method="", attestation_version=""):
    """Write the consent rows one scan implies.

    `consent.record` rather than `ConsentEvent.objects.create`: the two calls below predate
    `consent.py` and there is no reason to keep adding to that split.
    """
    consent.record(user, ConsentEvent.Purpose.ANALYSIS, consent_version)
    if age_band == Scan.AgeBand.ADULT:
        consent.record(user, ConsentEvent.Purpose.STORAGE, consent_version)
    # Only for a scan that actually carries an uploaded photograph. Recording it for a camera scan
    # would put a claim in the log that nobody was ever asked to make.
    if capture_method == Scan.CaptureMethod.UPLOAD and attestation_version:
        consent.record(user, ConsentEvent.Purpose.PHOTO_OWNER, attestation_version)


def _redact_skin_signals(skin, redacted):
    """The signals this plan pays for.

    Ordered by confidence rather than by value. "Show the strongest reading" would put the user's
    most unusual result first, which is a ranking this feature does not make — the two kept are
    the two the engine is most sure of, which is a statement about the measurement.

    Shared by `/skin/` and `/skin-trend/` so a plan change cannot be honoured on one and not the
    other; a locked feature that answers in full on a second route is not locked.
    """
    signals = dict(skin.get("signals") or {})
    if not redacted:
        return signals
    confidence = skin.get("confidence") or {}
    keep = sorted(signals, key=lambda key: -confidence.get(key, 0))[:2]
    return {key: value for key, value in signals.items() if key in keep}


class ScanViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin):
    serializer_class = ScanSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    # Per action, not a class attribute: a viewset is a single view as far as ScopedRateThrottle
    # is concerned, so `throttle_scope = "scan_create"` on the class would also put the polled
    # `status` endpoint under 6/hour and freeze the analysis screen.
    THROTTLE_SCOPES = {"create": "scan_create", "uploads": "scan_create"}

    def get_throttles(self):
        self.throttle_scope = self.THROTTLE_SCOPES.get(self.action)
        return super().get_throttles()

    def get_queryset(self):
        return Scan.objects.filter(user=self.request.user).exclude(status=Scan.Status.DELETION_PENDING)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset().filter(age_band=Scan.AgeBand.ADULT)
        return Response(self.get_serializer(queryset, many=True).data)

    def create(self, request):
        if not _heavy_queue_available():
            return _queue_busy_response()
        fields, consent_version, required_views, attestation_version = _scan_fields(request.data)
        missing = [view for view in required_views if view not in request.FILES]
        if missing:
            raise ValidationError({"missing_views": missing})
        payloads = {view: _read_image(request.FILES[view]) for view in required_views}
        digest = hashlib.sha256()
        for view in required_views:
            digest.update(view.encode())
            digest.update(payloads[view])
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()[:128] or f"legacy:{digest.hexdigest()}"
        existing = Scan.objects.filter(user=request.user, idempotency_key=idempotency_key).first()
        if existing:
            return Response(self.get_serializer(existing).data, status=status.HTTP_202_ACCEPTED)
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
            # Logged, not just returned. The client is told only that storage is unavailable --
            # correct, since the cause is never the user's to act on -- but that left the actual
            # reason nowhere at all. A dead Supabase project and an expired key produce the same
            # silent 503, and telling them apart meant reproducing the call by hand.
            logger.exception("scan image upload failed", exc_info=upload_error)
            for object_name in uploaded.values():
                try:
                    delete_image(object_name)
                except Exception:
                    logger.exception("could not delete %s while unwinding a failed upload", object_name)
            return Response({"detail": "Image storage is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            with transaction.atomic():
                scan = Scan.objects.create(
                    user=request.user,
                    **fields,
                    idempotency_key=idempotency_key,
                    image_objects=uploaded,
                )
                _record_scan_consents(
                    request.user, fields["age_band"], consent_version,
                    fields["capture_method"], attestation_version,
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
            # The database row is the recovery source of truth; reconciliation will enqueue it.
            pass
        return Response(self.get_serializer(scan).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=("post",), url_path="uploads")
    def uploads(self, request):
        """Reserve a scan and return per-object upload grants for private Supabase Storage."""
        if not _heavy_queue_available():
            return _queue_busy_response()
        key = request.headers.get("Idempotency-Key", "").strip()[:128]
        if not key:
            raise ValidationError({"detail": "Idempotency-Key header is required"})
        fields, consent_version, required_views, attestation_version = _scan_fields(request.data)
        file_types = request.data.get("files") or {}
        if set(file_types) != set(required_views):
            raise ValidationError({"files": f"Exactly these views are required: {', '.join(required_views)}"})
        if any(content_type not in ALLOWED_TYPES for content_type in file_types.values()):
            raise ValidationError({"files": "Only JPEG, PNG, and WebP images are accepted"})
        existing = Scan.objects.filter(user=request.user, idempotency_key=key).first()
        if existing and existing.status != Scan.Status.UPLOADING:
            return Response(self.get_serializer(existing).data, status=status.HTTP_202_ACCEPTED)
        if existing:
            scan = existing
        else:
            token = os.urandom(16).hex()
            objects = {view: f"users/{request.user.id}/scans/{token}/{view}" for view in required_views}
            with transaction.atomic():
                scan = Scan.objects.create(
                    user=request.user, status=Scan.Status.UPLOADING, idempotency_key=key,
                    image_objects=objects, **fields,
                )
                _record_scan_consents(
                    request.user, fields["age_band"], consent_version,
                    fields["capture_method"], attestation_version,
                )
        try:
            uploads = {
                view: {"object_name": object_name, "url": signed_upload_url(object_name), "content_type": file_types[view]}
                for view, object_name in scan.image_objects.items()
            }
        except Exception:
            # See the note above: the reason has to land somewhere the operator can read it.
            logger.exception("could not sign upload URLs for scan %s", scan.id)
            return Response({"detail": "Image storage is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"id": str(scan.id), "status": scan.status, "uploads": uploads}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=("post",))
    def commit(self, request, pk=None):
        scan = self.get_object()
        if scan.status != Scan.Status.UPLOADING:
            return Response(self.get_serializer(scan).data, status=status.HTTP_202_ACCEPTED)
        if not _heavy_queue_available():
            return _queue_busy_response()
        try:
            for view, object_name in scan.image_objects.items():
                _validate_image_bytes(download_image(object_name, max_bytes=MAX_IMAGE_BYTES), view)
        except ValidationError:
            raise
        except Exception:
            return Response({"detail": "upload_incomplete"}, status=status.HTTP_409_CONFLICT)
        scan.status = Scan.Status.QUEUED
        scan.save(update_fields=("status", "updated_at"))
        try:
            process_scan.delay(str(scan.id))
        except Exception:
            pass
        return Response(self.get_serializer(scan).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=("get",))
    def status(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=False, methods=("get",), url_path="skin-trend")
    def skin_trend(self, request):
        """One user's skin readings over time, split into runs that may honestly be joined.

        `skin_engine.comparison_break` is the whole design of this endpoint. Skin signals are
        stable against light *within* one photograph and not at all across photographs taken in
        different rooms, so a single line through every scan would draw the rooms as a change in
        the user's skin — the failure that module exists to prevent, reintroduced by the chart
        rather than by the measurement.

        So the server does the splitting, not the client. Two reasons: the rule is one definition
        and a TypeScript copy of it would drift, and the reason a run ended ("we changed how this
        is measured" versus "the light was too different") is a sentence the screen has to say,
        which means it has to be computed where the comparison happens.

        Demo scans are excluded outright. Their `skin_analysis` is a hand-written fixture, and a
        fabricated point plotted beside real ones is the same lie in a different costume.
        """
        limit = min(int(request.query_params.get("limit") or 20), 50)
        scans = (
            self.get_queryset()
            .filter(status=Scan.Status.COMPLETED, age_band=Scan.AgeBand.ADULT, is_demo=False)
            .order_by("-created_at")[:limit]
        )
        redacted = entitlement.current_plan(request.user).analysis_depth == Plan.AnalysisDepth.PARTIAL

        # Oldest first, so a run is built in the direction a chart is read.
        readings = []
        for scan in reversed(list(scans)):
            skin = (scan.analysis_data or {}).get("skin_analysis")
            if skin:
                readings.append((scan, skin))

        series = []
        previous = None
        for scan, skin in readings:
            reason = skin_engine.comparison_break(previous, skin) if previous else None
            if previous is None or reason:
                series.append({
                    "engine_version": skin.get("engine_version"),
                    # Why this run could not continue the one before it. None on the first run,
                    # because nothing preceded it — an absent reason and "different lighting" are
                    # different facts and the client draws them differently.
                    "break_reason": reason,
                    "points": [],
                })
            series[-1]["points"].append({
                "scan_id": str(scan.id),
                "captured_at": scan.created_at,
                "scan_mode": scan.scan_mode,
                "readable": bool(skin.get("readable")),
                # An unreadable scan keeps its place in history and its explanation, but carries
                # no values — there is nothing to plot and a zero would be read as a measurement.
                "signals": _redact_skin_signals(skin, redacted) if skin.get("readable") else {},
                "advisories": skin.get("advisories") or [],
            })
            # Compared against the previous *reading*, not the previous run: two scans in a row
            # that are each unreadable should each break, rather than the second silently joining
            # the first.
            previous = skin

        return Response({
            "series": series,
            "confidence": dict(skin_engine.SIGNAL_CONFIDENCE),
            "redacted": redacted,
            "engine_version": skin_engine.ENGINE_VERSION,
        })

    @action(detail=True, methods=("get",), url_path="skin")
    def skin(self, request, pk=None):
        """Skin observations for one scan, at the depth this user's plan pays for.

        Redaction follows `score_card`: a free plan gets a 200 carrying the two strongest
        signals rather than a 403, because a wall shows nothing and sells nothing. The
        withholding happens here, before the response is built, so the locked readings never
        reach the client — a locked feature that still answers in full over HTTP is not locked.

        Everything on this route is computed locally. The model-written description, which is
        the only part that involved sending a photograph anywhere, is served only to a user who
        currently consents; a withdrawal hides it again on the next request without deleting
        the scan.
        """
        scan = self.get_object()
        skin = (scan.analysis_data or {}).get("skin_analysis")
        if not skin:
            return Response(
                {"detail": "skin_analysis_unavailable", "scan_status": scan.status},
                status=status.HTTP_409_CONFLICT,
            )

        tier = entitlement.current_plan(request.user)
        redacted = tier.analysis_depth == Plan.AnalysisDepth.PARTIAL
        signals = _redact_skin_signals(skin, redacted)

        consented = consent.granted(request.user, ConsentEvent.Purpose.SKIN_VISION)
        vision = (scan.analysis_data or {}).get("skin_vision") if consented else None
        # Consent is often given after the scan that would have used it. Rather than a nightly
        # job that back-fills everybody's history — unbounded spend nobody asked for — the
        # description is generated the first time a consenting user opens the scan, and only
        # while the photograph still exists. Once the 30-day purge has emptied `image_objects`
        # there is nothing left to send, so `vision_pending` is false forever and the screen
        # says so instead of spinning.
        vision_pending = False
        if consented and vision is None:
            from .tasks import queue_skin_vision

            vision_pending = queue_skin_vision(scan)
        return Response({
            "scan_id": str(scan.id),
            "captured_at": scan.created_at,
            "engine_version": skin.get("engine_version"),
            "basis": skin.get("basis"),
            "signals": signals,
            "confidence": skin.get("confidence") or {},
            "capture": skin.get("capture") or {},
            "advisories": skin.get("advisories") or [],
            "readable": skin.get("readable", False),
            "redacted": redacted,
            "is_demo": bool(skin.get("is_demo")),
            "vision": vision,
            "vision_consented": consented,
            "vision_pending": vision_pending,
        })

    @action(detail=True, methods=("get",), url_path="score-card")
    def score_card(self, request, pk=None):
        """The similarity card for one scan, at the depth this user's plan pays for.

        This used to answer 403 to every free account. requirement.md asks the free tier to show
        the analysis "แต่บอกแค่ส่วนน้อย" — a wall shows nothing and sells nothing, so a partial
        plan now gets a 200 carrying the overall score and its two strongest categories.

        The withholding is done by `percentile.redact` before the response is built, so the
        locked figures never reach the client at all. Gating on the server rather than by hiding
        the route: a locked feature that still answers in full over HTTP is not locked.
        """
        tier = entitlement.current_plan(request.user)
        scan = self.get_object()
        card = build_score_card(
            scan.analysis_data,
            redacted=tier.analysis_depth == Plan.AnalysisDepth.PARTIAL,
        )
        if card is None:
            return Response(
                {"detail": "score_card_unavailable", "scan_status": scan.status},
                status=status.HTTP_409_CONFLICT,
            )
        # Two photos, the shape the card was designed around. Signed on request and short
        # lived, and both may be None once the 30-day purge has run — the card is built from
        # `analysis_data`, which outlives the photographs, so it still renders without them.
        serializer = ScanSerializer(scan)
        return Response({
            **card,
            "scan_id": str(scan.id),
            "front_url": serializer.data.get("front_url"),
            "side_url": serializer.side_url(scan),
            "images_expired": serializer.data.get("images_expired"),
        })

    @action(detail=True, methods=("get",), url_path="development-plan")
    def development_plan(self, request, pk=None):
        """แผนพัฒนาตนเอง for one scan. Plus and Pro only.

        403 rather than a redacted version, unlike the score card: there is no honest partial
        form of a plan. Half a suggestion is not a teaser, it is advice with the reason removed.
        """
        tier = entitlement.current_plan(request.user)
        if not tier.has_development_plan:
            return Response(
                {"detail": "development_plan_requires_entitlement"},
                status=status.HTTP_403_FORBIDDEN,
            )
        scan = self.get_object()
        lang = "en" if request.query_params.get("lang") == "en" else "th"
        plan = build_development_plan(scan.analysis_data, lang)
        if plan is None:
            return Response(
                {"detail": "development_plan_unavailable", "scan_status": scan.status},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({**plan, "scan_id": str(scan.id)})

    def destroy(self, request, pk=None):
        request_scan_deletion(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)


class SimulationViewSet(viewsets.GenericViewSet, mixins.RetrieveModelMixin):
    serializer_class = SimulationSerializer

    # `preview` renders a full MediaPipe + OpenCV warp inside the web process; `create` only
    # enqueues. The polled `status` action must stay unscoped for the reason ScanViewSet gives.
    THROTTLE_SCOPES = {"preview": "preview", "create": "preview"}

    def get_throttles(self):
        self.throttle_scope = self.THROTTLE_SCOPES.get(self.action)
        return super().get_throttles()

    def get_queryset(self):
        return Simulation.objects.filter(scan__user=self.request.user).exclude(status=Simulation.Status.DELETION_PENDING)

    def create(self, request):
        if not settings.SIMULATION_ENABLED:
            return Response({"detail": "Simulation is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if _simulation_locked(request.user):
            return Response({"detail": "simulation_requires_entitlement"}, status=status.HTTP_403_FORBIDDEN)
        if not _heavy_queue_available():
            return _queue_busy_response()
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
        key = request.headers.get("Idempotency-Key", "").strip()[:128]
        if not key:
            raise ValidationError({"detail": "Idempotency-Key header is required"})
        existing = Simulation.objects.filter(scan=scan, idempotency_key=key).first()
        if existing:
            return Response(self.get_serializer(existing).data, status=status.HTTP_202_ACCEPTED)
        if not entitlement.allows(request.user, SAVES):
            return Response(
                {"detail": "monthly_save_quota_reached",
                 "saved_remaining": 0, "plan": _user_plan(request.user)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        simulation = Simulation.objects.create(
            scan=scan,
            idempotency_key=key,
            selections=selections,
            # The first item is mirrored into the old single-value columns so existing readers
            # — the serializer's `preset`, the admin, saved rows from before stacking — still work.
            **simulation_columns(selections, presets),
            model_version="local-mediapipe-opencv-1",
            related_procedures=related_union(presets),
            expires_at=now + timedelta(days=30),
        )
        _record_simulation_consent(request.user, consent_version)
        try:
            process_simulation.delay(str(simulation.id))
        except Exception:
            pass
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
        selections, presets, targets = _resolve_stack(scan, request.data)
        preset, target = presets[0], targets[0]
        cohort = _cohort_labels(scan)
        # Answered before any quota is claimed: an invisible warp should not cost a preview.
        if target and target["already_near_reference"]:
            return Response({"preset": preset, "presets": presets, "already_near_reference": True, "after_data_url": None,
                             "measurements": [target], "related_procedures": [], **cohort,
                             "entitlement": {"plan": _user_plan(request.user), "preview_remaining": _preview_remaining(request.user)}})

        plan = _user_plan(request.user)
        tier = entitlement.current_plan(request.user)
        if not _heavy_queue_available():
            return _queue_busy_response()
        key = request.headers.get("Idempotency-Key", "").strip()[:128]
        if not key:
            raise ValidationError({"detail": "Idempotency-Key header is required"})
        existing = Simulation.objects.filter(scan=scan, idempotency_key=key).first()
        if existing:
            return Response(self.get_serializer(existing).data, status=status.HTTP_202_ACCEPTED)
        hourly_key = f"simulation-preview-hour:{request.user.id}:{timezone.now():%Y%m%d%H}"
        cache.add(hourly_key, 0, timeout=3700)
        if cache.incr(hourly_key) > SiteSetting.current().preview_hourly_ceiling:
            return Response({"detail": "preview_rate_limited"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        claimed, remaining = _claim_preview(request.user, entitlement.quota(request.user, PREVIEWS, tier))
        if not claimed:
            return Response(
                {"detail": "monthly_preview_quota_reached", "preview_remaining": 0, "plan": plan},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        # A slider can replace queued previews faster than a worker can render them. Only the
        # newest pending preview is useful; a processing one is allowed to finish safely.
        cancelled = Simulation.objects.filter(
            scan__user=request.user, kind=Simulation.Kind.PREVIEW, status=Simulation.Status.QUEUED,
        ).update(status=Simulation.Status.CANCELLED, finished_at=timezone.now())
        for _ in range(cancelled):
            _restore_preview(request.user)
        simulation = Simulation.objects.create(
            scan=scan, kind=Simulation.Kind.PREVIEW, idempotency_key=key, selections=selections,
            **simulation_columns(selections, presets),
            model_version="local-mediapipe-opencv-1", related_procedures=related_union(presets),
            expires_at=timezone.now() + timedelta(hours=1),
        )
        _record_simulation_consent(request.user, consent_version)
        try:
            process_simulation.delay(str(simulation.id))
        except Exception:
            pass
        data = self.get_serializer(simulation).data
        data["entitlement"] = {"plan": plan, "preview_remaining": remaining}
        data.update(cohort)
        return Response(data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=("get",))
    def status(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)


class ProcedureList(APIView):
    """The clinical catalog the simulator renders from.

    Serves `procedure_catalog`, not the 24-row `procedures` list this used to return. The two
    are stacked layers rather than duplicates -- the old list names geometric outcomes ("narrower
    alar base"), this one names what a clinic actually does ("alar base reduction") -- and they
    share no ids, so a client written against one gets nothing from the other. That is why the
    frontend changes in the same commit.

    Unsupported rows are hidden by default: `include_unavailable=true` returns all 92 for the
    audit against data.txt, which is the only reason the out-of-scope rows are kept at all.
    """

    def get(self, request, procedure_id=None):
        if procedure_id:
            procedure = procedure_catalog.resolve_procedure(procedure_id)
            if not procedure:
                raise NotFound("Procedure not found")
            return Response(procedure.public())
        include_unavailable = request.query_params.get("include_unavailable") == "true"
        try:
            return Response(procedure_catalog.public_catalog(
                category=request.query_params.get("category"),
                include_unavailable=include_unavailable,
            ))
        except ValueError as exc:
            raise ValidationError({"category": str(exc)}) from exc


class ProcedureCategoryList(APIView):
    """The 13 headings, in catalog order, for a client that groups the list before showing it.

    Derived from the same table rather than listed here, so a category that loses its last
    renderable row stops being offered instead of opening onto an empty panel.
    """

    def get(self, request):
        return Response([
            {"id": procedure_catalog.CATEGORY_NUMBERS[key],
             "key": key,
             "name_th": procedure_catalog.CATEGORIES[key][0],
             "name_en": procedure_catalog.CATEGORIES[key][1]}
            for key in procedure_catalog.facial_categories()
        ])


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


def _topic_overrides(lang):
    """Admin wording and order for the chips, or None to fall back to the ones in code.

    None rather than an empty list when the table is empty: a database that has not been
    seeded yet should show the built-in chips, not silently show none at all.
    """
    rows = list(ChatTopic.objects.filter(is_active=True))
    return [(row.key, row.label(lang)) for row in rows] or None


def _chat_limit(user, plan=None):
    """Turns allowed this month, or None for a plan with no ceiling.

    Read from the plan row rather than from ChatSetting's two columns (removed in 0023): those
    could express exactly two allowances between them, and the product sells three tiers.
    """
    return entitlement.quota(user, CHAT_TURNS, plan)


def _chat_rate_limited(user):
    """Whether this account has asked too many questions in the current hour.

    Separate from the monthly allowance and applied to every plan, including the ones sold with no
    monthly ceiling — those need it more rather than less, because nothing else stands between a
    stolen Pro account and `LLM_BUDGET_THB_PER_MONTH`. Checked before the turn is claimed, so
    hitting it never costs anyone an allowance they were entitled to.
    """
    key = f"chat-hour:{user.id}:{timezone.now():%Y%m%d%H}"
    cache.add(key, 0, timeout=3700)
    return cache.incr(key) > SiteSetting.current().chat_hourly_ceiling


def _chat_remaining(user, plan=None):
    return entitlement.remaining(user, CHAT_TURNS, plan)


def _claim_chat_turn(user):
    """Reserve one turn. Returns `(claimed, remaining)`, for the reason `_claim_preview` explains.

    `select_for_update` for the same reason `_claim_preview` uses it: two requests landing
    together would otherwise both read the old count and both spend the last turn.
    """
    period = timezone.localdate().replace(day=1)
    limit = _chat_limit(user)
    with transaction.atomic():
        usage, _ = ChatUsage.objects.select_for_update().get_or_create(user=user, period=period)
        if limit is not None and usage.count >= limit:
            return False, 0
        # Counted even on an uncapped plan: `analytics.heaviest_chat_users` is the alarm for a
        # stolen account, and it can only see what was written down.
        usage.count += 1
        usage.save(update_fields=("count",))
        return True, None if limit is None else limit - usage.count


def _refund_chat_turn(user):
    """Give the turn back when the model never answered — nobody pays for a 502."""
    ChatUsage.objects.filter(user=user, period=timezone.localdate().replace(day=1), count__gt=0).update(count=F("count") - 1)


# The estimate a chat turn is admitted against, before the model has said anything. 5,000 input
# tokens is the cached system block plus a short history; the output half is whatever ceiling the
# admin set. Kept here rather than in `ai_budget` because it is a fact about chat, not about
# budgeting — skin vision reserves against a completely different shape of request.
CHAT_RESERVE_INPUT_TOKENS = 5000


def _reserve_ai_budget(user, key, config):
    return ai_budget.reserve(
        user, key,
        provider=config.provider, model=config.model,
        input_tokens=CHAT_RESERVE_INPUT_TOKENS, output_tokens=config.max_tokens,
        price_in=settings.CHAT_PRICE_IN_USD_PER_MTOK,
        price_out=settings.CHAT_PRICE_OUT_USD_PER_MTOK,
    )


def _settle_ai_budget(ledger, usage):
    ai_budget.settle(
        ledger, usage,
        price_in=settings.CHAT_PRICE_IN_USD_PER_MTOK,
        price_cached_in=settings.CHAT_PRICE_CACHED_IN_USD_PER_MTOK,
        price_out=settings.CHAT_PRICE_OUT_USD_PER_MTOK,
    )


def _claim_chat_slot(user):
    user_key = f"chat-slot:user:{user.id}"
    if not cache.add(user_key, 1, timeout=60):
        return None
    global_key = "chat-slot:global"
    cache.add(global_key, 0, timeout=120)
    if cache.incr(global_key) > settings.CHAT_GLOBAL_CONCURRENCY:
        cache.decr(global_key)
        cache.delete(user_key)
        return None
    return user_key, global_key


def _release_chat_slot(slot):
    if not slot:
        return
    user_key, global_key = slot
    cache.delete(user_key)
    try:
        cache.decr(global_key)
    except ValueError:
        pass


class ChatViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin):
    """DOODEE Chat.

    A turn is `POST /chat/` with `{message, conversation_id?, scan_id?}`; the reply comes back
    on the same response because gunicorn's sync workers cannot stream (compose.yaml:43).
    """

    # Only the action that spends money. Listing and reading transcripts is free.
    THROTTLE_SCOPES = {"create": "chat"}

    def get_throttles(self):
        self.throttle_scope = self.THROTTLE_SCOPES.get(self.action)
        return super().get_throttles()

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
        # Skin scans excluded: chat answers questions about measurements, and a skin scan has
        # none — `analyze_images` returns an empty catalogue for that mode. Picking the newest
        # scan of any mode would mean a skin check-in silently emptied the chat's context.
        return scans.exclude(scan_mode=Scan.ScanMode.SKIN).order_by("-created_at").first()

    @action(detail=False, methods=("get",), url_path="facts")
    def facts(self, request):
        """The questions this user's scan can answer without a model.

        The client turns these into suggestion chips. Empty list when there is no scored scan,
        so no chip is ever offered that would answer with nothing.
        """
        scan = self._scan_for(request, request.query_params.get("scan_id"))
        lang = "en" if request.query_params.get("lang") == "en" else "th"
        return Response({
            "lang": lang,
            "scan_id": str(scan.id) if scan else None,
            # Wording, order and visibility come from the admin; which chips can actually
            # answer still comes from the scan.
            "topics": available_topics(
                scan.analysis_data if scan else None, lang, overrides=_topic_overrides(lang),
            ),
        })

    @action(detail=False, methods=("get",))
    def roles(self, request):
        """The voices offered in the chat header.

        Served from the database so the wording is the admin's, and always non-empty in
        practice because the migration seeds three — but an empty list is a valid answer and
        the client simply shows no picker.
        """
        lang = "en" if request.query_params.get("lang") == "en" else "th"
        return Response({
            "lang": lang,
            "roles": [
                {
                    "key": role.key,
                    "label": role.label(lang),
                    "description": role.description(lang),
                    "is_default": role.is_default,
                }
                for role in ChatRole.objects.filter(is_active=True)
            ],
        })

    def _answer_topic(self, request, conversation, scan, topic):
        """Answer from the stored numbers. No model, no quota, no bill.

        Stored as a normal pair of messages so the transcript is uniform and a follow-up typed
        into the box continues the same conversation.
        """
        lang = "en" if str(request.data.get("lang", "")) == "en" else "th"
        result = topic_answer(topic, scan.analysis_data if scan else None, lang)
        if result is None:
            return Response({"detail": "topic_unavailable"}, status=status.HTTP_409_CONFLICT)
        question, text = result

        with transaction.atomic():
            if conversation is None:
                conversation = ChatConversation.objects.create(user=request.user, scan=scan, title=title_for(question))
            ChatMessage.objects.create(conversation=conversation, role=ChatMessage.Role.USER, content=question)
            # Token counts stay zero: nothing was sent anywhere, and a non-zero figure here
            # would corrupt the per-turn cost the admin reads off these rows.
            message = ChatMessage.objects.create(
                conversation=conversation, role=ChatMessage.Role.ASSISTANT, content=text,
            )
            conversation.save(update_fields=("updated_at",))

        return Response({
            "conversation_id": str(conversation.id),
            "title": conversation.title,
            "scan_id": str(scan.id) if scan else None,
            "message": ChatMessageSerializer(message).data,
            "chat_remaining": _chat_remaining(request.user),
            "billed": False,
        }, status=status.HTTP_201_CREATED)

    def create(self, request):
        topic = str(request.data.get("topic", "")).strip()
        message = str(request.data.get("message", "")).strip()[:MAX_QUESTION_CHARS]
        if topic and message:
            # Refused rather than guessed at: the two could ask different things, and picking a
            # winner silently would answer a question nobody asked. Same reasoning as
            # _selections_from().
            raise ValidationError({"topic": "conflicting_question_fields"})
        if not topic and not message:
            raise ValidationError({"message": "message_required"})
        # Only free-text needs a model behind it. Topic answers are read off the scan, so they
        # must not be blocked by a missing API key — that check belongs after this fork.
        if not topic and not chat_enabled():
            return Response({"detail": "chat_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        # Demanded before the question is read, not after: a typed question is the one thing
        # here that leaves for a third party, and consent recorded afterwards is a receipt,
        # not a choice. Topic answers never reach this branch.
        chat_consent_version = str(request.data.get("chat_consent_version", "")).strip()
        if not topic and not chat_consent_version:
            raise ValidationError({"chat_consent_version": "Separate chat consent is required"})

        conversation_id = request.data.get("conversation_id")
        if conversation_id:
            conversation = self.get_queryset().filter(id=conversation_id).first()
            if not conversation:
                raise NotFound("Conversation not found")
        else:
            conversation = None

        scan = conversation.scan if conversation else self._scan_for(request, request.data.get("scan_id"))

        if topic:
            return self._answer_topic(request, conversation, scan, topic)

        question = message
        _record_chat_consent(request.user, chat_consent_version)
        if _chat_rate_limited(request.user):
            return Response(
                {"detail": "chat_rate_limited", "chat_remaining": _chat_remaining(request.user)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        claimed, remaining = _claim_chat_turn(request.user)
        if not claimed:
            return Response(
                {"detail": "chat_quota_exhausted", "chat_remaining": 0, "plan": _user_plan(request.user)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        idempotency_key = request.headers.get("Idempotency-Key", "").strip()[:128]
        if not idempotency_key:
            _refund_chat_turn(request.user)
            raise ValidationError({"detail": "Idempotency-Key header is required"})
        config = ChatSetting.current()
        ledger = _reserve_ai_budget(request.user, idempotency_key, config)
        if ledger is None:
            _refund_chat_turn(request.user)
            return Response({"detail": "monthly_ai_budget_reached"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if ledger is False:
            _refund_chat_turn(request.user)
            return Response({"detail": "request_already_processed"}, status=status.HTTP_409_CONFLICT)
        slot = _claim_chat_slot(request.user)
        if not slot:
            ledger.status = AIUsageLedger.Status.REFUNDED
            ledger.reserved_satang = 0
            ledger.settled_at = timezone.now()
            ledger.save(update_fields=("status", "reserved_satang", "settled_at"))
            _refund_chat_turn(request.user)
            return Response({"detail": "chat_busy", "retry_after": 5}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # History is read before the new question is stored, so the question is appended once.
        history = []
        if conversation:
            for message in conversation.messages.all()[max(0, conversation.messages.count() - HISTORY_TURNS * 2):]:
                history.append({"role": message.role, "content": message.content})
        history.append({"role": "user", "content": question})

        # An existing conversation keeps the voice it was opened with. Switching mid-thread would
        # change the cached system block and cost full price on every remaining turn, and a
        # thread that changes character halfway is not what anyone asked for either.
        role = ChatRole.resolve(conversation.role if conversation else request.data.get("role"))
        persona = "\n\n".join(part for part in (role.persona if role else "", config.persona) if part.strip())
        try:
            try:
                answer, usage = chat_reply(
                    f"{system_prompt(persona)}\n\n{scan_context(scan)}",
                    history,
                    model=config.model,
                    effort=config.effort,
                    max_tokens=config.max_tokens,
                    provider=config.provider,
                    base_url=config.base_url,
                )
            except ChatUnavailable as exc:
                uncertain = str(exc).startswith("unreachable:")
                ledger.status = AIUsageLedger.Status.UNCERTAIN if uncertain else AIUsageLedger.Status.REFUNDED
                if not uncertain:
                    ledger.reserved_satang = 0
                ledger.settled_at = timezone.now()
                ledger.save(update_fields=("status", "reserved_satang", "settled_at"))
                # The turn was reserved before the call; an upstream failure must not spend it.
                _refund_chat_turn(request.user)
                return Response(
                    {"detail": "chat_upstream_error", "reason": str(exc)[:200]},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
        finally:
            _release_chat_slot(slot)

        _settle_ai_budget(ledger, usage)

        # Written only after a successful reply, so a failed turn leaves no half-conversation.
        with transaction.atomic():
            if conversation is None:
                conversation = ChatConversation.objects.create(
                    user=request.user, scan=scan, title=title_for(question),
                    # Resolved, not echoed: an unknown key is stored as the voice actually used.
                    role=role.key if role else "",
                )
            ChatMessage.objects.create(conversation=conversation, role=ChatMessage.Role.USER, content=question)
            message = ChatMessage.objects.create(
                conversation=conversation, role=ChatMessage.Role.ASSISTANT, content=answer, **usage
            )
            conversation.save(update_fields=("updated_at",))

        return Response({
            "conversation_id": str(conversation.id),
            "title": conversation.title,
            "scan_id": str(scan.id) if scan else None,
            "role": conversation.role,
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


# ---------------------------------------------------------------- โปรไฟล์


# A subscription this close to its end gets flagged, so the page can say "ต่ออายุ" with urgency
# instead of printing a date and leaving the user to do the arithmetic.
EXPIRING_SOON_DAYS = 7


def _available_discounts(user, now=None):
    """Coupon grants this user holds and has not spent.

    requirement.md wants these visible on the profile with a button. They are `CouponGrant` rows
    rather than codes to type, so the client is told what the discount *is* — a code alone cannot
    be rendered as "ลด 10% ไม่เกิน ฿100" without a second lookup.
    """
    now = now or timezone.now()
    grants = CouponGrant.objects.filter(
        user=user, used_order__isnull=True, coupon__is_active=True,
    ).select_related("coupon")
    return [
        {
            "code": grant.coupon.code,
            "discount_type": grant.coupon.discount_type,
            "discount_value": grant.coupon.discount_value,
            "max_discount_satang": grant.coupon.max_discount_satang,
            "expires_at": grant.expires_at,
        }
        for grant in grants
        if grant.expires_at is None or grant.expires_at > now
    ]


@api_view(("GET",))
def profile(request):
    """Everything หน้าโปรไฟล์ draws, in one request.

    One endpoint rather than four, because the page is a single answer to "what do I have" and
    stitching identity, entitlement, benefits and receipts together on the client would mean four
    loading states for one screen.
    """
    sync_entitlement(request.user)
    now = timezone.now()
    tier = entitlement.current_plan(request.user)
    subscription = entitlement.current_subscription(request.user, now)
    # None whenever entitlement came from a group an admin granted by hand rather than a purchase.
    # That is an ordinary state, not an error, and the page renders "ไม่มีวันหมดอายุ" for it.
    expires_at = subscription.current_period_end if subscription else None
    days_left = (expires_at - now).days if expires_at else None

    return Response({
        "account": {
            "email": request.user.email,
            "joined_at": request.user.date_joined,
            # Read from the Firebase token rather than stored: it is the same check the referral
            # claim gates on, so the badge and the gate can never disagree.
            "identity_verified": identity_is_verified(getattr(request, "auth", None)),
        },
        "plan": {
            "code": _user_plan(request.user),
            "name_th": tier.name_th,
            "name_en": tier.name_en,
            "price_satang": tier.price_satang,
            "interval": tier.interval,
            "expires_at": expires_at,
            "days_left": days_left,
            "expiring_soon": days_left is not None and days_left <= EXPIRING_SOON_DAYS,
            "vip_expires_at": _vip_expires_at(request.user),
        },
        # null means unlimited, the same as everywhere else — never a large number, or a plan sold
        # as unlimited shows the user a countdown.
        "quotas": {
            "preview_remaining": entitlement.remaining(request.user, PREVIEWS, tier),
            "chat_remaining": entitlement.remaining(request.user, CHAT_TURNS, tier),
            "saved_remaining": entitlement.remaining(request.user, SAVES, tier),
        },
        "benefits": {
            "credit_satang": referral.credit_balance(request.user),
            "discounts": _available_discounts(request.user, now),
        },
        "referral": referral.stats(request.user),
        # Ten is a page, not a history. Someone who needs all of them is asking a question the
        # admin's CSV export answers better than an infinite scroll would.
        "orders": OrderSerializer(
            Order.objects.filter(user=request.user).select_related("plan", "coupon")[:10],
            many=True,
        ).data,
    })


# ---------------------------------------------------------------- ชวนเพื่อน


@api_view(("GET",))
def referral_overview(request):
    """This user's invite code, how their invitations are doing, and their credit balance."""
    if not SiteSetting.current().referral_enabled:
        return Response({"detail": "referral_disabled"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    config = SiteSetting.current()
    data = referral.stats(request.user)
    grants = CouponGrant.objects.filter(
        user=request.user, used_order__isnull=True,
    ).select_related("coupon")
    return Response({
        **data,
        # The withdrawal card reads these rather than deriving them, so the button can be
        # disabled with its reason on screen instead of failing on submit.
        "withdrawable_satang": payout.withdrawable(request.user),
        "withdrawal_min_satang": config.withdrawal_min_satang,
        "withdrawal_enabled": config.withdrawal_enabled,
        "has_payout_account": PayoutAccount.objects.filter(user=request.user).exists(),
        "has_open_withdrawal": bool(payout.open_request(request.user)),
        # The invitee's side of the deal: what they were given and have not spent yet. Shown as
        # a card rather than a code to type, because `requires_grant` means the server applies
        # it and there is nothing for the user to remember.
        "available_discounts": [
            {
                "code": grant.coupon.code,
                "discount_type": grant.coupon.discount_type,
                "discount_value": grant.coupon.discount_value,
                "max_discount_satang": grant.coupon.max_discount_satang,
                "expires_at": grant.expires_at,
            }
            for grant in grants if grant.coupon.is_active
        ],
    })


REFERRAL_CLAIM_FAILURE_LIMIT = 10


@api_view(("POST",))
def referral_claim(request):
    """Record that this account was invited, and hand it the friend discount.

    Rate-limited on wrong codes for the same reason `redeem` and the coupon validator are: this
    endpoint answers instantly and a valid code is worth money, so without a limit it is a free
    oracle for enumerating other people's invite codes. Only failures count, so nobody entering
    a code they were actually given is ever locked out.
    """
    if not SiteSetting.current().referral_enabled:
        return Response({"detail": "referral_disabled"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    failure_key = f"referral-fail:{request.user.id}:{timezone.now():%Y%m%d%H}"
    if (cache.get(failure_key) or 0) >= REFERRAL_CLAIM_FAILURE_LIMIT:
        return Response({"detail": "too_many_attempts"}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    try:
        claimed = referral.claim(request.user, request.data.get("code"), request=request)
    except referral.ReferralError as exc:
        if exc.code in ("invalid_code", "cannot_refer_yourself"):
            cache.add(failure_key, 0, timeout=3700)
            cache.incr(failure_key)
        return Response({"detail": exc.code}, status=status.HTTP_400_BAD_REQUEST)

    coupon = referral.invitee_coupon()
    return Response({
        "status": claimed.status,
        "discount": None if not coupon else {
            "code": coupon.code,
            "discount_type": coupon.discount_type,
            "discount_value": coupon.discount_value,
            "max_discount_satang": coupon.max_discount_satang,
        },
    }, status=status.HTTP_201_CREATED)


@api_view(("GET",))
def credits(request):
    """Balance and history. The history is the balance — there is no stored total."""
    entries = CreditLedger.objects.filter(user=request.user)[:100]
    return Response({
        "balance_satang": referral.credit_balance(request.user),
        "entries": [
            {
                "amount_satang": entry.amount_satang,
                "kind": entry.kind,
                "kind_label": entry.get_kind_display(),
                "note": entry.note,
                "created_at": entry.created_at,
            }
            for entry in entries
        ],
    })


# ---------------------------------------------------------------- ถอนเงิน


def _withdrawal_row(withdrawal):
    return {
        "id": withdrawal.pk,
        "amount_satang": withdrawal.amount_satang,
        "status": withdrawal.status,
        "status_label": withdrawal.get_status_display(),
        # Masked, always. The full number exists only behind an audited admin action.
        "destination": withdrawal.masked_destination,
        "reference": withdrawal.reference,
        "note": withdrawal.note,
        "created_at": withdrawal.created_at,
        "paid_at": withdrawal.paid_at,
    }


@api_view(("GET", "PUT"))
def payout_account(request):
    """Where this user's withdrawals are sent.

    GET never returns the number — only the last four. There is no endpoint that returns it at
    all: the user typed it, and the only party who needs to read it back is an operator making a
    transfer, through an audited action in the admin.
    """
    account = PayoutAccount.objects.filter(user=request.user).first()
    if request.method == "GET":
        return Response({
            "account": payout.account_summary(account),
            "banks": [{"code": code, "label": label} for code, label in payout.BANKS],
        })

    try:
        account = payout.save_account(
            user=request.user,
            method=request.data.get("method"),
            bank=request.data.get("bank"),
            account_name=request.data.get("account_name"),
            number=request.data.get("number"),
        )
    except payout.PayoutError as exc:
        # `payout_not_configured` is our failure, not the user's — the deployment has no
        # encryption key, and saying "invalid input" would send them round in circles.
        status_code = (
            status.HTTP_503_SERVICE_UNAVAILABLE if exc.code == "payout_not_configured"
            else status.HTTP_400_BAD_REQUEST
        )
        return Response({"detail": exc.code}, status=status_code)
    return Response({"account": payout.account_summary(account)})


@api_view(("GET", "POST"))
def withdrawals(request):
    config = SiteSetting.current()
    if request.method == "GET":
        rows = WithdrawalRequest.objects.filter(user=request.user)[:50]
        return Response({
            "withdrawable_satang": payout.withdrawable(request.user),
            "minimum_satang": config.withdrawal_min_satang,
            "withdrawal_enabled": config.withdrawal_enabled,
            "has_open_request": bool(payout.open_request(request.user)),
            "results": [_withdrawal_row(row) for row in rows],
        })

    try:
        withdrawal = payout.request_withdrawal(
            request.user, request.data.get("amount_satang"), request=request,
        )
    except payout.PayoutError as exc:
        status_code = (
            status.HTTP_503_SERVICE_UNAVAILABLE
            if exc.code in ("payout_not_configured", "withdrawal_disabled")
            else status.HTTP_400_BAD_REQUEST
        )
        return Response(
            {"detail": exc.code, "minimum_satang": config.withdrawal_min_satang,
             "withdrawable_satang": payout.withdrawable(request.user)},
            status=status_code,
        )
    return Response(_withdrawal_row(withdrawal), status=status.HTTP_201_CREATED)


@api_view(("POST",))
def cancel_withdrawal(request, withdrawal_id):
    withdrawal = WithdrawalRequest.objects.filter(id=withdrawal_id, user=request.user).first()
    if not withdrawal:
        raise NotFound("Withdrawal not found")
    try:
        payout.cancel_withdrawal(withdrawal)
    except payout.PayoutError as exc:
        return Response({"detail": exc.code}, status=status.HTTP_409_CONFLICT)
    withdrawal.refresh_from_db()
    return Response(_withdrawal_row(withdrawal))


# ---------------------------------------------------------------- การแจ้งเตือน


class NotificationViewSet(viewsets.GenericViewSet, mixins.ListModelMixin):
    """The bell. Read-only apart from marking things read."""

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        rows = self.get_queryset()[:50]
        return Response({
            "unread": unread_count(request.user),
            "results": [
                {
                    "id": row.pk, "kind": row.kind, "title": row.title, "body": row.body,
                    "payload": row.payload, "read": row.read_at is not None,
                    "created_at": row.created_at,
                }
                for row in rows
            ],
        })

    @action(detail=False, methods=("post",), url_path="read")
    def mark_read(self, request):
        """Marks everything read, or the ids given. Idempotent either way."""
        ids = request.data.get("ids")
        rows = self.get_queryset().filter(read_at__isnull=True)
        if ids:
            rows = rows.filter(pk__in=ids)
        rows.update(read_at=timezone.now())
        return Response({"unread": unread_count(request.user)})


@api_view(("POST",))
def register_push_token(request):
    """Point a device at this account.

    `update_or_create` on the token rather than get_or_create on the pair: a token belongs to an
    installation, so signing in as somebody else on a shared device has to move it, or the new
    user's notifications go to the previous one.
    """
    token = str(request.data.get("token", "")).strip()
    if not token:
        raise ValidationError({"token": "token_required"})
    platform = str(request.data.get("platform", "web")).strip().lower()
    if platform not in PushToken.Platform.values:
        platform = PushToken.Platform.WEB
    PushToken.objects.update_or_create(
        token=token, defaults={"user": request.user, "platform": platform},
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


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


@api_view(("POST",))
def pay_order(request, order_id):
    """Turn a pending order into a PromptPay QR.

    Kept separate from order creation so the order exists before the provider is ever
    contacted: a charge that arrives with no order behind it is unattributable money.
    Repeating the call reuses the existing charge rather than opening a second one for the
    same order — otherwise a double-click leaves two live QR codes and one of them can be paid
    after the order is already settled.
    """
    order = Order.objects.filter(id=order_id, user=request.user).select_related("plan").first()
    if not order:
        raise NotFound("Order not found")
    if order.status != Order.Status.PENDING:
        return Response({"detail": "order_not_payable", "status": order.status}, status=status.HTTP_409_CONFLICT)
    if not omise_configured():
        return Response({"detail": "payments_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if order.provider == Order.Provider.OMISE and order.provider_charge_id:
        return Response({"detail": "charge_already_open", "order_id": str(order.id)}, status=status.HTTP_409_CONFLICT)

    try:
        charge_id, qr, expires_at = create_promptpay_charge(order.total_satang, order.id)
    except OmiseError as exc:
        # The order stays pending and payable: a provider outage must not cost the user their
        # coupon or make them re-enter anything.
        return Response({"detail": "payment_provider_error", "reason": str(exc)[:200]},
                        status=status.HTTP_502_BAD_GATEWAY)

    order.provider = Order.Provider.OMISE
    order.provider_charge_id = charge_id
    order.save(update_fields=("provider", "provider_charge_id"))
    return Response({
        "order_id": str(order.id),
        "total_satang": order.total_satang,
        "qr_image_url": qr,
        "expires_at": expires_at,
        # The client polls the order; it must never decide it is paid on its own.
        "poll_url": f"/orders/{order.id}/",
    })


@api_view(("POST",))
@authentication_classes(())
@permission_classes((AllowAny,))
# Never throttled. Omise decides when to send these and retries on a non-2xx, so a 429 would
# delay a subscription activation the user has already paid for — and a burst of them is Omise
# catching up after an outage, which is exactly when they must all get through. Authenticity is
# established by the HMAC check on the first line of the body, not by a rate limit.
@throttle_classes(())
def omise_webhook(request):
    """Where a PromptPay payment becomes entitlement.

    This is the ONLY thing that marks an order paid. The browser is never believed: anyone can
    replay a redirect URL, and the customer's device is not a party we control.

    Answers 200 to anything it has already handled or deliberately ignores, so Omise stops
    retrying. Only a genuine failure on our side returns 5xx.
    """
    if not verify_omise_signature(
        request.body,
        request.headers.get("Omise-Signature", ""),
        request.headers.get("Omise-Signature-Timestamp", ""),
    ):
        # Includes the case where no secret is configured — an endpoint that grants paid
        # entitlement must fail closed.
        return Response({"detail": "invalid_signature"}, status=status.HTTP_401_UNAUTHORIZED)

    event = request.data or {}
    if event.get("key") != "charge.complete":
        return Response({"detail": "ignored"})

    charge = event.get("data") or {}
    charge_id = charge.get("id") or ""
    if charge.get("status") != "successful":
        Order.objects.filter(provider=Order.Provider.OMISE, provider_charge_id=charge_id,
                             status=Order.Status.PENDING).update(status=Order.Status.FAILED)
        return Response({"detail": "not_successful"})

    order = Order.objects.filter(provider=Order.Provider.OMISE, provider_charge_id=charge_id).first()
    if not order:
        # Fall back to the id we attached at charge time, in case the charge was recorded
        # against the order after the webhook raced us.
        order_id = ((charge.get("metadata") or {}).get("order_id") or "").strip()
        order = Order.objects.filter(id=order_id).first() if order_id else None
    if not order:
        # 200 on purpose: retrying will not make an order we have never seen appear.
        return Response({"detail": "unknown_order"})

    # A charge that says a different number than the order is either a bug or an attack; in
    # both cases granting the plan would be wrong.
    if int(charge.get("amount") or 0) != order.total_satang:
        return Response({"detail": "amount_mismatch"}, status=status.HTTP_409_CONFLICT)

    # activate() is idempotent and is the same call the manual bank-transfer path makes, so a
    # replayed webhook cannot extend the subscription or spend the coupon twice.
    activate(order, charge_id=charge_id)
    return Response({"detail": "ok"})
