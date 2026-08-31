import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { lm, signedTiltAngle } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Brow Tilt — degree slope of the viewer-left eyebrow from inner to outer
 * tip, measured **relative to the inter-inner-canthal axis** (head-roll
 * invariant). Positive = outer brow elevated above the inter-medial line
 * toward the forehead, i.e. arched / lifted.
 *
 * Source: aesthetic norms; female brow trends more arched.
 *
 * Inner brow:  107 (viewer-left brow, near nose)
 * Outer brow:  70  (viewer-left brow, away from nose)
 * Reference:   133 → 362 (inter-inner-canthal axis)
 * Up-reference: 10 (forehead apex)
 */
export function calculateBrowTilt(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const inner = lm(landmarks, LANDMARK.leftBrowInner);
  const outer = lm(landmarks, LANDMARK.leftBrowOuter);
  const refStart = lm(landmarks, LANDMARK.leftInnerCanthus);
  const refEnd = lm(landmarks, LANDMARK.rightInnerCanthus);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const raw = signedTiltAngle(inner, outer, refStart, refEnd, forehead);
  const ideal = getIdealRange("brow-tilt", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
