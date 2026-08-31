/**
 * Phase 640 — pure math for the client-side "align + seamless blend"
 * compositor upgrade (founder's OpenCV workflow spec, ported to
 * Canvas/TypeScript because preview compositing runs in the browser —
 * see ADR-138).
 *
 * Two concerns live here, both extracted as pure functions over plain
 * arrays so they unit-test in jsdom without a canvas:
 *
 * 1. Similarity-transform estimation (the `cv2.getAffineTransform` +
 *    `cv2.warpAffine` step): least-squares fit of scale/rotation/
 *    translation mapping landmark anchors detected on the AI image
 *    (pts_new) onto the original photo's anchors (pts_old).
 * 2. Membrane color offsets (the `cv2.seamlessClone` tone component):
 *    per-sector color deltas sampled on the mask's feather ring,
 *    interpolated smoothly across the region interior — a spatially
 *    varying upgrade of the Phase 633 uniform delta that can correct
 *    directional lighting mismatch (one side brighter), which a single
 *    global offset cannot.
 */

export interface Point2 {
  x: number;
  y: number;
}

/**
 * q ≈ s·R(θ)·p + t, encoded as [x' = a·x − b·y + tx, y' = b·x + a·y + ty]
 * where a = s·cosθ, b = s·sinθ.
 */
export interface SimilarityTransform {
  a: number;
  b: number;
  tx: number;
  ty: number;
  scale: number;
  rotationDeg: number;
  /** Mean distance between transformed `from` points and `to` points. */
  meanResidual: number;
}

/**
 * Least-squares similarity transform (Umeyama, 2D, no reflection) from
 * N >= 2 point pairs. Returns null on degenerate input (fewer than 2
 * pairs, mismatched lengths, or zero spread in the source points).
 */
export function estimateSimilarityTransform(
  from: readonly Point2[],
  to: readonly Point2[]
): SimilarityTransform | null {
  const n = from.length;
  if (n < 2 || to.length !== n) return null;

  let fx = 0;
  let fy = 0;
  let txm = 0;
  let tym = 0;
  for (let i = 0; i < n; i++) {
    fx += from[i]!.x;
    fy += from[i]!.y;
    txm += to[i]!.x;
    tym += to[i]!.y;
  }
  fx /= n;
  fy /= n;
  txm /= n;
  tym /= n;

  let dot = 0;
  let cross = 0;
  let norm = 0;
  for (let i = 0; i < n; i++) {
    const px = from[i]!.x - fx;
    const py = from[i]!.y - fy;
    const qx = to[i]!.x - txm;
    const qy = to[i]!.y - tym;
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
    norm += px * px + py * py;
  }
  if (norm <= 1e-12) return null;

  const a = dot / norm;
  const b = cross / norm;
  const tx = txm - (a * fx - b * fy);
  const ty = tym - (b * fx + a * fy);

  let residual = 0;
  for (let i = 0; i < n; i++) {
    const mx = a * from[i]!.x - b * from[i]!.y + tx;
    const my = b * from[i]!.x + a * from[i]!.y + ty;
    residual += Math.hypot(mx - to[i]!.x, my - to[i]!.y);
  }

  return {
    a,
    b,
    tx,
    ty,
    scale: Math.hypot(a, b),
    rotationDeg: (Math.atan2(b, a) * 180) / Math.PI,
    meanResidual: residual / n,
  };
}

export interface SectorDeltas {
  /** sectorCount × 3 (r, g, b), already clamped to ±maxDelta. */
  deltas: Float64Array;
  sectorCount: number;
  /** Largest |delta| across all sectors/channels — callers can skip
   * applying when this is under their minimum threshold. */
  maxAbsDelta: number;
}

/**
 * Samples base-minus-layer color differences on the feather ring of an
 * ELLIPSE (rxOut × ryOut around cx/cy — Phase 641; pass rx = ry for a
 * circle), bucketed into angular sectors. The ring spans normalized
 * elliptical radius [innerFraction, 1]. Both buffers are RGBA over the
 * same w×h bounding box whose top-left sits at (left, top) in the
 * coordinate space of cx/cy. Sectors that catch no pixels (ring clipped
 * off-canvas) inherit the mean of the valid ones. Returns null when the
 * ring catches nothing at all.
 */
export function computeSectorColorDeltas(
  base: Uint8ClampedArray,
  layer: Uint8ClampedArray,
  w: number,
  h: number,
  left: number,
  top: number,
  cx: number,
  cy: number,
  rxOut: number,
  ryOut: number,
  innerFraction: number,
  sectorCount: number,
  maxDelta: number
): SectorDeltas | null {
  if (w <= 0 || h <= 0 || sectorCount < 1) return null;
  if (rxOut <= 0 || ryOut <= 0) return null;
  const sums = new Float64Array(sectorCount * 3);
  const counts = new Float64Array(sectorCount);
  const innerSq = innerFraction * innerFraction;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + left - cx) / rxOut;
      const ny = (y + top - cy) / ryOut;
      const rhoSq = nx * nx + ny * ny;
      if (rhoSq < innerSq || rhoSq > 1) continue;
      const angle = Math.atan2(ny, nx);
      let sector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * sectorCount);
      if (sector >= sectorCount) sector = sectorCount - 1;
      if (sector < 0) sector = 0;
      const i = (y * w + x) * 4;
      sums[sector * 3] = (sums[sector * 3] ?? 0) + (base[i] ?? 0) - (layer[i] ?? 0);
      sums[sector * 3 + 1] =
        (sums[sector * 3 + 1] ?? 0) + (base[i + 1] ?? 0) - (layer[i + 1] ?? 0);
      sums[sector * 3 + 2] =
        (sums[sector * 3 + 2] ?? 0) + (base[i + 2] ?? 0) - (layer[i + 2] ?? 0);
      counts[sector] = (counts[sector] ?? 0) + 1;
    }
  }

  let validCount = 0;
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  const deltas = new Float64Array(sectorCount * 3);
  for (let k = 0; k < sectorCount; k++) {
    const c = counts[k] ?? 0;
    if (c <= 0) continue;
    const dr = clampAbs((sums[k * 3] ?? 0) / c, maxDelta);
    const dg = clampAbs((sums[k * 3 + 1] ?? 0) / c, maxDelta);
    const db = clampAbs((sums[k * 3 + 2] ?? 0) / c, maxDelta);
    deltas[k * 3] = dr;
    deltas[k * 3 + 1] = dg;
    deltas[k * 3 + 2] = db;
    meanR += dr;
    meanG += dg;
    meanB += db;
    validCount++;
  }
  if (validCount === 0) return null;
  meanR /= validCount;
  meanG /= validCount;
  meanB /= validCount;

  let maxAbsDelta = 0;
  for (let k = 0; k < sectorCount; k++) {
    if ((counts[k] ?? 0) <= 0) {
      deltas[k * 3] = meanR;
      deltas[k * 3 + 1] = meanG;
      deltas[k * 3 + 2] = meanB;
    }
    for (let c = 0; c < 3; c++) {
      const v = Math.abs(deltas[k * 3 + c] ?? 0);
      if (v > maxAbsDelta) maxAbsDelta = v;
    }
  }

  return { deltas, sectorCount, maxAbsDelta };
}

/**
 * Applies the sector deltas as a smooth, angularly interpolated color
 * offset to every layer pixel inside the rxOut × ryOut ellipse — the
 * membrane component of Poisson cloning, approximated. Interpolation is
 * inverse-square over periodic angular distance to the sector centers,
 * so the offset field has no visible sector boundaries. Mutates `layer`
 * in place.
 */
export function applyMembraneColorOffsets(
  layer: Uint8ClampedArray,
  w: number,
  h: number,
  left: number,
  top: number,
  cx: number,
  cy: number,
  rxOut: number,
  ryOut: number,
  sectors: SectorDeltas
): void {
  if (rxOut <= 0 || ryOut <= 0) return;
  const n = sectors.sectorCount;
  const sectorWidth = (2 * Math.PI) / n;
  // Softening keeps weights finite at sector centers and controls how
  // local the interpolation is (quarter sector width feels smooth).
  const soften = (sectorWidth / 4) * (sectorWidth / 4);
  const centers = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    centers[k] = -Math.PI + (k + 0.5) * sectorWidth;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + left - cx) / rxOut;
      const ny = (y + top - cy) / ryOut;
      if (nx * nx + ny * ny > 1) continue;
      const angle = Math.atan2(ny, nx);
      let wSum = 0;
      let dr = 0;
      let dg = 0;
      let db = 0;
      for (let k = 0; k < n; k++) {
        let dAng = Math.abs(angle - (centers[k] ?? 0));
        if (dAng > Math.PI) dAng = 2 * Math.PI - dAng;
        const weight = 1 / (dAng * dAng + soften);
        wSum += weight;
        dr += weight * (sectors.deltas[k * 3] ?? 0);
        dg += weight * (sectors.deltas[k * 3 + 1] ?? 0);
        db += weight * (sectors.deltas[k * 3 + 2] ?? 0);
      }
      if (wSum <= 0) continue;
      const i = (y * w + x) * 4;
      layer[i] = clamp255((layer[i] ?? 0) + dr / wSum);
      layer[i + 1] = clamp255((layer[i + 1] ?? 0) + dg / wSum);
      layer[i + 2] = clamp255((layer[i + 2] ?? 0) + db / wSum);
    }
  }
}

function clampAbs(value: number, limit: number): number {
  return value < -limit ? -limit : value > limit ? limit : value;
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
