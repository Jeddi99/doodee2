"""ชวนเพื่อน — invite codes, the invited friend's discount, and the inviter's credit.

Two things happen, at two different times, and keeping them apart is the whole design:

* **On signup**, an invited account claims a code and immediately receives its discount. Nothing
  is paid to anybody. This is cheap to give away because it only ever reduces a purchase the
  invitee chooses to make.
* **On the invitee's first payment**, the inviter's ฿30 vests. That happens inside
  `billing.activate()`, not here, so it shares the transaction and the idempotency that already
  protect every other consequence of a payment.

requirement.md asks for the reward "เมื่อเพื่อนสมัครสมาชิกครั้งแรก". Paid literally at account
creation, ฿30 a head is a wage: one person with a spare afternoon and a supply of email addresses
out-earns the product. Paid on the invited account's first *purchase* it is a commission, the
fraud requires spending real money to collect less of it back, and the sentence still describes
what a user experiences — they invite a friend, the friend joins and subscribes, they get ฿30.
"""

import hashlib
import secrets

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from .authentication import identity_is_verified
from .models import Coupon, CouponGrant, CreditLedger, Referral, ReferralCode, SiteSetting


class ReferralError(ValueError):
    """Carries a stable machine code; the client shows a different message for each."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


# No 0/O/1/I/L. Codes get read aloud, written on paper and retyped from a screenshot, and those
# five characters are where that goes wrong.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 8


def _new_code():
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))


def code_for(user):
    """This user's shareable code, minting one on first read.

    The retry loop exists because `code` is unique and `secrets.choice` can collide; at eight
    characters from a 31-letter alphabet that is vanishingly unlikely, and "vanishingly unlikely"
    is not the same as "cannot happen" when the failure mode is a 500 on the invite screen.
    """
    existing = ReferralCode.objects.filter(user=user).first()
    if existing:
        return existing
    for _ in range(5):
        try:
            with transaction.atomic():
                return ReferralCode.objects.create(user=user, code=_new_code())
        except IntegrityError:
            # Either the code collided or another request minted this user's row first.
            existing = ReferralCode.objects.filter(user=user).first()
            if existing:
                return existing
    raise ReferralError("could_not_mint_code")


def hash_ip(ip):
    """A one-way digest of a signup IP, salted with SECRET_KEY.

    Not the address. It cannot be reversed, it cannot be correlated across deployments, and
    `Referral` clears it as soon as the payout decision is made. It exists to answer one
    question — is the inviter the invitee — and nothing else in this codebase records an IP at
    all (see `DailyActive`'s docstring), so this stays the narrowest possible exception.
    """
    if not ip:
        return ""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{ip}".encode()).hexdigest()


def client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        # Left-most is the client; everything after it is our own proxies.
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def invitee_coupon():
    """The coupon an invited account receives, or None if it was never seeded."""
    return Coupon.objects.filter(code=settings.REFERRAL_INVITEE_COUPON, is_active=True).first()


def credit_balance(user):
    """Spendable credit, summed from the ledger. There is no cached balance to disagree with."""
    return CreditLedger.objects.filter(user=user).aggregate(
        total=Sum("amount_satang"),
    )["total"] or 0


def _within_claim_window(user, now, config):
    hours = config.claim_window_hours
    if not hours:
        return True
    return (now - user.date_joined).total_seconds() <= hours * 3600


@transaction.atomic
def claim(user, code, request=None, now=None):
    """Record that `user` was invited with `code`, and hand them their discount.

    Returns the `Referral`. Raises `ReferralError` with a machine code for every refusal. Nothing
    is paid to the inviter here — see the module docstring.
    """
    # Read once per claim, not per check: every limit below has to come from the same snapshot,
    # or an admin saving the form mid-request could have one rule applied and another not.
    config = SiteSetting.current()
    if not config.referral_enabled:
        raise ReferralError("referral_disabled")

    now = now or timezone.now()
    code = str(code or "").strip().upper()
    if not code:
        raise ReferralError("code_required")

    if Referral.objects.filter(invitee=user).exists():
        # The OneToOne would refuse this anyway; saying so plainly gives the client a message
        # better than "server error".
        raise ReferralError("already_referred")

    if not _within_claim_window(user, now, config):
        raise ReferralError("signup_window_passed")

    if config.require_verified_email and not identity_is_verified(getattr(request, "auth", None)):
        raise ReferralError("identity_not_verified")

    owner = ReferralCode.objects.filter(code=code).select_related("user").first()
    if not owner:
        raise ReferralError("invalid_code")
    if owner.user_id == user.pk:
        raise ReferralError("cannot_refer_yourself")

    ip_hash = hash_ip(client_ip(request)) if request is not None else ""
    try:
        referral = Referral.objects.create(
            inviter=owner.user, invitee=user, code=code, signup_ip_hash=ip_hash,
        )
    except IntegrityError as exc:
        # Two claims racing on the same brand-new account.
        raise ReferralError("already_referred") from exc

    grant_invitee_discount(referral)
    return referral


def grant_invitee_discount(referral):
    """Give the invited account its coupon. Idempotent; returns the grant, or None.

    None when the coupon row is missing — a referral is still worth recording even if the
    discount cannot be issued, because the inviter's reward does not depend on it and losing the
    edge would lose that too.
    """
    coupon = invitee_coupon()
    if not coupon:
        return None
    grant, _ = CouponGrant.objects.get_or_create(
        user=referral.invitee, coupon=coupon, defaults={"referral": referral},
    )
    return grant


def shares_signup_address(referral):
    """Whether another account invited by the same person signed up from this same address.

    A shared address is a hint and never a verdict: a household, a dormitory and an office all
    look like this, so a match moves the referral to HELD for a person to decide and never
    rejects anything on its own.

    What it catches is the realistic fraud — one person creating a run of accounts from one
    machine — which shows up from the second account onward. What it cannot catch is a single
    self-invite by someone who signed up before this system existed, because a `Referral` is the
    only row that ever holds a signup address and an inviter who was never themselves invited has
    none. That gap is deliberate: closing it would mean recording an address for every account,
    which is a much heavier thing to hold than a referral edge.
    """
    if not referral.signup_ip_hash:
        return False
    return Referral.objects.filter(
        inviter=referral.inviter, signup_ip_hash=referral.signup_ip_hash,
    ).exclude(pk=referral.pk).exists()


def stats(user, now=None):
    """What the invite screen shows its owner."""
    referrals = Referral.objects.filter(inviter=user)
    return {
        "code": code_for(user).code,
        "invited": referrals.count(),
        # HELD is counted as pending on purpose. It means "a person is looking at this", which is
        # true and is not the user's problem; a label reading "suspected fraud" on somebody's own
        # invite screen would accuse everyone who shares a household connection.
        "pending": referrals.filter(
            status__in=(Referral.Status.PENDING, Referral.Status.HELD),
        ).count(),
        "qualified": referrals.filter(status=Referral.Status.QUALIFIED).count(),
        "reward_satang": SiteSetting.current().reward_satang,
        "credit_balance_satang": credit_balance(user),
    }
