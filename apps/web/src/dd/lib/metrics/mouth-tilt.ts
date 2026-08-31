import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { lm, signedTiltAngle } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Mouth Tilt — absolute tilt of the mouth-corner line relative to the
 * inter-canthal axis (in degrees). Different from `mouth-symmetry`
 * (which measures positional mirror across midline). This catches
 * lateral mouth-line slope — uneven smile elevation that mirror-test
 * may not flag.
 *
 * Head-roll-invariant: the inter-canthal axis is the reference, not
 * image-horizontal.
 *
 * Landmarks: 61 / 291 (mouth corners), 33 / 263 (outer canthi as the
 * head-roll reference), 10 (up-ref).
 */
export function calculateMouthTilt(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const cornerL = lm(landmarks, LANDMARK.leftMouthCorner);
  const cornerR = lm(landmarks, LANDMARK.rightMouthCorner);
  const outerL = lm(landmarks, LANDMARK.leftOuterCanthus);
  const outerR = lm(landmarks, LANDMARK.rightOuterCanthus);
  const up = lm(landmarks, LANDMARK.foreheadApex);
  const tilt = signedTiltAngle(cornerL, cornerR, outerL, outerR, up);
  const raw = Math.abs(tilt);
  const ideal = getIdealRange("mouth-tilt", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
