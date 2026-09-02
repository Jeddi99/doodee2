from functools import lru_cache

import cv2
import numpy as np

from .analysis_engine import PROFILE_VIEWS, _landmarks
from . import procedure_catalog
from .procedure_catalog import ProcedureSpec
from .procedures import get_preset
from .reference_scoring import (
    MAX_REFERENCE_SHIFT, MIN_MEANINGFUL_DELTA, REFERENCE_TARGETS, reference_target,
)


DEFAULT_MAX_SHIFT = 0.03

REGION_LANDMARKS = {
    "eyes": (33, 133, 159, 145, 362, 263, 386, 374),
    "nose": (168, 193, 417, 98, 327, 2, 1),
    "lips": (61, 291, 0, 13, 14, 17),
    "cheeks": (116, 50, 187, 205, 345, 280, 411, 425),
    "jaw": (234, 172, 152, 397, 454),
    "chin": (172, 176, 152, 400, 397),
}


@lru_cache(maxsize=1)
def _cpu_face_mesh():
    import mediapipe as mp

    return mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=2, min_detection_confidence=.6)


def _simulation_landmarks(image):
    try:
        return _landmarks(image)[0]
    except RuntimeError:
        # MediaPipe Tasks can require an unavailable GL service on headless/macOS workers.
        result = _cpu_face_mesh().process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        if len(result.multi_face_landmarks or ()) != 1:
            raise ValueError("face_count")
        return np.array([(point.x, point.y, point.z) for point in result.multi_face_landmarks[0].landmark])


def validate_preset(region, preset_id):
    if not isinstance(region, str) or not isinstance(preset_id, str):
        raise ValueError("invalid_preset")
    preset = get_preset(preset_id)
    if not preset or preset["region"] != region:
        raise ValueError("preset_region_mismatch")
    if not preset["warpable"]:
        raise ValueError("information_only_preset")
    return preset


REFERENCE_PRESET_PREFIX = "reference:"


def resolve_preset(scan, region, preset_id):
    """Pick between the fixed catalog and a target computed from this face.

    A `reference:<region>` id keeps the whole request shape identical to a preset request, so
    consent, locking, quota and the worker path need no branch of their own. Returns
    `(preset, target)`, where target is None for catalog presets.
    """
    if isinstance(preset_id, str) and preset_id.startswith(REFERENCE_PRESET_PREFIX):
        target_region = preset_id[len(REFERENCE_PRESET_PREFIX):]
        if region is not None and target_region != region:
            raise ValueError("preset_region_mismatch")
        return reference_preset(scan, target_region)
    return validate_preset(region, preset_id), None


def reference_preset(scan, region):
    """Build a one-off preset aimed at the published mean for this face.

    Shaped like a catalog preset so `simulate` and `_movement` need no special case, but the
    delta comes from the scan's own measurements instead of a fixed illustrative step.
    """
    if not isinstance(region, str):
        raise ValueError("invalid_preset")
    target = reference_target((scan.analysis_data or {}).get("reference_scores"), region)
    return {
        "id": f"reference:{region}",
        "region": region,
        "warpable": True,
        "source_view": target["source_view"],
        "delta": target["delta"],
        "movement": target["movement"],
        "exact": True,
        "max_shift": MAX_REFERENCE_SHIFT,
        "measurement": target,
        "related_procedures": [],
        "status": "educational_simulation",
    }, target


def measurement_for(points, preset):
    width = np.linalg.norm(points[234, :2] - points[454, :2])
    height = np.linalg.norm(points[10, :2] - points[152, :2])
    key = preset["measurement_key"]
    pairs = {
        "eye_aspect_ratio": (159, 145, np.linalg.norm(points[33, :2] - points[133, :2])),
        "outer_corner_position": (33, 263, height),
        "alar_width_ratio": (98, 327, width),
        "nose_projection_ratio": (168, 1, height),
        "lip_height_ratio": (0, 17, height),
        "mouth_width_ratio": (61, 291, width),
        "zygomatic_width_ratio": (116, 345, width),
        "cheek_position": (116, 345, height),
        "jaw_width_ratio": (172, 397, width),
        "jaw_angle_position": (172, 397, height),
        "chin_height_ratio": (17, 152, height),
        "chin_projection_ratio": (1, 152, height),
    }
    a, b, denominator = pairs[key]
    if denominator <= 0:
        raise ValueError("invalid_face_dimensions")
    before = float(np.linalg.norm(points[a, :2] - points[b, :2]) / denominator)
    target = before * (1 + preset["delta"])
    return {
        "key": key,
        "before_ratio": round(before, 5),
        "target_ratio": round(target, 5),
        "change_percent": round(preset["delta"] * 100, 2),
        "unit": "ratio",
        "status": "educational_simulation",
    }


def _exact_movement(pixels, preset, face_width, face_height, max_shift):
    """Move control points so the measured span really lands on the target ratio.

    The preset path sizes every step off face width or height, which overshoots badly for a
    small feature: an alar base is about a third of face width, so a 5% target would move the
    nose roughly three times too far. A reference target claims to reach a published mean, so
    it has to be measured against the span it is actually changing.
    """
    delta, movement_type = preset["delta"], preset["movement"]
    if movement_type == "width":
        left, right = 98, 327
        span = float(np.linalg.norm(pixels[left] - pixels[right]))
        amount = min(abs(delta) * span / 2, face_width * max_shift) * (1 if delta > 0 else -1)
        return {left: (-amount, 0), right: (amount, 0)}
    if movement_type == "lip_height":
        span = float(np.linalg.norm(pixels[0] - pixels[17]))
        amount = min(abs(delta) * span / 2, face_height * max_shift) * (1 if delta > 0 else -1)
        return {0: (0, -amount), 17: (0, amount)}
    if movement_type == "chin_height":
        stomion = (pixels[13] + pixels[14]) / 2
        span = float(np.linalg.norm(stomion - pixels[152]))
        amount = min(abs(delta) * span, face_height * max_shift) * (1 if delta > 0 else -1)
        return {152: (0, amount)}
    raise ValueError("unsupported_reference_movement")


def _movement(points, preset, face_width, face_height, max_shift=DEFAULT_MAX_SHIFT):
    """Control point offsets in pixels.

    `max_shift` is the share of face width or height any one point may travel. Presets keep
    the original 3%; reference targets pass a larger ceiling because they aim at a real
    measured gap rather than a fixed illustrative step.
    """
    if preset.get("exact"):
        return _exact_movement(points, preset, face_width, face_height, max_shift)
    delta = preset["delta"]
    region = preset["region"]
    movement_type = preset["movement"]
    movement = {}
    if movement_type == "width" and region in ("nose", "cheeks", "jaw"):
        left, right = {"nose": (98, 327), "cheeks": (116, 345), "jaw": (172, 397)}[region]
        amount = min(abs(delta) * face_width / 2, face_width * max_shift) * (1 if delta > 0 else -1)
        movement[left], movement[right] = (-amount, 0), (amount, 0)
    elif movement_type == "eye_open":
        amount = min(abs(delta) * face_height / 5, face_height * max_shift) * (1 if delta > 0 else -1)
        movement = {159: (0, -amount), 145: (0, amount), 386: (0, -amount), 374: (0, amount)}
    elif movement_type == "eye_corner":
        amount = min(abs(delta) * face_height / 3, face_height * max_shift) * (-1 if delta > 0 else 1)
        movement = {33: (0, amount), 263: (0, amount)}
    elif movement_type == "lip_height":
        amount = min(abs(delta) * face_height / 4, face_height * max_shift) * (1 if delta > 0 else -1)
        movement = {0: (0, -amount), 17: (0, amount)}
    elif movement_type == "lip_width":
        amount = min(abs(delta) * face_width / 2, face_width * max_shift) * (1 if delta > 0 else -1)
        movement = {61: (-amount, 0), 291: (amount, 0)}
    elif movement_type == "vertical":
        amount = min(abs(delta) * face_height / 3, face_height * max_shift) * (-1 if delta > 0 else 1)
        indices = (116, 345) if region == "cheeks" else (172, 397)
        movement = {index: (0, amount) for index in indices}
    elif movement_type == "chin_height":
        amount = min(abs(delta) * face_height / 3, face_height * max_shift) * (1 if delta > 0 else -1)
        movement = {152: (0, amount)}
    else:  # profile projection
        amount = min(abs(delta) * face_width / 2, face_width * max_shift) * (1 if delta > 0 else -1)
        movement = {1: (amount, 0), 152: (amount * .6, 0)}
    return movement


MAX_SELECTIONS = 6

#: Where a catalog procedure renders when the client names no level. The middle of the five.
DEFAULT_INTENSITY_LEVEL = 3


def has_profile_images(scan):
    """Profile presets depend on the stored photos, never on the scan mode name.

    `standard` and `full` both capture both profiles, so gating on the mode would block
    presets the engine can actually render.
    """
    return any(scan.image_objects.get(view) for view in PROFILE_VIEWS)


def is_procedure_selection(selection):
    """Which catalog this selection names.

    Presence of `procedure_id`, not absence of `preset_id`: a client that sends both is sending
    two different things and gets `invalid_selection` from the shape check below rather than a
    silent pick between them.
    """
    return isinstance(selection, dict) and "procedure_id" in selection


def _validate_procedure_selections(scan, selections):
    """Clinical-catalog selections, which only the fused renderer can express.

    The legacy renderer warps one photograph by a per-region delta. A catalog procedure is a
    pipeline of warps and surface work whose steps are defined per view, so there is no honest
    legacy fallback for it -- falling back would hand the user a picture missing most of what
    they asked for, which is the same failure `validate_selections` refuses a partial stack to
    avoid. A scan without all three photographs is therefore refused here.

    Returns `(specs, targets)` shaped like the legacy return so callers keep one unpacking;
    targets are all None because a reference target belongs to the legacy catalog only.
    """
    if not canonical_available(scan):
        raise ValueError("canonical_required")
    for selection in selections:
        level = selection.get("intensity_level", 3)
        if isinstance(level, bool) or not isinstance(level, int) or level not in range(1, 6):
            raise ValueError("invalid_intensity_level")
    specs = procedure_catalog.validate_procedure_selections(selections)
    # `validate_procedure_selections` dedups by source ref. Downstream the specs are zipped
    # against the selections that produced them, so a collapsed pair would pair every later
    # selection with the wrong spec -- refuse instead of rendering that.
    if len(specs) != len(selections):
        raise ValueError("duplicate_procedure")
    return list(specs), [None] * len(specs)


def validate_selections(scan, selections, has_profile_images):
    """Resolve a whole stack up front, or refuse the whole stack.

    Rendering the parts that happen to resolve would hand back an image that is quietly missing
    a region the user asked for, which is worse than an error: they would believe it. So every
    selection is checked before anything is downloaded, warped or charged against quota.
    Returns `(presets, targets)` in the order given.
    """
    if not isinstance(selections, list) or not selections:
        raise ValueError("empty_selections")
    if len(selections) > MAX_SELECTIONS:
        raise ValueError("too_many_selections")
    procedure = [is_procedure_selection(item) for item in selections]
    if any(procedure):
        # The two catalogs are stacked layers, not alternatives: one names a geometric outcome
        # and the other the clinical work behind it. A stack mixing them would be asking for the
        # same movement twice with no way to tell that is what it is doing.
        if not all(procedure):
            raise ValueError("mixed_catalogs")
        return _validate_procedure_selections(scan, selections)
    presets, targets, seen = [], [], set()
    for selection in selections:
        if not isinstance(selection, dict) or set(selection) != {"region", "preset_id"}:
            raise ValueError("invalid_selection")
        region = selection["region"]
        if not isinstance(region, str):
            raise ValueError("invalid_preset")
        if region in seen:
            raise ValueError("duplicate_region")
        seen.add(region)
        try:
            preset, target = resolve_preset(scan, region, selection["preset_id"])
        except ValueError as exc:
            # Which region failed, or a six-region stack reports a failure with no way to tell
            # the user which card to fix.
            raise ValueError(f"{exc}:{region}") from exc
        if preset["id"].startswith(REFERENCE_PRESET_PREFIX) and len(selections) > 1:
            raise ValueError("reference_cannot_stack")
        # Front and side are different source photos, so one render cannot hold both.
        if presets and preset["source_view"] != presets[0]["source_view"]:
            raise ValueError("mixed_source_view")
        if preset["source_view"] == "profile" and not has_profile_images:
            raise ValueError(f"profile_photos_required:{region}")
        presets.append(preset)
        targets.append(target)
    return presets, targets


def simulation_columns(selections, presets, view=None):
    """The `region`, `preset_id` and `parameters` one stack writes onto its Simulation row.

    One function because those three columns are one decision and there are two call sites --
    save and preview -- that would otherwise each have to know both catalogs. `region` and
    `preset_id` mirror the first selection: they predate stacking, and the serializer, the admin
    and every row saved before `selections` existed still read them.
    """
    if any(isinstance(preset, ProcedureSpec) for preset in presets):
        levels = [int(s.get("intensity_level", DEFAULT_INTENSITY_LEVEL)) for s in selections]
        return {
            # The first part of the face the pipeline touches. The catalog's own region names,
            # which are finer than the six the legacy catalog used -- `nose_alar`, not `nose`.
            "region": presets[0].pipeline[0].region,
            "preset_id": presets[0].source_ref,
            "parameters": {
                "procedures": [
                    {"procedure_id": spec.source_ref, "intensity_level": level,
                     "name_th": spec.name_th}
                    for spec, level in zip(presets, levels)
                ],
                # What the renderer is actually handed. There is deliberately no `delta` here:
                # a catalog procedure is a pipeline, not one number, and writing a stand-in
                # would put a value in the permanent record that nothing computed.
                "sliders": procedure_catalog.compile_warp_sliders(presets, levels),
                # Which of the three renders to hand back as *the* image. The fused model
                # produces all three either way; without this the answer was always the front,
                # so a chin projection -- the whole point of which is the side view -- could be
                # asked for and then shown from the one angle that cannot show it.
                **({"view": view} if view else {}),
            },
        }
    return {
        "region": selections[0]["region"],
        "preset_id": selections[0]["preset_id"],
        "parameters": {
            "delta": presets[0]["delta"],
            "deltas": [{"region": preset["region"], "preset_id": preset["id"],
                        "delta": preset["delta"]} for preset in presets],
        },
    }


def related_union(presets):
    """The clinical names behind a stack. Catalog specs already are those names."""
    if any(isinstance(preset, ProcedureSpec) for preset in presets):
        return list(dict.fromkeys(preset.name_th for preset in presets))
    return _legacy_related_union(presets)


def _legacy_related_union(presets):
    """Every stacked region's procedures, in stack order, without repeats."""
    return list(dict.fromkeys(name for preset in presets for name in preset["related_procedures"]))


def merge_movements(pixels, presets, face_width, face_height):
    """Sum every preset's control point offsets, then clamp each point once.

    Regions share control points — jaw and chin both own 152, 172 and 397 — so stacking them
    has to add at the point rather than let the last one win, or locking a jaw shape and then
    picking a chin shape would silently undo the jaw. The clamp stays per point at the original
    3% rather than becoming a budget shared across the stack: a shared budget would shrink a
    locked region the moment another was added, which is the opposite of locking.

    Returns `(merged, capped_by_region)`.
    """
    max_shift = max(preset.get("max_shift", DEFAULT_MAX_SHIFT) for preset in presets)
    limit_x, limit_y = face_width * max_shift, face_height * max_shift
    merged, contributions, capped = {}, [], {}
    for preset in presets:
        movement = _movement(pixels, preset, face_width, face_height, preset.get("max_shift", DEFAULT_MAX_SHIFT))
        contributions.append(movement)
        # A region is capped if its own step already hit its ceiling, before any stacking.
        own_limit = (face_width if preset["movement"] == "width" else face_height) * preset.get("max_shift", DEFAULT_MAX_SHIFT)
        capped[preset["region"]] = any(abs(value) >= own_limit - 1e-9 for offset in movement.values() for value in offset)
        for index, (dx, dy) in movement.items():
            x, y = merged.get(index, (0.0, 0.0))
            merged[index] = (x + dx, y + dy)
    clamp = lambda value, limit: max(-limit, min(limit, value))
    for index, (dx, dy) in merged.items():
        clamped = (clamp(dx, limit_x), clamp(dy, limit_y))
        if clamped != (dx, dy):
            # Report the cap against the regions that asked for this point, not the whole stack.
            for preset, movement in zip(presets, contributions):
                if index in movement:
                    capped[preset["region"]] = True
        merged[index] = clamped
    return merged, capped


def source_for_scan(scan, preset, downloader):
    if preset["source_view"] == "profile":
        candidates = {view: scan.image_objects.get(view) for view in ("left_profile", "right_profile") if scan.image_objects.get(view)}
        if not candidates:
            raise ValueError("profile_photos_required")
        decoded = {view: downloader(name) for view, name in candidates.items()}
        source_view = max(decoded, key=lambda view: cv2.Laplacian(cv2.imdecode(np.frombuffer(decoded[view], np.uint8), cv2.IMREAD_GRAYSCALE), cv2.CV_64F).var())
        return decoded[source_view], candidates[source_view], source_view
    source_object = scan.image_objects.get("front")
    if not source_object:
        raise ValueError("source_expired")
    return downloader(source_object), source_object, "front"


def _watermark(image):
    height, width = image.shape[:2]
    label = "EDUCATIONAL SIMULATION"
    scale = max(.45, width / 1800)
    thickness = max(1, round(scale * 2))
    (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
    x, y = max(12, width - text_width - 18), height - 18
    cv2.rectangle(image, (x - 8, y - text_height - 8), (width - 10, y + 7), (0, 0, 0), -1)
    cv2.putText(image, label, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), thickness, cv2.LINE_AA)


def _focus_box(region_points, width, height):
    """Where on the image the change happened, as fractions of the image.

    Returned to the client so it can zoom the viewer onto the region instead of showing a
    whole head for a change a few pixels wide. Fractions rather than pixels because the before
    image is the untouched upload and the after image is this resized render: same framing,
    different pixel sizes, so only a normalised box means the same thing on both.
    """
    x, y, box_width, box_height = cv2.boundingRect(region_points)
    clamp = lambda value: round(float(min(1, max(0, value))), 4)
    return {
        "x0": clamp(x / width), "y0": clamp(y / height),
        "x1": clamp((x + box_width) / width), "y1": clamp((y + box_height) / height),
    }


def simulate(source, presets, max_side=2048, output_format=".png"):
    """Render one image holding every selection in the stack.

    The offsets of all regions are merged and applied in a single warp rather than warping
    once per region: repeated warps would resample already-resampled pixels and each pass would
    need the landmarks found again, so the face would blur a little more with every region the
    user adds. One pass costs the same whether the stack holds one region or six.

    Returns `(encoded, measurements, focus_boxes)` — one measurement per preset in the order
    given, and a focus box per region so the client can zoom onto whichever it wants.
    """
    image = cv2.imdecode(np.frombuffer(source, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("invalid_image")
    scale = min(1, max_side / max(image.shape[:2]))
    if scale < 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    points = _simulation_landmarks(image)
    height, width = image.shape[:2]
    pixels = points[:, :2] * (width, height)
    face_width = max(1, np.linalg.norm(pixels[234] - pixels[454]))
    face_height = max(1, np.linalg.norm(pixels[10] - pixels[152]))
    movement, capped = merge_movements(pixels, presets, face_width, face_height)
    sigma = max(8, face_width * .12)
    region_points = {preset["region"]: np.array([pixels[index] for index in REGION_LANDMARKS[preset["region"]]], np.int32) for preset in presets}
    all_points = np.concatenate(list(region_points.values()))
    padding = round(sigma * 3 + max(abs(value) for delta in movement.values() for value in delta))
    x, y, box_width, box_height = cv2.boundingRect(all_points)
    x0, y0 = max(0, x - padding), max(0, y - padding)
    x1, y1 = min(width, x + box_width + padding), min(height, y + box_height + padding)
    crop = image[y0:y1, x0:x1]
    yy, xx = np.mgrid[:y1 - y0, :x1 - x0].astype(np.float32)
    map_x, map_y = xx.copy(), yy.copy()
    for index, (dx, dy) in movement.items():
        px, py = pixels[index]
        weight = np.exp(-((xx - (px - x0)) ** 2 + (yy - (py - y0)) ** 2) / (2 * sigma ** 2))
        map_x -= weight * dx
        map_y -= weight * dy
    warped = cv2.remap(crop, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT_101)

    # One hull per region, unioned into a single mask. A single hull over every region at once
    # would span from eye to jaw and blend the whole face, including the parts nobody chose.
    mask = np.zeros(crop.shape[:2], np.uint8)
    for region_point_set in region_points.values():
        cv2.fillConvexPoly(mask, cv2.convexHull(region_point_set - (x0, y0)), 255)
    radius = max(9, round(face_width * .08)) | 1
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius, radius)))
    alpha = cv2.GaussianBlur(mask, (radius, radius), 0).astype(np.float32)[:, :, None] / 255
    output = image.copy()
    output[y0:y1, x0:x1] = (warped * alpha + crop * (1 - alpha)).astype(np.uint8)
    _watermark(output)
    params = [cv2.IMWRITE_WEBP_QUALITY, 92] if output_format == ".webp" else []
    ok, encoded = cv2.imencode(output_format, output, params)
    if not ok:
        raise ValueError("invalid_image")
    # Reference targets carry their measurement from the scan; presets derive theirs here.
    measurements = [
        {**(preset.get("measurement") or measurement_for(points, preset)), "region": preset["region"], "capped": capped[preset["region"]]}
        for preset in presets
    ]
    focus_boxes = {region: _focus_box(region_point_set, width, height) for region, region_point_set in region_points.items()}
    return encoded.tobytes(), measurements, focus_boxes


# ---------------------------------------------------------------------------
# Canonical three-view pipeline, ported from github.com/Rapeepath/doodoodeedee.
#
# The engine above warps one photograph at a time from a 2-D movement table.
# `canonical_pipeline` instead fuses the front and both profiles into a single
# 3-D model, applies the change there, and projects it back into each view — so
# the front and the profile of the same simulation agree with each other, which
# two independent 2-D warps cannot guarantee.
#
# Both engines are kept, and `engine_for_selections` decides. That is not
# indecision: the two model different things and one of them has no counterpart
# upstream.
#
#   reference:<region>  -> the engine above. This app can aim a region at a
#                          measurement taken from reference scores
#                          (`reference_preset`). The canonical pipeline works
#                          from a closed catalog of named sliders and has no
#                          way to express "move this until it measures X", so
#                          routing these there would delete a working feature.
#   catalog presets     -> the canonical pipeline. All 26 preset ids in
#                          procedures.py exist in SIMULATION_PRESETS with the
#                          same measurement_key, so the mapping is by id.
#
# Known consequence, flagged rather than hidden: a person switching between the
# preset and reference tabs is looking at output from two renderers. They should
# converge on one once the reference mode has a slider-shaped answer.
# ---------------------------------------------------------------------------

CANONICAL_VIEWS = ("front", "left_profile", "right_profile")


def canonical_available(scan):
    """Whether the fused pipeline can run on this scan at all.

    It needs all three views: the model is built by fusing them, so a missing one
    is not a degraded render but no render. `fast` and `skin` scan modes never
    have profiles, and older scans predate the profile capture entirely.
    """
    objects = scan.image_objects or {}
    return all(objects.get(view) for view in CANONICAL_VIEWS)


def is_reference_selection(selection):
    return str(selection.get("preset_id", "")).startswith(REFERENCE_PRESET_PREFIX)


def engine_for_selections(scan, selections):
    """"canonical" or "legacy" — which renderer this request must use."""
    # Not a preference. The legacy renderer has no way to express a catalog procedure, and
    # `validate_selections` has already refused the stack if this scan cannot run the fused one.
    if any(is_procedure_selection(s) for s in selections):
        return "canonical"
    # Reference targets used to be legacy-only: the fused engine runs sliders on a 3-D model and
    # projects back, so it had no loop that could aim at a measured value. `solve_reference_sliders`
    # is that loop, done on the landmarks alone before anything is rendered.
    return "canonical" if canonical_available(scan) else "legacy"


def _canonical_presets(selections):
    """Look each selection up in whichever catalog it names.

    Returns None if any selection has no counterpart, so the caller falls back whole rather
    than rendering a stack that quietly dropped one row — the same reasoning
    `validate_selections` gives for refusing a partial stack.
    """
    if any(is_procedure_selection(s) for s in selections):
        specs = [procedure_catalog.resolve_procedure(s.get("procedure_id")) for s in selections]
        return None if any(spec is None for spec in specs) else specs

    from .geometry_controls import get_preset

    presets = [get_preset(s.get("preset_id")) for s in selections]
    return None if any(p is None for p in presets) else presets


def _simulate_reference(scan, selection, download_fn, output_format, max_side, view):
    """Render one region moved toward its published mean, through the fused engine.

    `validate_selections` refuses a reference stacked with anything else, so there is exactly one
    selection and one region. The measurement it reports is the same dict the legacy path
    returned, so the reference card on the client is unchanged — with `capped` now meaning
    something the solver actually measured rather than a shift ceiling: this face may sit further
    from the mean than the strongest setting can reach, and `reached_ratio` says how far it got.
    """
    from .canonical_pipeline import simulate_scan_views

    region = selection["preset_id"][len(REFERENCE_PRESET_PREFIX):]
    _preset, target = reference_preset(scan, region)
    result = simulate_scan_views(
        scan, {}, download_fn, reference_target=target,
        output_format=output_format, max_side=max_side,
    )
    legacy_view = view if view in result["views"] else result["legacy_view"]
    primary = result["views"][legacy_view]
    reached = result["reached_ratio"]
    measurement = {
        **target,
        "target_ratio": round(reached, 5),
        "capped": abs(reached - target["reference_ratio"]) > MIN_MEANINGFUL_DELTA * target["reference_ratio"],
    }
    extra = {
        "model_version": result["model_version"],
        "legacy_view": legacy_view,
        "related_procedures": result["related_procedures"],
        "views": {
            name: {"yaw": item["yaw"], "max_shift_px": item["max_shift_px"],
                   "held_back": item["held_back"], "source_object": item["source_object"],
                   "changed": item["changed"], "visible_percent": item["visible_percent"]}
            for name, item in result["views"].items()
        },
        "encoded_views": {name: item["encoded"] for name, item in result["views"].items()},
        "before_encoded": primary["before_encoded"],
    }
    return primary["encoded"], [measurement], primary["focus_boxes"], extra


def simulate_canonical(scan, selections, download_fn, output_format=".png", max_side=1280, view=None):
    """Render one simulation through the fused three-view model.

    Returns `(output, measurements, focus, extra)` where the first three match what
    `simulate()` returns, so callers keep their existing unpacking, and `extra`
    carries what only this engine produces — the other rendered views and the
    model version — for `Simulation.view_objects`.
    """
    from .canonical_pipeline import simulate_scan_views
    from .geometry_controls import INTENSITY_SETTINGS, sliders_for_selections

    if any(is_reference_selection(selection) for selection in selections):
        return _simulate_reference(scan, selections[0], download_fn, output_format, max_side, view)

    presets = _canonical_presets(selections)
    if presets is None:
        raise ValueError("invalid_preset")

    if all(isinstance(preset, ProcedureSpec) for preset in presets):
        levels = [int(s.get("intensity_level", DEFAULT_INTENSITY_LEVEL)) for s in selections]
        if any(level not in INTENSITY_SETTINGS for level in levels):
            raise ValueError("invalid_intensity_level")
        # Keyed by source ref rather than by whatever the client sent: the resolver accepts the
        # retired slug as an input alias, and the pipeline looks the level up by ref.
        levelled = [
            {"procedure_id": spec.source_ref, "intensity_level": level}
            for spec, level in zip(presets, levels)
        ]
        sliders = procedure_catalog.compile_warp_sliders(presets, levels)
    else:
        # This app's UI has no intensity control, so every selection renders at the
        # catalog's own default rather than at whatever `sliders_for_selections`
        # would read off a missing key. Kept as a named default so that adding the
        # control later is a UI change and not a change of meaning here.
        levelled = [
            {**s, "intensity_level": s.get("intensity_level", preset["default_intensity_level"])}
            for s, preset in zip(selections, presets)
        ]
        for s in levelled:
            if s["intensity_level"] not in INTENSITY_SETTINGS:
                raise ValueError("invalid_intensity_level")
        sliders = sliders_for_selections(levelled, presets)

    result = simulate_scan_views(
        scan,
        sliders,
        download_fn,
        selections=levelled,
        presets=presets,
        output_format=output_format,
        max_side=max_side,
    )
    # The pipeline picks a view from the presets' own source view, which for catalog specs is
    # always the front. An explicit request wins over that; an unrenderable one is ignored
    # rather than raised, because every view was rendered and any of them is a true answer.
    legacy_view = view if view in result["views"] else result["legacy_view"]
    primary = result["views"][legacy_view]
    extra = {
        "model_version": result["model_version"],
        "legacy_view": legacy_view,
        "related_procedures": result["related_procedures"],
        "views": {
            name: {"yaw": view["yaw"], "max_shift_px": view["max_shift_px"],
                   "held_back": view["held_back"], "source_object": view["source_object"],
                   # Read by the worker, which does not store a view nothing moved in, and
                   # records the rest so the screen can say how much this actually did.
                   "changed": view["changed"], "visible_percent": view["visible_percent"]}
            for name, view in result["views"].items()
        },
        "encoded_views": {name: view["encoded"] for name, view in result["views"].items()},
        "before_encoded": primary["before_encoded"],
    }
    return primary["encoded"], result["measurements"], primary["focus_boxes"], extra
