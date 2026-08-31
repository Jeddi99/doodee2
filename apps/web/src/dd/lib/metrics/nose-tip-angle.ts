import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { angleDeg, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Nose Tip Angle (front view) — angle at the nasal tip between the two
 * alars (∠ alarL — noseTip — alarR). Sharper angle = more defined,
 * narrower tip; wider angle = bulbous tip or wide nasal base.
 *
 * Universal ideal ~70-90°; Asian range trends slightly wider (anatomically
 * broader alar base).
 *
 * Landmarks: 1 (nose tip), 98 (left alar), 327 (right alar).
 */
export function calculateNoseTipAngle(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const tip = lm(landmarks, LANDMARK.noseTip);
  const alarL = lm(landmarks, LANDMARK.leftAlar);
  const alarR = lm(landmarks, LANDMARK.rightAlar);
  const raw = angleDeg(alarL, tip, alarR);
  const ideal = getIdealRange("nose-tip-angle", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
