import assert from 'node:assert/strict';
import test from 'node:test';

import { nextSlowInferenceStreak, shouldDisableAutoCapture } from './capturePerformance.js';

test('three consecutive slow inferences disable automatic capture', () => {
  let streak = nextSlowInferenceStreak(0, 251);
  streak = nextSlowInferenceStreak(streak, 300);
  assert.equal(shouldDisableAutoCapture(streak), false);
  streak = nextSlowInferenceStreak(streak, 260);
  assert.equal(shouldDisableAutoCapture(streak), true);
  assert.equal(nextSlowInferenceStreak(streak, 100), 0);
});
