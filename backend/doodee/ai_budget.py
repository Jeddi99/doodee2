"""One monthly ceiling for everything this product spends on external models.

The reserve/settle pair lived inside `views.py` and was reachable only from the chat endpoint.
That was fine while chat was the only thing that called a model. It stopped being fine when skin
vision started sending photographs: a second spender that did not go through the same ledger
would have made `LLM_BUDGET_THB_PER_MONTH` a ceiling on chat rather than a ceiling on spend, and
the invoice would have been the first thing to notice.

Two properties are load-bearing and easy to lose in a refactor:

* **The reservation happens before the call, the settlement after.** A model that never answers
  still cost the wait, and a reservation that is never settled keeps its estimate against the
  ceiling — which is the conservative direction. `AIUsageLedger.Status.UNCERTAIN` exists for the
  case where we genuinely do not know whether the request reached the provider.
* **`idempotency_key` is what makes a retry free.** Celery retries tasks; `unique_ai_usage_request`
  on `(user, idempotency_key)` means the second attempt gets `False` back from `reserve` instead
  of a second bill. Callers must pass a key derived from the work, never from the clock.

Prices are parameters rather than module constants because the callers do not use the same model.
Chat runs on whatever the admin has selected; skin vision is pinned to Opus 5, which is an order
of magnitude more expensive per token. Reading one set of prices for both would have quietly
under-reserved every photograph.

Not every spender is billed per token. `flux_refine` sends a crop of a face to an image model and
is billed per *image*, so it admits through `reserve_usd`/`settle_usd` instead. Both pairs share
one admission function and therefore one ceiling — which is the whole point of this module, and
the property that quietly breaks if a third spender is ever given its own copy of the ledger read.
"""

import math
from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import AIUsageLedger, ChatSetting


def _month_start():
    month = timezone.localdate().replace(day=1)
    return timezone.make_aware(datetime.combine(month, datetime.min.time()))


def satang(usd):
    """Baht-satang from US dollars, rounded up and never zero.

    Never zero because a row costing nothing is indistinguishable from a row that failed to
    settle, and the ledger is read to answer "what did we spend".
    """
    return max(1, math.ceil(usd * settings.USD_THB_RATE * 100))


def _admit(user, key, *, provider, model, reserved_satang):
    """The admission decision, shared by every spender however it is priced.

    One function on purpose. The ceiling is a ceiling on spend, not on chat, and the way that
    stops being true is a second copy of this read that drifts — which is exactly how
    `flux_refine` came to spend nothing through the ledger at all while chat and skin vision both
    did. Callers convert their own units to satang and come through here.
    """
    with transaction.atomic():
        # The ChatSetting singleton is used purely as a lock row here — it serialises the
        # admission calculation across API and worker processes so two callers cannot both read
        # a below-ceiling total and both proceed. It is not read as configuration.
        ChatSetting.objects.select_for_update().get(pk=ChatSetting.current().pk)
        used = AIUsageLedger.objects.filter(
            created_at__gte=_month_start(),
            status__in=(
                AIUsageLedger.Status.RESERVED,
                AIUsageLedger.Status.SETTLED,
                AIUsageLedger.Status.UNCERTAIN,
            ),
        ).aggregate(total=Sum("actual_satang") + Sum("reserved_satang"))["total"] or 0
        ceiling = int(settings.LLM_BUDGET_THB_PER_MONTH * 100 * settings.LLM_BUDGET_ADMISSION_RATIO)
        if used + reserved_satang > ceiling:
            return None
        ledger, created = AIUsageLedger.objects.get_or_create(
            user=user, idempotency_key=key,
            defaults={"provider": provider, "model": model, "reserved_satang": reserved_satang},
        )
        return ledger if created else False


def reserve(user, key, *, provider, model, input_tokens, output_tokens, price_in, price_out):
    """Hold budget for one token-priced call, or refuse.

    Returns the ledger row to settle later, `False` when this key has already been reserved (a
    retry — do not call the model again), or `None` when the month's ceiling is reached.
    """
    return _admit(
        user, key, provider=provider, model=model,
        reserved_satang=satang((input_tokens * price_in + output_tokens * price_out) / 1_000_000),
    )


def reserve_usd(user, key, *, provider, model, usd):
    """Hold budget for work quoted in dollars rather than in tokens. Same three answers.

    Image models bill per picture. Squeezing that through `reserve`'s token arithmetic would mean
    inventing a token count and a per-token price whose product happens to come out right, and the
    ledger row would then read as thousands of tokens that were never sent — a number an operator
    would later try to reconcile against a provider invoice that counts images.
    """
    return _admit(user, key, provider=provider, model=model, reserved_satang=satang(usd))


def settle(ledger, usage, *, price_in, price_cached_in, price_out):
    """Replace the estimate with what the provider actually reported."""
    uncached = max(0, usage["input_tokens"] - usage.get("cached_input_tokens", 0))
    usd = (
        uncached * price_in
        + usage.get("cached_input_tokens", 0) * price_cached_in
        + usage["output_tokens"] * price_out
    ) / 1_000_000
    ledger.status = AIUsageLedger.Status.SETTLED
    ledger.actual_satang = satang(usd)
    ledger.reserved_satang = 0
    ledger.input_tokens = usage["input_tokens"]
    ledger.cached_input_tokens = usage.get("cached_input_tokens", 0)
    ledger.output_tokens = usage["output_tokens"]
    ledger.settled_at = timezone.now()
    ledger.save()


def settle_usd(ledger, usd):
    """Replace the estimate with what was actually spent, for a per-call spender.

    The token columns stay at zero rather than being back-filled with a guess: they mean "tokens
    the provider counted", and an image call has none. `analytics` reads the ledger's satang for
    money and the token columns for cache efficiency, so a fabricated token count here would
    corrupt the second while telling the first nothing it did not already have.
    """
    ledger.status = AIUsageLedger.Status.SETTLED
    ledger.actual_satang = satang(usd)
    ledger.reserved_satang = 0
    ledger.settled_at = timezone.now()
    ledger.save(update_fields=("status", "actual_satang", "reserved_satang", "settled_at"))


def refund(ledger):
    """The call failed before it could have been billed, so release the hold."""
    ledger.status = AIUsageLedger.Status.REFUNDED
    ledger.reserved_satang = 0
    ledger.settled_at = timezone.now()
    ledger.save(update_fields=("status", "reserved_satang", "settled_at"))
