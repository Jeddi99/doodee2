import type { ScanView } from './api.ts';
import poseTargets from '../../../backend/doodee/pose_targets.json' with { type: 'json' };

export type QualityStatus =
  | 'no_face' | 'multiple_faces' | 'too_dark' | 'too_bright' | 'too_far' | 'too_close'
  | 'off_center' | 'wrong_pose' | 'wrong_expression' | 'not_stable' | 'ready';

// yaw/pitch/roll must already be in pose_targets.json coordinates: positive yaw means the
// head is turned to the subject's right, and positive pitch means the chin is DOWN toward the
// chest. The pitch sign was reported from a real basal capture that only passed while the
// subject tilted down, against an instruction that said tilt up. Each client converts its own
// detector output before calling in — MediaPipe web in lib/facePose.js, Expo in apps/mobile.
// Nothing here re-signs it.
export type FaceObservation = {
  faceCount: number;
  confidence: number;
  brightness: number;
  clippedRatio: number;
  // Share of near-black pixels. Optional so clients that only sample highlights keep working.
  darkRatio?: number;
  faceHeightRatio: number;
  centerOffsetX: number;
  centerOffsetY: number;
  // Where the face sits in the frame, each edge 0..1. Optional so a client that only reports
  // offsets keeps working, but when it is present the framing check uses it directly instead of
  // estimating the face's extent from its height.
  faceBox?: { left: number; right: number; top: number; bottom: number };
  yaw: number;
  pitch: number;
  roll: number;
  smile: number;
  stable: boolean;
};

export type CaptureTimer = {
  startedAt: number;
  validSince: number | null;
  shouldCapture: boolean;
  fallbackAvailable: boolean;
  progress: number;
};

type PoseAxis = 'yaw' | 'pitch' | 'roll';
type Target = Record<PoseAxis | 'smile', [number, number]>;
const TARGETS = poseTargets as Record<ScanView, Target>;

export type PoseGuidance = {
  axis: PoseAxis;
  delta: number;
  degrees: number;
  direction: 'left' | 'right' | 'up' | 'down';
  centerFirst: boolean;
};

const within = (value: number, range: [number, number]) => value >= range[0] && value <= range[1];
const correction = (value: number, range: [number, number]) => value < range[0] ? range[0] - value : value > range[1] ? range[1] - value : 0;

export function getPoseGuidance(view: ScanView, value: Pick<FaceObservation, PoseAxis>): PoseGuidance | null {
  const target = TARGETS[view];
  const oppositeSide = (target.yaw[0] > 0 && value.yaw < -8) || (target.yaw[1] < 0 && value.yaw > 8);
  const corrections = (['yaw', 'pitch', 'roll'] as const).map((axis) => ({
    axis,
    delta: axis === 'yaw' && oppositeSide ? -value.yaw : correction(value[axis], target[axis]),
  }));
  const { axis, delta } = corrections.reduce((largest, item) => Math.abs(item.delta) > Math.abs(largest.delta) ? item : largest);
  if (!delta) return null;
  // A positive pitch delta asks for more chin-down, so the arrow points down, not up.
  const direction = axis === 'pitch' ? (delta < 0 ? 'up' : 'down') : delta < 0 ? 'left' : 'right';
  return { axis, delta, degrees: Math.max(5, Math.round(Math.abs(delta) / 5) * 5), direction, centerFirst: oppositeSide && axis === 'yaw' };
}

// How close to an edge the face may sit before the crop risks losing part of it.
const FRAME_MARGIN = .004;

/**
 * The smallest face the crop can still make a usable photo out of.
 *
 * Backing away from the phone is the one framing correction available to someone holding a
 * profile they cannot see, and the saved image is cropped to the face regardless, so distance
 * costs framing nothing — only pixels.
 *
 * Upstream this is .10, on the argument that even that leaves ~200px of face for the server to
 * re-measure. Held at .22 here for the reason in the THRESHOLD NOTE below: this app has no
 * hand-tracing step to fall back on, so a frame the server cannot read is a failed scan rather
 * than a rougher drawing. It moves to .10 with the rotation-aware detector.
 */
export const TOO_FAR_BELOW = .22;

/**
 * Whether the whole face is inside the frame — not whether it is centred in it.
 *
 * The saved photo is cropped to the face and recentred on it, so where the face sat in the
 * original frame changes nothing about the result; only whether all of it was there to crop.
 * Requiring a centred face therefore threw away frames the crop would have fixed, and it is a
 * correction nobody can make while turned to a profile, because the guide asking for it is on a
 * screen no longer in view. Holding the phone further back and letting the crop zoom in is a
 * better answer than asking someone to aim blind.
 */
function faceFullyInFrame(value: FaceObservation): boolean {
  const box = value.faceBox;
  if (box) {
    return box.left >= FRAME_MARGIN && box.right <= 1 - FRAME_MARGIN
      && box.top >= FRAME_MARGIN && box.bottom <= 1 - FRAME_MARGIN;
  }
  // No box reported, so the extent is estimated from the height: a face runs roughly three
  // quarters as wide as it is tall.
  const halfWidth = value.faceHeightRatio * .38;
  const halfHeight = value.faceHeightRatio / 2;
  return Math.abs(value.centerOffsetX) + halfWidth <= .5 - FRAME_MARGIN
    && Math.abs(value.centerOffsetY) + halfHeight <= .5 - FRAME_MARGIN;
}

/*
 * THRESHOLD NOTE — read before relaxing any number in `evaluateCapture`.
 *
 * Upstream (github.com/Rapeepath/doodoodeedee) these gates are much looser, and the
 * reasoning there is sound *for that app*: it lets a person re-trace the landmarks by
 * hand on the saved photo, so a frame the automatic measurement cannot read is still
 * usable, and a rejection costs a retake while a loose frame costs a line drawn a
 * little differently.
 *
 * That step does not exist here. This app measures unaided on the server, and
 * `tasks.process_scan` marks the whole Scan FAILED when `analysis_engine` cannot find
 * a face — so the same gates would convert retakes into failed scans, which the user
 * sees as the product breaking rather than as a prompt to try again.
 *
 * So the structural improvements are adopted (face-box framing, per-view hold,
 * pose-aware candidate scoring) and the readability thresholds are held at this
 * repo's values. They relax together with the rotation-aware detection and retry in
 * `analysis_engine.py`, which is what makes the harder frames readable.
 */
export function evaluateCapture(view: ScanView, value: FaceObservation): QualityStatus {
  if (value.faceCount === 0 || value.confidence < .7) return 'no_face';
  if (value.faceCount > 1) return 'multiple_faces';
  if (value.brightness < 45 || (value.darkRatio ?? 0) > .5) return 'too_dark';
  if (value.brightness > 210 || value.clippedRatio > .2) return 'too_bright';
  // Framing is a floor, not a target: capture crops to the face afterwards, so these only
  // reject frames the detector cannot work with or that a crop could not centre without
  // upscaling. Measured portraits sit near .36-.40 face height and .12-.22 off centre.
  //
  // Upstream every gate here is deliberately loose, because a person re-traces the features by
  // hand afterwards. There is no such step in this app, so these stay tight enough that the
  // server can measure the frame unaided — see the THRESHOLD NOTE above.
  if (value.faceHeightRatio < TOO_FAR_BELOW) return 'too_far';
  if (value.faceHeightRatio > .92) return 'too_close';
  if (!faceFullyInFrame(value)) return 'off_center';
  const target = TARGETS[view];
  if (getPoseGuidance(view, value)) return 'wrong_pose';
  if (!within(value.smile, target.smile)) return 'wrong_expression';
  return value.stable ? 'ready' : 'not_stable';
}

// Above the `too_far` floor a capture is accepted, but a face this small still leaves few
// pixels on the features a simulation later has to show a few pixels of change in. Advice, not
// a rejection: a frame that passes today must not start failing because of it.
export const CLOSER_HINT_BELOW = .32;

export type FramingHint = 'move_closer';

export function getFramingHint(value: Pick<FaceObservation, 'faceCount' | 'faceHeightRatio'>): FramingHint | null {
  if (value.faceCount !== 1) return null;
  // Below the floor `too_far` already says this, and louder.
  if (value.faceHeightRatio < TOO_FAR_BELOW || value.faceHeightRatio >= CLOSER_HINT_BELOW) return null;
  return 'move_closer';
}

export function startCaptureTimer(now: number): CaptureTimer {
  return { startedAt: now, validSince: null, shouldCapture: false, fallbackAvailable: false, progress: 0 };
}

/**
 * How good a frame is to keep, 0..1, given that one of several will be chosen.
 *
 * `evaluateCapture` answers "is this frame acceptable"; this answers "is it the best acceptable one
 * seen so far". They are different questions, and only the second one can improve a scan: a sweep
 * through the target window passes through many acceptable frames, and taking whichever happened
 * to arrive first throws away the better ones behind it.
 *
 * Pose centrality carries the most weight for a reason found the hard way. A profile accepted at
 * the far edge of its window is a photo the analyser cannot re-read from a still image — a real
 * scan died on a sharp, well-framed, near-90-degree profile that no confidence threshold from 0.6
 * down to 0.1 could find a face in. Aiming at the middle of the window instead of merely inside it
 * is what keeps a frame readable later.
 *
 * Everything here comes off the observation the detector already produced. Nothing reads pixels,
 * because this runs on every accepted frame and a per-frame image pass would cost the frame rate
 * the tracking depends on.
 */
export function candidateScore(view: ScanView, value: FaceObservation): number {
  const target = TARGETS[view];
  const centrality = (axis: PoseAxis) => {
    const [low, high] = target[axis];
    const middle = (low + high) / 2;
    const reach = (high - low) / 2;
    if (reach <= 0) return 1;
    return Math.max(0, 1 - Math.abs(value[axis] - middle) / reach);
  };
  // Yaw decides whether a profile is readable; pitch and roll only need to be un-extreme.
  const pose = centrality('yaw') * .6 + centrality('pitch') * .2 + centrality('roll') * .2;

  // More pixels of face is strictly better for the crop, up to the point of filling the frame.
  const size = Math.max(0, Math.min(1, (value.faceHeightRatio - TOO_FAR_BELOW) / (.6 - TOO_FAR_BELOW)));

  // Mid-grey is where detail survives in both the shadows and the highlights.
  const light = Math.max(0, 1 - Math.abs(value.brightness - 128) / 128) * (1 - Math.min(1, value.clippedRatio * 4));

  const steady = value.stable ? 1 : 0;
  return pose * .5 + size * .25 + light * .15 + steady * .1;
}

export const DEFAULT_HOLD_MS = 300;

// A profile is taken with the head turned far enough that the screen is out of sight, so it is
// held blind — the person cannot see that they are on target and has only the spoken cue to go
// on. Asking them to keep a pose they cannot verify for half a second is what made the side
// views unshootable alone, so the profiles shoot on a much shorter dwell. The front view keeps
// the longer one: the screen is right there and the extra time buys a steadier frame.
const HOLD_MS: Partial<Record<ScanView, number>> = {
  left_profile: 120,
  right_profile: 120,
  left_oblique: 180,
  right_oblique: 180,
};

export function holdMsFor(view: ScanView): number {
  return HOLD_MS[view] ?? DEFAULT_HOLD_MS;
}

// fallbackAvailable only means "ten seconds passed without a capture, offer a way out".
// Each client picks the way out: web restarts the check for the current view, mobile offers a
// manual shutter.
export function advanceCaptureTimer(
  state: CaptureTimer,
  status: QualityStatus,
  now: number,
  holdMs: number = DEFAULT_HOLD_MS,
): CaptureTimer {
  const fallbackAvailable = now - state.startedAt >= 3_000;
  if (status !== 'ready') return { ...state, validSince: null, shouldCapture: false, fallbackAvailable, progress: 0 };
  const validSince = state.validSince ?? now;
  const elapsed = now - validSince;
  return { ...state, validSince, fallbackAvailable, progress: Math.min(elapsed / holdMs, 1), shouldCapture: elapsed >= holdMs };
}
