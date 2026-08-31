import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm, pairSymmetryAcrossLine } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";
import { gonionLooksBelowChin } from "./jaw-validation";

/**
 * Jaw Symmetry — how closely the left and right gonion (jaw angle)
 * points mirror each other across the face-vertical axis. Roll-invariant.
 *
 * Sanity check: if MediaPipe placed either gonion below the chin (a
 * geometric impossibility for a real face — typically happens when the
 * shirt-collar contrast pulls the lower face contour landmark off the
 * jaw), return a sentinel out-of-bounds value so the pipeline flags
 * the metric and excludes it from aggregation.
 */
export function calculateJawSymmetry(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const left = lm(landmarks, LANDMARK.leftGonion);
  const right = lm(landmarks, LANDMARK.rightGonion);
  const forehead = lm(landmarks, LANDMARK.foreheadApex);
  const chin = lm(landmarks, LANDMARK.chin);
  const cheekL = lm(landmarks, LANDMARK.leftCheek);
  const cheekR = lm(landmarks, LANDMARK.rightCheek);
  const ideal = getIdealRange("jaw-symmetry", options);
  if (gonionLooksBelowChin(left, right, chin, forehead)) {
    // Sentinel out of sanity bound [0, 1] → flagged by computeAll.
    return { raw: -1, score: 0, ideal, unit: "" };
  }
  const faceWidth = dist(cheekL, cheekR);
  const raw = pairSymmetryAcrossLine(left, right, forehead, chin, faceWidth);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
