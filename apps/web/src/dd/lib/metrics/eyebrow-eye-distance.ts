import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Eyebrow-Eye Distance — face-frame vertical distance from brow apex
 * to upper eyelid, normalized by face height.
 *
 * Source: Farkas anthropometric norms; aesthetic surgery references.
 * Female ideal trends higher (more arched, higher-set brow).
 *
 * Face-frame y so head roll in the photo doesn't shrink the gap — see
 * geometry.ts. The brow apex and upper eyelid are roughly vertically
 * stacked but offset slightly in x; projection onto the face-vertical
 * axis is the right measurement.
 *
 * Brow apex: 105 (viewer-left brow mid)
 * Eye top:   159 (viewer-left upper eyelid mid)
 * Face height: forehead (10) → chin (152)
 */
export function calculateEyebrowEyeDistance(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const brow = lm(landmarks, LANDMARK.leftBrowApex);
  const eyeTop = lm(landmarks, LANDMARK.leftUpperLid);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const browY = faceFrameY(brow, forehead, chin);
  const eyeY = faceFrameY(eyeTop, forehead, chin);
  const gap = Math.abs(eyeY - browY);
  const faceHeight = dist(forehead, chin);
  const raw = faceHeight > 0 ? gap / faceHeight : 0;
  const ideal = getIdealRange("eyebrow-eye-distance", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
