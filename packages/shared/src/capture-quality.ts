import type { ScanView } from './api.ts';

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

const TARGETS: Record<ScanView, { yaw: [number, number]; pitch: [number, number]; smile: [number, number] }> = {
  front: { yaw: [-8, 8], pitch: [-8, 8], smile: [0, .25] },
  front_smile: { yaw: [-8, 8], pitch: [-8, 8], smile: [.55, 1] },
  left_oblique: { yaw: [-50, -30], pitch: [-8, 8], smile: [0, 1] },
  right_oblique: { yaw: [30, 50], pitch: [-8, 8], smile: [0, 1] },
  left_profile: { yaw: [-75, -60], pitch: [-10, 10], smile: [0, 1] },
  right_profile: { yaw: [60, 75], pitch: [-10, 10], smile: [0, 1] },
  basal: { yaw: [-8, 8], pitch: [15, 30], smile: [0, 1] },
};

const within = (value: number, range: [number, number]) => value >= range[0] && value <= range[1];

export function evaluateCapture(view: ScanView, value: FaceObservation): QualityStatus {
  if (value.faceCount === 0 || value.confidence < .7) return 'no_face';
  if (value.faceCount > 1) return 'multiple_faces';
  if (value.brightness < 45) return 'too_dark';
  if (value.brightness > 210 || value.clippedRatio > .2) return 'too_bright';
  if (value.faceHeightRatio < .45) return 'too_far';
  if (value.faceHeightRatio > .75) return 'too_close';
  if (Math.abs(value.centerOffsetX) > .08 || Math.abs(value.centerOffsetY) > .08) return 'off_center';
  const target = TARGETS[view];
  if (!within(value.yaw, target.yaw) || !within(value.pitch, target.pitch) || Math.abs(value.roll) > 6) return 'wrong_pose';
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
