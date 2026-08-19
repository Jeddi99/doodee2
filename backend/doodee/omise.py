"""Opn Payments (Omise) — PromptPay charges and webhook verification.

PromptPay rather than cards, deliberately. No card number ever reaches this server, so the
whole PCI-DSS question never arises; everyone in Thailand already has it; and the customer
scans a QR in their own banking app, which is a flow they already trust.

`urllib` rather than `requests` because that is what storage.py already uses to talk to
Supabase — one HTTP style in the codebase, and no new dependency for four calls.

Money crosses this boundary as satang integers, matching `Order.total_satang` and Omise's own
subunit convention. Nothing here converts to baht.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

API_BASE = "https://api.omise.co"
# Omise's own floor and ceiling for PromptPay. Checked here so a bad plan price fails with a
# message rather than as an opaque 400 from the provider.
MIN_SATANG = 2_000
MAX_SATANG = 15_000_000
# The QR cannot outlive this, per Omise. Left at their default rather than set explicitly:
# a shorter window only creates expired charges for people who step away from their phone.
QR_LIFETIME_HOURS = 24


class OmiseError(RuntimeError):
    """Anything that stops a charge being created. Never contains the secret key."""


def configured():
    return bool(os.getenv("OMISE_SECRET_KEY"))


def _call(path, params):
    key = os.getenv("OMISE_SECRET_KEY", "")
    if not key:
        raise OmiseError("omise_secret_key_missing")
    # Basic auth with the key as username and an empty password, per Omise.
    token = base64.b64encode(f"{key}:".encode()).decode()
    request = Request(
        f"{API_BASE}{path}",
        data=urlencode(params).encode(),
        headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except HTTPError as exc:
        # Omise puts a machine-readable code and a human message in the body; surfacing it
        # turns "payment failed" into something an operator can act on.
        try:
            body = json.loads(exc.read().decode())
            detail = f"{body.get('code', exc.code)}: {body.get('message', '')}".strip()
        except Exception:  # noqa: BLE001 - the error path must not raise its own error
            detail = f"http_{exc.code}"
        raise OmiseError(detail) from exc
    except Exception as exc:  # noqa: BLE001 - timeouts, DNS, TLS
        raise OmiseError(f"unreachable: {exc}") from exc


def create_promptpay_charge(amount_satang, order_id):
    """A PromptPay charge. Returns `(charge_id, qr_image_url, expires_at)`.

    Two calls because Omise models the payment method as a `source` separate from the `charge`
    that draws on it. `metadata.order_id` is what lets the webhook find our row without
    trusting anything the browser sends back.
    """
    if not MIN_SATANG <= amount_satang <= MAX_SATANG:
        raise OmiseError(f"amount_out_of_range: {amount_satang} satang")

    source = _call("/sources", {
        "amount": amount_satang,
        "currency": "THB",
        "type": "promptpay",
    })
    charge = _call("/charges", {
        "amount": amount_satang,
        "currency": "THB",
        "source": source["id"],
        "metadata[order_id]": str(order_id),
    })
    return charge["id"], qr_url(charge), charge.get("expires_at")


def qr_url(charge):
    """The scannable image, buried three levels into the charge object."""
    return (
        ((charge.get("source") or {}).get("scannable_code") or {})
        .get("image", {})
        .get("download_uri")
    )


def verify_signature(raw_body, signature, timestamp):
    """Whether this webhook really came from Omise.

    HMAC-SHA256 over `<timestamp>.<raw body>` keyed by the base64-decoded webhook secret.
    Compared in constant time so a wrong signature cannot be discovered a byte at a time.

    Fails closed: with no secret configured every webhook is rejected. An endpoint that grants
    paid entitlement must never accept unsigned requests, and "we hadn't configured it yet" is
    exactly how that ships.
    """
    secret = os.getenv("OMISE_WEBHOOK_SECRET", "")
    if not secret or not signature or not timestamp:
        return False
    try:
        key = base64.b64decode(secret)
    except Exception:  # noqa: BLE001 - a malformed secret is a rejected webhook, not a crash
        logger.error("OMISE_WEBHOOK_SECRET is not valid base64")
        return False
    payload = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(key, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
