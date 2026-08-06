import os

from celery import shared_task
from django.contrib.auth.models import User
from django.db import transaction

from .analysis_engine import analyze_images
from .models import Scan, Simulation
from .simulation_engine import constrain_region_and_watermark, generate_image
from .storage import delete_image, download_image, upload_image


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
        scan.analysis_data = analyze_images(images, scan.age_band, scan.scan_mode)
        scan.status, scan.progress = Scan.Status.COMPLETED, 100
        scan.error_code = scan.error_message = ""
    except ValueError as exc:
        scan.status, scan.progress = Scan.Status.FAILED, 100
        scan.error_code = str(exc)[:40]
        scan.error_message = "The scan could not be measured reliably. Retake the indicated images."
    except Exception:
        scan.status, scan.progress = Scan.Status.FAILED, 100
        scan.error_code = "analysis_failed"
        scan.error_message = "Analysis failed. Please try again."
    scan.save()


@shared_task
def process_simulation(simulation_id):
    simulation = Simulation.objects.select_related("scan").filter(pk=simulation_id).first()
    if not simulation or simulation.status == Simulation.Status.DELETION_PENDING:
        return
    try:
        simulation.status, simulation.progress = Simulation.Status.PROCESSING, 10
        simulation.save(update_fields=("status", "progress", "updated_at"))
        source_object = simulation.scan.image_objects.get("front")
        if not source_object:
            raise ValueError("source_expired")
        source = download_image(source_object)
        source_type, source_extension = _image_type(source)
        generated = generate_image(source, source_type, simulation.region, simulation.parameters)
        simulation.progress = 70
        simulation.save(update_fields=("progress", "updated_at"))
        output = constrain_region_and_watermark(source, generated, simulation.region)
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
