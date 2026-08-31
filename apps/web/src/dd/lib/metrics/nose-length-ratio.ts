import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Nose Length Ratio — vertical span from the sellion (nasion / between
 * the brows) down to the subnasale, projected on the face-vertical axis
 * and normalized to total face height (forehead apex → chin).
 *
 * Classical canon places nose length near 1/3 of face height (Da Vinci
 * rule of thirds: brow → subnasale ≈ one third). Distinct from
 * facial-thirds which checks the upper-third boundary.
 *
 * Landmarks: 168 (sellion), 2 (subnasale), 10 (forehead apex), 152 (chin).
 */
export function calculateNoseLengthRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const sellion = lm(landmarks, LANDMARK.sellion);
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const top = lm(landmarks, LANDMARK.foreheadApex);
  const bot = lm(landmarks, LANDMARK.chin);
  const noseSpan =
    faceFrameY(subnasale, top, bot) - faceFrameY(sellion, top, bot);
  const faceHeight = faceFrameY(bot, top, bot);
  const raw = faceHeight > 0 ? noseSpan / faceHeight : 0;
  const ideal = getIdealRange("nose-length-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
