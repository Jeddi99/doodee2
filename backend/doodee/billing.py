"""Prices, coupons and orders. Money is satang, integer, everywhere.

No provider is wired up yet: taking card details needs an Omise merchant account, which needs
a registered company. Until then `Order.Provider.MANUAL` is the whole payment path — the user
transfers, a superuser confirms the order in admin, and `activate()` below grants entitlement.
That is a real, working way to sell, and it is the same function a provider webhook will call,
so adding Omise later is a new caller rather than a second code path through entitlement.
"""

from datetime import timedelta

from django.contrib.auth.models import Group
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Coupon, CouponRedemption, Order, Plan, Subscription


class CouponError(ValueError):
    """Carries a stable machine code, because the client shows a different message for each."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def discount_for(coupon, subtotal_satang):
    """Satang taken off `subtotal_satang`, never more than the subtotal itself.

    Percent discounts floor. A discount larger than the price would otherwise produce a
    negative total, which every downstream integer field would reject in a less obvious place.
    """
    if coupon.discount_type == Coupon.DiscountType.PERCENT:
        raw = subtotal_satang * min(coupon.discount_value, 100) // 100
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
    return coupon


def quote(plan, coupon=None):
    subtotal = plan.price_satang
    discount = discount_for(coupon, subtotal) if coupon else 0
    return {
        "plan": plan.code,
        "subtotal_satang": subtotal,
        "discount_satang": discount,
        "total_satang": subtotal - discount,
        "currency": "THB",
        "coupon": coupon.code if coupon else None,
    }


@transaction.atomic
def create_order(user, plan, coupon_code=None, provider=Order.Provider.MANUAL):
    """A pending order at the price the user was quoted.

    The coupon is re-validated here under the row lock rather than trusted from the preview:
    between the two calls a limited coupon can be spent by somebody else.
    """
    coupon = None
    if coupon_code:
        # Locked for the rest of the transaction so the exhaustion check below cannot be read
        # by two checkouts at once — the classic way a "100 uses" coupon sells 130.
        Coupon.objects.select_for_update().filter(code=str(coupon_code).strip().upper()).first()
        coupon = validate_coupon(coupon_code, plan, user)

    priced = quote(plan, coupon)
    return Order.objects.create(
        user=user,
        plan=plan,
        coupon=coupon,
        subtotal_satang=priced["subtotal_satang"],
        discount_satang=priced["discount_satang"],
        total_satang=priced["total_satang"],
        provider=provider,
    )


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
    return subscription


def sync_entitlement(user, now=None):
    """Take the group back when the last subscription that justified it has run out.

    Applied on read for the same reason `_vip_expires_at` is read at request time: a cron that
    silently stops running would leave every lapsed member entitled indefinitely, and nobody
    would notice, because the failure looks exactly like everything working.
    """
    now = now or timezone.now()
    lapsed = Subscription.objects.filter(
        user=user, status=Subscription.Status.ACTIVE, current_period_end__lte=now,
    )
    if not lapsed.exists():
        return
    for subscription in lapsed.select_related("plan"):
        subscription.status = Subscription.Status.EXPIRED
        subscription.save(update_fields=("status",))
        group_name = subscription.plan.grants_group
        if not group_name:
            continue
        still_entitled = Subscription.objects.filter(
            user=user, plan__grants_group=group_name,
            status=Subscription.Status.ACTIVE, current_period_end__gt=now,
        ).exists()
        if not still_entitled:
            user.groups.remove(*Group.objects.filter(name=group_name))
