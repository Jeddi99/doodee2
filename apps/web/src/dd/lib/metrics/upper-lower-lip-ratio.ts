import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Upper–Lower Lip Ratio — upper-lip vermillion height divided by lower-lip
 * vermillion height.
 *
 * Ideal: ~0.6 (lower lip fuller than upper). Female ideal skews slightly
 * higher than male.
 *
 * Upper-lip height = cupid's bow (0) → upper-lip bottom edge (13)
 * Lower-lip height = lower-lip top edge (14) → bottom edge (17)
 *
 * Face-frame y — projects onto the forehead→chin axis so head roll
 * in the photo doesn't bias the measurement. All four landmarks are
 * on the face midline, so dist() would also work; faceFrameY keeps
 * the implementation explicit about the face-vertical projection.
 */
export function calculateUpperLowerLipRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const upperTop = lm(landmarks, LANDMARK.cupidsBow);
  const upperBottom = lm(landmarks, LANDMARK.upperLipTop);
  const lowerTop = lm(landmarks, LANDMARK.lowerLipTop);
  const lowerBottom = lm(landmarks, LANDMARK.lowerLipBottom);
  const upper = Math.abs(
    faceFrameY(upperBottom, forehead, chin) -
      faceFrameY(upperTop, forehead, chin)
  );
  const lower = Math.abs(
    faceFrameY(lowerBottom, forehead, chin) -
      faceFrameY(lowerTop, forehead, chin)
  );
  const raw = lower > 0 ? upper / lower : 0;
  const ideal = getIdealRange("upper-lower-lip-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
