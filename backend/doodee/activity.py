"""Recording that a user was here today.

Called from FirebaseAuthentication rather than from middleware, and that is not a style
choice: DRF authenticates inside the view, not in the middleware chain, so any middleware
reading `request.user` sees AnonymousUser for every request the app makes. The authentication
class is the one place that knows who this is.
"""

import logging

from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

# Long enough to cover the rest of the day from any point in it. The row is unique on
# (user, date) anyway, so an early expiry costs one redundant INSERT, not a duplicate.
_SEEN_TTL_SECONDS = 26 * 60 * 60


def record_activity(user, today=None):
    """Note that `user` used the app today. Idempotent, and never raises.

    Analytics must not be able to break sign-in. A day of missing counts is a gap in a chart;
    an exception escaping here is every user locked out. So everything below is inside one
    try/except that swallows and logs.

    The cache only avoids a database round trip per request — it is not the store. If Redis is
    down the get_or_create still runs and the numbers stay correct, just more expensively.
    """
    if user is None or not user.pk:
        return
    today = today or timezone.localdate()
    key = f"seen:{user.pk}:{today.isoformat()}"
    try:
        # add() returns False when the key already exists, so only the first request of the
        # day for this user reaches the database.
        if cache.add(key, 1, timeout=_SEEN_TTL_SECONDS) is False:
            return
    except Exception:  # noqa: BLE001 - a cache outage must not change behaviour here
        logger.warning("activity cache unavailable; falling back to the database", exc_info=True)

    try:
        from .models import DailyActive

        DailyActive.objects.get_or_create(user=user, date=today)
    except Exception:  # noqa: BLE001 - see the docstring: never break authentication
        logger.warning("could not record daily activity for user %s", user.pk, exc_info=True)
