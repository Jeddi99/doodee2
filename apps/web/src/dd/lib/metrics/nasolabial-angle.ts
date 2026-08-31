import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { angleDeg, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Nasolabial Angle — angle at subnasale between columella tangent
 * (toward nose tip) and upper-lip tangent (toward vermillion border),
 * measured from a profile photo.
 *
 * Source: Powell & Humphreys 1984; cephalometric norms.
 * Ideal: 90°–100° (male), 100°–110° (female).
 *
 * Vertex: subnasale (2)
 * Arms:   nose tip (1) — proxy for columella tangent
 *         upper-lip top (13) — proxy for upper-lip tangent
 *
 * Side-view metric — requires a profile photo.
 */
export function calculateNasolabialAngle(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const subnasale = lm(landmarks, LANDMARK.subnasale);
  const tip = lm(landmarks, LANDMARK.noseTip);
  const lipTop = lm(landmarks, LANDMARK.upperLipTop);
  const raw = angleDeg(tip, subnasale, lipTop);
  const ideal = getIdealRange("nasolabial-angle", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "°" };
}
