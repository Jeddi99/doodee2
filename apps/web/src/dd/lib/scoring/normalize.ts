/**
 * Cosine-squared decay normalization — gentle near ideal, sharp far.
 *
 * - Score = 10 when raw value lies inside [min, max].
 * - For raw outside, ratio = distance / halfRange (0 at edge, 2 = "far").
 * - Score = 10 × cos²(π × ratio / 4) for ratio in [0, 2], 0 beyond.
 *
 * The shape (linear was 7.5 at ratio 1; cosine is 5 at ratio 1):
 * - ratio 0.0  →  10    (at edge of ideal)
 * - ratio 0.25 →  9.62
 * - ratio 0.5  →  8.54
 * - ratio 1.0  →  5.00
 * - ratio 1.5  →  1.46
 * - ratio 2.0  →  0
 *
 * Picked because attractive faces tend to have many metrics with tiny
 * deviations (ratio 0–0.5) where linear was overly punishing, AND
 * less-attractive faces have several metrics with moderate deviations
 * (ratio 1–1.5) where linear was overly forgiving.
 *
 * The zero-width-range guard (`halfRange >= 0.01`) prevents division blow-up
 * when a metric's ideal is a single point.
 *
 * Phase 106 experiment reverted: tried `softHalfRange = max(halfRange,
 * 0.04)` to allow empirically-tight ideals without cos²-collapse. Result:
 * SCUT r dropped 0.500 → 0.415. The floor softened too many tight-ideal
 * metrics, compressing scores upward and killing variance. Cos²'s
 * harshness IS the discriminator — softening it kills correlation.
 */
export function normalizeScore(raw: number, ideal: [number, number]): number {
  // NaN guard: a missing landmark or div-by-zero in a metric calculator
  // can leak NaN as `raw`. Without this, NaN bypasses the in-range check
  // (NaN >= min is false), distance becomes NaN, ratio becomes NaN,
  // cos(NaN) is NaN, and the NaN propagates through confidenceBlend +
  // weighted-mean aggregation into a NaN scan.overall — which then
  // breaks tier checks (NaN >= 9 is false → silently "ltn") and toFixed
  // renders "NaN" in the UI.
  if (!Number.isFinite(raw)) return 0;
  const [min, max] = ideal;
  if (raw >= min && raw <= max) return 10;
  const halfRange = Math.max((max - min) / 2, 0.01);
  const distance = raw < min ? min - raw : raw - max;
  const ratio = distance / halfRange;
  if (ratio >= 2) return 0;
  const c = Math.cos((Math.PI * ratio) / 4);
  return 10 * c * c;
}
