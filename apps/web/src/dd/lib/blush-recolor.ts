import type { Landmarks } from "@/types";

export interface BlushColor {
  key: string;
  name: string;
  rgb: [number, number, number];
}

// Tints chosen so a Gaussian-modulated overlay reads as a natural flush
// at intensity ~0.5-0.7 on typical Asian skin tones (180-220 lum range).
export const BLUSH_COLORS: BlushColor[] = [
  { key: "soft-pink", name: "Soft Pink", rgb: [240, 165, 180] },
  { key: "rose", name: "Rose", rgb: [230, 130, 150] },
  { key: "peach", name: "Peach", rgb: [240, 170, 130] },
  { key: "coral", name: "Coral", rgb: [240, 130, 110] },
  { key: "berry", name: "Berry", rgb: [200, 90, 130] },
  { key: "mauve", name: "Mauve", rgb: [200, 130, 150] },
  { key: "warm-nude", name: "Warm Nude", rgb: [220, 160, 140] },
  { key: "brick", name: "Brick", rgb: [180, 95, 80] },
];

// MediaPipe 478 — apple-of-cheek landmarks. 117 = right cheek apple
// (subject's right, screen left); 346 = left cheek apple. Chosen by
// landmark inspection in /face-debug; these sit on the cheekbone
// prominence under the lower eyelid line.
const CHEEK_LANDMARKS = { right: 117, left: 346 };

interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

function faceWidth(landmarks: Landmarks, w: number): number {
  const l = landmarks[234];
  const r = landmarks[454];
  if (!l || !r) return w * 0.5;
  return Math.abs((r.x - l.x) * w);
}

function faceHeight(landmarks: Landmarks, h: number): number {
  const top = landmarks[10];
  const bottom = landmarks[152];
  if (!top || !bottom) return h * 0.5;
  return Math.abs((bottom.y - top.y) * h);
}

function cheekEllipse(
  landmarks: Landmarks,
  idx: number,
  w: number,
  h: number
): Ellipse | null {
  const c = landmarks[idx];
  if (!c) return null;
  const fw = faceWidth(landmarks, w);
  const fh = faceHeight(landmarks, h);
  return {
    cx: c.x * w,
    cy: c.y * h,
    // Wider than tall — blush follows the cheekbone outward.
    rx: fw * 0.08,
    ry: fh * 0.06,
  };
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

export interface BlushOptions {
  /** 0-1: peak intensity at the ellipse center. Falls off Gaussian-ly outward. */
  intensity?: number;
}

/**
 * Blush both cheeks in place.
 *
 * **Mask:** two ellipses, one per cheek apple (landmarks 117 / 346).
 * Horizontal radius = 8% face width; vertical = 6% face height (the
 * blush region is wider than tall — follows the cheekbone outward).
 *
 * **Falloff:** Gaussian on the normalized distance `d² = (dx/rx)² + (dy/ry)²`.
 * At center, α = intensity. At the ellipse edge, α ≈ intensity × 0.08.
 * Outside the ellipse: skip.
 *
 * **Color transform:** unlike hair/lips/eyes (which destructively swap
 * pigment), blush is **additive** — we keep the pixel's L and only
 * shift H + S a fraction of the way toward target, by α. Real makeup
 * adds a flush of color while the skin texture stays visible.
 *
 * **Skin-only guard:** only apply if the pixel is plausibly skin
 * (lum > 80 to skip dark hair / shadow; sat < 0.45 to skip already-
 * pigmented regions). Prevents bleed into eyewear, hairline, etc.
 */
export function applyBlush(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  target: BlushColor,
  options: BlushOptions = {}
): void {
  const { intensity = 0.55 } = options;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (w === 0 || h === 0) return;

  const right = cheekEllipse(landmarks, CHEEK_LANDMARKS.right, w, h);
  const left = cheekEllipse(landmarks, CHEEK_LANDMARKS.left, w, h);
  const cheeks = [right, left].filter((c): c is Ellipse => c !== null);
  if (cheeks.length === 0) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const [tR, tG, tB] = target.rgb;
  const [tH, tS] = rgbToHsl(tR, tG, tB);

  for (const e of cheeks) {
    const x0 = Math.max(0, Math.floor(e.cx - e.rx));
    const x1 = Math.min(w, Math.ceil(e.cx + e.rx));
    const y0 = Math.max(0, Math.floor(e.cy - e.ry));
    const y1 = Math.min(h, Math.ceil(e.cy + e.ry));

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const dx = (x - e.cx) / e.rx;
        const dy = (y - e.cy) / e.ry;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;

        const i = (y * w + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 80) continue; // dark hair / deep shadow

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max > 0 ? (max - min) / max : 0;
        if (sat > 0.45) continue; // already pigmented (lips, eyebrows)

        // Gaussian falloff (2.5 controls sharpness — higher = softer)
        const alpha = intensity * Math.exp(-d2 * 2.5);

        // Tint: keep pixel L; shift H + S toward target proportionally
        const [pH, pS, pL] = rgbToHsl(r, g, b);
        // Hue lerp (handle wraparound at 0/1) — short path
        let hLerped = pH + alpha * shortestHueDelta(pH, tH);
        if (hLerped < 0) hLerped += 1;
        if (hLerped > 1) hLerped -= 1;
        const sLerped = pS + alpha * (tS - pS);
        const [nR, nG, nB] = hslToRgb(hLerped, sLerped, pL);
        data[i] = nR;
        data[i + 1] = nG;
        data[i + 2] = nB;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function shortestHueDelta(a: number, b: number): number {
  let d = b - a;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}
