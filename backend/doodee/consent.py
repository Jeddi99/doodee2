"""Whether a purpose is consented to *right now*.

`ConsentEvent` is an append-only log: granting writes `accepted=True`, withdrawing writes
`accepted=False`, and the row that counts is the most recent one for that user and purpose.
That history is what makes the table worth having — "when did they agree, and to which version
of the wording" is the question a consent record exists to answer.

The existing call sites ask a different question, `filter(accepted=True).exists()`, and they are
right to: ANALYSIS, STORAGE, SIMULATION and CHAT are gates you pass through once, at the point
the feature is first used, and none of them has an off switch. SKIN_VISION does, because it
sends a photograph rather than a number and a switch that cannot be switched back is not a
choice. `exists()` would read a withdrawn consent as still given — the one failure this module
exists to make impossible.

Reading the latest row per purpose is correct for the one-shot purposes too, so this is safe to
adopt more widely; it is only *required* for the ones that can be withdrawn.
"""

from .models import ConsentEvent


def granted(user, purpose):
    """True when the newest record for this purpose is a grant.

    Absence is not consent: a user who has never been asked returns False, the same as one who
    said no.
    """
    if not (user and user.is_authenticated):
        return False
    latest = (
        ConsentEvent.objects
        .filter(user=user, purpose=purpose)
        .order_by("-created_at", "-id")
        .first()
    )
    return bool(latest and latest.accepted)


def record(user, purpose, policy_version, accepted=True):
    """Append a decision. Returns the new row.

    Always writes, even when the decision matches the current state. Re-consenting under a newer
    policy version is a real event and the version is the reason the log exists — collapsing it
    into a no-op would lose the evidence that the user agreed to the wording actually shown.
    """
    return ConsentEvent.objects.create(
        user=user, purpose=purpose, policy_version=policy_version, accepted=accepted,
    )


def version_granted(user, purpose):
    """The policy version the user last agreed to, or None.

    Lets a caller notice that consent was given against wording that has since changed, and ask
    again rather than treating an old agreement as covering new terms.
    """
    latest = (
        ConsentEvent.objects
        .filter(user=user, purpose=purpose, accepted=True)
        .order_by("-created_at", "-id")
        .first()
    )
    return latest.policy_version if latest else None
