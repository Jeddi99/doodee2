import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameCoords, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Lower Lip Protrusion (side) — signed forward offset of the lower-lip
 * bottom (17) from the subnasale (2), in the **face's own frame**,
 * normalized by face height. Head-roll invariant.
 *
 * Sibling of `upper-lip-protrusion-side`; together they characterize
 * lip-protrusion balance in profile.
 */
export function calculateLowerLipProtrusionSide(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const lipBottom = lm(landmarks, LANDMARK.lowerLipBottom);
  const tip = lm(landmarks, LANDMARK.noseTip);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const { forward } = faceFrameCoords(
    lipBottom,
    subnasale,
    forehead,
    chin,
    tip
  );
  const faceHeight = dist(forehead, chin);
  const raw = faceHeight > 0 ? forward / faceHeight : 0;
  const ideal = getIdealRange("lower-lip-protrusion-side", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
