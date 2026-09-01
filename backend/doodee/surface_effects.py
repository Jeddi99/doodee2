"""Deterministic LAB surface operations for the clean simulation pipeline.

Procedure names never appear in this module.  A procedure is data compiled into ``Step`` objects;
this module only knows how to apply geometry, relief, frequency, colour and synthesis operations.
Geometry is compiled separately and rendered by :mod:`simulation_engine`, because its shared 3-D
Wendland field must be solved once for all selected procedures and all camera views.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
import hashlib
from types import MappingProxyType
from typing import Any, Iterable, Mapping

import cv2
import numpy as np


class OpType(StrEnum):
    WARP_OP = "WARP_OP"
    SHADE_OP = "SHADE_OP"
    FLATTEN_OP = "FLATTEN_OP"
    TONE_OP = "TONE_OP"
    INPAINT_OP = "INPAINT_OP"


PRIMITIVE_TYPES = frozenset(OpType)
SURFACE_ORDER = {
    OpType.SHADE_OP: 1,
    OpType.FLATTEN_OP: 2,
    OpType.TONE_OP: 3,
    OpType.INPAINT_OP: 4,
}


@dataclass(frozen=True, slots=True)
class Step:
    type: OpType
    region: str
    params: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        object.__setattr__(self, "type", OpType(self.type))
        object.__setattr__(self, "params", MappingProxyType(dict(self.params)))

    def public(self) -> dict[str, Any]:
        return {"type": self.type.value, "region": self.region, **dict(self.params)}


# Each region is a declarative collection of MediaPipe indices.  The same generic convex-hull
# builder handles them all; paired regions are split into islands so a bridge is never painted
# across the nose or mouth.
REGION_GROUPS: Mapping[str, tuple[tuple[int, ...], ...]] = MappingProxyType({
    "face_skin": ((10, 127, 234, 172, 152, 397, 454, 356),),
    "forehead": ((10, 109, 67, 103, 54, 21, 251, 284, 332, 297, 338),),
    "temples": ((21, 54, 103, 127), (251, 284, 332, 356)),
    "brows": ((70, 63, 105, 66, 107, 55), (300, 293, 334, 296, 336, 285)),
    "upper_eyelids": ((33, 160, 159, 158, 157, 133), (362, 384, 385, 386, 387, 263)),
    "under_eyes": ((33, 145, 144, 153, 133, 112, 110),
                   (362, 374, 373, 380, 263, 341, 339)),
    # Both are drawn as offset curves rather than hulls -- see _lid_stroke. The landmark tuples are
    # the margins those curves are measured from, and keep every region answerable from one table.
    "eyelid_crease": ((133, 173, 157, 158, 159, 160, 161, 246, 33),
                      (362, 398, 384, 385, 386, 387, 388, 466, 263)),
    "aegyo_sal": ((133, 155, 154, 153, 145, 144, 163, 7, 33),
                  (362, 382, 381, 380, 374, 373, 390, 249, 263)),
    "outer_eyes": ((33, 130, 226, 247), (263, 359, 446, 467)),
    "nose": ((168, 6, 197, 195, 5, 4, 1, 94, 2, 98, 327),),
    "nose_bridge": ((168, 6, 197, 195, 5, 4, 1),),
    "nose_alar": ((98, 97, 64, 129, 358, 294, 326, 327, 2),),
    "cheeks": ((116, 117, 123, 137, 205, 50), (345, 346, 352, 366, 425, 280)),
    "nasolabial": ((98, 205, 206, 216, 212, 61), (327, 425, 426, 436, 432, 291)),
    "dimples": ((187, 205, 216), (411, 425, 436)),
    "lips": ((61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
               375, 321, 405, 314, 17, 84, 181, 91, 146),),
    "lower_face": ((234, 172, 136, 150, 149, 152, 378, 379, 365, 397, 454),),
    "jaw": ((234, 172, 136, 150, 149, 152, 378, 379, 365, 397, 454),),
    "chin": ((176, 148, 152, 377, 400, 18, 200),),
    "neck": ((172, 136, 150, 149, 152, 378, 379, 365, 397),),
    "hairline": ((127, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 356),),
    "facial_hair": ((234, 205, 61, 146, 152, 375, 291, 425, 454),),
    "ears": ((234, 127, 162, 139), (454, 356, 389, 368)),
})


# Lid margins per eye, inner corner -> outer corner. Corners are included so a fold converges where
# a real one does. Ported from test/eyelid_crease.py.
_UPPER_LASH = ((133, 173, 157, 158, 159, 160, 161, 246, 33),
               (362, 398, 384, 385, 386, 387, 388, 466, 263))
_LOWER_LASH = ((133, 155, 154, 153, 145, 144, 163, 7, 33),
               (362, 382, 381, 380, 374, 373, 390, 249, 263))
# (top of the upper lid, bottom of the lower lid) per eye: the pair the eye opening is measured
# across, and the point each margin's normals are pushed away from.
_EYE_POLES = ((159, 145), (386, 374))

# Every band is measured outward from its own margin, in eye-opening units. Both are positive: the
# normals already point away from the eye, so "outward" is up for the upper lid and down for the
# lower one. The upper band starts clear of the lashes and stops below the orbital sulcus -- past
# about 1.0 it is no longer pretarsal skin, and a fold drawn there reads as a shadow under the brow.
# Each entry is (margin index into the tuples above, inner edge, outer edge).
_LID_BANDS = MappingProxyType({
    "upper_eyelids": ("upper", 0.22, 0.78),
    "under_eyes": ("lower", 0.18, 1.00),
})

# A crease is a line, not an area. `shade_op` builds its groove/ridge pair by shifting the mask a
# few pixels up and down and taking the difference, which only reads as a fold when the mask is
# already about as thick as the fold: hand it the whole lid band and the shifted copies overlap
# almost everywhere, the difference survives only at the band's two outer edges, and the interior
# comes back as one flat lifted pad -- the lid looking swollen rather than creased.
#
# (margin, height above it in eye-opening units, stroke thickness in the same units). The height is
# where a single fold sits on real pretarsal skin; the ridge above it is `shade_op`'s own offset.
_LID_STROKES = MappingProxyType({
    "eyelid_crease": ("upper", 0.42, 0.11),
    "aegyo_sal": ("lower", 0.24, 0.15),
})


def _eye_frame(points: np.ndarray, margin_ids: tuple[int, ...], poles: tuple[int, int]):
    """A lid margin, its outward normals, a corner taper, and the eye opening in pixels."""
    margin = points[list(margin_ids), :2]
    centre = points[list(poles), :2].mean(axis=0)
    normals = margin - centre
    normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-6
    # Eye opening, not palpebral width: the fold height a surgeon quotes scales with this.
    opening = float(np.linalg.norm(points[poles[0], :2] - points[poles[1], :2]))
    taper = np.sin(np.pi * np.linspace(0, 1, len(margin))) ** 0.55
    return margin, normals, taper, max(opening, 4.0)


def _offset_curve(lash, normals, taper, distance, samples=64):
    """The lash line pushed out by `distance` px, tapered so it meets the skin at both corners.

    Resampled and smoothed: copying the lash line verbatim carries its per-landmark kinks into the
    fold, and a real crease is a smoother arc than the lid margin it sits above.
    """
    raw = lash + normals * (taper * distance)[:, None]
    steps = np.linspace(0, 1, len(raw))
    fine = np.linspace(0, 1, samples)
    curve = np.stack([np.interp(fine, steps, raw[:, 0]), np.interp(fine, steps, raw[:, 1])], axis=1)
    kernel = np.ones(7) / 7
    padded = np.pad(curve, ((3, 3), (0, 0)), mode="edge")
    return np.stack([np.convolve(padded[:, i], kernel, "valid") for i in (0, 1)], axis=1)


def _lid_band(shape: tuple[int, ...], points: np.ndarray, region: str) -> np.ndarray:
    """The strip of eyelid skin a fold or a bag actually occupies, for both eyes.

    The convex hull this replaced was built from the upper lash-line landmarks, and the hull of the
    lash line *is* the palpebral aperture -- the eye itself. Measured on the test triplet, 68% of
    the resulting `upper_eyelids` mask and 48% of `under_eyes` lay on the globe, so every groove and
    ridge was being painted across the iris and sclera instead of onto lid skin. Offsetting the lash
    line along its own normals is what moves the band off the eye and onto the lid, and it follows
    the curve of the eye rather than a straight hull edge.
    """
    which, low, high = _LID_BANDS[region]
    margins = _UPPER_LASH if which == "upper" else _LOWER_LASH
    mask = np.zeros(shape[:2], np.uint8)
    for margin_ids, poles in zip(margins, _EYE_POLES):
        margin, normals, taper, opening = _eye_frame(points, margin_ids, poles)
        # The taper is floored on the far edge so the band keeps a little width at the corners
        # instead of pinching shut into a lens the fold cannot sit inside.
        inner = _offset_curve(margin, normals, taper, opening * low)
        outer = _offset_curve(margin, normals, np.maximum(taper, .25), opening * high)
        polygon = np.concatenate([inner, outer[::-1]])
        cv2.fillPoly(mask, [np.rint(polygon).astype(np.int32)], 255, cv2.LINE_AA)
    return mask


def _lid_stroke(shape: tuple[int, ...], points: np.ndarray, region: str) -> np.ndarray:
    """The crease line itself, for both eyes: one offset curve drawn at a fold's own thickness."""
    which, height, thickness = _LID_STROKES[region]
    margins = _UPPER_LASH if which == "upper" else _LOWER_LASH
    mask = np.zeros(shape[:2], np.uint8)
    for margin_ids, poles in zip(margins, _EYE_POLES):
        margin, normals, taper, opening = _eye_frame(points, margin_ids, poles)
        curve = _offset_curve(margin, normals, taper, opening * height)
        cv2.polylines(mask, [np.rint(curve).astype(np.int32)], False, 255,
                      max(1, int(round(opening * thickness))), cv2.LINE_AA)
    return mask


def _face_dimensions(points: np.ndarray) -> tuple[float, float]:
    width = float(np.linalg.norm(points[234, :2] - points[454, :2]))
    height = float(np.linalg.norm(points[10, :2] - points[152, :2]))
    return max(width, 1.0), max(height, 1.0)


def region_mask(shape: tuple[int, ...], points: np.ndarray, region: str) -> np.ndarray:
    """Return one bounded landmark-derived mask; no procedure-specific branch exists here."""
    groups = REGION_GROUPS.get(region)
    if not groups:
        raise ValueError(f"unknown_procedure_region:{region}")
    # The two lid regions are the only ones a convex hull cannot describe: their landmarks trace the
    # eye opening, so the hull of them is the eye. They are offset bands instead -- see _lid_band --
    # and they are already the width they should be, so they skip the dilation below.
    if region in _LID_BANDS:
        return _lid_band(shape, points, region)
    if region in _LID_STROKES:
        return _lid_stroke(shape, points, region)
    mask = np.zeros(shape[:2], np.uint8)
    for group in groups:
        polygon = cv2.convexHull(np.rint(points[list(group), :2]).astype(np.int32))
        cv2.fillConvexPoly(mask, polygon, 255, cv2.LINE_AA)

    width, _ = _face_dimensions(points)
    # Landmark hulls describe a centreline. Expanding by a face-relative amount turns lines such
    # as a lid or hairline into skin bands while remaining resolution independent.
    narrow = region in {"upper_eyelids", "under_eyes", "outer_eyes", "nasolabial",
                        "dimples", "hairline", "brows"}
    radius = max(1, int(round(width * (.012 if narrow else .006))))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1,) * 2)
    return cv2.dilate(mask, kernel)


def _alpha(mask: np.ndarray, sigma: float = 1.2) -> np.ndarray:
    value = mask.astype(np.float32) / 255.0
    return np.clip(cv2.GaussianBlur(value, (0, 0), sigma), 0, 1)


# cvtColor puts L on 0-100 for a float image and on 0-255 for a byte one. Every relief and tone
# constant in this module was calibrated against the byte scale, so deltas keep those units and
# are converted at the point of use rather than re-tuned one by one.
_L_BYTE_TO_FLOAT = 100.0 / 255.0


def _lab_float(image: np.ndarray) -> np.ndarray:
    """Decode to LAB in float, where a and b keep the exact values the photograph carried.

    The byte round trip this replaced re-quantised chroma on every operation: an a/b pair nothing
    had touched still came back a code value or two away, because BGR->LAB->BGR is not a fixed
    point in 8 bits. One step was invisible; a procedure stack running four of them over the same
    cheek was a tint. Only the final BGR write quantises now, and it quantises once.
    """
    return cv2.cvtColor(image.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)


def _bgr_from_lab(lab: np.ndarray) -> np.ndarray:
    return np.clip(np.rint(cv2.cvtColor(lab, cv2.COLOR_LAB2BGR) * 255.0), 0, 255).astype(np.uint8)


def _luma_result(lab: np.ndarray, delta: np.ndarray) -> np.ndarray:
    """Write a luminance-only change back to BGR, carrying a and b through untouched.

    `delta` is in byte-L units. Relief and smoothing are shading: skin keeps the colour the camera
    recorded and only its brightness moves. Adding the change to L here rather than blending two
    BGR images by an alpha matters — that blend is linear in BGR, which is not linear in LAB, so
    it dragged chroma toward the unedited pixel in proportion to how hard the edit pushed.
    """
    result = lab.copy()
    result[:, :, 0] = np.clip(result[:, :, 0] + delta * _L_BYTE_TO_FLOAT, 0.0, 100.0)
    return _bgr_from_lab(result)


def shade_op(image: np.ndarray, mask: np.ndarray, params: Mapping[str, Any]) -> np.ndarray:
    """Add a band-limited groove/ridge pair exclusively on LAB luminance."""
    strength = float(params.get("strength", 1.0))
    # LAB's visible just-noticeable range is several code values on a real phone display. The
    # earlier 45x calibration collapsed below one value after the two band-pass blurs and produced
    # byte-different but visually identical previews. 180x leaves the photographed texture intact
    # while keeping the groove/ridge pair clearly visible inside the anatomical mask.
    groove = float(params.get("groove_depth", .12)) * 180.0 * strength
    ridge = float(params.get("ridge_lift", .07)) * 180.0 * strength
    width, height = mask.shape[1], mask.shape[0]
    shift = max(1, int(round(min(width, height) * float(params.get("offset_share", .004)))))
    base = _alpha(mask, max(.8, float(params.get("blur", 1.3))))
    ridge_alpha = cv2.warpAffine(base, np.float32(((1, 0, 0), (0, 1, -shift))),
                                 (width, height), borderMode=cv2.BORDER_CONSTANT)
    groove_alpha = cv2.warpAffine(base, np.float32(((1, 0, 0), (0, 1, shift))),
                                  (width, height), borderMode=cv2.BORDER_CONSTANT)
    band_sigma = max(.8, min(width, height) * float(params.get("band_share", .004)))
    relief = cv2.GaussianBlur(ridge_alpha * ridge - groove_alpha * groove, (0, 0), band_sigma)
    relief -= cv2.GaussianBlur(relief, (0, 0), band_sigma * 2.4)
    return _luma_result(_lab_float(image), relief * np.clip(ridge_alpha + groove_alpha, 0, 1))


def flatten_op(image: np.ndarray, mask: np.ndarray, params: Mapping[str, Any]) -> np.ndarray:
    """Suppress the fold-scale band, keeping most of the pore-scale texture that sits inside it.

    The band this removes runs from `fine_share` to `coarse_share` of the region's own width. On a
    preview-sized photograph that lower edge lands at well under two pixels of sigma, which is pore
    scale -- so erasing the band wholesale erased the skin along with the fold, and a cheek came
    back as an even, poreless sheet. The fault reads as blur, but nothing here blurs: it is a real
    band-stop, and pores were simply inside the stopband.

    So the band is cut in two at `micro_share`. Above it is the fold, the wrinkle, the tear trough
    -- what the procedure is actually for, suppressed in full. Below it is the photographed grain
    of the skin, suppressed only by what `micro_keep` leaves. Keeping a third of it is the
    difference between skin that has been smoothed and skin that has been replaced.
    """
    strength = float(params.get("strength", .45))
    keep = float(np.clip(float(params.get("micro_keep", .35)), 0.0, 1.0))
    face_scale = max(20.0, float(np.sqrt(np.count_nonzero(mask) + 1)))
    lab = _lab_float(image)
    # Byte units: the two band shares below were measured against a 0-255 luminance and stay
    # comparable to the ones in test/procedure_render.py only while that is what they divide.
    luma = lab[:, :, 0] / _L_BYTE_TO_FLOAT
    fine_share = float(params.get("fine_share", .012))
    coarse_share = float(params.get("coarse_share", .055))
    fine_sigma = max(.7, face_scale * fine_share)
    coarse_sigma = max(1.5, face_scale * coarse_share)
    # Geometric mean by default, so the split tracks the band: a step that widens or narrows its
    # own band does not also move where this module decides texture ends and fold begins. Clamped
    # inside the two edges because a share given per-step is not required to fall between them.
    micro_share = float(params.get("micro_share", np.sqrt(fine_share * coarse_share)))
    micro_sigma = float(np.clip(face_scale * micro_share, fine_sigma * 1.15, coarse_sigma * .87))
    fine = cv2.GaussianBlur(luma, (0, 0), fine_sigma)
    micro = cv2.GaussianBlur(luma, (0, 0), micro_sigma)
    coarse = cv2.GaussianBlur(luma, (0, 0), coarse_sigma)
    alpha = _alpha(mask, 1.1)
    # `(fine - micro)` is the pore band and `(micro - coarse)` the fold band; together they are the
    # `(fine - coarse)` this used to remove whole.
    band = (micro - coarse) + (fine - micro) * (1.0 - keep)
    correction = -band * alpha * strength
    # Zero-mean correction preserves regional illumination; flattening removes relief, not light.
    weight = float((alpha * alpha).sum())
    if weight:
        correction -= alpha * float((correction * alpha).sum()) / weight
    # `alpha` is the spatial profile and is applied once. The byte-LAB version weighted by it
    # twice -- once building the correction, again blending the result -- which squared the
    # feather and left the fold this is meant to erase still legible at the mask's own edge.
    return _luma_result(lab, correction)


def tone_op(image: np.ndarray, mask: np.ndarray, params: Mapping[str, Any]) -> np.ndarray:
    """Apply bounded L/a/b deltas or move chroma toward surrounding skin."""
    strength = float(params.get("strength", .45))
    lab = _lab_float(image)
    selector = params.get("selector")
    if selector:
        allowed = mask > 0
        if selector == "pigment":
            # Scored in byte units so the 2.0 floor below keeps the meaning it was chosen with.
            luma = lab[:, :, 0] / _L_BYTE_TO_FLOAT
            local = cv2.GaussianBlur(luma, (0, 0), max(2.0, np.sqrt(mask.size) * .012))
            score = local - luma
        elif selector == "redness":
            local = cv2.GaussianBlur(lab[:, :, 1], (0, 0), max(2.0, np.sqrt(mask.size) * .012))
            score = lab[:, :, 1] - local
        else:
            raise ValueError(f"unknown_tone_selector:{selector}")
        threshold = max(2.0, float(np.quantile(score[allowed], .82)))
        selected = ((score >= threshold) & allowed).astype(np.uint8) * 255
        alpha = _alpha(selected, 1.3) * strength
    else:
        alpha = _alpha(mask, 1.3) * strength
    if params.get("neutralize", False):
        selected = alpha > 0
        radius = max(2, int(round(np.sqrt(mask.size) * .01)))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1,) * 2)
        ring = (cv2.dilate(selected.astype(np.uint8), kernel) > 0) & ~selected
        reference = np.median(lab[ring], axis=0) if ring.any() else np.median(lab, axis=(0, 1))
        lab += (reference - lab) * alpha[:, :, None]
    # This is the one operation allowed to move chroma, and `alpha` is what keeps it local: it is
    # zero everywhere the selector or the mask did not choose, so ambient skin outside the spot
    # or the vessel keeps its own a/b. The caller then confines the write to the mask
    # again, so a feather that spilled past the hull cannot reach the photograph either way.
    lab[:, :, 0] = np.clip(lab[:, :, 0] + alpha * float(params.get("l_delta", 0.0)) * _L_BYTE_TO_FLOAT,
                           0.0, 100.0)
    lab[:, :, 1] += alpha * float(params.get("a_delta", 0.0))
    lab[:, :, 2] += alpha * float(params.get("b_delta", 0.0))
    return _bgr_from_lab(lab)


def _skin_ring(mask: np.ndarray, radius_px: int) -> np.ndarray:
    """The band of untouched skin immediately around a patch -- what it has to match."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius_px * 4 + 1,) * 2)
    return (cv2.dilate(mask, kernel) > 0) & (mask == 0)


def _blend_into_skin(image: np.ndarray, filled: np.ndarray, mask: np.ndarray,
                     radius_px: int, params: Mapping[str, Any]) -> np.ndarray:
    """Give an inpainted patch the colour and the grain of the skin around it.

    ``cv2.inpaint`` solves for a smooth surface across the hole, which is exactly what makes the
    result read as a smudge: it has no pores, and its colour is whatever the boundary pixels
    averaged to -- boundary pixels that sit in the lesion's own halo, so the patch lands a little
    muddy and a little dark against the cheek it is supposed to disappear into.

    Two corrections, both measured off the ring of real skin around the patch and neither of them
    inventing structure. The colour offset is a constant per channel, so it moves the patch onto
    the surrounding skin tone without touching the shading ``inpaint`` solved for. The grain is
    seeded noise blurred to the pore scale of this photograph and scaled to the ring's own
    high-pass deviation, which is a texture with the right amplitude and frequency and no content:
    the point is that the eye stops reading the patch as a hole, not that a pore is reconstructed
    where nobody can know one was.
    """
    target = mask > 0
    ring = _skin_ring(mask, radius_px)
    if not target.any() or not ring.any():
        return filled
    result = filled.astype(np.float32)
    # Median, not mean: the ring can still clip the edge of a neighbouring blemish, and one dark
    # island must not drag the whole patch down with it.
    offset = np.median(image[ring], axis=0) - np.median(filled[target], axis=0)
    limit = float(params.get("colour_limit", 12.0))
    result[target] += np.clip(offset, -limit, limit)

    grain = float(params.get("grain", .8))
    if grain > 0:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
        pore_sigma = max(.6, radius_px * float(params.get("grain_share", .45)))
        detail = gray - cv2.GaussianBlur(gray, (0, 0), pore_sigma)
        # The ring's own deviation, so a patch on a smooth forehead stays smooth and one on a
        # textured cheek comes back textured.
        amplitude = float(np.std(detail[ring])) * grain
        if amplitude > 0:
            seed = str(params.get("seed", "inpaint-grain")).encode("utf-8")
            rng = np.random.default_rng(int.from_bytes(hashlib.sha256(seed).digest()[:8], "big"))
            noise = rng.standard_normal(gray.shape).astype(np.float32)
            noise = cv2.GaussianBlur(noise, (0, 0), pore_sigma)
            spread = float(np.std(noise[ring])) or 1.0
            result[target] += (noise[target] * (amplitude / spread))[:, None]
    return np.clip(np.rint(result), 0, 255).astype(np.uint8)


def inpaint_op(image: np.ndarray, mask: np.ndarray, params: Mapping[str, Any]) -> np.ndarray:
    """Remove masked texture or synthesize deterministic hair-like texture."""
    mode = str(params.get("mode", "remove"))
    strength = float(params.get("strength", .6))
    # Drawn hair is a hard-edged mark and wants the tight ramp it always had. A removal is a patch
    # of skin standing in for skin, and the removal branch replaces this with a width derived from
    # the target it actually found.
    feather = max(.3, float(params.get("feather", .9)))
    if mode == "remove":
        # A region describes where a target is allowed, not an instruction to erase the whole
        # cheek/brow polygon. Select compact dark/high-frequency islands inside it first.
        allowed = mask > 0
        if not allowed.any():
            return image.copy()
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
        # Every length below is a share of the region's own width. The reference blur used to come
        # off `mask.size` -- the whole frame -- which tied the detector's idea of "local" to how the
        # photograph happened to be cropped instead of to how big a blemish is.
        width = max(1.0, float(np.sqrt(np.count_nonzero(allowed))))
        # A blemish radius, as a share of the region's width -- the number the morphology kernel was
        # already built from, now also setting the detector's own scale and the fill radius.
        spot_px = max(1.5, width * float(params.get("spot_share", .008)))
        # The reference has to be wider than the target, or the target is its own reference: a
        # Gaussian narrower than a mole lifts only its rim, so `score` peaked in a ring and read
        # zero straight through the middle. What that selected was an annulus, a 3x3 close could
        # not fill it, and what shipped was the mole still sitting inside a smudged halo -- the
        # "รอยด่าง" this is here to stop.
        local = cv2.GaussianBlur(gray, (0, 0), spot_px * 2.5)
        score = local - gray
        quantile = float(params.get("target_quantile", .88))
        # Three floors, and the third is the one that stops a cheek turning into a field of soft
        # circles: a fixed 3.0 grey levels is inside ordinary pore noise, so on a sharp photograph
        # the top 12% of the region was mostly skin. Scaling with the region's own dispersion means
        # a blemish has to stand out from *this* skin, not from a constant.
        threshold = max(float(params.get("target_floor", 3.0)),
                        float(np.quantile(score[allowed], np.clip(quantile, .5, .995))),
                        float(np.std(score[allowed])) * float(params.get("target_sigma", 2.2)))
        targets = ((score >= threshold) & allowed).astype(np.uint8) * 255
        radius_px = max(1, int(round(spot_px)))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius_px * 2 + 1,) * 2)
        targets = cv2.morphologyEx(targets, cv2.MORPH_CLOSE, kernel)
        # Compact islands only. A speck of grain is not a mole and painting over each one is what
        # made the result look retouched rather than treated; anything far larger than a blemish is
        # a shadow, a nostril edge or the shade under a brow, and that is skin, not a target.
        found, labels, stats, _ = cv2.connectedComponentsWithStats(targets, 8)
        area = stats[:, cv2.CC_STAT_AREA].astype(np.float64)
        box = stats[:, [cv2.CC_STAT_WIDTH, cv2.CC_STAT_HEIGHT]].astype(np.float64)
        smallest = max(4.0, spot_px * spot_px * .6)
        largest = spot_px * spot_px * float(params.get("spot_area_limit", 28.0))
        # Round, as well as small. Size alone let through the nostril crease, the lip line and the
        # edge of a beard -- dark runs that are the face's own shape, and painting skin over those
        # is a worse lie than any blemish. Fill ratio rather than the box's aspect: a crease curves,
        # so its bounding box comes out nearly square while the ink inside it is a thin arc. A
        # filled disc fills about 78% of its box; an arc fills a quarter of one.
        extent = area / np.maximum(box[:, 0] * box[:, 1], 1.0)
        keep = ((area >= smallest) & (area <= largest)
                & (extent >= float(params.get("spot_extent_floor", .45))))
        keep[0] = False                                     # label 0 is the background
        targets = np.where(keep[labels] if found > 1 else False, 255, 0).astype(np.uint8)
        targets = cv2.dilate(targets, kernel)
        targets[~allowed] = 0
        mask = targets
        if not np.any(mask):
            return image.copy()
        radius = max(1.0, float(params.get("radius", spot_px)))
        candidate = _blend_into_skin(image, cv2.inpaint(image, mask, radius, cv2.INPAINT_TELEA),
                                     mask, radius_px, params)
        feather = max(1.2, radius_px * float(params.get("feather_share", 1.1)))
    elif mode in {"hair", "brow_hair", "lashes"}:
        candidate = image.copy()
        ys, xs = np.nonzero(mask)
        if not len(xs):
            return image.copy()
        seed = str(params.get("seed", mode)).encode("utf-8")
        rng = np.random.default_rng(int.from_bytes(hashlib.sha256(seed).digest()[:8], "big"))
        width = max(1, int(xs.max() - xs.min()))
        count = max(12, int(width * float(params.get("density", .18))))
        colour = tuple(int(v) for v in np.percentile(image[mask > 0], 16, axis=0))
        length = max(3, int(width * float(params.get("length_share", .035))))
        for choice in rng.integers(0, len(xs), count):
            root = np.array((xs[choice], ys[choice]), dtype=np.float32)
            angle = float(params.get("angle", -1.2)) + rng.normal(0, .22)
            tip = root + length * rng.uniform(.65, 1.2) * np.array((np.cos(angle), np.sin(angle)))
            cv2.line(candidate, tuple(np.rint(root).astype(int)), tuple(np.rint(tip).astype(int)),
                     colour, 1, cv2.LINE_AA)
    else:
        raise ValueError(f"unknown_inpaint_mode:{mode}")
    alpha = (_alpha(mask, feather) * np.clip(strength, 0, 1))[:, :, None]
    return np.clip(np.rint(image * (1 - alpha) + candidate * alpha), 0, 255).astype(np.uint8)


SURFACE_OPERATORS = MappingProxyType({
    OpType.SHADE_OP: shade_op,
    OpType.FLATTEN_OP: flatten_op,
    OpType.TONE_OP: tone_op,
    OpType.INPAINT_OP: inpaint_op,
})


def steps_mask(shape: tuple[int, ...], points: np.ndarray, steps: Iterable[Step]) -> np.ndarray:
    """The union of every region a set of steps is allowed to touch.

    This is what bounds the hosted refinement: it can only be handed the area the deterministic
    pass already had permission to write, so stage 2 can never reach further than stage 1.
    """
    mask = np.zeros(shape[:2], np.uint8)
    for region in {step.region for step in steps if step.type != OpType.WARP_OP}:
        # Accumulated in place; the union does not need a fresh frame-sized array per region.
        np.maximum(mask, region_mask(shape, points, region), out=mask)
    return mask


def apply_surface_pipeline(image: np.ndarray, points: np.ndarray, steps: Iterable[Step],
                           amplify: float = 1.0) -> np.ndarray:
    """Apply non-geometric steps in canonical order, independent of catalog/click order."""
    result = image.copy()
    surface = sorted((step for step in steps if step.type != OpType.WARP_OP),
                     key=lambda step: SURFACE_ORDER[step.type])
    for step in surface:
        mask = region_mask(result.shape, points, step.region)
        before = result
        params = dict(step.params)
        params["strength"] = float(params.get("strength", 1.0)) * float(amplify)
        candidate = SURFACE_OPERATORS[step.type](before, mask, params)
        # Operator filters may sample past an edge, but no generated pixel may escape the
        # landmark-derived support. This is the hard identity/background preservation boundary.
        result = before.copy()
        # `copyto` writes the selected pixels straight across. Indexing both sides instead built two
        # intermediate arrays of every masked pixel, per step, per view.
        np.copyto(result, candidate, where=(mask > 0)[:, :, None])
    return result
