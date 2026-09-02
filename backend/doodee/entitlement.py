"""What a user is allowed to do, and how much of it is left.

One module because the answer was previously spread across four literal `3`s in views.py, two
columns on ChatSetting, and a group-name ladder in `_user_plan()`. Three tiers with three
different allowances cannot be expressed that way, and a limit that is written down twice is a
limit that will disagree with itself.

Two questions live here and they are deliberately separate functions:

* `current_plan()` — which `Plan` row's *allowances* apply. Always a real, saved row where one
  exists, because quotas are the thing money buys and they must be readable in the admin.
* `plan_code()` — the *label*. Returns "vip" for someone holding only a redeemed PromoCode, which
  is the vocabulary the API and the client have always used and which no Plan row can carry: `vip`
  is deliberately absent from the price list (see migration 0011) because there is no way to buy it.

Entitlement is resolved on read, never by a scheduled job — same reason `billing.sync_entitlement`
and `_vip_expires_at` are: a cron that quietly stops running leaves paid access switched on for
everybody, forever, and the failure looks exactly like everything working.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import (
    ChatUsage, Plan, PromoRedemption, Simulation, SimulationPreviewUsage, SiteSetting, Subscription,
)


# Quota keys. Strings rather than an enum so a `session` payload key, a `Plan` column and a call
# site all read the same word.
PREVIEWS = "simulation_previews_per_month"
SAVES = "simulation_saves_per_month"
CHAT_TURNS = "chat_turns_per_month"


def _grace():
    """The grace window, read fresh so an admin edit applies to the next request."""
    return timedelta(days=SiteSetting.current().subscription_grace_days)


def _free_plan():
    """The `free` row, or an unsaved stand-in with the same defaults.

    The stand-in matters on a database migrated but not yet seeded, and in tests that build a
    user without touching plans: every caller here dereferences the result, so returning None
    would turn a missing seed row into a 500 on the session endpoint.
    """
    plan = Plan.objects.filter(code="free").first()
    if plan:
        return plan
    return Plan(
        code="free", name_th="ฟรี", name_en="Free", price_satang=0,
        analysis_depth=Plan.AnalysisDepth.PARTIAL, tier_rank=0,
        # Spelled out rather than left to the column default, which is 0 — the safe default for a
        # brand new plan row an operator has not filled in yet, and the wrong answer for this
        # one. Since migration 0041 the seeded free row grants three previews so that the three
        # saves it also grants can be reached, and a stand-in that disagreed would lock
        # simulation on exactly the databases where nobody is watching: unseeded ones.
        simulation_previews_per_month=3,
    )


def promo_expires_at(user, now=None):
    """When the current redeemed-code entitlement runs out, or None."""
    latest = PromoRedemption.objects.filter(
        user=user, expires_at__gt=now or timezone.now(),
    ).order_by("-expires_at").first()
    return latest.expires_at if latest else None


def _live_subscriptions(user, now):
    """The subscription rows that still entitle this user.

    Status is deliberately NOT filtered on ACTIVE. `sync_entitlement` flips a lapsed row to
    EXPIRED the moment the period ends — which is correct, because every report should show it as
    lapsed — so filtering on ACTIVE here would make the grace window unreachable dead code: the
    status would always have moved before this ran. The date is the authority, and the grace window
    is added to it. CANCELLED is excluded because that is a decision, not a lapse.
    """
    return Subscription.objects.filter(
        user=user, current_period_end__gt=now - _grace(),
    ).exclude(status=Subscription.Status.CANCELLED).select_related("plan")


def current_subscription(user, now=None):
    """The row behind `current_plan()`, or None.

    None is a real answer, not a failure: an account an admin granted a group to by hand has full
    entitlement and no subscription at all, so it has no renewal date and nothing to show for one.
    Every caller has to handle that rather than assume a date exists.

    Matched on the plan `current_plan()` picked, so the date shown is the date for the plan the
    user is actually on when they hold more than one.
    """
    now = now or timezone.now()
    plan = current_plan(user, now)
    return _live_subscriptions(user, now).filter(
        plan=plan,
    ).order_by("-current_period_end").first()


def _subscribed(user, now):
    """Plans this user holds a live subscription to."""
    return [subscription.plan for subscription in _live_subscriptions(user, now)]


def _granted_by_group(user, exclude_groups=()):
    """Plans claimed only by group membership, one per group.

    This route exists for accounts an admin granted by hand: `UserAdmin.grant_member` adds the
    group and writes no Subscription, so ignoring groups here would silently revoke every
    hand-granted account.

    Two plans can name the same group, and both cases are real: `plus` and `plus_year` both grant
    `plus_member`, and the retired `member` tier shares `pro_member` with `pro`. A bare group
    lookup therefore cannot say *which* plan, so the cheapest is taken — a hand-granted group is
    the base tier, not the yearly upsell.

    Cheapest *among the plans still on sale*, though, which is the part that used to be missing.
    `member` is ฿149 and retired; `pro` is ฿799 and current; both grant `pro_member`. Taking the
    cheapest of all of them meant every account an admin put on โปร was silently served the
    retired ฿149 tier instead — three saved simulations a month and 300 chat turns rather than
    the unlimited both are on Pro — while the badge in the app read "Member". Nobody can buy
    `member` any more, so it cannot be what granting that group now means.

    A retired plan is still the answer when no live plan grants the group at all: someone who
    bought a tier before it was withdrawn keeps what they bought, because the alternative is
    revoking paid access as a side effect of a price-list change.

    `exclude_groups` drops groups a subscription already accounts for, so the precise plan named
    by a payment always wins over the guess this function has to make.
    """
    groups = set(user.groups.values_list("name", flat=True)) - set(exclude_groups)
    if not groups:
        return []
    # `-is_active` first, so a live plan is picked over a retired one at any price, and only a
    # group with nothing live falls through to what it used to sell.
    ordered = Plan.objects.filter(grants_group__in=groups).exclude(
        grants_group="",
    ).order_by("-is_active", "price_satang")
    cheapest = {}
    for plan in ordered:
        cheapest.setdefault(plan.grants_group, plan)
    return list(cheapest.values())


def _bought_or_granted(user, now):
    """Every plan claimed by a purchase or by an admin's hand. Excludes the promo route."""
    subscribed = _subscribed(user, now)
    covered = {plan.grants_group for plan in subscribed if plan.grants_group}
    return [*subscribed, *_granted_by_group(user, exclude_groups=covered)]


def _candidates(user, now):
    """Every plan this user has a claim on, including a redeemed promo code."""
    plans = _bought_or_granted(user, now)
    if promo_expires_at(user, now):
        promo_plan = Plan.objects.filter(code=settings.PROMO_GRANTS_PLAN).first()
        if promo_plan:
            plans.append(promo_plan)
    return plans


def _best(plans):
    return max(plans, key=lambda plan: (plan.tier_rank, plan.price_satang))


def current_plan(user, now=None):
    """The plan whose allowances apply. Never None.

    When a user holds several at once — a leftover monthly plus a new yearly, or a promo code on
    top of a purchase — the highest `tier_rank` wins. Highest rather than newest: someone who
    redeems a trial code while paying for Pro must not be quietly demoted to the trial.
    """
    now = now or timezone.now()
    candidates = _candidates(user, now)
    return _best(candidates) if candidates else _free_plan()


def plan_code(user, now=None):
    """The label the API has always used: free / vip / plus / pro, and `member` for the people
    still holding the retired ฿149 tier. (`clinic` was one of these until migration 0041 removed
    a row nobody had ever bought.)

    "vip" is not a Plan code and cannot be: it is granted by a redeemed PromoCode and is
    deliberately off the price list (migration 0011 explains why). So it is reported here only
    when a promo is the *one* thing the user holds — a redeemed code must never demote somebody
    who actually pays, which is why the bought-or-granted routes are checked first.
    """
    now = now or timezone.now()
    bought = _bought_or_granted(user, now)
    if bought:
        return _best(bought).code
    return "vip" if promo_expires_at(user, now) else "free"


# ---------------------------------------------------------------- quotas


def quota(user, key, plan=None):
    """The ceiling for `key` this month, or None for no ceiling.

    None rather than a large number: every caller has to render "unlimited" differently from
    "999 left", and a sentinel that leaks into a UI as a number is how a plan advertised as
    unlimited ends up showing a countdown.
    """
    plan = plan or current_plan(user)
    value = getattr(plan, key)
    return None if value == Plan.UNLIMITED else value


def _period():
    return timezone.localdate().replace(day=1)


def used(user, key):
    """How much of `key` this user has spent in the current calendar month."""
    if key == PREVIEWS:
        row = SimulationPreviewUsage.objects.filter(user=user, period=_period()).first()
        return row.count if row else 0
    if key == CHAT_TURNS:
        row = ChatUsage.objects.filter(user=user, period=_period()).first()
        return row.count if row else 0
    if key == SAVES:
        now = timezone.now()
        # Counted off the Simulation rows themselves rather than a usage counter, because that is
        # what the old check in SimulationViewSet.create did and the two must not disagree.
        #
        # `kind=SAVED` is what makes this the save quota rather than a count of everything the
        # renderer has ever been asked to do. A preview writes a Simulation row too, so without
        # this filter every image the user merely looked at spent one of the saves they never
        # pressed — on the free plan, three previews and there were no saves left. Previews have
        # their own meter, `SimulationPreviewUsage` above, and the two must not be the same one.
        #
        # FAILED is excluded, and that exclusion *is* the refund for a save. Nothing hands a save
        # back when a render crashes — `tasks.process_simulation` restores the preview counter and
        # only the preview counter — so a failed row that still counted here would charge the user
        # for an image they never received.
        return Simulation.objects.filter(
            scan__user=user, kind=Simulation.Kind.SAVED,
            created_at__year=now.year, created_at__month=now.month,
        ).exclude(status=Simulation.Status.FAILED).count()
    raise ValueError(f"unknown quota key: {key}")


def remaining(user, key, plan=None):
    """How many are left, or None when the plan has no ceiling."""
    limit = quota(user, key, plan)
    if limit is None:
        return None
    return max(0, limit - used(user, key))


def allows(user, key, plan=None):
    """Whether one more is permitted right now."""
    limit = quota(user, key, plan)
    return limit is None or used(user, key) < limit
