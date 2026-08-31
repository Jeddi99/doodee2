import type { Landmark, Landmarks, MetricOptions, MetricResult } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";
import { getIdealRange } from "@/data/ideal-ranges";
import { lm } from "@/lib/utils/geometry";
import { normalizeScore } from "@/lib/scoring/normalize";

/**
 * Project point `p` onto the line through (`a`, `b`) and return the
 * normalized parameter t such that the projected point is
 * `a + t * (b - a)`. t = 0 → at a, t = 1 → at b, t = 0.5 → midpoint.
 * Roll-invariant — works regardless of head tilt because the projection
 * is computed in 2D along the brow's own axis.
 */
function lineParam(p: Landmark, a: Landmark, b: Landmark): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return 0.5;
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  return (dx * vx + dy * vy) / len2;
}

/**
 * Eyebrow Arch Position — where the highest point of the brow sits
 * along the inner→outer span.
 *
 *   t = ((apex - inner) · (outer - inner)) / |outer - inner|²
 *
 * Calculated per-brow then averaged.
 *
 *   0.5 = arch in the center (flat / straight brow)
 *   0.6-0.7 = lateral arch (peak shifted toward outer end) — Westmore
 *             classic feminine "high arch" position
 *   > 0.75 = very lateral / dropping outer tail
 *
 * Westmore 1974 brow position rules state the ideal arch peak sits
 * at the lateral 2/3 (~0.67) of the brow.
 *
 * Distinct from `brow-arch-height` (which measures HOW HIGH the peak
 * is). This one measures WHERE the peak is along the brow's length.
 *
 * Roll-invariant via vector projection along the brow's own axis
 * (rather than image-x projection, which would bake head roll into
 * the measurement).
 *
 * Category: `eye-area`.
 *
 * Source: Westmore 1974 brow position rules; modern aesthetic
 * brow literature.
 */
export function calculateEyebrowArchPosition(
  landmarks: Landmarks,
  options: MetricOptions
): MetricResult {
  const leftInner = lm(landmarks, LANDMARK.leftBrowInner);
  const leftApex = lm(landmarks, LANDMARK.leftBrowApex);
  const leftOuter = lm(landmarks, LANDMARK.leftBrowOuter);
  const rightInner = lm(landmarks, LANDMARK.rightBrowInner);
  const rightApex = lm(landmarks, LANDMARK.rightBrowApex);
  const rightOuter = lm(landmarks, LANDMARK.rightBrowOuter);

  const leftT = lineParam(leftApex, leftInner, leftOuter);
  const rightT = lineParam(rightApex, rightInner, rightOuter);

  const raw = (leftT + rightT) / 2;
  const ideal = getIdealRange("eyebrow-arch-position", options);
  return { raw, score: normalizeScore(raw, ideal), ideal, unit: "" };
}
