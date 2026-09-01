import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
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
  MIN_FACE_PIXELS,
  poseFromMatrix,
  QUALITY_CODES,
  smoothAutoFrame,
  stillFramingCode,
  type FaceObservation,
  type LandmarkPoint,
  type PoseSignature,
} from "../src/scanQuality.ts";
import { siteCopy } from "../src/localization.ts";

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
  assert.deepEqual(captureSteps.map((step) => step.id), ["front", "left_profile", "right_profile"]);
  assert.deepEqual(captureSteps.map((step) => step.label), ["Front", "Left 90°", "Right 90°"]);
});

test("the profile steps ask for a shorter, looser hold than the front step", () => {
  // Front is corrected while watching the guidance. The profiles are held blind, with the screen
  // behind the user's cheek — demanding the same steadiness of both is what made them hard.
  const [front, left, right] = captureSteps;
  assert.equal(front.hold.candidates, 5);
  assert.equal(left.hold.candidates, 3);
  assert.deepEqual(left.hold, right.hold);
  assert.ok(left.hold.yawTolerance > front.hold.yawTolerance);
  assert.ok(left.hold.positionTolerance > front.hold.positionTolerance);
});

test("the browser's pose windows are the server's", () => {
  // The backend re-validates every pose and throws the whole scan away when a measured view is
  // outside its window, so a window widened on only one side means captures the camera accepts
  // and the server destroys. `backend/doodee/tests.py` checks the same contract from its end
  // against real photographs; this is the cheap half that fails the moment the two drift.
  const targets = JSON.parse(
    readFileSync(new URL("../../../backend/doodee/pose_targets.json", import.meta.url), "utf8"),
  );
  for (const step of captureSteps) {
    assert.deepEqual([...step.yaw], targets[step.id].yaw, `${step.id} yaw`);
    assert.deepEqual([...step.pitch], targets[step.id].pitch, `${step.id} pitch`);
    assert.deepEqual([...step.roll], targets[step.id].roll, `${step.id} roll`);
  }
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

// Codes, not sentences. The assertions used to compare the exact English wording, which meant
// rewording a hint broke a test that had nothing to say about wording; they now assert the
// behaviour, and `every quality code has copy in both locales` covers the words.
test("returns useful pose guidance", () => {
  assert.equal(measurePose(face(), 1, clearFrame, 1, observation(0)).code, "turn_farther_left");
  assert.equal(measurePose(face(), 2, clearFrame, 1, observation(0)).code, "turn_farther_right");
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0, 24)).code, "tilt_up");
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0, 0, 18)).code, "level_head");
});

test("rejects multiple faces, poor light, blur, and expression", () => {
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0, 0, 0, { faceCount: 2 })).code, "multiple_faces");
  assert.equal(measurePose(face(), 0, { ...clearFrame, brightness: 30 }, 1, observation()).code, "too_dark");
  assert.equal(measurePose(face(), 0, { ...clearFrame, clippedRatio: 0.3 }, 1, observation()).code, "too_bright");
  assert.equal(measurePose(face(), 0, { ...clearFrame, sharpness: 1 }, 1, observation()).code, "blurry");
  assert.equal(measurePose(face(), 0, clearFrame, 1, observation(0, 0, 0, { smile: 0.5 })).code, "relax_expression");
});

test("requires usable raw-image framing", () => {
  assert.equal(measurePose(face(0.18), 0, clearFrame, 2.5, observation()).code, "too_far");
  const shifted = face();
  shifted.forEach((point) => { point.x += 0.28; });
  assert.equal(measurePose(shifted, 0, clearFrame, 1, observation()).code, "off_centre");
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


test("still framing rejects only what cropping cannot fix", () => {
  assert.equal(stillFramingCode(null, 3000), "no_face");
  const box = getFaceBox(face(0.15));
  // A face this size is normal in a photograph of somebody a metre and a half away. On a tall
  // enough image it carries plenty of pixels, and it must not be turned away for its fraction.
  assert.equal(stillFramingCode(box, 3000), null);
  // The same fraction of a small image is a face of about a hundred pixels, which has too little
  // detail left for 468 landmarks to sit anywhere meaningful.
  assert.equal(stillFramingCode(box, 700), "face_too_small");
  assert.equal(stillFramingCode(getFaceBox(face(0.04)), 4000), "face_too_small");
});

test("the pixel floor sits below anything live capture could produce", () => {
  // The camera path already refuses a face under 0.22 of the frame, and its smallest frame is
  // 960 tall. So this floor can only ever reject photographs, never a captured frame.
  assert.ok(MIN_FACE_PIXELS < 0.22 * 960);
});

test("cropping first is what lets a real photograph pass the gate", () => {
  // The reason `prepareUpload` measures twice. A face filling 0.15 of the frame — an ordinary
  // photograph of someone standing back a little — is refused outright by the live gate, with
  // advice ("move closer") that cannot be acted on inside a picture already taken.
  const landmarks = face(0.15);
  assert.equal(measurePose(landmarks, 0, clearFrame, 1, observation()).code, "too_far");

  // Remap the landmarks into the crop `faceCropRect` would produce, exactly as re-detecting the
  // encoded crop would see them.
  const crop = faceCropRect(getFaceBox(landmarks), 3000, 4000);
  const remapped = landmarks.map((point) => ({
    x: (point.x * 3000 - crop.x) / crop.width,
    y: (point.y * 4000 - crop.y) / crop.height,
  }));

  const after = measurePose(remapped, 0, clearFrame, 1, observation());
  assert.notEqual(after.code, "too_far", "cropping must lift the face out of the too-far band");
  assert.notEqual(after.code, "off_centre", "cropping must centre the face");
  assert.equal(after.valid, true);
});

test("every quality code has copy in both locales and both registers", () => {
  // The guard on the two-register split. A code added to the union without copy behind it would
  // otherwise render as nothing at all, in one language, in one of the two situations.
  for (const locale of ["en", "th"] as const) {
    for (const register of ["live", "still"] as const) {
      for (const code of QUALITY_CODES) {
        const text = siteCopy[locale].scan.quality[register][code];
        assert.equal(typeof text, "string", `${locale}.${register}.${code} is missing`);
        assert.ok(text.length > 0, `${locale}.${register}.${code} is empty`);
      }
    }
  }
});

test("every capture step has a label and an instruction in both locales", () => {
  for (const locale of ["en", "th"] as const) {
    for (const step of captureSteps) {
      const copy = siteCopy[locale].scan.steps[step.id];
      assert.ok(copy.label.length > 0, `${locale}.${step.id}.label`);
      assert.ok(copy.short.length > 0, `${locale}.${step.id}.short`);
    }
  }
});
