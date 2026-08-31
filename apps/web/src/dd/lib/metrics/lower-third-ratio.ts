import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Lower-Third Ratio — upper-lip portion of the lower third of the face.
 *
 * Ideal: ~0.33 (upper lip occupies 1/3 of lower third; lower-lip + chin = 2/3).
 *
 * Upper portion = subnasale (2) to upper-lip top (13), face-frame y only
 * Lower third   = subnasale (2) to chin (152), face-frame y only
 *
 * Face-frame y to be head-roll invariant — see geometry.ts.
 */
export function calculateLowerThirdRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const upperLip = lm(landmarks, LANDMARK.upperLipTop);
  const chin = lm(landmarks, LANDMARK.chin);
  const subnasaleY = faceFrameY(subnasale, forehead, chin);
  const upperLipY = faceFrameY(upperLip, forehead, chin);
  const chinY = faceFrameY(chin, forehead, chin);
  const upper = Math.abs(upperLipY - subnasaleY);
  const total = Math.abs(chinY - subnasaleY);
  const raw = total > 0 ? upper / total : 0;
  const ideal = getIdealRange("lower-third-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
