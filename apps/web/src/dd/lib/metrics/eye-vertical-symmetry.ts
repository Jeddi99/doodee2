import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Eye Vertical Symmetry — height difference between the two eyes
 * measured on the face vertical axis, normalized by inter-pupillary
 * distance for scale invariance.
 *
 *   raw = |leftEyeY - rightEyeY| / interPupillary
 *
 * Higher raw = more vertical mismatch (one eye sits higher). Lower =
 * more symmetric. Roll-invariant via `faceFrameY` projection onto the
 * forehead→chin axis.
 *
 * Distinct from `eye-symmetry` (which does mirror-distance scoring
 * via `pairSymmetryAcrossLine`) by being specifically about the
 * **vertical** offset — useful for catching subtle "one eye droops"
 * cases that mirror symmetry can miss.
 *
 * Category: `symmetry`.
 *
 * Ideal: < 0.05 (5% of IPD = barely perceptible). > 0.10 = visible.
 */
export function calculateEyeVerticalSymmetry(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftOuter = lm(landmarks, LANDMARK.leftOuterCanthus);
  const leftInner = lm(landmarks, LANDMARK.leftInnerCanthus);
  const rightInner = lm(landmarks, LANDMARK.rightInnerCanthus);
  const rightOuter = lm(landmarks, LANDMARK.rightOuterCanthus);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);

  // Eye center = mean of (outer, inner) per side
  const leftCenter = {
    x: (leftOuter.x + leftInner.x) / 2,
    y: (leftOuter.y + leftInner.y) / 2,
    z: 0,
  };
  const rightCenter = {
    x: (rightOuter.x + rightInner.x) / 2,
    y: (rightOuter.y + rightInner.y) / 2,
    z: 0,
  };

  // Project onto face vertical axis for roll invariance
  const leftY = faceFrameY(leftCenter, forehead, chin);
  const rightY = faceFrameY(rightCenter, forehead, chin);

  // Normalize by inter-pupillary distance (between eye centers)
  const ipd = dist(leftCenter, rightCenter);
  if (ipd === 0) {
    const ideal = getIdealRange("eye-vertical-symmetry", options);
    return { raw: 0, score: 10, ideal, unit: "" };
  }
  const raw = Math.abs(leftY - rightY) / ipd;
  const ideal = getIdealRange("eye-vertical-symmetry", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
