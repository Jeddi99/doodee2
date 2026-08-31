import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Forehead Width Ratio — outer-brow-to-outer-brow span (a proxy for
 * temple-frontal width) divided by bizygomatic cheek width. Higher
 * values suggest a broader / more masculine forehead; lower values a
 * narrower / more tapered forehead.
 *
 * Source: Farkas anthropometric norms; classical "temple = ~0.85-0.95
 * of bizygomatic". Female ideal trends a touch lower (tapered).
 *
 * Landmarks: 70 / 300 (outer brow), 234 / 454 (zygion).
 */
export function calculateForeheadWidthRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const browL = lm(landmarks, LANDMARK.leftBrowOuter);
  const browR = lm(landmarks, LANDMARK.rightBrowOuter);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const forehead = dist(browL, browR);
  const face = dist(cheekL, cheekR);
  const raw = face > 0 ? forehead / face : 0;
  const ideal = getIdealRange("forehead-width-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
