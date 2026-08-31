import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Brow-Thickness Symmetry — left vs right brow vertical extent.
 *
 *   ratio = min(leftSpan, rightSpan) / max(leftSpan, rightSpan)
 *
 * For each brow, span = `max(y) − min(y)` across (inner, apex, outer)
 * landmarks. Higher = brow is thicker / has more vertical extent.
 *
 * Then we compare the two spans:
 * - 1.0 = perfect symmetry (both brows same thickness)
 * - 0.85 = one brow noticeably thicker than the other
 * - < 0.7 = pronounced asymmetry, likely uneven grooming or congenital
 *
 * Distinct from `brow-symmetry` (which measures left/right POSITION mirroring)
 * and `eye-tilt-symmetry` (which measures eye-line). This one specifically
 * measures whether the two brows have the same THICKNESS.
 *
 * Category: `symmetry`.
 */
export function calculateBrowThicknessSymmetry(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftInner = lm(landmarks, LANDMARK.leftBrowInner);
  const leftApex = lm(landmarks, LANDMARK.leftBrowApex);
  const leftOuter = lm(landmarks, LANDMARK.leftBrowOuter);
  const rightInner = lm(landmarks, LANDMARK.rightBrowInner);
  const rightApex = lm(landmarks, LANDMARK.rightBrowApex);
  const rightOuter = lm(landmarks, LANDMARK.rightBrowOuter);

  const leftSpan =
    Math.max(leftInner.y, leftApex.y, leftOuter.y) -
    Math.min(leftInner.y, leftApex.y, leftOuter.y);
  const rightSpan =
    Math.max(rightInner.y, rightApex.y, rightOuter.y) -
    Math.min(rightInner.y, rightApex.y, rightOuter.y);

  const max = Math.max(leftSpan, rightSpan);
  if (max === 0) {
    const ideal = getIdealRange("brow-thickness-symmetry", options);
    return { raw: 1, score: 10, ideal, unit: "" };
  }
  const raw = Math.min(leftSpan, rightSpan) / max;
  const ideal = getIdealRange("brow-thickness-symmetry", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
