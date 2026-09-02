/**
 * Turning the server's score distribution into an SVG path.
 *
 * The shape itself is `score_distribution.py`'s work: a kernel density estimate of the scores this
 * deployment actually holds, one per person, with the sample size attached. Nothing here smooths,
 * fits or extrapolates it — the only job is mapping `{score, density}` pairs into whatever box the
 * caller draws in, so that two screens plotting the same payload cannot draw two different curves.
 *
 * Shared because they do plot the same payload: the assessment screen's distribution chart and the
 * overview card's curve both read `distribution` off `GET /scans/<id>/assessment/`. The overview
 * card used to draw a fixed decorative bell instead, which looked like a population and was not
 * one — the exact fiction the server-side module was written to avoid.
 */

/** One point of `distribution.curve`, as `score_distribution.density_curve` emits it. */
export type DensityPoint = { score: number; density: number };

/** `distribution_of()`'s answer. Every field is optional because a redacted or empty one is normal. */
export type Distribution = {
  curve?: DensityPoint[];
  histogram?: { from: number; to: number; count: number }[];
  /** How many people this score was *ranked against* — the reader excluded. */
  sample_size?: number;
  /** How many scores the curve was *drawn from* — the reader included. */
  drawn_sample_size?: number;
  /** How many of the drawn scores are seeded placeholders rather than people. */
  synthetic_sample_size?: number;
  reliable?: boolean;
  reliable_at?: number;
  percentile?: number | null;
  mean?: number | null;
  includes_you?: boolean;
};

/**
 * Where the drawing goes, in the caller's own viewBox units.
 *
 * `baseline` is where zero density sits and `peak` is where the tallest point of the curve sits,
 * so a box with `peak` above `baseline` draws upward and one with it below draws downward. The
 * curve is normalised to its own maximum rather than to an absolute density, because densities
 * from a two-person sample and a two-hundred-person one are not on the same scale and plotting
 * them against a fixed axis would make one of the two invisible.
 */
export type CurveBox = { left: number; right: number; baseline: number; peak: number };

/** The 0–100 score axis mapped across the box. */
export const scoreX = (score: number, box: CurveBox): number =>
  box.left + (Math.min(100, Math.max(0, score)) / 100) * (box.right - box.left);

/**
 * The curve as an SVG path, or null when there is no curve to draw.
 *
 * Null rather than a flat line along the baseline: a flat line reads as "everybody scored zero"
 * where the truth is "there is nobody to compare against yet", and the two must not look alike.
 */
export function curvePath(curve: DensityPoint[] | undefined, box: CurveBox): string | null {
  if (!curve?.length) return null;
  const peak = Math.max(...curve.map((point) => point.density));
  if (!Number.isFinite(peak) || peak <= 0) return null;
  const height = box.baseline - box.peak;
  return curve
    .map((point, index) => {
      const y = box.baseline - (point.density / peak) * height;
      return `${index ? 'L' : 'M'}${round(scoreX(point.score, box))},${round(y)}`;
    })
    .join(' ');
}

/** Two decimals is finer than any screen renders and keeps the path attribute readable. */
const round = (value: number) => Math.round(value * 100) / 100;
