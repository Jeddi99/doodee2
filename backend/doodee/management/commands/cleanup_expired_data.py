from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from doodee.models import DailyActive, Scan, Simulation
from doodee.tasks import cleanup_scan, cleanup_simulation, purge_scan_images, request_scan_deletion


class Command(BaseCommand):
    help = "Queue deletion of expired biometric images and minor sessions"

    def handle(self, *args, **options):
        now = timezone.now()
        scans_to_delete = Scan.objects.filter(
            Q(status=Scan.Status.DELETION_PENDING) | Q(age_band=Scan.AgeBand.MINOR, expires_at__lte=now)
        )
        adult_scans = Scan.objects.filter(age_band=Scan.AgeBand.ADULT, expires_at__lte=now).exclude(
            status=Scan.Status.DELETION_PENDING
        ).exclude(image_objects={})
        simulations = Simulation.objects.filter(Q(status=Simulation.Status.DELETION_PENDING) | Q(expires_at__lte=now))
        counts = (scans_to_delete.count(), adult_scans.count(), simulations.count())
        for scan in scans_to_delete:
            if scan.status == Scan.Status.DELETION_PENDING:
                transaction.on_commit(lambda scan_id=str(scan.id): cleanup_scan.delay(scan_id))
            else:
                request_scan_deletion(scan)
        for scan in adult_scans:
            transaction.on_commit(lambda scan_id=str(scan.id): purge_scan_images.delay(scan_id))
        for simulation in simulations:
            if simulation.status != Simulation.Status.DELETION_PENDING:
                simulation.status = Simulation.Status.DELETION_PENDING
                simulation.deletion_requested_at = now
                simulation.save(update_fields=("status", "deletion_requested_at", "updated_at"))
            transaction.on_commit(lambda simulation_id=str(simulation.id): cleanup_simulation.delay(simulation_id))
        # Visit rows answer "how many people this month"; a year is more than enough history
        # for that, and keeping them forever grows a per-user log with no expiry date.
        stale_activity, _ = DailyActive.objects.filter(date__lt=now.date() - timedelta(days=365)).delete()
        self.stdout.write(
            f"queued scans={counts[0]} adult_images={counts[1]} simulations={counts[2]} "
            f"activity_rows_deleted={stale_activity}"
        )
