import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureQuality, isMeasuredView, needsCaptureConfirmation, reviewBadge, viewsRiskingRejection,
} from './captureConfidence.js';

const box = { top: .2, bottom: .7, left: .3, right: .7 };

test('measured views match the ones the backend refuses to forgive', () => {
  assert.equal(isMeasuredView('front', 'standard'), true);
  assert.equal(isMeasuredView('left_profile', 'standard'), true);
  assert.equal(isMeasuredView('right_profile', 'full'), true);
  // Obliques and the basal view produce no metrics, so a tilted one is only advisory.
  assert.equal(isMeasuredView('left_oblique', 'fast'), false);
  assert.equal(isMeasuredView('basal', 'full'), false);
  // A fast scan never captures profiles, so they cannot be measured there.
  assert.equal(isMeasuredView('left_profile', 'fast'), false);
});

test('the manual shutter asks before taking an off-target photo', () => {
  assert.equal(needsCaptureConfirmation('ready'), false);
  for (const status of ['wrong_pose', 'no_face', 'too_dark', 'not_stable', 'off_center']) {
    assert.equal(needsCaptureConfirmation(status), true, status);
  }
});

test('a photo taken before any face was found is reported as uncropped, not as a pose miss', () => {
  const quality = captureQuality('no_face', null, 'front', 'standard');
  assert.equal(quality.cropped, false);
  // front is measured, so an uncropped full-frame shot is fatal, not a nicety.
  assert.deepEqual(reviewBadge(quality), { tone: 'error', reason: 'not_cropped' });
  assert.deepEqual(viewsRiskingRejection({ front: quality }, ['front']), ['front']);
  const extra = captureQuality('no_face', null, 'left_oblique', 'fast');
  assert.deepEqual(reviewBadge(extra), { tone: 'warning', reason: 'not_cropped' });
});

test('an off-target measured view is an error, an off-target extra view is a warning', () => {
  const profile = captureQuality('wrong_pose', box, 'left_profile', 'standard');
  const oblique = captureQuality('wrong_pose', box, 'left_oblique', 'fast');
  assert.deepEqual(reviewBadge(profile), { tone: 'error', reason: 'off_target' });
  assert.deepEqual(reviewBadge(oblique), { tone: 'warning', reason: 'off_target' });
});

test('a good capture still reads as passed, and a server rejection outranks everything', () => {
  const good = captureQuality('ready', box, 'front', 'standard');
  assert.deepEqual(reviewBadge(good), { tone: 'ok', reason: 'passed' });
  assert.deepEqual(reviewBadge(good, true), { tone: 'error', reason: 'rejected' });
  // Photos taken before this tracking existed carry no record and must not be accused.
  assert.deepEqual(reviewBadge(undefined), { tone: 'ok', reason: 'passed' });
});

test('views that would sink the whole upload are listed before it is sent', () => {
  const views = ['front', 'left_profile', 'right_profile'];
  const qualities = {
    front: captureQuality('ready', box, 'front', 'standard'),
    left_profile: captureQuality('wrong_pose', box, 'left_profile', 'standard'),
    right_profile: captureQuality('ready', box, 'right_profile', 'standard'),
  };
  assert.deepEqual(viewsRiskingRejection(qualities, views), ['left_profile']);
  const allGood = { ...qualities, left_profile: captureQuality('ready', box, 'left_profile', 'standard') };
  assert.deepEqual(viewsRiskingRejection(allGood, views), []);
});
