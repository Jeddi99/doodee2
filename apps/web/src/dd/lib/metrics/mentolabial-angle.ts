import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { angleDeg, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Mentolabial Angle — angle at the mentolabial sulcus (the soft-tissue
 * crease between lower lip and chin), approximated using the lower-lip
 * bottom (17) as vertex with arms to upper-lip-bottom (14) and chin (152).
 *
 * Source: cephalometric norms; ideal 120–140°.
 *
 * Side-view metric.
 */
export function calculateMentolabialAngle(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const lipTop = lm(landmarks, LANDMARK.lowerLipTop);
  const lipBottom = lm(landmarks, LANDMARK.lowerLipBottom);
  const chin = lm(landmarks, LANDMARK.chin);
  const raw = angleDeg(lipTop, lipBottom, chin);
  const ideal = getIdealRange("mentolabial-angle", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
