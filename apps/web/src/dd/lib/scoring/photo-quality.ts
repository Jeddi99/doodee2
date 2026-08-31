import type { Blendshapes, Landmarks } from "@/types";
import type { PoseEstimate } from "./pose";
import { landmarkBounds } from "./learned/crop";

export type QualitySeverity = "ok" | "warn" | "bad";

export type QualityCheck =
  | "blur"
  | "lighting"
  | "pose"
  | "faceSize"
  | "eyes"
  /** Phase 97 — expression checks (blendshape-derived). */
  | "expression"
  /** Phase 636 — hair occluding the forehead. */
  | "hair";

export interface QualityIssue {
  check: QualityCheck;
  severity: QualitySeverity;
  /** Localization key under `t.photoQuality.fix[...]`. */
  fixKey: string;
  /** Numeric measurement for debug / future tuning. */
  value: number;
}

export interface PhotoQualityReport {
  overall: QualitySeverity;
  issues: QualityIssue[];
}

// Phase 636 — hard pose gate, per the founder's capture-standards spec.
const HARD_YAW_MAX_DEG = 7;
const HARD_PITCH_MAX_DEG = 7;
const HARD_ROLL_MAX_DEG = 5;

/**
 * Reduce confidence based on a photo-quality report. Returns a
 * multiplier in `[0.2, 1.0]` — multiply this against the existing
 * scan confidence to get the quality-adjusted value.
 *
 * Each `warn` subtracts 0.15, each `bad` subtracts 0.30. Clamps so a
 * truly terrible scan still has SOME confidence rather than dumping
 * the user fully to 5.5 (the existing `confidenceBlend` already takes
 * care of pulling extreme cases toward neutral).
 *
 * Phase 33 — used in `foldQualityIntoConfidence` below.
 */
export function qualityConfidenceFactor(report: PhotoQualityReport): number {
  let factor = 1.0;
  for (const i of report.issues) {
    if (i.severity === "bad") factor -= 0.3;
    else if (i.severity === "warn") factor -= 0.15;
  }
  return Math.min(1.0, Math.max(0.2, factor));
}

export function shouldRejectForScoring(report: PhotoQualityReport): boolean {
  // Quality is advisory. Once MediaPipe has found a face, users can still
  // view a result; the report and confidence communicate uncertainty.
  void report;
  return false;
}

// MediaPipe 478 eye landmarks. For "eye openness" we use the
// upper + lower eyelid pair on each eye and divide by eye-width
// (outer ↔ inner canthus) — the palpebral fissure aspect, same shape
// metric used in `eye-area` scoring.
const RIGHT_EYE = {
  outer: 33,
  inner: 133,
  upper: 159,
  lower: 145,
};
const LEFT_EYE = {
  outer: 263,
  inner: 362,
  upper: 386,
  lower: 374,
};

/**
 * One-pass photo-quality assessment. Run after MediaPipe lands the
 * landmarks but before `computeAll`. Cheap (<1ms in benchmarks) — does
 * a single 4-channel read on the face-region pixels of the source canvas.
 *
 * Returns a non-blocking advisory. Callers can show the banner + keep
 * the scan; the goal is to nudge users toward better photos, not block.
 */
export function assessPhotoQuality(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks,
  pose: PoseEstimate,
  /**
   * Phase 97 — optional blendshape coefficients from MediaPipe. When
   * provided, they replace the landmark-derived eye-openness heuristic
   * and add expression checks (extreme smile / mouth open / brow lift)
   * that distort downstream metrics.
   */
  blendshapes?: Blendshapes | null
): PhotoQualityReport {
  const issues: QualityIssue[] = [];

  // ---------------- Pose frontness ----------------
  // Phase 636 — hard degree gate on top of the existing continuous
  // frontness score. `pose.ts`'s YAW_TOL/PITCH_TOL/ROLL_TOL feed a
  // *softer* confidence-blend formula used everywhere per-metric
  // scoring degrades gracefully off-axis — those stay as-is. This is a
  // separate, stricter gate: exceed any of these exact degrees and the
  // photo is rejected outright, no partial-credit scoring, per the
  // founder's calibration spec. Starting values, meant to be tuned
  // against real usage rather than treated as final.
  const front = pose.frontness;
  const angleExceeded =
    Math.abs(pose.yaw) > HARD_YAW_MAX_DEG ||
    Math.abs(pose.pitch) > HARD_PITCH_MAX_DEG ||
    Math.abs(pose.roll) > HARD_ROLL_MAX_DEG;
  if (front < 0.55 || angleExceeded) {
    issues.push({
      check: "pose",
      severity: "bad",
      fixKey: "facePose",
      value: front,
    });
  } else if (front < 0.75) {
    issues.push({
      check: "pose",
      severity: "warn",
      fixKey: "facePose",
      value: front,
    });
  }

  // ---------------- Face size ----------------
  // Phase 636 — "ok" band tightened toward the founder's spec (face
  // should fill ~50-70% of the frame). Bad-tier bounds (0.25/0.9) left
  // alone per the founder's own caution against over-tightening before
  // real usage data exists — those extremes were already clearly bad.
  const ff = pose.faceFraction;
  if (ff < 0.25) {
    issues.push({
      check: "faceSize",
      severity: "bad",
      fixKey: "tooFar",
      value: ff,
    });
  } else if (ff > 0.9) {
    issues.push({
      check: "faceSize",
      severity: "bad",
      fixKey: "tooClose",
      value: ff,
    });
  } else if (ff < 0.45 || ff > 0.75) {
    issues.push({
      check: "faceSize",
      severity: "warn",
      fixKey: ff < 0.45 ? "tooFar" : "tooClose",
      value: ff,
    });
  }

  // ---------------- Eye openness ----------------
  // Phase 97: prefer blendshape `eyeBlinkLeft/Right` when available —
  // these come directly from the trained model and are far more robust
  // than the landmark-derived palpebral-fissure aspect (which depends
  // on 4 noisy single-point landmarks per eye). Heuristic stays as a
  // fallback for older stored scans without blendshape data.
  if (blendshapes) {
    const blinkL = blendshapes.eyeBlinkLeft ?? 0;
    const blinkR = blendshapes.eyeBlinkRight ?? 0;
    const maxBlink = Math.max(blinkL, blinkR);
    if (maxBlink > 0.6) {
      issues.push({
        check: "eyes",
        severity: "bad",
        fixKey: "eyesClosed",
        value: maxBlink,
      });
    } else if (maxBlink > 0.4) {
      issues.push({
        check: "eyes",
        severity: "warn",
        fixKey: "eyesClosed",
        value: maxBlink,
      });
    }
  } else {
    const openR = eyeOpenness(landmarks, RIGHT_EYE);
    const openL = eyeOpenness(landmarks, LEFT_EYE);
    const minOpen = Math.min(openR, openL);
    if (minOpen < 0.12) {
      issues.push({
        check: "eyes",
        severity: "bad",
        fixKey: "eyesClosed",
        value: minOpen,
      });
    } else if (minOpen < 0.18) {
      issues.push({
        check: "eyes",
        severity: "warn",
        fixKey: "eyesClosed",
        value: minOpen,
      });
    }
  }

  // ---------------- Expression (Phase 97, blendshape-only) ----------------
  // Extreme expressions distort the geometry our metrics rely on:
  //   - Wide smile pulls mouth corners up + apart (mouth-tilt, fwhr noisy)
  //   - Open jaw lengthens lower-face (chin-height-ratio, facial-thirds)
  //   - Raised inner brows squish forehead landmarks
  // We treat these as warnings, not blockers — users with these scans
  // still get a score, but the LowConfidenceBanner already pulls them
  // toward neutral 5.5.
  if (blendshapes) {
    const smileL = blendshapes.mouthSmileLeft ?? 0;
    const smileR = blendshapes.mouthSmileRight ?? 0;
    const smile = (smileL + smileR) / 2;
    const jaw = blendshapes.jawOpen ?? 0;
    // Phase 636 — smile threshold tightened from 0.7/0.85 to 0.35/0.6.
    // The founder's capture spec calls for a neutral expression outright
    // ("สีหน้าเป็นกลาง ไม่ยิ้ม"), not just guarding against extreme smiles —
    // a visible smile should already warn, a real smile should block.
    if (smile >= 0.35 || jaw >= 0.4) {
      issues.push({
        check: "expression",
        severity: smile >= 0.6 || jaw >= 0.6 ? "bad" : "warn",
        fixKey: jaw >= 0.4 ? "mouthOpen" : "extremeSmile",
        value: Math.max(smile, jaw),
      });
    }
  }

  // ---------------- Pixel-based checks (blur + lighting) ----------------
  const pixelReport = readFacePixels(image, landmarks);
  if (pixelReport) {
    const blurReport = blurSeverity(pixelReport.laplacianVar);
    if (blurReport) issues.push(blurReport);
    const lightReport = lightingSeverity(pixelReport.lumMean, pixelReport.lumRange);
    if (lightReport) issues.push(lightReport);
  }

  // ---------------- Lighting symmetry + hair occlusion (Phase 636) ----------------
  const symmetryReport = assessFaceSymmetryAndHair(image, landmarks);
  if (symmetryReport) {
    if (symmetryReport.lightingAsymmetry > 55) {
      issues.push({
        check: "lighting",
        severity: "bad",
        fixKey: "unevenLight",
        value: symmetryReport.lightingAsymmetry,
      });
    } else if (symmetryReport.lightingAsymmetry > 35) {
      issues.push({
        check: "lighting",
        severity: "warn",
        fixKey: "unevenLight",
        value: symmetryReport.lightingAsymmetry,
      });
    }
    if (symmetryReport.hairOverForehead) {
      issues.push({
        check: "hair",
        severity: "warn",
        fixKey: "hairCoversFace",
        value: 1,
      });
    }
  }

  const overall = issues.reduce<QualitySeverity>((acc, i) => {
    if (i.severity === "bad") return "bad";
    if (i.severity === "warn" && acc === "ok") return "warn";
    return acc;
  }, "ok");

  return { overall, issues };
}

function eyeOpenness(
  landmarks: Landmarks,
  spec: { outer: number; inner: number; upper: number; lower: number }
): number {
  const outer = landmarks[spec.outer];
  const inner = landmarks[spec.inner];
  const upper = landmarks[spec.upper];
  const lower = landmarks[spec.lower];
  if (!outer || !inner || !upper || !lower) return 0.3; // neutral when missing
  const eyeWidth = Math.hypot(outer.x - inner.x, outer.y - inner.y);
  if (eyeWidth === 0) return 0.3;
  const eyeHeight = Math.hypot(upper.x - lower.x, upper.y - lower.y);
  return eyeHeight / eyeWidth;
}

interface PixelReport {
  laplacianVar: number;
  lumMean: number;
  lumRange: number;
}

/**
 * Sample a rectangular region of an image (anything `drawImage`-able)
 * and return blur + lighting stats. Downsamples to a fixed 64×64 grid
 * so the Laplacian convolution stays under 1ms regardless of input size.
 *
 * Returns null when source dimensions are zero or the region is too
 * small for a meaningful Laplacian.
 */
export function assessPixelArea(
  image: CanvasImageSource,
  region: { x: number; y: number; w: number; h: number },
  options: { canvas?: HTMLCanvasElement; sampleSize?: number } = {}
): PixelReport | null {
  if (typeof document === "undefined") return null;
  if (region.w <= 4 || region.h <= 4) return null;

  const W = Math.max(16, Math.round(options.sampleSize ?? 64));
  const canvas = options.canvas ?? document.createElement("canvas");
  canvas.width = W;
  canvas.height = W;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, W);
    try {
      ctx.drawImage(image, region.x, region.y, region.w, region.h, 0, 0, W, W);
    } catch {
      return null;
    }
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, W, W).data;
    } catch {
      return null;
    }

    // Luminance grayscale (BT.601)
    const gray = new Float32Array(W * W);
    let sum = 0;
    let lumMin = Infinity;
    let lumMax = -Infinity;
    for (let i = 0; i < W * W; i += 1) {
      const r = data[i * 4] ?? 0;
      const g = data[i * 4 + 1] ?? 0;
      const b = data[i * 4 + 2] ?? 0;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = y;
      sum += y;
      if (y < lumMin) lumMin = y;
      if (y > lumMax) lumMax = y;
    }
    const lumMean = sum / (W * W);
    const lumRange = lumMax - lumMin;

    // 3×3 Laplacian variance (classical blur measure):
    //  [ 0  1  0
    //    1 -4  1
    //    0  1  0 ]
    let lapMean = 0;
    let n = 0;
    const lap = new Float32Array((W - 2) * (W - 2));
    for (let y = 1; y < W - 1; y += 1) {
      for (let x = 1; x < W - 1; x += 1) {
        const c = gray[y * W + x] ?? 0;
        const t = gray[(y - 1) * W + x] ?? 0;
        const b2 = gray[(y + 1) * W + x] ?? 0;
        const l = gray[y * W + (x - 1)] ?? 0;
        const r = gray[y * W + (x + 1)] ?? 0;
        const v = t + b2 + l + r - 4 * c;
        lap[n] = v;
        lapMean += v;
        n += 1;
      }
    }
    lapMean /= n || 1;
    let varSum = 0;
    for (let i = 0; i < n; i += 1) {
      const d = (lap[i] ?? 0) - lapMean;
      varSum += d * d;
    }
    const laplacianVar = n > 0 ? varSum / n : 0;

    return { laplacianVar, lumMean, lumRange };
  } finally {
    if (!options.canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/**
 * Adapter — read the face region by computing the landmark bbox first.
 * Used by `assessPhotoQuality` (post-capture, has landmarks).
 */
function readFacePixels(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks
): PixelReport | null {
  const srcW =
    image instanceof HTMLImageElement
      ? image.naturalWidth || image.width
      : image.width;
  const srcH =
    image instanceof HTMLImageElement
      ? image.naturalHeight || image.height
      : image.height;
  if (srcW === 0 || srcH === 0) return null;
  const bb = landmarkBounds(landmarks, srcW, srcH, 0);
  return assessPixelArea(image, bb);
}

// MediaPipe landmark indices — mirrors src/data/landmarks-ref.ts, kept
// local rather than imported since this file already hardcodes eye
// indices the same way (RIGHT_EYE/LEFT_EYE above).
const FACE_LANDMARK = {
  foreheadApex: 10,
  chin: 152,
  leftCheek: 234,
  rightCheek: 454,
};

interface FaceSymmetryReport {
  /** |leftCheekLum - rightCheekLum|, 0-255. */
  lightingAsymmetry: number;
  /** True when the patch just above the forehead apex reads as
   * hair-colored (dark + low-saturation vs. the person's own cheek
   * skin tone) rather than skin or background. */
  hairOverForehead: boolean;
}

const SYMMETRY_MAX_SIDE = 480;

/**
 * Phase 636 — samples 3 small patches (left cheek, right cheek, just
 * above the forehead apex) from a downscaled copy of the photo to
 * check two of the founder's capture-standards: even front lighting
 * (left/right cheek luminance should be close) and hair not covering
 * the forehead (the patch above the forehead apex should read as skin,
 * not hair). Downscales to `SYMMETRY_MAX_SIDE` — the check only needs
 * coarse per-patch color, not full resolution.
 *
 * Heuristic, not a trained classifier — the hair check especially can
 * false-positive on shadow, hats, or naturally dark skin near the
 * hairline. Kept as a "warn" signal, not a hard block, until there's
 * real usage data to validate against.
 */
function assessFaceSymmetryAndHair(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks
): FaceSymmetryReport | null {
  if (typeof document === "undefined") return null;
  const srcW =
    image instanceof HTMLImageElement
      ? image.naturalWidth || image.width
      : image.width;
  const srcH =
    image instanceof HTMLImageElement
      ? image.naturalHeight || image.height
      : image.height;
  if (srcW === 0 || srcH === 0) return null;

  const forehead = landmarks[FACE_LANDMARK.foreheadApex];
  const chin = landmarks[FACE_LANDMARK.chin];
  const cheekL = landmarks[FACE_LANDMARK.leftCheek];
  const cheekR = landmarks[FACE_LANDMARK.rightCheek];
  if (!forehead || !chin || !cheekL || !cheekR) return null;
  const faceHeight = Math.abs(chin.y - forehead.y);
  if (faceHeight <= 0) return null;

  const scale = Math.min(1, SYMMETRY_MAX_SIDE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  let data: Uint8ClampedArray;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }

  const radius = Math.max(4, Math.round(Math.min(w, h) * 0.02));
  const leftPatch = samplePatchAvg(data, w, h, cheekL.x * w, cheekL.y * h, radius);
  const rightPatch = samplePatchAvg(data, w, h, cheekR.x * w, cheekR.y * h, radius);
  // Hairline sample: 14% of face height above the forehead apex — for
  // the vast majority of portraits this lands right at/inside the
  // hairline if hair is covering the forehead, or on bare forehead skin
  // if it isn't.
  const hairY = (forehead.y - 0.14 * faceHeight) * h;
  const hairPatch = samplePatchAvg(data, w, h, forehead.x * w, hairY, radius);
  if (!leftPatch || !rightPatch || !hairPatch) return null;

  const lightingAsymmetry = Math.abs(leftPatch.lum - rightPatch.lum);

  const skinLum = (leftPatch.lum + rightPatch.lum) / 2;
  const skinSat = (leftPatch.sat + rightPatch.sat) / 2;
  const hairOverForehead =
    hairPatch.lum < skinLum * 0.75 && hairPatch.sat < skinSat + 0.15;

  return { lightingAsymmetry, hairOverForehead };
}

function samplePatchAvg(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number
): { lum: number; sat: number } | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const cxi = Math.round(cx);
  const cyi = Math.round(cy);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cxi + dx;
      const y = cyi + dy;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const i = (y * w + x) * 4;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      n++;
    }
  }
  if (n === 0) return null;
  r /= n;
  g /= n;
  b /= n;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return { lum, sat };
}

/**
 * Live pixel-quality readout for a video feed (Phase 34). Samples the
 * center 60% of the video frame — assumes the user has the face
 * roughly centered in the viewfinder (true given the overlay rectangle
 * in `CameraCapture`).
 *
 * Returns 2 checks: blur + lighting. No pose / face-size / eyes
 * (those need landmarks, which would require running MediaPipe on
 * every frame — too expensive for live feedback).
 *
 * Severities use the same thresholds as the post-capture `assessPhotoQuality`.
 */
export function assessLivePixelQuality(
  video: HTMLVideoElement | HTMLCanvasElement,
  options: { canvas?: HTMLCanvasElement; sampleSize?: number } = {}
): { blur: QualitySeverity; lighting: QualitySeverity; issues: QualityIssue[] } {
  const source = video as HTMLVideoElement & HTMLCanvasElement;
  const vW = source.videoWidth || source.width || 0;
  const vH = source.videoHeight || source.height || 0;
  if (vW === 0 || vH === 0) {
    return { blur: "ok", lighting: "ok", issues: [] };
  }
  // Center 60% — matches the viewfinder overlay rect proportions
  const cropW = vW * 0.6;
  const cropH = vH * 0.6;
  const cropX = (vW - cropW) / 2;
  const cropY = (vH - cropH) / 2;
  const report = assessPixelArea(
    video,
    { x: cropX, y: cropY, w: cropW, h: cropH },
    options
  );
  if (!report) return { blur: "ok", lighting: "ok", issues: [] };
  const issues: QualityIssue[] = [];
  const blurIssue = blurSeverity(report.laplacianVar);
  if (blurIssue) issues.push(blurIssue);
  const lightIssue = lightingSeverity(report.lumMean, report.lumRange);
  if (lightIssue) issues.push(lightIssue);
  return {
    blur: blurIssue?.severity ?? "ok",
    lighting: lightIssue?.severity ?? "ok",
    issues,
  };
}

function blurSeverity(lapVar: number): QualityIssue | null {
  if (lapVar < 60) {
    return { check: "blur", severity: "bad", fixKey: "blurry", value: lapVar };
  }
  if (lapVar < 150) {
    return { check: "blur", severity: "warn", fixKey: "blurry", value: lapVar };
  }
  return null;
}

function lightingSeverity(
  lumMean: number,
  lumRange: number
): QualityIssue | null {
  if (lumMean < 60) {
    return {
      check: "lighting",
      severity: "bad",
      fixKey: "tooDark",
      value: lumMean,
    };
  }
  if (lumMean > 210) {
    return {
      check: "lighting",
      severity: "bad",
      fixKey: "tooBright",
      value: lumMean,
    };
  }
  if (lumRange < 40) {
    return {
      check: "lighting",
      severity: "warn",
      fixKey: "flatLight",
      value: lumRange,
    };
  }
  if (lumMean < 85) {
    return {
      check: "lighting",
      severity: "warn",
      fixKey: "tooDark",
      value: lumMean,
    };
  }
  return null;
}
