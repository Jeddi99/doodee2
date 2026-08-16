import test from "node:test";
import assert from "node:assert/strict";
import {
  CANDIDATE_TARGET,
  candidateScore,
  captureSteps,
  faceCropRect,
  findMatchingCaptureStep,
  getAutoFrame,
  getFaceBox,
  getNextCaptureStep,
  getPoseSignature,
  isPoseWindowStable,
  measurePose,
  poseFromMatrix,
  smoothAutoFrame,
  type FaceObservation,
  type LandmarkPoint,
  type PoseSignature,
} from "../src/scanQuality.ts";

function face(height = 0.6): LandmarkPoint[] {
  const landmarks = Array.from({ length: 478 }, (_, index) => {
    const angle = (index / 478) * Math.PI * 2;
    return { x: 0.5 + Math.cos(angle) * 0.2, y: 0.5 + Math.sin(angle) * height / 2 };
  });
  landmarks[234] = { x: 0.3, y: 0.54 };
  landmarks[454] = { x: 0.7, y: 0.54 };
  landmarks[1] = { x: 0.5, y: 0.55 };
  return landmarks;
}

const clearFrame = { brightness: 128, sharpness: 12, clippedRatio: 0.02, darkRatio: 0.01 };
const observation = (yaw = 0, pitch = 0, roll = 0, extra: Partial<FaceObservation> = {}): FaceObservation => ({
  faceCount: 1,
  smile: 0.05,
  yaw,
  pitch,
  roll,
  ...extra,
});

test("uses the standard three-view scan from doodee2", () => {
  assert.equal(CANDIDATE_TARGET, 5);
  assert.deepEqual(captureSteps.map((step) => step.id), ["front", "left_profile", "right_profile"]);
  assert.deepEqual(captureSteps.map((step) => step.label), ["Front", "Left 90°", "Right 90°"]);
});

test("reads MediaPipe transformation matrices in calibrated coordinates", () => {
  const matrix = { rows: 4, columns: 4, data: [
    0.9993, 0.0188, -0.0212, 0,
    -0.0183, 0.9996, 0.0248, 0,
    0.0217, -0.0244, 0.9995, 0,
    0, 0, 0, 1,
  ] };
  const pose = poseFromMatrix(matrix);
  assert.ok(Number.isFinite(pose.yaw));
  assert.ok(Number.isFinite(pose.pitch));
  assert.ok(Number.isFinite(pose.roll));
});

test("accepts front and full profiles only inside calibrated targets", () => {
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0)).valid, true);
  assert.equal(measurePose(face(), 1, clearFrame, 1, observation(-68)).valid, true);
  assert.equal(measurePose(face(), 2, clearFrame, 1, observation(68)).valid, true);
  assert.equal(measurePose(face(), 1, clearFrame, 1, observation(-40)).valid, false);
});

test("returns useful pose guidance", () => {
  assert.equal(measurePose(face(), 1, clearFrame, 1, observation(0)).message, "Turn farther left");
  assert.equal(measurePose(face(), 2, clearFrame, 1, observation(0)).message, "Turn farther right");
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0, 24)).message, "Tilt up slightly");
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0, 0, 18)).message, "Keep your head level");
});

test("rejects multiple faces, poor light, blur, and expression", () => {
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0, 0, 0, { faceCount: 2 })).message, "Only one face can be visible");
  assert.equal(measurePose(face(), 0, { ...clearFrame, brightness: 30 }, 1, observation()).message, "Move into brighter light");
  assert.equal(measurePose(face(), 0, { ...clearFrame, clippedRatio: 0.3 }, 1, observation()).message, "Reduce glare or backlight");
  assert.equal(measurePose(face(), 0, { ...clearFrame, sharpness: 1 }, 1, observation()).message, "Hold still — image is blurry");
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0, 0, 0, { smile: 0.5 })).message, "Relax your expression");
});

test("requires usable raw-image framing", () => {
  assert.equal(measurePose(face(0.18), 0, clearFrame, 2.5, observation()).message, "Move closer");
  const shifted = face();
  shifted.forEach((point) => { point.x += 0.28; });
  assert.equal(measurePose(shifted, 0, clearFrame, 1, observation()).message, "Center your face");
});

test("stability checks position, yaw, and pitch over multiple frames", () => {
  const stable: PoseSignature[] = [0, 100, 200, 300].map((at, index) => ({
    x: 0.5 + index * 0.002,
    y: 0.5 - index * 0.002,
    yaw: -68 + index,
    pitch: index * 0.5,
    at,
  }));
  assert.equal(isPoseWindowStable(stable), true);
  assert.equal(isPoseWindowStable([...stable.slice(0, 3), { ...stable[3], yaw: -52 }]), false);
});

test("matches any uncaptured calibrated angle", () => {
  const empty = [null, null, null];
  assert.equal(findMatchingCaptureStep(face(), empty, 1, clearFrame, observation(0)), 0);
  assert.equal(findMatchingCaptureStep(face(), empty, 0, clearFrame, observation(-68)), 1);
  assert.equal(findMatchingCaptureStep(face(), empty, 0, clearFrame, observation(68)), 2);
});

test("skips completed views and wraps to the next one", () => {
  assert.equal(getNextCaptureStep(["done", null, "done"], 2), 1);
  assert.equal(getNextCaptureStep(["done", "done", "done"], 1), -1);
});

test("candidate scoring favors sharp, evenly exposed frames", () => {
  assert.ok(candidateScore(clearFrame) > candidateScore({ ...clearFrame, brightness: 55, sharpness: 8 }));
  assert.ok(candidateScore(clearFrame) > candidateScore({ ...clearFrame, clippedRatio: 0.35 }));
});

test("auto framing follows the face without reacting to micro jitter", () => {
  const target = getAutoFrame(face(0.32), false);
  assert.ok(target.zoom > 1);
  const previous = { centerX: 0.5, centerY: 0.5, zoom: 1.2 };
  assert.deepEqual(smoothAutoFrame(previous, { centerX: 0.501, centerY: 0.499, zoom: 1.205 }), previous);
});

test("capture crop follows the detected face and never exceeds source", () => {
  const box = getFaceBox(face());
  const crop = faceCropRect(box, 1920, 1440);
  assert.ok(crop.width <= 1920 && crop.height <= 1440);
  assert.ok(crop.x >= 0 && crop.y >= 0);
});

test("pose signatures use transformation-matrix angles", () => {
  const signature = getPoseSignature(face(), 100, observation(-68, 4, 0));
  assert.equal(signature.yaw, -68);
  assert.equal(signature.pitch, 4);
});

test("completes the calibrated three-view flow", () => {
  const captures: (string | null)[] = [null, null, null];
  [observation(0), observation(-68), observation(68)].forEach((pose, step) => {
    const matched = findMatchingCaptureStep(face(), captures, step, clearFrame, pose);
    assert.equal(matched, step);
    assert.equal(measurePose(face(), step, clearFrame, 1, pose).valid, true);
    captures[step] = "captured";
  });
  assert.equal(captures.every(Boolean), true);
});
