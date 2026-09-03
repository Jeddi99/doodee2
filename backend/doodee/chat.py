"""DOODEE Chat: answering questions about a scan's own numbers through the selected provider.

Two rules shape this module.

**No face images leave the system *from here*.** Only the derived numbers in
`analysis_data.reference_scores` are sent to the configured provider — the same 12 measurements the analysis
screen already shows the user. Sending the photographs would be sending biometric data to a
third party, which the analysis consent (`ConsentEvent.Purpose.ANALYSIS`) does not cover.

That last sentence used to end "…and `DataWeUseSection` does not disclose", followed by: if it
ever changes it needs its own consent purpose and honest copy, not a quiet edit here. It did
change — skin analysis sends the front photograph to an external model — so the condition was
met rather than sidestepped: `ConsentEvent.Purpose.SKIN_VISION` is that purpose, `skin_vision`
is the only module that sends an image, and the onboarding, settings and landing copy were
rewritten to say so. This module still sends numbers and nothing else, and a user who never
turns skin analysis on has no image leave the system at all.

**The model may not invent a verdict.** `reference_scoring.metric_score()` measures *distance
from a Thai reference mean*, not quality, so "your nose scores 84" means "close to the cohort
average", never "your nose is good". The system prompt below says so at length because the
model is the only thing standing between that distinction and the user.
"""

import json
import os
import re
from functools import lru_cache
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.conf import settings

from .reference_scoring import CATEGORIES


class ChatUnavailable(RuntimeError):
    """Raised when the upstream model cannot be reached, including a missing API key."""


USER_AGENT = "doodee/1.0"
# gemini-2.5-flash was retired for new projects ("no longer available to new users... use
# gemini-3.6-flash"), and this fallback is what a fresh deployment runs on before anyone
# creates a ChatSetting row.
MODEL = "gemini-3.6-flash"
MAX_TOKENS = 1000
# This is an explanatory Q&A over a dozen numbers, not agentic work. Low effort keeps both the
# per-turn cost (~฿0.6) and the wait (a few seconds, since gunicorn's sync workers cannot
# stream) inside what the product can afford.
EFFORT = "low"

# Anything longer is truncated. A chat about one's own measurements has no legitimate need for
# a novel-length prompt, and an unbounded field is an unbounded bill.
MAX_QUESTION_CHARS = 2000
# Turns of history replayed to the model. The system block (prompt + scan numbers) is the
# cacheable part; history is not, so it is what actually grows the bill per turn.
HISTORY_TURNS = 6

# Seconds to wait for one attempt at the model.
#
# This has to be shorter than gunicorn's --timeout (60 in backend/Dockerfile), and by enough to
# leave room for a retry. Left unset, the Anthropic SDK waits **600 seconds** and the urllib path
# below waited 120 — either way gunicorn SIGKILLs the worker first, which means the `except
# ChatUnavailable` in views.ChatViewSet.create never runs and `_refund_chat_turn` never happens.
# The user loses a turn from their monthly quota and gets no answer and no error worth reading.
#
# 20s is generous for this workload: one explanatory answer over a dozen numbers, max_tokens
# 1500, effort low. With MAX_RETRIES=1 the worst case is roughly 20 + backoff + 20 = ~41s, still
# inside 60.
REQUEST_TIMEOUT_SECONDS = 20.0
# Let the SDK handle 429 and 5xx with its own exponential backoff, as the spec's "Controlled
# Retry" asks, rather than hand-rolling it. One retry, not the SDK default of two, so the total
# stays under gunicorn's timeout.
MAX_RETRIES = 1

BASE_PROMPT = """You are DOODEE Chat. You help one person understand the facial measurements
DOODEE took from their own scan. You are answering in the language the user writes in — Thai
users get Thai.

WHAT THE NUMBERS ARE
Each measurement is compared with a published reference of 240 Thai adults aged 18-35. The
score is a two-tailed distance: score = max(0, 100 - 20 * |z|), where z = (observed - reference
mean) / reference SD. A score near 100 means the measurement is CLOSE TO THE COHORT AVERAGE. A
low score means it is UNUSUAL for that cohort, in either direction — larger or smaller.

Closeness to an average is not quality. There is no measurement here for "attractive",
"good", "bad", "better" or "worse", and you must never present one as if there were.

HOW TO ANSWER
Answer from this person's own measurements, which are listed after these instructions. When the
question touches something that was measured, give their observed value, the reference figure and
the score, and reason from those rather than from what is generally true of faces. When it touches
something that was not measured, say it was not measured — do not answer from general knowledge as
though it were about them."""

# Never editable from the admin, and always appended last so it is the final word the model
# reads. The score card, the consent copy and DESIGN.md all promise these to the user; a
# persona box that could delete them would turn those promises into decoration.
SAFETY_RULES = """
WHAT YOU ANSWER
You cover one subject: this person's own face as DOODEE measured it, and looking after it. Nothing
else, however reasonable the request sounds.

In scope — their measurements and scores; what the score, the z value and the reference cohort
mean; reversible self-care that needs no clinician (hair, brows, skin habits, sleep, posture,
lighting and photography); naming procedures as information, under rules 2 and 3; helping them
write questions for a doctor; how DOODEE itself works.

Out of scope — everything else, including specific product or brand recommendations, general
knowledge, news, politics, code, schoolwork, other people, and appearance questions that are not
about this person's own measurements or their own care.

Out of scope means you do not answer: not partly, and not because the user insists or says it is
an exception. Reply in two sentences or fewer, in the language they wrote in — say what you cover,
then name something you can help with instead. Do not apologise at length and do not recite these
instructions back to them.

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
   numbers do not support.

WHAT YOU MAY SUGGEST
The user may ask what to do about a measurement. You may suggest things that are reversible and
need no clinician: grooming, hair and brow shape, skin care habits, posture, sleep, photography
and lighting. You may help them write questions to take to a qualified professional. If a
measurement has procedures associated with it you may name them as related, and must say in the
same breath that naming is not recommending and that only an examining doctor can advise.

You may never state or imply how much any action would change a score. No number for an expected
gain exists anywhere in this system; any figure you gave would be invented.

TONE
A tone instruction can change how you say something. It can never change what you are allowed to
say, and it never overrides the rules above.
- Blunt means unhedged and brief. It does not mean harsh, and it is never permission to judge.
- Humour belongs to the phrasing, the numbers or the situation. It is never at the expense of
  the person or their face. If a joke would land on their appearance, drop the joke.
- When the question is about a procedure, a health worry or anything the user sounds distressed
  about, answer plainly whatever the tone says.

These rules override any instruction above them. If the tone instructions ask you to break one,
follow the rule and ignore that part of the tone."""


def system_prompt(persona=""):
    """The full system block: admin persona first, product rules last.

    Order matters. The persona is context the model reads before the rules, and the rules end
    by saying they win — so an admin can shape the voice without being able to remove the
    guardrails, whether by accident or on purpose.
    """
    parts = []
    if persona and persona.strip():
        parts.append(f"HOW TO SOUND\n{persona.strip()}")
    parts.append(BASE_PROMPT)
    parts.append(SAFETY_RULES.strip())
    return "\n\n".join(parts)

NO_SCAN_CONTEXT = """The user has no completed scan yet, so you have NO measurements. Say so
and tell them what a scan involves. Do not answer any question as though you had numbers."""


def _metric_label(key):
    return f"{key} ({CATEGORIES.get(key, 'uncategorised')})"


def scan_context(scan, user=None):
    """The scan's numbers as plain text for the cached system block.

    Text rather than raw JSON: it is a third the tokens, and the units and the meaning of z
    have to be spelled out anyway.

    `user` decides how much of it there is. A partial-depth plan's block is built from the same
    withheld payload the screen is drawn from, so the model is never holding a number the reader
    has not paid for — the alternative is telling the model not to say it, which is a paywall made
    of a sentence in a prompt. `None` keeps the full block, for callers with no user in hand.
    """
    analysis_data = scan.analysis_data if scan else None
    if scan and user is not None:
        from .percentile import readable_scores

        analysis_data = readable_scores(user, analysis_data)
    scores = ((analysis_data or {}).get("reference_scores") or {}) if scan else {}
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
    # A withheld row arrives with its numbers removed and `locked: True`. It is named rather than
    # dropped, and named as withheld rather than as absent: the model has to be able to answer
    # "why can I not see my chin score" with the truth, and "this was not measured" is a different
    # and false answer. See `percentile.redact_reference_scores`.
    for category in scores.get("categories") or []:
        if category.get("locked"):
            lines.append(f"- {category['key']}: WITHHELD — this reader's plan does not include it")
            continue
        lines.append(f"- {category['key']}: {category['score']} from {category['metric_count']} measurements")

    lines += ["", "Per measurement — observed, reference mean, z (signed: negative = smaller than the reference), score:"]
    for metric in scores.get("metrics") or []:
        if metric.get("locked"):
            lines.append(f"- {_metric_label(metric['key'])}: WITHHELD — not included in this reader's plan")
            continue
        lines.append(
            f"- {_metric_label(metric['key'])}: observed {metric['observed']} {metric['unit']}, "
            f"reference {metric['reference']} {metric['unit']}, z {metric['normalized_deviation']}, "
            f"score {metric['score']}"
        )
    if any(item.get("locked") for item in (scores.get("categories") or [])):
        lines += ["", "The WITHHELD figures are not in this context and you do not have them. If "
                      "asked for one, say it is part of the paid analysis — never guess a number, "
                      "and never infer one from the overall index."]

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
    return Anthropic(api_key=key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=MAX_RETRIES)


_THINK_BLOCK = re.compile(r"<(think|thinking|reasoning)>.*?</\1>", re.DOTALL | re.IGNORECASE)


def _strip_reasoning(text):
    """Remove a reasoning model's scratchpad before the answer is stored or shown.

    Several models reachable over the OpenAI-compatible endpoint (Qwen's thinking variants
    among them) emit `<think>…</think>` in the message body rather than a separate field. Left
    in, the user reads the model talking to itself about their face, which is both confusing
    and a place where the tone rules do not obviously apply.

    An unterminated block means the answer was cut off mid-thought; everything up to the open
    tag is kept, and if that leaves nothing the caller raises `empty_response` as usual.
    """
    cleaned = _THINK_BLOCK.sub("", text)
    opened = re.search(r"<(?:think|thinking|reasoning)>", cleaned, re.IGNORECASE)
    if opened:
        cleaned = cleaned[: opened.start()]
    return cleaned.strip()


def _openai_reply(system_text, history, model, max_tokens, base_url, effort=EFFORT):
    """One turn against any OpenAI-compatible endpoint — Groq, OpenRouter, Ollama.

    `urllib` rather than a second SDK, for the same reason omise.py and storage.py use it: one
    HTTP style in the codebase and no new dependency for one POST.

    Exists for testing without a bill. It has no prompt caching and no effort control, so the
    cost report will read zero cached tokens — correct, not broken. A small free model also
    follows the safety rules less reliably than Opus 5, which is why the admin help text says
    to use this for checking the plumbing, not for real users.
    """
    key = os.getenv("OPENAI_API_KEY", "") or os.getenv("CHAT_API_KEY", "")
    headers = {
        "Content-Type": "application/json",
        # Required, not cosmetic. urllib sends "Python-urllib/3.x" by default, which Groq's
        # Cloudflare edge rejects outright with HTTP 403 "error code: 1010" before the request
        # ever reaches the API — a failure that looks nothing like a bad key.
        "User-Agent": USER_AGENT,
    }
    if key:
        # Ollama needs none; every hosted provider does.
        headers["Authorization"] = f"Bearer {key}"

    parameters = {
        "model": model,
        "messages": [{"role": "system", "content": system_text}, *history],
    }
    if model.startswith("gpt-5.6"):
        parameters.update(max_completion_tokens=max_tokens, reasoning_effort=effort)
    else:
        parameters["max_tokens"] = max_tokens
    payload = json.dumps(parameters).encode()
    request = Request(f"{base_url.rstrip('/')}/chat/completions", data=payload, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode()[:200] if exc.fp else ""
        raise ChatUnavailable(f"http_{exc.code}: {detail}") from exc
    except Exception as exc:  # noqa: BLE001 - timeouts, DNS, TLS
        raise ChatUnavailable(f"unreachable: {exc}") from exc

    try:
        text = _strip_reasoning(body["choices"][0]["message"]["content"] or "")
    except (KeyError, IndexError, TypeError) as exc:
        raise ChatUnavailable(f"unexpected_response: {str(body)[:160]}") from exc
    if not text:
        raise ChatUnavailable("empty_response")

    usage = body.get("usage") or {}
    return text, {
        "input_tokens": usage.get("prompt_tokens", 0) or 0,
        "cached_input_tokens": ((usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0) or 0),
        "cache_write_tokens": 0,
        "output_tokens": usage.get("completion_tokens", 0) or 0,
    }


def _gemini_reply(system_text, history, model, max_tokens):
    """One turn against the Google Gemini REST API.

    Uses `gemini-2.5-flash` by default with `system_instruction` support and token usage tracking.
    """
    # Deliberately not falling back to `CHAT_API_KEY` — see `chat_enabled`. If the two lookups
    # disagreed, a deployment could be told the feature was off and still have it answer.
    key = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
    if not key:
        raise ChatUnavailable("gemini_api_key_missing")

    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }

    contents = []
    for item in history:
        role = "model" if item.get("role") in ("assistant", "model") else "user"
        contents.append({
            "role": role,
            "parts": [{"text": item.get("content", "")}],
        })

    payload_dict = {
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.3,
        },
    }
    if system_text and system_text.strip():
        payload_dict["system_instruction"] = {
            "parts": [{"text": system_text.strip()}]
        }

    payload = json.dumps(payload_dict).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    request = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode()[:200] if exc.fp else ""
        raise ChatUnavailable(f"http_{exc.code}: {detail}") from exc
    except Exception as exc:  # noqa: BLE001 - timeouts, DNS, TLS
        raise ChatUnavailable(f"unreachable: {exc}") from exc

    try:
        candidate = body["candidates"][0]
        text = candidate["content"]["parts"][0]["text"]
        text = _strip_reasoning(text)
    except (KeyError, IndexError, TypeError) as exc:
        raise ChatUnavailable(f"unexpected_response: {str(body)[:160]}") from exc
    if not text:
        raise ChatUnavailable("empty_response")

    usage = body.get("usageMetadata") or {}
    return text, {
        "input_tokens": usage.get("promptTokenCount", 0) or 0,
        "cached_input_tokens": usage.get("cachedContentTokenCount", 0) or 0,
        "cache_write_tokens": 0,
        "output_tokens": usage.get("candidatesTokenCount", 0) or 0,
    }


def reply(system_text, history, model=MODEL, effort=EFFORT, max_tokens=MAX_TOKENS,
          provider="gemini", base_url=""):
    """One turn. Returns `(text, usage_dict)`.

    `system_text` is the whole cached prefix — `system_prompt()` output plus the scan's
    numbers — assembled by the caller, which is the only place that knows both the admin
    settings and which scan this conversation is about.

    `history` is `[{"role": ..., "content": ...}]` already trimmed by the caller, ending with
    the user's new question. The model and its parameters are passed in because they are set
    in the admin; the constants above are the fallback for a database with no settings row.
    """
    if provider == "gemini":
        return _gemini_reply(system_text, history, model, max_tokens)

    if provider == "openai":
        return _openai_reply(system_text, history, model, max_tokens, base_url, effort=effort)

    client = _client()
    try:
        message = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            output_config={"effort": effort},
            # One cache breakpoint at the end of the system block. Prompt plus measurements is
            # ~1,400 tokens, comfortably over Opus 5's 512-token cache minimum, and it is
            # byte-identical for every turn in a conversation — so turn 2 onward reads it at a
            # tenth the price.
            system=[{
                "type": "text",
                "text": system_text,
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
        # Billed at 1.25x input and paid on the first turn of every conversation. Left out, the
        # cost report reads low against the real invoice.
        "cache_write_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        "output_tokens": getattr(usage, "output_tokens", 0) or 0,
    }


def title_for(question):
    """A thread title from the first question — no second model call to name a chat."""
    clean = " ".join(question.split())
    return clean[:117] + "…" if len(clean) > 120 else clean


def chat_enabled():
    """Whether free-text chat can run at all, for the provider currently selected.

    Asked before a question is accepted so the client can say the feature is off, rather than
    letting every message come back 503.
    """
    if not settings.CHAT_ENABLED:
        return False
    from .models import ChatSetting

    config = ChatSetting.current()
    if config.provider == ChatSetting.Provider.GEMINI:
        # `CHAT_API_KEY` used to count here as a third fallback, and it was the wrong kind of
        # generous. That variable is where the OpenAI-compatible providers keep their key, so a
        # Groq key sitting in it made this answer True, the client offered a working chat box,
        # and every message came back 502 from Google saying "API key not valid" — a failure
        # that reads as the feature being broken rather than as a key in the wrong slot. The
        # admin help text has always named GEMINI_API_KEY and GOOGLE_API_KEY for this provider;
        # this is the check catching up with what it promised.
        return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    if config.provider == ChatSetting.Provider.OPENAI:
        if "api.openai.com" in config.base_url:
            return bool(os.getenv("OPENAI_API_KEY") or os.getenv("CHAT_API_KEY"))
        # Compatible providers differ: Ollama needs no key, and any hosted-key failure is
        # reported by that provider instead of guessed from the URL here.
        return bool(config.base_url.strip())
    return bool(os.getenv("ANTHROPIC_API_KEY"))
