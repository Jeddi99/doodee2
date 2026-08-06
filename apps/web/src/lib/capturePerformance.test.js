import assert from 'node:assert/strict';
import test from 'node:test';

import { nextSlowInferenceStreak, shouldDisableAutoCapture } from './capturePerformance.js';

test('five consecutive slow inferences disable automatic capture', () => {
  let streak = 0;
  for (const inferenceMs of [401, 500, 450, 420]) streak = nextSlowInferenceStreak(streak, inferenceMs);
  assert.equal(shouldDisableAutoCapture(streak), false);
  streak = nextSlowInferenceStreak(streak, 410);
  assert.equal(shouldDisableAutoCapture(streak), true);
  assert.equal(nextSlowInferenceStreak(streak, 100), 0);
});

test('inference within the frame budget never counts as slow', () => {
  assert.equal(nextSlowInferenceStreak(4, 399), 0);
});

test('warm-up frames are not counted against the budget', () => {
  let streak = 0;
  for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
    streak = nextSlowInferenceStreak(streak, 2_000, frameIndex);
  }
  assert.equal(streak, 0);
  assert.equal(nextSlowInferenceStreak(streak, 2_000, 3), 1);
});
