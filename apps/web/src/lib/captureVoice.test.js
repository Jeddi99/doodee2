import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldAnnounce } from './captureVoice.ts';

test('the same instruction is not repeated', () => {
  // Saying "turn farther left" again over the user's own attempt to do it is worse than silence.
  assert.equal(shouldAnnounce('turn_farther_left', 'turn_farther_left', 0, 10_000), false);
});

test('a new instruction waits for the last one to have had its turn', () => {
  // A pose crossing a window boundary flips the code every few frames; without the floor this
  // becomes stutter rather than guidance.
  assert.equal(shouldAnnounce('turn_slightly_right', 'turn_farther_left', 9_000, 9_400), false);
  assert.equal(shouldAnnounce('turn_slightly_right', 'turn_farther_left', 9_000, 10_300), true);
});

test('the first instruction of a scan is never held back', () => {
  // lastAt 0 with no previous code: the gap is the whole clock, so it speaks at once.
  assert.equal(shouldAnnounce('finding_face', null, 0, 1_000), true);
});

test('the gap is configurable, because the default is a judgement not a rule', () => {
  assert.equal(shouldAnnounce('tilt_up', 'level_head', 0, 500, 400), true);
  assert.equal(shouldAnnounce('tilt_up', 'level_head', 0, 500, 900), false);
});
