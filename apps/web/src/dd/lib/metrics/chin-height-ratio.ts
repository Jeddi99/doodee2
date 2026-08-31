import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Chin Height Ratio — lower-lip-to-chin distance ÷ total face height.
 *
 * Source: dimorphism literature.
 * Higher = taller chin region (more masculine). Female ideal trends lower.
 *
 * Face-frame y to be head-roll invariant — see geometry.ts.
 *
 * Lower lip bottom: 17
 * Chin (gnathion): 152
 * Face height: forehead apex (10) → chin (152)
 */
export function calculateChinHeightRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const lipBottom = lm(landmarks, LANDMARK.lowerLipBottom);
  const chin = lm(landmarks, LANDMARK.chin);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const lipBottomY = faceFrameY(lipBottom, forehead, chin);
  const faceHeight = dist(forehead, chin);
  const chinHeight = Math.abs(faceHeight - lipBottomY);
  const raw = faceHeight > 0 ? chinHeight / faceHeight : 0;
  const ideal = getIdealRange("chin-height-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
