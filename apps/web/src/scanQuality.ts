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
export type Quality = { valid: boolean; message: string; score: number };
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

function poseMessage(stepIndex: number, pose: FacePose) {
  const step = captureSteps[stepIndex];
  if (!within(pose.yaw, step.yaw)) {
    if (step.id === "left_profile") return pose.yaw > step.yaw[1] ? "Turn farther left" : "Turn slightly right";
    if (step.id === "right_profile") return pose.yaw < step.yaw[0] ? "Turn farther right" : "Turn slightly left";
    return pose.yaw < step.yaw[0] ? "Turn slightly right" : "Turn slightly left";
  }
  if (!within(pose.pitch, step.pitch)) return pose.pitch < step.pitch[0] ? "Tilt down slightly" : "Tilt up slightly";
  if (!within(pose.roll, step.roll)) return "Keep your head level";
  return "";
}

export function measurePose(
  landmarks: LandmarkPoint[],
  stepIndex: number,
  frameQuality?: FrameQuality,
  _framingZoom = 1,
  observation?: Partial<FaceObservation>,
): Quality {
  const faceCount = observation?.faceCount ?? (landmarks.length >= 455 ? 1 : 0);
  if (faceCount === 0 || landmarks.length < 455) return { valid: false, message: "Move your face into view", score: 0 };
  if (faceCount > 1) return { valid: false, message: "Only one face can be visible", score: 0 };
  const box = getFaceBox(landmarks);
  if (!box) return { valid: false, message: "Move your face into view", score: 0 };
  const height = box.bottom - box.top;
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  if (frameQuality && (frameQuality.brightness < 45 || (frameQuality.darkRatio ?? 0) > 0.5))
    return { valid: false, message: "Move into brighter light", score: 0 };
  if (frameQuality && (frameQuality.brightness > 210 || (frameQuality.clippedRatio ?? 0) > 0.2))
    return { valid: false, message: "Reduce glare or backlight", score: 0 };
  if (frameQuality && frameQuality.sharpness < 2) return { valid: false, message: "Hold still — image is blurry", score: 0 };
  if (height < 0.22) return { valid: false, message: "Move closer", score: 0 };
  if (height > 0.92) return { valid: false, message: "Move farther away", score: 0 };
  if (Math.abs(centerX - 0.5) > 0.24 || Math.abs(centerY - 0.5) > 0.24)
    return { valid: false, message: "Center your face", score: 0 };
  const pose = {
    yaw: observation?.yaw ?? fallbackYaw(landmarks),
    pitch: observation?.pitch ?? 0,
    roll: observation?.roll ?? 0,
  };
  const guidance = poseMessage(stepIndex, pose);
  if (guidance) return { valid: false, message: guidance, score: 0 };
  if (captureSteps[stepIndex].id === "front" && (observation?.smile ?? 0) > 0.25)
    return { valid: false, message: "Relax your expression", score: 0 };
  return { valid: true, message: "Good angle · Hold still", score: 1 };
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
