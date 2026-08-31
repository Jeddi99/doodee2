import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameCoords, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Upper Lip Protrusion (side) — signed forward offset of the upper-lip
 * top (13) from the subnasale (2), in the **face's own frame**,
 * normalized by face height. Head-roll invariant.
 *
 * Distinct from `lip-e-line` (which uses the Ricketts nose-tip→chin
 * line as reference): this drops a vertical from subnasale in the face
 * frame and measures the lip's forward offset.
 *
 * Positive = lip in front of the sn-vertical (protrudent).
 */
export function calculateUpperLipProtrusionSide(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const lip = lm(landmarks, LANDMARK.upperLipTop);
  const tip = lm(landmarks, LANDMARK.noseTip);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const { forward } = faceFrameCoords(lip, subnasale, forehead, chin, tip);
  const faceHeight = dist(forehead, chin);
  const raw = faceHeight > 0 ? forward / faceHeight : 0;
  const ideal = getIdealRange("upper-lip-protrusion-side", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
