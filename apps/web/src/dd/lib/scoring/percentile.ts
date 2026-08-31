import type { MetricKey } from "@/types";
import { METRIC_NORMS } from "@/data/metric-norms";

/**
 * Approximate standard-normal CDF using the Abramowitz & Stegun 26.2.17
 * polynomial approximation. Accurate to ~7.5e-8 absolute — overkill for
 * our user-facing percentile display.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erfApprox =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t) *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * erfApprox);
}

/**
 * Z-score for a raw metric value relative to its population norm. Some
 * metrics have an inherent "best is high" direction (e.g. eye-symmetry
 * where 1.0 is perfect); some have a peak that is the ideal (e.g.
 * canthal-tilt where 5° is preferred but huge tilts in either direction
 * are unusual). For ranking purposes we use the absolute Z so the
 * percentile reflects "how unusual is this value" regardless of
 * direction.
 */
export function metricZ(key: MetricKey, raw: number): number {
  const norm = METRIC_NORMS[key];
  if (!norm || norm.sigma <= 0) return 0;
  return (raw - norm.mean) / norm.sigma;
}

/**
 * Percentile of `raw` in the metric's population. Returns 0-100.
 * For symmetric "ideal-is-peak" metrics, the percentile here means the
 * cohort percentile, not the attractiveness percentile.
 */
export function metricPercentile(key: MetricKey, raw: number): number {
  // Phase 192v — non-finite guard. computeAll flags a degenerate metric by
  // zeroing `score` but leaves `raw` as NaN/Infinity; MetricDetailDialog
  // still calls metricPercentile(key, raw), so an unguarded raw renders
  // "NaN%". Return the neutral 50th percentile instead.
  if (!Number.isFinite(raw)) return 50;
  const z = metricZ(key, raw);
  const p = normalCdf(z) * 100;
  return Math.max(0.1, Math.min(99.9, p));
}

/**
 * Overall percentile — maps the 0-10 overall score onto a standard
 * normal where mean=5.5 and sigma=1.5. So 7.0 → ~84th percentile, 8.5 →
 * ~98th, 4.0 → ~16th. Calibrated empirically to feel right at the
 * tails (i.e. a 9.0 doesn't claim to be 99.99th percentile).
 */
export function overallPercentile(overall: number): number {
  const z = (overall - 5.5) / 1.5;
  return Math.max(0.1, Math.min(99.9, normalCdf(z) * 100));
}

export { normalCdf };
