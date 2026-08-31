import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Golden Ratio — face height divided by face width.
 *
 * Source: Marquardt mask; phi (1.618). Note 2024 meta-analyses dispute the
 * universal-application claim — included here for completeness and tradition.
 *
 * Height = forehead apex (10) to chin (152)
 * Width  = bizygomatic, zygion landmarks 116 / 345 (`LANDMARK.leftZygion`)
 *
 * Phase 99 fix: was using silhouette-outline points 234 / 454 which
 * MediaPipe occasionally places on hair / background edges, inflating
 * the width and producing implausible ratios (0.83 for a private reference vs
 * expected ~1.6). Zygion is the actual cheek BONE prominence and stays
 * tight to the face regardless of silhouette noise.
 */
export function calculateGoldenRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const top = lm(landmarks, LANDMARK.foreheadApex);
  const bottom = lm(landmarks, LANDMARK.chin);
  const left = lm(landmarks, LANDMARK.leftZygion);
  const right = lm(landmarks, LANDMARK.rightZygion);
  const height = dist(top, bottom);
  const width = dist(left, right);
  // Phase 192v — guard degenerate denominator (collapsed landmarks → 0)
  // so `raw` can't leak NaN/Infinity downstream. Matches sibling pattern.
  const raw = width > 0 ? height / width : 0;
  const ideal = getIdealRange("golden-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
