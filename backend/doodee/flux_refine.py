"""Hosted inpainting for the pixels the LAB pass cannot draw: the skin of the feature itself.

Ported from ``test/flux_refine.py``. That module was written around one procedure and imports the
eyelid geometry directly; this one keeps the transports, the boundary guarantees and the failure
handling verbatim, and takes the mask and the prompt from the caller instead, because doodee2 runs
the same refinement over eyelid folds, hairlines, beard, lesions and nasolabial grooves.

Two refinement kinds, answering two different objections to the deterministic pass:

``polish`` keeps what OpenCV drew and asks the network to re-render it as skin. The geometry decides
where the feature is, how many there are and how dark; the network only supplies pores, the way skin
creases along a fold, and the shadow lashes throw into it. Its answer is blended back at ``BLEND``
so the feature cannot drift off the line the geometry chose -- Fill has no strength parameter, it
repaints its mask outright, so the only way to ask for "a little" is to mix the answer ourselves.

``fill`` gives up on drawing. The region is handed over as a mask shaped like the feature and the
network builds one. The mask still says how many features there are and where each sits, because a
mask is an instruction, not a suggestion.

``erase`` removes what is inside the mask and closes the skin over it -- lesions, tattoo ink, hair.

What keeps the edit local, in order of how much it can be trusted:

1. Only a box around the feature is uploaded. Everything outside it cannot change because the
   service never receives it.
2. Inside that box the mask is white only on the feature. Fill's contract is that black is
   preserved, so the iris, sclera, lashes and brow stay as photographed.
3. The returned crop is composited through a feathered alpha, which softens the seam and discards
   anything the model painted outside the mask.

Only the first is a guarantee rather than a promise, which is why the crop is drawn as tightly as
the model can still work with.

Two transports reach the same models, chosen by whichever key is present:

- ``bfl`` talks to api.bfl.ai directly, submit-then-poll, ``x-key`` auth. Its Erase endpoint has no
  equivalent anywhere else, so this is the only transport where ``erase`` uses a purpose-built
  eraser rather than Fill told to paint clean skin.
- ``gateway`` talks to Vercel AI Gateway's OpenAI-compatible ``/v1/images/edits``, one synchronous
  multipart call, ``Authorization: Bearer`` auth. Mask polarity is inverted there: OpenAI's contract
  is that the *transparent* part is replaced, the opposite of Fill's "white is repainted", so the
  mask is re-encoded as an alpha channel on the way out.

Unlike the prototype, a missing key here is not an error. doodee2 has a complete deterministic
renderer underneath, and a preview that already looks right must not start failing because a paid
key expired -- callers ask :func:`available` first and keep the OpenCV result when it says no. What
is still an error is a key that exists and a call that goes wrong: a silently degraded result that
looks like a paid one is worse than an error.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import time
import urllib.error
import urllib.request

import cv2
import numpy as np

from .envfile import load_env

logger = logging.getLogger(__name__)


# Also called from config/settings.py, and idempotent. Repeated here because the constants just
# below read the environment at import time, and this module is importable without Django -- the
# benchmark and a bare `python -c` both do it, and both need the key.
load_env()

BASE = os.getenv("BFL_API_BASE", "https://api.bfl.ai")
FILL_PATH = "/v1/flux-pro-1.0-fill"
ERASE_PATH = "/v1/flux-tools/erase-v1"

GATEWAY_BASE = os.getenv("AI_GATEWAY_BASE", "https://ai-gateway.vercel.sh/v1")
GATEWAY_MODEL = os.getenv("GATEWAY_MODEL", "bfl/flux-pro-1.0-fill")
# Documented as image-in/image-out with no mask parameter. Data rather than a comment because
# _send() has to refuse a masked kind on them before spending a call, not after reading a warning.
MASKLESS_MODELS = frozenset({"bfl/flux-2-max", "bfl/flux-2-pro", "bfl/flux-2-flex",
                             "bfl/flux-kontext-max", "bfl/flux-kontext-pro"})

CROP_PAD = 0.25      # box around the feature, as a share of its width
BLEND = 0.45         # how much of a *polish* answer survives; the stand-in for a strength param
REPLACE_BLEND = 1.0  # fill and erase replace rather than adjust, so their answer is kept whole
UPLOAD_BLOCK = 16    # the sent size is snapped to a multiple of this so no model has rounding of
                     # its own left to do. 16, not 8: Fill rounds to 8 but flux-2-max was observed
                     # rounding to 16 (1024x507 sent, 1024x496 returned).
UPLOAD_WIDTH = 1024  # the crop is enlarged to at least this wide before it is sent: a fold band at
UPLOAD_MAX = 3.0     # native size is a few pixels tall, too little for any model to build skin in.
UPLOAD_MIN_CROP = 256  # the gateway rejects either source dimension below this.
STEPS = 50
GUIDANCE = 30.0
SEED = 1             # fixed, so the same request is the same picture -- what makes a saved
                     # simulation reproducible and a before/after comparison meaningful
POLL_INTERVAL = 1.0
POLL_TIMEOUT = 90.0
TRANSPORT_TRIES = 3   # attempts at getting *any* reply. Dropped connections only, never a reply
                      # the service actually sent.
RATE_LIMIT_TRIES = 4  # a rejected 429 was not billed; honour Retry-After before giving up
RATE_LIMIT_BACKOFF = 20.0

# Locked here and never taken from a caller, and looked up by key so nothing reaching the HTTP layer
# can carry text from a request body. A user-supplied prompt on a paid face endpoint is both a way
# to spend the key on something else and a way to trip the provider's moderation.
PROMPTS = {
    "eyelid_fold": (
        "upper eyelid skin along an existing crease, real skin texture with fine pores, the fold "
        "reading as creased skin rather than a painted shadow, photographic, sharp focus, "
        "eyelashes unchanged"),
    "eyelid_fold_build": (
        "a natural upper eyelid crease on the eyelid skin, soft shadow inside the fold and a subtle "
        "highlight on the skin just above it, real skin texture with fine pores, photographic, "
        "sharp focus, no makeup, eyelashes unchanged"),
    "under_eye_skin": (
        "smooth lower eyelid skin with the puffiness settled, even tone, fine pores, natural "
        "transition into the cheek, photographic, sharp focus"),
    "smooth_skin": (
        "clean even facial skin, fine pores, natural tone, no blemish and no scar, photographic, "
        "sharp focus"),
    "fold_softened": (
        "cheek skin where a deep fold has softened, the crease shallower but still natural, fine "
        "pores, even tone, photographic, sharp focus"),
    "dimple_fold": (
        "a natural cheek dimple, a short soft crease in the skin with gentle shadow inside it, "
        "real skin texture with fine pores, photographic, sharp focus"),
    "hairline": (
        "a natural frontal hairline, individual fine hair strands at the temple and forehead edge, "
        "matching the existing hair colour and direction, photographic, sharp focus"),
    "facial_hair": (
        "natural facial hair, individual fine strands following the growth direction, matching the "
        "existing hair colour, real skin visible between the strands, photographic, sharp focus"),
    "hair_removed": (
        "clean shaven facial skin with no hair, even skin tone, fine pores, photographic, "
        "sharp focus"),
    # The default every OpenCV-drawn row falls back to, ported verbatim in intent from
    # test/procedure_render.py's "polish". It is written to preserve rather than to create: the
    # deterministic pass has already decided the shape, the depth and the colour, and the only job
    # left is to make that read as photographed skin instead of a painted region. A prompt that
    # named a feature (the way "smooth_skin" names a blemish) would let the model act on rows it
    # was never chosen for -- "no blemish and no scar" over a cheek tone pass removes real moles.
    "surface_polish": (
        "preserve the exact local shape, crease position, amount of softening and colour already "
        "visible in the input; restore natural photographic pores and healed skin texture only "
        "inside the marked area; do not add or remove anatomy, folds, makeup, redness, hair, "
        "labels, arrows, text, numbers or symbols; identity unchanged"),
}


def _gateway_key():
    return os.getenv("AI_GATEWAY_API_KEY") or os.getenv("AI_GATEWAY_TOKEN") or os.getenv("OPENAI_API_KEY")


def _bfl_key():
    return os.getenv("BFL_API_KEY")


def backend():
    """Which transport this run would use, or None when no key is configured.

    ``FLUX_BACKEND`` forces one; otherwise the key decides. Unlike the prototype this returns None
    rather than raising, because "no key" is a supported deployment here and every caller has a
    deterministic result in hand already.
    """
    forced = os.getenv("FLUX_BACKEND")
    if forced:
        if forced not in ("bfl", "gateway"):
            raise ValueError(f"FLUX_BACKEND must be 'bfl' or 'gateway', not {forced!r}")
        if forced == "gateway" and not _gateway_key():
            return None
        if forced == "bfl" and not _bfl_key():
            return None
        return forced
    if _gateway_key():
        return "gateway"
    if _bfl_key():
        return "bfl"
    return None


def capabilities():
    """Provider capability summary, safe to serve to a client. No key material is returned.

    Reading this is also the cheap way to discover a maskless gateway model before a render spends
    a call on one.
    """
    from django.conf import settings

    # SIMULATION_POLISH_ENABLED was already in settings.py, described as the switch for exactly
    # this -- an optional hosted polish over a deterministic local render. It is the flag rather
    # than a second one so there is one answer to "is the paid path on".
    if not getattr(settings, "SIMULATION_POLISH_ENABLED", False):
        return {"ready": False, "backend": None, "model": None, "masked_edits": False,
                "reason": "disabled"}
    try:
        which = backend()
    except ValueError as error:
        return {"ready": False, "backend": None, "model": None, "masked_edits": False,
                "reason": str(error)}
    if which is None:
        return {"ready": False, "backend": None, "model": None, "masked_edits": False,
                "reason": "no_key"}
    model = GATEWAY_MODEL if which == "gateway" else "flux-pro-1.0-fill"
    return {"ready": True, "backend": which, "model": model,
            "masked_edits": not (which == "gateway" and model in MASKLESS_MODELS), "reason": None}


def available() -> bool:
    """True when a refine call would be attempted. Callers check this before building a mask."""
    return bool(capabilities()["ready"])


def _snap(length):
    """`length` rounded to the nearest multiple of UPLOAD_BLOCK, never to zero."""
    return max(UPLOAD_BLOCK, int(round(length / UPLOAD_BLOCK)) * UPLOAD_BLOCK)


def _png_bytes(image):
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("failed to encode an image for upload")
    return buffer.tobytes()


def _png_b64(image):
    return base64.b64encode(_png_bytes(image)).decode("ascii")


def _bfl_request(url, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    request.add_header("x-key", _bfl_key() or "")
    request.add_header("accept", "application/json")
    if data:
        request.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{url} returned {error.code}: "
                           f"{error.read()[:400].decode(errors='replace')}")


def _submit(path, payload):
    answer = _bfl_request(BASE + path, payload)
    # The polling URL is region-specific and the only one guaranteed to know about this job, so it
    # is used as returned rather than rebuilt from BASE.
    url = answer.get("polling_url")
    if not url:
        raise RuntimeError(f"{path} gave no polling_url: {answer}")
    return url


def _collect(polling_url):
    """Poll until Ready, then fetch. Delivery links expire in minutes, so the bytes are pulled
    immediately and never handed onward as a URL."""
    deadline = time.monotonic() + POLL_TIMEOUT
    while True:
        answer = _bfl_request(polling_url)
        status = answer.get("status")
        if status == "Ready":
            sample = (answer.get("result") or {}).get("sample")
            if not sample:
                raise RuntimeError(f"job reported Ready with no image: {answer}")
            with urllib.request.urlopen(sample, timeout=60) as response:
                raw = np.frombuffer(response.read(), dtype=np.uint8)
            image = cv2.imdecode(raw, cv2.IMREAD_COLOR)
            if image is None:
                raise RuntimeError("the delivered image could not be decoded")
            return image
        if status not in ("Pending", "Queued", "Processing", "Request Accepted"):
            raise RuntimeError(f"job failed with status {status!r}: {answer}")
        if time.monotonic() > deadline:
            raise RuntimeError(f"job still {status!r} after {POLL_TIMEOUT:.0f}s")
        time.sleep(POLL_INTERVAL)


def _multipart(fields, files):
    """Encode a form the way `/v1/images/edits` wants it. urllib has no multipart writer."""
    boundary = "----doodee" + os.urandom(16).hex()
    parts = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
                     f'{value}\r\n'.encode("utf-8"))
    for name, (filename, blob) in files.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
                     f'filename="{filename}"\r\nContent-Type: image/png\r\n\r\n'.encode("utf-8"))
        parts.append(blob)
        parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def _alpha_mask(image, mask):
    """A white mask re-encoded the way OpenAI's edits endpoint reads one.

    Fill's contract is "white is repainted"; the edits endpoint's is "the transparent part is
    replaced". So the same geometry goes up as an alpha channel, inverted. The colour channels carry
    the crop rather than black: a model that reads the mask as a plain image then still sees the
    photograph, which turns a silent misread into a mild one.
    """
    return _png_bytes(np.dstack([image, 255 - mask]))


def _warnings(answer):
    """Every string the response filed under a warning-ish key, flattened.

    The gateway's documented behaviour for a model that cannot mask is to warn and edit the whole
    image anyway. That is exactly the failure this module refuses to ship, so the warning has to be
    read rather than ignored -- and since the field name is not contractual, anything
    warning-shaped counts.
    """
    found = []

    def walk(node, warned):
        if isinstance(node, dict):
            for key, value in node.items():
                walk(value, warned or "warn" in key.lower())
        elif isinstance(node, list):
            for value in node:
                walk(value, warned)
        elif warned and isinstance(node, str):
            found.append(node)

    walk(answer, False)
    return found


def _gateway_edit(model, prompt, sent, sent_mask):
    """One synchronous `/v1/images/edits` call. Returns the edited crop as BGR."""
    fields = {"model": model, "prompt": prompt, "n": "1", "response_format": "b64_json"}
    files = {"image": ("image.png", _png_bytes(sent))}
    if sent_mask is not None:
        files["mask"] = ("mask.png", _alpha_mask(sent, sent_mask))
    body, content_type = _multipart(fields, files)

    # Dropped transports and rejected rate-limit requests are retried separately. A 429 did not run
    # inference, so respecting Retry-After cannot double-bill; every other HTTP reply (validation,
    # moderation, auth) is terminal. A dropped socket may have been billed, which is why that retry
    # budget stays small.
    answer = None
    transport_attempt = rate_attempt = 0
    while answer is None:
        request = urllib.request.Request(GATEWAY_BASE + "/images/edits", data=body, method="POST")
        request.add_header("Authorization", "Bearer " + (_gateway_key() or ""))
        request.add_header("Content-Type", content_type)
        request.add_header("accept", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=POLL_TIMEOUT + 30) as response:
                answer = json.loads(response.read())
            break
        except urllib.error.HTTPError as error:
            detail = error.read()[:400].decode(errors="replace")
            if error.code == 429 and rate_attempt < RATE_LIMIT_TRIES - 1:
                header = error.headers.get("Retry-After") if error.headers else None
                try:
                    delay = float(header) if header else RATE_LIMIT_BACKOFF * (rate_attempt + 1)
                except (TypeError, ValueError):
                    delay = RATE_LIMIT_BACKOFF * (rate_attempt + 1)
                rate_attempt += 1
                time.sleep(min(60.0, max(1.0, delay)))
                continue
            raise RuntimeError(f"images/edits returned {error.code}: {detail}")
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            transport_attempt += 1
            if transport_attempt >= TRANSPORT_TRIES:
                raise RuntimeError(
                    f"images/edits never answered after {TRANSPORT_TRIES} tries: {error}")
            time.sleep(POLL_INTERVAL * transport_attempt)

    if sent_mask is not None:
        ignored = [text for text in _warnings(answer) if "mask" in text.lower()]
        if ignored:
            raise RuntimeError(f"{model} did not honour the mask, so it chose the feature placement "
                               f"itself: {ignored}")

    data = answer.get("data") or []
    if not data:
        raise RuntimeError(f"images/edits returned no image: {str(answer)[:400]}")
    encoded = data[0].get("b64_json")
    if encoded:
        raw = np.frombuffer(base64.b64decode(encoded), dtype=np.uint8)
    elif data[0].get("url"):
        with urllib.request.urlopen(data[0]["url"], timeout=60) as response:
            raw = np.frombuffer(response.read(), dtype=np.uint8)
    else:
        raise RuntimeError(f"images/edits returned neither b64_json nor url: {str(data[0])[:400]}")
    image = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError("the delivered image could not be decoded")
    return image


def _box(mask, shape):
    """The local upload box, padded enough for provider dimensions and anatomical context."""
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    pad = int((xs.max() - xs.min()) * CROP_PAD)
    height, width = shape[:2]
    top, bottom = max(0, ys.min() - pad), min(height, ys.max() + pad + 1)
    left, right = max(0, xs.min() - pad), min(width, xs.max() + pad + 1)

    def expand(start, end, limit):
        target = min(limit, UPLOAD_MIN_CROP)
        missing = max(0, target - (end - start))
        start -= missing // 2
        end += missing - missing // 2
        if start < 0:
            end = min(limit, end - start)
            start = 0
        if end > limit:
            start = max(0, start - (end - limit))
            end = limit
        return int(start), int(end)

    top, bottom = expand(top, bottom, height)
    left, right = expand(left, right, width)
    return top, bottom, left, right


def _send(kind, sent, sent_mask, prompt):
    """The one call, on whichever transport this run resolved to."""
    if backend() == "gateway":
        model = GATEWAY_MODEL
        if model in MASKLESS_MODELS:
            # `polish` survives without a mask because the feature is already drawn in `sent` and
            # the feathered composite throws away everything outside it. The other kinds do not:
            # there the mask is the only thing saying where the feature goes.
            if kind != "polish":
                raise RuntimeError(f"{model} takes no mask, so it cannot be trusted with {kind!r}; "
                                   f"set GATEWAY_MODEL=bfl/flux-pro-1.0-fill")
            sent_mask = None
        return _gateway_edit(model, prompt, sent, sent_mask)

    payload = {"prompt": prompt, "image": _png_b64(sent), "mask": _png_b64(sent_mask),
               "seed": SEED, "output_format": "png", "safety_tolerance": 2}
    path = ERASE_PATH if kind == "erase" else FILL_PATH
    if path == FILL_PATH:
        payload.update(steps=STEPS, guidance=GUIDANCE)
    return _collect(_submit(path, payload))


def _apply(image, mask, kind, prompt, blend):
    """Send the masked crop, composite what comes back. `blend` scales the whole change."""
    box = _box(mask, image.shape)
    if box is None:
        return image
    top, bottom, left, right = box
    crop = image[top:bottom, left:right]
    crop_mask = mask[top:bottom, left:right]

    scale = min(UPLOAD_MAX, max(1.0, UPLOAD_WIDTH / max(1, crop.shape[1])))
    # Both sides are snapped before they go up, because every model here quietly rounds its working
    # size and answers at the rounded one. Rounding here rather than unpicking it afterwards is what
    # keeps the feature aligned: the mask is resized by the identical factor, so whatever aspect the
    # rounding costs is spent on image and mask together and the reply maps straight back onto the
    # crop. Correcting a reframe after the fact cannot do that -- snapping by centre-crop and
    # snapping by rescale need opposite inverses and the reply does not say which one it was.
    size = (_snap(crop.shape[1] * scale), _snap(crop.shape[0] * scale))
    sent = cv2.resize(crop, size, interpolation=cv2.INTER_CUBIC)
    # Nearest, or the mask stops being the binary black/white the endpoint contracts for.
    sent_mask = cv2.resize(crop_mask, size, interpolation=cv2.INTER_NEAREST)

    filled = _send(kind, sent, sent_mask, prompt)
    # The snap above should leave nothing to pad, but a model that pads anyway adds its pixels at
    # the far edges, so a small overshoot is trimmed rather than treated as a rescale.
    if (0 <= filled.shape[0] - sent.shape[0] <= UPLOAD_BLOCK
            and 0 <= filled.shape[1] - sent.shape[1] <= UPLOAD_BLOCK):
        filled = filled[:sent.shape[0], :sent.shape[1]]

    # Anything else has to keep the framing it was given. The mask is drawn on the sent geometry, so
    # a reply at a different aspect slides the model's feature off the line the mask marked and the
    # blend smears skin across it instead of along it -- a plausible-looking result built on a
    # misalignment, which is worse than no result. A uniform rescale is fine and resizes back; only
    # a reframe is refused.
    sent_ratio = sent.shape[1] / sent.shape[0]
    reply_ratio = filled.shape[1] / filled.shape[0]
    if abs(reply_ratio - sent_ratio) > 0.02 * sent_ratio:
        raise RuntimeError(f"the model reframed the crop ({sent.shape[1]}x{sent.shape[0]} sent, "
                           f"{filled.shape[1]}x{filled.shape[0]} back); the mask no longer lines up")
    if filled.shape[:2] != crop.shape[:2]:
        filled = cv2.resize(filled, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_AREA)

    alpha = cv2.GaussianBlur(crop_mask.astype(np.float32) / 255.0, (0, 0),
                             max((right - left) * 0.012, 1.0))
    alpha = (alpha * float(blend))[:, :, None]
    result = image.copy()
    composite = crop * (1 - alpha) + filled * alpha
    result[top:bottom, left:right] = np.clip(np.rint(composite), 0, 255).astype(np.uint8)
    return result


def refine(image, mask, kind, prompt_key, blend=None):
    """One bounded refinement. Raises on a configured-but-failing provider; never invents a result.

    The prompt is looked up rather than passed, so no text from a request body can reach the paid
    endpoint. Callers that want a deterministic fallback check :func:`available` first and catch.

    `blend` defaults per kind rather than to one number, because the three kinds are answering
    different questions. `polish` is an adjustment to something OpenCV already drew correctly, and
    must be mixed back at less than full strength or the network is free to drift the feature off
    the line the geometry chose -- that partial mix is the only strength control Fill offers. `fill`
    and `erase` are replacements: there is nothing underneath worth preserving, and compositing a
    built hairline at 45% leaves it half transparent, which reads as a rendering fault rather than
    as a subtle result.
    """
    if kind not in ("erase", "fill", "polish"):
        raise ValueError(f"unsupported FLUX edit kind: {kind}")
    if prompt_key not in PROMPTS:
        raise ValueError(f"unknown FLUX prompt: {prompt_key}")
    if not isinstance(image, np.ndarray) or image.dtype != np.uint8 or image.ndim != 3:
        raise ValueError("invalid image")
    if not isinstance(mask, np.ndarray) or mask.shape != image.shape[:2]:
        raise ValueError("invalid mask")
    binary = ((mask > 0) * 255).astype(np.uint8)
    if not binary.any():
        return image.copy()
    if blend is None:
        blend = BLEND if kind == "polish" else REPLACE_BLEND
    return _apply(image, binary, kind, PROMPTS[prompt_key], blend)
