import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Palpebral Fissure Aspect — eye height divided by eye width.
 *
 * Source: Farkas anthropometric norms.
 * Universal ideal: 0.30–0.40. Asian populations trend lower (0.26–0.36)
 * because the palpebral fissure is anatomically narrower.
 *
 * Height: upper eyelid mid (159) → lower eyelid mid (145), projected
 *         onto the face-vertical axis (forehead → chin) for head-roll
 *         invariance.
 * Width:  outer canthus (33) → inner canthus (133), Euclidean (already
 *         roll-invariant for a two-point distance).
 */
export function calculatePalpebralFissureAspect(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const upper = lm(landmarks, LANDMARK.leftUpperLid);
  const lower = lm(landmarks, LANDMARK.leftLowerLid);
  const outer = lm(landmarks, LANDMARK.leftOuterCanthus);
  const inner = lm(landmarks, LANDMARK.leftInnerCanthus);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const upperY = faceFrameY(upper, forehead, chin);
  const lowerY = faceFrameY(lower, forehead, chin);
  const height = Math.abs(lowerY - upperY);
  const width = dist(outer, inner);
  const raw = width > 0 ? height / width : 0;
  const ideal = getIdealRange("palpebral-fissure-aspect", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
