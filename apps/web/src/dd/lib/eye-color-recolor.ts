import type { Landmarks } from "@/types";

export interface EyeColor {
  key: string;
  name: string;
  rgb: [number, number, number];
}

// Asian-baseline first (darkest), then warm naturals, then dramatic.
// rgb chosen so that mid-luminance iris pixels (~80-150 lum) land in a
// recognizable hue without bleaching out the dark ring at the iris edge.
export const EYE_COLORS: EyeColor[] = [
  // Naturals (dark → light brown)
  { key: "obsidian", name: "Obsidian", rgb: [22, 18, 20] },
  { key: "dark-brown", name: "Dark Brown", rgb: [80, 50, 28] },
  { key: "brown", name: "Brown", rgb: [120, 78, 38] },
  { key: "hazel", name: "Hazel", rgb: [150, 110, 60] },
  { key: "amber", name: "Amber", rgb: [200, 145, 50] },
  { key: "honey", name: "Honey", rgb: [180, 130, 60] },
  // Greens
  { key: "olive", name: "Olive", rgb: [120, 130, 60] },
  { key: "green", name: "Green", rgb: [80, 150, 90] },
  { key: "emerald", name: "Emerald", rgb: [40, 160, 110] },
  // Blues
  { key: "sky", name: "Sky", rgb: [110, 170, 220] },
  { key: "blue", name: "Blue", rgb: [60, 120, 200] },
  { key: "steel", name: "Steel Blue", rgb: [80, 110, 150] },
  // Drama
  { key: "gray", name: "Gray", rgb: [140, 145, 150] },
  { key: "violet", name: "Violet", rgb: [140, 100, 200] },
  { key: "aqua", name: "Aqua", rgb: [80, 180, 200] },
];

// MediaPipe 478 — iris landmarks (only present with the float16 face
// landmarker model, which is the one we load). Center first, then 4
// perimeter points (top, right, bottom, left).
const RIGHT_IRIS = { center: 468, perimeter: [469, 470, 471, 472] };
const LEFT_IRIS = { center: 473, perimeter: [474, 475, 476, 477] };

interface IrisCircle {
  cx: number;
  cy: number;
  r: number;
}

function irisCircle(
  landmarks: Landmarks,
  spec: { center: number; perimeter: number[] },
  w: number,
  h: number
): IrisCircle | null {
  const c = landmarks[spec.center];
  if (!c) return null;
  const cx = c.x * w;
  const cy = c.y * h;
  let r = 0;
  let n = 0;
  for (const idx of spec.perimeter) {
    const p = landmarks[idx];
    if (!p) continue;
    const px = p.x * w;
    const py = p.y * h;
    const d = Math.hypot(px - cx, py - cy);
    r += d;
    n += 1;
  }
  if (n === 0) return null;
  // Phase 132 → 145 — sit *inside* the perimeter. Phase 132 used 1.0
  // (exactly on perimeter); user reported sclera was still picking up
  // tint at the inner corners. Phase 145 drops to 0.94 so the recolor
  // stops a hair before the iris edge — the feathered alpha then
  // blends back out to the natural eye color cleanly.
  const radius = (r / n) * 0.94;
  return { cx, cy, r: radius };
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

export interface EyeRecolorOptions {
  /** 0-1: target-vs-original blend. Lower = more natural. */
  intensity?: number;
}

/**
 * Recolor iris pixels for both eyes in place.
 *
 * **Mask:** two circles — one per iris — fit from the 5 iris landmarks
 * (center + 4 perimeter) per eye. Radius is the mean perimeter-to-center
 * distance, multiplied by 1.08 to cover the iris edge ring that
 * MediaPipe sits just inside of.
 *
 * **Per-pixel filter** (inside the circle):
 *  - lum 35..210 — excludes the pupil (very dark) and catchlights (very
 *    bright). The pupil staying dark + the highlight staying bright is
 *    what sells the recolor as natural; flat-color irises look like
 *    paste-on stickers.
 *  - saturation < 0.55 — keeps already-saturated colored pixels (e.g.
 *    bloodshot whites caught in the edge) from polluting.
 *
 * **Color transform:** for qualifying pixels, swap H + S to the target;
 * keep the pixel's L (it carries the iris shading + radial striations);
 * blend with `intensity`. Light-colored targets (sky, aqua) need higher
 * intensity to show against dark irises; the default 0.85 reads naturally.
 */
export function applyEyeColor(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmarks,
  target: EyeColor,
  options: EyeRecolorOptions = {}
): void {
  // Phase 132 → 143 → 145 — 0.85 → 0.7 → 0.62 → 0.5. With the tighter
  // iris radius (0.94 of perimeter) and saturation cap, 0.5 reads
  // as a natural color shift instead of a tinted contact lens.
  const { intensity = 0.5 } = options;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (w === 0 || h === 0) return;

  const right = irisCircle(landmarks, RIGHT_IRIS, w, h);
  const left = irisCircle(landmarks, LEFT_IRIS, w, h);
  const eyes = [right, left].filter((e): e is IrisCircle => e !== null);
  if (eyes.length === 0) return;

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const [tR, tG, tB] = target.rgb;
  // eslint-disable-next-line prefer-const
  let [tH, tS, tL] = rgbToHsl(tR, tG, tB);
  // Phase 145 — soft-cap target saturation. Real colored contacts /
  // natural iris shifts never reach the saturation of a paint swatch,
  // and dark Asian irises with bright targets came out neon. Same
  // formula as the hair recolor.
  if (tS > 0.55) tS = 0.55 + (tS - 0.55) * 0.25;

  for (const eye of eyes) {
    const x0 = Math.max(0, Math.floor(eye.cx - eye.r));
    const x1 = Math.min(w, Math.ceil(eye.cx + eye.r));
    const y0 = Math.max(0, Math.floor(eye.cy - eye.r));
    const y1 = Math.min(h, Math.ceil(eye.cy + eye.r));
    const r2 = eye.r * eye.r;

    // Phase 132 — first pass: sample mean iris luminance so we know
    // whether we're recoloring a dark Asian iris or a light one. Dark
    // irises need a small L lift toward target L so the new color is
    // visible without looking painted on.
    let irisLumSum = 0;
    let irisLumN = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const dx = x - eye.cx;
        const dy = y - eye.cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = (y * w + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 35 || lum > 210) continue;
        irisLumSum += lum;
        irisLumN += 1;
      }
    }
    const meanIrisL = irisLumN > 0 ? irisLumSum / irisLumN / 255 : 0.3;
    // For dark irises (< 0.25 L), lift each pixel L by up to +18% toward
    // target L. For lighter irises, leave L alone (natural shading wins).
    const darkBoost = meanIrisL < 0.25 ? Math.min(0.18, (0.25 - meanIrisL)) : 0;

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const dx = x - eye.cx;
        const dy = y - eye.cy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;

        // Phase 132 — feathered alpha. Full strength inside 0.78×r,
        // smooth cosine falloff to 0 at the iris boundary. Stops the
        // hard ring artifact that read as "fake colored contact lens".
        const distNorm = Math.sqrt(dist2) / eye.r;
        let edgeAlpha = 1;
        if (distNorm > 0.78) {
          const t = (distNorm - 0.78) / 0.22;
          edgeAlpha = 0.5 * (1 + Math.cos(Math.PI * Math.min(1, t)));
        }

        const i = (y * w + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Phase 143 — tightened catchlight preservation. The corneal
        // reflection (small bright spot on the iris) is what makes an
        // eye "alive". We bumped the upper-lum cutoff from 210 → 195
        // so MORE of the catchlight glow stays untouched, including its
        // soft falloff edge. The pupil cutoff stays at 35 — going lower
        // would let dark iris striations leak into the recolor.
        if (lum < 35 || lum > 195) continue;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max > 0 ? (max - min) / max : 0;
        if (sat > 0.55) continue;

        // Keep pixel L (carries iris shading + striations); swap H + S
        // toward target. For dark irises, lift L a touch toward target L.
        const [, , pL] = rgbToHsl(r, g, b);
        const newL = Math.min(0.92, pL * (1 - darkBoost) + tL * darkBoost);
        const [nR, nG, nB] = hslToRgb(tH, tS, newL);
        // Phase 143 — soft-fade the recolor near the catchlight (lum
        // 170-195) so the transition from "recolored iris" to
        // "preserved reflection" doesn't look like a hard ring.
        const catchlightFade = lum > 170 ? 1 - (lum - 170) / 25 : 1;
        const k = intensity * edgeAlpha * catchlightFade;
        data[i] = nR * k + r * (1 - k);
        data[i + 1] = nG * k + g * (1 - k);
        data[i + 2] = nB * k + b * (1 - k);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
