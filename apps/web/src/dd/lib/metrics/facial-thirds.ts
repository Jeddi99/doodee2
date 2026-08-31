import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Facial Thirds — upper-third proportion of total face height.
 *
 * Source: Classical proportions; Marquardt mask.
 * Ideal: ~0.33 (face divides into three equal vertical thirds).
 *
 * Upper third = forehead apex (10) to mid-brow (9)
 * Total      = forehead apex (10) to chin (152)
 *
 * This metric returns the upper-third proportion; perfect symmetry of
 * thirds is implied by a value near 1/3.
 */
export function calculateFacialThirds(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const apex = lm(landmarks, LANDMARK.foreheadApex);
  const brow = lm(landmarks, LANDMARK.midBrow);
  const chin = lm(landmarks, LANDMARK.chin);
  const upper = dist(apex, brow);
  const total = dist(apex, chin);
  // Phase 192v — guard degenerate denominator (collapsed landmarks → 0)
  // so `raw` can't leak NaN/Infinity downstream. Matches sibling pattern.
  const raw = total > 0 ? upper / total : 0;
  const ideal = getIdealRange("facial-thirds", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
