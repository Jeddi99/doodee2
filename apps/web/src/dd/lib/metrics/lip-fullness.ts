import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Lip Fullness — vermillion height (upper + lower red-lip thickness)
 * as a fraction of total face height. Higher = fuller; female ideal
 * skews higher than male.
 *
 * Source: aesthetic facial proportions, Coleman & Grover 2006.
 *
 * Vermillion = exposed red lip area only — excludes the inter-lip gap
 * (between 13 and 14) so the value is independent of whether the mouth
 * is slightly open. Earlier version measured cupid-to-lower-lip span
 * including the gap; values varied by ~0.02 across the same face
 * depending on mouth position.
 *
 * Upper vermillion = cupid's bow (0) to upper-lip bottom (13)
 * Lower vermillion = lower-lip top (14) to lower-lip bottom (17)
 * Face height = forehead apex (10) to chin (152)
 */
export function calculateLipFullness(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const cupid = lm(landmarks, LANDMARK.cupidsBow);
  const upperLipBottom = lm(landmarks, LANDMARK.upperLipTop);
  const lowerLipTop = lm(landmarks, LANDMARK.lowerLipTop);
  const lowerLipBottom = lm(landmarks, LANDMARK.lowerLipBottom);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const upperVerm = dist(cupid, upperLipBottom);
  const lowerVerm = dist(lowerLipTop, lowerLipBottom);
  const faceHeight = dist(forehead, chin);
  // Phase 192v — guard degenerate denominator (collapsed landmarks → 0)
  // so `raw` can't leak NaN/Infinity downstream. Matches sibling pattern.
  const raw = faceHeight > 0 ? (upperVerm + lowerVerm) / faceHeight : 0;
  const ideal = getIdealRange("lip-fullness", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
