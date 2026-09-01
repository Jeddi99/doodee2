import assert from 'node:assert/strict';
import test from 'node:test';

import poseTargets from '../../../backend/doodee/pose_targets.json' with { type: 'json' };
import { advanceCaptureTimer, CLOSER_HINT_BELOW, DEFAULT_HOLD_MS, evaluateCapture, getFramingHint, getPoseGuidance, holdMsFor, startCaptureTimer, type FaceObservation } from './capture-quality.ts';
import type { ScanView } from './api.ts';

const valid: FaceObservation = {
  faceCount: 1, confidence: .9, brightness: 120, clippedRatio: .02, faceHeightRatio: .58,
  centerOffsetX: 0, centerOffsetY: 0, yaw: 0, pitch: 0, roll: 0, smile: .1, stable: true,
};

const views = Object.entries(poseTargets) as [ScanView, Record<string, [number, number]>][];
const middle = (range: [number, number]) => (range[0] + range[1]) / 2;
const onTarget = (target: Record<string, [number, number]>): FaceObservation => ({
  ...valid, yaw: middle(target.yaw), pitch: middle(target.pitch), roll: middle(target.roll), smile: middle(target.smile),
});

test('quality failures are prioritized before ready', () => {
  assert.equal(evaluateCapture('front', { ...valid, faceCount: 0 }), 'no_face');
  assert.equal(evaluateCapture('front', { ...valid, brightness: 20 }), 'too_dark');
  assert.equal(evaluateCapture('front', { ...valid, faceHeightRatio: .2 }), 'too_far');
  assert.equal(evaluateCapture('front_smile', valid), 'wrong_expression');
  assert.equal(evaluateCapture('left_profile', { ...valid, yaw: -68 }), 'ready');
});

test('a dim room reports too_dark instead of too_bright', () => {
  // The web light sampler used to count near-black pixels as clipped, so a dark background
  // was reported as glare. Dark and bright saturation are separate signals now.
  assert.equal(evaluateCapture('front', { ...valid, brightness: 60, darkRatio: .8, clippedRatio: .02 }), 'too_dark');
  assert.equal(evaluateCapture('front', { ...valid, brightness: 190, darkRatio: .01, clippedRatio: .3 }), 'too_bright');
});

test('an ordinary portrait framing is accepted because capture crops to the face', () => {
  // Measured from apps/web/public/upgrade-assets: real portraits sit near .36-.40 face height
  // and can be off centre by .12-.22. Framing is fixed by cropping, not by moving the user.
  assert.equal(evaluateCapture('front', { ...valid, faceHeightRatio: .38, centerOffsetX: .15 }), 'ready');
  assert.equal(evaluateCapture('front', { ...valid, faceHeightRatio: .61, centerOffsetX: -.117 }), 'ready');
  assert.equal(evaluateCapture('front', { ...valid, faceHeightRatio: .18 }), 'too_far');
  assert.equal(evaluateCapture('front', { ...valid, faceHeightRatio: .95 }), 'too_close');
  assert.equal(evaluateCapture('front', { ...valid, centerOffsetX: .3 }), 'off_center');
});

test('readiness and guidance read the same pose-target coordinates', () => {
  for (const [view, target] of views) {
    const observation = onTarget(target);
    assert.equal(evaluateCapture(view, observation), 'ready', view);
    assert.equal(getPoseGuidance(view, observation), null, view);
  }
});

test('a mirrored yaw is rejected instead of accepted', () => {
  for (const [view, target] of views) {
    if (target.yaw[0] <= 0 && target.yaw[1] >= 0) continue;
    const mirrored = { ...onTarget(target), yaw: -middle(target.yaw) };
    assert.equal(evaluateCapture(view, mirrored), 'wrong_pose', view);
  }
});

test('pose guidance reports the largest correction in pose-target coordinates', () => {
  assert.deepEqual(getPoseGuidance('left_oblique', { yaw: -18, pitch: 18, roll: 0 }), {
    axis: 'yaw', delta: -12, degrees: 10, direction: 'left', centerFirst: false,
  });
  assert.deepEqual(getPoseGuidance('basal', { yaw: 0, pitch: -8, roll: 0 }), {
    axis: 'pitch', delta: -7, degrees: 5, direction: 'up', centerFirst: false,
  });
  assert.equal(getPoseGuidance('right_profile', { yaw: 68, pitch: 0, roll: 0 }), null);
});

test('switching profile sides returns to center before counting the new target', () => {
  // Turned the wrong way: the correction is the whole way back to centre, and that number does
  // not depend on where the window sits. Turning further from -68 towards the far edge would be
  // arithmetically shorter and physically absurd, which is what `centerFirst` exists to say.
  assert.deepEqual(getPoseGuidance('right_profile', { yaw: -68, pitch: 0, roll: 0 }), {
    axis: 'yaw', delta: 68, degrees: 70, direction: 'right', centerFirst: true,
  });

  // From centre the ask is the near edge of the window, read off `pose_targets.json` rather
  // than written down here. It used to be written down: `b362f3c` widened the profile window
  // to make the step reachable at all, this assertion kept the old edge, and the suite has
  // carried a red test ever since — describing a decision nobody had reversed.
  const edge = (poseTargets as any).right_profile.yaw[0];
  const fromCentre = getPoseGuidance('right_profile', { yaw: 0, pitch: 0, roll: 0 })!;
  assert.equal(fromCentre.delta, edge, 'the ask is the near edge of the window');
  assert.equal(fromCentre.direction, 'right');
  assert.equal(fromCentre.centerFirst, false, 'nothing to undo — already facing forward');
  // Spoken aloud to someone who cannot see the screen, so it is rounded to fives.
  assert.equal(fromCentre.degrees % 5, 0);
  assert.ok(Math.abs(fromCentre.degrees - edge) <= 2.5, `${fromCentre.degrees} is not ${edge} rounded`);
});

test('the basal view asks for chin up and never sends the subject the other way', () => {
  // Reported from a real capture: the instruction said tilt up while only tilting down
  // satisfied the target, because positive pitch is chin-down in these coordinates.
  const target = (poseTargets as any).basal.pitch;
  assert.ok(target[0] < 0 && target[1] < 0, 'basal must sit on the chin-up side of zero');
  const guidance = getPoseGuidance('basal', { yaw: 0, pitch: 0, roll: 0 })!;
  assert.equal(guidance.direction, 'up');
  assert.ok(guidance.delta < 0);
  // Someone already tilted too far up is sent back down, not further up.
  assert.equal(getPoseGuidance('basal', { yaw: 0, pitch: -40, roll: 0 })!.direction, 'down');
  // A face tilted down during a front shot is told to come up.
  assert.equal(getPoseGuidance('front', { yaw: 0, pitch: 30, roll: 0 })!.direction, 'up');
});

test('capture requires the hold to elapse and fallback appears after three seconds', () => {
  let state = startCaptureTimer(0);
  state = advanceCaptureTimer(state, 'ready', 100);
  assert.equal(advanceCaptureTimer(state, 'ready', 399).shouldCapture, false);
  assert.equal(advanceCaptureTimer(state, 'ready', 400).shouldCapture, true);
  state = advanceCaptureTimer(state, 'off_center', 401);
  assert.equal(state.validSince, null);
  assert.equal(advanceCaptureTimer(state, 'off_center', 2_999).fallbackAvailable, false);
  assert.equal(advanceCaptureTimer(state, 'off_center', 3_000).fallbackAvailable, true);
});

test('a profile shoots on a far shorter dwell than a front view', () => {
  // The point of the difference: a side view is held with the screen out of sight, so the pose
  // cannot be verified while it is being held. Asking for the front view's half second there is
  // what made the side views unshootable alone.
  assert.ok(holdMsFor('left_profile') < holdMsFor('front'));
  assert.equal(holdMsFor('left_profile'), holdMsFor('right_profile'));
  assert.equal(holdMsFor('front'), DEFAULT_HOLD_MS);

  const held = (view: ScanView, at: number) => {
    let state = advanceCaptureTimer(startCaptureTimer(0), 'ready', 0, holdMsFor(view));
    state = advanceCaptureTimer(state, 'ready', at, holdMsFor(view));
    return state.shouldCapture;
  };
  assert.equal(held('left_profile', 119), false);
  assert.equal(held('left_profile', 120), true);
  // The same instant is still too early for the front view, which keeps the steadier hold.
  assert.equal(held('front', 180), false);
  assert.equal(held('front', 300), true);
});

test('a small but acceptable face is advised closer, never rejected for it', () => {
  const at = (faceHeightRatio: number) => ({ ...valid, faceHeightRatio });
  // The band between the reject floor and the hint threshold: capture still succeeds.
  assert.equal(getFramingHint(at(.28)), 'move_closer');
  assert.equal(evaluateCapture('front', at(.28)), 'ready', 'the hint must not gate the capture');

  // Below the floor the loud message already covers it, so there is no second voice.
  assert.equal(getFramingHint(at(.2)), null);
  assert.equal(evaluateCapture('front', at(.2)), 'too_far');

  // A face already large enough is left alone.
  assert.equal(getFramingHint(at(CLOSER_HINT_BELOW)), null);
  assert.equal(getFramingHint(at(.5)), null);
  // Nothing to advise when there is no single face to measure.
  assert.equal(getFramingHint({ faceCount: 0, faceHeightRatio: .28 }), null);
  assert.equal(getFramingHint({ faceCount: 2, faceHeightRatio: .28 }), null);
});
