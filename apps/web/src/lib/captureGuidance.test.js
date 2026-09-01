import assert from 'node:assert/strict';
import test from 'node:test';

import { LOST_WHEN_CLOSE_ABOVE, LOST_WHEN_FAR_BELOW, QUALITY_TEXT, qualityText } from './captureGuidance.js';

const th = (status, lastFaceHeight = 0) => qualityText(status, true, lastFaceHeight);
const en = (status, lastFaceHeight = 0) => qualityText(status, false, lastFaceHeight);

test('every distance message says which way to move the phone', () => {
  // The complaint this answers: "hold the phone so your face is visible" describes the goal, not
  // the move, and the two candidate moves are opposites. Someone mid-profile cannot see the
  // screen to work out which one they need.
  assert.match(th('too_far'), /ใกล้/);
  assert.doesNotMatch(th('too_far'), /ห่าง/);
  assert.match(th('too_close'), /ห่าง/);
  assert.doesNotMatch(th('too_close'), /ใกล้/);
  assert.match(en('too_far'), /closer/i);
  assert.match(en('too_close'), /further/i);

  // A face running off an edge fits by backing the phone off; the crop handles the centring.
  assert.match(th('off_center'), /ห่าง/);
  assert.match(en('off_center'), /further/i);
});

test('a lost face is told the direction its last known size implies', () => {
  // Filling the frame and then vanishing means the phone came too close.
  assert.match(th('no_face', LOST_WHEN_CLOSE_ABOVE), /ห่าง/);
  assert.match(en('no_face', 0.8), /further/i);

  // A speck that then vanished means the opposite.
  assert.match(th('no_face', LOST_WHEN_FAR_BELOW), /ใกล้/);
  assert.match(en('no_face', 0.12), /closer/i);
});

test('a face that was a comfortable size gets no distance instruction it cannot justify', () => {
  // Lost from a good working distance says nothing about distance, so guessing "closer" or
  // "further" would send half of these people the wrong way.
  const mid = th('no_face', 0.4);
  assert.doesNotMatch(mid, /ใกล้/);
  assert.match(mid, /ห่าง/, 'the fallback still offers the likelier of the two moves');
  assert.match(en('no_face', 0.4), /further back/i);
});

test('no measurement yet still yields a move, not a shrug', () => {
  // Opening the camera with the phone pointed away is the common start, and backing off is what
  // brings a whole face into frame.
  assert.match(th('no_face', 0), /ห่าง/);
  assert.match(en('no_face', 0), /further/i);
});

test('statuses that are not about distance are passed through untouched', () => {
  for (const status of ['multiple_faces', 'too_dark', 'too_bright', 'wrong_pose', 'not_stable', 'ready']) {
    assert.equal(th(status), QUALITY_TEXT[status][0], status);
    assert.equal(en(status), QUALITY_TEXT[status][1], status);
  }
});

test('every status the capture screen can report has words in both languages', () => {
  // A missing entry reads as an empty status line, which is indistinguishable from the app having
  // frozen — and there is no visible clue for someone holding a profile.
  const statuses = ['no_face', 'multiple_faces', 'too_dark', 'too_bright', 'too_far', 'too_close',
    'off_center', 'wrong_pose', 'wrong_expression', 'not_stable', 'ready'];
  for (const status of statuses) {
    assert.ok(th(status)?.trim(), `${status} has no Thai text`);
    assert.ok(en(status)?.trim(), `${status} has no English text`);
  }
});
