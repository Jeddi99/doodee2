import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Brow Arch Height — perpendicular distance from the brow apex to the
 * line connecting the brow's inner and outer endpoints, normalized to
 * the inter-canthal distance. Higher = more arched / sculpted brow;
 * lower = flatter brow.
 *
 * Computed on the left side and assumed mirror-symmetric for the right
 * (brow-symmetry metric covers L/R discrepancy separately).
 *
 * Landmarks: 107 (inner brow), 105 (apex), 70 (outer brow); 133 / 362
 * (inner canthi for scale).
 */
export function calculateBrowArchHeight(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const inner = lm(landmarks, LANDMARK.leftBrowInner);
  const apex = lm(landmarks, LANDMARK.leftBrowApex);
  const outer = lm(landmarks, LANDMARK.leftBrowOuter);
  const innerL = lm(landmarks, LANDMARK.leftInnerCanthus);
  const innerR = lm(landmarks, LANDMARK.rightInnerCanthus);
  const dx = outer.x - inner.x;
  const dy = outer.y - inner.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  let perp = 0;
  if (len > 0) {
    perp = Math.abs(
      ((outer.y - inner.y) * apex.x -
        (outer.x - inner.x) * apex.y +
        outer.x * inner.y -
        outer.y * inner.x) /
        len
    );
  }
  const scale = dist(innerL, innerR);
  const raw = scale > 0 ? perp / scale : 0;
  const ideal = getIdealRange("brow-arch-height", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
