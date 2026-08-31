import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Nose–Mouth Ratio — mouth width divided by nose-base (alar) width.
 *
 * Ideal: ~1.5 (mouth is 1.5× wider than nose base).
 *
 * Mouth width = left corner (61) to right corner (291)
 * Nose width  = left alar (98) to right alar (327)
 */
export function calculateNoseMouthRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftMouth = lm(landmarks, LANDMARK.leftMouthCorner);
  const rightMouth = lm(landmarks, LANDMARK.rightMouthCorner);
  const leftAlar = lm(landmarks, LANDMARK.leftAlar);
  const rightAlar = lm(landmarks, LANDMARK.rightAlar);
  const mouth = dist(leftMouth, rightMouth);
  const nose = dist(leftAlar, rightAlar);
  // Phase 192v — guard degenerate denominator (collapsed landmarks → 0)
  // so `raw` can't leak NaN/Infinity downstream. Matches sibling pattern.
  const raw = nose > 0 ? mouth / nose : 0;
  const ideal = getIdealRange("nose-mouth-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
