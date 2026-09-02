"""Canonical 3-D fusion, multi-view projection, guarded warp, and LAB surface pipeline.

Pipeline, in the order the panels appear on screen:

    photo -> MediaPipe FaceMesh (478 3D landmarks)
          -> Delaunay triangulation (cv2.Subdiv2D)
          -> Z-depth shaded wireframe with 8 labelled anatomical zones
          -> parametric morph of the landmark coordinates from the sliders
          -> thin plate spline (or piecewise affine) warp of the *real* photo

Served by `main.py`; every public name here is reached from one of its four endpoints.

Every number this app produces is an educational estimate for a conversation with a licensed
clinician. It is not a prediction of a surgical outcome and not a prescription.
"""
from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import cv2
import numpy as np

from . import evidence
from .surface_effects import REGION_GROUPS, apply_surface_pipeline, steps_mask
from .procedure_catalog import (
    ProcedureSpec, TECHNIQUE_BY_REF, canonical_technique, refine_plan, surface_steps,
)

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------------------------
# Landmark groups. MediaPipe FaceMesh indices; see the canonical face_mesh topology.
# --------------------------------------------------------------------------------------------

ZONES = {
    "forehead": (10, 151, 9, 8, 107, 336, 66, 296, 105, 334, 108, 337, 69, 299, 104, 333, 68, 298,
                 71, 301, 109, 338),
    "temple": (21, 54, 103, 67, 251, 284, 332, 297, 127, 162, 234, 356, 389, 454, 137, 366),
    "eye_brow": (70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 33, 133, 160, 158, 144, 153, 246,
                 362, 263, 385, 387, 373, 380, 466, 173, 398),
    "nose": (168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 326, 327, 129, 358, 45, 275, 44, 274,
             220, 440, 64, 294),
    "cheek": (116, 117, 118, 119, 120, 100, 142, 205, 206, 207, 187, 123, 50, 101, 36, 111,
              345, 346, 347, 348, 349, 329, 371, 425, 426, 427, 411, 352, 280, 330, 266, 340),
    "lips": (61, 291, 0, 17, 13, 14, 78, 308, 81, 311, 178, 402, 37, 267, 39, 269, 84, 314, 181,
             405, 146, 375, 91, 321, 87, 317, 80, 310, 88, 318),
    "jaw": (172, 136, 150, 149, 176, 148, 58, 132, 93, 397, 365, 379, 378, 400, 377, 288, 361, 323),
    "chin": (152, 175, 199, 200, 18, 83, 313, 406, 182, 194, 32, 262, 428, 208, 421, 201),
}

# Muted clinical palette in BGR. Saturated rainbow reads as a toy; these are desaturated jewel
# tones that stay distinguishable while letting the depth shading carry the eye.
ZONE_COLOURS = {
    "forehead": (196, 148, 92),
    "temple": (176, 124, 156),
    "eye_brow": (206, 178, 104),
    "nose": (142, 188, 128),
    "cheek": (128, 132, 196),
    "lips": (150, 118, 178),
    "jaw": (188, 170, 108),
    "chin": (120, 160, 190),
}

# Background, wireframe and label tones. Slate rather than pure black so the panel reads as an
# instrument display instead of a void.
MESH_BACKDROP = (26, 22, 20)
MESH_EDGE = (168, 158, 148)
MESH_LABEL = (226, 220, 212)

ZONE_LABELS_TH = {
    "forehead": "หน้าผาก", "temple": "ขมับ", "eye_brow": "ตา/คิ้ว", "nose": "จมูก",
    "cheek": "แก้ม", "lips": "ริมฝีปาก", "jaw": "กราม", "chin": "คาง",
}

from .geometry_controls import *  # noqa: F401,F403 — closed deformation controls

REFINED_LANDMARKS = 478
# The spline is evaluated on a grid this many pixels apart and the field is then upsampled. Cost
# falls with the square of the spacing, so the interactive preview trades accuracy for latency
# (~470 ms at step 8) while the export, which runs once, uses a finer grid (~2.3 s at step 6).
EXPORT_STEP = 6
DISCLAIMER_TH = ("ภาพจำลองเพื่อการศึกษาและใช้คุยกับแพทย์เท่านั้น "
                 "ไม่ใช่การพยากรณ์ผลผ่าตัดจริง และไม่ใช่ใบสั่งยา")


# --------------------------------------------------------------------------------------------
# Face scanning
# --------------------------------------------------------------------------------------------

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/"
             "float16/1/face_landmarker.task")


def model_path():
    """Path to the FaceLandmarker weights, downloading them once if they are not here yet."""
    path = os.environ.get("FACE_LANDMARKER_MODEL")
    if path and os.path.exists(path):
        return path
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "face_landmarker.task")
    if not os.path.exists(local):
        import urllib.request

        urllib.request.urlretrieve(MODEL_URL, local)
    return local


@lru_cache(maxsize=1)
def _face_landmarker():
    """One landmarker for the process; building it costs about a second.

    This is the Tasks API rather than the older ``mp.solutions.face_mesh``. The legacy solutions
    module reads calculator options through a protobuf path that was removed in protobuf 5, so it
    breaks the moment anything in the environment pulls a newer protobuf — hence the pin in
    requirements.txt.
    """
    os.environ.setdefault("MEDIAPIPE_DISABLE_GPU", "1")
    import mediapipe as mp

    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path(),
                                          delegate=mp.tasks.BaseOptions.Delegate.CPU),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=.5,
        output_facial_transformation_matrixes=True,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def scan_face_pose(image):
    """Return (landmarks, rotation) — the 478 points plus the head orientation for this view.

    Landmarks are (478, 3): x and y in pixels of `image`, z as raw MediaPipe depth, which is
    measured from the head centre and grows *more negative* toward the camera — so callers that
    want "how far this point sticks out" negate it.

    The rotation comes from MediaPipe's facial transformation matrix and is what lets several
    photographs of the same person be reasoned about together: a change defined once on the
    frontal view can be rotated into whatever angle each other photo was taken from.
    """
    import mediapipe as mp

    height, width = image.shape[:2]
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = _face_landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not result.face_landmarks:
        raise ValueError("ไม่พบใบหน้าในภาพ — ลองถ่ายให้หน้าตรงและมีแสงพอ")
    points = result.face_landmarks[0]
    if len(points) < REFINED_LANDMARKS:
        raise ValueError(f"ได้ landmark เพียง {len(points)} จุด (ต้องการ {REFINED_LANDMARKS})")
    landmarks = np.array([[point.x * width, point.y * height, point.z * width] for point in points],
                         dtype=np.float32)
    rotation = np.eye(3, dtype=np.float64)
    if result.facial_transformation_matrixes:
        matrix = np.asarray(result.facial_transformation_matrixes[0], dtype=np.float64).reshape(4, 4)
        block = matrix[:3, :3]
        norms = np.linalg.norm(block, axis=0)
        if np.all(norms > 1e-6):
            rotation = block / norms
    return landmarks, rotation


def face_height(points):
    """Brow-to-chin distance: unlike the 234-454 width this barely foreshortens as the head turns,
    so it is the scale to compare two photographs taken from different angles."""
    return float(abs(points[152, 1] - points[10, 1])) or 1.


def yaw_degrees(rotation):
    return float(np.degrees(np.arctan2(-rotation[2, 0], np.hypot(rotation[2, 1], rotation[2, 2]))))


def face_width(points):
    """Distance between the two outermost face-oval landmarks, in pixels."""
    return float(np.linalg.norm(points[234, :2] - points[454, :2]))


# --------------------------------------------------------------------------------------------
# Delaunay triangulation
# --------------------------------------------------------------------------------------------

# Both are fractions of face width. A ring sweep on the test photo showed the tightest ring wins
# on every measure at once: peak local compression is set by the morph inside the face and barely
# moves with the ring (29% at usable settings for every radius from .04 to .20), while the share of
# changed pixels landing outside the face outline tracks the radius directly, 22% at .04 against
# 40% at .20. So the ring sits close in, and the mask hands back to the original just outside it.
ANCHOR_RING = .06          # where the deformation is pinned back to zero
MASK_RING = .13            # far enough out that the composite seam sits in dead-zero field


def face_ring(shape, points, ring):
    """The face outline pushed outward by `ring` (a fraction of face width), as a pixel contour.

    Offsetting through a mask rather than along hull normals costs nothing measurable and cannot
    self-intersect on a concave stretch the way a per-vertex offset can.
    """
    span = max(face_width(points), 1.)
    mask = np.zeros(shape[:2], dtype=np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(points[:, :2].astype(np.int32)), 255)
    size = _odd(ring * span)
    grown = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)))
    found, _ = cv2.findContours(grown, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return max(found, key=cv2.contourArea).reshape(-1, 2).astype(np.float32) if found else None


def border_anchors(shape, points, ring=ANCHOR_RING, count=64):
    """Fixed points that surround the face so the warp fades to nothing before the photo edge.

    Without these the triangulation stops at the face oval and the morph tears a visible seam
    along it. The anchors follow the face outline offset outward instead of sitting on an ellipse,
    which matters because an ellipse wide enough to clear the jaw corners is far away everywhere
    else, and a thin plate spline fills that gap by dragging whatever is in it. Measured on the
    test photo, the elliptical rings left the deformation still worth 39 px at the jaw where the
    composite hands back to the original photograph -- a step big enough to read as a ghost edge.
    A ring that hugs the face pins the field to zero there instead, so the seam has nothing to
    show, and it needs no Poisson pass afterwards to hide what would otherwise be a real
    discontinuity rather than a cosmetic one.
    """
    height, width = shape[:2]
    anchors = []
    contour = face_ring(shape, points, ring)
    if contour is not None and len(contour) >= count:
        anchors += list(contour[np.linspace(0, len(contour) - 1, count).astype(int)])
    else:                                                   # face fills the frame: fall back
        centre = points[:, :2].mean(axis=0)
        radius = np.abs(points[:, :2] - centre).max(axis=0)
        anchors += [centre + radius * 1.25 * np.array([np.cos(a), np.sin(a)])
                    for a in np.linspace(0, 2 * np.pi, 24, endpoint=False)]
    for x in np.linspace(0, width - 1, 9):
        anchors += [[x, 0], [x, height - 1]]
    for y in np.linspace(0, height - 1, 7):
        anchors += [[0, y], [width - 1, y]]
    anchors = np.array(anchors, dtype=np.float32)
    inside = ((anchors[:, 0] >= 0) & (anchors[:, 0] <= width - 1)
              & (anchors[:, 1] >= 0) & (anchors[:, 1] <= height - 1))
    return anchors[inside]


def delaunay(vertices, shape):
    """Triangle vertex indices from cv2.Subdiv2D, shape (n, 3).

    Subdiv2D hands back triangles by coordinate, including ones built on its virtual outer
    vertices, so each corner is matched back to an index and unmatched triangles are dropped.
    """
    height, width = shape[:2]
    subdiv = cv2.Subdiv2D((0, 0, width, height))
    lookup = {}
    for index, (x, y) in enumerate(vertices):
        # MediaPipe happily extrapolates a landmark past the frame; Subdiv2D throws on those.
        key = (int(np.clip(round(x), 0, width - 1)), int(np.clip(round(y), 0, height - 1)))
        if key in lookup:  # duplicate pixel: keep the first, Subdiv2D stores one vertex per point
            continue
        lookup[key] = index
        subdiv.insert((float(key[0]), float(key[1])))
    triangles = []
    for triangle in subdiv.getTriangleList():
        corners = [(int(round(triangle[i])), int(round(triangle[i + 1]))) for i in (0, 2, 4)]
        if any(corner not in lookup for corner in corners):
            continue
        triangles.append([lookup[corner] for corner in corners])
    return np.array(triangles, dtype=np.int32)


# --------------------------------------------------------------------------------------------
# Z-depth shaded mesh map
# --------------------------------------------------------------------------------------------

def zone_of_landmark():
    """Map every landmark index that belongs to a named zone to that zone's name."""
    return {index: zone for zone, indices in ZONES.items() for index in indices}


def crop(image, box):
    left, top, right, bottom = box
    return image[top:bottom, left:right]


def _text(image, text, origin, colour, size=18):
    """Draw a label, using a Thai-capable font when Windows has one and cv2's Latin font if not."""
    try:
        from PIL import Image, ImageDraw, ImageFont

        font = None
        for candidate in (r"C:\Windows\Fonts\leelawui.ttf", r"C:\Windows\Fonts\tahoma.ttf",
                          "/usr/share/fonts/truetype/tlwg/Garuda.ttf"):
            if os.path.exists(candidate):
                font = ImageFont.truetype(candidate, size)
                break
        if font is None:
            raise OSError("no thai-capable font")
        canvas = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        draw = ImageDraw.Draw(canvas)
        draw.text(origin, text, font=font, fill=tuple(int(c) for c in colour[::-1]),
                  stroke_width=2, stroke_fill=(0, 0, 0))
        image[:] = cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)
    except Exception:
        cv2.putText(image, text, origin, cv2.FONT_HERSHEY_SIMPLEX, size / 32,
                    colour, 2, cv2.LINE_AA)


def mesh_map(image, points, triangles, label=True, ghost=None, arrows=True,
             label_box=None):
    """Render the wireframe: brightness carries depth, colour carries the anatomical zone.

    Per the concept, each triangle's mean depth becomes a brightness factor
    ``0.82 + 0.36 * normalised_depth``, so protruding parts (nose bridge, chin) come out bright
    and recessed ones (the crease beside the nose, the eye sockets) come out dark.

    Pass `ghost` (the landmarks before the morph) to draw the original mesh underneath and an
    arrow on every landmark that moved, which is what makes the reshaping legible as geometry
    rather than as a before/after guess.
    """
    height, width = image.shape[:2]
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    canvas[:] = MESH_BACKDROP

    protrusion = -points[:, 2]  # negate: MediaPipe z is more negative closer to the camera
    face_only = triangles[(triangles < len(points)).all(axis=1)]
    if len(face_only) == 0:
        return canvas
    depth = protrusion[face_only].mean(axis=1)
    span = float(depth.max() - depth.min()) or 1.
    shading = .82 + .36 * (depth - depth.min()) / span

    membership = zone_of_landmark()
    order = np.argsort(depth)  # paint far triangles first so near ones sit on top
    for position in order:
        corners = face_only[position]
        zones = [membership.get(int(index)) for index in corners]
        named = [zone for zone in zones if zone]
        colour = ZONE_COLOURS[max(set(named), key=named.count)] if named else (120, 120, 120)
        shade = float(shading[position])
        polygon = points[corners, :2].astype(np.int32)
        cv2.fillConvexPoly(canvas, polygon,
                           [min(255, c * shade * .30) for c in colour], cv2.LINE_AA)
        # edges take their brightness from depth and only a hint of the zone's hue, so the
        # surface reads as one shaded object rather than eight coloured stickers
        edge = [min(255, (MESH_EDGE[i] * .62 + colour[i] * .38) * shade * .78) for i in range(3)]
        cv2.polylines(canvas, [polygon], True, edge, 1, cv2.LINE_AA)

    if ghost is not None:
        shift = np.linalg.norm(points[:, :2] - ghost[:, :2], axis=1)
        threshold = max(.6, float(face_width(ghost)) * .004)
        for corners in face_only:
            if shift[corners].max() <= threshold:
                continue  # this triangle did not move, so there is no "before" worth drawing
            cv2.polylines(canvas, [ghost[corners, :2].astype(np.int32)], True, (105, 105, 105),
                          1, cv2.LINE_AA)
        if arrows:
            for index in np.argsort(shift)[::-1]:
                if shift[index] <= threshold:
                    break
                start = tuple(ghost[index, :2].astype(int))
                end = tuple(points[index, :2].astype(int))
                cv2.arrowedLine(canvas, start, end, (255, 255, 255), 1, cv2.LINE_AA,
                                tipLength=.34)

    if label:
        _zone_callouts(canvas, points, label_box)
    return canvas


def _zone_callouts(canvas, points, label_box=None, size=17, line_height=26):
    """Write the zone names in the empty margin and run a thin line to each zone.

    Printing them over the mesh made both unreadable — the labels sat on top of the very triangles
    they were naming. Out here they have their own space, and the leader line carries the meaning
    the position used to.
    """
    height, width = canvas.shape[:2]
    left_bound, top_bound, right_bound, bottom_bound = label_box or (0, 0, width, height)

    centres = {zone: points[list(indices), :2].mean(axis=0) for zone, indices in ZONES.items()}
    face_left, face_top = points[:, :2].min(axis=0)
    face_right, face_bottom = points[:, :2].max(axis=0)

    # Alternate down the face rather than splitting on which side of the midline a zone sits.
    # Nearly every zone is bilateral, so its centroid lands on the midline and a positional split
    # dumped all eight names into one column.
    ordered = sorted(centres, key=lambda zone: centres[zone][1])
    columns = {-1: ordered[0::2], 1: ordered[1::2]}

    for side in (-1, 1):
        names = columns[side]
        if not names:
            continue
        # spread the column over the available height so the leader lines stay untangled
        span = max(bottom_bound - top_bound - line_height, 1)
        step = min(line_height, span / max(len(names), 1))
        start = max(top_bound + line_height,
                    min((face_top + face_bottom) / 2 - step * len(names) / 2,
                        bottom_bound - step * len(names)))

        for order, zone in enumerate(names):
            text = ZONE_LABELS_TH[zone]
            estimated = int(len(text) * size * .62)
            label_y = int(start + order * step)
            if side < 0:
                text_x = max(left_bound + 4, int(face_left) - 16 - estimated)
                anchor = (text_x + estimated, label_y)
            else:
                text_x = min(right_bound - estimated - 4, int(face_right) + 16)
                anchor = (text_x, label_y)

            target = centres[zone].astype(int)
            cv2.line(canvas, anchor, (int(target[0]), int(target[1])),
                     [int(c * .62) for c in ZONE_COLOURS[zone]], 1, cv2.LINE_AA)
            cv2.circle(canvas, (int(target[0]), int(target[1])), 3, ZONE_COLOURS[zone], -1,
                       cv2.LINE_AA)
            _text(canvas, text, (text_x, label_y - size + 2), MESH_LABEL, size)


# --------------------------------------------------------------------------------------------
# Parametric morph engine
# --------------------------------------------------------------------------------------------

LOCAL_SUPPORT_FACE_WIDTH = .24


def _compact_mesh_displacement(pixels, movement, support_radius):
    """Spread sparse landmark offsets over nearby mesh vertices, and nowhere else.

    The spline treats every landmark handed to it as a control, so the ~460 vertices no rule names
    arrive as exact zero-displacement controls a few pixels from the ones that moved, and the
    regularised solve averages the request away. Measured on 1.png at 1100 px, a jaw squeeze of
    9.9 px reached 30% of what it asked for; on the smaller face in 3.png a 3.4 px request reached
    1%, which is a slider that visibly does nothing under a report stating millimetres.

    The field is a Wendland C2 kernel used twice. Once normalised across the controls it
    interpolates *which* offset a vertex should follow; taken at its own peak it says *how much* of
    that offset survives, falling to nothing at `support_radius`. Both are needed. Weighting by
    inverse distance alone -- ``kernel / (distance ** 2 + 1e-4)`` -- looks like a decay but is not
    one: the weights blow up near every control, so the normalised average returns almost the full
    offset anywhere inside the radius and the field is a flat-topped disc that translates a whole
    region rigidly. On the test photo a 65 px brow lift moved the upper eyelid 62 px and the nose
    bridge 58 px, which is the eyes and the nose travelling with the brows rather than the brow
    reshaping against them. With the peak as the amplitude, the same vertex at half the radius
    keeps 19% instead of 96%.

    Zero-offset entries in `movement` are pins (see `HOLD`). They are controls like any other, so
    the field slides smoothly from a moving landmark down to a pinned neighbour -- the stretch a
    brow lift actually puts into the skin above the eye -- instead of stopping at a hard edge that
    the spline would render as a crease. Controls are reassigned at the end so coincident
    left/right influences cannot dilute the value the catalogue asked for.
    """
    points = np.asarray(pixels, dtype=np.float32)[:, :2]
    if not np.isfinite(support_radius) or support_radius <= 0:
        raise ValueError("invalid mesh support radius")
    indices = np.array(sorted(movement), dtype=np.int32)
    offsets = np.array([movement[int(index)] for index in indices], dtype=np.float32)
    controls = points[indices]
    normalised = np.linalg.norm(points[:, None, :] - controls[None, :, :], axis=2) / support_radius
    one_minus = np.clip(1 - normalised, 0, 1)
    kernel = ((one_minus ** 4) * (4 * normalised + 1)).astype(np.float32)
    kernel[normalised >= 1] = 0.

    total = kernel.sum(axis=1, keepdims=True)
    blend = np.divide(kernel @ offsets, total, out=np.zeros((len(points), offsets.shape[1]),
                                                            dtype=np.float32), where=total > 0)
    spread = blend * kernel.max(axis=1, keepdims=True)
    spread[indices] = offsets
    return spread


@lru_cache(maxsize=None)
def peak_gain(key):
    """Largest 3D displacement one unit of this control produces on any single landmark.

    Rules stack: several of them can touch the same landmark on the same axis. Dividing by this
    turns "the strongest point moves N millimetres" into the per-rule amount, so the number a
    study reports is what the slider actually delivers.

    Depth counts here even though a frontal photo barely shows it. A study measuring 3 mm of chin
    projection measured 3 mm of forward movement, and forward movement is nearly invisible head-on
    while being the whole story in profile. Normalising on the flat distance instead would have
    inflated the change until the frontal view alone looked right and every other angle was wrong.
    """
    rules = RULES[key]
    worst = 0.
    for index in {index for _, _, indices in rules for index in indices}:
        stacked = [sum(gain for mode, gain, indices in rules
                       if mode == axis and index in indices)
                   for axis in ("spread", "vertical", "depth")]
        worst = max(worst, float(np.linalg.norm(stacked)))
    return worst or 1.

def morph_landmarks(points, sliders, amplify=1.):
    """Move the landmarks according to the sliders; returns a new (478, 3) array.

    Slider values are read as real millimetres of tissue movement (see `evidence.py`) and
    converted to pixels through the face's own interpupillary distance, so the same setting means
    the same physical change whatever the photo. `amplify` deliberately overstates that movement
    for people who want to see the direction of a change that is honestly only a millimetre.
    """
    origin = points.astype(np.float64)
    midline = float(points[(1, 4, 168, 152), 0].mean())
    scale = evidence.pixels_per_mm(points)
    span = max(face_width(points), 1.)
    total = np.zeros(origin.shape, dtype=np.float64)

    for key, rules in RULES.items():
        moved = points.copy()
        setting = float(sliders.get(key, 0))
        if not setting:
            continue
        target_mm = evidence.millimetres(key, setting, amplify)
        if not target_mm:
            continue
        amount = target_mm * scale / peak_gain(key)
        # the fold ceiling still wins: past it the Gaussian/spline warp tears the image. Clipped
        # on both sides now that a control can be pulled below zero -- `min` alone left the
        # downward direction with no ceiling at all.
        cap = MAX_SHIFT * (face_width(points) or 1.)
        amount = float(np.clip(amount, -cap, cap))
        for mode, gain, indices in rules:
            index = np.asarray(indices)
            step = amount * gain
            if mode == "spread":
                # away from the midline for a positive gain, toward it for a negative one
                moved[index, 0] += np.sign(points[index, 0] - midline) * step
            elif mode == "vertical":
                moved[index, 1] -= step  # image y grows downward, so a lift is negative
            elif mode == "depth":
                moved[index, 2] -= step  # MediaPipe z grows negative toward the camera
            else:
                raise ValueError(f"unknown morph mode {mode!r} on {key}")

        # Let the vertices around each named landmark co-move before the spline ever sees them,
        # and hold this control's neighbours still; see `_compact_mesh_displacement` for what a
        # sparse request loses without the first and what it drags along without the second.
        #
        # Per control rather than once over the union, because the two halves of that are both
        # per-control facts: a jaw squeeze needs a wide neighbourhood and a brow lift a narrow one,
        # and the landmarks a jaw squeeze must not disturb are not the ones a brow lift must not.
        # Running the spread once on the combined offsets gave every control the widest radius any
        # of them wanted and no pins at all.
        offsets = moved - points
        named = np.flatnonzero(np.abs(offsets).max(axis=1) > 1e-9)
        if not len(named):
            continue
        movement = {int(index): tuple(float(value) for value in offsets[index]) for index in named}
        for index in HOLD.get(key, ()):
            movement.setdefault(int(index), (0., 0., 0.))
        radius = span * SUPPORT.get(key, LOCAL_SUPPORT_FACE_WIDTH)
        total += _compact_mesh_displacement(points, movement, radius)

    return (origin + total).astype(points.dtype)


def to_canonical(points, rotation):
    """Put one view's landmarks into the head's own frame, centred and scaled to unit face height.

    Every photo of the same person then lands in the same coordinate system regardless of the
    angle it was shot from, which is what makes combining them meaningful.
    """
    cloud = points.astype(np.float64)
    centre = cloud.mean(axis=0)
    scale = face_height(points)
    return ((cloud - centre) / scale) @ rotation


def view_visibility(canonical, rotation, floor=.12):
    """How squarely each landmark faces the camera in this view, as a weight in [floor, 1].

    A profile photograph genuinely observes the near cheek; the far half of the face is inferred
    by the model rather than seen. This drives the Procrustes fit, where surface orientation is
    the right question. It is deliberately *not* used to average coordinates — see `fuse_views`.
    """
    axis = np.array([0., 0., 1.]) @ rotation            # camera direction in the head's frame
    radial = canonical / np.maximum(np.linalg.norm(canonical, axis=1, keepdims=True), 1e-9)
    return np.clip(-(radial @ axis), floor, 1.)


def depth_is_plausible(canonical, rank_limit=40):
    """Does this cloud's depth obey the anatomy it is supposed to describe?

    On a real face the nose tip is the most forward point, ahead of both the cheeks and the chin.
    A view whose depth fails that has not measured the face — it has guessed at the half it could
    not see — and folding it into the shared model would corrupt a reading that was already right.
    """
    protrusion = -canonical[:, 2]
    tip = protrusion[4]
    if int((protrusion > tip).sum()) > rank_limit:
        return False
    return bool(tip > protrusion[[205, 425]].max() and tip > protrusion[152])


def _procrustes(source, target, weights):
    """Weighted Kabsch fit: the rotation and scale that best lay `source` onto `target`."""
    column = weights[:, None]
    total = column.sum()
    source_centre = (source * column).sum(axis=0) / total
    target_centre = (target * column).sum(axis=0) / total
    centred_source = source - source_centre
    centred_target = target - target_centre

    correlation = (centred_source * column).T @ centred_target
    left, singular, right = np.linalg.svd(correlation)
    # Points are row vectors throughout this engine, so the Kabsch rotation is U D Vh.
    # The column-vector form V D U^T returns the inverse rotation when used as `source @ R`.
    flip = np.sign(np.linalg.det(left @ right))
    rotation = left @ np.diag([1., 1., flip]) @ right
    variance = ((centred_source ** 2) * column).sum()
    scale = float((singular * [1., 1., flip]).sum() / variance) if variance > 1e-12 else 1.
    return rotation, scale, source_centre, target_centre


def fuse_views(views):
    """Combine every scanned photo into a single canonical 3D face; returns (478, 3).

    MediaPipe's head pose is a good starting guess but it under-reads a hard profile — the two
    side photos here read as 57° and 61° when they are nearer 90°. Rotating by that alone leaves
    the clouds misaligned, and averaging misaligned clouds shrinks the face instead of sharpening
    it. So the pose only seeds the frame, and the actual fit comes from a weighted Procrustes
    alignment onto the most frontal view, solved from the landmark correspondences themselves.

    Each view then contributes each landmark in proportion to how squarely it sees it, and a point
    that disagrees badly with the others is dropped rather than averaged in — one of these three
    profiles came back with its depth mirrored, and a plain mean would fold that error into the
    model every photo is subsequently warped by.
    """
    clouds = [to_canonical(view["points"], view["rotation"]) for view in views]
    # Remember how to get back out again. A displacement carries no translation, so each view only
    # needs the linear part: canonical -> that view's own frame -> that photo's pixels. The single
    # photo case needs it too: a full-resolution export reads it back to rescale the alignment.
    views[0]["from_canonical"] = (views[0]["rotation"].T, face_height(views[0]["points"]))
    if len(views) == 1:
        views[0]["depth_used"] = depth_is_plausible(clouds[0])
        return clouds[0].astype(np.float32)

    reference = clouds[0]
    aligned = [reference]
    for cloud, view in zip(clouds[1:], views[1:]):
        weights = view_visibility(cloud, view["rotation"])
        rotation, scale, source_centre, target_centre = _procrustes(cloud, reference, weights)
        aligned.append(((cloud - source_centre) @ rotation) * scale + target_centre)
        view["from_canonical"] = (rotation.T @ view["rotation"].T,
                                  face_height(view["points"]) / max(scale, 1e-9))

    # Take from each photograph only what it can actually measure. A camera records nothing about
    # the axis it points along, so a frontal shot fixes width and height while telling you little
    # about protrusion, and a profile is the reverse. Averaging all three coordinates from all
    # three views instead collapses the face: the profiles cannot see ear-to-ear width, so blending
    # their guess at it shrank the fused width to a fifth of the measured one.
    fused = aligned[0].copy()                      # width and height from the most frontal view

    # Depth is where a side view should earn its keep, but only if its depth is worth having.
    # MediaPipe infers the hidden half of a face shot near 90°, and on the sample set both
    # profiles put the nose tip around 400th most protruding out of 478 — blending those in moved
    # the fused tip from 1st to 214th. So every view has to pass a physical check first.
    trusted = [cloud for cloud, view in zip(aligned, views) if depth_is_plausible(cloud)]
    views[0]["depth_used"] = depth_is_plausible(aligned[0])
    for view, cloud in zip(views[1:], aligned[1:]):
        view["depth_used"] = depth_is_plausible(cloud)
    if len(trusted) > 1:
        depth = np.stack([cloud[:, 2] for cloud in trusted])
        fused[:, 2] = np.median(depth, axis=0) if len(trusted) > 2 else depth.mean(axis=0)
    return fused.astype(np.float32)


def project_to_view(displacement, view):
    """Take a displacement expressed on the fused model and land it on one photo's landmarks.

    Uses the inverse of whatever brought this view into the shared frame, so a view that needed a
    Procrustes correction gets that correction undone rather than only its head pose.
    """
    if not displacement.any():
        return view["points"].copy()
    matrix, scale = view.get("from_canonical",
                             (view["rotation"].T, face_height(view["points"])))
    projected = displacement.astype(np.float64) @ matrix * scale
    return (view["points"] + projected.astype(np.float32)).astype(np.float32)


def morph_fused(fused, sliders, views, amplify=1.):
    """Run the sliders once on the shared model, then hand every view its own projection.

    This is the whole point of scanning several angles: there is one face being reshaped, and the
    photographs are just windows onto it. Running the rules per photo instead would let the views
    drift apart, and on a profile they would not even mean the right thing, since every jaw
    landmark sits on the same side of the midline there.
    """
    displacement = morph_landmarks(fused, sliders, amplify) - fused
    return displacement, [project_to_view(displacement, view) for view in views]


# --------------------------------------------------------------------------------------------
# Solving for a published reference target
#
# The legacy engine could aim at a measured target because it moved control points on one
# photograph and could measure the result there directly. This engine runs sliders on a shared
# 3-D model and projects back, so there is no such loop -- the setting that lands a measurement
# on its published mean is not known in advance.
#
# It is cheap to search for. `morph_fused` touches 478 points and no pixels, so measuring a
# candidate setting costs a fraction of a millisecond; a dozen of them still cost nothing next to
# one warp of three photographs. So the setting is found by bisection on the landmarks alone, and
# only then is a single render done.
# --------------------------------------------------------------------------------------------

#: Which slider moves each region's measured span. One per region, because the target is one
#: measurement: `reference_scoring.REFERENCE_TARGETS` lists only regions the Thai study reports.
REFERENCE_CONTROLS = {"nose": "noseWingSlim", "lips": "lipVolume", "chin": "chinLength"}

#: The landmark pairs behind each reference observation, and the span they are divided by. The
#: same pairs `analysis_engine` uses to build `observations`, so what is solved for here is the
#: same number the analysis screen showed — `ReferenceSpanParityTest` holds the two together.
#: An endpoint is a landmark index, or a tuple of indices to average — stomion is the midpoint
#: of the lip contact and has no index of its own.
REFERENCE_SPANS = {
    "alar_width": (98, 327),
    "upper_vermillion": (0, 13),
    "lower_vermillion": (14, 17),
    # Stomion to gnathion, which is what `analysis_engine` measures. Not the vermillion border
    # at 17: the lip contact and the lower lip edge are different points, and on a real face the
    # two spans differ by about 40%, which is more than the whole change being solved for.
    "chin_height": ((13, 14), 152),
}
REFERENCE_DENOMINATOR = (168, 152)   # nasion to gnathion

#: The strongest setting any procedure asks for, so the search cannot return one the renderer
#: would never otherwise be given.
REFERENCE_SETTING_LIMIT = 130.0

#: Halvings. Twelve takes a 260-wide bracket to under a hundredth of a setting unit, which is far
#: finer than the warp can express, and the whole search still costs less than one render.
REFERENCE_SOLVE_STEPS = 12


def reference_observation(points, keys):
    """The sum of one region's measured ratios on a set of landmarks.

    Summed rather than averaged because that is what `reference_target` compares against: the
    study splits the vermillion into two bands and the slider moves total lip height, and the two
    ratios share a denominator, so they add.
    """
    def at(endpoint):
        if isinstance(endpoint, tuple):
            return points[list(endpoint), :2].mean(axis=0)
        return points[endpoint, :2]

    low, high = REFERENCE_DENOMINATOR
    denominator = float(np.linalg.norm(at(low) - at(high)))
    if denominator <= 0:
        raise ValueError("invalid_face_dimensions")
    return sum(float(np.linalg.norm(at(first) - at(second))) / denominator
               for first, second in (REFERENCE_SPANS[key] for key in keys))


def solve_reference_sliders(fused, views, target, amplify=1.):
    """The slider setting whose morphed landmarks land on the published mean.

    Returns `(sliders, reached)` — `reached` is the ratio actually achieved, which is not always
    the one asked for: a face far enough from the mean can want more than the strongest setting
    delivers. Returning it rather than the request is what lets the caller say the image shows as
    much of the change as the renderer allows, instead of captioning it with a number it did not
    reach.
    """
    control = REFERENCE_CONTROLS.get(target["region"])
    if control is None:
        raise ValueError("region_without_reference_data")
    keys, wanted = tuple(target["keys"]), float(target["reference_ratio"])
    front = next((index for index, view in enumerate(views) if view["name"] == "front"), 0)

    def measure(setting):
        _displacement, projected = morph_fused(fused, {control: setting}, views, amplify)
        return reference_observation(projected[front], keys)

    low, high = -REFERENCE_SETTING_LIMIT, REFERENCE_SETTING_LIMIT
    at_low, at_high = measure(low), measure(high)
    # The target outside what this control can reach. Clamped to whichever end gets closest
    # rather than refused: the honest picture is the biggest change available, and the caller
    # reports `reached` so nothing claims the mean was met.
    if not min(at_low, at_high) <= wanted <= max(at_low, at_high):
        setting = low if abs(at_low - wanted) < abs(at_high - wanted) else high
        return {control: setting}, measure(setting)

    for _ in range(REFERENCE_SOLVE_STEPS):
        middle = (low + high) / 2
        value = measure(middle)
        if (value > wanted) == (at_low > wanted):
            low, at_low = middle, value
        else:
            high = middle
    setting = round((low + high) / 2, 2)
    return {control: setting}, measure(setting)


# --------------------------------------------------------------------------------------------
# Piecewise affine warp of the real photo
# --------------------------------------------------------------------------------------------

def warp_photo(image, source, target, triangles):
    """Bend the real photograph from `source` vertices onto `target` vertices, triangle by triangle.

    Each triangle gets its own affine transform, which is what lets the skin stretch smoothly
    instead of sliding as one rigid block. Anchor triangles are identical on both sides, so the
    photo outside the face is reproduced exactly.
    """
    height, width = image.shape[:2]
    output = image.copy()
    for corners in triangles:
        source_tri = source[corners].astype(np.float32)
        target_tri = target[corners].astype(np.float32)
        if np.allclose(source_tri, target_tri):
            continue  # anchor triangle: leave the original pixels untouched

        source_rect = cv2.boundingRect(source_tri)
        target_rect = cv2.boundingRect(target_tri)
        if source_rect[2] <= 0 or source_rect[3] <= 0 or target_rect[2] <= 0 or target_rect[3] <= 0:
            continue
        sx, sy, sw, sh = source_rect
        tx, ty, tw, th = target_rect
        if sx < 0 or sy < 0 or sx + sw > width or sy + sh > height:
            continue
        if tx < 0 or ty < 0 or tx + tw > width or ty + th > height:
            continue

        # getAffineTransform demands CV_32F, and subtracting a plain tuple would promote to float64
        local_source = (source_tri - np.float32((sx, sy))).astype(np.float32)
        local_target = (target_tri - np.float32((tx, ty))).astype(np.float32)
        transform = cv2.getAffineTransform(local_source, local_target)
        patch = cv2.warpAffine(image[sy:sy + sh, sx:sx + sw], transform, (tw, th),
                               flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
        mask = np.zeros((th, tw), dtype=np.float32)
        cv2.fillConvexPoly(mask, local_target.astype(np.int32), 1., cv2.LINE_AA)
        mask = mask[:, :, None]
        region = output[ty:ty + th, tx:tx + tw]
        output[ty:ty + th, tx:tx + tw] = (region * (1 - mask) + patch * mask).astype(np.uint8)
    return output


def deformation_map(shape, source, target, triangles, blur=21):
    """How far each pixel was dragged, in pixels, as a smooth map over the frame.

    Painting the mean vertex displacement into each destination triangle and blurring the result
    gives a field that is strong where the warp worked hardest and zero everywhere it did not,
    which is exactly where refinement should and should not touch the photo.
    """
    field = np.zeros(shape[:2], dtype=np.float32)
    for corners in triangles:
        shift = float(np.linalg.norm(target[corners] - source[corners], axis=1).mean())
        if shift <= .01:
            continue
        cv2.fillConvexPoly(field, target[corners].astype(np.int32), shift)
    return cv2.GaussianBlur(field, (blur | 1, blur | 1), 0)


def refine_locally(after, field, strength=.65):
    """Clean up piecewise-affine banding with OpenCV only — no network, no quota.

    Neighbouring triangles get slightly different affine transforms, which leaves faint ridges
    along their shared edges. A bilateral pass removes those without melting pores, and mixing it
    in proportionally to `field` keeps the untouched parts of the photo bit-for-bit original.
    """
    if field.max() <= 0:
        return after
    smoothed = cv2.bilateralFilter(after, 7, 45, 9)
    weight = (np.clip(field / field.max(), 0, 1) * strength)[:, :, None]
    return (after * (1 - weight) + smoothed * weight).astype(np.uint8)


def _tps_solve(control, values, smoothing=1e-3):
    """Fit a thin plate spline mapping `control` points onto `values`.

    Coordinates are normalised before the solve because the radial basis is ill-conditioned at
    pixel magnitudes, and a small ridge on the diagonal keeps the system stable when two landmarks
    nearly coincide.
    """
    count = len(control)
    squared = ((control[:, None, :] - control[None, :, :]) ** 2).sum(-1)
    basis = .5 * squared * np.log(np.maximum(squared, 1e-12))
    basis[np.diag_indices(count)] += smoothing
    affine = np.hstack((np.ones((count, 1)), control))
    system = np.zeros((count + 3, count + 3))
    system[:count, :count] = basis
    system[:count, count:] = affine
    system[count:, :count] = affine.T
    return np.linalg.solve(system, np.vstack((values, np.zeros((3, values.shape[1])))))


# How many grid points to build the radial basis for at a time.
#
# The basis is the expensive half of the warp and it was built the direct way: broadcast the whole
# grid against every control point into a (query, control, 2) array, square it, reduce it. At
# 1280 px and step 8 that is 25k query points against ~540 control points, so a 220 MB float64
# difference, squared into a second one and reduced into a third, for a 110 MB answer -- per view,
# three views per render.
#
# Written a block at a time into a pre-allocated result, with the two coordinates handled
# separately so the (query, control, 2) array never exists. Every step is element-wise, so the
# values and the order they are computed in are unchanged and the output is identical to the last
# bit; measured on the real grid it is 3.1x faster and holds 3.4x less memory.
#
# The matrix product afterwards is deliberately left whole. Splitting *that* changes how BLAS
# accumulates each row and moved the result by ~1e-12 -- invisible on screen, but not the same
# number, and `map_squeeze` reads this map to decide whether to hold a morph back.
_TPS_BLOCK = 4096


def _tps_apply(weights, control, query):
    count = len(control)
    control_x, control_y = control[:, 0], control[:, 1]
    basis = np.empty((len(query), count), dtype=np.float64)
    # One spare block, reused, rather than a fresh temporary per iteration.
    scratch = np.empty((min(_TPS_BLOCK, max(len(query), 1)), count), dtype=np.float64)
    for start in range(0, len(query), _TPS_BLOCK):
        block = query[start:start + _TPS_BLOCK]
        squared = basis[start:start + len(block)]
        spare = scratch[:len(block)]
        # squared = dx*dx + dy*dy, which is what `(diff ** 2).sum(-1)` computed over the last axis.
        np.subtract(block[:, 0:1], control_x, out=squared)
        np.multiply(squared, squared, out=squared)
        np.subtract(block[:, 1:2], control_y, out=spare)
        np.multiply(spare, spare, out=spare)
        np.add(squared, spare, out=squared)
        # basis = .5 * squared * log(max(squared, 1e-12)); scaling by .5 is exact, so folding it in
        # last multiplies the same two rounded factors the original did.
        np.maximum(squared, 1e-12, out=spare)
        np.log(spare, out=spare)
        np.multiply(squared, spare, out=squared)
        np.multiply(squared, .5, out=squared)
    return basis @ weights[:count] + np.hstack((np.ones((len(query), 1)), query)) @ weights[count:]


def _tps_grid(shape, source, target, step=8):
    """Bend the photo with one globally smooth map instead of many independent triangles.

    Piecewise affine is only C0: neighbouring triangles agree on their shared edge but not on the
    gradient across it, which is what leaves faceted ridges on a clean photo. A thin plate spline
    has no such seams anywhere, so the fix is structural rather than cosmetic.

    The spline is fitted from *target* to *source*, which is the direction ``cv2.remap`` wants: for
    each destination pixel it asks where to sample the original. Evaluating it on a coarse grid and
    resizing keeps the cost low, and the field is smooth enough that the upsample costs nothing
    visible.
    """
    height, width = shape[:2]
    scale = float(max(height, width))
    control = (target / scale).astype(np.float64)
    values = (source / scale).astype(np.float64)

    weights = _tps_solve(control, values)
    # cv2.resize aligns pixel centres, so sample i of a `count`-wide grid upsamples to
    # (i + .5) * width / count - .5. Sampling 0..width+step and then resizing as if the grid had
    # spanned the pixel range slid the whole map outward: measured on 1.png at 1100 px and step 8,
    # an identity morph moved every pixel 5.2 px on average and 12.3 px at the frame edge, while
    # the motion a slider asks for is around 10 px. The photo was visibly resampled while the
    # feature named barely moved. On pixel centres the same identity map lands within 0.4 px.
    columns = max(2, -(-width // step))
    rows = max(2, -(-height // step))
    xs = (np.arange(columns, dtype=np.float64) + .5) * width / columns - .5
    ys = (np.arange(rows, dtype=np.float64) + .5) * height / rows - .5
    grid = np.stack(np.meshgrid(xs, ys), axis=-1).reshape(-1, 2) / scale
    return (_tps_apply(weights, control, grid) * scale).reshape(len(ys), len(xs), 2)


def _grid_to_maps(sampled, shape):
    height, width = shape[:2]
    return (cv2.resize(sampled[:, :, 0].astype(np.float32), (width, height),
                       interpolation=cv2.INTER_CUBIC),
            cv2.resize(sampled[:, :, 1].astype(np.float32), (width, height),
                       interpolation=cv2.INTER_CUBIC))


def map_squeeze(sampled, shape):
    """Worst local area change the sampling grid asks for, as a fraction of the original area.

    The determinant of the map's Jacobian is how much area a pixel neighbourhood keeps. Below zero
    the map has folded over itself and two different places in the photo land on the same pixel,
    which is what turns skin into smeared plastic. Measured on the test photo, the extreme setting
    (300 with amplify 2x) drove this down to 0.02: not yet folded, but 2% of the original area is
    a hundredfold stretch of whatever texture was there. `simulate` uses it to hold the morph back.

    The spacing comes from the grid's own shape rather than the caller's `step`, because
    `_tps_grid` lays its samples on pixel centres, where the true spacing is width/columns. Reading
    `step` measured a grid the remap never applied, so the number deciding whether to hold the
    morph back described a slightly different map than the one the photo was warped by.
    """
    height, width = shape[:2]
    rows, columns = sampled.shape[:2]
    dx = width / max(columns, 1)
    dy = height / max(rows, 1)
    ax = np.gradient(sampled[:, :, 0], dx, axis=1)
    ay = np.gradient(sampled[:, :, 0], dy, axis=0)
    bx = np.gradient(sampled[:, :, 1], dx, axis=1)
    by = np.gradient(sampled[:, :, 1], dy, axis=0)
    return float((ax * by - ay * bx).min())


def _odd(value):
    """Nearest odd integer >= 1, which is what OpenCV kernel sizes have to be."""
    return max(1, int(round(value)) | 1)


def face_region(shape, points, morphed, grow=MASK_RING, feather=.05):
    """Where the warp is allowed to show, as a soft mask over the frame.

    The spline is fitted with anchors out at the frame border, so left alone it drags the whole
    picture rather than the face: on a full-strength morph of the test photo, 59% of the changed
    pixels landed outside the face outline and the furthest sat 342 px out, which is how a straight
    line on the wall behind the head ends up curved. That bend is the first thing a viewer notices,
    well before any skin artifact. Compositing through this mask leaves the room, the collar and
    the far side of the hair bit-for-bit original.

    Both outlines are needed. The morphed one alone leaves the strip the jaw vacated still showing
    the original jaw as a ghost edge; the original one alone clips a chin pushed further out than
    it started. `grow` and `feather` are fractions of face width so the mask scales with the crop.
    """
    span = max(face_width(points), 1.)
    mask = np.zeros(shape[:2], dtype=np.uint8)
    for cloud in (points, morphed):
        cv2.fillConvexPoly(mask, cv2.convexHull(cloud[:, :2].astype(np.int32)), 255)
    size = _odd(grow * span)
    grown = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)))
    return cv2.GaussianBlur(grown.astype(np.float32) / 255., (0, 0), max(feather * span / 3., 1.))


def confine(original, warped, mask):
    """Blend the warped photo back over the original through `mask`.

    Where the mask is zero the result is the original byte for byte, not a re-encode of it, so
    everything outside the face is provably untouched rather than merely close.
    """
    if mask.max() <= 0:
        return original.copy()
    weight = mask[:, :, None]
    blended = original.astype(np.float32) * (1 - weight) + warped.astype(np.float32) * weight
    return np.clip(blended, 0, 255).astype(np.uint8)


FOLD_ATTEMPTS = 3


def simulate(image, points, sliders, refine=True, engine="tps", step=8, morphed=None,
             amplify=1., confine_to_face=True):
    """Full morph.

    Returns (after_photo, morphed_landmarks, triangles, guard). `guard` is the factor the morph had
    to be scaled by to keep the map from folding: 1.0 when nothing was held back, and the caller is
    expected to tell the user when it is not, because the picture then shows less than the settings
    asked for. `engine` picks the smooth thin plate spline or the piecewise affine mesh. Pass
    `morphed` when the moved landmarks were already worked out elsewhere, as multi-view projection
    does.
    """
    anchors = border_anchors(image.shape, points)
    source = np.vstack((points[:, :2], anchors))
    triangles = delaunay(source, image.shape)

    if morphed is None:
        morphed = morph_landmarks(points, sliders, amplify)
    target = np.vstack((morphed[:, :2], anchors))
    if not np.any(morphed[:, :2] != points[:, :2]):
        # nothing moved, and returning the photo itself keeps it exact rather than near-exact
        return image.copy(), morphed, triangles, 1.

    guard = 1.
    if engine == "tps":
        # Hold the whole morph back rather than clamp the worst landmark. A per-point clamp changes
        # the shape of the change -- it flattens the peak and leaves its neighbours where they
        # were, which is a different face, not a milder one. Scaling every displacement by the same
        # factor keeps the direction of every rule intact.
        #
        # The correction iterates. One step assuming the squeeze responds linearly in the scale is
        # right for the settings a slider can ask for, but it undershoots badly once the map is
        # already folded, and the old ceiling of 1.0 let a pass make no progress at all and render
        # the folded map anyway. Each pass re-measures, the factor is capped below 1 so every pass
        # moves, and each pass scales the *original* request so `guard` stays one honest factor.
        # The squeeze is not monotonic in the scale -- halving a folded map can fold it somewhere
        # else -- so the best attempt is kept rather than assumed to be the last one.
        origin = points.astype(np.float64)
        requested = morphed.astype(np.float64)
        sampled = _tps_grid(image.shape, source, target, step)
        best = None
        for _ in range(FOLD_ATTEMPTS):
            squeeze = map_squeeze(sampled, image.shape)
            if squeeze >= FOLD_FLOOR:
                best = None
                break
            if best is None or squeeze > best[0]:
                best = (squeeze, guard, sampled)
            guard *= float(np.clip((1 - FOLD_FLOOR) / max(1 - squeeze, 1e-6), .05, .9))
            morphed = (origin + (requested - origin) * guard).astype(requested.dtype)
            target = np.vstack((morphed[:, :2], anchors))
            sampled = _tps_grid(image.shape, source, target, step)
        else:
            if best is not None and map_squeeze(sampled, image.shape) < best[0]:
                _squeeze, guard, sampled = best
                morphed = (origin + (requested - origin) * guard).astype(requested.dtype)
                target = np.vstack((morphed[:, :2], anchors))
        after = cv2.remap(image, *_grid_to_maps(sampled, image.shape), cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REFLECT_101)
    else:
        after = warp_photo(image, source, target, triangles)
    if confine_to_face:
        after = confine(image, after, face_region(image.shape, points, morphed))
    if refine and engine != "tps":
        # Only the mesh path needs the field, and only to hide its triangle seams. Building it is a
        # full-frame piecewise-affine render, so the spline path -- the default, redrawn on every
        # slider drag -- no longer pays for a map nothing reads.
        after = refine_locally(after, deformation_map(image.shape, source, target, triangles))
    return after, morphed, triangles, guard


MODEL_VERSION = "canonical-3d-fusion-lab-v1"


def normalise_sliders(sliders):
    """Validate an API slider mapping against the closed catalog."""
    if not isinstance(sliders, dict):
        raise ValueError("sliders_must_be_an_object")
    normalised = {}
    for key, raw_value in sliders.items():
        if key not in CONTROLS:
            raise ValueError(f"unknown_slider:{key}")
        try:
            value = float(raw_value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid_slider:{key}") from exc
        if not np.isfinite(value):
            raise ValueError(f"invalid_slider:{key}")
        floor = -evidence.SETTING_MAX if evidence.bidirectional(key) else 0.
        normalised[key] = float(np.clip(value, floor, evidence.SETTING_MAX))
    return normalised


def _focus_box(points, indices, shape):
    height, width = shape[:2]
    selected = np.asarray(points)[np.asarray(indices), :2]
    x, y, box_width, box_height = cv2.boundingRect(selected.astype(np.float32))
    margin = max(box_width, box_height) * .35
    return {
        "x0": round(max(0., x - margin) / width, 5),
        "y0": round(max(0., y - margin) / height, 5),
        "x1": round(min(float(width), x + box_width + margin) / width, 5),
        "y1": round(min(float(height), y + box_height + margin) / height, 5),
    }


# The span each measurement is read across, and what it is divided by. A module constant now: the
# table used to be rebuilt per call with all three denominators measured up front, so asking for
# one ratio measured three spans and allocated a twelve-entry dict to throw eleven of them away.
_MEASUREMENT_SPANS = {
    "eye_aspect_ratio": (159, 145, "eye_width"),
    "outer_corner_position": (33, 263, "height"), "alar_width_ratio": (98, 327, "width"),
    "nose_projection_ratio": (168, 1, "height"), "lip_height_ratio": (0, 17, "height"),
    "mouth_width_ratio": (61, 291, "width"), "zygomatic_width_ratio": (116, 345, "width"),
    "cheek_position": (116, 345, "height"), "jaw_width_ratio": (172, 397, "width"),
    "jaw_angle_position": (172, 397, "height"), "chin_height_ratio": (17, 152, "height"),
    "chin_projection_ratio": (1, 152, "height"),
}
_DENOMINATOR_SPANS = {"width": (234, 454), "height": (10, 152), "eye_width": (33, 133)}


def _measurement_ratio(points, key):
    first, second, denominator_key = _MEASUREMENT_SPANS[key]
    low, high = _DENOMINATOR_SPANS[denominator_key]
    denominator = np.linalg.norm(points[low, :2] - points[high, :2])
    if denominator <= 0:
        raise ValueError("invalid_face_dimensions")
    return float(np.linalg.norm(points[first, :2] - points[second, :2]) / denominator)


def _refine_views(image, points, specs, levels, view, amplify):
    """Stage 2: every region OpenCV drew is handed to the hosted inpaint before the view is done.

    Eligibility is "did stage 1 paint here", not a hand-maintained list of procedures. Anything
    with a SHADE/FLATTEN/TONE/INPAINT step synthesised its pixels and reads as a painted patch
    against real skin, so all of it is refined; a pure warp resampled a real photograph and is
    excluded, because there is nothing invented for a generative pass to re-render.

    The calls are grouped by kind rather than issued per procedure, which is both cheaper and
    better-looking. Erase and fill run first and against their own masks, because those two change
    what is there. The polish then runs *once*, over the union of every region touched -- including
    what erase and fill just wrote. Erase and fill outputs can come back at a slightly different
    pore scale from the source even when the content is right, and one shared final pass is what
    makes a stack of procedures read as a single photograph instead of a collage. It also means a
    six-procedure stack costs one polish call, where the old per-procedure loop cost six.

    Every failure mode here ends in the deterministic image being returned unchanged. That is the
    whole reason the local renderer stays complete: a preview that already looked right must not
    start failing because a paid key expired, a provider rate-limited, or a model reframed a crop.
    The call is skipped entirely when no key is configured, so a local checkout never reaches for
    the network at all.
    """
    from . import flux_refine

    if not flux_refine.available():
        return image

    # Erase and fill are keyed by prompt: two rows building the same thing share one call, two
    # building different things must not, or one prompt repaints the other's mask.
    grouped: dict[str, dict[str, np.ndarray]] = {"erase": {}, "fill": {}}
    polish_mask = np.zeros(image.shape[:2], np.uint8)
    # Which prompt the single polish call should use. One distinct key across the whole stack means
    # it is really one feature and its own wording is better than the generic one; a mix has no
    # single subject to name, so the preserving default is the only honest prompt for the union.
    polish_keys: set[str] = set()

    for spec, level in zip(specs, levels):
        plan = refine_plan(spec)
        if plan is None:
            continue
        steps = surface_steps([spec], view, [level])
        if not steps:
            continue
        mask = steps_mask(image.shape, points, steps)
        if not mask.any():
            continue
        kind, prompt_key = plan
        # Every kind contributes its subject, erase and fill included: the polish that follows has
        # to re-render what they wrote, and "restore healed skin" over a hairline the fill just
        # built would ask the model to take it back out again.
        polish_keys.add(prompt_key)
        if kind == "polish":
            np.maximum(polish_mask, mask, out=polish_mask)
        else:
            bucket = grouped[kind]
            existing = bucket.get(prompt_key)
            bucket[prompt_key] = mask if existing is None else np.maximum(existing, mask)

    result = image

    def _call(mask, kind, prompt_key):
        nonlocal result
        try:
            result = flux_refine.refine(result, mask, kind, prompt_key)
        except Exception:
            # Logged rather than raised: the caller already holds a finished picture.
            logger.warning("flux %s skipped for %s on %s", kind, prompt_key, view, exc_info=True)

    # Erase before fill before polish: the first two change what is in the frame, and the polish
    # has to see their output rather than the pixels they replaced.
    for kind in ("erase", "fill"):
        for prompt_key, mask in grouped[kind].items():
            _call(mask, kind, prompt_key)
            np.maximum(polish_mask, mask, out=polish_mask)

    if polish_mask.any():
        prompt_key = next(iter(polish_keys)) if len(polish_keys) == 1 else "surface_polish"
        _call(polish_mask, "polish", prompt_key)
    return result


def _download_views(download_fn, object_names):
    """Every named object fetched at once, returned in the order asked for.

    Order is what keeps the failure the same: a loop raised on the first object it could not read,
    and so does this, whichever of them actually failed first in wall-clock terms.
    """
    if len(object_names) < 2:
        return [download_fn(name) for name in object_names]
    with ThreadPoolExecutor(max_workers=len(object_names)) as pool:
        futures = [pool.submit(download_fn, name) for name in object_names]
    return [future.result() for future in futures]


#: Per-channel difference below which two photographs read as the same image. Three levels out
#: of 255 is under the noise of the JPEG the camera produced, so counting anything smaller would
#: report sensor grain as a treatment result.
VISIBLE_DELTA = 3

#: Fraction of the frame under which a render, however correct, reads as "nothing happened".
#: A judgement call, not a measured threshold: it was set from a sweep of all 72 supported
#: procedures on a real scan, where the rows a person could not tell apart from the original all
#: fell below half a percent and the ones they could all sat above one and a half.
FAINT_FRACTION = .005


def _region_indices(region):
    """The landmarks a focus box is drawn around, from whichever table names this region.

    Two vocabularies meet here. The legacy catalog works in six coarse regions; the surface
    pipeline and every catalog procedure work in twenty-two finer ones -- `nose_alar`, not
    `nose`. Both are answered from one lookup so the viewer does not have to know which
    catalog produced the render it is pointing at.
    """
    if region in REGION_LANDMARKS:
        return REGION_LANDMARKS[region]
    return tuple(index for island in REGION_GROUPS.get(region, ()) for index in island)


def simulate_scan_views(scan, sliders, download_fn, *, selections=None, presets=None,
                        reference_target=None, amplify=1., engine="tps", max_side=1280,
                        output_format=".webp", step=8, refine=True):
    """Download, fuse and render every available scan view through one shared 3-D model.

    `reference_target` replaces `sliders`: the setting is solved for after the model is fused,
    because until the three photographs are fused there is nothing to measure a candidate on.
    """
    sliders = normalise_sliders(sliders)
    amplify = float(amplify)
    if not np.isfinite(amplify) or not 1. <= amplify <= evidence.AMPLIFY_MAX:
        raise ValueError("invalid_amplify")
    if engine not in ("tps", "affine"):
        raise ValueError("invalid_warp_engine")

    prepared = []
    required_views = ("front", "left_profile", "right_profile")
    missing = [name for name in required_views if not (scan.image_objects or {}).get(name)]
    if missing:
        raise ValueError("required_views_missing:" + ",".join(missing))
    # The three photographs are fetched together. Each is a network round trip that waits on
    # nothing, so downloading them one after another put two idle transfers in front of a preview
    # a person is sitting and watching. Decode and landmark detection stay in order below: the
    # detector is one shared instance and is not safe to call from several threads.
    raws = _download_views(download_fn, [scan.image_objects[name] for name in required_views])
    for name, raw in zip(required_views, raws):
        object_name = scan.image_objects[name]
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"image_decode_failed:{name}")
        height, width = image.shape[:2]
        scale = min(1., float(max_side) / max(height, width))
        if scale < 1.:
            image = cv2.resize(image, (round(width * scale), round(height * scale)),
                               interpolation=cv2.INTER_AREA)
        points, rotation = scan_face_pose(image)
        prepared.append({"name": name, "object_name": object_name, "image": image,
                         "points": points, "rotation": rotation})
    if not prepared:
        raise ValueError("scan_has_no_images")
    prepared.sort(key=lambda item: (item["name"] != "front", item["name"]))

    fused = fuse_views(prepared)
    reached = None
    if reference_target is not None:
        sliders, reached = solve_reference_sliders(fused, prepared, reference_target, amplify)
    _displacement, projected = morph_fused(fused, sliders, prepared, amplify)
    selections, presets = selections or [], presets or []
    atomic_specs = [preset for preset in presets if isinstance(preset, ProcedureSpec)]
    surface_specs = [
        preset for preset in atomic_specs
        if canonical_technique(TECHNIQUE_BY_REF[preset.source_ref]) in {"test", "Hybrid"}
    ]
    intensity_by_ref = {
        str(selection.get("procedure_id")): int(selection.get("intensity_level", 3))
        for selection in selections if selection.get("procedure_id")
    }
    surface_levels = [
        intensity_by_ref.get(preset.source_ref, intensity_by_ref.get(preset.id, 3))
        for preset in surface_specs
    ]
    # A catalog selection names no region -- the procedure does, through its pipeline. Without
    # this the viewer had nothing to aim at for a catalog render and the zoom sat disabled on a
    # picture whose whole point is one small area.
    regions = ([selection["region"] for selection in selections if "region" in selection]
               or list(dict.fromkeys(step.region for spec in atomic_specs for step in spec.pipeline)))
    rendered_views = {}
    for view, morphed in zip(prepared, projected):
        after, moved, _triangles, guard = simulate(
            view["image"], view["points"], sliders, engine=engine, step=step,
            morphed=morphed, amplify=amplify,
        )
        # Worked out once. It is a pure function of the specs, the view name and the levels, and it
        # was being run a second time further down purely to name the regions it had just returned.
        steps = surface_steps(surface_specs, view["name"], surface_levels) if surface_specs else ()
        if surface_specs:
            after = apply_surface_pipeline(after, moved, steps, amplify=amplify)
            # Only on the way to storage. Dragging a slider re-renders on every change and a
            # hosted round trip is seconds, not the sub-150ms the deterministic pass costs, so the
            # preview stays local and the saved copy is the one that pays for texture.
            if refine:
                after = _refine_views(after, moved, surface_specs, surface_levels,
                                      view["name"], amplify)
        # How much of the frame moved, not merely whether any byte did. A procedure can be
        # applied exactly as the catalog describes it and still be invisible -- flattening a fold
        # on a face whose fold is already shallow is close to a no-op -- and from the user's side
        # that is indistinguishable from a broken render. The number is carried to the screen so
        # the picture can say which one it is, rather than the strengths being raised to make
        # every row look like it did something.
        difference = np.abs(after.astype(np.int16) - view["image"].astype(np.int16)).max(axis=2)
        changed = bool(difference.any())
        visible = float((difference > VISIBLE_DELTA).mean())
        ok_before, encoded_before = cv2.imencode(output_format, view["image"])
        ok_after, encoded_after = cv2.imencode(output_format, after)
        if not ok_before or not ok_after:
            raise ValueError(f"image_encode_failed:{view['name']}")
        shift = np.linalg.norm(moved[:, :2] - view["points"][:, :2], axis=1)
        rendered_views[view["name"]] = {
            "source_object": view["object_name"],
            "before_encoded": encoded_before.tobytes(),
            "encoded": encoded_after.tobytes(),
            "depth_used": bool(view.get("depth_used", False)),
            "yaw": round(float(yaw_degrees(view["rotation"])), 2),
            "max_shift_px": round(float(shift.max()), 2),
            "held_back": round(1. - guard, 3) if guard < 1. else 0.,
            # Whether anything moved *in this view*. A change confined to one part of the face
            # is invisible from an angle that cannot see it -- tattoo removal on a cheek does
            # nothing to the opposite profile -- and that is a correct render, not a failure.
            "changed": changed,
            # And how much, as a percentage of the frame. Rounded to three places because the
            # interesting range is a fraction of one percent.
            "visible_percent": round(visible * 100, 3),
            "focus_boxes": {
                region: _focus_box(view["points"], indices, view["image"].shape)
                for region, indices in ((name, _region_indices(name)) for name in regions)
                if indices
            },
            "applied_regions": (
                sorted({step.region for step in steps}) if surface_specs else regions
            ),
        }
        view["moved"] = moved

    # Checked across the whole set rather than per view. Raising on the first view that did not
    # move threw away two correct renders whenever a procedure only shows from one angle, which
    # failed the entire simulation for a change the user could see perfectly well on the front.
    # Nothing moving anywhere is still a failure: it means the request rendered a photograph.
    if (sliders or surface_specs) and not any(v["changed"] for v in rendered_views.values()):
        raise ValueError("simulation_no_visible_change")

    wanted_source = (
        "front" if atomic_specs else presets[0]["source_view"]
    ) if presets else "front"
    if wanted_source == "profile":
        legacy_view = next((name for name in ("left_profile", "right_profile")
                            if name in rendered_views), prepared[0]["name"])
    else:
        legacy_view = "front" if "front" in rendered_views else prepared[0]["name"]
    measurement_view = next(view for view in prepared if view["name"] == legacy_view)
    measurements = []
    for selection, preset in zip(selections, presets):
        if isinstance(preset, ProcedureSpec):
            continue
        before = _measurement_ratio(measurement_view["points"], preset["measurement_key"])
        after = _measurement_ratio(measurement_view["moved"], preset["measurement_key"])
        change = ((after / before) - 1.) * 100 if before else 0.
        measurements.append({
            "key": preset["measurement_key"], "region": preset["region"],
            "preset_id": preset["id"], "source_view": preset["source_view"],
            "intensity_level": selection["intensity_level"],
            "before_ratio": round(before, 5), "target_ratio": round(after, 5),
            "change_percent": round(change, 2), "unit": "ratio",
            "capped": rendered_views[legacy_view]["held_back"] > 0,
            "deformation": {
                "slider": preset["slider"],
                "setting": sliders[preset["slider"]],
                "max_shift_px": rendered_views[legacy_view]["max_shift_px"],
            },
        })
    if not measurements:
        for key, value in sliders.items():
            if not value:
                continue
            try:
                measurements.append(evidence.record(key, value, amplify))
            except KeyError:
                # A direction no procedure in the evidence table performs -- `side()` returns
                # nothing for it on purpose, so that a negative setting on a control with no
                # reverse is not silently reported as a milder version of the upward treatment.
                # The movement is still rendered; it just gets no line in the record, because a
                # fabricated dose would be worse than a missing one. Logged, not swallowed: this
                # is a gap between the catalog and the evidence table, and it should be closed.
                logger.warning("no evidence for %s at %s; measurement line omitted", key, value)
    return {
        "views": rendered_views,
        "legacy_view": legacy_view,
        "measurements": measurements,
        "related_procedures": (
            [preset.name_th for preset in atomic_specs]
            if atomic_specs else related_union(presets)
        ),
        "model_version": MODEL_VERSION,
        # The ratio the solve actually landed on, which is not always the one asked for: a face
        # far enough from the mean can want more than the strongest setting delivers. None when
        # no target was given.
        "reached_ratio": reached,
        "sliders": sliders,
        "amplify": amplify,
        "engine": engine,
    }
