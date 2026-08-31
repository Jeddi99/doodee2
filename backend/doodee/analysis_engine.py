from math import asin, atan2, degrees, hypot
import json
import os
from pathlib import Path
from functools import lru_cache

from .reference_scoring import angle, score_observations
from .skin_engine import analyze_skin


# 2026.4 rescales landmark x into height units before measuring. Scores from earlier versions
# carry the photo's aspect ratio in every width-over-height ratio and are not comparable.
FORMULA_VERSION = "2026.4-isotropic"
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
    ("jaw_width_ratio", "jaw_chin", 172, 397, "width"),
    ("chin_height_ratio", "jaw_chin", 17, 152, "height"),
    ("chin_width_ratio", "jaw_chin", 176, 400, "width"),
    ("zygomatic_width_ratio", "cheeks", 116, 345, "width"),
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


def _landmarks(image):
    import cv2
    import mediapipe as mp
    import numpy as np

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = _face_landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if len(result.face_landmarks) != 1 or len(result.facial_transformation_matrixes) != 1:
        raise ValueError("face_count")
    matrix = np.asarray(result.facial_transformation_matrixes[0], dtype=np.float64).reshape(-1)
    return np.array([(p.x, p.y, p.z) for p in result.face_landmarks[0]], dtype=np.float64), pose_from_matrix(matrix)


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


def _metric(key, category, value, confidence=0.72, source=ANTHROPOMETRY_SOURCE):
    return {
        "key": key,
        "category": category,
        "value": round(float(value), 5),
        "unit": "ratio",
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

    metrics.extend((
        _metric("right_eye_aspect_ratio", "eyes", _ratio(_distance(front, 159, 145), _distance(front, 33, 133))),
        _metric("left_eye_aspect_ratio", "eyes", _ratio(_distance(front, 386, 374), _distance(front, 362, 263))),
        _metric("upper_lower_lip_ratio", "lips_mouth", _ratio(_distance(front, 0, 13), _distance(front, 14, 17))),
        _metric("eye_width_asymmetry", "symmetry", abs(_distance(front, 33, 133) - _distance(front, 362, 263)) / width, 0.68),
        _metric("brow_gap_asymmetry", "symmetry", abs(_distance(front, 105, 159) - _distance(front, 334, 386)) / height, 0.65),
        _metric("mandible_asymmetry", "symmetry", abs(_distance(front, 234, 152) - _distance(front, 454, 152)) / width, 0.65),
    ))

    has_profiles = all(view in points for view in PROFILE_VIEWS)
    if has_profiles:
        for view in PROFILE_VIEWS:
            profile = points[view]
            profile_height = _distance(profile, 10, 152)
            metrics.append(_metric(f"{view}_nose_projection_ratio", "side_profile", _ratio(_distance(profile, 168, 1), profile_height), 0.58))
            metrics.append(_metric(f"{view}_facial_convexity_ratio", "side_profile", _ratio(_point_line_distance(profile, 1, 10, 152), profile_height), 0.58))

    if len(metrics) > 30:
        raise AssertionError("Core metric catalog must stay at or below 30")

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
