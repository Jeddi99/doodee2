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

from datetime import timedelta

from django.contrib.auth.models import User
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from .admin import real_users
from .models import (
    ChatMessage, Coupon, DailyActive, Order, Plan, Scan, Subscription,
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
    }
