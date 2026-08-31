import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Lip Corner Tilt — vertical offset between the mouth corners and the
 * mouth-center horizontal line, expressed as a face-frame fraction.
 *
 * Positive = corners pulled UP (slight resting smile / "Mona Lisa")
 * Zero = neutral / flat
 * Negative = corners pulled DOWN ("frown line" / aging marker)
 *
 *   raw = (centerY - avgCornerY) / faceHeight
 *
 * Where center = cupid's bow Y position and corners = mean of
 * (leftMouthCorner.y, rightMouthCorner.y), all projected onto the
 * face vertical axis for roll invariance.
 *
 * Distinct from `mouth-corner-tilt` (which signed-projects corner
 * vs lip-line midpoint) — this one uses cupid's bow as the reference,
 * giving a different anatomical signal (corners vs central lip apex
 * rather than corners vs midline).
 *
 * Category: `dimorphism` (resting "Mona Lisa" smile reads
 * approachable / feminine; corners-down reads stern / aged).
 *
 * Approximated ideal — most resting faces are near 0 with slight
 * positive bias the youthful target.
 */
export function calculateLipCornerTilt(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftCorner = lm(landmarks, LANDMARK.leftMouthCorner);
  const rightCorner = lm(landmarks, LANDMARK.rightMouthCorner);
  const cupidsBow = lm(landmarks, LANDMARK.cupidsBow);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);

  // Project all onto face vertical axis (roll-invariant)
  const leftY = faceFrameY(leftCorner, forehead, chin);
  const rightY = faceFrameY(rightCorner, forehead, chin);
  const cupidY = faceFrameY(cupidsBow, forehead, chin);

  const avgCornerY = (leftY + rightY) / 2;
  // Face height in face-frame = 1.0 by construction (forehead = 0, chin = 1)
  // So the raw offset is already in face-fraction units.
  // Positive = corners above cupid's bow line = pulled UP
  const raw = cupidY - avgCornerY;

  const ideal = getIdealRange("lip-corner-tilt", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
