import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Eye-Width-to-Face Width — single eye width divided by bizygomatic
 * face width. Classical canon places this near 0.20–0.22.
 *
 * Source: Farkas anthropometric norms; classical canon.
 *
 * Eye width: outer canthus (33) → inner canthus (133)
 * Face width: left cheek (234) → right cheek (454)
 */
export function calculateEyeWidthToFace(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const outer = lm(landmarks, LANDMARK.leftOuterCanthus);
  const inner = lm(landmarks, LANDMARK.leftInnerCanthus);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const eyeWidth = dist(outer, inner);
  const faceWidth = dist(cheekL, cheekR);
  const raw = faceWidth > 0 ? eyeWidth / faceWidth : 0;
  const ideal = getIdealRange("eye-width-to-face", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
