"""DOODEE Chat: answering questions about a scan's own numbers, via Claude.

Two rules shape this module.

**No face images leave the system.** Only the derived numbers in
`analysis_data.reference_scores` are sent to Anthropic — the same 12 measurements the analysis
screen already shows the user. Sending the photographs would be sending biometric data to a
third party, which the analysis consent (`ConsentEvent.Purpose.ANALYSIS`) does not cover and
`DataWeUseSection` does not disclose. If that ever changes it needs its own consent purpose and
honest copy, not a quiet edit here.

**The model may not invent a verdict.** `reference_scoring.metric_score()` measures *distance
from a Thai reference mean*, not quality, so "your nose scores 84" means "close to the cohort
average", never "your nose is good". The system prompt below says so at length because the
model is the only thing standing between that distinction and the user.
"""

import os
from functools import lru_cache

from django.conf import settings

from .reference_scoring import CATEGORIES


class ChatUnavailable(RuntimeError):
    """Raised when the upstream model cannot be reached, including a missing API key."""


MODEL = "claude-opus-5"
MAX_TOKENS = 1500
# This is an explanatory Q&A over a dozen numbers, not agentic work. Low effort keeps both the
# per-turn cost (~฿0.6) and the wait (a few seconds, since gunicorn's sync workers cannot
# stream) inside what the product can afford.
EFFORT = "low"

# Anything longer is truncated. A chat about one's own measurements has no legitimate need for
# a novel-length prompt, and an unbounded field is an unbounded bill.
MAX_QUESTION_CHARS = 2000
# Turns of history replayed to the model. The system block (prompt + scan numbers) is the
# cacheable part; history is not, so it is what actually grows the bill per turn.
HISTORY_TURNS = 12

SYSTEM_PROMPT = """You are DOODEE Chat. You help one person understand the facial measurements
DOODEE took from their own scan. You are answering in the language the user writes in — Thai
users get Thai.

WHAT THE NUMBERS ARE
Each measurement is compared with a published reference of 240 Thai adults aged 18-35. The
score is a two-tailed distance: score = max(0, 100 - 20 * |z|), where z = (observed - reference
mean) / reference SD. A score near 100 means the measurement is CLOSE TO THE COHORT AVERAGE. A
low score means it is UNUSUAL for that cohort, in either direction — larger or smaller.

Closeness to an average is not quality. There is no measurement here for "attractive",
"good", "bad", "better" or "worse", and you must never present one as if there were.

RULES
1. Never judge appearance. Do not say a feature is beautiful, ugly, good, bad, weak, strong,
   flawed, needs fixing, or should be changed. Do not rank features against each other by
   desirability. "Furthest from the reference average" is a fact you may state; "your worst
   feature" is not.
2. This is not medical advice or a diagnosis. If asked whether to have a procedure, say the
   only honest answer: that is a decision for a qualified doctor who has examined them in
   person, and the numbers here cannot answer it.
3. Never promise an outcome from any procedure. DOODEE's simulation is an illustration, not a
   prediction.
4. Only cite numbers you were given below. If a measurement is not in the list, say it was not
   measured. Never estimate, never fill in a plausible value.
5. State the limits when they matter: the reference is Thai adults 18-35, the scan is one
   photograph taken in unknown lighting, and the measurement error is real. If the user's own
   cohort flags say they fall outside the reference group, say plainly that the comparison does
   not apply to them.
6. If asked about someone other than the user, or asked to compare the user with a celebrity or
   another person, decline: you only have this one set of measurements.
7. Be brief and concrete. A few short paragraphs. No filler, no flattery, no encouragement the
   numbers do not support."""

NO_SCAN_CONTEXT = """The user has no completed scan yet, so you have NO measurements. Say so
and tell them what a scan involves. Do not answer any question as though you had numbers."""


def _metric_label(key):
    return f"{key} ({CATEGORIES.get(key, 'uncategorised')})"


def scan_context(scan):
    """The scan's numbers as plain text for the cached system block.

    Text rather than raw JSON: it is a third the tokens, and the units and the meaning of z
    have to be spelled out anyway.
    """
    scores = ((scan.analysis_data or {}).get("reference_scores") or {}) if scan else {}
    if not scores or scores.get("status") != "experimental_reference_similarity":
        return NO_SCAN_CONTEXT

    reference = scores.get("reference") or {}
    lines = [
        "THIS USER'S MEASUREMENTS",
        f"Reference: {reference.get('sample_size', 240)} {reference.get('population', 'Thai adults')} "
        f"aged {reference.get('age_range', '18-35')} (profile: {reference.get('profile', 'neutral')}).",
        f"Age cohort: {scores.get('cohort_match')}. Population: {scores.get('population_match')}.",
        f"Overall closeness index: {scores.get('overall_score')}/100 "
        "(mean of the category scores; higher = closer to the reference average).",
        "",
        "Per category (score/100, higher = closer to the reference average):",
    ]
    for category in scores.get("categories") or []:
        lines.append(f"- {category['key']}: {category['score']} from {category['metric_count']} measurements")

    lines += ["", "Per measurement — observed, reference mean, z (signed: negative = smaller than the reference), score:"]
    for metric in scores.get("metrics") or []:
        lines.append(
            f"- {_metric_label(metric['key'])}: observed {metric['observed']} {metric['unit']}, "
            f"reference {metric['reference']} {metric['unit']}, z {metric['normalized_deviation']}, "
            f"score {metric['score']}"
        )

    unsupported = scores.get("unsupported_categories") or []
    if unsupported:
        lines += ["", f"NOT measured at all (no reference data): {', '.join(unsupported)}. "
                      "If asked about these, say they were not measured."]
    return "\n".join(lines)


@lru_cache(maxsize=1)
def _client():
    """Built once. The SDK holds a connection pool, so per-request construction wastes it."""
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise ChatUnavailable("anthropic_api_key_missing")
    try:
        from anthropic import Anthropic
    except ImportError as exc:  # pragma: no cover - dependency is in requirements.txt
        raise ChatUnavailable("anthropic_sdk_missing") from exc
    return Anthropic(api_key=key)


def reply(context_text, history):
    """One turn. Returns `(text, usage_dict)`.

    `history` is `[{"role": ..., "content": ...}]` already trimmed by the caller, ending with
    the user's new question.
    """
    client = _client()
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            output_config={"effort": EFFORT},
            # One cache breakpoint at the end of the system block. Prompt plus measurements is
            # ~1,400 tokens, comfortably over Opus 5's 512-token cache minimum, and it is
            # byte-identical for every turn in a conversation — so turn 2 onward reads it at a
            # tenth the price.
            system=[{
                "type": "text",
                "text": f"{SYSTEM_PROMPT}\n\n{context_text}",
                "cache_control": {"type": "ephemeral"},
            }],
            messages=history,
        )
    except ChatUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001 - the SDK raises a family of transport/API errors
        raise ChatUnavailable(str(exc)) from exc

    text = "".join(block.text for block in message.content if getattr(block, "type", None) == "text").strip()
    if not text:
        raise ChatUnavailable("empty_response")
    usage = message.usage
    return text, {
        "input_tokens": getattr(usage, "input_tokens", 0) or 0,
        "cached_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        "output_tokens": getattr(usage, "output_tokens", 0) or 0,
    }


def title_for(question):
    """A thread title from the first question — no second model call to name a chat."""
    clean = " ".join(question.split())
    return clean[:117] + "…" if len(clean) > 120 else clean


def chat_enabled():
    return bool(settings.CHAT_ENABLED and os.getenv("ANTHROPIC_API_KEY"))
