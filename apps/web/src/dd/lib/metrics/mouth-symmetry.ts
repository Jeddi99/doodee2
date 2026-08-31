import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm, pairSymmetryAcrossLine } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Mouth Symmetry — how closely the left and right mouth corners mirror
 * each other across the face-vertical axis (forehead → chin). Roll-
 * invariant: tilted head no longer fakes mouth asymmetry.
 *
 * Source: bilateral-symmetry literature; informational per Nature 2025
 * (averageness > symmetry for overall attractiveness, but local
 * asymmetry is still surfaced because users care).
 *
 * Raw 1.0 = perfectly mirrored corners; lower = more deviation.
 */
export function calculateMouthSymmetry(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const left = lm(landmarks, LANDMARK.leftMouthCorner);
  const right = lm(landmarks, LANDMARK.rightMouthCorner);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const faceWidth = dist(cheekL, cheekR);
  const raw = pairSymmetryAcrossLine(left, right, forehead, chin, faceWidth);
  const ideal = getIdealRange("mouth-symmetry", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
