import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm, pairSymmetryAcrossLine } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Nose Symmetry — how closely the left and right alar (nose base) points
 * mirror each other across the face-vertical axis. Roll-invariant.
 *
 * Source: bilateral-symmetry literature.
 */
export function calculateNoseSymmetry(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const left = lm(landmarks, LANDMARK.leftAlar);
  const right = lm(landmarks, LANDMARK.rightAlar);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const faceWidth = dist(cheekL, cheekR);
  const raw = pairSymmetryAcrossLine(left, right, forehead, chin, faceWidth);
  const ideal = getIdealRange("nose-symmetry", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
