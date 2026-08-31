"""The one place a face photograph leaves this system.

Everything else in the backend works on derived numbers: `analysis_engine` measures the image
and keeps the measurements, `chat.py` forwards twelve of them and says so in its docstring,
`simulation_engine` renders locally. This module sends the front photograph itself to an
external model, which is a different kind of disclosure — a measurement can be argued to be
*about* a face without being *of* one, and an image carries everything the subject never chose
to have measured.

So the rules here are stricter than anywhere else, and they are enforced in code rather than
documented and hoped for:

* **`analyze()` will not run without a consent row.** Not a check the caller is asked to
  remember — the function takes a user, resolves `ConsentEvent.Purpose.SKIN_VISION` itself, and
  raises if it is absent or withdrawn. A caller that forgets the check gets an exception, not a
  quiet upload.
* **The numbers come from `skin_engine`, not from the model.** The model is asked to describe
  what the measured values look like on the face in front of it, never to produce a value that
  will be stored or trended. Ask the same photograph twice and the wording moves; a trend line
  built on that would be reporting the model's variance as the user's skin.
* **The output shape is fixed by a schema**, so a model that starts narrating, diagnosing, or
  rating attractiveness fails validation rather than reaching a screen.

If a provider is unreachable, refuses, or answers off-schema, the caller still has the local
measurements. Vision is an addition to the analysis, never the analysis itself.
"""

import base64
import json
import os
from functools import lru_cache

from .consent import granted
from .models import ConsentEvent

# The wording the user agreed to. Bumping this makes previously-granted consent stale, which is
# the point: new terms need a new agreement, not an old one stretched to cover them.
SKIN_VISION_CONSENT_VERSION = "2026.1"

# Opus 5's high-resolution tier tops out here on the long edge. Sending more pixels buys no
# detail the model can use and is billed as though it did.
MAX_EDGE_PX = 2576
# JPEG rather than PNG on the wire: a face photograph is a photograph, and lossless encoding
# triples the upload for detail the model discards.
JPEG_QUALITY = 90

MODEL = "claude-opus-5"
# Enough for a structured description of six signals. Vision replies are short by construction
# here — the schema has no free-text field longer than a couple of sentences.
MAX_TOKENS = 1500
# Reading a photograph against six pre-computed numbers is not agentic work. Medium keeps the
# wait inside gunicorn's window while leaving room for the model to actually look.
EFFORT = "medium"
# Must stay well under gunicorn's --timeout (60, see backend/Dockerfile) so the caller's error
# handling runs instead of the worker being killed mid-request. Same reasoning as chat.py.
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_RETRIES = 1


class SkinVisionUnavailable(RuntimeError):
    """The external model could not be reached, refused, or answered off-schema."""


class SkinVisionNotConsented(PermissionError):
    """No current consent to send this user's photograph. Never caught and retried."""


# What the model may return, and nothing else. Every field is a description of something the
# local engine already measured, so there is no room for a finding invented from the image
# alone. `additionalProperties: false` is what makes that binding rather than advisory.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "Two sentences describing what is visible, in the user's language.",
        },
        "observations": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "signal": {
                        "type": "string",
                        "enum": [
                            "undereye_shadow", "tone_spread", "cheek_redness",
                            "nose_redness", "tzone_shine", "texture",
                        ],
                    },
                    "reading": {
                        "type": "string",
                        "description": "What this measurement looks like on this face, one sentence.",
                    },
                    "care": {
                        "type": "string",
                        "description": "One reversible everyday step, or an empty string if none applies.",
                    },
                },
                "required": ["signal", "reading", "care"],
                "additionalProperties": False,
            },
        },
        "limits": {
            "type": "string",
            "description": "What this photograph could not show, one sentence.",
        },
    },
    "required": ["summary", "observations", "limits"],
    "additionalProperties": False,
}


SYSTEM_PROMPT = """You describe what is visible in one photograph of a face, alongside measurements already taken from it. You are not a clinician and this is not a diagnosis.

The measurements are given to you. They were computed by comparing one region of this same photograph against another, so lighting cancels out. Your job is to say what those numbers look like on this face and what everyday step relates to each — not to re-measure, and not to contradict them.

Hard limits, in order of importance:

1. Never name a condition. Not acne, melasma, rosacea, eczema, dermatitis, hyperpigmentation, or any other diagnosis — in any language. Name what is visible instead: "redness across the cheeks", not "rosacea". If you think something needs a clinician, say the visible thing and that a professional can look at it.
2. Never judge attractiveness, and never rank this face against anyone. No beauty, no "flaws", no "problem areas", no scores. These measurements have no population to compare against, so any comparison you make would be invented.
3. Write "what shows in this photo" rather than "you have". A photograph on one day is not a person.
4. Care suggestions must be reversible and need no clinician: sun protection, sleep, hydration, gentle cleansing, not touching the face, makeup removal, photography conditions. Never a product brand, an active ingredient regimen, a procedure, or a supplement. If nothing honest applies to a signal, return an empty string.
5. If the measurements say a signal is unremarkable, say so plainly. Manufacturing a concern is the failure mode that matters most here.

Answer in the requested language."""


@lru_cache(maxsize=1)
def _client():
    """Built once; the SDK holds a connection pool worth reusing."""
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise SkinVisionUnavailable("anthropic_api_key_missing")
    try:
        from anthropic import Anthropic
    except ImportError as exc:  # pragma: no cover - dependency is in requirements.txt
        raise SkinVisionUnavailable("anthropic_sdk_missing") from exc
    return Anthropic(api_key=key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=MAX_RETRIES)


def configured():
    """Whether the feature can run at all, for the session payload."""
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def provider_label():
    """Who receives the photograph, for the consent screen.

    Read from configuration rather than written into the client, for the same reason
    `views._chat_provider_label` is: a screen that names the wrong recipient is a false
    statement about where a user's face went.
    """
    return "Anthropic (Claude)"


def _encode(image):
    """Downscale to the model's useful ceiling and JPEG-encode."""
    import cv2

    height, width = image.shape[:2]
    longest = max(height, width)
    if longest > MAX_EDGE_PX:
        scale = MAX_EDGE_PX / longest
        image = cv2.resize(
            image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA,
        )
    ok, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
    if not ok:
        raise SkinVisionUnavailable("encode_failed")
    return base64.standard_b64encode(buffer.tobytes()).decode("ascii")


def _measurement_block(skin, locale):
    """The local engine's numbers, as the model's factual ground."""
    signals = (skin or {}).get("signals") or {}
    lines = [
        "Measurements from this photograph (regional comparisons, not absolute values;",
        "positive means the first-named region differs from its reference region):",
    ]
    for key, value in signals.items():
        lines.append(f"- {key}: {'not measurable' if value is None else value}")
    advisories = (skin or {}).get("advisories") or []
    if advisories:
        lines.append(f"Capture problems that limit what can be read: {', '.join(advisories)}")
    lines.append(f"Answer in {'Thai' if locale != 'en' else 'English'}.")
    return "\n".join(lines)


def analyze(user, image, skin, locale="th"):
    """Describe `image` against `skin`, for a user who has consented.

    Raises `SkinVisionNotConsented` when the consent is missing or withdrawn — checked here
    rather than at the call site so that forgetting the check cannot silently upload a face.
    Raises `SkinVisionUnavailable` for every transport, refusal and schema failure, which the
    caller is expected to degrade past rather than surface as a broken page.
    """
    if not granted(user, ConsentEvent.Purpose.SKIN_VISION):
        raise SkinVisionNotConsented("skin_vision_not_consented")

    client = _client()
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            thinking={"type": "adaptive"},
            output_config={
                "effort": EFFORT,
                "format": {"type": "json_schema", "schema": RESPONSE_SCHEMA},
            },
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT,
                # The prompt is identical for every user and every scan, so one breakpoint here
                # makes it a cache read after the first call of a session.
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": _encode(image),
                        },
                    },
                    {"type": "text", "text": _measurement_block(skin, locale)},
                ],
            }],
        )
    except (SkinVisionUnavailable, SkinVisionNotConsented):
        raise
    except Exception as exc:  # noqa: BLE001 - the SDK raises a family of transport/API errors
        raise SkinVisionUnavailable(str(exc)) from exc

    # Checked before `content` is read, not after. A refusal returns HTTP 200 with an empty or
    # partial content list, so indexing into it first is how this becomes an IndexError in
    # production instead of a handled degradation.
    if getattr(message, "stop_reason", None) == "refusal":
        raise SkinVisionUnavailable("refused")

    text = "".join(
        block.text for block in message.content if getattr(block, "type", None) == "text"
    ).strip()
    if not text:
        raise SkinVisionUnavailable("empty_response")
    try:
        payload = json.loads(text)
    except ValueError as exc:
        raise SkinVisionUnavailable("unparseable_response") from exc
    if not isinstance(payload, dict) or "summary" not in payload:
        raise SkinVisionUnavailable("unexpected_response_shape")

    usage = getattr(message, "usage", None)
    payload["provider"] = provider_label()
    payload["model"] = MODEL
    payload["usage"] = {
        "input_tokens": getattr(usage, "input_tokens", 0) or 0,
        "output_tokens": getattr(usage, "output_tokens", 0) or 0,
    }
    return payload
