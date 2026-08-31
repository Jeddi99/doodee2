import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { lm, signedTiltAngle } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Right Canthal Tilt — sibling of `canthal-tilt` for the viewer-right eye.
 * Same head-roll-invariant computation: tilt is measured relative to the
 * inter-inner-canthal axis (not the image horizontal), so a head tilted
 * 20° in the photo doesn't inflate the reported canthal tilt by 20°.
 *
 * Source / ideal range mirror the left-eye metric (Bashour 2007).
 *
 * Inner canthus: 362, outer canthus: 263.
 * Reference axis: 362 → 133 (inter-inner-canthal).
 * Up-reference: 10 (forehead apex).
 */
export function calculateRightCanthalTilt(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const outer = lm(landmarks, LANDMARK.rightOuterCanthus);
  const inner = lm(landmarks, LANDMARK.rightInnerCanthus);
  const otherInner = lm(landmarks, LANDMARK.leftInnerCanthus);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const raw = signedTiltAngle(inner, outer, inner, otherInner, forehead);
  const ideal = getIdealRange("right-canthal-tilt", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
