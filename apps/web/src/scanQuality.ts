export const CANDIDATE_TARGET = 5;

export const captureSteps = [
  { id: "front", label: "Front", short: "Face the camera", yaw: [-8, 8], pitch: [-6, 14], roll: [-10, 10], close: false },
  { id: "left_profile", label: "Left 90°", short: "Turn fully left", yaw: [-80, -55], pitch: [-10, 10], roll: [-10, 10], close: false },
  { id: "right_profile", label: "Right 90°", short: "Turn fully right", yaw: [55, 80], pitch: [-10, 10], roll: [-10, 10], close: false },
] as const;

export type LandmarkPoint = { x: number; y: number; z?: number };
export type FrameQuality = {
  brightness: number;
  sharpness: number;
  clippedRatio?: number;
  darkRatio?: number;
};
export type FacePose = { yaw: number; pitch: number; roll: number };
export type FaceObservation = FacePose & { faceCount: number; smile: number };
export type FaceBox = { left: number; right: number; top: number; bottom: number };
/**
 * Why a frame is not usable yet, or `"good"` when it is.
 *
 * A code rather than a sentence, for three reasons in ascending order of force. It has to be
 * said in Thai. This module is pure and framework-free and is imported by `node --test`, so it
 * must not reach for a locale dictionary. And — the one that settles it — the same condition
 * needs different words depending on where the image came from: "Hold still, the image is
 * blurry" is an instruction to someone in front of a camera, and it is nonsense said about a
 * file the user has just picked from a folder. One gate, two registers of copy, which is only
 * possible if the gate stops deciding the wording.
 *
 * The copy lives in `localization.ts` under `scan.quality.live` / `scan.quality.still`.
 */
export type QualityCode =
  | "good"
  | "no_face" | "multiple_faces"
  | "too_dark" | "too_bright" | "blurry"
  | "too_far" | "too_close" | "off_centre"
  | "turn_farther_left" | "turn_farther_right" | "turn_slightly_left" | "turn_slightly_right"
  | "tilt_up" | "tilt_down" | "level_head"
  | "relax_expression"
  // Live-capture progress states. Not failures of the frame — statements about where the capture
  // loop is — but they occupy the same line of the screen as the rejections above, so they share
  // the type. A screen slot that is sometimes a code and sometimes a loose sentence is worse than
  // either.
  | "starting" | "finding_face" | "checking_angle" | "hold_still" | "selecting_frame"
  | "position_for_step"
  // Reachable only from a picked file; the camera path cannot produce them.
  | "face_too_small" | "sideways" | "unsupported_heic" | "unreadable_image" | "file_too_large"
  // Light, checked only when capturing for skin. Every other mode measures shape, and shape is
  // indifferent to which side of the face the window is on — these would be noise there. See
  // `lib/skinCapture.ts` for why they are asked before the shutter rather than after the upload.
  | "uneven_lighting" | "colour_cast" | "blown_highlights";

/** Every member of `QualityCode`, so a test can assert the copy dictionaries cover them all. */
export const QUALITY_CODES = [
  "good",
  "no_face", "multiple_faces",
  "too_dark", "too_bright", "blurry",
  "too_far", "too_close", "off_centre",
  "turn_farther_left", "turn_farther_right", "turn_slightly_left", "turn_slightly_right",
  "tilt_up", "tilt_down", "level_head",
  "relax_expression",
  "starting", "finding_face", "checking_angle", "hold_still", "selecting_frame",
  "position_for_step",
  "face_too_small", "sideways", "unsupported_heic", "unreadable_image", "file_too_large",
  "uneven_lighting", "colour_cast", "blown_highlights",
] as const satisfies readonly QualityCode[];

export type Quality = { valid: boolean; code: QualityCode; score: number };
export type PoseSignature = { x: number; y: number; yaw: number; pitch: number; at: number };
export type AutoFrame = { centerX: number; centerY: number; zoom: number };
export type MatrixLike = { rows?: number; columns?: number; data?: ArrayLike<number> };

const within = (value: number, range: readonly [number, number]) => value >= range[0] && value <= range[1];
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const degrees = (radians: number) => radians * 180 / Math.PI;

export function poseFromMatrix(matrix?: MatrixLike): FacePose {
  const rows = matrix?.rows ?? 0;
  const columns = matrix?.columns ?? 0;
  const data = matrix?.data ?? [];
  if (rows < 3 || columns < 3 || data.length < rows * columns) return { yaw: 0, pitch: 0, roll: 0 };
  const at = (row: number, column: number) => Number(data[column * rows + row]);
  const scale = Math.hypot(at(0, 0), at(1, 0), at(2, 0));
  if (!Number.isFinite(scale) || scale < 1e-6) return { yaw: 0, pitch: 0, roll: 0 };
  return {
    yaw: -degrees(Math.asin(clamp(-at(2, 0) / scale))),
    pitch: degrees(Math.atan2(at(2, 1) / scale, at(2, 2) / scale)),
    roll: degrees(Math.atan2(at(1, 0) / scale, at(0, 0) / scale)),
  };
}

export function getFaceBox(landmarks: LandmarkPoint[]): FaceBox | null {
  if (landmarks.length < 455) return null;
  let left = 1;
  let right = 0;
  let top = 1;
  let bottom = 0;
  for (let index = 0; index < Math.min(478, landmarks.length); index += 1) {
    const point = landmarks[index];
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  return { left, right, top, bottom };
}

export function faceCropRect(faceBox: FaceBox | null, videoWidth: number, videoHeight: number) {
  if (!faceBox) return { x: 0, y: 0, width: videoWidth, height: videoHeight };
  const faceHeight = (faceBox.bottom - faceBox.top) * videoHeight;
  if (faceHeight <= 0) return { x: 0, y: 0, width: videoWidth, height: videoHeight };
  const aspect = videoWidth / videoHeight;
  let height = Math.min(videoHeight, faceHeight / 0.6);
  let width = Math.min(videoWidth, height * aspect);
  height = width / aspect;
  const centerX = (faceBox.left + faceBox.right) / 2 * videoWidth;
  const centerY = (faceBox.top + faceBox.bottom) / 2 * videoHeight;
  return {
    x: Math.max(0, Math.min(videoWidth - width, centerX - width / 2)),
    y: Math.max(0, Math.min(videoHeight - height, centerY - height * 0.45)),
    width,
    height,
  };
}

function fallbackYaw(landmarks: LandmarkPoint[]) {
  if (landmarks.length < 455) return 0;
  const faceLeft = landmarks[234];
  const faceRight = landmarks[454];
  const nose = landmarks[1];
  const normalized = (nose.x - (faceLeft.x + faceRight.x) / 2) / Math.max(Math.abs(faceRight.x - faceLeft.x), 0.001);
  return normalized * -380;
}

function poseCode(stepIndex: number, pose: FacePose): QualityCode | null {
  const step = captureSteps[stepIndex];
  if (!within(pose.yaw, step.yaw)) {
    if (step.id === "left_profile") return pose.yaw > step.yaw[1] ? "turn_farther_left" : "turn_slightly_right";
    if (step.id === "right_profile") return pose.yaw < step.yaw[0] ? "turn_farther_right" : "turn_slightly_left";
    return pose.yaw < step.yaw[0] ? "turn_slightly_right" : "turn_slightly_left";
  }
  if (!within(pose.pitch, step.pitch)) return pose.pitch < step.pitch[0] ? "tilt_down" : "tilt_up";
  if (!within(pose.roll, step.roll)) return "level_head";
  return null;
}

export function measurePose(
  landmarks: LandmarkPoint[],
  stepIndex: number,
  frameQuality?: FrameQuality,
  _framingZoom = 1,
  observation?: Partial<FaceObservation>,
): Quality {
  const reject = (code: QualityCode): Quality => ({ valid: false, code, score: 0 });
  const faceCount = observation?.faceCount ?? (landmarks.length >= 455 ? 1 : 0);
  if (faceCount === 0 || landmarks.length < 455) return reject("no_face");
  if (faceCount > 1) return reject("multiple_faces");
  const box = getFaceBox(landmarks);
  if (!box) return reject("no_face");
  const height = box.bottom - box.top;
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  if (frameQuality && (frameQuality.brightness < 45 || (frameQuality.darkRatio ?? 0) > 0.5))
    return reject("too_dark");
  if (frameQuality && (frameQuality.brightness > 210 || (frameQuality.clippedRatio ?? 0) > 0.2))
    return reject("too_bright");
  if (frameQuality && frameQuality.sharpness < 2) return reject("blurry");
  if (height < 0.22) return reject("too_far");
  if (height > 0.92) return reject("too_close");
  if (Math.abs(centerX - 0.5) > 0.24 || Math.abs(centerY - 0.5) > 0.24) return reject("off_centre");
  const pose = {
    yaw: observation?.yaw ?? fallbackYaw(landmarks),
    pitch: observation?.pitch ?? 0,
    roll: observation?.roll ?? 0,
  };
  const guidance = poseCode(stepIndex, pose);
  if (guidance) return reject(guidance);
  if (captureSteps[stepIndex].id === "front" && (observation?.smile ?? 0) > 0.25)
    return reject("relax_expression");
  return { valid: true, code: "good", score: 1 };
}


// The smallest face, in real pixels of the source photograph, worth measuring 468 landmarks on.
//
// Not about upscaling: `cropToJpeg` caps its scale factor at 1, so a crop is only ever shrunk.
// It is about how much detail exists to measure. Every metric in the catalogue is a ratio between
// landmark positions, so landmark quantisation error is a fixed number of pixels divided by a
// distance that shrinks with the face — and a face this far from the lens in a phone photograph is
// genuinely soft besides, from depth of field and from JPEG quantisation of low-contrast detail.
//
// A floor, not a target, and it has to stay under what live capture can produce or the upload path
// would refuse photographs the camera path would have accepted. The smallest frame the camera ever
// settles on is 960 tall (the low-frame-rate fallback in `startCamera`), and `measurePose` accepts
// a face at 0.22 of it — 211 pixels. Anything at or above that number is a floor that rejects real
// captures, which is why this sits below it rather than at a rounder-looking 240.
export const MIN_FACE_PIXELS = 200;
// Below this the face is a small object in a large scene rather than a portrait. Checked as well
// as the pixel floor because a 240px face inside an 8000px panorama is still not a photograph of
// a person, and cropping it would magnify sensor noise into what the engine reads as texture.
export const MIN_FACE_FRACTION = 0.08;

/**
 * Whether a picked photograph can be cropped into something worth measuring.
 *
 * Deliberately not part of `measurePose`, and deliberately answered *before* the crop: the full
 * gate has to run on the cropped image, because `measurePose` rejects `height < 0.22` and an
 * off-centre face, which describes almost every real photograph of a person standing a metre and
 * a half away. `faceCropRect` targets a face filling 0.6 of the frame, dead centre — so framing
 * passes by construction once the crop exists, and running the gate on the raw file instead would
 * reject good photographs with advice ("move closer") that cannot be acted on.
 *
 * What that leaves is the one thing cropping cannot fix, which is this function.
 */
export function stillFramingCode(box: FaceBox | null, imageHeight: number): QualityCode | null {
  if (!box) return "no_face";
  const fraction = box.bottom - box.top;
  if (fraction <= 0) return "no_face";
  if (fraction < MIN_FACE_FRACTION) return "face_too_small";
  if (fraction * imageHeight < MIN_FACE_PIXELS) return "face_too_small";
  // Width matters independently: a face can be tall enough and still be clipped by the frame edge,
  // which loses the very landmarks (234 / 454) that every width ratio is measured between.
  if (box.left < 0.01 || box.right > 0.99) return "off_centre";
  return null;
}

export function getAutoFrame(landmarks: LandmarkPoint[], close: boolean): AutoFrame {
  const box = getFaceBox(landmarks);
  if (!box) return { centerX: 0.5, centerY: 0.5, zoom: close ? 1.45 : 1.18 };
  const height = Math.max(box.bottom - box.top, 0.01);
  const targetHeight = close ? 0.82 : 0.6;
  return {
    centerX: (box.left + box.right) / 2,
    centerY: (box.top + box.bottom) / 2,
    zoom: Math.min(close ? 2.25 : 2.5, Math.max(1, targetHeight / height)),
  };
}

export function smoothAutoFrame(previous: AutoFrame, target: AutoFrame): AutoFrame {
  const smooth = (current: number, next: number, deadZone: number, amount: number) => {
    const delta = next - current;
    return Math.abs(delta) <= deadZone ? current : current + delta * (Math.abs(delta) > 0.08 ? 0.34 : amount);
  };
  return {
    centerX: smooth(previous.centerX, target.centerX, 0.0025, 0.18),
    centerY: smooth(previous.centerY, target.centerY, 0.0025, 0.18),
    zoom: smooth(previous.zoom, target.zoom, 0.01, 0.16),
  };
}

export function candidateScore(frameQuality?: FrameQuality) {
  if (!frameQuality) return 0;
  return frameQuality.sharpness * 5
    - Math.abs(frameQuality.brightness - 135) * 0.05
    - (frameQuality.clippedRatio ?? 0) * 40
    - (frameQuality.darkRatio ?? 0) * 30;
}

export function getPoseSignature(landmarks: LandmarkPoint[], at: number, pose?: FacePose): PoseSignature {
  const box = getFaceBox(landmarks);
  return {
    x: box ? (box.left + box.right) / 2 : 0.5,
    y: box ? (box.top + box.bottom) / 2 : 0.5,
    yaw: pose?.yaw ?? fallbackYaw(landmarks),
    pitch: pose?.pitch ?? 0,
    at,
  };
}

export function isPoseWindowStable(poses: PoseSignature[], yawTolerance = 6, positionTolerance = 0.03, pitchTolerance = 6) {
  if (poses.length < 4) return false;
  const spread = (pick: (pose: PoseSignature) => number) => {
    const values = poses.map(pick);
    return Math.max(...values) - Math.min(...values);
  };
  return spread((pose) => pose.x) <= positionTolerance
    && spread((pose) => pose.y) <= positionTolerance
    && spread((pose) => pose.yaw) <= yawTolerance
    && spread((pose) => pose.pitch) <= pitchTolerance;
}

export function getNextCaptureStep(captures: readonly (string | null)[], currentStep: number) {
  for (let offset = 1; offset <= captures.length; offset += 1) {
    const index = (currentStep + offset) % captures.length;
    if (!captures[index]) return index;
  }
  return -1;
}

export function findMatchingCaptureStep(
  landmarks: LandmarkPoint[],
  captures: readonly (string | null)[],
  preferredStep: number,
  _frameQuality?: FrameQuality,
  pose?: FacePose,
) {
  if (landmarks.length < 455) return preferredStep;
  const yaw = pose?.yaw ?? fallbackYaw(landmarks);
  if (Math.abs(yaw) <= 12 && !captures[0]) return 0;
  const targets = [0, -67.5, 67.5];
  let bestStep = preferredStep;
  let bestDistance = Number.POSITIVE_INFINITY;
  targets.forEach((target, index) => {
    if (captures[index]) return;
    const distance = Math.abs(yaw - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStep = index;
    }
  });
  return bestStep;
}
