import type { Landmarks } from "@/types";

export interface LipstickColor {
  key: string;
  name: string;
  rgb: [number, number, number];
}

// Curated palette — split across families that demo well on most skin tones.
// rgb tuned for vibrance on dark lips (Asian medium-pigment baseline).
export const LIPSTICK_COLORS: LipstickColor[] = [
  // Nudes / browns
  { key: "nude-rose", name: "Nude Rose", rgb: [195, 132, 115] },
  { key: "soft-mauve", name: "Soft Mauve", rgb: [170, 110, 115] },
  { key: "cocoa", name: "Cocoa", rgb: [128, 70, 60] },
  // Pinks
  { key: "rose-pink", name: "Rose Pink", rgb: [222, 110, 130] },
  { key: "coral-peach", name: "Coral Peach", rgb: [232, 118, 108] },
  { key: "hot-pink", name: "Hot Pink", rgb: [232, 70, 130] },
  // Reds
  { key: "classic-red", name: "Classic Red", rgb: [205, 32, 40] },
  { key: "cherry", name: "Cherry", rgb: [185, 28, 60] },
  { key: "scarlet", name: "Scarlet", rgb: [220, 50, 50] },
  { key: "brick", name: "Brick", rgb: [155, 55, 45] },
  // Berries / wines
  { key: "berry", name: "Berry", rgb: [150, 40, 90] },
  { key: "wine", name: "Wine", rgb: [110, 30, 60] },
  // Editorial
  { key: "plum", name: "Plum", rgb: [95, 40, 90] },
];

// MediaPipe FaceMesh 478 — outer lip ring, walking clockwise from left
// corner. Inner edge is handled by the polygon test naturally.
const OUTER_LIP_INDICES = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17,
  84, 181, 91, 146,
];

interface Point {
  x: number;
  y: number;
}

// Ray-casting test — counts how many polygon edges a horizontal ray from
// (px, py) crosses. Odd = inside, even = outside.
function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const crosses =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function lipPolygon(landmarks: Landmarks, w: number, h: number): Point[] {
  const out: Point[] = [];
  for (const idx of OUTER_LIP_INDICES) {
    const lm = landmarks[idx];
    if (!lm) continue;
    out.push({ x: lm.x * w, y: lm.y * h });
  }
  return out;
}

/**
 * Phase 56: erode the polygon inward by `inset` (pixels) along each
 * vertex's direction-to-centroid. Prevents the per-pixel paint from
 * touching boundary pixels that MediaPipe places on the vermillion
 * edge — those edge pixels are usually skin or mustache, not lip.
 */
function erodePolygon(poly: Point[], inset: number): Point[] {
  if (poly.length === 0 || inset <= 0) return poly;
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;
  return poly.map((p) => {
    const dx = cx - p.x;
    const dy = cy - p.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return p;
    return {
      x: p.x + (dx / len) * inset,
      y: p.y + (dy / len) * inset,
    };
  });
}

function polygonBounds(poly: Point[]): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

// RGB [0..255] -> HSL [0..1, 0..1, 0..1]
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

// HSL [0..1] -> RGB [0..255]
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(h + 1 / 3) * 255),
    Math.round(hue2rgb(h) * 255),
    Math.round(hue2rgb(h - 1 / 3) * 255),
  ];
}

export interface LipRecolorOptions {
  /** 0-1: blend with original (1 = full target, 0 = original). */
  intensity?: number;
}

/**
 * Recolor lip pixels in place.
 *
 * **Approach:** ray-cast point-in-polygon against the outer lip ring
 * (20 MediaPipe landmarks). For each interior pixel: convert to HSL,
 * swap H + S from the target color, keep the pixel's natural L (so
 * shadows and highlights survive — gives the lipstick depth instead of
 * a flat sticker), convert back to RGB, and blend with `intensity`.
 *
 * **Why HSL vs hair-color's brightness-ratio:** lips already have hue +
 * saturation; we want to shift those while preserving the L channel
 * that gives lips their natural shape. Hair was mostly low-saturation
 * (black / brown) so a multiplicative shift worked there. On already-
 * pigmented lips a multiplicative shift would over-saturate or muddy.
 */
/**
 * Phase 132 — distance from point (px,py) to nearest edge of `poly`.
 * Used for the feathered alpha at the polygon boundary. Positive when
 * the point is inside; here we only call it for known-inside points so
 * the sign is implicit.
 */
function distanceToPolygonEdge(
  px: number,
  py: number,
  poly: Point[]
): number {
  let minD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const dx = xj - xi;
    const dy = yj - yi;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) {
      const d = Math.hypot(px - xi, py - yi);
      if (d < minD) minD = d;
      continue;
    }
    const t = Math.max(0, Math.min(1, ((px - xi) * dx + (py - yi) * dy) / len2));
    const qx = xi + t * dx;
    const qy = yi + t * dy;
    const d = Math.hypot(px - qx, py - qy);
    if (d < minD) minD = d;
  }
  return minD;
}

export function applyLipstick(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  target: LipstickColor,
  options: LipRecolorOptions = {}
): void {
  // Phase 132 → 143 → 144 — 0.85 → 0.7 → 0.62 → 0.52. The 95/5 L
  // preservation in Phase 144 means even 0.52 reads as a clear color
  // shift on lips while keeping the underlying lip line/highlight
  // intact. Reads as worn satin lipstick, not paint.
  const { intensity = 0.52 } = options;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (w === 0 || h === 0) return;

  const polyRaw = lipPolygon(landmarks, w, h);
  if (polyRaw.length < 6) return;

  // Phase 132 — bumped polygon erosion from 3% → 5% of mouth width.
  // MediaPipe outer-lip points sit ~2-3% outside actual vermillion on
  // most photos; 5% inset leaves a clean band that's reliably lip.
  const polyBounds = polygonBounds(polyRaw);
  const mouthW = polyBounds.x1 - polyBounds.x0;
  const inset = Math.max(1, mouthW * 0.05);
  const poly = erodePolygon(polyRaw, inset);

  const b = polygonBounds(poly);
  const x0 = Math.max(0, Math.floor(b.x0));
  const x1 = Math.min(w, Math.ceil(b.x1));
  const y0 = Math.max(0, Math.floor(b.y0));
  const y1 = Math.min(h, Math.ceil(b.y1));
  if (x1 <= x0 || y1 <= y0) return;

  // Phase 132 — feathered boundary: full strength once a pixel is at
  // least `featherPx` inside the polygon, ramping cosine-style from
  // 1.0 at that depth down to 0 right at the edge. Soft lipstick edge
  // beats a hard-cut paint stripe.
  const featherPx = Math.max(1, mouthW * 0.04);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const [tR, tG, tB] = target.rgb;
  const [tH, tS] = rgbToHsl(tR, tG, tB);
  const [, , targetL] = rgbToHsl(tR, tG, tB);

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!pointInPolygon(x, y, poly)) continue;
      const i = (y * w + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const bl = data[i + 2] ?? 0;

      // Phase 56: reject mustache / beard / teeth pixels that the
      // polygon happens to cover. Lip pixels have a measurable
      // red-shift (R > G > B) and meaningful saturation. Mustache hairs
      // are near-gray (R≈G≈B, low sat) or very dark.
      const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
      if (lum < 35) continue; // very dark = beard/mustache shadow
      if (lum > 235) continue; // very bright = tooth highlight
      const max = Math.max(r, g, bl);
      const min = Math.min(r, g, bl);
      const sat = max > 0 ? (max - min) / max : 0;
      if (sat < 0.08 && r - bl < 12) continue; // gray + no red-shift = facial hair

      // Phase 132 — feathered alpha based on distance to polygon edge.
      const edgeD = distanceToPolygonEdge(x, y, poly);
      let edgeAlpha = 1;
      if (edgeD < featherPx) {
        const t = edgeD / featherPx;
        edgeAlpha = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t))));
      }

      // Phase 132 → 144 — natural-L preservation 75/25 → 88/12 → 95/5.
      // Real lipstick shifts hue + saturation while the LIGHTNESS
      // profile of the lip (specular highlight, lip-line dip, vertical
      // creases) stays almost entirely intact. Pulling more than ~5%
      // toward target L flattened the lip into a painted slab. 95/5
      // matches what you see in real-world satin/matte lipstick.
      const [, , pL] = rgbToHsl(r, g, bl);
      const newL = Math.min(0.92, Math.max(0.08, pL * 0.95 + targetL * 0.05));
      const [nR, nG, nB] = hslToRgb(tH, tS, newL);
      const k = intensity * edgeAlpha;
      data[i] = nR * k + r * (1 - k);
      data[i + 1] = nG * k + g * (1 - k);
      data[i + 2] = nB * k + bl * (1 - k);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
