import assert from 'node:assert/strict';
import test from 'node:test';

import { advanceCaptureTimer, evaluateCapture, startCaptureTimer, type FaceObservation } from './capture-quality.ts';

const valid: FaceObservation = {
  faceCount: 1, confidence: .9, brightness: 120, clippedRatio: .02, faceHeightRatio: .58,
  centerOffsetX: 0, centerOffsetY: 0, yaw: 0, pitch: 0, roll: 0, smile: .1, stable: true,
};

test('quality failures are prioritized before ready', () => {
  assert.equal(evaluateCapture('front', { ...valid, faceCount: 0 }), 'no_face');
  assert.equal(evaluateCapture('front', { ...valid, brightness: 20 }), 'too_dark');
  assert.equal(evaluateCapture('front', { ...valid, faceHeightRatio: .2 }), 'too_far');
  assert.equal(evaluateCapture('front_smile', valid), 'wrong_expression');
  assert.equal(evaluateCapture('left_profile', { ...valid, yaw: -68 }), 'ready');
});

test('capture requires one continuous second and fallback appears after ten', () => {
  let state = startCaptureTimer(0);
  state = advanceCaptureTimer(state, 'ready', 100);
  assert.equal(advanceCaptureTimer(state, 'ready', 1_099).shouldCapture, false);
  assert.equal(advanceCaptureTimer(state, 'ready', 1_100).shouldCapture, true);
  state = advanceCaptureTimer(state, 'off_center', 1_101);
  assert.equal(state.validSince, null);
  assert.equal(advanceCaptureTimer(state, 'off_center', 10_000).manualAvailable, true);
});
