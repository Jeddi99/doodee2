import type { ScanView } from './api.ts';
import poseTargets from '../../../backend/doodee/pose_targets.json' with { type: 'json' };

export type QualityStatus =
  | 'no_face' | 'multiple_faces' | 'too_dark' | 'too_bright' | 'too_far' | 'too_close'
  | 'off_center' | 'wrong_pose' | 'wrong_expression' | 'not_stable' | 'ready';

export type FaceObservation = {
  faceCount: number;
  confidence: number;
  brightness: number;
  clippedRatio: number;
  faceHeightRatio: number;
  centerOffsetX: number;
  centerOffsetY: number;
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
  manualAvailable: boolean;
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
  const direction = axis === 'pitch' ? (delta < 0 ? 'down' : 'up') : delta < 0 ? 'left' : 'right';
  return { axis, delta, degrees: Math.max(5, Math.round(Math.abs(delta) / 5) * 5), direction, centerFirst: oppositeSide && axis === 'yaw' };
}

export function evaluateCapture(view: ScanView, value: FaceObservation): QualityStatus {
  if (value.faceCount === 0 || value.confidence < .7) return 'no_face';
  if (value.faceCount > 1) return 'multiple_faces';
  if (value.brightness < 45) return 'too_dark';
  if (value.brightness > 210 || value.clippedRatio > .2) return 'too_bright';
  if (value.faceHeightRatio < .45) return 'too_far';
  if (value.faceHeightRatio > .75) return 'too_close';
  if (Math.abs(value.centerOffsetX) > .08 || Math.abs(value.centerOffsetY) > .08) return 'off_center';
  const target = TARGETS[view];
  if (getPoseGuidance(view, value)) return 'wrong_pose';
  if (!within(value.smile, target.smile)) return 'wrong_expression';
  return value.stable ? 'ready' : 'not_stable';
}

export function startCaptureTimer(now: number): CaptureTimer {
  return { startedAt: now, validSince: null, shouldCapture: false, manualAvailable: false, progress: 0 };
}

export function advanceCaptureTimer(state: CaptureTimer, status: QualityStatus, now: number): CaptureTimer {
  const manualAvailable = now - state.startedAt >= 10_000;
  if (status !== 'ready') return { ...state, validSince: null, shouldCapture: false, manualAvailable, progress: 0 };
  const validSince = state.validSince ?? now;
  const elapsed = now - validSince;
  return { ...state, validSince, manualAvailable, progress: Math.min(elapsed / 1_000, 1), shouldCapture: elapsed >= 1_000 };
}
