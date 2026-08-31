import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Alar Base Width — width of the nasal base (alar-to-alar) divided by
 * bizygomatic face width.
 *
 * Source: rhinoplasty / aesthetic surgery norms.
 * Universal canon: ~0.22-0.30 (alar base ≈ inter-canthal distance).
 * Asian populations trend wider (broader alar base anatomically).
 *
 * Landmarks: 98 (left alar), 327 (right alar); 234, 454 (zygion).
 */
export function calculateAlarBaseWidth(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftAlar = lm(landmarks, LANDMARK.leftAlar);
  const rightAlar = lm(landmarks, LANDMARK.rightAlar);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const alar = dist(leftAlar, rightAlar);
  const face = dist(cheekL, cheekR);
  const raw = face > 0 ? alar / face : 0;
  const ideal = getIdealRange("alar-base-width", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
