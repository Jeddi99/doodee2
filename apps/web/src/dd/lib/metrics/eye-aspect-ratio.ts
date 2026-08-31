import type { Landmarks, MetricOptions, MetricResult } from "@/types";
import { getIdealRange } from "@/data/ideal-ranges";
import { dist, lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Eye Aspect Ratio (EAR) — Soukupová & Čech 2016, "Real-Time Eye Blink
 * Detection using Facial Landmarks".
 *
 *   EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 *
 * Where p1..p6 are 6 points around the eye:
 *   p1, p4 — outer + inner canthi (horizontal axis)
 *   p2, p3 — two points on the upper lid
 *   p5, p6 — two points on the lower lid (mirroring p3, p2)
 *
 * EAR is industry-standard for blink detection but also a robust
 * measure of eye openness in general. Distinct from
 * `palpebral-fissure-aspect` which uses a single vertical pair —
 * EAR averages two vertical pairs for noise-robustness against
 * landmark jitter on a single point.
 *
 * Both-eyes average is taken. Ideal: ~0.30 (well-open). Closed eyes
 * dip below 0.12; very wide-open >0.40 (often surprised expression).
 *
 * Landmark indices used (MediaPipe 478, viewer-perspective):
 *   Left eye:  33 (outer) | 160, 158 (upper) | 144, 153 (lower) | 133 (inner)
 *   Right eye: 263 (outer) | 387, 385 (upper) | 380, 373 (lower) | 362 (inner)
 *
 * The exact MediaPipe landmark indices around the eyes were verified
 * against the FACEMESH_LEFT_EYE / FACEMESH_RIGHT_EYE sets — these 6
 * points per eye form the canonical EAR hexagon.
 */
export function calculateEyeAspectRatio(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftEAR = singleEyeEAR(landmarks, {
    outer: 33,
    inner: 133,
    upper1: 160,
    upper2: 158,
    lower1: 144,
    lower2: 153,
  });
  const rightEAR = singleEyeEAR(landmarks, {
    outer: 263,
    inner: 362,
    upper1: 387,
    upper2: 385,
    lower1: 380,
    lower2: 373,
  });
  const raw = (leftEAR + rightEAR) / 2;
  const ideal = getIdealRange("eye-aspect-ratio", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}

interface EyeSpec {
  outer: number;
  inner: number;
  upper1: number;
  upper2: number;
  lower1: number;
  lower2: number;
}

function singleEyeEAR(landmarks: Landmarks, eye: EyeSpec): number {
  const p1 = lm(landmarks, eye.outer);
  const p4 = lm(landmarks, eye.inner);
  const p2 = lm(landmarks, eye.upper1);
  const p3 = lm(landmarks, eye.upper2);
  const p6 = lm(landmarks, eye.lower1);
  const p5 = lm(landmarks, eye.lower2);
  const horiz = dist(p1, p4);
  if (horiz === 0) return 0;
  return (dist(p2, p6) + dist(p3, p5)) / (2 * horiz);
}
