import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameY, lm, midpoint } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Eye-Mouth Distance Ratio — face-frame vertical distance from the eye
 * line (midpoint of inner canthi) to the mouth line (upper-lip top)
 * divided by total face height.
 *
 * Face-frame y to be head-roll invariant — see geometry.ts.
 *
 * Source: classical proportions; rule of thirds tied to this distance
 * roughly equalling 1/3 of face height.
 */
export function calculateEyeMouthDistanceRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const eyeL = lm(landmarks, LANDMARK.leftInnerCanthus);
  const eyeR = lm(landmarks, LANDMARK.rightInnerCanthus);
  const lip = lm(landmarks, LANDMARK.upperLipTop);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const eyeMid = midpoint(eyeL, eyeR);
  const eyeY = faceFrameY(eyeMid, forehead, chin);
  const lipY = faceFrameY(lip, forehead, chin);
  const span = Math.abs(lipY - eyeY);
  const faceHeight = dist(forehead, chin);
  const raw = faceHeight > 0 ? span / faceHeight : 0;
  const ideal = getIdealRange("eye-mouth-distance-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
