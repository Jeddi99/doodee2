import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { angleDeg, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Facial Convexity — angle at the nose tip formed by glabella–tip–chin,
 * measured from a profile photo.
 *
 * Source: cephalometric norms (Steiner / Ricketts).
 * A perfectly straight profile is 180°; convex profiles approach 165–175°.
 *
 * Vertex: nose tip (1)
 * Arms:   glabella (6), chin (152)
 *
 * Side-view metric — requires a profile photo.
 */
export function calculateFacialConvexity(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const tip = lm(landmarks, LANDMARK.noseTip);
  const glabella = lm(landmarks, LANDMARK.glabella);
  const chin = lm(landmarks, LANDMARK.chin);
  const raw = angleDeg(glabella, tip, chin);
  const ideal = getIdealRange("facial-convexity", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
