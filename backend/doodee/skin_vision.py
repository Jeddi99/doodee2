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
  rating attractiveness fails validation rather than reaching a screen. Gemini's `responseSchema`
  is an OpenAPI subset that has no `additionalProperties`, so the closed-shape half of that
  promise is re-checked here in `_validate` rather than being quietly dropped with the keyword.
* **`SKIN_VISION_ENABLED` gates the whole path**, defaulting to off. Google's free tier may use
  submitted content to improve its models, and what this module submits is a photograph of a
  face — a materially different exposure from the twelve numbers `chat.py` sends. Leave this off
  until the project's Gemini access is on a paid tier that excludes training.

If a provider is unreachable, refuses, or answers off-schema, the caller still has the local
measurements. Vision is an addition to the analysis, never the analysis itself.
"""

import base64
import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .consent import granted
from .models import ConsentEvent

# The wording the user agreed to. Bumping this makes previously-granted consent stale, which is
# the point: new terms need a new agreement, not an old one stretched to cover them.
SKIN_VISION_CONSENT_VERSION = "2026.1"

# Gemini bills an image as 768x768 tiles at 258 tokens each, so the cost step is the tile count
# rather than the pixel count: a 2,576px long edge is 4x3 tiles on a portrait frame regardless of
# what sits between the tile boundaries. Kept at the previous ceiling because lowering it trades
# away exactly the fine skin texture this module exists to read.
MAX_EDGE_PX = 2576
# JPEG rather than PNG on the wire: a face photograph is a photograph, and lossless encoding
# triples the upload for detail the model discards.
JPEG_QUALITY = 90

MODEL = "gemini-2.5-flash"
# Recorded on every payload and on the AI ledger row, so a cost report and a consent screen can
# both name the actual recipient rather than a provider someone remembers configuring.
PROVIDER = "gemini"
# Enough for a structured description of six signals. Vision replies are short by construction
# here — the schema has no free-text field longer than a couple of sentences.
MAX_TOKENS = 1500
# Low, not zero. The task is reading fixed numbers off a photograph; sampling variance here would
# show up as a trend line that moves when the skin did not.
TEMPERATURE = 0.2
# Must stay well under gunicorn's --timeout (60, see backend/Dockerfile) so the caller's error
# handling runs instead of the worker being killed mid-request. Same reasoning as chat.py.
REQUEST_TIMEOUT_SECONDS = 30.0
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


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


def _api_key():
    """The Gemini key, or a refusal naming which variable is missing.

    Same two names `chat.py` accepts, and deliberately *not* falling back to `CHAT_API_KEY`:
    that variable selects an OpenAI-compatible provider, and silently sending a face to whatever
    endpoint it points at is the exact disclosure this module exists to control.
    """
    key = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
    if not key:
        raise SkinVisionUnavailable("gemini_api_key_missing")
    return key


def enabled():
    """The deliberate switch, separate from having a key.

    Off by default. A key being present means the request *could* be made; this means someone
    decided it should be. The two are separate because the free tier is the one you get by
    default, and on it Google may use submitted content to improve its models — which for this
    module means a user's face, not a sentence.
    """
    return os.getenv("SKIN_VISION_ENABLED", "false").lower() == "true"


def configured():
    """Whether the feature can run at all, for the session payload."""
    return enabled() and bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))


def provider_label():
    """Who receives the photograph, for the consent screen.

    Read from configuration rather than written into the client, for the same reason
    `views._chat_provider_label` is: a screen that names the wrong recipient is a false
    statement about where a user's face went.
    """
    return "Google (Gemini)"


# Gemini's `responseSchema` is an OpenAPI 3.0 subset: it has no `additionalProperties`, and sending
# one is rejected rather than ignored. Stripping the keyword on the way out is only safe because
# `_validate` re-checks the same closure on the way back — see the module docstring.
_SCHEMA_KEYS = frozenset({
    "type", "description", "enum", "items", "properties", "required", "maxItems", "minItems",
})


def _gemini_schema(schema):
    """The response schema, minus the keywords Gemini rejects."""
    if not isinstance(schema, dict):
        return schema
    out = {}
    for key, value in schema.items():
        if key not in _SCHEMA_KEYS:
            continue
        if key == "properties":
            out[key] = {name: _gemini_schema(sub) for name, sub in value.items()}
        elif key == "items":
            out[key] = _gemini_schema(value)
        else:
            out[key] = value
    return out


def _validate(payload):
    """Enforce the parts of RESPONSE_SCHEMA the provider cannot.

    Raises rather than repairing. A response that carries a field nobody designed is a model
    doing something this module did not ask for, and the honest reaction to that is to fall back
    to the local measurements — not to keep the parts that happen to parse.
    """
    if not isinstance(payload, dict):
        raise SkinVisionUnavailable("unexpected_response_shape")
    allowed = set(RESPONSE_SCHEMA["properties"])
    if set(payload) - allowed or not allowed.issubset(payload):
        raise SkinVisionUnavailable("unexpected_response_shape")
    if not isinstance(payload["summary"], str) or not isinstance(payload["limits"], str):
        raise SkinVisionUnavailable("unexpected_response_shape")

    item_schema = RESPONSE_SCHEMA["properties"]["observations"]["items"]
    fields = set(item_schema["properties"])
    signals = set(item_schema["properties"]["signal"]["enum"])
    observations = payload["observations"]
    if not isinstance(observations, list):
        raise SkinVisionUnavailable("unexpected_response_shape")
    if len(observations) > RESPONSE_SCHEMA["properties"]["observations"]["maxItems"]:
        raise SkinVisionUnavailable("unexpected_response_shape")
    for item in observations:
        if not isinstance(item, dict) or set(item) != fields:
            raise SkinVisionUnavailable("unexpected_response_shape")
        if item["signal"] not in signals:
            raise SkinVisionUnavailable("unexpected_response_shape")
        if not all(isinstance(item[name], str) for name in ("reading", "care")):
            raise SkinVisionUnavailable("unexpected_response_shape")
    return payload


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
    # Re-checked here and not only in `queue_skin_vision`, for the same reason consent is: this
    # is the last line before the photograph is on the wire, and a caller that reaches it with
    # the feature switched off should get an exception rather than a silent upload.
    if not enabled():
        raise SkinVisionUnavailable("skin_vision_disabled")

    key = _api_key()
    body = json.dumps({
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{
            "role": "user",
            "parts": [
                {"inline_data": {"mime_type": "image/jpeg", "data": _encode(image)}},
                {"text": _measurement_block(skin, locale)},
            ],
        }],
        "generationConfig": {
            "maxOutputTokens": MAX_TOKENS,
            "temperature": TEMPERATURE,
            "responseMimeType": "application/json",
            "responseSchema": _gemini_schema(RESPONSE_SCHEMA),
        },
    }).encode()

    request = Request(
        f"{API_BASE}/{MODEL}:generateContent?key={key}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload_body = json.loads(response.read().decode())
    except HTTPError as exc:
        # The key rides in the query string, so the URL is never echoed into an exception here.
        detail = exc.read().decode()[:200] if exc.fp else ""
        raise SkinVisionUnavailable(f"http_{exc.code}: {detail}") from exc
    except Exception as exc:  # noqa: BLE001 - timeouts, DNS, TLS
        raise SkinVisionUnavailable(f"unreachable: {exc}") from exc

    # Checked before `candidates` is read, not after. A photograph blocked by Google's safety
    # filters comes back HTTP 200 with no candidates at all, so indexing first is how this
    # becomes a KeyError in production instead of a handled degradation.
    blocked = (payload_body.get("promptFeedback") or {}).get("blockReason")
    if blocked:
        raise SkinVisionUnavailable(f"blocked: {blocked}")
    candidates = payload_body.get("candidates") or []
    if not candidates:
        raise SkinVisionUnavailable("empty_response")
    finish = candidates[0].get("finishReason")
    if finish and finish not in ("STOP", "MAX_TOKENS"):
        raise SkinVisionUnavailable(f"refused: {finish}")

    text = "".join(
        part.get("text", "")
        for part in ((candidates[0].get("content") or {}).get("parts") or [])
    ).strip()
    if not text:
        raise SkinVisionUnavailable("empty_response")
    try:
        payload = json.loads(text)
    except ValueError as exc:
        raise SkinVisionUnavailable("unparseable_response") from exc
    _validate(payload)

    usage = payload_body.get("usageMetadata") or {}
    payload["provider"] = provider_label()
    payload["model"] = MODEL
    payload["usage"] = {
        "input_tokens": usage.get("promptTokenCount") or 0,
        "output_tokens": usage.get("candidatesTokenCount") or 0,
    }
    return payload
