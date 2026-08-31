import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";
import { gonionLooksBelowChin } from "./jaw-validation";

/**
 * Jaw-Width-to-Cheek Ratio — bigonial width ÷ bizygomatic width.
 *
 * Sanity check: if MediaPipe places gonion below chin (shirt-collar
 * mis-detection), return sentinel out-of-bounds so the pipeline flags
 * the metric — the bigonial width measured at the collar is meaningless.
 */
export function calculateJawWidthToCheekRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const goL = lm(landmarks, LANDMARK.leftGonion);
  const goR = lm(landmarks, LANDMARK.rightGonion);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const chin = lm(landmarks, LANDMARK.chin);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const ideal = getIdealRange("jaw-width-to-cheek-ratio", options);
  if (gonionLooksBelowChin(goL, goR, chin, forehead)) {
    // 2.0 is outside sanity bound [0.4, 1.2] → flagged.
    return { raw: 2.0, score: 0, ideal, unit: "x" };
  }
  const jaw = dist(goL, goR);
  const cheek = dist(cheekL, cheekR);
  const raw = cheek > 0 ? jaw / cheek : 0;
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "x" };
}
