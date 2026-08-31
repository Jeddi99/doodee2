import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { angleFromFaceAxis, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Nasal Dorsum Angle — angle of the nose-dorsum segment (glabella 6 →
 * nose tip 1) from the **face-vertical axis** (apex 10 → chin 152).
 * Larger = nose projects more forward; smaller = flatter dorsum.
 * Head-roll invariant.
 *
 * Source: rhinoplasty cephalometric literature. Asian range tightened
 * slightly (flatter dorsum typical).
 */
export function calculateNasalDorsumAngle(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const glabella = lm(landmarks, LANDMARK.glabella);
  const tip = lm(landmarks, LANDMARK.noseTip);
  const apex = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const raw = angleFromFaceAxis(glabella, tip, apex, chin);
  const ideal = getIdealRange("nasal-dorsum-angle", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
