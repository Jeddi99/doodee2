import test from "node:test";
import assert from "node:assert/strict";
import { prepareUpload, resolveStep, type StillReading, type UploadPorts } from "../src/lib/uploadSlot.ts";
import { type FaceObservation, type LandmarkPoint } from "../src/scanQuality.ts";

/**
 * `prepareUpload` takes every canvas and worker operation as a port, so the decisions it makes —
 * reject or accept, which slot, warn or block — can be exercised here with no DOM at all. What
 * follows is only those decisions; the pixel handling is verified in a browser.
 */

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
const observation = (yaw = 0, extra: Partial<FaceObservation> = {}): FaceObservation => ({
  faceCount: 1, smile: 0.05, yaw, pitch: 0, roll: 0, ...extra,
});

const file = { name: "photo.jpg", type: "image/jpeg", size: 1_000_000 } as File;
const heic = { name: "IMG_0001.HEIC", type: "", size: 1_000_000 } as File;

type Reading = StillReading;

/**
 * Ports over a script of readings. The first entry answers the pre-crop detection, the second the
 * post-crop one — which is the two-pass shape `prepareUpload` uses.
 */
function ports(readings: Reading[], overrides: Partial<UploadPorts<string>> = {}): UploadPorts<string> {
  let call = 0;
  return {
    decode: async () => ({ full: "full", detect: "detect", width: 3000, height: 4000 }),
    detect: async () => readings[Math.min(call++, readings.length - 1)],
    crop: () => "data:image/jpeg;base64,CROP",
    reread: async () => "cropped",
    classifyFailure: () => "unreadable_image",
    isSideways: (roll: number) => Math.abs(roll) > 60,
    ...overrides,
  };
}

const good: Reading = { landmarks: face(), frameQuality: clearFrame, observation: observation(0) };
const distant: Reading = { landmarks: face(0.15), frameQuality: clearFrame, observation: observation(0) };
const empty: (string | null)[] = [null, null, null];

test("a usable photograph fills the slot it was offered for", async () => {
  const result = await prepareUpload(file, 0, empty, ports([distant, good]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stepIndex, 0);
  assert.equal(result.warning, null);
  assert.match(result.dataUrl, /^data:image\/jpeg/);
});

test("nothing is cropped or uploaded when there is no face", async () => {
  let cropped = false;
  const result = await prepareUpload(file, 0, empty, ports(
    [{ landmarks: null }],
    { crop: () => { cropped = true; return "x"; } },
  ));
  assert.deepEqual(result, { ok: false, code: "no_face" });
  assert.equal(cropped, false, "a photograph with no face must not reach the encoder");
});

test("a photograph of two people is refused before it is cropped", async () => {
  // Cropping would frame one of them and quietly lose the fact that there were two.
  let cropped = false;
  const result = await prepareUpload(file, 0, empty, ports(
    [{ landmarks: face(), frameQuality: clearFrame, observation: observation(0, { faceCount: 2 }) }],
    { crop: () => { cropped = true; return "x"; } },
  ));
  assert.deepEqual(result, { ok: false, code: "multiple_faces" });
  assert.equal(cropped, false);
});

test("a sideways photograph says so rather than asking the head to straighten", async () => {
  const result = await prepareUpload(file, 0, empty, ports(
    [{ landmarks: face(), frameQuality: clearFrame, observation: observation(0, { roll: 88 }) }],
  ));
  assert.deepEqual(result, { ok: false, code: "sideways" });
});

test("a face too small to measure is refused, and the reason is its own", async () => {
  const result = await prepareUpload(file, 0, empty, ports(
    [{ landmarks: face(0.03), frameQuality: clearFrame, observation: observation(0) }],
  ));
  assert.deepEqual(result, { ok: false, code: "face_too_small" });
});

test("a file the browser cannot open is classified, not blamed on the face", async () => {
  const result = await prepareUpload(heic, 0, empty, ports([good], {
    decode: async () => { throw new Error("decode failed"); },
    classifyFailure: () => "unsupported_heic",
  }));
  assert.deepEqual(result, { ok: false, code: "unsupported_heic" });
});

test("a smile is a warning on this path, not a rejection", async () => {
  // The server's pose check reads yaw, pitch and roll and never looks at `smile`, so refusing a
  // smiling photograph would be the client turning away something the analysis would accept.
  const smiling: Reading = {
    landmarks: face(), frameQuality: clearFrame, observation: observation(0, { smile: 0.6 }),
  };
  const result = await prepareUpload(file, 0, empty, ports([distant, smiling]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stepIndex, 0);
  assert.equal(result.warning, "relax_expression");
});

test("a photograph offered for the wrong angle lands in the right empty slot", async () => {
  const profile: Reading = {
    landmarks: face(), frameQuality: clearFrame, observation: observation(-68),
  };
  const result = await prepareUpload(file, 0, empty, ports([distant, profile]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stepIndex, 1, "a left profile belongs in the left profile slot");
});

test("but not into a slot that is already filled", async () => {
  const filled: (string | null)[] = [null, "already-captured", null];
  const profile: Reading = {
    landmarks: face(), frameQuality: clearFrame, observation: observation(-68),
  };
  const result = await prepareUpload(file, 0, filled, ports([distant, profile]));
  // Reported against the tile the user actually pressed, so the reason matches what they touched.
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "turn_slightly_right");
});

test("resolveStep leaves a valid photograph where it was aimed", () => {
  const { stepIndex } = resolveStep(face(), empty, 0, clearFrame, observation(0));
  assert.equal(stepIndex, 0);
});

test("light and blur are judged on the cropped image, not the original", async () => {
  // The first reading is of the whole photograph and the second of the crop that will actually be
  // uploaded. Only the second may decide, or the gate would be describing pixels nobody sends.
  const darkOriginal: Reading = {
    landmarks: face(0.15), frameQuality: { ...clearFrame, brightness: 20 }, observation: observation(0),
  };
  const result = await prepareUpload(file, 0, empty, ports([darkOriginal, good]));
  assert.equal(result.ok, true, "a dark surround must not condemn a well-lit face");
});
