"""Operational overview on the admin index.

Django's default index is a bare list of model links, which answers "what tables exist" but
not "what happened this week" — the question an operator actually opens the admin with. The
counts here are the same shape as the per-plan cards UserAdmin.changelist_view already
builds, extended to cover scan and simulation health.

Everything is a plain aggregate over existing tables. No new writes, no new models, and no
scheduled job: the page is computed on request, which at this scale (single-digit thousands
of rows) costs a few milliseconds.
"""

from datetime import timedelta

from django.contrib.admin import AdminSite
from django.db.models import Count, Q
from django.utils import timezone

from .models import PromoRedemption, Scan, Simulation


class DoodeeAdminSite(AdminSite):
    site_header = "DOODEE"
    site_title = "DOODEE admin"
    index_title = "ภาพรวมระบบ"

    def index(self, request, extra_context=None):
        return super().index(request, {**(extra_context or {}), **self._overview()})

    @staticmethod
    def _overview():
        now = timezone.now()
        last_7 = now - timedelta(days=7)
        last_30 = now - timedelta(days=30)

        scans = Scan.objects.aggregate(
            total=Count("pk"),
            week=Count("pk", filter=Q(created_at__gte=last_7)),
            month=Count("pk", filter=Q(created_at__gte=last_30)),
            # Worth surfacing on its own: a failed scan is a user who captured three angles
            # and got nothing back, and nothing else in the admin makes that visible.
            failed_week=Count("pk", filter=Q(status=Scan.Status.FAILED, created_at__gte=last_7)),
            pending=Count("pk", filter=Q(status__in=(Scan.Status.QUEUED, Scan.Status.PROCESSING))),
        )
        simulations = Simulation.objects.aggregate(
            week=Count("pk", filter=Q(created_at__gte=last_7)),
            failed_week=Count("pk", filter=Q(status=Simulation.Status.FAILED, created_at__gte=last_7)),
        )
        redemptions = PromoRedemption.objects.aggregate(
            week=Count("pk", filter=Q(redeemed_at__gte=last_7)),
            active=Count("pk", filter=Q(expires_at__gt=now)),
        )
        return {
            "overview": {
                "scans": scans,
                "simulations": simulations,
                "redemptions": redemptions,
                # A queue that keeps growing is the first sign the Celery worker is wedged or
                # that MediaPipe is saturating the box — see compose.yaml's --concurrency=2.
                "queue_warning": scans["pending"] > 10,
            }
        }
