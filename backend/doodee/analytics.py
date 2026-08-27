"""The business numbers, computed on request.

One module so a figure means the same thing wherever it is shown. Two filters run through
almost everything and both matter:

* `real_users()` (admin.py) drops staff and the `dev-guest-uid` development account. Without it
  every count includes us.
* `is_demo=False` drops sample scans. A demo scan is a completed adult scan in every respect,
  so any query that forgets this reports fake activity as real.

No scheduled aggregation and no summary tables: at a thousand users these are millisecond
queries over a few tens of thousands of rows, and a nightly rollup would be one more thing that
can silently stop running and quietly serve stale numbers.
"""

from datetime import datetime, time, timedelta

from django.contrib.auth.models import User
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from .admin import real_users
from .models import (
    ChatMessage, Coupon, CreditLedger, DailyActive, Order, Plan, Referral, Scan, Subscription,
    UserAttribution, Visit, WithdrawalRequest,
)


# ---------------------------------------------------------------- cost


def _prices():
    """Per-token prices in USD, and the THB rate, from settings.

    Read at call time rather than imported once: these change when the model changes, and the
    report should follow a settings edit without a code deploy.
    """
    from django.conf import settings

    return (
        settings.CHAT_PRICE_IN_USD_PER_MTOK,
        settings.CHAT_PRICE_OUT_USD_PER_MTOK,
        settings.USD_THB_RATE,
    )


def chat_cost_thb(totals):
    """Baht for a dict of token totals. An estimate, and labelled as one wherever it is shown.

    Cache reads bill at 0.1x the input rate and cache writes at 1.25x — the multipliers are
    Anthropic's, not ours, so they are constants here rather than settings.
    """
    price_in, price_out, thb = _prices()
    million = 1_000_000
    usd = (
        (totals.get("input") or 0) * price_in / million
        + (totals.get("cache_write") or 0) * price_in * 1.25 / million
        + (totals.get("cache_read") or 0) * price_in * 0.1 / million
        + (totals.get("output") or 0) * price_out / million
    )
    return round(usd * thb, 2)


def _chat_totals(queryset):
    aggregate = queryset.aggregate(
        turns=Count("pk"),
        input=Sum("input_tokens"),
        cache_read=Sum("cached_input_tokens"),
        cache_write=Sum("cache_write_tokens"),
        output=Sum("output_tokens"),
    )
    totals = {key: value or 0 for key, value in aggregate.items()}
    totals["cost_thb"] = chat_cost_thb(totals)
    billable_input = totals["input"] + totals["cache_read"]
    # What share of the prompt came from cache. Near zero means caching is not working and
    # every turn is paying full price for a prefix that never changes.
    totals["cache_hit_percent"] = (
        round(totals["cache_read"] * 100 / billable_input, 1) if billable_input else 0.0
    )
    return totals


def _assistant_messages():
    """Only assistant rows carry usage, and only ones that actually called the model.

    Free topic answers are stored with zero tokens; counting them as turns would make the
    average cost per turn look better than it is.
    """
    return ChatMessage.objects.filter(role=ChatMessage.Role.ASSISTANT, output_tokens__gt=0)


# ---------------------------------------------------------------- money


def _paid_orders():
    return Order.objects.filter(status=Order.Status.PAID)


def revenue_satang(since=None, until=None):
    orders = _paid_orders()
    if since:
        orders = orders.filter(paid_at__gte=since)
    if until:
        orders = orders.filter(paid_at__lt=until)
    return orders.aggregate(total=Sum("total_satang"))["total"] or 0


def mrr_satang(now=None):
    """Monthly recurring revenue from subscriptions that are still running.

    Priced from the plan rather than from what was paid, because a one-off discount should not
    depress the recurring figure — the next renewal is at list price.
    """
    now = now or timezone.now()
    active = Subscription.objects.filter(
        status=Subscription.Status.ACTIVE, current_period_end__gt=now,
    ).select_related("plan")
    monthly = 0
    for subscription in active:
        price = subscription.plan.price_satang
        if subscription.plan.interval == Plan.Interval.YEAR:
            price = price // 12
        elif subscription.plan.interval == Plan.Interval.ONCE:
            # A one-off purchase is not recurring revenue, whatever it was worth.
            continue
        monthly += price
    return monthly


# ---------------------------------------------------------------- funnel


def funnel():
    """Where people stop. Each step is a subset of the one above it.

    Counts distinct users, not events: someone with forty scans is one person who scanned.
    """
    users = real_users(User.objects.all())
    registered = users.count()
    scanned = users.filter(
        scans__status=Scan.Status.COMPLETED, scans__is_demo=False,
    ).distinct().count()
    chatted = users.filter(chat_conversations__isnull=False).distinct().count()
    paid = users.filter(orders__status=Order.Status.PAID).distinct().count()

    def percent(value):
        return round(value * 100 / registered, 1) if registered else 0.0

    return [
        {"step": "สมัครสมาชิก", "count": registered, "percent": 100.0 if registered else 0.0},
        {"step": "สแกนสำเร็จ", "count": scanned, "percent": percent(scanned)},
        {"step": "ใช้แชท", "count": chatted, "percent": percent(chatted)},
        {"step": "จ่ายเงิน", "count": paid, "percent": percent(paid)},
    ]


# ---------------------------------------------------------------- headline cards


def headline(now=None):
    """The figures on the admin index. One dict, one template pass."""
    from django.conf import settings

    now = now or timezone.now()
    today = timezone.localdate()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)

    real = real_users(User.objects.all())
    active_ids = real.values("pk")
    visits = DailyActive.objects.filter(user__in=active_ids)

    this_month_chat = _chat_totals(_assistant_messages().filter(created_at__gte=month_start))
    revenue_month = revenue_satang(since=month_start)

    return {
        "visitors": {
            "today": visits.filter(date=today).values("user").distinct().count(),
            "week": visits.filter(date__gte=today - timedelta(days=6)).values("user").distinct().count(),
            "month": visits.filter(date__gte=today - timedelta(days=29)).values("user").distinct().count(),
        },
        "signups": {
            "today": real.filter(date_joined__date=today).count(),
            "month": real.filter(date_joined__gte=month_start).count(),
            "total": real.count(),
        },
        "money": {
            "revenue_month_satang": revenue_month,
            "revenue_last_month_satang": revenue_satang(since=last_month_start, until=month_start),
            "revenue_total_satang": revenue_satang(),
            "mrr_satang": mrr_satang(now),
            "paying": Subscription.objects.filter(
                status=Subscription.Status.ACTIVE, current_period_end__gt=now,
            ).values("user").distinct().count(),
            # Money sitting in the room waiting for someone to confirm a transfer. The one
            # figure on this page that is a to-do rather than a fact.
            "pending_orders": Order.objects.filter(status=Order.Status.PENDING).count(),
        },
        "chat": {
            **this_month_chat,
            "budget_thb": settings.LLM_BUDGET_THB_PER_MONTH,
            "over_budget": this_month_chat["cost_thb"] > settings.LLM_BUDGET_THB_PER_MONTH,
        },
    }


# ---------------------------------------------------------------- report page


def monthly_rows(months=12, now=None):
    """One row per calendar month, newest first.

    Built by grouping in the database and merging in Python rather than one query per month:
    twelve months x six metrics would otherwise be seventy-two round trips.
    """
    now = now or timezone.now()
    start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
             - timedelta(days=31 * (months - 1))).replace(day=1)
    real_ids = real_users(User.objects.all()).values("pk")

    def by_month(queryset, field, value=None):
        grouped = queryset.annotate(month=TruncMonth(field)).values("month")
        grouped = grouped.annotate(value=value or Count("pk"))
        return {row["month"].date().replace(day=1): row["value"] for row in grouped if row["month"]}

    signups = by_month(real_users(User.objects.filter(date_joined__gte=start)), "date_joined")
    scans = by_month(Scan.objects.filter(created_at__gte=start, is_demo=False, user__in=real_ids), "created_at")
    chats = by_month(_assistant_messages().filter(created_at__gte=start), "created_at")
    orders = by_month(_paid_orders().filter(paid_at__gte=start), "paid_at")
    revenue = by_month(_paid_orders().filter(paid_at__gte=start), "paid_at", Sum("total_satang"))

    # Active users need distinct-by-user within each month, which the helper above cannot do.
    actives = {}
    visits = DailyActive.objects.filter(date__gte=start.date(), user__in=real_ids)
    for row in visits.annotate(month=TruncMonth("date")).values("month").annotate(
        value=Count("user", distinct=True)
    ):
        actives[row["month"]] = row["value"]

    cost = {}
    for row in _assistant_messages().filter(created_at__gte=start).annotate(
        month=TruncMonth("created_at")
    ).values("month").annotate(
        input=Sum("input_tokens"), cache_read=Sum("cached_input_tokens"),
        cache_write=Sum("cache_write_tokens"), output=Sum("output_tokens"),
    ):
        cost[row["month"].date().replace(day=1)] = chat_cost_thb(row)

    rows = []
    cursor = now.replace(day=1).date()
    for _ in range(months):
        rows.append({
            "month": cursor,
            "signups": signups.get(cursor, 0),
            "active": actives.get(cursor, 0),
            "scans": scans.get(cursor, 0),
            "chat_turns": chats.get(cursor, 0),
            "orders": orders.get(cursor, 0),
            "revenue_satang": revenue.get(cursor, 0),
            "chat_cost_thb": cost.get(cursor, 0),
        })
        cursor = (cursor - timedelta(days=1)).replace(day=1)

    # Running total of everyone registered, not just those who joined inside the window — so
    # it has to start from the people already there before the first row. Without the baseline
    # the line would restart from zero every twelve months and read as a collapse that never
    # happened. Walked oldest-first, then left in the newest-first order the table expects.
    running = real_users(User.objects.filter(date_joined__lt=start)).count()
    for row in reversed(rows):
        running += row["signups"]
        row["cumulative_users"] = running
    return rows


def coupon_rows():
    return list(
        Coupon.objects.annotate(
            redeemed=Count("redemptions"),
            discount_given=Sum("orders__discount_satang", filter=Q(orders__status=Order.Status.PAID)),
        ).values("code", "discount_type", "discount_value", "max_uses", "used_count", "redeemed", "discount_given", "is_active")
    )


def plan_rows(now=None):
    now = now or timezone.now()
    return list(
        Plan.objects.annotate(
            subscribers=Count(
                "subscriptions",
                filter=Q(subscriptions__status=Subscription.Status.ACTIVE,
                         subscriptions__current_period_end__gt=now),
                distinct=True,
            ),
        ).values("code", "name_th", "price_satang", "interval", "is_active", "subscribers")
    )


def heaviest_chat_users(limit=10):
    """Who is spending the most. This is the abuse alarm, not a leaderboard.

    A stolen account shows up here long before it shows up in the monthly bill.
    """
    rows = (
        _assistant_messages()
        .values("conversation__user__id", "conversation__user__email")
        .annotate(
            turns=Count("pk"),
            input=Sum("input_tokens"), cache_read=Sum("cached_input_tokens"),
            cache_write=Sum("cache_write_tokens"), output=Sum("output_tokens"),
        )
        .order_by(F("output").desc())[:limit]
    )
    return [
        {
            "user_id": row["conversation__user__id"],
            "email": row["conversation__user__email"] or "—",
            "turns": row["turns"],
            "cost_thb": chat_cost_thb(row),
        }
        for row in rows
    ]


# ---------------------------------------------------------------- ชวนเพื่อน


def referral_summary():
    """Whether the invite programme is working, and what it currently owes.

    Credit issued but not yet spent is a **liability**, and since withdrawals were added it is a
    cash one: the holder can spend it on a subscription, in which case it is revenue counted
    twice, or ask for it in baht, in which case it leaves the bank account. Either way it belongs
    beside revenue rather than buried under coupons.
    """
    referrals = Referral.objects.all()
    invited = referrals.count()
    qualified = referrals.filter(status=Referral.Status.QUALIFIED).count()
    issued = CreditLedger.objects.filter(amount_satang__gt=0).aggregate(
        total=Sum("amount_satang"),
    )["total"] or 0
    spent = CreditLedger.objects.filter(amount_satang__lt=0).aggregate(
        total=Sum("amount_satang"),
    )["total"] or 0
    withdrawals = WithdrawalRequest.objects.all()

    def _sum(queryset):
        return queryset.aggregate(total=Sum("amount_satang"))["total"] or 0

    return {
        "invited": invited,
        "qualified": qualified,
        # How many invited accounts went on to pay. The number that says whether inviting brings
        # customers or merely brings signups.
        "conversion_percent": round(qualified * 100 / invited, 1) if invited else 0.0,
        "held": referrals.filter(status=Referral.Status.HELD).count(),
        "rejected": referrals.filter(
            status__in=(Referral.Status.REJECTED, Referral.Status.CLAWED_BACK),
        ).count(),
        "credit_issued_satang": issued,
        "credit_redeemed_satang": -spent,
        "credit_outstanding_satang": issued + spent,
        # Real money already out of the bank account, and real money queued to leave it. The
        # pending figure is the one to watch: it is people waiting, not a statistic.
        "withdrawn_satang": _sum(withdrawals.filter(status=WithdrawalRequest.Status.PAID)),
        "withdrawal_pending_satang": _sum(
            withdrawals.filter(status__in=WithdrawalRequest.OPEN_STATUSES)
        ),
        "withdrawal_pending_count": withdrawals.filter(
            status__in=WithdrawalRequest.OPEN_STATUSES,
        ).count(),
    }


def payout_rows(year=None, now=None):
    """Total paid out per person this calendar year.

    Paying individuals can create reporting obligations, and this is the figure an accountant
    asks for first. It counts only `paid` rows — an approved-but-unsent request is not income to
    anybody yet.
    """
    now = now or timezone.now()
    year = year or now.year
    rows = (
        WithdrawalRequest.objects.filter(status=WithdrawalRequest.Status.PAID, paid_at__year=year)
        .values("user__id", "user__email")
        .annotate(payouts=Count("pk"), total=Sum("amount_satang"))
        .order_by(F("total").desc())
    )
    return [
        {
            "user_id": row["user__id"],
            "email": row["user__email"] or "—",
            "payouts": row["payouts"],
            "total_satang": row["total"],
            "year": year,
        }
        for row in rows
    ]


def referral_rows(limit=20):
    """Per inviter, busiest first. Also the place a farm becomes visible."""
    rows = (
        Referral.objects.values("inviter__id", "inviter__email")
        .annotate(
            invited=Count("pk", distinct=True),
            qualified=Count("pk", filter=Q(status=Referral.Status.QUALIFIED), distinct=True),
            held=Count("pk", filter=Q(status=Referral.Status.HELD), distinct=True),
        )
        .order_by(F("invited").desc())[:limit]
    )
    rewards = dict(
        CreditLedger.objects.filter(
            kind__in=(CreditLedger.Kind.REFERRAL_REWARD, CreditLedger.Kind.CLAWBACK),
        )
        .values_list("user_id")
        .annotate(total=Sum("amount_satang"))
    )
    return [
        {
            "user_id": row["inviter__id"],
            "email": row["inviter__email"] or "—",
            "invited": row["invited"],
            "qualified": row["qualified"],
            "held": row["held"],
            "rewarded_satang": rewards.get(row["inviter__id"], 0),
        }
        for row in rows
    ]


# ---------------------------------------------------------------- retention


def expiring_soon(days=7, now=None):
    """Who lapses this week. The one table on the reports page that is a to-do list.

    Excludes anyone who has already renewed — they have a later period on another row, and
    putting them on a chase list is how a paying customer gets an email telling them they are
    about to lose access they just paid for.
    """
    now = now or timezone.now()
    rows = []
    for subscription in Subscription.objects.filter(
        current_period_end__gt=now, current_period_end__lte=now + timedelta(days=days),
    ).exclude(status=Subscription.Status.CANCELLED).select_related("user", "plan"):
        renewed = Subscription.objects.filter(
            user=subscription.user, plan__grants_group=subscription.plan.grants_group,
            current_period_end__gt=subscription.current_period_end,
        ).exclude(status=Subscription.Status.CANCELLED).exists()
        if renewed:
            continue
        rows.append({
            "user_id": subscription.user_id,
            "email": subscription.user.email or "—",
            "plan": subscription.plan.name_th,
            "ends_at": subscription.current_period_end,
            "days_left": (subscription.current_period_end - now).days,
        })
    return sorted(rows, key=lambda row: row["ends_at"])


def retention_rows(months=6, now=None):
    """Renewal and churn by the month a subscription started.

    A cohort counts as retained when that user has *any* subscription running past the end of
    the one they started with — which is what renewing looks like here, since `activate()`
    writes a new row rather than extending the old one.
    """
    now = now or timezone.now()
    start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
             - timedelta(days=31 * (months - 1))).replace(day=1)

    cohorts = {}
    for subscription in Subscription.objects.filter(
        created_at__gte=start,
    ).select_related("plan").order_by("created_at"):
        month = subscription.created_at.date().replace(day=1)
        bucket = cohorts.setdefault(month, {"month": month, "started": 0, "renewed": 0})
        # First subscription of that user in that month only, or a person who renewed twice
        # would read as two separate customers.
        if Subscription.objects.filter(
            user_id=subscription.user_id, created_at__lt=subscription.created_at,
        ).exists():
            continue
        bucket["started"] += 1
        if Subscription.objects.filter(
            user_id=subscription.user_id,
            current_period_end__gt=subscription.current_period_end,
        ).exclude(pk=subscription.pk).exists():
            bucket["renewed"] += 1

    rows = sorted(cohorts.values(), key=lambda row: row["month"], reverse=True)
    for row in rows:
        row["renewal_percent"] = (
            round(row["renewed"] * 100 / row["started"], 1) if row["started"] else 0.0
        )
        row["churn_percent"] = round(100 - row["renewal_percent"], 1) if row["started"] else 0.0
    return rows


def report(now=None):
    now = now or timezone.now()
    return {
        "generated_at": now,
        "months": monthly_rows(now=now),
        "funnel": funnel(),
        "coupons": coupon_rows(),
        "plans": plan_rows(now),
        "chat_all_time": _chat_totals(_assistant_messages()),
        "heaviest": heaviest_chat_users(),
        "discount_given_satang": _paid_orders().aggregate(total=Sum("discount_satang"))["total"] or 0,
        "tracking_started": DailyActive.objects.order_by("date").values_list("date", flat=True).first(),
        "referral": referral_summary(),
        "referral_rows": referral_rows(),
        "payouts": payout_rows(now=now),
        "retention": retention_rows(now=now),
        "expiring": expiring_soon(now=now),
    }


# ---------------------------------------------------------------- การตลาด


# Offered on the page as buttons rather than a free number in the URL: `days` reaches this
# module from a query string, and an unbounded integer there is an unbounded scan anyone can ask
# for.
WINDOWS = (7, 30, 90)
DEFAULT_WINDOW = 30

INTERVAL_LABELS = {
    Plan.Interval.MONTH: "รายเดือน",
    Plan.Interval.YEAR: "รายปี",
    Plan.Interval.ONCE: "จ่ายครั้งเดียว",
}
ORDER_KINDS = (
    ("first", "ซื้อครั้งแรก"),
    ("renewal", "ต่ออายุ"),
    ("change", "เปลี่ยนแผน"),
)


def _window(days=DEFAULT_WINDOW, now=None):
    """The window every marketing figure shares: (days, first date, first moment).

    One helper because the whole point is that the visitor count and the signup count cover the
    same stretch of time. Visits are dated and users are timestamped, so the two bounds are
    derived from each other rather than computed twice and left to drift by a few hours.
    """
    now = now or timezone.now()
    days = days if days in WINDOWS else DEFAULT_WINDOW
    # Inclusive of today: a 7-day window is today and the six days before it, which is what a
    # person reading "7 วัน" expects.
    since_date = timezone.localdate() - timedelta(days=days - 1)
    since = datetime.combine(since_date, time.min)
    if timezone.is_aware(now):
        since = timezone.make_aware(since, timezone.get_current_timezone())
    return days, since_date, since


def visit_totals(days=DEFAULT_WINDOW, now=None):
    """Arrivals today, over the last week, and over the window, plus the device split.

    "Arrivals" is hits, and hits are browsers — the client posts at most once per browser per
    day. One person on a phone and a laptop is two.
    """
    days, since_date, _ = _window(days, now)
    today = timezone.localdate()

    def hits(queryset):
        return queryset.aggregate(total=Sum("hits"))["total"] or 0

    window = Visit.objects.filter(date__gte=since_date)
    return {
        "today": hits(Visit.objects.filter(date=today)),
        "week": hits(Visit.objects.filter(date__gte=today - timedelta(days=6))),
        "window": hits(window),
        "mobile": hits(window.filter(device="mobile")),
        "desktop": hits(window.filter(device="desktop")),
        "campaign_tagged": hits(window.exclude(campaign="direct")),
    }


def visit_rows(months=6, now=None):
    """One row per calendar month, newest first: `month` and `hits`.

    Months with no rows are filled with zero rather than skipped, so the chart's bars stay
    evenly spaced in time instead of closing the gap and implying continuity that is not there.
    """
    now = now or timezone.now()
    this_month = now.date().replace(day=1)
    wanted = []
    cursor = this_month
    for _ in range(months):
        wanted.append(cursor)
        cursor = (cursor - timedelta(days=1)).replace(day=1)

    totals = {
        row["month"]: row["hits"] or 0
        for row in Visit.objects.filter(date__gte=wanted[-1])
        .annotate(month=TruncMonth("date")).values("month").annotate(hits=Sum("hits"))
    }
    return [{"month": month, "hits": totals.get(month, 0)} for month in wanted]


def attribution_rows(field, days=DEFAULT_WINDOW, now=None):
    """Per traffic source, or per campaign: arrivals, signups, scans, payers and revenue.

    One function for both tables, called with `field="source"` and `field="campaign"`. The two
    are the same question asked of a different column, and two copies would drift until the
    campaign table and the source table disagreed about how much money came in.

    Cohort figures, not activity figures: the accounts counted are those that *signed up* in the
    window, and what they went on to do is counted whenever they did it. A campaign that ran last
    week has not had time to produce a renewal, and windowing the outcomes too would report that
    as a failure rather than as a wait.

    The arrivals column is the one thing that cannot be tied to an account — nothing links a
    `Visit` row to a person, deliberately — so `signup_percent` divides people by browsers and is
    an estimate. The page says so.
    """
    days, since_date, since = _window(days, now)
    real = real_users(User.objects.all())

    hits = {
        row[field]: row["hits"] or 0
        for row in Visit.objects.filter(date__gte=since_date)
        .values(field).annotate(hits=Sum("hits"))
    }

    cohort = UserAttribution.objects.filter(user__in=real, user__date_joined__gte=since)
    signups = {row[field]: row["n"] for row in cohort.values(field).annotate(n=Count("pk"))}
    scanned = {
        row[field]: row["n"]
        for row in cohort.filter(
            user__scans__status=Scan.Status.COMPLETED, user__scans__is_demo=False,
        ).values(field).annotate(n=Count("pk", distinct=True))
    }
    # Payers and revenue come from one query over orders rather than a second annotation on the
    # cohort: two joins on the same queryset multiply rows, and the Sum would be quietly wrong
    # by however many scans each payer happens to have.
    money = {
        row[f"user__attribution__{field}"]: row
        for row in Order.objects.filter(
            status=Order.Status.PAID,
            user__in=real,
            user__date_joined__gte=since,
            user__attribution__isnull=False,
        ).values(f"user__attribution__{field}").annotate(
            payers=Count("user_id", distinct=True), revenue=Sum("total_satang"),
        )
    }

    rows = []
    for key in sorted(set(hits) | set(signups)):
        key_hits = hits.get(key, 0)
        key_signups = signups.get(key, 0)
        paid = money.get(key, {})
        rows.append({
            "key": key,
            "hits": key_hits,
            "signups": key_signups,
            "scanned": scanned.get(key, 0),
            "paid": paid.get("payers", 0) or 0,
            "revenue_satang": paid.get("revenue", 0) or 0,
            "signup_percent": round(key_signups * 100 / key_hits, 1) if key_hits else 0.0,
            "paid_percent": (
                round((paid.get("payers", 0) or 0) * 100 / key_signups, 1) if key_signups else 0.0
            ),
        })
    return sorted(rows, key=lambda row: (-row["hits"], -row["signups"], row["key"]))


def acquisition_funnel(days=DEFAULT_WINDOW, now=None):
    """Visitors down to payers, over one shared window.

    Every step is a subset of สมัครสมาชิก, but the last two are not nested in each other: nothing
    requires a scan before buying a plan, so จ่ายเงิน can exceed สแกนสำเร็จ. Read as four
    measurements of one cohort, not as a funnel that must only ever narrow.

    `funnel()` starts at signup because that is the first step it can honestly count. This one
    starts a step earlier, which is only possible now that arrivals are recorded — and only
    honest if every step covers the same period, since a visitor count that began the day
    tracking was switched on, divided into an all-time user count, produces a conversion rate
    wrong by the age of the site.

    Monthly-versus-yearly and renewals are not steps here. One is a partition of the paid step
    and the other does not narrow it further; both are tables of their own on the page.
    """
    days, since_date, since = _window(days, now)
    visitors = Visit.objects.filter(date__gte=since_date).aggregate(total=Sum("hits"))["total"] or 0
    cohort = real_users(User.objects.all()).filter(date_joined__gte=since)
    registered = cohort.count()
    scanned = cohort.filter(
        scans__status=Scan.Status.COMPLETED, scans__is_demo=False,
    ).distinct().count()
    paid = cohort.filter(orders__status=Order.Status.PAID).distinct().count()

    def percent(value):
        return round(value * 100 / visitors, 1) if visitors else 0.0

    return [
        {"step": "ผู้เข้าชม", "count": visitors, "percent": 100.0 if visitors else 0.0},
        {"step": "สมัครสมาชิก", "count": registered, "percent": percent(registered)},
        {"step": "สแกนสำเร็จ", "count": scanned, "percent": percent(scanned)},
        {"step": "จ่ายเงิน", "count": paid, "percent": percent(paid)},
    ]


def interval_mix(now=None):
    """Paying subscribers folded to รายเดือน / รายปี.

    Built on `plan_rows()`, which already counts active subscribers per plan and carries the
    interval, so there is nothing here to disagree with the plans table on the reports page.
    """
    totals = {}
    for row in plan_rows(now):
        totals[row["interval"]] = totals.get(row["interval"], 0) + row["subscribers"]
    rows = [
        {"interval": interval, "label": label, "subscribers": totals.get(interval, 0)}
        for interval, label in INTERVAL_LABELS.items()
        # A one-off plan is not a term, and the row only earns its space if anyone holds one.
        if interval != Plan.Interval.ONCE or totals.get(interval, 0)
    ]
    return rows


def order_kind_rows(days=None, now=None):
    """Every paid order sorted into first purchase, renewal or plan change, split by term.

    Renewal cannot be read off a row count. `billing.activate()` expires the previous
    subscription only when the plan matches exactly, so `plus` → `pro` (an upgrade) and `plus` →
    `plus_year` (a change of term) both leave two live-looking rows without a renewal having
    happened. Ordinality of paid orders alone fails the other way round: an upgrade is a second
    paid order that renews nothing. So the test is the plan *code*: a paid order renews when that
    user has paid for that same plan before.

    Classified over the user's whole history and only then filtered to the window — otherwise the
    first order inside a 7-day window would look like a first purchase for a customer of two
    years.

    An order paid entirely with credit or a full-value coupon is PAID with a real subscription
    behind it, so it counts as a renewal; its revenue is ฿0, which is why the counts and the
    money are shown side by side.
    """
    _, _, since = _window(days, now) if days else (None, None, None)
    real = real_users(User.objects.all())
    rows = {
        kind: {"kind": kind, "label": label, "month": 0, "year": 0, "once": 0,
               "total": 0, "revenue_satang": 0}
        for kind, label in ORDER_KINDS
    }

    seen = {}
    for user_id, paid_at, code, interval, total in Order.objects.filter(
        status=Order.Status.PAID, user__in=real,
    ).values_list(
        "user_id", "paid_at", "plan__code", "plan__interval", "total_satang",
    # created_at breaks the tie because a manual order is stamped paid when an operator confirms
    # it, which can land out of order against the order it renews.
    ).order_by("paid_at", "created_at"):
        codes = seen.setdefault(user_id, set())
        if not codes:
            kind = "first"
        elif code in codes:
            kind = "renewal"
        else:
            kind = "change"
        codes.add(code)

        if since and (paid_at is None or paid_at < since):
            continue
        row = rows[kind]
        row[interval if interval in INTERVAL_LABELS else Plan.Interval.MONTH] += 1
        row["total"] += 1
        row["revenue_satang"] += total or 0

    return list(rows.values())


def capture_method_rows():
    """How people photographed their face, crossed with which angles they were asked for.

    Two questions that only answer the marketing one together: the device says where the user
    was, and the scan mode says how much work the app asked of them there. Demo scans are
    excluded like everywhere else — nobody photographed anything.

    Everything recorded before the field existed reads as ไม่ระบุ, as does every scan from a
    client that has not shipped the change yet. That is the honest answer, not a gap to backfill.
    """
    methods = dict(Scan.CaptureMethod.choices)
    modes = dict(Scan.ScanMode.choices)
    rows = [
        {
            "method": methods.get(row["capture_method"], "ไม่ระบุ"),
            "mode": modes.get(row["scan_mode"], row["scan_mode"]),
            "scans": row["n"],
        }
        for row in Scan.objects.filter(
            is_demo=False, user__in=real_users(User.objects.all()),
        ).values("capture_method", "scan_mode").annotate(n=Count("pk"))
    ]
    return sorted(rows, key=lambda row: (-row["scans"], row["method"], row["mode"]))


def marketing_report(days=DEFAULT_WINDOW, now=None):
    """Everything on /admin/marketing/, in one pass."""
    days, since_date, since = _window(days, now)
    return {
        "generated_at": now or timezone.now(),
        "window_days": days,
        "windows": WINDOWS,
        "window_start": since_date,
        "visits": visit_totals(days, now),
        "visit_months": visit_rows(now=now),
        "funnel": acquisition_funnel(days, now),
        "sources": attribution_rows("source", days, now),
        "campaigns": attribution_rows("campaign", days, now),
        "intervals": interval_mix(now),
        "order_kinds": order_kind_rows(days, now),
        "capture_methods": capture_method_rows(),
        # None until the first arrival is recorded. The template needs it to say "no data here"
        # about a stretch of the window that predates the counter, rather than draw a zero.
        "visit_tracking_started": (
            Visit.objects.order_by("date").values_list("date", flat=True).first()
        ),
    }
