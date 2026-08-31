import type { Landmarks } from "@/types";
import { LANDMARK } from "@/data/landmarks-ref";

export interface SkinMetrics {
  /** 0-10. Low variance between cheek/forehead/chin patch means = uniform tone. */
  uniformity: number;
  /** 0-10. Low pixel variance within patches = clear skin (no blemish texture). */
  clarity: number;
  /** 0-10. Balanced luminance + warmth = healthy glow; very dull or harsh = low. */
  glow: number;
  /** Average RGB across all skin patches sampled. */
  meanRgb: [number, number, number];
  /** Average within-patch standard deviation across channels. */
  textureSigma: number;
  /** Mean luminance across patches (0-255). */
  luminance: number;
  /** Inter-patch RGB variance — how uneven the tone is across the face. */
  toneVariance: number;
}

interface PatchSample {
  r: number;
  g: number;
  b: number;
  variance: number;
  lum: number;
}

const SKIN_SCORE_MULTIPLIER = 0.8;

/**
 * Sample a square pixel patch centered at (cx, cy) and return the
 * average RGB + per-pixel variance + luminance for that patch.
 */
function samplePatch(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number
): PatchSample | null {
  let r = 0;
  let g = 0;
  let bSum = 0;
  let n = 0;
  const pixels: [number, number, number][] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const i = (y * w + x) * 4;
      const pr = data[i] ?? 0;
      const pg = data[i + 1] ?? 0;
      const pb = data[i + 2] ?? 0;
      r += pr;
      g += pg;
      bSum += pb;
      pixels.push([pr, pg, pb]);
      n++;
    }
  }
  if (n === 0) return null;
  r /= n;
  g /= n;
  bSum /= n;
  let varSum = 0;
  for (const [pr, pg, pb] of pixels) {
    varSum +=
      (pr - r) * (pr - r) +
      (pg - g) * (pg - g) +
      (pb - bSum) * (pb - bSum);
  }
  const variance = Math.sqrt(varSum / (n * 3));
  const lum = 0.299 * r + 0.587 * g + 0.114 * bSum;
  return { r, g, b: bSum, variance, lum };
}

/**
 * Analyze skin from sample patches at forehead + both cheeks + chin.
 *
 * **Uniformity** — penalizes inter-patch RGB variance. Even tone = high.
 * **Clarity** — penalizes within-patch sigma (blemish / wrinkle texture).
 * **Glow** — luminance balanced around 130-180; very dim or blown-out → low.
 *
 * All three return 0-10 scores. The image must already be loaded (use
 * the same HTMLImageElement that MediaPipe was fed). Returns null on
 * canvas errors (private mode, etc.).
 */
export function analyzeSkin(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks
): SkinMetrics | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const w =
    image instanceof HTMLImageElement
      ? image.naturalWidth || image.width
      : image.width;
  const h =
    image instanceof HTMLImageElement
      ? image.naturalHeight || image.height
      : image.height;
  if (w === 0 || h === 0) return null;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(image, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
  const radius = Math.max(6, Math.min(20, Math.floor(Math.min(w, h) * 0.012)));

  // Sample sites — chosen to avoid eyes/nose/mouth + hair edges.
  const forehead = landmarks[LANDMARK.foreheadApex];
  const midBrow = landmarks[LANDMARK.midBrow];
  const cheekL = landmarks[LANDMARK.leftCheek];
  const cheekR = landmarks[LANDMARK.rightCheek];
  const noseTip = landmarks[LANDMARK.noseTip];
  const chin = landmarks[LANDMARK.chin];
  const lowerLip = landmarks[LANDMARK.lowerLipBottom];

  if (!forehead || !midBrow || !cheekL || !cheekR || !noseTip || !chin || !lowerLip) {
    return null;
  }

  // Pull samples slightly inward / safer than the landmark itself.
  const sites: Array<{ x: number; y: number }> = [
    // Forehead (between apex and brow, midline)
    {
      x: (forehead.x + midBrow.x) / 2,
      y: (forehead.y * 0.4 + midBrow.y * 0.6),
    },
    // Left cheek — between cheek landmark and nose, mid height
    {
      x: cheekL.x * 0.55 + noseTip.x * 0.45,
      y: (cheekL.y + noseTip.y) / 2,
    },
    // Right cheek — mirror
    {
      x: cheekR.x * 0.55 + noseTip.x * 0.45,
      y: (cheekR.y + noseTip.y) / 2,
    },
    // Chin — between lower lip and chin landmark
    {
      x: chin.x,
      y: lowerLip.y * 0.4 + chin.y * 0.6,
    },
  ];

  const patches: PatchSample[] = [];
  for (const s of sites) {
    const cx = Math.floor(s.x * w);
    const cy = Math.floor(s.y * h);
    const p = samplePatch(data, w, h, cx, cy, radius);
    if (p) patches.push(p);
  }
  if (patches.length < 3) return null;

  const meanR = patches.reduce((a, p) => a + p.r, 0) / patches.length;
  const meanG = patches.reduce((a, p) => a + p.g, 0) / patches.length;
  const meanB = patches.reduce((a, p) => a + p.b, 0) / patches.length;
  const meanLum = patches.reduce((a, p) => a + p.lum, 0) / patches.length;
  const textureSigma =
    patches.reduce((a, p) => a + p.variance, 0) / patches.length;

  // Inter-patch tone variance — euclidean RGB distance from mean.
  let toneVar = 0;
  for (const p of patches) {
    toneVar +=
      (p.r - meanR) * (p.r - meanR) +
      (p.g - meanG) * (p.g - meanG) +
      (p.b - meanB) * (p.b - meanB);
  }
  toneVar = Math.sqrt(toneVar / patches.length);

  // Score curves (empirical):
  // - uniformity: tone variance 0-3 → 10, 15+ → 0
  // - clarity:    texture sigma 3-7 → 10, 22+ → 0
  // - glow:       lum 130-180 → 10, < 60 or > 230 → 0
  const uniformity = scoreInverseLinear(toneVar, 3, 18);
  const clarity = scoreInverseLinear(textureSigma, 6, 24);
  const glow = scoreBell(meanLum, 155, 35, 110);

  return {
    uniformity: skinScore(uniformity),
    clarity: skinScore(clarity),
    glow: skinScore(glow),
    meanRgb: [Math.round(meanR), Math.round(meanG), Math.round(meanB)],
    textureSigma: round1(textureSigma),
    luminance: round1(meanLum),
    toneVariance: round1(toneVar),
  };
}

function scoreInverseLinear(value: number, idealMax: number, hardMax: number): number {
  if (value <= idealMax) return 10;
  if (value >= hardMax) return 0;
  const t = (value - idealMax) / (hardMax - idealMax);
  return 10 * (1 - t * t);
}

function scoreBell(
  value: number,
  ideal: number,
  tolerance: number,
  hardTolerance: number
): number {
  const d = Math.abs(value - ideal);
  if (d <= tolerance) return 10;
  if (d >= hardTolerance) return 0;
  const t = (d - tolerance) / (hardTolerance - tolerance);
  return 10 * (1 - t * t);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function skinScore(v: number): number {
  return round1(v * SKIN_SCORE_MULTIPLIER);
}
