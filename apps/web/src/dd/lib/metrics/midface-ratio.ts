import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm, midpoint } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Midface Ratio — midface vertical span (eye line → mouth) divided by
 * upper-face span (forehead → eye line).
 *
 * Source: dimorphism literature; female faces trend toward a relatively
 * longer midface.
 *
 * Face-frame y to be head-roll invariant — see geometry.ts.
 *
 * Eye line: midpoint of inner canthi (133 + 362)
 * Forehead apex: 10
 * Upper-lip top: 13
 */
export function calculateMidfaceRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const eyeL = lm(landmarks, LANDMARK.leftInnerCanthus);
  const eyeR = lm(landmarks, LANDMARK.rightInnerCanthus);
  const lip = lm(landmarks, LANDMARK.upperLipTop);
  const eyeMid = midpoint(eyeL, eyeR);
  const eyeY = faceFrameY(eyeMid, forehead, chin);
  const lipY = faceFrameY(lip, forehead, chin);
  const upper = Math.abs(eyeY);
  const mid = Math.abs(lipY - eyeY);
  const raw = upper > 0 ? mid / upper : 0;
  const ideal = getIdealRange("midface-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
