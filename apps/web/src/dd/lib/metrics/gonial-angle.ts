import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { angleDeg, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";
import { gonionLooksBelowChin } from "./jaw-validation";

/**
 * Gonial Angle — jaw angle at the gonion (mandibular angle).
 *
 * Approximated on 2D photo as tragion (preauricular) → gonion → chin.
 * Sanity check: if MediaPipe places gonion below chin (shirt-collar
 * contrast mis-detection), return out-of-bounds sentinel so the pipeline
 * flags the metric.
 */
export function calculateGonialAngle(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const tragion = lm(landmarks, LANDMARK.leftTragion);
  const gonion = lm(landmarks, LANDMARK.leftGonion);
  const rightGonion = lm(landmarks, LANDMARK.rightGonion);
  const chin = lm(landmarks, LANDMARK.chin);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const ideal = getIdealRange("gonial-angle", options);
  if (gonionLooksBelowChin(gonion, rightGonion, chin, forehead)) {
    // 200° is outside sanity bound [80, 160] → flagged.
    return { raw: 200, score: 0, ideal, unit: "°" };
  }
  const raw = angleDeg(tragion, gonion, chin);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
