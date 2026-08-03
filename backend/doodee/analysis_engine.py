from math import hypot
import os
from pathlib import Path
from functools import lru_cache


FORMULA_VERSION = "2026.1"
MEDIAPIPE_SOURCE = "https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker"
ANTHROPOMETRY_SOURCE = "https://pubmed.ncbi.nlm.nih.gov/37487528/"

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
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def _landmarks(image):
    import cv2
    import mediapipe as mp
    import numpy as np

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = _face_landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if len(result.face_landmarks) != 1:
        raise ValueError("face_count")
    return np.array([(p.x, p.y, p.z) for p in result.face_landmarks[0]], dtype=np.float64)


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


def _pose_offset(points):
    left, right, nose = points[234, 0], points[454, 0], points[1, 0]
    width = abs(right - left)
    if width <= 0:
        raise ValueError("invalid_face_dimensions")
    return (nose - (left + right) / 2) / width


def _validate_pose_set(points):
    for view in ("front", "front_smile", "basal"):
        if abs(_pose_offset(points[view])) > 0.14:
            raise ValueError(f"pose_{view}")
    for view in ("left_oblique", "right_oblique"):
        if not 0.04 <= abs(_pose_offset(points[view])) <= 0.38:
            raise ValueError(f"pose_{view}")
    profile_offsets = [_pose_offset(points[view]) for view in ("left_profile", "right_profile")]
    for view, offset in zip(("left_profile", "right_profile"), profile_offsets):
        if abs(offset) < 0.12:
            raise ValueError(f"pose_{view}")
    if profile_offsets[0] * profile_offsets[1] >= 0:
        raise ValueError("pose_profiles")

    front = points["front"]
    eye_dx = abs(((front[33, 0] + front[133, 0]) / 2) - ((front[362, 0] + front[263, 0]) / 2))
    eye_dy = abs(((front[33, 1] + front[133, 1]) / 2) - ((front[362, 1] + front[263, 1]) / 2))
    if eye_dx <= 0 or eye_dy / eye_dx > 0.10:
        raise ValueError("pose_front_roll")


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


def _skin_metrics(image, points):
    import cv2
    import numpy as np

    height, width = image.shape[:2]
    hull = cv2.convexHull(np.array([(int(x * width), int(y * height)) for x, y, _ in points], dtype=np.int32))
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(mask, hull, 255)
    pixels = image[mask == 255].astype(np.float32) / 255.0
    if len(pixels) < 100:
        raise ValueError("skin_region_unavailable")
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    texture = cv2.Laplacian(gray, cv2.CV_32F)[mask == 255]
    b, g, r = pixels[:, 0], pixels[:, 1], pixels[:, 2]
    return (
        _metric("visible_tone_unevenness", "skin_observation", min(float(gray[mask == 255].std()) / 64, 1), 0.5, MEDIAPIPE_SOURCE),
        _metric("visible_redness", "skin_observation", float(np.mean(np.clip(r - (g + b) / 2, 0, 1))), 0.45, MEDIAPIPE_SOURCE),
        _metric("visible_texture", "skin_observation", min(float(texture.var()) / 1000, 1), 0.45, MEDIAPIPE_SOURCE),
    )


def analyze_images(images, age_band="adult"):
    required = {"front", "front_smile", "left_oblique", "right_oblique", "left_profile", "right_profile", "basal"}
    if set(images) != required:
        raise ValueError("missing_views")

    decoded = {}
    points = {}
    for view, data in images.items():
        try:
            decoded[view] = _decode(data)
        except ValueError as exc:
            raise ValueError(f"{exc}:{view}") from exc
    for view, image in decoded.items():
        try:
            points[view] = _landmarks(image)
        except ValueError as exc:
            raise ValueError(f"{exc}:{view}") from exc
    _validate_pose_set(points)
    front = points["front"]
    width, height = _distance(front, 234, 454), _distance(front, 10, 152)
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

    for view in ("left_profile", "right_profile"):
        profile = points[view]
        profile_height = _distance(profile, 10, 152)
        metrics.append(_metric(f"{view}_nose_projection_ratio", "side_profile", _ratio(_distance(profile, 168, 1), profile_height), 0.58))
        metrics.append(_metric(f"{view}_facial_convexity_ratio", "side_profile", _ratio(_point_line_distance(profile, 1, 10, 152), profile_height), 0.58))

    metrics.extend(_skin_metrics(decoded["front"], front))
    if len(metrics) > 30:
        raise AssertionError("Core metric catalog must stay at or below 30")
    return {
        "metrics": metrics,
        "metric_count": len(metrics),
        "formula_version": FORMULA_VERSION,
        "experimental": True,
        "minor_restricted": age_band == "minor",
    }
