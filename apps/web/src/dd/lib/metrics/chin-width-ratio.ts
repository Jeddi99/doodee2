import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Chin Width Ratio — chin base width divided by face width.
 *
 *   ratio = chinBaseWidth / faceWidth
 *
 * chinBaseWidth uses landmarks 148 (left chin corner) and 377 (right
 * chin corner) — these sit at the lateral edge of the chin pad, where
 * the jaw curves up toward gonion.
 *
 * faceWidth uses preauricular landmarks 234 (left) and 454 (right) —
 * already canonical in the codebase for face width.
 *
 * Higher ratio = squarer / wider chin. Lower ratio = pointier chin.
 *
 * Ideal:
 * - Male: 0.35-0.48 (slightly wider chin reads more masculine)
 * - Female: 0.28-0.40 (slightly pointier reads more feminine)
 *
 * Sources: derived from FACE3D anthropometric atlas + visual analysis
 * of Hwang et al. 2012 Korean ideal-jaw measurements. Approximated —
 * the formal cephalometric standard is "bigonial breadth" which uses
 * landmarks lower (gonion 172/397) and overlaps with `jaw-width-to-cheek`.
 *
 * This metric specifically measures the **chin pad base** as the
 * distinguishing morphology — distinct from gonial / jaw-angle metrics.
 *
 * Category: `dimorphism` (sexual dimorphism — chin shape is a strong
 * masculine/feminine signal).
 */
export function calculateChinWidthRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const chinLeft = lm(landmarks, 148);
  const chinRight = lm(landmarks, 377);
  const faceLeft = lm(landmarks, LANDMARK.leftCheek);
  const faceRight = lm(landmarks, LANDMARK.rightCheek);
  const chinW = dist(chinLeft, chinRight);
  const faceW = dist(faceLeft, faceRight);
  if (faceW === 0) {
    const ideal = getIdealRange("chin-width-ratio", options);
    return { raw: 0, score: 0, ideal, unit: "x" };
  }
  const raw = chinW / faceW;
  const ideal = getIdealRange("chin-width-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
