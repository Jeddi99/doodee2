import type { MetricKey, MetricResult } from "@/types";
import type { Category, ScanResult, SkinResult } from "./computeAll";
import { CATEGORY_WEIGHTS, METRIC_CATEGORY } from "./computeAll";
import { skinAverage } from "./skin-fold";

/**
 * Second-opinion blend weight in the final overall.
 *
 * Phase 27 — see ADR-010. final = geometric × (1 - WEIGHT) + secondOpinion × WEIGHT.
 * Originally 0.3 so geometric still dominates (because the breakdown UI
 * is built on geometric and stays explainable) but second-opinion has
 * enough say to nudge aged / asymmetric / weak-feature scans down.
 *
 * Phase 108: trimmed toward 0.20. After all the empirical calibration in
 * Phases 100-107, geometric r on SCUT n=2200 reached 0.54; second-opinion
 * stayed at 0.42 (worst-K aggregator emphasizes the worst metrics, which
 * are now mostly the still-uncalibrated `features` metrics — noise).
 * Reducing second-opinion's weight lets geometric carry more of the
 * signal where it actually correlates with human ratings.
 *
 * Phase 192v (comment-only): the constant below is the source of truth —
 * it is currently 0.10, so final = geometric × 0.90 + secondOpinion × 0.10.
 */
export const SECOND_OPINION_WEIGHT = 0.10;

/** How many "worst" metric scores to mean over in the worst-K aggregator. */
const WORST_K = 5;

/**
 * Compute the four sub-aggregators that make up the second-opinion score.
 * Exposed for tests + the "how calculated" UI panel.
 */
export interface SecondOpinionBreakdown {
  median: number;
  worstK: number;
  skinHeavy: number;
  confidenceDiscounted: number;
  /** Number of valid (non-flagged) metrics that fed the aggregators. */
  validMetricCount: number;
}

function isValidScore(r: MetricResult | undefined): r is MetricResult {
  return Boolean(r) && !r!.flagged;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function meanOfLowestK(values: number[], k: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const taken = sorted.slice(0, Math.min(k, sorted.length));
  return taken.reduce((s, v) => s + v, 0) / taken.length;
}

/**
 * Skin-heavy variant of the categorical overall — same category buckets,
 * but skin gets a much bigger seat at the table (0.3 vs the 0.12 in
 * `SKIN_WEIGHT`). This mimics what humans do: skin condition is one of
 * the strongest "attractiveness" signals and a linear 12% under-weights
 * it.
 */
function skinHeavyAggregate(
  categoryAvgs: Partial<Record<Category, number>>,
  skin: SkinResult | undefined
): number {
  // Landmark portion = weighted mean of category averages (same weights
  // as the canonical CATEGORY_WEIGHTS) → identical to geometric pre-skin.
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [cat, avg] of Object.entries(categoryAvgs) as Array<
    [Category, number]
  >) {
    const w = CATEGORY_WEIGHTS[cat];
    if (w > 0) {
      weightedSum += avg * w;
      totalWeight += w;
    }
  }
  const landmarkOverall = totalWeight > 0 ? weightedSum / totalWeight : 0;
  if (!skin) return landmarkOverall;
  return landmarkOverall * 0.7 + skinAverage(skin) * 0.3;
}

/**
 * Confidence-discounted mean — like the canonical overall but with a
 * harsher pose penalty. The metric scores have ALREADY been
 * confidence-blended toward 5.5 inside `computeAll`, so re-applying the
 * penalty here would double-count. Instead we re-blend the overall
 * toward 5.5 by `(1 - confidence)^1.5` (compresses high confidences,
 * stretches low ones).
 *
 * Intent: a yawed photo of an otherwise high-scoring face should not
 * carry the geometric overall as far as it does today.
 */
function confidenceDiscounted(
  geometricOverall: number,
  scanConfidence: number
): number {
  const penalty = Math.pow(1 - scanConfidence, 1.5);
  return geometricOverall * (1 - penalty) + 5.5 * penalty;
}

/**
 * Compute the second-opinion sub-aggregators from a finished scan.
 *
 * The scan must have already been computed by `computeAll` (so its
 * `metrics` carry confidence-blended scores). `skinResult` is optional —
 * pass it if `analyzeSkin` succeeded.
 */
export function secondOpinionBreakdown(
  scan: ScanResult,
  skin: SkinResult | undefined = scan.skin
): SecondOpinionBreakdown {
  const validScores: number[] = [];
  for (const r of Object.values(scan.metrics)) {
    if (isValidScore(r)) validScores.push(r.score);
  }
  // category averages are already on `scan.categories`
  const med = median(validScores);
  const worst = meanOfLowestK(validScores, WORST_K);
  const skinHeavy = skinHeavyAggregate(scan.categories, skin);
  const confDisc = confidenceDiscounted(scan.overall, scan.confidence);
  return {
    median: med,
    worstK: worst,
    skinHeavy,
    confidenceDiscounted: confDisc,
    validMetricCount: validScores.length,
  };
}

/**
 * Single 0-10 second-opinion score = weighted blend of the four
 * sub-aggregators. Returns 0 for a degenerate scan (no valid metrics)
 * so we don't accidentally pull a fully-failed scan toward 5.5 via the
 * confidence-discounted aggregator.
 */
export function secondOpinionScore(
  scan: ScanResult,
  skin: SkinResult | undefined = scan.skin
): number {
  const b = secondOpinionBreakdown(scan, skin);
  if (b.validMetricCount === 0) return 0;
  // Weights sum to 1.0
  return (
    b.median * 0.3 +
    b.worstK * 0.3 +
    b.skinHeavy * 0.25 +
    b.confidenceDiscounted * 0.15
  );
}

/**
 * Blend a geometric overall with a second-opinion score.
 *
 * Both are 0-10. Output is 0-10. Pass weight in [0, 1]; defaults to
 * `SECOND_OPINION_WEIGHT`.
 */
export function blendOverall(
  geometric: number,
  secondOpinion: number,
  weight: number = SECOND_OPINION_WEIGHT
): number {
  const w = Math.min(1, Math.max(0, weight));
  return geometric * (1 - w) + secondOpinion * w;
}

// Re-export the MetricKey type so external callers can navigate from
// this module's exports without importing from @/types separately.
export type { MetricKey };
