import assert from 'node:assert/strict';
import test from 'node:test';

import { beatsBestCandidate, CANDIDATE_MARGIN, emptyCandidate, landmarksInCropSpace, offerCandidate, verifyCandidate } from './captureCandidates.js';

// A canvas that only records what it was asked to do; no pixels are needed to test the bookkeeping.
function fakeCanvas() {
  const canvas = { width: 0, height: 0, draws: 0 };
  canvas.getContext = () => ({ drawImage: () => { canvas.draws += 1; } });
  return canvas;
}

const video = { videoWidth: 1920, videoHeight: 1440 };
const crop = { x: 400, y: 200, width: 600, height: 800 };

test('the first acceptable frame is held, and a better one replaces it', () => {
  const canvas = fakeCanvas();
  const offer = (current, score) => offerCandidate(current, { score, video, crop, canvas });

  // Starts at the edge of the window, which is exactly the frame that later proves unreadable.
  let held = offer(emptyCandidate(), .5);
  assert.ok(held.score !== null);
  assert.equal(canvas.draws, 1);
  const edgeScore = held.score;

  // Sweeping toward the middle of the window is a better frame, so it takes over.
  held = offer(held, .8);
  assert.ok(held.score > edgeScore);
  assert.equal(canvas.draws, 2, 'a winning frame is drawn');
});

test('a worse frame costs nothing and leaves the held one alone', () => {
  const canvas = fakeCanvas();
  const offer = (current, score) => offerCandidate(current, { score, video, crop, canvas });
  const held = offer(emptyCandidate(), .8);
  const after = offer(held, .4);
  assert.equal(after, held, 'the held candidate is returned unchanged');
  assert.equal(canvas.draws, 1, 'a losing frame is never drawn');
});

test('replacing the held frame discards the proof that went with it', () => {
  // The verification belongs to specific pixels. Carrying a stale `verified` onto a new frame
  // would upload something no detector has ever looked at.
  const canvas = fakeCanvas();
  const proven = { score: .5, canvas, landmarks: [[0, 0, 0]], pose: { yaw: 59 }, verified: true };
  const next = offerCandidate(proven, { score: .9, video, crop, canvas });
  assert.notEqual(next, proven);
  assert.equal(next.verified, false);
  assert.equal(next.landmarks, null);
});

test('landmarks are moved into the coordinates of the cropped photo', () => {
  // The server measures the image it is sent, which is the crop. Full-frame coordinates describe a
  // different rectangle, and using them unchanged would stretch every ratio by the ratio of the two.
  const middleOfCrop = { x: (400 + 300) / 1920, y: (200 + 400) / 1440, z: 0 };
  const [[x, y]] = landmarksInCropSpace([middleOfCrop], crop, 1920, 1440);
  assert.ok(Math.abs(x - .5) < 1e-4, `x came out ${x}`);
  assert.ok(Math.abs(y - .5) < 1e-4, `y came out ${y}`);

  const topLeft = landmarksInCropSpace([{ x: 400 / 1920, y: 200 / 1440, z: 0 }], crop, 1920, 1440);
  assert.deepEqual(topLeft, [[0, 0, 0]]);
  // Nothing to convert is not an error; there is simply nothing to send.
  assert.equal(landmarksInCropSpace([], crop, 1920, 1440), null);
  assert.equal(landmarksInCropSpace(null, crop, 1920, 1440), null);
});

test('a frame the still detector cannot read is refused rather than uploaded', async () => {
  // The whole point: this is the same detector the server runs, so a failure here is a failure
  // there. Catching it now costs a moment more sweeping instead of the entire scan.
  const held = { ...emptyCandidate(), score: .5, canvas: fakeCanvas() };
  const result = await verifyCandidate(held, { detectStill: async () => null, crop, videoWidth: 1920, videoHeight: 1440 });
  assert.equal(result.verified, false);
  assert.equal(result.unreadable, true);
  assert.equal(result.landmarks, null);
});

test('a readable frame keeps the reading, so the server need not repeat it', async () => {
  const held = { ...emptyCandidate(), score: .5, canvas: fakeCanvas() };
  const detectStill = async () => ({
    landmarks: [{ x: 400 / 1920, y: 200 / 1440, z: 0 }],
    pose: { yaw: 59, pitch: 1, roll: -2 },
  });
  const result = await verifyCandidate(held, { detectStill, crop, videoWidth: 1920, videoHeight: 1440 });
  assert.equal(result.verified, true);
  assert.equal(result.unreadable, false);
  assert.deepEqual(result.landmarks, [[0, 0, 0]]);
  assert.deepEqual(result.pose, { yaw: 59, pitch: 1, roll: -2 });
});

test('a detector that will not run does not make the scan impossible', async () => {
  // A missing detector says nothing about the photo. Treating it as a failed frame would block
  // scanning entirely on a device where it cannot load, so the frame goes through unverified and
  // the server keeps the final say.
  const held = { ...emptyCandidate(), score: .5, canvas: fakeCanvas() };
  const result = await verifyCandidate(held, {
    detectStill: async () => { throw new Error('wasm unavailable'); },
    crop, videoWidth: 1920, videoHeight: 1440,
  });
  assert.equal(result.verified, true);
  assert.equal(result.detectorUnavailable, true);
  assert.equal(result.landmarks, null, 'nothing is claimed about a photo nothing looked at');
});

test('a candidate already verified is not measured twice', async () => {
  const held = { ...emptyCandidate(), score: .5, canvas: fakeCanvas(), verified: true };
  let calls = 0;
  const result = await verifyCandidate(held, {
    detectStill: async () => { calls += 1; return null; },
    crop, videoWidth: 1920, videoHeight: 1440,
  });
  assert.equal(calls, 0);
  assert.equal(result, held);
});

test('a held frame is only replaced by a clearly better one', () => {
  // Without a margin, near-identical scores swap the held frame constantly, and every swap costs a
  // canvas draw and discards a frame already proven readable.
  assert.equal(beatsBestCandidate(null, 0), true, 'the first candidate is always taken');
  assert.equal(beatsBestCandidate(.5, .5 + CANDIDATE_MARGIN / 2), false);
  assert.equal(beatsBestCandidate(.5, .5 + CANDIDATE_MARGIN * 2), true);
  assert.equal(beatsBestCandidate(.5, .4), false);
});
