import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Interbrow Distance — gap between the inner ends of the two eyebrows
 * (70, 336) ÷ bizygomatic face width.
 *
 * Source: Farkas anthropometric norms.
 * Asian range trends slightly higher (wider interbrow gap typical).
 */
export function calculateInterbrowDistance(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const left = lm(landmarks, LANDMARK.leftBrowInner);
  const right = lm(landmarks, LANDMARK.rightBrowInner);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const gap = dist(left, right);
  const face = dist(cheekL, cheekR);
  const raw = face > 0 ? gap / face : 0;
  const ideal = getIdealRange("interbrow-distance", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
