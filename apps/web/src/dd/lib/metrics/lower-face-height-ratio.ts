import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Lower-Face Height Ratio — subnasale → chin distance ÷ total face
 * height. Classical "lower third" of the face.
 *
 * Face-frame y to be head-roll invariant — see geometry.ts.
 *
 * Source: classical proportions; male ideal trends higher than female.
 *
 * Distinct from `lower-third-ratio` (which measures the upper-lip
 * fraction of the lower third).
 */
export function calculateLowerFaceHeightRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const chin = lm(landmarks, LANDMARK.chin);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const subnasaleY = faceFrameY(subnasale, forehead, chin);
  const faceHeight = dist(forehead, chin);
  const lower = Math.abs(faceHeight - subnasaleY);
  const raw = faceHeight > 0 ? lower / faceHeight : 0;
  const ideal = getIdealRange("lower-face-height-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
