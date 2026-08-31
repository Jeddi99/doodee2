import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * fWHR — Face Width-to-Height Ratio.
 *
 * Source: Carré & McCormick 2008. Higher fWHR correlates with perceived
 * dominance and (in male faces) attractiveness in some samples.
 *
 * Width  = bizygomatic zygion (116 / 345 via `LANDMARK.leftZygion`)
 * Height = upper-face height, mid-brow (9) to upper lip (13)
 *
 * Phase 99 fix: was using silhouette landmarks 234 / 454 which drift
 * onto hair / background on some photos. Same fix as `golden-ratio.ts`.
 */
export function calculateFwhr(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const left = lm(landmarks, LANDMARK.leftZygion);
  const right = lm(landmarks, LANDMARK.rightZygion);
  const brow = lm(landmarks, LANDMARK.midBrow);
  const upperLip = lm(landmarks, LANDMARK.upperLipTop);
  const width = dist(left, right);
  const height = dist(brow, upperLip);
  // Phase 192v — guard degenerate denominator (collapsed landmarks → 0)
  // so `raw` can't leak NaN/Infinity downstream. Matches sibling pattern.
  const raw = height > 0 ? width / height : 0;
  const ideal = getIdealRange("fwhr", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
