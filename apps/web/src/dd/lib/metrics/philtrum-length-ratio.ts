import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Philtrum Length Ratio — span from subnasale to the upper-lip top
 * (philtrum), projected on the face-vertical axis and normalized to
 * face height. Distinct from `philtrum-chin-ratio` (philtrum vs chin
 * within the lower third) — this metric anchors philtrum directly to
 * total face height. Higher = elongated philtrum (a marker of aging or
 * skeletal long lower face).
 *
 * Landmarks: 2 (subnasale), 13 (upper-lip top), 10 / 152 (face frame).
 */
export function calculatePhiltrumLengthRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const lipTop = lm(landmarks, LANDMARK.upperLipTop);
  const top = lm(landmarks, LANDMARK.foreheadApex);
  const bot = lm(landmarks, LANDMARK.chin);
  const span =
    faceFrameY(lipTop, top, bot) - faceFrameY(subnasale, top, bot);
  const faceHeight = faceFrameY(bot, top, bot);
  const raw = faceHeight > 0 ? span / faceHeight : 0;
  const ideal = getIdealRange("philtrum-length-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
