import type { Landmarks } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { dist, lm } from "@/lib/utils/geometry";

export interface PoseEstimate {
  /** Horizontal head turn in degrees. Positive = face turned to viewer's right. */
  yaw: number;
  /** Vertical head tilt in degrees. Positive = chin up. */
  pitch: number;
  /** In-plane rotation in degrees. Positive = right ear lower. */
  roll: number;
  /** 0..1 how front-facing the head pose is. 1.0 = perfectly front-on. */
  frontness: number;
  /** Inter-pupillary distance in normalized image coords. */
  interPupil: number;
  /** Face bounding-box width in normalized image coords. */
  faceWidth: number;
  /** Face bounding-box height in normalized image coords. */
  faceHeight: number;
  /** Face fraction of image height (good photos: 0.4-0.7). */
  faceFraction: number;
}

const YAW_TOL = 15;
const PITCH_TOL = 12;
const ROLL_TOL = 15;

/**
 * Estimate head pose from 478-point MediaPipe landmarks. All values are
 * approximations from 2D projections — accurate enough to gate
 * pose-sensitive metrics with a confidence score, not for AR.
 *
 * - **yaw** derived from nose-tip horizontal offset vs the inter-eye midpoint,
 *   normalized by inter-eye width. ±30° per full-eye-width offset.
 * - **pitch** derived from nose-tip vertical offset vs the eye-chin midline.
 * - **roll** is the inter-canthal axis angle vs image horizontal.
 * - **frontness** = 1 − weighted(yaw, pitch, roll) normalised to tolerances.
 *
 * Used by `computeAll` to attach confidence to each per-metric result.
 */
export function estimatePose(landmarks: Landmarks): PoseEstimate {
  const leftIn = lm(landmarks, LANDMARK.leftInnerCanthus);
  const rightIn = lm(landmarks, LANDMARK.rightInnerCanthus);
  const leftOut = lm(landmarks, LANDMARK.leftOuterCanthus);
  const rightOut = lm(landmarks, LANDMARK.rightOuterCanthus);
  const noseTip = lm(landmarks, LANDMARK.noseTip);
  const chin = lm(landmarks, LANDMARK.chin);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const leftCheek = lm(landmarks, LANDMARK.leftCheek);
  const rightCheek = lm(landmarks, LANDMARK.rightCheek);

  const eyeMidX = (leftIn.x + rightIn.x) / 2;
  const eyeMidY = (leftIn.y + rightIn.y) / 2;
  const eyeWidth = Math.abs(rightOut.x - leftOut.x);

  const yawRatio = eyeWidth > 0 ? (noseTip.x - eyeMidX) / eyeWidth : 0;
  const yaw = clamp(yawRatio * 60, -45, 45);

  const faceHeightVal = Math.abs(chin.y - forehead.y);
  const midFaceY = (eyeMidY + chin.y) / 2;
  const pitchRatio =
    faceHeightVal > 0 ? (midFaceY - noseTip.y) / faceHeightVal : 0;
  const pitch = clamp(pitchRatio * 80, -35, 35);

  const rollRad = Math.atan2(rightOut.y - leftOut.y, rightOut.x - leftOut.x);
  const roll = (rollRad * 180) / Math.PI;

  const yawCost = Math.min(1, Math.abs(yaw) / YAW_TOL);
  const pitchCost = Math.min(1, Math.abs(pitch) / PITCH_TOL);
  const rollCost = Math.min(1, Math.abs(roll) / ROLL_TOL);
  const frontness = Math.max(
    0,
    1 - 0.6 * yawCost - 0.25 * pitchCost - 0.15 * rollCost
  );

  const interPupil = dist(leftIn, rightIn);
  const faceWidth = dist(leftCheek, rightCheek);
  const faceHeight = faceHeightVal;
  const faceFraction = faceHeight;

  return {
    yaw,
    pitch,
    roll,
    frontness,
    interPupil,
    faceWidth,
    faceHeight,
    faceFraction,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const NEUTRAL_SCORE = 5.5;

/**
 * Blend the raw score toward a neutral midpoint based on confidence.
 * confidence=1 → score unchanged. confidence=0 → neutral 5.5.
 *
 * Used so detection-unreliable metrics don't dump 0 onto the user.
 */
export function confidenceBlend(rawScore: number, confidence: number): number {
  const c = clamp(confidence, 0, 1);
  return rawScore * c + NEUTRAL_SCORE * (1 - c);
}

export { NEUTRAL_SCORE };

/**
 * Categorize a confidence value into UI buckets.
 */
export function confidenceLabel(c: number): "high" | "medium" | "low" {
  if (c >= 0.75) return "high";
  if (c >= 0.45) return "medium";
  return "low";
}
