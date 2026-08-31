import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Nasal Bridge Width Ratio — width at the narrowest bridge point
 * divided by alar base width.
 *
 *   ratio = bridgeWidth / alarWidth
 *
 * Bridge landmarks: 193 (left) and 417 (right) — narrowest point of
 * the nasal bridge, just below the medial canthi.
 *
 * Alar base: existing `leftAlar` (98) / `rightAlar` (327) — the
 * widest point of the nose at the nostrils.
 *
 * Higher ratio = wider / flatter nasal bridge. Lower ratio = narrow,
 * defined bridge (typical "aquiline" or refined nose shape).
 *
 * Asian populations trend higher (less defined bridge) — calibration
 * shifts the ideal range accordingly.
 *
 * Ideal:
 * - Universal: 0.35-0.50
 * - Asian: 0.40-0.55 (higher tolerance, anatomically wider)
 *
 * Sources: anthropometric estimates derived from Farkas + Hwang. The
 * specific bridge-width measurement is not in classical cephalometrics
 * but is widely used in rhinoplasty consultation.
 */
export function calculateNasalBridgeWidth(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const bridgeLeft = lm(landmarks, 193);
  const bridgeRight = lm(landmarks, 417);
  const alarLeft = lm(landmarks, LANDMARK.leftAlar);
  const alarRight = lm(landmarks, LANDMARK.rightAlar);
  const bridge = dist(bridgeLeft, bridgeRight);
  const alar = dist(alarLeft, alarRight);
  if (alar === 0) {
    const ideal = getIdealRange("nasal-bridge-width", options);
    return { raw: 0, score: 0, ideal, unit: "x" };
  }
  const raw = bridge / alar;
  const ideal = getIdealRange("nasal-bridge-width", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
