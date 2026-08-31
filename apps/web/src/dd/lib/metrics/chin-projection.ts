import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameCoords, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Chin Projection — signed forward offset of the chin (152) from the
 * subnasale (2), measured in the **face's own frame** (forward direction
 * defined by nose tip relative to face midline; vertical axis from
 * forehead apex to chin). Normalized by face height. Head-roll invariant.
 *
 * Source: cephalometric norms (Steiner / Holdaway).
 * Positive = chin projects forward of subnasale; negative = retrognathic.
 */
export function calculateChinProjection(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const chin = lm(landmarks, LANDMARK.chin);
  const tip = lm(landmarks, LANDMARK.noseTip);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const { forward } = faceFrameCoords(chin, subnasale, forehead, chin, tip);
  const faceHeight = dist(forehead, chin);
  const raw = faceHeight > 0 ? forward / faceHeight : 0;
  const ideal = getIdealRange("chin-projection", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
