"""Telling one user one thing, once, across up to three channels.

The `Notification` row is the notification. Email and push are deliveries *of that row*, not
separate systems — so "did we tell them" has one answer, and a channel being down degrades the
delivery instead of losing the message.

Everything is best-effort except the row. A push token that has gone stale and an SMTP server that
is refusing connections are both normal, and neither may take down the thing that caused the
notification: nobody should lose a referral reward because a mail server was busy.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Notification, PushToken


logger = logging.getLogger(__name__)


def notify(user, kind, title, body="", dedupe_key="", payload=None, email=True, push=True):
    """Record a notification and try to deliver it. Returns the row, or None if it was a duplicate.

    None means the same (user, kind, dedupe_key) already exists — which is the point of
    `dedupe_key` and the reason the renewal job is safe to run twice. A caller that gets None
    should do nothing: the user has already been told.
    """
    try:
        with transaction.atomic():
            notification = Notification.objects.create(
                user=user, kind=kind, title=title, body=body,
                dedupe_key=dedupe_key, payload=payload or {},
            )
    except IntegrityError:
        return None

    if email:
        _send_email(notification)
    if push:
        _send_push(notification)
    return notification


def _send_email(notification):
    """Best effort. A missing address or a dead SMTP host is not an error worth raising."""
    address = (notification.user.email or "").strip()
    if not address:
        return
    try:
        send_mail(
            subject=notification.title,
            message=notification.body or notification.title,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[address],
            fail_silently=False,
        )
    except Exception:
        # Logged rather than swallowed in silence: an outage that nobody can see is the reason
        # the renewal reminders would stop working without anyone noticing.
        logger.warning("notification email failed", exc_info=True, extra={"notification": notification.pk})
        return
    notification.emailed_at = timezone.now()
    notification.save(update_fields=("emailed_at",))


def _send_push(notification):
    """Fan out to this user's registered devices via FCM.

    `firebase_admin` is already a dependency and already initialised for token verification, so
    this adds no new service. Tokens FCM reports as dead are deleted — a token that has been
    unregistered will never work again, and keeping it means retrying it forever.
    """
    tokens = list(PushToken.objects.filter(user=notification.user).values_list("token", flat=True))
    if not tokens:
        return
    try:
        from firebase_admin import messaging

        from .authentication import _firebase_app

        response = messaging.send_each(
            [
                messaging.Message(
                    token=token,
                    notification=messaging.Notification(
                        title=notification.title, body=notification.body,
                    ),
                    data={key: str(value) for key, value in (notification.payload or {}).items()},
                )
                for token in tokens
            ],
            app=_firebase_app(),
        )
    except Exception:
        logger.warning("push send failed", exc_info=True, extra={"notification": notification.pk})
        return

    dead = [
        token for token, result in zip(tokens, response.responses)
        if not result.success and _is_unregistered(result.exception)
    ]
    if dead:
        PushToken.objects.filter(token__in=dead).delete()
    notification.pushed_at = timezone.now()
    notification.save(update_fields=("pushed_at",))


def _is_unregistered(exception):
    name = type(exception).__name__ if exception else ""
    return name in ("UnregisteredError", "SenderIdMismatchError")


def unread_count(user):
    return Notification.objects.filter(user=user, read_at__isnull=True).count()
