import logging
import os

import firebase_admin
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from firebase_admin import auth
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .activity import record_activity
from .models import FirebaseAlias, FirebaseIdentity


logger = logging.getLogger(__name__)


# Providers whose sign-in proves the address without us ever sending a confirmation mail. Google
# has already verified it; an email/password account has not, unless Firebase says otherwise.
VERIFIED_PROVIDERS = ("google.com", "apple.com")


def identity_is_verified(token):
    """Whether this token belongs to a confirmed identity.

    DRF puts the decoded token on `request.auth` and nothing has ever read it. It carries exactly
    what requirement.md's "ต้องมีการยืนยันตัวตน" needs — `email_verified`, and which provider
    signed the user in — and without consulting it the verification requirement is a sentence in a
    document rather than a check: an unverified address costs nothing to create, and the referral
    reward behind it is worth ฿30.
    """
    if not isinstance(token, dict):
        return False
    if token.get("email_verified"):
        return True
    provider = ((token.get("firebase") or {}).get("sign_in_provider") or "").lower()
    return provider in VERIFIED_PROVIDERS


def user_for_uid(uid):
    """The account this uid signs in to, or None if the uid has never been seen.

    Two tables, because one person can hold several Firebase uids — see `FirebaseAlias` for why
    the second one exists rather than a ForeignKey on the first.
    """
    identity = FirebaseIdentity.objects.select_related("user").filter(firebase_uid=uid).first()
    if identity:
        return identity.user
    alias = FirebaseAlias.objects.select_related("user").filter(firebase_uid=uid).first()
    return alias.user if alias else None


def account_to_join(token):
    """The existing account a never-seen uid belongs to, or None to create a fresh one.

    Firebase issues a different uid per sign-in provider. The same person, with the same email
    address, signing in once with the Google button and once with a password, arrives as two
    unrelated uids — and before this function existed each of those got its own Django user. The
    money is what makes that serious rather than untidy: scans, subscriptions and plan groups all
    hang off the User row, so a customer who paid on one and signed in through the other was told
    their purchase did not exist.

    **The email is never enough on its own, and this is the thing not to "simplify" away.**
    Matching on address alone turns this function into an account-takeover primitive: an attacker
    registers `victim@example.com` at any provider that never sends a confirmation mail — an
    email/password signup is exactly that — presents the resulting token, and inherits the
    victim's scans, their face photographs, their paid plan and their referral balance. Without a
    proof that the bearer controls the address, "same email" means "typed the same string".

    So the join needs `identity_is_verified(token)`: `email_verified`, or a provider that
    confirmed the address before issuing it. That is deliberately the same predicate the ฿30
    referral reward is gated on rather than a second, private reading of the claim — one
    definition of "confirmed identity" per file, so the two can never drift apart.

    Three further refusals, each closing a way in that verification alone does not:

    * **Never adopt a Django-only account.** The candidate must already sign in through Firebase.
      Otherwise a verified token could attach itself to a `createsuperuser` account that merely
      happens to carry that address, and hand out staff API access.
    * **Never adopt staff.** Belt and braces for the same hole.
    * **Never guess between candidates.** If several accounts share the address — which is exactly
      the damage this function was written to stop creating — picking one would be a coin flip
      over which of them holds the subscription. Refuse, and let
      `manage.py merge_duplicate_accounts` collapse them deliberately instead.

    Disabled accounts are *included* as candidates on purpose. Linking to one and then failing the
    `is_active` check below is the correct answer: signing up again through another provider must
    not be a way around a ban.
    """
    email = (token.get("email") or "").strip()
    if not email or not identity_is_verified(token):
        return None
    candidates = list(
        User.objects.filter(email__iexact=email, is_staff=False, is_superuser=False)
        .filter(firebase_identity__isnull=False)[:2]
    )
    if len(candidates) != 1:
        if candidates:
            logger.warning(
                "firebase uid presented a verified email held by several accounts; "
                "not joining any of them. Run merge_duplicate_accounts for %s", email,
            )
        return None
    return candidates[0]


def _firebase_app():
    try:
        return firebase_admin.get_app("doodee")
    except ValueError:
        return firebase_admin.initialize_app(
            options={"projectId": os.environ["FIREBASE_PROJECT_ID"]},
            name="doodee",
        )


class FirebaseAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = get_authorization_header(request).split()
        if not header:
            return None
        if len(header) != 2 or header[0].lower() != b"bearer":
            raise AuthenticationFailed("Invalid Authorization header")
        from django.conf import settings

        token_str = header[1].decode()
        if settings.DEBUG and token_str == "dev-guest-token":
            user, _ = User.objects.get_or_create(
                username="firebase:dev-guest-uid",
                defaults={"email": "guest@example.com"}
            )
            FirebaseIdentity.objects.get_or_create(user=user, defaults={"firebase_uid": "dev-guest-uid"})
            record_activity(user)
            return user, {
                "uid": "dev-guest-uid", "email": "guest@example.com",
                # Verified, because the development account has to be able to walk the referral
                # path end to end; nothing outside DEBUG can reach this branch.
                "email_verified": True, "firebase": {"sign_in_provider": "password"},
            }

        try:
            token = auth.verify_id_token(token_str, app=_firebase_app())
        except Exception as exc:
            raise AuthenticationFailed("Invalid Firebase token") from exc

        uid = token.get("uid")
        if not uid:
            raise AuthenticationFailed("Firebase token has no uid")
        user = user_for_uid(uid) or self._first_sight(uid, token)
        # Checked once, for every path. A uid joined to a disabled account must be refused the
        # same way a uid that has always belonged to one is.
        if not user.is_active:
            raise AuthenticationFailed("Account is disabled")
        # Stamped here rather than in middleware: DRF authenticates inside the view, so a
        # middleware reading request.user sees AnonymousUser for every app request.
        record_activity(user)
        return user, token

    def _first_sight(self, uid, token):
        """A uid nobody has presented before: join it to its owner's account, or start a new one."""
        owner = account_to_join(token)
        if owner is not None:
            try:
                # Savepointed so a lost race leaves the surrounding transaction usable rather
                # than poisoned, on the deployments that do wrap requests in one.
                with transaction.atomic():
                    FirebaseAlias.objects.create(user=owner, firebase_uid=uid)
            except IntegrityError:
                # Two requests carrying the same new uid raced. The other one won; either way the
                # uid now resolves, so read it back rather than failing a legitimate sign-in.
                return user_for_uid(uid) or owner
            logger.info("joined firebase uid to existing account %s by verified email", owner.pk)
            return owner

        with transaction.atomic():
            user = User.objects.create_user(
                username=f"firebase:{uid}",
                email=token.get("email", ""),
                password=None,
            )
            FirebaseIdentity.objects.create(user=user, firebase_uid=uid)
        return user

