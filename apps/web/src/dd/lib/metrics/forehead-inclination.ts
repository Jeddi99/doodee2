import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { angleFromFaceAxis, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Forehead Inclination — angle of the forehead segment (apex 10 →
 * glabella 6) from the **face-vertical axis** (apex 10 → chin 152).
 * Larger = more slope-back forehead; smaller = vertical forehead.
 *
 * Face-frame computation: head-roll invariant — a side-profile photo
 * where the head is tilted in the camera doesn't change the reported
 * inclination.
 *
 * Source: classical orthognathic profile literature; ideal 5–20°.
 */
export function calculateForeheadInclination(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const apex = lm(landmarks, LANDMARK.foreheadApex);
  const glabella = lm(landmarks, LANDMARK.glabella);
  const chin = lm(landmarks, LANDMARK.chin);
  const raw = angleFromFaceAxis(apex, glabella, apex, chin);
  const ideal = getIdealRange("forehead-inclination", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
