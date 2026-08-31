import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, faceFrameY, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Forehead Height Ratio — vertical distance from forehead apex to
 * brow line, divided by total face height.
 *
 *   ratio = foreheadHeight / faceHeight
 *
 * Forehead height = `forehead apex (10)` → brow-line midpoint (mean
 * of left + right brow apex y), measured on the face vertical axis
 * for roll invariance.
 *
 * Face height = forehead apex → chin total distance.
 *
 * Distinct from `facial-thirds` (which checks if the three thirds are
 * equal). This one specifically isolates the **upper third** as its
 * own metric — useful because forehead size has a strong effect on
 * upper-face balance and gendered facial structure (high forehead
 * reads more masculine).
 *
 * Ideal: ~0.30-0.36 universal. Male trend slightly higher (taller
 * forehead) — but extremes either way penalize.
 *
 * Category: `harmony`.
 */
export function calculateForeheadHeightRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const leftBrow = lm(landmarks, LANDMARK.leftBrowApex);
  const rightBrow = lm(landmarks, LANDMARK.rightBrowApex);

  // Brow midpoint
  const browMid = {
    x: (leftBrow.x + rightBrow.x) / 2,
    y: (leftBrow.y + rightBrow.y) / 2,
    z: 0,
  };

  const totalHeight = dist(forehead, chin);
  if (totalHeight === 0) {
    const ideal = getIdealRange("forehead-height-ratio", options);
    return { raw: 0, score: 0, ideal, unit: "" };
  }
  // Roll-invariant: project onto forehead→chin axis
  const foreheadY = faceFrameY(forehead, forehead, chin);
  const browY = faceFrameY(browMid, forehead, chin);
  const foreheadHeight = Math.abs(browY - foreheadY);
  const raw = foreheadHeight / totalHeight;
  const ideal = getIdealRange("forehead-height-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
