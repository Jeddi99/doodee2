import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Eye Spacing Ratio — inter-canthal distance divided by single-eye width.
 *
 * Ideal: ~1.0 (inter-canthal distance equals one eye width).
 *
 * Inter-canthal = left inner (133) to right inner (362)
 * Eye width     = left outer (33) to left inner (133)
 */
export function calculateEyeSpacingRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftInner = lm(landmarks, LANDMARK.leftInnerCanthus);
  const rightInner = lm(landmarks, LANDMARK.rightInnerCanthus);
  const leftOuter = lm(landmarks, LANDMARK.leftOuterCanthus);
  const inter = dist(leftInner, rightInner);
  const eyeWidth = dist(leftOuter, leftInner);
  const ideal = getIdealRange("eye-spacing-ratio", options);
  if (eyeWidth === 0) return { raw: 0, score: 0, ideal, unit: "x" };
  const raw = inter / eyeWidth;
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
