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
from django.db.models import Count, Q, Sum
from django.shortcuts import render
from django.urls import path
from django.utils import timezone

from .models import (
    PromoRedemption, Referral, Scan, Simulation, Subscription, WithdrawalRequest,
)


class DoodeeAdminSite(AdminSite):
    site_header = "DOODEE"
    site_title = "DOODEE admin"
    index_title = "ภาพรวมระบบ"

    def index(self, request, extra_context=None):
        from .analytics import headline

        return super().index(request, {
            **(extra_context or {}),
            **self._overview(),
            "headline": headline(),
        })

    def get_urls(self):
        # Ahead of super()'s catch-all app_index route, which would otherwise try to resolve
        # "reports" as an installed app label and 404.
        return [
            path("reports/", self.admin_view(self.reports_view), name="doodee_reports"),
            # Same reason: "marketing" is not an app label either.
            path("marketing/", self.admin_view(self.marketing_view), name="doodee_marketing"),
            *super().get_urls(),
        ]

    def reports_view(self, request):
        """The deeper numbers. `admin_view` supplies the login gate and staff check."""
        from .analytics import report
        from .charts import monthly_chart

        data = report()
        return render(request, "admin/doodee/reports.html", {
            **self.each_context(request),
            "title": "รายงาน",
            "report": data,
            # Built from the same rows the table below the chart prints, so the picture and the
            # numbers can never disagree.
            "chart": monthly_chart(data["months"], data["tracking_started"]),
        })

    def marketing_view(self, request):
        """Where users come from, and what they are worth once they arrive.

        Its own page rather than five more sections on the reports one: this is the question a
        person asks while spending money on ads, and the answer should not be at the bottom of
        a page about chat costs and withdrawal queues.
        """
        from .analytics import DEFAULT_WINDOW, WINDOWS, marketing_report
        from .charts import bar_chart

        try:
            days = int(request.GET.get("days", DEFAULT_WINDOW))
        except (TypeError, ValueError):
            days = DEFAULT_WINDOW
        # Clamped rather than trusted: `days` arrives from a query string, and an arbitrary
        # integer there is an arbitrary scan anyone can ask this page to run.
        days = days if days in WINDOWS else DEFAULT_WINDOW

        data = marketing_report(days)
        return render(request, "admin/doodee/marketing.html", {
            **self.each_context(request),
            "title": "การตลาด",
            "report": data,
            # Same rows as the numbers beside it, so the picture cannot disagree with the table.
            "chart": bar_chart(data["visit_months"], "hits", data["visit_tracking_started"]),
        })

    @staticmethod
    def _overview():
        now = timezone.now()
        last_7 = now - timedelta(days=7)
        last_30 = now - timedelta(days=30)

        scans = Scan.objects.filter(is_demo=False).aggregate(
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
        referrals = Referral.objects.aggregate(
            week=Count("pk", filter=Q(created_at__gte=last_7)),
            qualified_week=Count("pk", filter=Q(qualified_at__gte=last_7)),
            # The actionable one: a referral in this state is waiting on a person, and money
            # does not move until somebody looks at it.
            held=Count("pk", filter=Q(status=Referral.Status.HELD)),
        )
        # People waiting for their money. The one figure on this page where a delay is somebody
        # refreshing their bank app, so it is counted and totalled rather than merely listed.
        withdrawals = WithdrawalRequest.objects.filter(
            status__in=WithdrawalRequest.OPEN_STATUSES,
        ).aggregate(count=Count("pk"), total=Sum("amount_satang"))
        withdrawals["total"] = withdrawals["total"] or 0
        expiring = Subscription.objects.filter(
            current_period_end__gt=now, current_period_end__lte=now + timedelta(days=7),
        ).exclude(status=Subscription.Status.CANCELLED).count()
        return {
            "overview": {
                "scans": scans,
                "simulations": simulations,
                "redemptions": redemptions,
                "referrals": referrals,
                "withdrawals": withdrawals,
                "expiring_week": expiring,
                # A queue that keeps growing is the first sign the Celery worker is wedged or
                # that MediaPipe is saturating the box — see compose.yaml's --concurrency=2.
                "queue_warning": scans["pending"] > 10,
            }
        }
