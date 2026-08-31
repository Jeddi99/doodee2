/**
 * Linear-remap a raw model output to the doodee 0-10 scale.
 *
 * `outputRange` is the (low, high) bounds of the raw model output:
 *  - SCUT-FBP5500: `[1, 5]`     (default)
 *  - Sigmoid head: `[0, 1]`
 *  - z-score head: e.g., `[-3, 3]`
 *
 * Clipping then linear mapping: `((raw - lo) / (hi - lo)) × 10`.
 * Non-finite input falls back to neutral 5.5.
 */
export function mapModelOutputToDoodee(
  raw: number,
  outputRange: readonly [number, number] = [1, 5]
): number {
  if (!Number.isFinite(raw)) return 5.5;
  const [lo, hi] = outputRange;
  if (hi <= lo) return 5.5;
  const clipped = Math.min(hi, Math.max(lo, raw));
  return ((clipped - lo) / (hi - lo)) * 10;
}

/**
 * Backward-compat alias: SCUT-FBP5500 outputs scalar 1-5.
 *   1 → 0, 3 → 5, 5 → 10
 */
export function mapScutToDoodee(raw: number): number {
  return mapModelOutputToDoodee(raw, [1, 5]);
}

/**
 * Inverse of `mapScutToDoodee` — useful for tests + dev tooling.
 */
export function mapDoodeeToScut(doodee: number): number {
  const clipped = Math.min(10, Math.max(0, doodee));
  return clipped / 2.5 + 1;
}
