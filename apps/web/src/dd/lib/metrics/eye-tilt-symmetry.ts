import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { lm, signedTiltAngle } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Eye Tilt Symmetry — absolute difference between the canthal-tilt
 * angles of the left and right eyes. Smaller = more symmetric eye
 * angulation. Returned as a positive value in degrees; 0 is perfect.
 *
 * Both tilts measured against the inter-canthal axis with the forehead
 * apex as the up-reference, so the result is roll-invariant.
 *
 * Landmarks: 33 / 133 (left canthi), 263 / 362 (right canthi), 10
 * (forehead apex as up-reference).
 */
export function calculateEyeTiltSymmetry(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftInner = lm(landmarks, LANDMARK.leftInnerCanthus);
  const rightInner = lm(landmarks, LANDMARK.rightInnerCanthus);
  const leftOuter = lm(landmarks, LANDMARK.leftOuterCanthus);
  const rightOuter = lm(landmarks, LANDMARK.rightOuterCanthus);
  const up = lm(landmarks, LANDMARK.foreheadApex);
  const tiltL = signedTiltAngle(
    leftInner,
    leftOuter,
    leftInner,
    rightInner,
    up
  );
  const tiltR = signedTiltAngle(
    rightInner,
    rightOuter,
    rightInner,
    leftInner,
    up
  );
  const raw = Math.abs(tiltL - tiltR);
  const ideal = getIdealRange("eye-tilt-symmetry", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
