import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Mouth Aspect Ratio (MAR) — analogous to EAR for the mouth.
 *
 *   MAR = mouthHeight / mouthWidth
 *
 * Where:
 *   width  = distance between the outer mouth corners (61 ↔ 291)
 *   height = vertical span from upper-lip-top (13) to lower-lip-bottom (17)
 *
 * MAR captures "lip volume" in a way that's distinct from
 * `upper-lower-lip-ratio` (which measures the lip thickness ratio) and
 * `lip-fullness` (which measures absolute lip area). MAR tells you
 * whether the lips together are tall vs wide — affects perception of
 * a "fuller" pouty mouth vs a thin wide mouth.
 *
 * Range: typical closed-mouth MAR ~0.30-0.45 (full lips trend higher);
 * speaking / yawning > 0.55.
 *
 * Ideal here is bounded for closed-mouth resting expressions.
 */
export function calculateMouthAspectRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const left = lm(landmarks, LANDMARK.leftMouthCorner);
  const right = lm(landmarks, LANDMARK.rightMouthCorner);
  const top = lm(landmarks, LANDMARK.upperLipTop);
  const bottom = lm(landmarks, LANDMARK.lowerLipBottom);
  const width = dist(left, right);
  if (width === 0) {
    const ideal = getIdealRange("mouth-aspect-ratio", options);
    return { raw: 0, score: 0, ideal, unit: "" };
  }
  const height = Math.abs(top.y - bottom.y);
  const raw = height / width;
  const ideal = getIdealRange("mouth-aspect-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
