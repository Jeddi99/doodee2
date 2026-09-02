"""Collapse the duplicate accounts one person already has, one email address at a time.

`FirebaseAuthentication` used to mint a brand-new Django user for every unseen Firebase uid, and
Firebase issues a different uid per sign-in provider. So one person who used the Google button
once and a password once ended up with two accounts holding the same email — and everything that
matters hangs off the User row: scans, orders, subscriptions, the `pro_member` group, the referral
balance. The symptom is a customer being told the plan they paid for does not exist.

`authentication.account_to_join` stops new splits happening. This repairs the ones already there.

Dry run unless `--apply` is passed, and the dry run is not a separate code path: the real merge
runs inside a transaction that is rolled back at the end, so what it prints is exactly what would
happen rather than a second implementation's guess at it.

    manage.py merge_duplicate_accounts                    # every duplicated address, no writes
    manage.py merge_duplicate_accounts --email a@b.c      # just this one
    manage.py merge_duplicate_accounts --email a@b.c --into 28 --apply

The list of things to move is read from `User._meta.related_objects` rather than written out here.
A hand-written list goes stale the day someone adds a model, and stale here means a row still
pointing at a user that is about to be deleted — which for the CASCADE relations, and most of them
are CASCADE, means the row quietly disappears. So the merged-away User is only deleted after the
same introspection confirms it owns nothing at all.
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.db.models.functions import Lower

from doodee.entitlement import current_plan, plan_code
from doodee.models import FirebaseAlias, FirebaseIdentity


class _Rollback(Exception):
    """Raised at the end of a dry run to undo everything the merge just did."""


def _drop_loser(row, survivor, field):
    """The survivor already holds this row and the database will not take a second.

    Only used where a duplicate genuinely carries no information: the same person marked active on
    the same day, a notification whose dedupe key already says "told them", an AI charge already
    settled under the same idempotency key, a coupon that grants once by design.
    """
    row.delete()
    return "dropped, the survivor already has it"


def _sum_count(row, survivor, field):
    """Quota counters for the same month. Add them up — the person used both."""
    twin = type(row).objects.get(**{field: survivor, "period": row.period})
    twin.count += row.count
    twin.save(update_fields=("count",))
    row.delete()
    return f"added its count of {row.count} to the survivor's {row.period:%Y-%m} row"


def _keep_survivors_own(row, survivor, field):
    """One-per-account rows where the survivor's copy is the one to keep.

    The loser's referral code dies with it, which is the one lossy step in this command: a code
    already shared somewhere public stops resolving. Past referrals are unaffected — `Referral`
    rows move with the inviter — and there is no alternative, because the column is unique and
    an account cannot hold two.
    """
    detail = getattr(row, "code", None) or row.pk
    row.delete()
    return f"discarded ({detail}); the survivor's own is kept"


# What to do when re-pointing a row at the survivor violates a unique constraint. Keyed by
# "<model label>.<field>", because `Referral` reaches User twice and only `invitee` can collide.
# A relation missing from this table aborts the merge rather than guessing — losing a row quietly
# is the failure this whole command exists to undo.
CONFLICT_POLICY = {
    "doodee.DailyActive.user": _drop_loser,
    "doodee.Notification.user": _drop_loser,
    "doodee.AIUsageLedger.user": _drop_loser,
    "doodee.CouponGrant.user": _drop_loser,
    "doodee.ChatUsage.user": _sum_count,
    "doodee.SimulationPreviewUsage.user": _sum_count,
    "doodee.ReferralCode.user": _keep_survivors_own,
    "doodee.UserAttribution.user": _keep_survivors_own,
    "doodee.PayoutAccount.user": _keep_survivors_own,
    "doodee.Referral.invitee": _keep_survivors_own,
}


def duplicate_emails():
    """Every address held by more than one account, ignoring the accounts with no address.

    The blank filter is not tidiness. `User.email` defaults to `""`, so without it every account
    that ever signed in with a phone number or an Apple private relay would be grouped together
    and merged into one person.
    """
    return (
        User.objects.exclude(email="")
        # Case-insensitively, because `account_to_join` matches that way. Grouping on the raw
        # column would report Bob@x.com and bob@x.com as two tidy accounts while authentication
        # sees one ambiguous address and refuses to link either.
        .annotate(key=Lower("email"))
        .values("key")
        .annotate(n=Count("id"))
        .filter(n__gt=1)
        .order_by("key")
        .values_list("key", flat=True)
    )


def rank(user):
    """How strong a claim this account has to be the one that survives. Bigger wins.

    Entitlement first, because that is the thing the split destroys and the thing a customer
    notices. Then evidence of use, then age — a tie broken by anything random would make the
    command's output depend on row order.
    """
    return (
        current_plan(user).tier_rank,
        user.orders.count(),
        user.subscriptions.count(),
        user.scans.count(),
        -user.pk,
    )


class Command(BaseCommand):
    help = "Merge accounts that share an email address into one, preserving every related row"

    def add_arguments(self, parser):
        parser.add_argument("--email", help="Only this address. Default: every duplicated address.")
        parser.add_argument(
            "--into", type=int, metavar="USER_ID",
            help="Force this account to be the survivor instead of the highest-entitlement one.",
        )
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually move the rows. Without it nothing is written and the plan is printed.",
        )

    def handle(self, *args, **options):
        if options["into"] is not None and not options["email"]:
            # One id cannot be the survivor of several different people's addresses.
            raise CommandError("--into names one account, so it needs --email to say whose.")
        emails = [options["email"]] if options["email"] else list(duplicate_emails())
        if not emails:
            self.stdout.write("No address is held by more than one account.")
            return

        applied = options["apply"]
        try:
            with transaction.atomic():
                for email in emails:
                    self._merge_email(email, options["into"])
                if not applied:
                    raise _Rollback
        except _Rollback:
            self.stdout.write(self.style.WARNING(
                "\nDRY RUN — nothing was written. Re-run with --apply to do it."
            ))
            return
        self.stdout.write(self.style.SUCCESS("\nApplied."))

    def _merge_email(self, email, into):
        accounts = list(User.objects.filter(email__iexact=email).order_by("pk"))
        if len(accounts) < 2:
            self.stdout.write(f"{email}: only {len(accounts)} account, nothing to merge.")
            return
        if any(user.is_staff or user.is_superuser for user in accounts):
            raise CommandError(
                f"{email} includes a staff or superuser account. Merging one of those is never "
                f"routine — sort it out by hand."
            )

        if into is not None:
            survivor = next((user for user in accounts if user.pk == into), None)
            if survivor is None:
                raise CommandError(f"--into {into} is not one of the accounts on {email}.")
            why = "chosen with --into"
        else:
            survivor = max(accounts, key=rank)
            why = "highest entitlement, then orders, subscriptions, scans, then oldest"

        self.stdout.write(f"\n{email}")
        for user in accounts:
            role = "KEEP  " if user is survivor else "merge "
            self.stdout.write(
                f"  {role} id={user.pk:<5} plan={plan_code(user):<7} "
                f"scans={user.scans.count():<3} orders={user.orders.count():<3} "
                f"groups={','.join(user.groups.values_list('name', flat=True)) or '-'}"
            )
        self.stdout.write(f"  survivor: id={survivor.pk} ({why})")

        for loser in accounts:
            if loser is not survivor:
                self._merge_user(loser, survivor)

    def _merge_user(self, loser, survivor):
        self.stdout.write(f"  id={loser.pk} -> id={survivor.pk}")

        # The uid the merged-away account signed in with has to keep working, or this command
        # would lock the owner out of the very sign-in route that created the split. It becomes an
        # alias on the survivor. The identity row is deleted first: `FirebaseAlias.save()` refuses
        # a uid that is still a FirebaseIdentity, which is the only guard against a uid meaning
        # two accounts.
        identity = FirebaseIdentity.objects.filter(user=loser).first()
        if identity:
            uid = identity.firebase_uid
            identity.delete()
            FirebaseAlias.objects.create(user=survivor, firebase_uid=uid)
            self.stdout.write(f"    firebase uid {uid}: kept as a sign-in alias on the survivor")

        for rel in User._meta.related_objects:
            model, field = rel.related_model, rel.field.name
            if model is FirebaseIdentity:
                continue  # handled above
            rows = list(model.objects.filter(**{field: loser}))
            if not rows:
                continue
            moved, notes = 0, []
            for row in rows:
                try:
                    # Savepointed per row: a collision must not poison the whole merge.
                    with transaction.atomic():
                        setattr(row, field, survivor)
                        row.save(update_fields=[rel.field.attname])
                    moved += 1
                except IntegrityError:
                    policy = CONFLICT_POLICY.get(f"{model._meta.label}.{field}")
                    if policy is None:
                        raise CommandError(
                            f"{model._meta.label}.{field} row {row.pk} collides with one the "
                            f"survivor already has, and there is no rule for it. Add one to "
                            f"CONFLICT_POLICY — do not let this command guess."
                        )
                    notes.append(f"{row.pk} {policy(row, survivor, field)}")
            line = f"    {model._meta.label}.{field}: moved {moved}/{len(rows)}"
            if notes:
                line += f" — {len(notes)} kept apart: " + "; ".join(notes)
            self.stdout.write(line)

        # Membership lives in a group, and `entitlement._granted_by_group` reads it. A merge that
        # left this behind would move the orders and still show the customer as free.
        groups = list(loser.groups.all())
        if groups:
            survivor.groups.add(*groups)
            self.stdout.write(f"    groups: added {', '.join(g.name for g in groups)}")
        permissions = list(loser.user_permissions.all())
        if permissions:
            survivor.user_permissions.add(*permissions)

        # The surviving row now stands for the whole history, so it should carry the whole
        # history's dates — otherwise the signup cohort reports shift by however long the person
        # went before signing in the second way.
        fields = []
        if loser.date_joined < survivor.date_joined:
            survivor.date_joined = loser.date_joined
            fields.append("date_joined")
        if loser.last_login and (not survivor.last_login or loser.last_login > survivor.last_login):
            survivor.last_login = loser.last_login
            fields.append("last_login")
        if fields:
            survivor.save(update_fields=fields)
            self.stdout.write(f"    survivor: took the loser's {', '.join(fields)}")

        # Checked before deleting rather than trusted, because `loser.delete()` would cascade
        # anything still pointing at it straight out of the database — the silent version of the
        # data loss this command exists to repair.
        leftover = {
            f"{rel.related_model._meta.label}.{rel.field.name}": remaining
            for rel in User._meta.related_objects
            if (remaining := rel.related_model.objects.filter(**{rel.field.name: loser}).count())
        }
        if leftover:
            raise CommandError(f"id={loser.pk} still owns rows after the move: {leftover}")

        # Deleted, not deactivated. A husk row keeping the same address would make the address
        # ambiguous forever, and `account_to_join` refuses to link when it is — so leaving it
        # behind would mean the next sign-in with a third provider starts the split all over
        # again.
        loser_id = loser.pk
        loser.delete()
        self.stdout.write(f"    deleted user id={loser_id} (every row it owned has moved)")
