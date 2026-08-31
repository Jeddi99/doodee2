import type { Landmarks } from "@/types";

export interface HairColor {
  key: string;
  name: string;
  rgb: [number, number, number];
}

export const HAIR_COLORS: HairColor[] = [
  { key: "jet-black", name: "Jet Black", rgb: [12, 10, 14] },
  { key: "espresso", name: "Espresso", rgb: [40, 22, 18] },
  { key: "dark-brown", name: "Dark Brown", rgb: [62, 38, 25] },
  { key: "mahogany", name: "Mahogany", rgb: [88, 32, 32] },
  { key: "brown", name: "Brown", rgb: [105, 70, 42] },
  { key: "chestnut", name: "Chestnut", rgb: [140, 86, 53] },
  { key: "caramel", name: "Caramel", rgb: [170, 108, 55] },
  { key: "honey", name: "Honey", rgb: [183, 132, 58] },
  { key: "blonde", name: "Blonde", rgb: [222, 188, 110] },
  { key: "strawberry", name: "Strawberry", rgb: [228, 165, 120] },
  { key: "auburn", name: "Auburn", rgb: [165, 60, 30] },
  { key: "copper", name: "Copper", rgb: [184, 95, 38] },
  { key: "burgundy", name: "Burgundy", rgb: [108, 28, 42] },
  { key: "rose", name: "Rose Pink", rgb: [195, 110, 140] },
  { key: "platinum", name: "Platinum", rgb: [236, 222, 196] },
  { key: "ash-gray", name: "Ash Gray", rgb: [142, 138, 142] },
  { key: "silver", name: "Silver", rgb: [196, 200, 208] },
  { key: "midnight", name: "Midnight", rgb: [40, 55, 95] },
  { key: "lavender", name: "Lavender", rgb: [195, 170, 225] },
  { key: "mint", name: "Mint", rgb: [170, 220, 200] },
];

interface MaskBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Phase 132 — eyebrow exclusion polygons. The hair segmenter + heuristic
 * both occasionally include eyebrow follicles in the "hair" region; on
 * dark hair × dark eyebrows that's invisible, but the moment the user
 * picks a bright color the eyebrows light up too. These polygons cover
 * the eyebrow region with ~2px padding so we can blacklist any hair
 * mask hit that falls inside.
 *
 * MediaPipe FaceMesh 478 — eyebrow boundary indices:
 *  - Right (subject's right): upper {70, 63, 105, 66, 107}, lower {46, 53, 52, 65, 55}
 *  - Left  (subject's left):  upper {336, 296, 334, 293, 300}, lower {285, 295, 282, 283, 276}
 */
const RIGHT_BROW_OUTLINE = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const LEFT_BROW_OUTLINE = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];

function browPolygon(
  landmarks: Landmarks,
  indices: number[],
  w: number,
  h: number,
  padPx: number
): Pt[] | null {
  const raw: Pt[] = [];
  for (const idx of indices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    raw.push({ x: lm.x * w, y: lm.y * h });
  }
  if (raw.length < 4) return null;
  // Expand outward from centroid by padPx so the polygon covers the
  // full brow + a small fringe of skin underneath.
  let cx = 0;
  let cy = 0;
  for (const p of raw) {
    cx += p.x;
    cy += p.y;
  }
  cx /= raw.length;
  cy /= raw.length;
  return raw.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy);
    if (len === 0) return p;
    return {
      x: p.x + (dx / len) * padPx,
      y: p.y + (dy / len) * padPx,
    };
  });
}

function pointInPoly(px: number, py: number, poly: Pt[]): boolean {
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

/**
 * Phase 144 — HSL color-blend math. The original tone-curve approach
 * (target_RGB × pixel_luminance_factor) flattened hair into a solid
 * color block — no strand texture, no highlights, no realism. Real
 * hair dye preserves the LIGHTNESS profile of the underlying hair
 * (shadows, highlights, individual strands) and only shifts the
 * HUE + SATURATION. We swap to that model here.
 */
function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
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

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255;
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
    hue2rgb(h + 1 / 3) * 255,
    hue2rgb(h) * 255,
    hue2rgb(h - 1 / 3) * 255,
  ];
}

function faceBounds(landmarks: Landmarks, w: number, h: number) {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of landmarks) {
    const x = p.x * w;
    const y = p.y * h;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  return { xMin, xMax, yMin, yMax };
}

function heuristicHairMask(
  landmarks: Landmarks,
  w: number,
  h: number
): MaskBox {
  const b = faceBounds(landmarks, w, h);
  const fw = b.xMax - b.xMin;
  const fh = b.yMax - b.yMin;
  // Hair: above + around the head.
  //
  // **Phase 56 tighten:**
  // - Was: full rectangle from y=0 to brow line, ±55% face width.
  //   That swept in dark background pixels behind the head + recolored
  //   them (visible "ghost halo" of hair color on the photo's background).
  // - Now: cap the TOP at `foreheadApex.y - 0.7 × faceHeight` — covers a
  //   typical head crown without overshooting into background.
  //   Lateral padding reduced from ±55% to ±35% — face width plus enough
  //   for temple/sideburn hair, but not enough to catch background.
  const browL = landmarks[105];
  const browR = landmarks[334];
  const browY =
    browL && browR ? Math.min(browL.y, browR.y) * h : b.yMin + fh * 0.25;
  const foreheadY = b.yMin; // top of face bounds = forehead apex y
  return {
    x0: Math.max(0, Math.floor(b.xMin - fw * 0.35)),
    x1: Math.min(w, Math.ceil(b.xMax + fw * 0.35)),
    y0: Math.max(0, Math.floor(foreheadY - 0.7 * fh)),
    y1: Math.min(h, Math.ceil(browY - fh * 0.02)),
  };
}

/**
 * Sample the hair region itself (Phase 56). Picks a small patch above
 * the forehead apex — for ~95% of portraits that lands inside actual
 * hair (or, for bald subjects, on scalp — also fine since scalp pixels
 * track skin tone and the dual-filter still works).
 *
 * Used by the per-pixel filter alongside the skin sample so we can
 * recognize SILVER/BLOND/LIGHT hair on the user (where the old
 * `lum < skin.lum × 0.82` filter would skip).
 */
function sampleHairTone(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  landmarks: Landmarks
): { lum: number; sat: number } {
  const b = faceBounds(landmarks, w, h);
  const fh = b.yMax - b.yMin;
  // Sample 12% face height above the forehead apex, at the horizontal center
  const sampleY = Math.max(0, Math.floor(b.yMin - 0.12 * fh));
  const sampleX = Math.floor((b.xMin + b.xMax) / 2);
  let r = 0;
  let g = 0;
  let blue = 0;
  let n = 0;
  for (let dy = -6; dy <= 6; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) {
      const px = sampleX + dx;
      const py = sampleY + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = (py * w + px) * 4;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      blue += data[i + 2] ?? 0;
      n += 1;
    }
  }
  if (n === 0) return { lum: 60, sat: 0.05 };
  r /= n;
  g /= n;
  blue /= n;
  const lum = 0.299 * r + 0.587 * g + 0.114 * blue;
  const max = Math.max(r, g, blue);
  const min = Math.min(r, g, blue);
  const sat = max > 0 ? (max - min) / max : 0;
  return { lum, sat };
}

function sampleSkinTone(
  data: Uint8ClampedArray,
  w: number,
  cx: number,
  cy: number,
  radius = 8
): { r: number; g: number; b: number; lum: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      const i = (py * w + px) * 4;
      if (i < 0 || i + 2 >= data.length) continue;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      n++;
    }
  }
  if (n === 0) return { r: 180, g: 150, b: 130, lum: 160 };
  r /= n;
  g /= n;
  b /= n;
  return { r, g, b, lum: 0.299 * r + 0.587 * g + 0.114 * b };
}

export interface HairRecolorOptions {
  /** 0-1: how aggressive the recolor is. 1 = full replacement, lower = blend with original. */
  intensity?: number;
  /** Optional landmark index for skin tone sample (default left cheek). */
  skinSampleIndex?: number;
  /**
   * Phase 57 — pixel-perfect hair mask from `HairSegmenter`. When
   * provided, this REPLACES the heuristic mask + per-pixel filter
   * entirely. Pass a `Uint8Array` of length `canvas.width × canvas.height`
   * where each byte is 1 (hair) or 0 (not hair).
   *
   * Without this option, the function falls back to the Phase 18/56
   * heuristic (rectangular mask + dual lum/sat filter) — kept for
   * environments where the segmenter model can't load.
   */
  hairMask?: Uint8Array;
}

/**
 * Recolor estimated hair pixels in place. Heuristic mask: rectangular
 * region above forehead with lateral padding, extending slightly below
 * the forehead apex to catch bangs.
 *
 * Per-pixel filter: pixel.lum < skin.lum × 0.82 AND not too saturated
 * (rejects skin / colored backgrounds).
 *
 * **Tone curve (Phase 18b):** the original brightness-preserving formula
 * `target × (oldLum / targetLum)` made light targets (silver / platinum)
 * basically invisible on dark hair — a deep-shadow pixel × 0.1 came back
 * dark regardless of target. New mapping uses a soft gamma curve over
 * the hair's natural luminance range so even pitch-black hair lands at
 * ~35% of target luminance (recognizably tinted), with bright highlights
 * pushing up to ~125% (clamped to 255).
 *
 *   norm = (lum / 120) ** 0.7              ; 0 at shadow → ~1 at highlight
 *   factor = clamp(0.35 + norm × 0.95, 0.3, 1.4)
 *   newRGB = target × factor
 *
 * Black-on-black still reads black; silver on dark hair now reads silver.
 */
export function applyHairColor(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  target: HairColor,
  options: HairRecolorOptions = {}
): void {
  // Phase 132 → 144 — default intensity 0.92 → 0.8 → 0.55. The
  // HSL-swap rewrite (Phase 144) preserves strand luminosity, so the
  // recolor reads naturally at much lower opacity. 0.55 is "credible
  // dye job", 0.8 was "obviously dyed", 0.92 was "wig".
  const { intensity = 0.55, skinSampleIndex = 234, hairMask } = options;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (w === 0 || h === 0) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Phase 132 — eyebrow exclusion polygons. Padded outward by 2% of
  // image width so we cover the brow + the skin band just under it
  // (where hair-mask false positives most often appear). The segmenter
  // and heuristic paths both consult these to skip eyebrow pixels.
  const browPad = Math.max(2, w * 0.02);
  const rightBrow = browPolygon(landmarks, RIGHT_BROW_OUTLINE, w, h, browPad);
  const leftBrow = browPolygon(landmarks, LEFT_BROW_OUTLINE, w, h, browPad);
  const isOnBrow = (x: number, y: number) => {
    if (rightBrow && pointInPoly(x, y, rightBrow)) return true;
    if (leftBrow && pointInPoly(x, y, leftBrow)) return true;
    return false;
  };

  // Phase 57 — fast path: pixel-perfect mask from MediaPipe segmenter.
  // Phase 144 — switched the per-pixel math from "scale-target-by-
  // luminance" to a proper HSL color-blend: swap the pixel's hue +
  // saturation toward the target, KEEP the pixel's luminance for
  // strand texture, then mix back with intensity. This is what every
  // real hair-dye preview does — preserves highlights, shadows, and
  // individual strands instead of painting over them.
  if (hairMask && hairMask.length === w * h) {
    const [tR, tG, tB] = target.rgb;
    // eslint-disable-next-line prefer-const
    let [tH, tS, tL] = rgbToHsl(tR, tG, tB);
    // Phase 145 — soft-cap target saturation. Real hair dye on dark
    // Asian hair NEVER reaches the full saturation of the pigment in
    // the bottle — there's always natural eumelanin showing through.
    // Hard-cap at 0.55 so highly saturated swatches (purple, hot
    // pink, neon red) come out as "tasteful tint" instead of "wig".
    // Silver / platinum / nude tones (tS < 0.2) are untouched.
    if (tS > 0.55) tS = 0.55 + (tS - 0.55) * 0.25;

    // Phase 145 — build a soft-alpha mask from the binary hair mask.
    // For every hair-pixel, count how many of its `featherR × featherR`
    // neighbors are also hair. The ratio (0..1) becomes the per-pixel
    // alpha — interior pixels get 1.0, edge pixels get a smooth fade.
    // This kills the sharp purple-vs-skin boundary on the hairline.
    const featherR = Math.max(2, Math.round(Math.min(w, h) * 0.006));
    const winSize = (featherR * 2 + 1) * (featherR * 2 + 1);
    const softAlpha = new Float32Array(w * h);

    let hairLumSum = 0;
    let hairLumN = 0;
    const hairBottomByCol = new Int32Array(w).fill(-1);

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (hairMask[y * w + x] !== 1) continue;
        if (isOnBrow(x, y)) continue;
        // Edge feather: count hair neighbors in a small square window.
        let neighborHair = 0;
        const y0 = Math.max(0, y - featherR);
        const y1 = Math.min(h - 1, y + featherR);
        const x0 = Math.max(0, x - featherR);
        const x1 = Math.min(w - 1, x + featherR);
        for (let yy = y0; yy <= y1; yy += 1) {
          for (let xx = x0; xx <= x1; xx += 1) {
            if (hairMask[yy * w + xx] === 1) neighborHair += 1;
          }
        }
        // Ratio is 1.0 deep inside the mask, drops sharply near edges.
        // Apply a smooth easing so the falloff curves rather than
        // dropping linearly.
        const ratio = neighborHair / winSize;
        const eased = ratio * ratio * (3 - 2 * ratio); // smoothstep
        softAlpha[y * w + x] = eased;

        const i = (y * w + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        hairLumSum += 0.299 * r + 0.587 * g + 0.114 * b;
        hairLumN += 1;
        if (y > hairBottomByCol[x]!) hairBottomByCol[x] = y;
      }
    }
    const meanHairL = hairLumN > 0 ? hairLumSum / hairLumN / 255 : 0.2;
    const darkBoost = Math.max(0, Math.min(0.5, (0.55 - meanHairL) * 0.85));

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const alpha = softAlpha[y * w + x] ?? 0;
        if (alpha <= 0.01) continue;
        if (isOnBrow(x, y)) continue;
        const i = (y * w + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const [, , pL] = rgbToHsl(r, g, b);
        const newL = Math.max(
          0.02,
          Math.min(0.96, pL * (1 - darkBoost) + tL * darkBoost)
        );
        const [nR, nG, nB] = hslToRgb(tH, tS, newL);
        const k = intensity * alpha;
        data[i] = nR * k + r * (1 - k);
        data[i + 1] = nG * k + g * (1 - k);
        data[i + 2] = nB * k + b * (1 - k);
      }
    }
    // Phase 143 + 145 — soft forehead shadow band. Now uses cosine
    // falloff so the shadow blends seamlessly into the skin rather
    // than terminating in a hard line. Peak intensity reduced from
    // 0.18 → 0.12 so the band feels ambient, not painted.
    const targetLum = 0.299 * tR + 0.587 * tG + 0.114 * tB;
    if (targetLum < 180) {
      const shadowBand = Math.max(6, Math.round(h * 0.018));
      const shadowMax = 0.12;
      for (let x = 0; x < w; x += 1) {
        const baseY = hairBottomByCol[x]!;
        if (baseY < 0) continue;
        for (let dy = 1; dy <= shadowBand; dy += 1) {
          const y = baseY + dy;
          if (y >= h) break;
          if (isOnBrow(x, y)) continue;
          if (hairMask[y * w + x] === 1) continue;
          const i = (y * w + x) * 4;
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          if (r < 40) continue;
          // Cosine falloff: 1.0 at the hair line, smoothly 0 at the
          // band edge. Replaces the old linear 1 - dy/shadowBand.
          const t = dy / shadowBand;
          const fade = 0.5 * (1 + Math.cos(Math.PI * t));
          const k = shadowMax * fade * intensity;
          data[i] = Math.round(r * (1 - k));
          data[i + 1] = Math.round(g * (1 - k));
          data[i + 2] = Math.round(b * (1 - k));
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  // ---- Heuristic fallback path (Phase 18/56) — no segmenter mask ----

  const mask = heuristicHairMask(landmarks, w, h);
  if (mask.x1 <= mask.x0 || mask.y1 <= mask.y0) return;

  const skinLm = landmarks[skinSampleIndex];
  if (!skinLm) return;
  const skin = sampleSkinTone(
    data,
    w,
    Math.floor(skinLm.x * w),
    Math.floor(skinLm.y * h)
  );
  // Phase 56: also sample the hair region so the per-pixel filter
  // recognizes silver/blond/light hair (which would fail the
  // `lum < skin.lum × 0.82` check alone).
  const hairSample = sampleHairTone(data, w, h, landmarks);

  // Two acceptance bands for "this pixel is hair-like":
  //   1. Darker-than-skin (covers black/brown/red/dark hair)
  //   2. Close to the sampled hair tone (covers silver/blond/light hair)
  const darkThresh = skin.lum * 0.82;
  const hairLumLo = Math.max(0, hairSample.lum - 50);
  const hairLumHi = Math.min(255, hairSample.lum + 50);
  const [tR, tG, tB] = target.rgb;
  // Phase 144 — HSL swap on the fallback path too. Same model as the
  // fast path: keep pixel L (strand texture), swap H + S to target.
  const [tH, tS, tL] = rgbToHsl(tR, tG, tB);
  // For the heuristic path we don't have a true hair mask, so use
  // the sampled hair luminance as the proxy for "is this hair dark?".
  const meanHairL = hairSample.lum / 255;
  const darkBoost = Math.max(0, Math.min(0.5, (0.55 - meanHairL) * 0.85));

  for (let y = mask.y0; y < mask.y1; y++) {
    for (let x = mask.x0; x < mask.x1; x++) {
      // Phase 132 — eyebrow exclusion (heuristic path).
      if (isOnBrow(x, y)) continue;
      const i = (y * w + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Phase 56: accept if EITHER band matches
      const isDarkHair = lum < darkThresh;
      const isLightHair =
        lum >= hairLumLo && lum <= hairLumHi && lum < skin.lum * 1.05;
      if (!isDarkHair && !isLightHair) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max > 0 ? (max - min) / max : 0;
      if (sat > 0.55) continue;
      // Phase 56: skin has warm chroma (R > B). Pure hair is more
      // neutral (R ≈ B). Reject pixels with strong R-bias to avoid
      // recoloring forehead/temple skin that happens to be in shadow.
      // Phase 132 — tightened from 22 → 16 so more skin-shadow pixels
      // get rejected (was leaking onto forehead in side-lit photos).
      if (r - b > 16 && sat > 0.15) continue;

      // Phase 144 — HSL swap (keep pixel L for texture).
      const [, , pL] = rgbToHsl(r, g, b);
      const newL = Math.max(
        0.02,
        Math.min(0.96, pL * (1 - darkBoost) + tL * darkBoost)
      );
      const [nR, nG, nB] = hslToRgb(tH, tS, newL);

      const k = intensity;
      data[i] = nR * k + r * (1 - k);
      data[i + 1] = nG * k + g * (1 - k);
      data[i + 2] = nB * k + b * (1 - k);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
