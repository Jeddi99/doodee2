import logging
from datetime import timedelta

from celery import shared_task
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from . import ai_budget, consent, skin_vision
from .analysis_engine import analyze_images
from .models import ConsentEvent, Scan, Simulation, SimulationPreviewUsage
from .simulation_engine import (
    has_profile_images, related_union, simulate_canonical, validate_selections,
)
from .storage import delete_image, download_image, upload_image


logger = logging.getLogger(__name__)


def _image_type(data):
    if data.startswith(b"\x89PNG"):
        return "image/png", "png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return "image/jpeg", "jpg"


@shared_task(acks_late=True, reject_on_worker_lost=True)
def process_scan(scan_id):
    with transaction.atomic():
        scan = Scan.objects.select_for_update().filter(pk=scan_id, status=Scan.Status.QUEUED).first()
        if not scan:
            return
        scan.status, scan.progress, scan.started_at = Scan.Status.PROCESSING, 10, timezone.now()
        scan.attempt_count = F("attempt_count") + 1
        scan.save(update_fields=("status", "progress", "started_at", "attempt_count", "updated_at"))
        scan.refresh_from_db()
    try:
        images = {view: download_image(name) for view, name in scan.image_objects.items()}
        scan.progress = 35
        scan.save(update_fields=("progress", "updated_at"))
        scan.analysis_data = analyze_images(images, scan.age_band, scan.scan_mode, scan.reference_profile, scan.reference_age_band, scan.reference_population)
        scan.status, scan.progress = Scan.Status.COMPLETED, 100
        scan.error_code = scan.error_message = ""
    except ValueError as exc:
        scan.status, scan.progress = Scan.Status.FAILED, 100
        scan.error_code = str(exc)[:40]
        scan.error_message = "The scan could not be measured reliably. Retake the indicated images."
        # The client deletes a failed scan as soon as it shows the message, so the database row is
        # the only record of why and it does not survive. Log it or the reason is unrecoverable.
        logger.warning("scan %s failed validation: %s", scan_id, scan.error_code)
    except Exception:
        scan.status, scan.progress = Scan.Status.FAILED, 100
        scan.error_code = "analysis_failed"
        scan.error_message = "Analysis failed. Please try again."
        logger.exception("scan %s raised an unexpected error", scan_id)
    scan.finished_at = timezone.now()
    scan.save()
    # After the save, so the task that follows reads a row that exists and is COMPLETED. A
    # failure here must never reach the caller: the scan is already finished and the model's
    # description is an addition to it, never the analysis itself.
    transaction.on_commit(lambda: queue_skin_vision(scan))


# Roughly what one front photograph costs to send. Gemini bills an image as 768x768 tiles at 258
# tokens each, and `skin_vision._encode` caps the long edge at 2,576px, so a portrait frame is at
# most 4x3 tiles — about 3,100 — call it 5,000 with the system prompt and the measurement block.
# Deliberately generous: an under-estimate is admitted against the monthly ceiling and then spends
# more than it held, which is the direction that overruns a budget rather than protects it.
SKIN_VISION_RESERVE_INPUT_TOKENS = 5000


def queue_skin_vision(scan):
    """Send this scan's front photograph for a model-written description, if it should be.

    Every condition here is a reason *not* to spend money or disclose a photograph, so the
    default is no. Consent is checked again inside `skin_vision.analyze`, immediately before the
    request goes out — this check is an optimisation that keeps the queue clear, not the
    safeguard. A user who withdraws while the task waits is protected by the later check.
    """
    if scan.status != Scan.Status.COMPLETED or scan.is_demo:
        return False
    if scan.age_band != Scan.AgeBand.ADULT:
        return False
    if not scan.image_objects.get("front"):
        return False
    if not skin_vision.configured():
        return False
    if (scan.analysis_data or {}).get("skin_vision"):
        return False

    skin = (scan.analysis_data or {}).get("skin_analysis") or {}
    if not skin.get("readable"):
        # Nothing to describe. `skin_vision` asks the model to say what the *measured* values
        # look like on this face; with no readable measurement it would be describing a face
        # freehand, which its own system prompt is written to prevent. Sending the photograph
        # anyway would be a disclosure bought for an answer with nothing under it.
        return False
    if not consent.granted(scan.user, ConsentEvent.Purpose.SKIN_VISION):
        return False

    try:
        process_skin_vision.delay(str(scan.id))
    except Exception:  # noqa: BLE001 - a dead broker must not fail a finished scan
        logger.exception("could not queue skin vision for scan %s", scan.id)
        return False
    return True


@shared_task(acks_late=True, reject_on_worker_lost=True)
def process_skin_vision(scan_id):
    """Describe one scan's front photograph, and charge it to the same monthly ceiling as chat.

    Separate from `process_scan` on purpose. That task marks a scan FAILED on any exception, and
    an unreachable provider must not undo measurements that succeeded. It is also the only place
    in the product where a face photograph leaves the system, so it is worth being able to read
    the whole path in one function.
    """
    from django.conf import settings

    scan = Scan.objects.filter(pk=scan_id, status=Scan.Status.COMPLETED).first()
    if not scan or (scan.analysis_data or {}).get("skin_vision"):
        return
    name = (scan.image_objects or {}).get("front")
    if not name:
        # The 30-day purge has already run. There is nothing left to send and never will be.
        return

    ledger = ai_budget.reserve(
        scan.user, f"skin_vision:{scan.id}",
        provider=skin_vision.PROVIDER, model=skin_vision.MODEL,
        input_tokens=SKIN_VISION_RESERVE_INPUT_TOKENS, output_tokens=skin_vision.MAX_TOKENS,
        price_in=settings.SKIN_VISION_PRICE_IN_USD_PER_MTOK,
        price_out=settings.SKIN_VISION_PRICE_OUT_USD_PER_MTOK,
    )
    if ledger is None:
        logger.info("skin vision skipped for scan %s: monthly budget reached", scan_id)
        return
    if ledger is False:
        # Already reserved under this key, so this is a retry of a task that got as far as
        # paying. Retrying the call would bill a second time for one photograph.
        logger.info("skin vision already attempted for scan %s", scan_id)
        return

    try:
        import cv2
        import numpy as np

        image = cv2.imdecode(np.frombuffer(download_image(name), np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise skin_vision.SkinVisionUnavailable("front_image_unreadable")
        payload = skin_vision.analyze(scan.user, image, scan.analysis_data.get("skin_analysis"))
    except skin_vision.SkinVisionNotConsented:
        # Withdrawn between the queue check and now. Correct outcome, not an error.
        ai_budget.refund(ledger)
        return
    except skin_vision.SkinVisionUnavailable as exc:
        logger.warning("skin vision unavailable for scan %s: %s", scan_id, exc)
        ai_budget.refund(ledger)
        return
    except Exception:
        logger.exception("skin vision raised an unexpected error for scan %s", scan_id)
        ai_budget.refund(ledger)
        return

    usage = payload.pop("usage", {"input_tokens": 0, "output_tokens": 0})
    with transaction.atomic():
        fresh = Scan.objects.select_for_update().filter(pk=scan_id).first()
        if not fresh or (fresh.analysis_data or {}).get("skin_vision"):
            ai_budget.refund(ledger)
            return
        fresh.analysis_data = dict(fresh.analysis_data or {}, skin_vision=payload)
        fresh.save(update_fields=("analysis_data", "updated_at"))
    ai_budget.settle(
        ledger, usage,
        price_in=settings.SKIN_VISION_PRICE_IN_USD_PER_MTOK,
        price_cached_in=settings.SKIN_VISION_PRICE_CACHED_IN_USD_PER_MTOK,
        price_out=settings.SKIN_VISION_PRICE_OUT_USD_PER_MTOK,
    )


@shared_task(acks_late=True, reject_on_worker_lost=True)
def process_simulation(simulation_id):
    with transaction.atomic():
        simulation = Simulation.objects.select_for_update().select_related("scan").filter(
            pk=simulation_id, status=Simulation.Status.QUEUED,
        ).first()
        if not simulation:
            return
        simulation.status, simulation.progress, simulation.started_at = Simulation.Status.PROCESSING, 10, timezone.now()
        simulation.attempt_count = F("attempt_count") + 1
        simulation.save(update_fields=("status", "progress", "started_at", "attempt_count", "updated_at"))
        simulation.refresh_from_db()
    try:
        # Rows saved before stacking have no `selections`, so the old columns stand in for one.
        selections = simulation.selections or [{"region": simulation.region, "preset_id": simulation.preset_id}]
        # Validated on both paths, so a selection the old engine would refuse cannot slip
        # through by being routed to the new one.
        presets, _targets = validate_selections(simulation.scan, selections, has_profile_images(simulation.scan))
        # The focus boxes are a viewer hint for the live preview; a stored simulation is served
        # as a plain pair of images, so nothing here would read them.
        output_format = ".webp" if simulation.kind == Simulation.Kind.PREVIEW else ".png"
        after_extension = "webp" if simulation.kind == Simulation.Kind.PREVIEW else "png"
        base = f"users/{simulation.scan.user_id}/simulations/{simulation.id}"
        extra = None

        output, measurements, _focus, extra = simulate_canonical(
            simulation.scan, selections, download_image, output_format=output_format,
            view=(simulation.parameters or {}).get("view"),
        )
        source, source_view = extra["before_encoded"], extra["legacy_view"]
        source_type, source_extension = f"image/{after_extension}", after_extension

        before_object = f"{base}/before.{source_extension}"
        after_object = f"{base}/after.{after_extension}"
        upload_image(before_object, source, source_type)
        uploaded = [before_object]
        try:
            upload_image(after_object, output, f"image/{after_extension}")
            uploaded.append(after_object)
            view_objects = {}
            # The fused model renders all three views whatever is asked for, so keeping the
            # other two is nearly free at render time — but not at storage time, and a preview
            # is written on every slider change and expires within the hour. Nothing reads them
            # for a preview, so only a saved simulation pays to keep them.
            if extra and simulation.kind != Simulation.Kind.PREVIEW:
                # Uploaded after the pair the client already knows how to read, so a failure
                # here cannot cost a simulation that has otherwise succeeded — see the except.
                for name, encoded in extra["encoded_views"].items():
                    if name == extra["legacy_view"]:
                        continue
                    # A view nothing moved in is the source photograph. Storing it as a result
                    # would pay to keep a copy of the upload and would offer the user an angle
                    # with nothing to see on it — a procedure confined to one cheek does not
                    # show on the opposite profile, and that is a correct render, not a failure.
                    if not extra["views"][name]["changed"]:
                        continue
                    object_name = f"{base}/{name}.{after_extension}"
                    upload_image(object_name, encoded, f"image/{after_extension}")
                    uploaded.append(object_name)
                    view_objects[name] = object_name
                view_objects[extra["legacy_view"]] = after_object
        except Exception:
            for object_name in uploaded:
                delete_image(object_name)
            raise
        simulation.before_object = before_object
        simulation.after_object = after_object
        simulation.view_objects = view_objects
        simulation.source_view = source_view
        simulation.measurements = measurements
        simulation.related_procedures = (
            extra["related_procedures"] if extra else related_union(presets)
        )
        if extra:
            simulation.model_version = extra["model_version"]
            # How much of each frame moved. Kept beside the render rather than recomputed on
            # read: the two source images it was measured between are not both stored, so this
            # is the only moment the number can be taken.
            simulation.parameters = {
                **(simulation.parameters or {}),
                "visibility": {name: view["visible_percent"]
                               for name, view in extra["views"].items()
                               if "visible_percent" in view},
            }
        simulation.status, simulation.progress = Simulation.Status.COMPLETED, 100
        simulation.error_code = simulation.error_message = ""
    except ValueError as exc:
        simulation.status, simulation.progress = Simulation.Status.FAILED, 100
        simulation.error_code = str(exc)[:40]
        simulation.error_message = "A safe simulation could not be created from this image."
    except Exception:
        simulation.status, simulation.progress = Simulation.Status.FAILED, 100
        simulation.error_code = "simulation_failed"
        simulation.error_message = "Simulation failed. Your quota was restored."
    simulation.finished_at = timezone.now()
    simulation.save()
    if simulation.kind == Simulation.Kind.PREVIEW and simulation.status == Simulation.Status.FAILED:
        SimulationPreviewUsage.objects.filter(
            user_id=simulation.scan.user_id,
            period=timezone.localdate().replace(day=1),
            count__gt=0,
        ).update(count=F("count") - 1)


#: How many times a heavy job may be picked up before it is called failed rather than retried.
#:
#: `reconcile_heavy_jobs` resets anything stuck in PROCESSING back to QUEUED and dispatches it
#: again, every minute, forever. A scan that reliably kills its worker — a decode that segfaults
#: mediapipe, an image the detector hangs on — therefore cycles for as long as the row exists,
#: burning a worker slot a minute and never telling anybody. `attempt_count` was being
#: incremented for exactly this and read by nothing.
#:
#: Five, because the legitimate reason to be reset is a worker restart mid-job, and five of those
#: for one scan is already a different problem.
MAX_HEAVY_ATTEMPTS = 5


@shared_task
def reconcile_heavy_jobs():
    """Re-enqueue DB-authoritative work after a broker or worker restart."""
    abandoned_uploads = list(Scan.objects.filter(
        status=Scan.Status.UPLOADING, created_at__lt=timezone.now() - timedelta(hours=1),
    ).values_list("id", flat=True)[:100])
    Scan.objects.filter(id__in=abandoned_uploads).update(status=Scan.Status.DELETION_PENDING)
    for scan_id in abandoned_uploads:
        cleanup_scan.delay(str(scan_id))
    stale = timezone.now() - timedelta(minutes=5)
    # A job that has been picked up too many times is not stuck, it is broken. Failed with a code
    # the user can be shown, rather than retried until the row expires.
    Scan.objects.filter(
        status=Scan.Status.PROCESSING, started_at__lt=stale, attempt_count__gte=MAX_HEAVY_ATTEMPTS,
    ).update(status=Scan.Status.FAILED, progress=100, error_code="too_many_attempts")
    Simulation.objects.filter(
        status=Simulation.Status.PROCESSING, started_at__lt=stale,
        attempt_count__gte=MAX_HEAVY_ATTEMPTS,
    ).update(status=Simulation.Status.FAILED, progress=100, error_code="too_many_attempts")
    Scan.objects.filter(
        status=Scan.Status.PROCESSING, started_at__lt=stale, attempt_count__lt=MAX_HEAVY_ATTEMPTS,
    ).update(status=Scan.Status.QUEUED, progress=0, started_at=None)
    Simulation.objects.filter(
        status=Simulation.Status.PROCESSING, started_at__lt=stale,
        attempt_count__lt=MAX_HEAVY_ATTEMPTS,
    ).update(status=Simulation.Status.QUEUED, progress=0, started_at=None)
    for scan_id in Scan.objects.filter(status=Scan.Status.QUEUED).order_by("created_at").values_list("id", flat=True)[:100]:
        process_scan.delay(str(scan_id))
    for simulation_id in Simulation.objects.filter(status=Simulation.Status.QUEUED).order_by("created_at").values_list("id", flat=True)[:100]:
        process_simulation.delay(str(simulation_id))


def _delete_objects(objects):
    for object_name in dict.fromkeys(item for item in objects if item):
        delete_image(object_name)


@shared_task
def cleanup_expired_data():
    """The retention sweep: expired face photographs and the sessions that carried them.

    A task rather than only a management command because beat can schedule a task and cannot
    schedule a command, and until this existed nothing scheduled the sweep at all — not
    `CELERY_BEAT_SCHEDULE`, not compose, not a cron in the deploy runbook. The command was
    written, tested, and then never run anywhere but by hand.

    That is a broken promise rather than a storage bill: this product tells people their face
    photographs expire — thirty days for an adult, twenty-four hours for a minor — and on a
    deployment where this never fires, they simply do not.

    Thin on purpose. The command holds the logic and its own tests; duplicating it here would
    put a deletion rule in two places, which is the last rule that should ever be duplicated.
    """
    from django.core.management import call_command

    call_command("cleanup_expired_data")


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 8})
def cleanup_scan(scan_id):
    scan = Scan.objects.select_related("user").filter(pk=scan_id).first()
    if not scan:
        return
    objects = list(scan.image_objects.values())
    for simulation in scan.simulations.all():
        objects.extend((simulation.before_object, simulation.after_object))
    _delete_objects(objects)
    user_id = scan.user_id
    scan.delete()
    user = User.objects.filter(pk=user_id, is_active=False).first()
    if user and not user.scans.exists():
        user.delete()


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 8})
def purge_scan_images(scan_id):
    scan = Scan.objects.filter(pk=scan_id).first()
    if not scan:
        return
    _delete_objects(scan.image_objects.values())
    scan.image_objects = {}
    scan.save(update_fields=("image_objects", "updated_at"))


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 8})
def cleanup_simulation(simulation_id):
    simulation = Simulation.objects.filter(pk=simulation_id).first()
    if not simulation:
        return
    _delete_objects((simulation.before_object, simulation.after_object))
    simulation.delete()


def request_scan_deletion(scan):
    from django.utils import timezone

    scan.status = Scan.Status.DELETION_PENDING
    scan.deletion_requested_at = timezone.now()
    scan.save(update_fields=("status", "deletion_requested_at", "updated_at"))
    transaction.on_commit(lambda: cleanup_scan.delay(str(scan.id)))


# ---------------------------------------------------------------- แจ้งเตือนต่ออายุ

# Days before expiry to send a reminder, then the day itself, then one last chance at the end of
# the grace window. Negative numbers are days *after* the period ended.
#
# Five messages is the whole dunning schedule, and it is deliberately short. There is no
# auto-renew to fall back on — Omise PromptPay is a one-time charge and there is no merchant
# account yet (see billing.py) — so a lapsed subscriber only comes back if they are asked, and
# asking more than five times is not asking, it is nagging.
RENEWAL_OFFSETS = (7, 3, 1, 0)


def _renewal_message(plan_name, days_left, lang="th"):
    if days_left > 0:
        return (
            f"สมาชิก{plan_name}ของคุณจะหมดอายุในอีก {days_left} วัน",
            "ต่ออายุได้จากหน้าแผน สิทธิ์ของคุณจะต่อจากวันหมดอายุเดิม ไม่เสียวันที่จ่ายไปแล้ว",
        )
    if days_left == 0:
        return (
            f"สมาชิก{plan_name}ของคุณหมดอายุวันนี้",
            "ต่ออายุตอนนี้เพื่อใช้งานต่อได้ทันที",
        )
    return (
        f"สมาชิก{plan_name}ของคุณหมดอายุแล้ว",
        "ยังต่ออายุได้อยู่ แต่สิทธิ์การใช้งานถูกปิดไปแล้ว",
    )


@shared_task
def send_renewal_reminders(now=None):
    """One pass over subscriptions coming up for renewal. Safe to run as often as you like.

    Safety comes from `Notification`'s unique (user, kind, dedupe_key) rather than from a
    "reminded_at" column: the key names the subscription and the offset, so a beat worker that
    restarts and re-fires the same day inserts nothing instead of sending a second "expires in
    three days" at three in the morning.

    Reminders go out for lapsed subscriptions too, up to the end of the grace window, because
    that is precisely the window where asking still works.
    """
    from datetime import timedelta

    from django.utils import timezone

    from .models import SiteSetting, Subscription
    from .notifications import notify

    now = now or timezone.now()
    grace = SiteSetting.current().subscription_grace_days
    offsets = (*RENEWAL_OFFSETS, -grace) if grace else RENEWAL_OFFSETS
    sent = 0

    for offset in offsets:
        # localtime() before .date(), because the `__date` lookup below converts the stored UTC
        # timestamp to TIME_ZONE (Asia/Bangkok) before comparing. Taking `.date()` off a UTC
        # datetime instead would disagree with it for seven hours out of every twenty-four — and
        # 02:00 UTC, when this job is scheduled, is inside that window.
        target = timezone.localtime(now + timedelta(days=offset)).date()
        due = Subscription.objects.filter(
            current_period_end__date=target,
        ).exclude(
            status=Subscription.Status.CANCELLED,
        ).select_related("plan", "user")
        for subscription in due:
            # Somebody who already renewed has a later period end on another row, and must not be
            # told their membership is about to lapse.
            if Subscription.objects.filter(
                user=subscription.user, plan__grants_group=subscription.plan.grants_group,
                current_period_end__gt=subscription.current_period_end,
            ).exclude(status=Subscription.Status.CANCELLED).exists():
                continue
            title, body = _renewal_message(subscription.plan.name_th, offset)
            created = notify(
                subscription.user,
                kind=("renewal_due" if offset >= 0 else "renewal_lapsed"),
                title=title,
                body=body,
                dedupe_key=f"renew:{subscription.pk}:{offset}",
                payload={"plan": subscription.plan.code, "subscription_id": subscription.pk},
            )
            sent += 1 if created else 0

    logger.info("renewal reminders sent=%s", sent)
    return sent
