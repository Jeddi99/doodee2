import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Upper Lid Show — vertical gap from the upper eyelid margin to the
 * brow apex, normalized by face height. A larger gap = more "open"
 * brow-eye region (less hooded, more youthful); a smaller gap suggests
 * upper-lid hooding or low brow position.
 *
 * Distinct from `eyebrow-eye-distance` which measures brow apex to the
 * canthus line — this metric uses the upper lid margin specifically,
 * so it captures hooded-lid changes that don't move the canthus.
 *
 * Landmarks: 159 (left upper lid margin), 105 (left brow apex), 10 / 152
 * (face frame).
 */
export function calculateUpperLidShow(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const lid = lm(landmarks, LANDMARK.leftUpperLid);
  const brow = lm(landmarks, LANDMARK.leftBrowApex);
  const top = lm(landmarks, LANDMARK.foreheadApex);
  const bot = lm(landmarks, LANDMARK.chin);
  const gap = faceFrameY(lid, top, bot) - faceFrameY(brow, top, bot);
  const faceHeight = faceFrameY(bot, top, bot);
  const raw = faceHeight > 0 ? gap / faceHeight : 0;
  const ideal = getIdealRange("upper-lid-show", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
