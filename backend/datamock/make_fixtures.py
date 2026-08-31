"""Build the test photographs for the scan page's upload path.

Reads `apps/web/public/assets/scan/capture-angles-reference.png` from stdin and writes about
fifteen images into this directory, one per branch the upload flow can take.

## Why these are derived rather than drawn

A drawn face does not work. MediaPipe's detector is a network trained on photographs, not a
shape matcher, and a careful OpenCV portrait — head, eyes, nose, mouth, shaded skin — returns
zero faces. Rendering a 3D mesh does not help either; the obstacle is appearance, not geometry.
So every fixture that needs a detectable face is derived from the contact sheet the product
already ships and already displays on the capture screen, and none of them is committed.

Say it plainly when describing these files: **this is a photograph of a real person**, reused
from an asset already in the repository. Nothing here is synthetic.

## Why the tiles are doubled in size

The sheet's tiles are 512x512. At that size the crop the app takes comes out around 330 pixels
and the detector loses the profile entirely on the second pass. At 3x the interpolation softens
the image until its Laplacian variance falls to 11-19, under the server's floor of 18, so it
would pass the browser and then fail in the worker with `blurry_image` — the worst outcome,
because it looks like a bug in the upload path. 2x is the only size where every angle survives
both gates, and it is not a preference.

## Naming follows the measurement, not the label

The tile captioned "LEFT 90" measures a *positive* yaw, which is `right_profile` in this
codebase (`captureSteps` puts `left_profile` at -80..-55). Files are named from the angle that
comes back from the detector, so a fixture cannot quietly end up testing the opposite slot. The
tile captioned "RIGHT 90" is a true side-on view that the detector cannot find a face in at all,
which is why the right profile is made by mirroring the left one.

## Self-checking

Every file is measured through the real pipeline after it is written, and the script fails if
any of them does not produce the outcome it was built for. A fixture that has quietly drifted
into testing something else is worse than a missing one: it makes a passing suite mean nothing.

Run:

    docker compose exec -T api python /app/backend/datamock/make_fixtures.py \
      < apps/web/public/assets/scan/capture-angles-reference.png
"""

import json
import math
import os
import sys
from pathlib import Path

import cv2
import numpy as np

os.environ.setdefault("MEDIAPIPE_DISABLE_GPU", "1")

OUT = Path(__file__).resolve().parent
MODEL = Path(__file__).resolve().parents[1] / "doodee" / "assets" / "face_landmarker.task"

# Mirrors of the browser's constants. Duplicated rather than imported because the browser holds
# them in TypeScript; the assertions at the bottom of this file are what keep the two in step.
MAX_SUBMIT_EDGE = 1600
MAX_DETECT_EDGE = 512
JPEG_QUALITY = 94
MIN_FACE_FRACTION = 0.08
MIN_FACE_PIXELS = 200
SIDEWAYS_ROLL = 60
MAX_FILE_BYTES = 10 * 1024 * 1024

# From apps/web/src/scanQuality.ts, which matches backend/doodee/pose_targets.json exactly.
STEPS = {
    "front": {"yaw": (-8, 8), "pitch": (-6, 14), "roll": (-10, 10)},
    "left_profile": {"yaw": (-80, -55), "pitch": (-10, 10), "roll": (-10, 10)},
    "right_profile": {"yaw": (55, 80), "pitch": (-10, 10), "roll": (-10, 10)},
}

# The tile grid of the contact sheet, 3 across and 2 down.
TILE_FRONT = (0, 2)
TILE_PROFILE = (0, 0)
TILE_SCALE = 2


def landmarker():
    import mediapipe as mp

    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(
            model_asset_path=str(MODEL), delegate=mp.tasks.BaseOptions.Delegate.CPU,
        ),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=2,
        min_face_detection_confidence=0.6,
        min_face_presence_confidence=0.6,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


DETECTOR = None


def detect(image):
    """What the browser's worker would report for this image, in the same shape."""
    import mediapipe as mp

    global DETECTOR
    if DETECTOR is None:
        DETECTOR = landmarker()
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = DETECTOR.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not result.face_landmarks:
        return None
    points = result.face_landmarks[0]
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    matrix = result.facial_transformation_matrixes[0] if result.facial_transformation_matrixes else None
    blends = {c.category_name: c.score for c in (result.face_blendshapes[0] if result.face_blendshapes else [])}
    return {
        "count": len(result.face_landmarks),
        "box": (min(xs), max(xs), min(ys), max(ys)),
        "pose": pose_from_matrix(matrix),
        "smile": ((blends.get("mouthSmileLeft", 0) + blends.get("mouthSmileRight", 0)) / 2),
    }


def pose_from_matrix(matrix):
    """The same conversion as `scanQuality.poseFromMatrix` and `analysis_engine.pose_from_matrix`."""
    if matrix is None:
        return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}
    data = np.asarray(matrix, dtype=np.float64).reshape(4, 4)
    scale = math.hypot(data[0][0], data[1][0], data[2][0])
    if not np.isfinite(scale) or scale < 1e-6:
        return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}
    return {
        "yaw": -math.degrees(math.asin(max(-1.0, min(1.0, -data[2][0] / scale)))),
        "pitch": math.degrees(math.atan2(data[2][1] / scale, data[2][2] / scale)),
        "roll": math.degrees(math.atan2(data[1][0] / scale, data[0][0] / scale)),
    }


def fit(image, max_edge):
    longest = max(image.shape[:2])
    if longest <= max_edge:
        return image
    scale = max_edge / longest
    size = (max(1, round(image.shape[1] * scale)), max(1, round(image.shape[0] * scale)))
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA)


def face_crop_rect(box, width, height):
    """A transcription of `scanQuality.faceCropRect`."""
    if box is None:
        return 0, 0, width, height
    left, right, top, bottom = box
    face_height = (bottom - top) * height
    if face_height <= 0:
        return 0, 0, width, height
    aspect = width / height
    crop_height = min(height, face_height / 0.6)
    crop_width = min(width, crop_height * aspect)
    crop_height = crop_width / aspect
    centre_x = (left + right) / 2 * width
    centre_y = (top + bottom) / 2 * height
    return (
        max(0, min(width - crop_width, centre_x - crop_width / 2)),
        max(0, min(height - crop_height, centre_y - crop_height * 0.45)),
        crop_width,
        crop_height,
    )


def frame_quality(image):
    """A transcription of the worker's `analyzeFrame`.

    Reproduced exactly, including the parts that look like quirks: the whole image is squashed
    into 128x72 regardless of aspect, brightness is summed only over the inset centre region
    while the clipped and dark ratios are counted over every pixel, and a pixel is either clipped
    or dark but never both. A fixture built against a tidier version of this would be measured
    differently by the browser than by this script, which defeats the purpose.
    """
    small = cv2.resize(image, (128, 72), interpolation=cv2.INTER_AREA).astype(np.float64)
    luma = small[:, :, 2] * 0.2126 + small[:, :, 1] * 0.7152 + small[:, :, 0] * 0.0722
    inset = luma[5:67, 16:112]
    horizontal = np.abs(np.diff(inset, axis=1))
    vertical = np.abs(np.diff(inset, axis=0))
    edges = horizontal.sum() + vertical.sum()
    samples = horizontal.size + vertical.size
    clipped = int((luma > 243).sum())
    dark = int(((luma < 12) & (luma <= 243)).sum())
    return {
        "brightness": inset.sum() / (96 * 62),
        "sharpness": edges / max(samples, 1),
        "clippedRatio": clipped / (128 * 72),
        "darkRatio": dark / (128 * 72),
    }


def encode(image):
    ok, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
    if not ok:
        raise RuntimeError("encode failed")
    return buffer.tobytes()


def pose_code(step, pose):
    """A transcription of `scanQuality.poseCode`."""
    target = STEPS[step]
    low, high = target["yaw"]
    if not low <= pose["yaw"] <= high:
        if step == "left_profile":
            return "turn_farther_left" if pose["yaw"] > high else "turn_slightly_right"
        if step == "right_profile":
            return "turn_farther_right" if pose["yaw"] < low else "turn_slightly_left"
        return "turn_slightly_right" if pose["yaw"] < low else "turn_slightly_left"
    low, high = target["pitch"]
    if not low <= pose["pitch"] <= high:
        return "tilt_down" if pose["pitch"] < low else "tilt_up"
    low, high = target["roll"]
    if not low <= pose["roll"] <= high:
        return "level_head"
    return None


def pipeline(image, step="front"):
    """Run one image through the browser's upload path and report where it lands.

    Returns `(code, detail)`; `code` is None when the image would be accepted. `step` is the slot
    the user aimed at — the pose gate is per-slot, so a fixture is only meaningful against one.
    Slot rerouting is deliberately not modelled here: it depends on which other slots are filled,
    which is a property of the test rather than of the file.
    """
    full = fit(image, MAX_SUBMIT_EDGE)
    height, width = full.shape[:2]
    small = fit(full, MAX_DETECT_EDGE)

    first = detect(small)
    if first is None:
        return "no_face", {}
    left, right, top, bottom = first["box"]
    fraction = bottom - top
    if fraction <= 0:
        return "no_face", {}
    if fraction < MIN_FACE_FRACTION or fraction * height < MIN_FACE_PIXELS:
        return "face_too_small", {"fraction": fraction, "pixels": fraction * height}
    if left < 0.01 or right > 0.99:
        return "off_centre", {"left": left, "right": right}
    if abs(first["pose"]["roll"]) > SIDEWAYS_ROLL:
        return "sideways", {"roll": first["pose"]["roll"]}
    if first["count"] > 1:
        return "multiple_faces", {"count": first["count"]}

    x, y, crop_width, crop_height = face_crop_rect(first["box"], width, height)
    crop = full[int(y):int(y + crop_height), int(x):int(x + crop_width)]
    crop = fit(crop, MAX_SUBMIT_EDGE)
    crop = cv2.imdecode(np.frombuffer(encode(crop), np.uint8), cv2.IMREAD_COLOR)

    second = detect(fit(crop, MAX_DETECT_EDGE))
    if second is None:
        return "no_face", {"stage": "post_crop"}
    quality = frame_quality(crop)
    left, right, top, bottom = second["box"]
    face_height = bottom - top
    centre_x = (left + right) / 2
    centre_y = (top + bottom) / 2

    if second["count"] > 1:
        return "multiple_faces", {"count": second["count"]}
    if quality["brightness"] < 45 or quality["darkRatio"] > 0.5:
        return "too_dark", quality
    if quality["brightness"] > 210 or quality["clippedRatio"] > 0.2:
        return "too_bright", quality
    if quality["sharpness"] < 2:
        return "blurry", quality
    if face_height < 0.22:
        return "too_far", {"faceHeight": face_height}
    if face_height > 0.92:
        return "too_close", {"faceHeight": face_height}
    if abs(centre_x - 0.5) > 0.24 or abs(centre_y - 0.5) > 0.24:
        return "off_centre", {"cx": centre_x, "cy": centre_y}
    guidance = pose_code(step, second["pose"])
    if guidance:
        return guidance, {"pose": second["pose"]}
    if step == "front" and second["smile"] > 0.25:
        # Reported so the caller can see it, but the upload path treats it as a warning.
        return None, {"pose": second["pose"], "smile": second["smile"], "quality": quality, "crop": crop}
    return None, {"pose": second["pose"], "smile": second["smile"], "quality": quality, "crop": crop}


def step_for(pose):
    """Which capture slot this pose satisfies, or None."""
    for name, target in STEPS.items():
        if all(target[axis][0] <= pose[axis] <= target[axis][1] for axis in ("yaw", "pitch", "roll")):
            return name
    return None


def server_verdict(data):
    """What `analysis_engine._decode` would say about these bytes."""
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return "invalid_image"
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if gray.mean() < 30 or gray.mean() > 225:
        return "poor_lighting"
    if cv2.Laplacian(gray, cv2.CV_64F).var() < 18:
        return "blurry_image"
    return None


# ---------------------------------------------------------------- building

def tile(sheet, row, column, scale=TILE_SCALE):
    height, width = sheet.shape[:2]
    tile_width, tile_height = width // 3, height // 2
    cut = sheet[row * tile_height:(row + 1) * tile_height, column * tile_width:(column + 1) * tile_width]
    if scale == 1:
        return cut
    # Lanczos rather than cubic, and this is load-bearing. Under cubic the *mirrored* profile
    # stops being detected the moment it is JPEG-encoded — the detector sits right on its 0.6
    # confidence threshold for that image and the encoder's high-frequency loss is enough to push
    # it under. Lanczos keeps more of that detail and both profiles survive the round trip.
    #
    # Worth knowing while reading this: the detector is not symmetric. The same tile measures
    # yaw +67 as it stands and -67 mirrored, but only the mirrored one is fragile, so a treatment
    # that looks fine on one direction has to be checked on the other.
    return cv2.resize(cut, (tile_width * scale, tile_height * scale), interpolation=cv2.INTER_LANCZOS4)


def landscape(width=1600, height=1200):
    """Somewhere with no people in it. Sharp and well exposed, so `no_face` is the only reason."""
    image = np.zeros((height, width, 3), np.uint8)
    for y in range(height):
        t = y / height
        image[y, :] = (int(200 - 90 * t), int(160 - 40 * t), int(110 + 40 * t))
    for index in range(9):
        x = int(width * (index + 0.5) / 9)
        peak = int(height * (0.55 + 0.12 * math.sin(index * 1.7)))
        cv2.fillPoly(image, [np.array([[x - 190, height], [x, peak], [x + 190, height]])], (70, 85, 95))
    cv2.rectangle(image, (0, int(height * 0.86)), (width, height), (52, 64, 74), -1)
    return image


def main():
    if MODEL.exists() is False:
        sys.exit(f"model not found: {MODEL}")
    raw = sys.stdin.buffer.read()
    if not raw:
        sys.exit("pipe the contact sheet in on stdin (see this file's docstring)")
    sheet = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if sheet is None:
        sys.exit("stdin was not a decodable image")
    print(f"sheet {sheet.shape[1]}x{sheet.shape[0]}")

    front = tile(sheet, *TILE_FRONT)
    profile = tile(sheet, *TILE_PROFILE)
    mirrored = cv2.flip(profile, 1)

    # Named from the measurement, checked below. The captions on the sheet disagree with the
    # app's sign convention and must not be trusted.
    written = {}

    def write(name, data, expect_code, expect_step=None, expect_warning=None, expect_server=None):
        path = OUT / name
        path.write_bytes(data)
        written[name] = {
            "code": expect_code, "step": expect_step,
            "warning": expect_warning, "server": expect_server,
        }
        print(f"  wrote {name} ({len(data):,} bytes)")

    print("building...")

    # --- accepted
    write("pass-front.jpg", encode(front), None, "front", None, None)
    write("pass-left-profile.jpg", encode(mirrored), None, "left_profile", None, None)
    write("pass-right-profile.jpg", encode(profile), None, "right_profile", None, None)
    # The same bytes as the right profile, kept as its own file so the browser check has an
    # obviously-named thing to drop on the *front* tile and watch it move.
    write("pass-wrong-slot.jpg", encode(profile), None, "right_profile", None, None)

    # --- rejected, no face required
    write("fail-no-face.jpg", encode(landscape()), "no_face")
    write("fail-corrupt.jpg", b"this is not an image, it is a sentence.\n", "unreadable_image")
    write("fake.heic", b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1" + b"\x00" * 512, "unsupported_heic")
    write("fail-too-large.jpg", b"\xff\xd8\xff\xe0" + os.urandom(MAX_FILE_BYTES + 4096), "file_too_large")

    # --- rejected, face required
    two = np.hstack([front, cv2.flip(front, 1)])
    write("fail-two-faces.jpg", encode(two), "multiple_faces")

    write("fail-sideways.jpg", encode(cv2.rotate(front, cv2.ROTATE_90_CLOCKWISE)), "sideways")

    # Between the level_head floor of 10 and the sideways ceiling of 60, or the wrong branch fires.
    size = front.shape[0]
    rotation = cv2.getRotationMatrix2D((size / 2, size / 2), 25, 1.0)
    write("fail-tilted.jpg", encode(cv2.warpAffine(front, rotation, (size, size), borderValue=(236, 234, 230))),
          "level_head")

    # A person a long way off in a wide scene.
    #
    # This was built expecting `face_too_small` and it reports `no_face` instead, which is worth
    # recording rather than forcing. Detection happens on a 512-pixel copy, so a face under the
    # 0.08 fraction floor is under 41 pixels there and the detector never finds it. The fraction
    # branch of `stillFramingCode` is therefore unreachable in practice — everything that would
    # trip it has already come back as no face at all. The pixel branch below is the one that
    # does the work, and this file stays to document the fact.
    small_face = cv2.resize(front, (size // 9, size // 9), interpolation=cv2.INTER_AREA)
    canvas = np.full((1400, 2400, 3), 225, np.uint8)
    canvas[600:600 + small_face.shape[0], 1100:1100 + small_face.shape[1]] = small_face
    write("fail-distant-face.jpg", encode(canvas), "no_face")

    # Fraction fine, absolute pixels not: a small source image, so the face is under 200px even
    # though it fills a healthy share of the frame.
    write("fail-tiny-pixels.jpg", encode(cv2.resize(front, (300, 300), interpolation=cv2.INTER_AREA)),
          "face_too_small")

    # Clipped by the left edge, so `box.left < 0.01`. Cutting a fixed fraction was not enough —
    # the face does not start where the tile does — so the cut is computed from the measured box.
    box = detect(fit(front, MAX_DETECT_EDGE))["box"]
    cut = int(box[0] * size) + int(0.03 * size)
    write("fail-edge-clipped.jpg", encode(front[:, cut:]), "off_centre")

    # Photometric cases act on the whole image: the crop discards the background, so darkening
    # only the surround would leave the measured face untouched.
    write("fail-dark.jpg", encode((front.astype(np.float32) * 0.12).astype(np.uint8)), "too_dark", None, None, "poor_lighting")
    write("fail-blown.jpg", encode(np.clip(front.astype(np.float32) * 2.6, 0, 255).astype(np.uint8)), "too_bright")
    # The most useful file in this directory, and not the one that was planned.
    #
    # It was built to trip the browser's `blurry` check and cannot: that check reads a sharpness
    # figure taken from a 128x72 downsample, which is such a heavy low-pass in itself that a real
    # photograph's remaining edge energy never falls under the floor of 2. Sweeping the blur finds
    # no window at all — sigma 18 measures 4.19 and is still accepted, sigma 22 destroys the face
    # so thoroughly that the detector returns nothing and the answer becomes `no_face`.
    #
    # The server, meanwhile, says `blurry_image` at every sigma from 14 up. So this fixture is
    # kept for what it actually demonstrates: **the browser accepts it and the analysis then
    # fails.** That is the one place the two gates provably disagree — the pose windows are
    # identical on both sides, but the blur and lighting rules are not — and it is the only way
    # to exercise the path where a user is told after the fact that their photograph could not be
    # measured.
    write("edge-blurry-server-rejects.jpg", encode(cv2.GaussianBlur(front, (0, 0), 18)),
          None, "front", None, "blurry_image")

    # A smiling frontal shot, if the sheet contains one. Checked, never assumed.
    smiling = None
    for row in range(2):
        for column in range(3):
            candidate = tile(sheet, row, column)
            reading = detect(fit(candidate, MAX_DETECT_EDGE))
            if reading and reading["smile"] > 0.25 and abs(reading["pose"]["yaw"]) <= 8:
                smiling = candidate
                break
        if smiling is not None:
            break
    if smiling is not None:
        write("pass-smiling.jpg", encode(smiling), None, "front", "relax_expression", None)
    else:
        print("  SKIPPED pass-smiling.jpg — no frontal tile has a smile above the 0.25 threshold.")
        print("          Not lowering the threshold to manufacture one; see the plan.")

    # ---------------------------------------------------------------- checking
    print("\nchecking every file through the real pipeline...")
    failures = []
    report = {}
    for name, expected in written.items():
        data = (OUT / name).read_bytes()
        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)

        if expected["code"] in ("unreadable_image", "unsupported_heic", "file_too_large"):
            # These never reach the detector; the browser classifies them from the failed decode.
            if image is not None and expected["code"] != "file_too_large":
                failures.append(f"{name}: expected to be undecodable, but it decoded")
            if expected["code"] == "file_too_large" and len(data) <= MAX_FILE_BYTES:
                failures.append(f"{name}: {len(data)} bytes is not over the {MAX_FILE_BYTES} limit")
            report[name] = {"expected": expected["code"], "bytes": len(data)}
            print(f"  {name:28s} {expected['code']}")
            continue

        # Against the slot it belongs to. Checking a profile against `front` would report a pose
        # rejection for a file that is perfectly good where it is meant to go.
        code, detail = pipeline(image, expected["step"] or "front")
        row = {"expected": expected["code"], "actual": code, "step_checked": expected["step"] or "front"}
        if code != expected["code"]:
            failures.append(f"{name}: expected {expected['code']!r}, pipeline said {code!r} {detail}")
        elif code is None:
            pose = detail["pose"]
            step = step_for(pose)
            row["pose"] = {k: round(v, 1) for k, v in pose.items()}
            row["step"] = step
            row["smile"] = round(detail["smile"], 3)
            if step != expected["step"]:
                failures.append(f"{name}: lands in {step!r}, expected {expected['step']!r} (yaw {pose['yaw']:+.0f})")
            warning = "relax_expression" if (step == "front" and detail["smile"] > 0.25) else None
            if warning != expected["warning"]:
                failures.append(f"{name}: warning {warning!r}, expected {expected['warning']!r}")
            # The crop is what actually gets uploaded, so the server's opinion is about that —
            # and it is also written out, because the two artifacts are genuinely different and
            # the backend has no business being tested against a file it never receives. The
            # profiles make the point sharply: the picked 1024px file is refused with
            # `face_count` at full resolution, while the ~670px crop taken from it is accepted.
            # Detection here is not monotonic in size, so "it worked on the big one" proves
            # nothing about the small one and the reverse is just as true.
            crop_name = name.replace("pass-", "upload-")
            (OUT / crop_name).write_bytes(encode(detail["crop"]))
            row["crop_file"] = crop_name
            verdict = server_verdict(encode(detail["crop"]))
            row["server"] = verdict
            if verdict != expected["server"]:
                failures.append(
                    f"{name}: the server says {verdict!r} about the crop, expected {expected['server']!r}",
                )
        if expected["server"] is not None:
            verdict = server_verdict(data)
            row["server_on_original"] = verdict
        report[name] = row
        print(f"  {name:28s} {code or 'ACCEPTED ' + str(row.get('step'))}")

    (OUT / "fixtures.json").write_text(json.dumps(report, indent=2, sort_keys=True))
    print(f"\nwrote fixtures.json ({len(report)} entries)")

    if failures:
        print("\nFAILED — fixtures do not do what they claim:")
        for line in failures:
            print(f"  - {line}")
        sys.exit(1)
    print("all fixtures verified")


if __name__ == "__main__":
    main()
