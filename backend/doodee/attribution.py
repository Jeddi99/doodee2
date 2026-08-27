"""Where visitors came from — UTM tags in, two narrow tables out.

Everything the browser sends is untrusted and ends up rendered into an admin page, so the
cleaning happens here and only here. Both writers import from this module, which is what keeps
the value stored in `Visit` identical to the value stored in `UserAttribution` for the same
arrival: two copies of "lowercase, strip, truncate" would drift, and the two tables would then
disagree about which campaign a paying user came from.

The two writes are deliberately not one function. `record_visit` runs unauthenticated, for
people with no account, and must never touch a user. `attach_attribution` needs a user and runs
on a different request, after sign-in. Merging them would mean the visit endpoint had to
authenticate, and an authenticated visit endpoint is how the visitor counter would start
minting accounts (see the note in `views.visit`).
"""

import logging
import re

from django.db.models import F
from django.utils import timezone

logger = logging.getLogger(__name__)

# Anything longer is not a campaign name, it is someone pushing on the column.
MAX_LEN = 32
# Public routes a campaign link could sensibly point at. Everything else collapses to "other":
# a free path column is high-cardinality, and the first campaign link with an id or an email
# address in its path would quietly turn this table into the behavioural log `DailyActive`
# refuses to keep.
LANDING_PATHS = ("/", "/login", "/onboarding", "/pricing")
OTHER_PATH = "other"
# Untagged traffic is still traffic. It groups under one honest name rather than an empty
# string, which would render as a blank row nobody can interpret.
DIRECT = "direct"
DEVICES = ("mobile", "desktop")

_TAG_ALLOWED = re.compile(r"[^a-z0-9_.\-]")


def clean_tag(value, default=DIRECT):
    """Normalise one utm_* value: lowercase, safe characters only, capped at MAX_LEN.

    Case folding is not cosmetic — `TikTok` and `tiktok` from two different ad placements would
    otherwise be two rows in the report that have to be added up by eye.
    """
    text = _TAG_ALLOWED.sub("", str(value or "").strip().lower())[:MAX_LEN]
    return text or default


def clean_path(value):
    """A whitelisted landing path, or "other"."""
    text = str(value or "").strip()
    # Query strings and fragments carry the tags we have already read, and ids we do not want.
    text = text.split("?")[0].split("#")[0]
    if text != "/":
        text = text.rstrip("/") or "/"
    return text if text in LANDING_PATHS else OTHER_PATH


def clean_device(value):
    text = str(value or "").strip().lower()
    return text if text in DEVICES else "desktop"


def clean_tags(payload):
    """The four fields both tables share, whatever the browser actually sent."""
    data = payload if isinstance(payload, dict) else {}
    return {
        "source": clean_tag(data.get("utm_source")),
        "medium": clean_tag(data.get("utm_medium")),
        "campaign": clean_tag(data.get("utm_campaign")),
        "landing_path": clean_path(data.get("landing_path")),
    }


def clean_payload(payload):
    """The tags plus the device, which is the one field only `Visit` has.

    `UserAttribution` deliberately does not record the device: it would say which machine someone
    signed up on, about a named person, to answer a question nobody asked.
    """
    data = payload if isinstance(payload, dict) else {}
    return {**clean_tags(payload), "device": clean_device(data.get("device"))}


def record_visit(payload, today=None):
    """Count one arrival in its bucket for today. Never raises.

    Same rule as `activity.record_activity`: a counter must not be able to fail a request. The
    endpoint answers 204 either way, so a database hiccup costs a hit, not an error page.
    """
    fields = clean_payload(payload)
    today = today or timezone.localdate()
    try:
        from .models import Visit

        # get_or_create then an F() increment, rather than one atomic upsert: the row is unique
        # on the whole bucket, so two simultaneous first-hits mean one loses the race, and
        # F() makes the increment itself safe without a lock.
        Visit.objects.get_or_create(date=today, defaults={"hits": 0}, **fields)
        Visit.objects.filter(date=today, **fields).update(hits=F("hits") + 1)
    except Exception:  # noqa: BLE001 - see the docstring
        logger.warning("could not record a visit", exc_info=True)


def attach_attribution(user, payload):
    """Record where `user` came from, once. Never raises, never overwrites.

    Called after sign-in from a request the user made anyway, so a failure here must be as
    invisible as a failed visit count — losing an attribution row costs one line in a report.
    """
    if user is None or not user.pk:
        return
    try:
        from .models import UserAttribution

        UserAttribution.objects.get_or_create(user=user, defaults=clean_tags(payload))
    except Exception:  # noqa: BLE001 - see the docstring
        logger.warning("could not record attribution for user %s", user.pk, exc_info=True)
