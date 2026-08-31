import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { lm, signedTiltAngle } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Canthal Tilt — clinical angle of the palpebral fissure for the viewer-left
 * eye, measured **relative to the inter-inner-canthal axis** (head-roll
 * invariant). Positive = outer canthus elevated above the inter-medial line
 * toward the forehead.
 *
 * Source: Bashour 2007. 93% of subjects preferred positive tilt.
 * Ideal: +4° to +7° (male), +4° to +8° (female).
 *
 * Landmarks (MediaPipe 468):
 * - 33  outer canthus, viewer-left eye
 * - 133 inner canthus, viewer-left eye
 * - 362 inner canthus, viewer-right eye (reference axis endpoint)
 * - 10  forehead apex (up-reference)
 *
 * Earlier versions of this metric used `atan2(dy, dx)` against the image
 * horizontal, which conflated head roll with the canthal tilt — a photo
 * with a 20° head tilt would report a 20° + true-tilt canthal value.
 * Using the inter-inner-canthal axis as reference removes that artefact.
 */
export function calculateCanthalTilt(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const outer = lm(landmarks, LANDMARK.leftOuterCanthus);
  const inner = lm(landmarks, LANDMARK.leftInnerCanthus);
  const otherInner = lm(landmarks, LANDMARK.rightInnerCanthus);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const raw = signedTiltAngle(inner, outer, inner, otherInner, forehead);
  const ideal = getIdealRange("canthal-tilt", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
