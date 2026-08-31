"""Skin observations that survive a change of light bulb.

The engine this replaces (`analysis_engine._skin_metrics`) measured three things — the standard
deviation of grey over the whole face hull, the mean of `R-(G+B)/2`, and a Laplacian variance —
and every one of them moved more when the room changed than when the skin did. That is why the
analysis screen never showed them: `apps/web/src/data/faceMetrics.js` lists the keys under
SKIN_KEYS with the reason written out. The judgement was right, and the fix is not to surface
those numbers with a caveat attached.

The difference here is that **nothing absolute is reported**. Every signal below is one region
of the face measured against another region of the *same photograph*. Illuminant colour,
exposure, white balance and the camera's tone curve apply to both sides of that subtraction and
cancel. What is left is the part that belongs to the face.

Two consequences follow from that choice and both are deliberate:

* No signal here is comparable to a population. There is no published Thai reference for skin
  the way `reference_scoring.REFERENCE` has one for craniofacial distances, so nothing in this
  module is scored, ranked, or given a z. `UNSUPPORTED_CATEGORIES` still names "skin" and this
  module does not change that.
* A relative signal still needs the photograph to be readable. Where it is not — a face lit
  from one side, a colour cast strong enough to swamp the a* difference we are looking for,
  blown highlights over the cheek — the honest output is an advisory saying so, not a number.
  `advisories` follows the shape `analysis_engine._validate_pose_set` already established.

Geometry is scale-free; photometry is not. That asymmetry is the whole reason this file exists
separately from `analysis_engine`.
"""

# Bumped when a signal's definition changes. Stored beside the values so a trend line can
# refuse to plot two scans that were measured by different rules — a silent redefinition would
# read as the user's skin changing.
ENGINE_VERSION = "2026.2-clipping"

# Landmark indices bounding each patch, from the MediaPipe 468-point mesh that
# `analysis_engine._landmarks` already returns. Chosen to sit inside flat skin: the forehead
# patch stops short of the hairline, the cheeks avoid the nasolabial fold, and the under-eye
# patch sits below the lash line rather than across it.
REGIONS = {
    "forehead": (67, 109, 10, 338, 297, 336, 9, 107),
    "left_cheek": (117, 118, 101, 36, 205, 187, 123),
    "right_cheek": (346, 347, 330, 266, 425, 411, 352),
    "nose": (168, 193, 122, 196, 3, 51, 5, 281, 248, 419, 351, 417),
    "left_undereye": (226, 31, 228, 229, 230, 231, 232, 233),
    "right_undereye": (446, 261, 448, 449, 450, 451, 452, 453),
    "chin": (176, 148, 152, 377, 400, 378, 379, 365),
    "perioral": (57, 186, 92, 165, 167, 393, 391, 322, 410, 287),
}

# The sclera, used as the one near-neutral surface a face reliably carries. Small patches on
# purpose — the further from the iris, the more likely a lash shadow or the lower lid is
# included, and a shadow read as "neutral" would tint the whole correction.
SCLERA_REGIONS = {
    "left": (33, 246, 161, 160, 133, 154, 153, 145),
    "right": (263, 466, 388, 387, 362, 381, 380, 374),
}

# Face-relative spatial frequency for the texture band-pass, as a fraction of face width. A
# 12MP close-up and a 2MP phone shot disagree about pixels but agree about this, which is the
# entire point: the old Laplacian variance measured the camera's sharpening, not the skin.
TEXTURE_SCALE = 0.012

# Grey-world channel ratios beyond this are a colour cast strong enough to compete with the
# a* differences the redness signal is looking for. Reported, not silently corrected.
MAX_COLOUR_CAST = 0.22
# Ratio between the brighter and darker cheek. Side-lighting steeper than this leaves the two
# halves of the face on different exposures, which no within-photo subtraction can undo.
MAX_SHADOW_RATIO = 1.55
# Fraction of a region's pixels at the top or bottom of the range. Clipped pixels have thrown
# their value away; averaging them in invents detail that was never captured.
MAX_CLIPPED_FRACTION = 0.06
# Below this a patch is too small to average — a heavily cropped or very distant face.
MIN_REGION_PIXELS = 120


def _region_mask(points, indices, shape):
    """Filled convex hull of the named landmarks, in pixels."""
    import cv2
    import numpy as np

    height, width = shape[:2]
    polygon = np.array(
        [(int(points[i, 0] * width), int(points[i, 1] * height)) for i in indices],
        dtype=np.int32,
    )
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(polygon), 255)
    return mask


def _white_balance(image, points):
    """Scale the channels so the sclera reads neutral.

    Returns `(corrected, applied)`. The eye white is the only surface on a face that is
    approximately achromatic under any illuminant, so it is the closest thing to a grey card a
    selfie contains. It is not a grey card: it yellows with age, reddens when irritated, and is
    often half in shadow. So the correction is applied when it looks sane and skipped when it
    does not, and `applied` records which happened — a reader comparing two scans needs to know
    whether they were corrected the same way.
    """
    import numpy as np

    height, width = image.shape[:2]
    samples = []
    for indices in SCLERA_REGIONS.values():
        mask = _region_mask(points, indices, image.shape)
        pixels = image[mask == 255]
        if len(pixels) >= 20:
            # The lash line and lid crease are the darkest pixels in the patch and the iris
            # edge the most saturated; the brightest half is the part that is actually sclera.
            luma = pixels.astype(np.float32).mean(axis=1)
            samples.append(pixels[luma >= np.median(luma)])
    if not samples:
        return image, False

    reference = np.concatenate(samples).astype(np.float32).mean(axis=0)
    if float(reference.min()) < 40:
        # Both eyes in shadow. Correcting towards a dark "white" would amplify noise into a
        # colour cast of its own.
        return image, False

    gains = float(reference.mean()) / np.maximum(reference, 1e-6)
    if float(np.abs(gains - 1).max()) > 0.6:
        # A correction this large is not white balance; something else is in the patch.
        return image, False

    corrected = np.clip(image.astype(np.float32) * gains, 0, 255).astype(image.dtype)
    return corrected, True


def _clipped_fraction(original, mask):
    """Share of a patch where any one channel has hit the end of its range.

    Two things here are deliberate and both were wrong before, in ways that cancelled each
    other's visibility.

    **Per channel, not on the grey.** A pixel whose red is pinned at 255 while green and blue
    sit mid-range has thrown away exactly the information the `a*` signals are built from, and
    its greyscale is nowhere near the top. Measured on a real photograph, brightening by 15%
    put 88% of a cheek's red channel at 255 while the same patch's greyscale read 210 — so the
    old greyscale test counted nothing at all, and `cheek_redness` was free to move from -2.17
    to -5.01 with `readable` still true and `advisories` still empty.

    **On the frame as decoded, not on the white-balanced copy.** `_white_balance` scales the
    channels, and when it scales a saturated one *down* it pushes those dead pixels back under
    253 before anything counts them — the correction erasing the evidence of the damage it is
    compensating for.
    """
    import numpy as np

    selected = mask == 255
    if not selected.any():
        return 0.0
    pixels = original[selected]
    dead = (pixels <= 2) | (pixels >= 253)
    return float(dead.any(axis=1).mean())


def _region_stats(lab, gray, mask, clipped_fraction):
    """Mean colour for one patch, or None when the patch is too small.

    `clipped_fraction` is passed in rather than derived here because it has to be read off the
    original frame, which this function does not see — see `_clipped_fraction`.
    """
    selected = mask == 255
    count = int(selected.sum())
    if count < MIN_REGION_PIXELS:
        return None

    lab_pixels = lab[selected]
    return {
        "pixels": count,
        # OpenCV packs CIELAB into 8 bits: L in 0-255, a and b offset by 128. Converted back to
        # the real scale here so the numbers stored mean what their names say.
        "lightness": float(lab_pixels[:, 0].mean()) * 100 / 255,
        "a": float(lab_pixels[:, 1].mean()) - 128,
        "b": float(lab_pixels[:, 2].mean()) - 128,
        "clipped_fraction": clipped_fraction,
    }


def _texture_energy(gray, mask, face_width_px):
    """High-frequency energy at a face-relative scale, as Weber contrast.

    Two departures from the Laplacian variance this replaces. The band-pass width is derived
    from face width rather than fixed in pixels, so the same physical detail is measured
    whatever the resolution; and the result is divided by local mean luminance, so a brighter
    photograph does not read as rougher skin.
    """
    import cv2
    import numpy as np

    radius = max(1, int(round(face_width_px * TEXTURE_SCALE)))
    kernel = radius * 2 + 1
    blurred = cv2.GaussianBlur(gray.astype(np.float32), (kernel, kernel), 0)
    selected = mask == 255
    if int(selected.sum()) < MIN_REGION_PIXELS:
        return None

    local_mean = float(blurred[selected].mean())
    if local_mean < 8:
        return None
    detail = gray.astype(np.float32)[selected] - blurred[selected]
    return float(np.sqrt((detail ** 2).mean()) / local_mean)


def _specular_fraction(image, gray, mask, bright_threshold):
    """Share of a patch that is bright and desaturated — the signature of a highlight.

    Sebum reflects the light source's own colour, so shine shows up as pixels that are both
    near the top of the range and low in saturation. Skin pigment is neither.

    `bright_threshold` is derived from this face's own luminance rather than fixed, because a
    fixed cutoff counts more pixels in a brighter photograph and would report the exposure as
    shine. HSV saturation is already a ratio, so its cutoff needs no such treatment.
    """
    import cv2
    import numpy as np

    selected = mask == 255
    if int(selected.sum()) < MIN_REGION_PIXELS:
        return None
    saturation = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)[:, :, 1]
    bright = gray[selected].astype(np.float32) > bright_threshold
    flat = saturation[selected].astype(np.float32) < 60
    return float((bright & flat).mean())


def _mean(values):
    usable = [value for value in values if value is not None]
    return sum(usable) / len(usable) if usable else None


def _capture_conditions(original, gray, regions, balanced):
    """What the photograph itself makes possible, before any skin claim is made.

    Colour cast is deliberately read from `original` — the frame as the camera delivered it —
    not from the white-balanced copy the signals are measured on. Measuring it after correction
    would report every cast the sclera happened to neutralise as no cast at all, which is
    backwards: the advisory exists precisely to say when that correction is doing heavy lifting
    and the redness signals are leaning on it.
    """
    import numpy as np

    channel_means = original.reshape(-1, 3).astype(np.float32).mean(axis=0)
    overall = float(channel_means.mean())
    colour_cast = float(np.abs(channel_means - overall).max() / max(overall, 1e-6))

    left, right = regions.get("left_cheek"), regions.get("right_cheek")
    shadow_ratio = None
    if left and right:
        lighter = max(left["lightness"], right["lightness"])
        darker = min(left["lightness"], right["lightness"])
        shadow_ratio = float(lighter / max(darker, 1e-6))

    clipped = max((region["clipped_fraction"] for region in regions.values()), default=0.0)
    return {
        "brightness": float(gray.mean()),
        "colour_cast": round(colour_cast, 4),
        "shadow_ratio": round(shadow_ratio, 4) if shadow_ratio is not None else None,
        "max_clipped_fraction": round(float(clipped), 4),
        "white_balanced": balanced,
    }


def _capture_advisories(capture, regions):
    """Reasons the signals below should not be read, in the `_validate_pose_set` style.

    Returning a caveat next to a number invites the number to be read anyway. These strings are
    the caller's cue to show the caveat *instead*.
    """
    advisories = []
    missing = [name for name in REGIONS if name not in regions]
    if missing:
        advisories.append(f"skin_regions_unreadable:{','.join(sorted(missing))}")
    if capture["colour_cast"] > MAX_COLOUR_CAST:
        advisories.append(f"skin_colour_cast:{capture['colour_cast']:.2f}")
    if capture["shadow_ratio"] is not None and capture["shadow_ratio"] > MAX_SHADOW_RATIO:
        advisories.append(f"skin_uneven_lighting:{capture['shadow_ratio']:.2f}")
    if capture["max_clipped_fraction"] > MAX_CLIPPED_FRACTION:
        advisories.append(f"skin_clipped_highlights:{capture['max_clipped_fraction']:.2f}")
    if not capture["white_balanced"]:
        advisories.append("skin_no_white_reference")
    return advisories


def _signals(regions, textures, speculars):
    """The comparisons themselves: one patch against another, divided by overall lightness.

    The division is what makes them exposure-invariant, and it is easy to leave out. A raw
    difference of two L* or a* values still scales with the light — brighten the frame and the
    gap between cheek and forehead widens with it — so a bare subtraction would reintroduce
    exactly the dependence this module exists to remove. Dividing by the face's mean lightness
    turns each signal into a proportion, which survives the change. Values are per-hundred, so
    they read on a similar scale to the ratios elsewhere in the analysis.

    None where an input patch was unreadable, rather than a zero — a missing measurement and a
    measurement that came out at zero are different facts and the caller must be able to tell
    them apart.
    """
    forehead = regions.get("forehead")
    cheeks = [regions.get("left_cheek"), regions.get("right_cheek")]
    cheek_lightness = _mean([cheek["lightness"] if cheek else None for cheek in cheeks])
    cheek_a = _mean([cheek["a"] if cheek else None for cheek in cheeks])
    undereye_lightness = _mean([
        regions[name]["lightness"] for name in ("left_undereye", "right_undereye") if name in regions
    ])

    lightnesses = [region["lightness"] for region in regions.values()]
    if not lightnesses:
        return {key: None for key in SIGNAL_CONFIDENCE}
    mean_lightness = sum(lightnesses) / len(lightnesses)

    # The +16 is load-bearing, not a fudge. CIELAB defines L* = 116·(Y/Yn)^(1/3) − 16, so under
    # a light gain k both a difference of L* and the mean scale by k^(1/3) — but the −16 offset
    # does not, and dividing by the bare mean leaves that residual behind as exposure
    # dependence. Adding it back recovers a quantity proportional to (Y/Yn)^(1/3), where the
    # k^(1/3) cancels exactly. a* is likewise built from cube roots and scales the same way, so
    # the same denominator works for the redness signals.
    scale = mean_lightness + 16
    if scale < 4:
        return {key: None for key in SIGNAL_CONFIDENCE}

    signals = {}

    # Under-eye darkness: the infraorbital patch against mid-cheek, as a share of overall
    # lightness. Positive means darker than the cheek below it.
    signals["undereye_shadow"] = (
        round((cheek_lightness - undereye_lightness) / scale * 100, 3)
        if cheek_lightness is not None and undereye_lightness is not None
        else None
    )

    # Tone evenness: the coefficient of variation of lightness across patches. Computed over
    # patches rather than over pixels, which is what kept the old `gray.std()` measuring the
    # shadow beside the nose; divided by the mean, which is what keeps it off the exposure.
    if len(lightnesses) >= 4:
        variance = sum((value - mean_lightness) ** 2 for value in lightnesses) / len(lightnesses)
        signals["tone_spread"] = round(variance ** 0.5 / scale * 100, 3)
    else:
        signals["tone_spread"] = None

    # Localised redness: cheeks and nose against the forehead, in a*. The forehead is the
    # reference because it is the region least often flushed.
    signals["cheek_redness"] = (
        round((cheek_a - forehead["a"]) / scale * 100, 3)
        if cheek_a is not None and forehead else None
    )
    signals["nose_redness"] = (
        round((regions["nose"]["a"] - forehead["a"]) / scale * 100, 3)
        if "nose" in regions and forehead
        else None
    )

    # Shine: T-zone against cheeks. A single number for "how shiny" would be a reading of the
    # room's lighting; the difference between the two zones is a property of the face.
    tzone_specular = _mean([speculars.get("forehead"), speculars.get("nose")])
    cheek_specular = _mean([speculars.get("left_cheek"), speculars.get("right_cheek")])
    signals["tzone_shine"] = (
        round(tzone_specular - cheek_specular, 4)
        if tzone_specular is not None and cheek_specular is not None
        else None
    )

    # Texture, averaged over the flat patches. Absolute rather than differential, so it is the
    # weakest signal here and its confidence says so.
    texture = _mean([textures.get(name) for name in ("forehead", "left_cheek", "right_cheek", "chin")])
    signals["texture"] = round(texture, 4) if texture is not None else None
    return signals


# How far each signal can be trusted from one uncalibrated photograph. Differential signals
# score higher than the one absolute signal, and the caller is expected to show this rather
# than present every row as equally solid.
SIGNAL_CONFIDENCE = {
    "undereye_shadow": 0.7,
    "tone_spread": 0.6,
    "cheek_redness": 0.6,
    "nose_redness": 0.55,
    "tzone_shine": 0.5,
    "texture": 0.4,
}


def analyze_skin(image, points):
    """Regional skin observations for one front image.

    `image` is the decoded BGR front photograph and `points` the raw MediaPipe landmarks for
    it — normalised to image width and height, *not* the isotropic ones. Masks are drawn in
    pixel space, so they need the frame's own proportions; `analysis_engine` passes
    `normalized["front"]` for exactly this reason.

    Never raises for a photograph it cannot read. A scan that produced good measurements should
    not fail because the light was wrong for skin, so an unreadable frame comes back with
    `signals` present but empty of values and the reason in `advisories`.
    """
    import cv2

    balanced_image, balanced = _white_balance(image, points)
    lab = cv2.cvtColor(balanced_image, cv2.COLOR_BGR2LAB)
    gray = cv2.cvtColor(balanced_image, cv2.COLOR_BGR2GRAY)

    height, width = image.shape[:2]
    face_width_px = max(abs(points[454, 0] - points[234, 0]) * width, 1.0)

    masks, regions = {}, {}
    for name, indices in REGIONS.items():
        mask = _region_mask(points, indices, image.shape)
        # Colour off the corrected copy, clipping off `image` — the frame as it was decoded.
        stats = _region_stats(lab, gray, mask, _clipped_fraction(image, mask))
        if stats is None:
            continue
        masks[name], regions[name] = mask, stats

    # Derived once across every readable patch, so "bright" means bright *for this face* rather
    # than bright on a fixed 0-255 scale that a well-lit photograph clears everywhere.
    face_gray = [gray[masks[name] == 255].mean() for name in regions]
    bright_threshold = min(250.0, float(sum(face_gray) / len(face_gray)) * 1.35) if face_gray else 250.0

    textures, speculars = {}, {}
    for name, mask in masks.items():
        textures[name] = _texture_energy(gray, mask, face_width_px)
        speculars[name] = _specular_fraction(balanced_image, gray, mask, bright_threshold)

    capture = _capture_conditions(image, gray, regions, balanced)
    advisories = _capture_advisories(capture, regions)
    signals = _signals(regions, textures, speculars) if regions else {key: None for key in SIGNAL_CONFIDENCE}

    return {
        "engine_version": ENGINE_VERSION,
        # Relative to each other only. Stated here because the field names alone
        # ("cheek_redness") read like absolutes and will be quoted out of context.
        "basis": "within_image_regional",
        "signals": signals,
        "confidence": dict(SIGNAL_CONFIDENCE),
        "regions": {
            name: {key: round(value, 4) for key, value in stats.items() if key != "pixels"}
            for name, stats in regions.items()
        },
        "capture": capture,
        "advisories": advisories,
        # One flag so callers do not each re-derive the same judgement from `advisories` and
        # eventually disagree about it.
        "readable": not advisories and bool(regions),
    }


# Why a pair of scans could not be joined, in the order the checks run. Returned to the client
# so a broken trend line can say which of these it was — "we did not compare these two" is a
# claim that needs a reason attached, or it reads as the feature being unfinished.
BREAK_ENGINE_VERSION = "engine_version"
BREAK_UNREADABLE = "unreadable"
BREAK_WHITE_BALANCE = "white_balance"
BREAK_BRIGHTNESS = "brightness"
BREAK_COLOUR_CAST = "colour_cast"

MAX_TREND_BRIGHTNESS_GAP = 45
MAX_TREND_CAST_GAP = 0.12


def comparison_break(earlier, later):
    """Why two scans may not be plotted as one trend, or None when they may.

    Skin signals are stable against light *within* one photograph; they are not stable across
    photographs taken under different light. Drawing a line between two scans shot in different
    rooms would present the rooms as a change in the user's skin, which is the failure this
    whole module exists to avoid.

    The version check is what protects stored history across a change in here. Scans measured
    before `2026.2-clipping` could report a confident number for a patch whose red channel was
    already destroyed, so joining one of those to a correctly-measured scan would draw the fix
    itself as a change in the user's skin.
    """
    if not (earlier and later):
        return BREAK_UNREADABLE
    if earlier.get("engine_version") != later.get("engine_version"):
        return BREAK_ENGINE_VERSION
    if not (earlier.get("readable") and later.get("readable")):
        return BREAK_UNREADABLE

    first, second = earlier.get("capture") or {}, later.get("capture") or {}
    if first.get("white_balanced") != second.get("white_balanced"):
        return BREAK_WHITE_BALANCE
    if abs(first.get("brightness", 0) - second.get("brightness", 0)) > MAX_TREND_BRIGHTNESS_GAP:
        return BREAK_BRIGHTNESS
    if abs(first.get("colour_cast", 0) - second.get("colour_cast", 0)) > MAX_TREND_CAST_GAP:
        return BREAK_COLOUR_CAST
    return None


def comparable(earlier, later):
    """Whether two scans' capture conditions are close enough to plot as a trend."""
    return comparison_break(earlier, later) is None
