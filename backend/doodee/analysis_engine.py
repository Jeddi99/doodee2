from math import asin, atan2, degrees, hypot
import json
import os
from pathlib import Path
from functools import lru_cache

from .reference_scoring import angle, score_observations
from .skin_engine import analyze_skin


# 2026.4 rescales landmark x into height units before measuring. Scores from earlier versions
# carry the photo's aspect ratio in every width-over-height ratio and are not comparable.
# 2026.5 adds angles, feature-against-feature ratios and the profile E-line to the catalog. No
# 2026.4 formula changed, so its values are still readable, but a 2026.4 scan holds fewer keys.
FORMULA_VERSION = "2026.5-extended"
ANTHROPOMETRY_SOURCE = "https://pubmed.ncbi.nlm.nih.gov/37487528/"
POSE_TARGETS = json.loads((Path(__file__).parent / "pose_targets.json").read_text())
SCAN_VIEW_MODES = {
    "fast": ("front", "left_oblique", "right_oblique"),
    "standard": ("front", "left_profile", "right_profile"),
    "full": ("front", "front_smile", "left_oblique", "right_oblique", "left_profile", "right_profile", "basal"),
    # One close, evenly-lit front photograph, captured to be measured for skin rather than for
    # shape. It shares this function because it needs the same decode and the same landmark
    # mesh — `skin_engine` draws every region from that mesh and white-balances off the sclera,
    # so a skin scan is still a whole face, just a nearer one.
    "skin": ("front",),
}
PROFILE_VIEWS = ("left_profile", "right_profile")
DEFAULT_SCAN_MODE = "full"
SKIN_SCAN_MODE = "skin"

FRONT_METRICS = (
    ("upper_face_height_ratio", "harmony", 10, 168, "height"),
    ("midface_height_ratio", "harmony", 168, 2, "height"),
    ("lower_face_height_ratio", "harmony", 2, 152, "height"),
    ("right_eye_width_ratio", "eyes", 33, 133, "width"),
    ("left_eye_width_ratio", "eyes", 362, 263, "width"),
    ("intercanthal_ratio", "eyes", 133, 362, "width"),
    ("right_brow_eye_gap_ratio", "eyes", 105, 159, "height"),
    ("left_brow_eye_gap_ratio", "eyes", 334, 386, "height"),
    ("nose_length_ratio", "nose", 168, 2, "height"),
    ("alar_width_ratio", "nose", 98, 327, "width"),
    ("mouth_width_ratio", "lips_mouth", 61, 291, "width"),
    ("philtrum_ratio", "lips_mouth", 2, 0, "height"),
    ("lip_fullness_ratio", "lips_mouth", 0, 17, "height"),
    ("jaw_width_ratio", "jaw_chin", 172, 397, "width"),
    ("chin_height_ratio", "jaw_chin", 17, 152, "height"),
    ("chin_width_ratio", "jaw_chin", 176, 400, "width"),
    ("zygomatic_width_ratio", "cheeks", 116, 345, "width"),
)

# Ratios and angles measured against another feature rather than against the whole face, plus the
# left-against-right differences. Listed apart from FRONT_METRICS because each takes two distances
# or three points rather than one landmark pair, so they cannot be expressed as a row above.
EXTRA_FRONT_METRIC_KEYS = (
    "right_eye_aspect_ratio", "left_eye_aspect_ratio", "upper_lower_lip_ratio",
    "eye_width_asymmetry", "brow_gap_asymmetry", "mandible_asymmetry",
    "bizygomatic_to_upper_face_ratio", "facial_thirds_balance", "eye_separation_ratio",
    "nose_proportion_ratio", "mouth_to_nose_ratio", "chin_philtrum_ratio",
    "cheekbone_prominence_ratio",
    "right_canthal_tilt_deg", "left_canthal_tilt_deg",
    "right_brow_tilt_deg", "left_brow_tilt_deg",
    "right_gonial_angle_deg", "left_gonial_angle_deg",
    "alar_asymmetry", "lip_corner_asymmetry",
)

#: Measured once per profile and prefixed with the view name.
PROFILE_METRIC_KEYS = (
    "nose_projection_ratio", "facial_convexity_ratio",
    "upper_lip_eline_ratio", "lower_lip_eline_ratio",
    "mentolabial_angle_deg", "chin_projection_ratio",
)

#: Every key `measure()` can emit. Checked against the real output on every run rather than
#: trusted, because it is the thing three other places are pinned to: the labels in
#: `apps/web/src/data/faceMetrics.js`, the rows in `metric_catalog.py`, and the test that holds
#: those two together. A hand-kept list that nothing verifies drifts, and the way it drifts is
#: silent — a raw key like `some_new_ratio` in front of a user, or a label for a metric that
#: stopped being produced.
METRIC_KEYS = frozenset(
    ("face_width_to_height",)
    + tuple(key for key, *_ in FRONT_METRICS)
    + EXTRA_FRONT_METRIC_KEYS
    + tuple(f"{view}_{key}" for view in PROFILE_VIEWS for key in PROFILE_METRIC_KEYS)
)


def _decode(data):
    import cv2
    import numpy as np

    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("invalid_image")
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if gray.mean() < 30 or gray.mean() > 225:
        raise ValueError("poor_lighting")
    if cv2.Laplacian(gray, cv2.CV_64F).var() < 18:
        raise ValueError("blurry_image")
    return image


@lru_cache(maxsize=1)
def _face_landmarker():
    os.environ.setdefault("MEDIAPIPE_DISABLE_GPU", "1")
    import mediapipe as mp
    model_path = os.getenv("FACE_LANDMARKER_MODEL", str(Path(__file__).parent / "assets" / "face_landmarker.task"))
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path, delegate=mp.tasks.BaseOptions.Delegate.CPU),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=2,
        min_face_detection_confidence=0.6,
        min_face_presence_confidence=0.6,
        output_facial_transformation_matrixes=True,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def _profile_face_landmarker():
    """A guarded second opinion for a hard profile the primary detector cannot acquire.

    The model has a directional cold-start bias on near-profile stills: the supplied left view is
    found after mirroring but not in its original direction at any working size. This detector is
    only consulted after the stricter two-face detector fails every retry. It still asks for two
    faces (so a group photo is rejected), while a lower threshold is confined to an isolated crop.
    """
    os.environ.setdefault("MEDIAPIPE_DISABLE_GPU", "1")
    import mediapipe as mp
    model_path = os.getenv("FACE_LANDMARKER_MODEL", str(Path(__file__).parent / "assets" / "face_landmarker.task"))
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path, delegate=mp.tasks.BaseOptions.Delegate.CPU),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=2,
        min_face_detection_confidence=0.3,
        min_face_presence_confidence=0.3,
        output_facial_transformation_matrixes=True,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)

def pose_from_matrix(matrix):
    """Read a row-major flat 4x4 MediaPipe transform into pose_targets.json coordinates.

    yaw is negated so positive means the head is turned to the subject's right (verified
    against a real right-profile photo reading +62.9). This mirrors
    apps/web/src/lib/facePose.js element for element, including removing the uniform scale:
    both read M[2][0], this one as matrix[8] (row-major), the web one as data[2]
    (column-major).
    """
    scale = hypot(matrix[0], matrix[4], matrix[8])
    if scale < 1e-6:
        return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}
    return {
        "yaw": -degrees(asin(max(-1, min(1, -matrix[8] / scale)))),
        "pitch": degrees(atan2(matrix[9] / scale, matrix[10] / scale)),
        "roll": degrees(atan2(matrix[4] / scale, matrix[0] / scale)),
    }


# ---------------------------------------------------------------------------
# Detection layer, ported from github.com/Rapeepath/doodoodeedee.
#
# What changed: nothing about what is measured, only whether the face is found
# at all. `_landmarks(image)` still returns exactly `(points, pose)`, so every
# caller, the metric set and FORMULA_VERSION are untouched — this fixes scans
# that failed with "face_count" on a photo a person can plainly see their face
# in, which upstream's commits call "Crop the capture to the face so the scan
# can actually be finished" and "Put pose angles in one coordinate space".
#
# The extended metrics (_tilt_degrees, _facing, _signed_point_line_distance) and
# the FORMULA_VERSION bump to 2026.5-extended were held back here for a while,
# because they change what the numbers mean and invalidate stored scans along
# with every score card, development plan and chat answer derived from them.
# They are in now: six stored scans locally and none in production is the
# cheapest this will ever be, and the assessment screen needs the angles.
#
# Still deliberately NOT ported: that file's inline `_skin_metrics` and the
# client-landmark path. Its four `skin_observation` metrics are a cruder version
# of what `skin_engine.py` already computes here -- LAB, band-pass texture,
# per-region speculars -- so taking them would be a downgrade wearing the
# clothes of a merge.
# ---------------------------------------------------------------------------

def rotation_from_matrix(matrix):
    """The scale-free 3x3 head rotation carried by a MediaPipe face transform.

    Measurements only need the three display angles above. Multi-view simulation needs the full
    rotation so a displacement expressed on one shared face can be projected back into each
    photograph without treating a profile's horizontal image axis as facial width.
    """
    import numpy as np

    transform = np.asarray(matrix, dtype=np.float64).reshape(4, 4)
    block = transform[:3, :3]
    norms = np.linalg.norm(block, axis=0)
    if np.any(norms <= 1e-6):
        return np.eye(3, dtype=np.float64)
    return block / norms


# Sizes to try before calling a photo unusable, longest edge in pixels.
#
# The detector is far more scale-sensitive than its confidence threshold suggests, and not
# monotonically so: a real 65-degree profile in this repo is found at one working size and missed at
# a smaller one, with nothing about the photo changing but its resolution. Measured on this project's
# own failing scan, and the same list p1/doodee3/dd2 arrived at independently, which is where this
# comes from — dropping it there turned three usable views into two.
SCAN_ATTEMPTS = (1100, 1240, 1400, 860, 700)


def _detect_at_with_rotation(image):
    """One detection attempt, including the rotation needed by multi-view simulation."""
    import cv2
    import mediapipe as mp
    import numpy as np

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = _face_landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if len(result.face_landmarks) != 1 or len(result.facial_transformation_matrixes) != 1:
        raise ValueError("face_count")
    matrix = np.asarray(result.facial_transformation_matrixes[0], dtype=np.float64).reshape(-1)
    return (
        np.array([(p.x, p.y, p.z) for p in result.face_landmarks[0]], dtype=np.float64),
        pose_from_matrix(matrix),
        rotation_from_matrix(matrix),
    )


def _detect_profile_crop_with_rotation(image):
    """Locate a hard profile through a mirror, then landmark the untouched photo crop.

    Directly un-mirroring a mesh would swap anatomical landmark identities. The mirrored result
    therefore supplies only a padded box; x/y/z and head rotation come from a second detection on
    original pixels, then are mapped from crop-normalised coordinates back to the whole photo.
    """
    import cv2
    import mediapipe as mp
    import numpy as np

    detector = _profile_face_landmarker()
    hint = detector.detect(mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=cv2.cvtColor(cv2.flip(image, 1), cv2.COLOR_BGR2RGB),
    ))
    if len(hint.face_landmarks) != 1:
        raise ValueError("face_count")

    height, width = image.shape[:2]
    xs = np.asarray([point.x for point in hint.face_landmarks[0]], dtype=np.float64)
    ys = np.asarray([point.y for point in hint.face_landmarks[0]], dtype=np.float64)
    if not np.isfinite(xs).all() or not np.isfinite(ys).all():
        raise ValueError("face_count")
    padding = .18
    left = max(0, int(np.floor((1. - xs.max() - padding) * width)))
    right = min(width, int(np.ceil((1. - xs.min() + padding) * width)))
    top = max(0, int(np.floor((ys.min() - padding) * height)))
    bottom = min(height, int(np.ceil((ys.max() + padding) * height)))
    if right - left < 64 or bottom - top < 64:
        raise ValueError("face_count")

    crop = image[top:bottom, left:right]
    result = detector.detect(mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=cv2.cvtColor(crop, cv2.COLOR_BGR2RGB),
    ))
    if len(result.face_landmarks) != 1 or len(result.facial_transformation_matrixes) != 1:
        raise ValueError("face_count")
    matrix = np.asarray(result.facial_transformation_matrixes[0], dtype=np.float64).reshape(-1)
    pose = pose_from_matrix(matrix)
    # This is not a general relaxation of face detection. A frontal or mildly oblique false hit
    # cannot use the direction-assisted path; only a profile in the capture window can.
    if abs(pose["yaw"]) < 40:
        raise ValueError("face_count")

    crop_height, crop_width = crop.shape[:2]
    points = np.array([
        (
            (left + point.x * crop_width) / width,
            (top + point.y * crop_height) / height,
            point.z * crop_width / width,
        )
        for point in result.face_landmarks[0]
    ], dtype=np.float64)
    if (points.shape != (478, 3) or not np.isfinite(points).all()
            or np.any(points[:, :2] < -.1) or np.any(points[:, :2] > 1.1)):
        raise ValueError("face_count")
    return points, pose, rotation_from_matrix(matrix)


def _retry_landmark_detection(image, detector):
    """Run one detector over the shared scale sequence without upsampling the photo."""
    import cv2

    height, width = image.shape[:2]
    longest = max(height, width)
    attempted = set()
    error = ValueError("face_count")
    for target in SCAN_ATTEMPTS:
        scale = target / longest
        resized = image if scale >= 1 else cv2.resize(
            image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA,
        )
        key = resized.shape[:2]
        if key in attempted:
            continue
        attempted.add(key)
        try:
            return detector(resized)
        except ValueError as exc:
            error = exc
    raise error


def _landmarks(image):
    """Landmarks and pose, retrying at several working sizes before giving up.

    Landmarks come back normalised, so resizing the input changes nothing about the coordinates
    that are returned — only whether the detector finds the face at all.
    """
    points, pose, _rotation = _landmarks_with_rotation(image)
    return points, pose


def _landmarks_with_rotation(image):
    """Landmarks, display pose and full rotation, with the same retries as analysis.

    Keeping the retry list shared matters for stored scans: a profile accepted by analysis must
    not become unusable merely because simulation happened to call the detector at one size.
    """
    try:
        return _retry_landmark_detection(image, _detect_at_with_rotation)
    except ValueError:
        return _retry_landmark_detection(image, _detect_profile_crop_with_rotation)


def _isotropic(points, image):
    """Put both axes on one unit so a width may be divided by a height.

    MediaPipe normalises x by image width and y by image height, so on a 4:3 photo one x unit
    is 1.33 y units. Every ratio that mixes the two — alar width over nasion-gnathion,
    intercanthal, eye fissure — came out scaled by the photo's aspect rather than the face's,
    and every angle was sheared. Rescaling x into height units removes the photo's shape from
    the measurement.
    """
    import numpy as np

    height, width = image.shape[:2]
    if height <= 0 or width <= 0:
        raise ValueError("invalid_image")
    scaled = np.array(points, dtype=np.float64, copy=True)
    scaled[:, 0] *= width / height
    return scaled


def _distance(points, a, b):
    return hypot(points[a, 0] - points[b, 0], points[a, 1] - points[b, 1])


def _ratio(numerator, denominator):
    if denominator <= 0:
        raise ValueError("invalid_face_dimensions")
    return numerator / denominator


def _point_line_distance(points, point, line_a, line_b):
    import numpy as np

    p, a, b = points[point, :2], points[line_a, :2], points[line_b, :2]
    line = b - a
    length = float(np.linalg.norm(line))
    if length <= 0:
        raise ValueError("invalid_face_dimensions")
    return abs(float(np.cross(line, p - a))) / length


def _tilt_degrees(points, medial, lateral):
    """How far the lateral end of a feature rises above its medial end, in degrees.

    Positive means the outer end sits higher — an upward canthal tilt, an upward brow. The run
    is taken as |dx| so the left and right sides report the same sign for the same shape rather
    than mirroring each other, and y is subtracted the other way round because image y grows
    downward. Meaningful only on the front view: on a turned head the run is foreshortened.
    """
    run = abs(points[lateral, 0] - points[medial, 0])
    rise = points[medial, 1] - points[lateral, 1]
    if run <= 0:
        raise ValueError("invalid_face_dimensions")
    return degrees(atan2(rise, run))


def _facing(points):
    """+1 when the profile looks toward increasing x, -1 when it looks the other way.

    The nose tip is the most forward point of a profile and the nasion is behind it, so the sign
    of that gap is which way the face is pointing. Needed because a raw 2D cross product changes
    sign between a left and a right profile for the same anatomy.
    """
    return 1.0 if points[1, 0] >= points[168, 0] else -1.0


def _signed_point_line_distance(points, point, line_a, line_b, facing):
    """Distance from a point to a line, positive when the point is in front of it.

    Used for the E-line, where "the lip sits behind the line" and "in front of it" are different
    findings; `_point_line_distance` above collapses both to the same number.
    """
    import numpy as np

    p, a, b = points[point, :2], points[line_a, :2], points[line_b, :2]
    line = b - a
    length = float(np.linalg.norm(line))
    if length <= 0:
        raise ValueError("invalid_face_dimensions")
    return -float(np.cross(line, p - a)) * facing / length


def _pose_error(view, pose):
    target = POSE_TARGETS[view]
    corrections = {}
    for axis in ("yaw", "pitch", "roll"):
        low, high = target[axis]
        value = pose[axis]
        corrections[axis] = low - value if value < low else high - value if value > high else 0
    axis, delta = max(corrections.items(), key=lambda item: abs(item[1]))
    return f"pose_{view}:{axis}:{delta:+.0f}" if delta else None


def measured_views(scan_mode):
    """Views whose landmarks actually produce metrics.

    Everything else is captured for context only, so an off-target pose there is reported but
    does not throw the whole scan away.
    """
    # A skin scan measures none — its output is `skin_analysis`, which reads colour off patches
    # of the face and does not care whether the head was turned a few degrees. Leaving `front`
    # in here would mean nine degrees of yaw threw away a photograph whose lighting was perfect,
    # for a reason that has nothing to do with what the scan was taken for. The pose error is
    # still reported, as an advisory.
    if scan_mode == SKIN_SCAN_MODE:
        return set()
    views = {"front"}
    captured = set(SCAN_VIEW_MODES.get(scan_mode, ()))
    views |= {view for view in PROFILE_VIEWS if view in captured}
    return views


def _validate_pose_set(poses, scan_mode=DEFAULT_SCAN_MODE):
    measured = measured_views(scan_mode)
    advisories = []
    for view, pose in poses.items():
        error = _pose_error(view, pose)
        if not error:
            continue
        if view in measured:
            raise ValueError(error)
        advisories.append(error)
    return advisories


def _metric(key, category, value, confidence=0.72, source=ANTHROPOMETRY_SOURCE, unit="ratio"):
    return {
        "key": key,
        "category": category,
        "value": round(float(value), 5),
        # Degrees are read against the reference means directly; a ratio is not. Carried on the
        # metric because the client renders the two differently and cannot tell from the key.
        "unit": unit,
        "confidence": confidence,
        "status": "experimental",
        "formula_version": FORMULA_VERSION,
        "source": source,
    }


def scan_views_for_mode(scan_mode):
    return SCAN_VIEW_MODES[scan_mode]


def analyze_images(images, age_band="adult", scan_mode=DEFAULT_SCAN_MODE, reference_profile="neutral", reference_age_band="18_35", reference_population="TH"):
    required = set(scan_views_for_mode(scan_mode))
    if set(images) != required:
        raise ValueError("missing_views")

    decoded = {}
    points = {}
    poses = {}
    for view, data in images.items():
        try:
            decoded[view] = _decode(data)
        except ValueError as exc:
            raise ValueError(f"{exc}:{view}") from exc
    normalized = {}
    for view, image in decoded.items():
        try:
            normalized[view], poses[view] = _landmarks(image)
        except ValueError as exc:
            raise ValueError(f"{exc}:{view}") from exc
        # Measurements need square units; the skin masks still need raw image fractions.
        points[view] = _isotropic(normalized[view], image)
    pose_advisories = _validate_pose_set(poses, scan_mode)

    # Skin is measured separately and reported under its own key. It was folded into `metrics`
    # once; that put three photometric numbers in a catalogue of scale-free ratios, where they
    # were scored, capped and eventually hidden. See skin_engine for why they are regional now.
    skin = analyze_skin(decoded["front"], normalized["front"])

    if scan_mode == SKIN_SCAN_MODE:
        # Everything below this line measures shape, and a skin scan has no business producing
        # any of it. Returning an empty catalogue rather than a short one is the point: a
        # partial set of craniofacial ratios computed from a deliberately closer photograph
        # would be scored against the reference population and read as the user's face
        # changing, when all that changed was how far away they stood.
        return {
            "metrics": [],
            "metric_count": 0,
            "formula_version": FORMULA_VERSION,
            "experimental": True,
            "minor_restricted": age_band == "minor",
            "analysis_tier": SKIN_SCAN_MODE,
            "missing_optional_views": [],
            "pose_advisories": pose_advisories,
            "poses": {view: {axis: round(value, 2) for axis, value in pose.items()} for view, pose in poses.items()},
            "reference_scores": None,
            "skin_analysis": skin,
        }

    front = points["front"]
    width, height = _distance(front, 234, 454), _distance(front, 10, 152)
    reference_height = _distance(front, 168, 152)
    metrics = [_metric("face_width_to_height", "harmony", _ratio(width, height))]

    for key, category, a, b, denominator in FRONT_METRICS:
        metrics.append(_metric(key, category, _ratio(_distance(front, a, b), width if denominator == "width" else height)))

    bizygomatic = _distance(front, 116, 345)
    thirds = [_ratio(_distance(front, a, b), height) for a, b in ((10, 168), (168, 2), (2, 152))]
    metrics.extend((
        _metric("right_eye_aspect_ratio", "eyes", _ratio(_distance(front, 159, 145), _distance(front, 33, 133))),
        _metric("left_eye_aspect_ratio", "eyes", _ratio(_distance(front, 386, 374), _distance(front, 362, 263))),
        _metric("upper_lower_lip_ratio", "lips_mouth", _ratio(_distance(front, 0, 13), _distance(front, 14, 17))),
        _metric("eye_width_asymmetry", "symmetry", abs(_distance(front, 33, 133) - _distance(front, 362, 263)) / width, 0.68),
        _metric("brow_gap_asymmetry", "symmetry", abs(_distance(front, 105, 159) - _distance(front, 334, 386)) / height, 0.65),
        _metric("mandible_asymmetry", "symmetry", abs(_distance(front, 234, 152) - _distance(front, 454, 152)) / width, 0.65),

        # Feature measured against another feature rather than against the whole face. These are
        # the proportions clinicians quote — a nose against its own length, a mouth against the
        # nose over it — and they cannot be read off the width/height ratios above.
        _metric("bizygomatic_to_upper_face_ratio", "harmony", _ratio(bizygomatic, _distance(front, 168, 0)), 0.66),
        # Distance from an even three-way split, so 0 is balanced and larger is less balanced.
        _metric("facial_thirds_balance", "harmony", max(abs(third - 1 / 3) for third in thirds), 0.66),
        _metric("eye_separation_ratio", "eyes", _ratio(_distance(front, 133, 362), bizygomatic), 0.68),
        _metric("nose_proportion_ratio", "nose", _ratio(_distance(front, 98, 327), _distance(front, 168, 2)), 0.68),
        _metric("mouth_to_nose_ratio", "lips_mouth", _ratio(_distance(front, 61, 291), _distance(front, 98, 327)), 0.68),
        _metric("chin_philtrum_ratio", "jaw_chin", _ratio(_distance(front, 17, 152), _distance(front, 2, 0)), 0.64),
        _metric("cheekbone_prominence_ratio", "cheeks", _ratio(bizygomatic, _distance(front, 172, 397)), 0.64),

        # Angles. Degrees, not ratios, so they are read against the reference means directly.
        _metric("right_canthal_tilt_deg", "eyes", _tilt_degrees(front, 133, 33), 0.62, unit="degree"),
        _metric("left_canthal_tilt_deg", "eyes", _tilt_degrees(front, 362, 263), 0.62, unit="degree"),
        _metric("right_brow_tilt_deg", "eyes", _tilt_degrees(front, 107, 70), 0.58, unit="degree"),
        _metric("left_brow_tilt_deg", "eyes", _tilt_degrees(front, 336, 300), 0.58, unit="degree"),
        # A front-view stand-in for the gonial angle, which is properly read off a lateral
        # radiograph. It tracks how square the jaw looks from the front and nothing about bone.
        _metric("right_gonial_angle_deg", "jaw_chin", angle(front, 234, 172, 152), 0.5, unit="degree"),
        _metric("left_gonial_angle_deg", "jaw_chin", angle(front, 454, 397, 152), 0.5, unit="degree"),

        # Left-against-right differences: 0 is symmetric, and each is measured from a midline
        # point so a head turned a few degrees moves both sides together instead of one.
        _metric("alar_asymmetry", "symmetry", abs(_distance(front, 98, 1) - _distance(front, 327, 1)) / width, 0.6),
        _metric("lip_corner_asymmetry", "symmetry", abs(_distance(front, 61, 1) - _distance(front, 291, 1)) / width, 0.6),
    ))

    has_profiles = all(view in points for view in PROFILE_VIEWS)
    if has_profiles:
        for view in PROFILE_VIEWS:
            profile = points[view]
            profile_height = _distance(profile, 10, 152)
            facing = _facing(profile)
            metrics.append(_metric(f"{view}_nose_projection_ratio", "side_profile", _ratio(_distance(profile, 168, 1), profile_height), 0.58))
            metrics.append(_metric(f"{view}_facial_convexity_ratio", "side_profile", _ratio(_point_line_distance(profile, 1, 10, 152), profile_height), 0.58))
            # Ricketts' aesthetic line: nose tip to chin, with each lip reported as how far it
            # sits in front of that line. Signed on purpose — a lip ahead of the line and a lip
            # behind it are opposite findings, and an absolute distance shows them as the same.
            metrics.append(_metric(f"{view}_upper_lip_eline_ratio", "side_profile", _signed_point_line_distance(profile, 0, 1, 152, facing) / profile_height, 0.52))
            metrics.append(_metric(f"{view}_lower_lip_eline_ratio", "side_profile", _signed_point_line_distance(profile, 17, 1, 152, facing) / profile_height, 0.52))
            # Vertex 200 is the midline point in the labiomental fold, between the lower lip
            # border and the chin — the soft-tissue stand-in for the B point this angle uses.
            metrics.append(_metric(f"{view}_mentolabial_angle_deg", "side_profile", angle(profile, 17, 200, 152), 0.5, unit="degree"))
            metrics.append(_metric(f"{view}_chin_projection_ratio", "side_profile", _ratio(_point_line_distance(profile, 152, 168, 2), profile_height), 0.52))

    # A ceiling, not a target. It exists so a metric cannot be added without someone deciding it
    # is worth a row in front of a user; every key here also has to be named in
    # `apps/web/src/data/faceMetrics.js` and placed in `metric_catalog.py`.
    if len(metrics) > 60:
        raise AssertionError("Core metric catalog must stay at or below 60")
    emitted = {item["key"] for item in metrics}
    if emitted - METRIC_KEYS:
        raise AssertionError(f"metric not declared in METRIC_KEYS: {sorted(emitted - METRIC_KEYS)}")
    if has_profiles and METRIC_KEYS - emitted:
        raise AssertionError(f"declared metric never emitted: {sorted(METRIC_KEYS - emitted)}")

    analysis_tier = scan_mode
    missing_optional_views = [view for view in SCAN_VIEW_MODES["full"] if view not in images]
    stomion = (front[13, :2] + front[14, :2]) / 2
    observations = {
        "midface_height": _ratio(_distance(front, 168, 2), reference_height),
        "lower_face_height": _ratio(_distance(front, 2, 152), reference_height),
        "intercanthal": _ratio(_distance(front, 133, 362), reference_height),
        "eye_fissure": _ratio((_distance(front, 33, 133) + _distance(front, 362, 263)) / 2, reference_height),
        "alar_width": _ratio(_distance(front, 98, 327), reference_height),
        "upper_lip_length": _ratio(_distance(front, 2, 0), reference_height),
        "upper_vermillion": _ratio(_distance(front, 0, 13), reference_height),
        "lower_vermillion": _ratio(_distance(front, 14, 17), reference_height),
        "chin_height": _ratio(hypot(*(stomion - front[152, :2])), reference_height),
    }
    if has_profiles:
        profile_observations = []
        for view in PROFILE_VIEWS:
            profile = points[view]
            profile_observations.append({
                "nasofrontal_angle": angle(profile, 10, 168, 1),
                "nasolabial_angle": angle(profile, 1, 2, 0),
                "facial_convexity_angle": abs(180 - angle(profile, 168, 2, 152)),
            })
        for key in profile_observations[0]:
            observations[key] = sum(item[key] for item in profile_observations) / len(profile_observations)

    return {
        "metrics": metrics,
        "metric_count": len(metrics),
        "formula_version": FORMULA_VERSION,
        "experimental": True,
        "minor_restricted": age_band == "minor",
        "analysis_tier": analysis_tier,
        "missing_optional_views": missing_optional_views,
        "pose_advisories": pose_advisories,
        # Captured poses are kept so the widened profile yaw window (55-80) can be reviewed
        # against real scans before it is tightened or widened again.
        "poses": {view: {axis: round(value, 2) for axis, value in pose.items()} for view, pose in poses.items()},
        "reference_scores": score_observations(observations, reference_profile, reference_age_band, age_band, reference_population),
        "skin_analysis": skin,
    }
