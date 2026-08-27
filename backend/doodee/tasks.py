import logging

from celery import shared_task
from django.contrib.auth.models import User
from django.db import transaction

from .analysis_engine import analyze_images
from .models import Scan, Simulation
from .simulation_engine import has_profile_images, related_union, simulate, source_for_scan, validate_selections
from .storage import delete_image, download_image, upload_image


logger = logging.getLogger(__name__)


def _image_type(data):
    if data.startswith(b"\x89PNG"):
        return "image/png", "png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return "image/jpeg", "jpg"


@shared_task
def process_scan(scan_id):
    scan = Scan.objects.filter(pk=scan_id).first()
    if not scan or scan.status == Scan.Status.DELETION_PENDING:
        return
    try:
        scan.status, scan.progress = Scan.Status.PROCESSING, 10
        scan.save(update_fields=("status", "progress", "updated_at"))
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
    scan.save()


@shared_task
def process_simulation(simulation_id):
    simulation = Simulation.objects.select_related("scan").filter(pk=simulation_id).first()
    if not simulation or simulation.status == Simulation.Status.DELETION_PENDING:
        return
    try:
        simulation.status, simulation.progress = Simulation.Status.PROCESSING, 10
        simulation.save(update_fields=("status", "progress", "updated_at"))
        # Rows saved before stacking have no `selections`, so the old columns stand in for one.
        selections = simulation.selections or [{"region": simulation.region, "preset_id": simulation.preset_id}]
        presets, _targets = validate_selections(simulation.scan, selections, has_profile_images(simulation.scan))
        source, source_object, source_view = source_for_scan(simulation.scan, presets[0], download_image)
        source_type, source_extension = _image_type(source)
        # The focus boxes are a viewer hint for the live preview; a stored simulation is served
        # as a plain pair of images, so nothing here would read them.
        output, measurements, _focus = simulate(source, presets)
        base = f"users/{simulation.scan.user_id}/simulations/{simulation.id}"
        before_object = f"{base}/before.{source_extension}"
        after_object = f"{base}/after.png"
        upload_image(before_object, source, source_type)
        try:
            upload_image(after_object, output, "image/png")
        except Exception:
            delete_image(before_object)
            raise
        simulation.before_object = before_object
        simulation.after_object = after_object
        simulation.source_view = source_view
        simulation.measurements = measurements
        simulation.related_procedures = related_union(presets)
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
    simulation.save()


def _delete_objects(objects):
    for object_name in dict.fromkeys(item for item in objects if item):
        delete_image(object_name)


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
