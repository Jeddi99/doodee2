import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Mouth Width-to-Face — mouth corner-to-corner width ÷ bizygomatic
 * face width.
 *
 * Source: dimorphism; female ideal trends slightly larger.
 *
 * Mouth: corners (61, 291)
 * Face width: zygomatic (234, 454)
 */
export function calculateMouthWidthToFace(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const cornerL = lm(landmarks, LANDMARK.leftMouthCorner);
  const cornerR = lm(landmarks, LANDMARK.rightMouthCorner);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const mouth = dist(cornerL, cornerR);
  const face = dist(cheekL, cheekR);
  const raw = face > 0 ? mouth / face : 0;
  const ideal = getIdealRange("mouth-width-to-face", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
