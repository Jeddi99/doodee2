import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Mouth-to-Chin Distance Ratio — vertical span from the lower lip's
 * bottom to the chin, projected on the face-vertical axis and
 * normalized to face height. Balances the lower-lower-third — too
 * short = squished chin; too long = elongated lower face.
 *
 * Landmarks: 17 (lower-lip bottom), 152 (chin), 10 (forehead apex).
 */
export function calculateMouthChinDistanceRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const lipBot = lm(landmarks, LANDMARK.lowerLipBottom);
  const chin = lm(landmarks, LANDMARK.chin);
  const top = lm(landmarks, LANDMARK.foreheadApex);
  const bot = chin;
  const span = faceFrameY(chin, top, bot) - faceFrameY(lipBot, top, bot);
  const faceHeight = faceFrameY(bot, top, bot);
  const raw = faceHeight > 0 ? span / faceHeight : 0;
  const ideal = getIdealRange("mouth-chin-distance-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
