import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameY, lm, midpoint } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Mouth-Corner Tilt — face-frame vertical offset of mouth corners from
 * upper-lip center. Signed: positive = corners higher than center
 * (subtle smile), negative = corners lower (downturned). Normalized by
 * face height.
 *
 * Source: aesthetic dimorphism; female ideal trends slightly upturned.
 *
 * Face-frame y so the sign reflects "higher / lower in the face" not
 * "higher / lower in the image" — head roll in the photo no longer
 * flips a slight smile into a frown.
 *
 * Average of both corners (61 left, 291 right)
 * Center: upper-lip top (13)
 */
export function calculateMouthCornerTilt(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const cornerL = lm(landmarks, LANDMARK.leftMouthCorner);
  const cornerR = lm(landmarks, LANDMARK.rightMouthCorner);
  const center = lm(landmarks, LANDMARK.upperLipTop);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const cornerMid = midpoint(cornerL, cornerR);
  const centerY = faceFrameY(center, forehead, chin);
  const cornerY = faceFrameY(cornerMid, forehead, chin);
  const faceHeight = dist(forehead, chin);
  const raw = faceHeight > 0 ? (centerY - cornerY) / faceHeight : 0;
  const ideal = getIdealRange("mouth-corner-tilt", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
