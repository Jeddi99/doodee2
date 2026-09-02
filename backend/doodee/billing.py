"""Prices, coupons and orders. Money is satang, integer, everywhere.

No provider is wired up yet: taking card details needs an Omise merchant account, which needs
a registered company. Until then `Order.Provider.MANUAL` is the whole payment path — the user
transfers, a superuser confirms the order in admin, and `activate()` below grants entitlement.
That is a real, working way to sell, and it is the same function a provider webhook will call,
so adding Omise later is a new caller rather than a second code path through entitlement.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import Group
from django.db import models, transaction
from django.db.models import F, Sum
from django.utils import timezone

from .models import (
    Coupon, CouponGrant, CouponRedemption, CreditLedger, Notification, Order, Plan, Referral,
    SiteSetting, Subscription,
)


class CouponError(ValueError):
    """Carries a stable machine code, because the client shows a different message for each."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code



def discount_for(coupon, subtotal_satang):
    """Satang taken off `subtotal_satang`, never more than the subtotal itself.

    Percent discounts floor. A discount larger than the price would otherwise produce a
    negative total, which every downstream integer field would reject in a less obvious place.

    `max_discount_satang` caps the percentage branch only. It is what makes the referral
    discount — "10% แต่ไม่เกิน ฿100" — expressible: uncapped, 10% of the ฿4,990 yearly plan is
    ฿499, five times what was offered.
    """
    if coupon.discount_type == Coupon.DiscountType.PERCENT:
        raw = subtotal_satang * min(coupon.discount_value, 100) // 100
        if coupon.max_discount_satang:
            raw = min(raw, coupon.max_discount_satang)
    else:
        raw = coupon.discount_value
    return min(raw, subtotal_satang)


def validate_coupon(code, plan, user, now=None):
    """The coupon, or CouponError. Reads only — nothing is consumed here.

    Called both by the validate endpoint (so the user sees the price before committing) and
    again inside `create_order`, because anything checked at preview time can expire, sell out
    or be switched off between the preview and the purchase.
    """
    now = now or timezone.now()
    coupon = Coupon.objects.filter(code=str(code).strip().upper(), is_active=True).first()
    if not coupon:
        # A disabled coupon and one that never existed answer identically, so the endpoint
        # cannot be used to enumerate live codes.
        raise CouponError("invalid_coupon")
    if coupon.valid_from and now < coupon.valid_from:
        raise CouponError("coupon_not_started")
    if coupon.valid_until and now > coupon.valid_until:
        raise CouponError("coupon_expired")
    if coupon.max_uses and coupon.used_count >= coupon.max_uses:
        raise CouponError("coupon_exhausted")
    if plan.price_satang < coupon.min_amount_satang:
        raise CouponError("coupon_minimum_not_met")
    # An empty applies_to_plans means every plan, so the filter only runs when it is set.
    if coupon.applies_to_plans.exists() and not coupon.applies_to_plans.filter(pk=plan.pk).exists():
        raise CouponError("coupon_not_valid_for_plan")
    if coupon.once_per_user and CouponRedemption.objects.filter(user=user, coupon=coupon).exists():
        raise CouponError("coupon_already_used")
    if coupon.requires_grant and not unused_grant(user, coupon, now):
        # Answers "invalid_coupon", the same as a code that does not exist. A distinct error here
        # would confirm to anyone who saw a friend's screen that the code is real and that they
        # merely lack permission — which is exactly the fact the grant is hiding.
        raise CouponError("invalid_coupon")
    return coupon


def unused_grant(user, coupon, now=None):
    """This user's unspent permission to use `coupon`, or None."""
    now = now or timezone.now()
    return CouponGrant.objects.filter(
        user=user, coupon=coupon, used_order__isnull=True,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now),
    ).first()


def credit_balance(user):
    """Spendable credit, summed from the ledger rows. Never a cached column."""
    return CreditLedger.objects.filter(user=user).aggregate(
        total=Sum("amount_satang"),
    )["total"] or 0


def quote(plan, coupon=None, credit_satang=0):
    """The price breakdown. Credit comes off after the coupon, never before.

    Order matters and this is the cheaper order for the customer: a percentage applies to the
    full list price rather than to the remainder after credit, so ten baht of credit does not
    quietly shrink a 10% discount.
    """
    subtotal = plan.price_satang
    discount = discount_for(coupon, subtotal) if coupon else 0
    credit = max(0, min(credit_satang, subtotal - discount))
    return {
        "plan": plan.code,
        "subtotal_satang": subtotal,
        "discount_satang": discount,
        "credit_satang": credit,
        "total_satang": subtotal - discount - credit,
        "currency": "THB",
        "coupon": coupon.code if coupon else None,
    }


@transaction.atomic
def create_order(user, plan, coupon_code=None, provider=Order.Provider.MANUAL, use_credit=False):
    """A pending order at the price the user was quoted.

    The coupon is re-validated here under the row lock rather than trusted from the preview:
    between the two calls a limited coupon can be spent by somebody else.

    Credit is only *earmarked* here. The matching negative ledger row is written by `activate()`,
    for the same reason `CouponRedemption` is written there — an abandoned checkout must not
    spend anything. The consequence to know about is that two pending orders can each earmark the
    same balance; whichever is paid first spends it, and `activate()` re-reads the real balance
    rather than trusting the number on the order.
    """
    coupon = None
    if coupon_code:
        # Locked for the rest of the transaction so the exhaustion check below cannot be read
        # by two checkouts at once — the classic way a "100 uses" coupon sells 130.
        Coupon.objects.select_for_update().filter(code=str(coupon_code).strip().upper()).first()
        coupon = validate_coupon(coupon_code, plan, user)

    priced = quote(plan, coupon, credit_balance(user) if use_credit else 0)
    order = Order.objects.create(
        user=user,
        plan=plan,
        coupon=coupon,
        subtotal_satang=priced["subtotal_satang"],
        discount_satang=priced["discount_satang"],
        credit_satang=priced["credit_satang"],
        total_satang=priced["total_satang"],
        provider=provider,
    )
    if order.total_satang == 0:
        # Nothing left for a provider to collect. Left pending it would be an order waiting on a
        # payment that can never arrive, and the user would have spent credit for nothing.
        activate(order)
        order.refresh_from_db()
    return order


def _period_end(plan, start):
    if plan.interval == Plan.Interval.YEAR:
        return start + timedelta(days=365)
    if plan.interval == Plan.Interval.ONCE:
        # A one-off purchase still needs an end date, or `_user_plan` would have nothing to
        # expire. A century is "does not expire" without a nullable column to special-case.
        return start + timedelta(days=36500)
    return start + timedelta(days=30)


@transaction.atomic
def activate(order, charge_id="", now=None):
    """Mark an order paid and grant what it bought. Idempotent.

    Idempotence is the whole point: providers retry webhooks, and a superuser can double-click
    Confirm. A second call on an already-paid order returns the existing subscription without
    extending the period or spending the coupon twice.
    """
    now = now or timezone.now()
    # Re-read under a lock — two webhook deliveries can arrive concurrently.
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status == Order.Status.PAID:
        return order.subscriptions.order_by("-current_period_end").first()

    order.status = Order.Status.PAID
    order.paid_at = now
    if charge_id:
        order.provider_charge_id = charge_id
    order.save(update_fields=("status", "paid_at", "provider_charge_id"))

    if order.coupon_id:
        # F() rather than read-modify-write: the increment happens in the database, so two
        # activations racing cannot both read the same count.
        Coupon.objects.filter(pk=order.coupon_id).update(used_count=F("used_count") + 1)
        CouponRedemption.objects.create(user=order.user, coupon=order.coupon, order=order)
        # Marks a per-account grant as spent, so a referral discount cannot be used twice.
        grant = unused_grant(order.user, order.coupon, now)
        if grant:
            grant.used_order = order
            grant.save(update_fields=("used_order",))

    _spend_credit(order, now)

    plan = order.plan
    # Renewing extends from whichever is later: an early renewal must not throw away the time
    # already paid for, and a lapsed one must not be backdated.
    existing = Subscription.objects.filter(
        user=order.user, plan=plan, status=Subscription.Status.ACTIVE, current_period_end__gt=now,
    ).order_by("-current_period_end").first()
    start = existing.current_period_end if existing else now
    subscription = Subscription.objects.create(
        user=order.user, plan=plan, order=order, current_period_end=_period_end(plan, start),
    )
    if existing:
        existing.status = Subscription.Status.EXPIRED
        existing.save(update_fields=("status",))

    if plan.grants_group:
        group, _ = Group.objects.get_or_create(name=plan.grants_group)
        order.user.groups.add(group)

    vest_referral_reward(order, now)
    # Tell them. `Notification.Kind.ORDER_PAID` has existed since the model was written and
    # nothing ever sent it, so a customer who transferred money and waited for a human to confirm
    # it was told nothing at all — they had to keep reopening the app to find out whether it had
    # worked. On the manual-transfer path that wait is the entire product experience of paying.
    #
    # Deduped on the order, so a retried webhook or a double-clicked Confirm cannot send it twice.
    # Imported here rather than at module scope, for the reason `vest_referral_reward` gives:
    # `notifications` reaches back into this module.
    from .notifications import notify

    notify(
        order.user,
        kind=Notification.Kind.ORDER_PAID,
        title="เปิดสิทธิ์เรียบร้อยแล้ว",
        body=f"ยืนยันการชำระเงิน ฿{order.total_satang / 100:,.0f} แล้ว "
             f"แพ็กเกจ {plan.name_th} ใช้ได้ถึง {subscription.current_period_end:%d/%m/%Y}",
        dedupe_key=f"order:{order.pk}",
        payload={"order_id": str(order.pk), "plan": plan.code},
    )
    return subscription


def _spend_credit(order, now):
    """Write the negative ledger row for credit this order earmarked.

    The balance is re-read here rather than trusted from `order.credit_satang`: two pending
    orders can each have earmarked the same credit, and only the first one paid may actually
    spend it. Whatever the order claimed, this never takes more than the account holds.
    """
    if not order.credit_satang:
        return
    spendable = min(order.credit_satang, credit_balance(order.user))
    if spendable <= 0:
        # The credit went to another order first. The user still owes `total_satang`, which they
        # have already paid, so the order stands — they simply got the discount from elsewhere.
        return
    CreditLedger.objects.create(
        user=order.user, amount_satang=-spendable, kind=CreditLedger.Kind.ORDER_SPEND, order=order,
    )


def _is_first_paid_order(user, order):
    return not Order.objects.filter(
        user=user, status=Order.Status.PAID,
    ).exclude(pk=order.pk).exists()


def vest_referral_reward(order, now=None):
    """Pay the inviter, if this payment is the one that earns it. Returns the Referral or None.

    Called from inside `activate()`'s transaction, and that placement is the entire idempotency
    story. `activate()` returns early on an order already marked paid, and the referral row moves
    out of PENDING here, so a replayed Omise webhook or a double-clicked Confirm button cannot
    pay twice. There is no separate lock, counter or "already rewarded" flag to keep in step.

    Only the invited account's *first* paid order counts. Without that, someone could invite a
    friend who genuinely subscribes and collect ฿30 again on every renewal for as long as they
    stayed.
    """
    config = SiteSetting.current()
    if not config.referral_enabled:
        return None
    now = now or timezone.now()

    from .referral import shares_signup_address

    referral = Referral.objects.select_for_update().filter(
        invitee=order.user, status=Referral.Status.PENDING,
    ).first()
    if not referral or not _is_first_paid_order(order.user, order):
        return None

    from .notifications import notify

    cap = config.max_qualified_per_month
    over_cap = bool(cap) and _qualified_this_month(referral.inviter, now) >= cap
    if over_cap or shares_signup_address(referral):
        # Held, not rejected and not quietly dropped. A genuinely popular inviter should be
        # reviewed and released; a household sharing one connection is not fraud. What must not
        # happen is money leaving on nobody's decision.
        referral.status = Referral.Status.HELD
        referral.qualifying_order = order
        referral.note = "เกินเพดานรางวัลต่อเดือน" if over_cap else "สมัครจากที่อยู่เดียวกับคนอื่นที่ชวนไว้"
        referral.save(update_fields=("status", "qualifying_order", "note"))
        return referral

    referral.status = Referral.Status.QUALIFIED
    referral.qualifying_order = order
    referral.qualified_at = now
    # The signup address existed to answer one question and it has been answered. Holding it
    # after that would be keeping a location trace for no remaining purpose.
    referral.signup_ip_hash = ""
    referral.save(update_fields=("status", "qualifying_order", "qualified_at", "signup_ip_hash"))

    # The amount is read now and written onto the row. Raising the reward tomorrow changes what
    # future referrals pay and rewrites nothing already paid — the ledger is the record of what
    # was actually promised, not a view over the current setting.
    reward = config.reward_satang
    CreditLedger.objects.create(
        user=referral.inviter,
        amount_satang=reward,
        kind=CreditLedger.Kind.REFERRAL_REWARD,
        referral=referral,
    )
    notify(
        referral.inviter,
        kind="referral_reward",
        title="ได้รับเครดิตจากการชวนเพื่อน",
        body=f"เพื่อนที่คุณชวนสมัครสมาชิกแล้ว คุณได้รับเครดิต ฿{reward / 100:,.0f}",
        dedupe_key=f"referral:{referral.pk}",
        payload={"referral_id": referral.pk},
    )
    return referral


def _qualified_this_month(inviter, now):
    """Rewards already vested for this inviter this calendar month.

    Lives here rather than in referral.py because the cap it feeds is a decision about paying
    money, and that decision belongs beside `activate()` with everything else a payment causes.
    """
    return Referral.objects.filter(
        inviter=inviter, status=Referral.Status.QUALIFIED,
        qualified_at__year=now.year, qualified_at__month=now.month,
    ).count()


@transaction.atomic
def claw_back(referral, note=""):
    """Reverse a vested reward with a new negative row. Never edits or deletes the original.

    The history of a payout dispute is the only thing that can settle it, so both rows stay.
    """
    if referral.status != Referral.Status.QUALIFIED:
        return None
    paid = CreditLedger.objects.filter(
        referral=referral, kind=CreditLedger.Kind.REFERRAL_REWARD,
    ).aggregate(total=Sum("amount_satang"))["total"] or 0
    referral.status = Referral.Status.CLAWED_BACK
    referral.note = note or referral.note
    referral.save(update_fields=("status", "note"))
    if not paid:
        return None
    return CreditLedger.objects.create(
        user=referral.inviter, amount_satang=-paid, kind=CreditLedger.Kind.CLAWBACK,
        referral=referral, note=note,
    )


def sync_entitlement(user, now=None):
    """Mark run-out subscriptions expired, and take the group back once grace is over too.

    Applied on read for the same reason `_vip_expires_at` is read at request time: a cron that
    silently stops running would leave every lapsed member entitled indefinitely, and nobody
    would notice, because the failure looks exactly like everything working.

    Two different moments, deliberately. The row flips to EXPIRED the instant the paid period
    ends, so every report and every renewal reminder tells the truth about it. The group comes
    off `SUBSCRIPTION_GRACE_DAYS` later, so somebody whose bank transfer cleared on Monday is
    still a customer on Monday. `entitlement._subscribed` applies the same window to the date,
    which is why access survives even between those two moments.
    """
    now = now or timezone.now()
    grace = timedelta(days=SiteSetting.current().subscription_grace_days)
    lapsed = Subscription.objects.filter(
        user=user, status=Subscription.Status.ACTIVE, current_period_end__lte=now,
    )
    for subscription in lapsed.select_related("plan"):
        subscription.status = Subscription.Status.EXPIRED
        subscription.save(update_fields=("status",))

    # Recomputed across every subscription rather than only the ones just expired: a group has to
    # survive while *any* row still justifies it, including one that lapsed an hour ago and is
    # inside its grace window.
    for group_name in set(
        Subscription.objects.filter(user=user)
        .exclude(plan__grants_group="")
        .values_list("plan__grants_group", flat=True)
    ):
        still_entitled = Subscription.objects.filter(
            user=user, plan__grants_group=group_name, current_period_end__gt=now - grace,
        ).exclude(status=Subscription.Status.CANCELLED).exists()
        if not still_entitled:
            user.groups.remove(*Group.objects.filter(name=group_name))
