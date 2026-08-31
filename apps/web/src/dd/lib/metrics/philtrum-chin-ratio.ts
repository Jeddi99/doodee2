import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Philtrum–Chin Ratio — philtrum height divided by chin-region height.
 *
 * Ideal: ~0.5 (philtrum is half the height of chin segment).
 *
 * Philtrum height = subnasale (2) → upper-lip top edge (13)
 * Chin height     = lower-lip top edge (14) → chin (152)
 *
 * Face-frame y to be head-roll invariant — see geometry.ts.
 */
export function calculatePhiltrumChinRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const upperLip = lm(landmarks, LANDMARK.upperLipTop);
  const lowerLip = lm(landmarks, LANDMARK.lowerLipTop);
  const chin = lm(landmarks, LANDMARK.chin);
  const philtrum = Math.abs(
    faceFrameY(upperLip, forehead, chin) -
      faceFrameY(subnasale, forehead, chin)
  );
  const chinHeight = Math.abs(
    faceFrameY(chin, forehead, chin) -
      faceFrameY(lowerLip, forehead, chin)
  );
  const raw = chinHeight > 0 ? philtrum / chinHeight : 0;
  const ideal = getIdealRange("philtrum-chin-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
