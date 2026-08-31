import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm, midpoint } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Cupids Bow Height — vertical rise of the philtral peak (cupids bow,
 * landmark 0) above the line between the two mouth corners, normalized
 * to face height. Larger positive value = more defined upper-lip arch.
 *
 * Head-roll-invariant: distances projected on the face-vertical axis
 * (forehead → chin) rather than image-y.
 *
 * Landmarks: 0 (cupids bow), 61 / 291 (mouth corners), 10 / 152 (face
 * top / bottom for face frame + scale).
 */
export function calculateCupidsBowHeight(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const cupids = lm(landmarks, LANDMARK.cupidsBow);
  const cornerL = lm(landmarks, LANDMARK.leftMouthCorner);
  const cornerR = lm(landmarks, LANDMARK.rightMouthCorner);
  const top = lm(landmarks, LANDMARK.foreheadApex);
  const bot = lm(landmarks, LANDMARK.chin);
  const cornerMid = midpoint(cornerL, cornerR);
  const yCupids = faceFrameY(cupids, top, bot);
  const yCorner = faceFrameY(cornerMid, top, bot);
  const faceHeight = faceFrameY(bot, top, bot);
  const raw = faceHeight > 0 ? (yCorner - yCupids) / faceHeight : 0;
  const ideal = getIdealRange("cupids-bow-height", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
