import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm, pairSymmetryAcrossLine } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Eye Symmetry — positional symmetry of the outer canthi mirrored
 * across the face-vertical axis (forehead → chin). Roll-invariant.
 *
 * Source: Wang et al. 2017, Aesthetic Surgery Journal 37(4):375–385,
 * "Discriminative Thresholds in Facial Asymmetry: A Review of the
 * Literature". Eyelid-position discrimination threshold is 2 mm — the
 * most sensitive facial feature.
 *
 * Outer canthi: 33 (viewer-left), 263 (viewer-right).
 */
export function calculateEyeSymmetry(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftOuter = lm(landmarks, LANDMARK.leftOuterCanthus);
  const rightOuter = lm(landmarks, LANDMARK.rightOuterCanthus);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const faceWidth = dist(cheekL, cheekR);
  const raw = pairSymmetryAcrossLine(
    leftOuter,
    rightOuter,
    forehead,
    chin,
    faceWidth
  );
  const ideal = getIdealRange("eye-symmetry", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
