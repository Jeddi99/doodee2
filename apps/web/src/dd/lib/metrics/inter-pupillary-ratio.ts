import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm, midpoint } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Inter-Pupillary Ratio — distance between estimated pupil centers
 * divided by bizygomatic face width.
 *
 * Pupil center estimated as midpoint of inner+outer canthus per eye.
 * Classical canon places this near 0.46.
 *
 * Source: Farkas anthropometric norms; Marquardt mask references.
 *
 * Landmarks: 33+133 → left pupil-est, 362+263 → right pupil-est,
 *            234 / 454 → bizygomatic width.
 */
export function calculateInterPupillaryRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftOuter = lm(landmarks, LANDMARK.leftOuterCanthus);
  const leftInner = lm(landmarks, LANDMARK.leftInnerCanthus);
  const rightInner = lm(landmarks, LANDMARK.rightInnerCanthus);
  const rightOuter = lm(landmarks, LANDMARK.rightOuterCanthus);
  const leftPupil = midpoint(leftOuter, leftInner);
  const rightPupil = midpoint(rightInner, rightOuter);
  const inter = dist(leftPupil, rightPupil);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const faceWidth = dist(cheekL, cheekR);
  const ideal = getIdealRange("inter-pupillary-ratio", options);
  if (faceWidth === 0) return { raw: 0, score: 0, ideal, unit: "x" };
  const raw = inter / faceWidth;
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
