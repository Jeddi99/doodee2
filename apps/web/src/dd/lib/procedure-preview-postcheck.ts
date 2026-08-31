import type { Landmarks } from "@/types";
import type { Intensity, ProcedureDef } from "./ai-procedure-catalog";
import {
  REGION_INDICES,
  previewRegionsForProcedure,
} from "./procedure-preview-contract";
import { detectPreviewLandmarks } from "./procedure-mask";
import {
  validateProcedurePreviewSemantics,
  type ProcedureSemanticReport,
} from "./procedure-preview-semantics";
import {
  assessPhotoQuality,
  type PhotoQualityReport,
} from "./scoring/photo-quality";
import { estimatePose } from "./scoring/pose";

export type ProcedurePreviewPostCheckCode =
  | "ok"
  | "after-image-unreadable"
  | "after-face-missing"
  | "identity-drift"
  | "quality-drift"
  | "visual-artifact"
  | "effect-not-applicable"
  | "effect-too-weak"
  | "effect-too-strong"
  | "effect-wrong-direction"
  | "effect-unverifiable"
  | "unsupported-input";

export interface ProcedurePreviewPostCheckReport {
  ok: boolean;
  code: ProcedurePreviewPostCheckCode;
  quality?: PhotoQualityReport;
  drift?: {
    metric: string;
    before: number;
    after: number;
    ratio: number;
  };
  artifact?: {
    metric: string;
    pixels: number;
    threshold: number;
    ratio: number;
  };
  effect?: ProcedureSemanticReport;
}

type PixelBox = { x0: number; y0: number; x1: number; y1: number };

const BLOCKING_OUTPUT_QUALITY_CHECKS = new Set<
  PhotoQualityReport["issues"][number]["check"]
>(["blur", "lighting", "eyes", "expression"]);

export class ProcedurePreviewPostCheckError extends Error {
  readonly report: ProcedurePreviewPostCheckReport;

  constructor(report: ProcedurePreviewPostCheckReport) {
    super(`preview-postcheck:${report.code}`);
    this.name = "ProcedurePreviewPostCheckError";
    this.report = report;
  }
}

export async function assertProcedurePreviewPostCheck(input: {
  beforeImage: HTMLImageElement;
  afterImageDataUrl: string;
  procedures: readonly ProcedureDef[];
  stage: "provider" | "final";
  loadTimeoutMs?: number;
  intensity?: Intensity;
}): Promise<ProcedurePreviewPostCheckReport> {
  const report = await validateProcedurePreviewPostCheck(input);
  if (!report.ok) throw new ProcedurePreviewPostCheckError(report);
  return report;
}

export async function validateProcedurePreviewPostCheck(input: {
  beforeImage: HTMLImageElement;
  afterImageDataUrl: string;
  procedures: readonly ProcedureDef[];
  stage: "provider" | "final";
  loadTimeoutMs?: number;
  intensity?: Intensity;
}): Promise<ProcedurePreviewPostCheckReport> {
  if (input.procedures.length === 0) {
    return { ok: false, code: "effect-unverifiable" };
  }
  const afterImage = await loadPostCheckImage(
    input.afterImageDataUrl,
    input.loadTimeoutMs ?? 1200
  );
  if (!afterImage) return { ok: false, code: "after-image-unreadable" };

  const beforeDetected = await detectPreviewLandmarks(input.beforeImage).catch(
    () => null
  );
  const afterDetected = await detectPreviewLandmarks(afterImage).catch(
    () => null
  );
  if (!beforeDetected || !afterDetected) {
    return { ok: false, code: "after-face-missing" };
  }

  const drift = identityDrift(
    beforeDetected.landmarks,
    afterDetected.landmarks,
    input.procedures
  );
  if (drift) return { ok: false, code: "identity-drift", drift };

  const artifact = visualArtifactDrift(
    input.beforeImage,
    afterImage,
    beforeDetected.landmarks,
    input.procedures,
    input.stage === "final"
  );
  if (artifact) return { ok: false, code: "visual-artifact", artifact };

  let effect: ProcedureSemanticReport | undefined;
  if (input.stage === "final") {
    effect = validateProcedurePreviewSemantics({
      beforeImage: input.beforeImage,
      afterImage,
      beforeLandmarks: beforeDetected.landmarks,
      afterLandmarks: afterDetected.landmarks,
      procedures: input.procedures,
      ...(input.intensity ? { intensity: input.intensity } : {}),
    });
    if (!effect.ok) return { ok: false, code: effect.code, effect };
  }

  const quality = assessPhotoQuality(
    afterImage,
    afterDetected.landmarks,
    estimatePose(afterDetected.landmarks),
    afterDetected.blendshapes
  );
  if (
    quality.issues.some(
      (issue) =>
        issue.severity === "bad" &&
        BLOCKING_OUTPUT_QUALITY_CHECKS.has(issue.check)
    )
  ) {
    return { ok: false, code: "quality-drift", quality };
  }

  return {
    ok: true,
    code: "ok",
    quality,
    ...(effect ? { effect } : {}),
  };
}

function loadPostCheckImage(
  src: string,
  timeoutMs: number
): Promise<HTMLImageElement | null> {
  if (!src.startsWith("data:image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    let done = false;
    const finish = (result: HTMLImageElement | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => finish(null), timeoutMs);
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      finish(width > 0 && height > 0 ? image : null);
    };
    image.onerror = () => finish(null);
    image.src = src;
    if (image.complete && (image.naturalWidth || image.width) > 0) {
      finish(image);
    }
  });
}

function identityDrift(
  before: Landmarks,
  after: Landmarks,
  procedures: readonly ProcedureDef[]
): ProcedurePreviewPostCheckReport["drift"] | null {
  const beforeGeo = geometry(before);
  const afterGeo = geometry(after);
  if (!beforeGeo || !afterGeo) return { metric: "geometry", before: 0, after: 0, ratio: 0 };

  // Phase 614 — recalibrated for the full-photo technique (ADR-126).
  // The old tight bands (±6–10%) assumed a mask-composited "after" whose
  // non-target landmarks were literally copied from the source, so any
  // drift meant a bad edit. Now the WHOLE face is AI-regenerated and
  // re-aligned, so small proportion shifts are normal AND the targeted
  // dimension is SUPPOSED to move (a chin augmentation lengthens the face;
  // a jaw reduction narrows it). This check is now only a coarse
  // "still the same person, not garbage" gate — wide bands that reject a
  // gross person-swap or a corner-crop of a non-grid image, not a real
  // procedure edit. The dimension the procedure targets gets an even
  // wider band so the intended change never self-rejects.
  const targetRegions = new Set(
    procedures.flatMap((item) => previewRegionsForProcedure(item).regions)
  );
  const targetNose = targetRegions.has("nose");
  const targetLowerFace = targetRegions.has("chin") ||
    targetRegions.has("cheekLeft") || targetRegions.has("cheekRight");
  const checks = [
    {
      metric: "inter_eye",
      before: beforeGeo.interEye,
      after: afterGeo.interEye,
      min: 0.85,
      max: 1.15,
    },
    {
      metric: "face_width",
      before: beforeGeo.faceWidth,
      after: afterGeo.faceWidth,
      min: targetLowerFace ? 0.7 : 0.82,
      max: targetLowerFace ? 1.18 : 1.15,
    },
    {
      metric: "face_height",
      before: beforeGeo.faceHeight,
      after: afterGeo.faceHeight,
      min: 0.82,
      max: targetLowerFace ? 1.25 : 1.18,
    },
    {
      metric: "eye_to_nose",
      before: beforeGeo.eyeToNose,
      after: afterGeo.eyeToNose,
      min: targetNose ? 0.78 : 0.85,
      max: targetNose ? 1.22 : 1.15,
    },
    {
      metric: "nose_to_mouth",
      before: beforeGeo.noseToMouth,
      after: afterGeo.noseToMouth,
      min: targetNose ? 0.78 : 0.85,
      max: targetNose ? 1.22 : 1.15,
    },
  ];

  for (const check of checks) {
    if (check.before <= 0 || check.after <= 0) continue;
    const ratio = check.after / check.before;
    if (ratio < check.min || ratio > check.max) {
      return {
        metric: check.metric,
        before: round(check.before),
        after: round(check.after),
        ratio: round(ratio),
      };
    }
  }
  return null;
}

function visualArtifactDrift(
  beforeImage: HTMLImageElement,
  afterImage: HTMLImageElement,
  landmarks: Landmarks,
  procedures: readonly ProcedureDef[],
  finalStage: boolean
): ProcedurePreviewPostCheckReport["artifact"] | null {
  const box = targetBox(landmarks, procedures);
  if (!box) return null;
  const width = beforeImage.naturalWidth || beforeImage.width;
  const height = beforeImage.naturalHeight || beforeImage.height;
  if (width <= 0 || height <= 0) return null;

  const before = readPixels(beforeImage, width, height);
  const after = readPixels(afterImage, width, height);
  if (!before || !after) return null;

  const x0 = Math.max(0, Math.floor(box.x0 * width));
  const y0 = Math.max(0, Math.floor(box.y0 * height));
  const x1 = Math.min(width - 1, Math.ceil(box.x1 * width));
  const y1 = Math.min(height - 1, Math.ceil(box.y1 * height));
  let total = 0;
  let whitePixels = 0;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      total += 1;
      const i = (y * width + x) * 4;
      const br = before.data[i] ?? 0;
      const bg = before.data[i + 1] ?? 0;
      const bb = before.data[i + 2] ?? 0;
      const ar = after.data[i] ?? 0;
      const ag = after.data[i + 1] ?? 0;
      const ab = after.data[i + 2] ?? 0;
      const beforeLuma = luma(br, bg, bb);
      const afterLuma = luma(ar, ag, ab);
      const afterSaturation = saturation(ar, ag, ab);
      if (
        afterLuma >= 236 &&
        afterLuma - beforeLuma >= 55 &&
        afterSaturation <= 0.12
      ) {
        whitePixels += 1;
      }
    }
  }

  const threshold = Math.max(24, Math.round(total * 0.006));
  if (whitePixels > threshold) {
    return {
      metric: "white-target-artifact",
      pixels: whitePixels,
      threshold,
      ratio: round(whitePixels / Math.max(1, total)),
    };
  }

  if (finalStage && procedures.some((item) => item.key === "midface_support_filler")) {
    const band = midfaceHorizontalBandArtifact(before, after, landmarks);
    if (band) return band;
  }

  // Phase 618 — the two remaining mask-era detectors were measured (live
  // browser repro, chin/filler_chin runs) rejecting 3 of 4 legitimate
  // full-photo variants:
  //   - `low-saturation-target-artifact` (Phase 603) existed to catch the
  //     LEAKED GRAY MASK RECTANGLE the provider used to copy from the
  //     attached mask reference. No reference images are sent anymore
  //     (Phase 611), so there is no mask to leak — but a full-face regen
  //     routinely shifts >1.2% of near-neutral chin pixels past its
  //     colorDelta/luma gates (measured 0.013 vs 0.012 threshold), so the
  //     check now only fires on false positives. Removed.
  //   - `one-sided-chin-drift` (Phase 605) existed to catch a one-sided
  //     composite patch. With whole-face regeneration the per-side
  //     changed-pixel ratio is naturally asymmetric (measured ratios 3.0
  //     and 8.2 on visually symmetric, correct chin variants vs the 2.4
  //     threshold calibrated for composite output). Removed.
  //   - protectedAreaDrift (Phase 602/606 pixel budgets) was removed in
  //     Phase 611 for the same reason.
  // What still guards quality: after-face-missing, identityDrift
  // (same-person geometry bands), the white-artifact check above (letters
  // / white blobs are still a real model failure mode), and the
  // prompt-side identity + tone locks.
  return null;
}

function midfaceHorizontalBandArtifact(
  before: ImageData,
  after: ImageData,
  landmarks: Landmarks
): NonNullable<ProcedurePreviewPostCheckReport["artifact"]> | null {
  const rightCheek = point(landmarks, 50);
  const leftCheek = point(landmarks, 280);
  const rightEyeBottom = point(landmarks, 145);
  const leftEyeBottom = point(landmarks, 374);
  const mouthTop = point(landmarks, 13);
  if (!rightCheek || !leftCheek || !rightEyeBottom || !leftEyeBottom || !mouthTop) {
    return null;
  }
  const x0 = Math.max(0, Math.floor(Math.min(rightCheek.x, leftCheek.x) * before.width));
  const x1 = Math.min(before.width - 1, Math.ceil(Math.max(rightCheek.x, leftCheek.x) * before.width));
  const eyeBottom = Math.max(rightEyeBottom.y, leftEyeBottom.y);
  const y0 = Math.max(0, Math.floor(eyeBottom * before.height));
  const y1 = Math.min(before.height - 1, Math.ceil(mouthTop.y * before.height));
  const rows = Array.from({ length: Math.max(0, y1 - y0 + 1) }, (_, offset) =>
    horizontalBandRow(before, after, x0, x1, y0 + offset)
  );
  const maxBandHeight = Math.max(3, Math.min(24, Math.round(rows.length * 0.12)));
  let longestRatio = 0;
  let detectedBandHeight = 0;

  for (let height = 3; height <= maxBandHeight; height += 1) {
    for (let start = 1; start + height < rows.length; start += 1) {
      const segment = rows.slice(start, start + height);
      const coherentRatio = Math.min(...segment.map((row) => row.coherentRatio));
      if (coherentRatio < 0.7) continue;

      const segmentMean = meanBandRows(segment);
      if (bandSignalMagnitude(segmentMean) < 5.5) continue;
      const segmentVariation = segment.reduce(
        (sum, row) => sum + bandFeatureDistance(row, segmentMean),
        0
      ) / height;
      if (segmentVariation > 2.5) continue;

      const referenceDepth = Math.min(4, start, rows.length - start - height);
      if (referenceDepth < 1) continue;
      const adjacent = meanBandRows([
        ...rows.slice(start - referenceDepth, start),
        ...rows.slice(start + height, start + height + referenceDepth),
      ]);
      if (bandFeatureDistance(segmentMean, adjacent) < 5.5) continue;

      detectedBandHeight = height;
      longestRatio = Math.max(
        longestRatio,
        ...segment.map((row) => row.coherentRatio)
      );
      break;
    }
    if (detectedBandHeight > 0) break;
  }

  if (detectedBandHeight > 0) {
    return {
      metric: "horizontal-midface-band",
      pixels: detectedBandHeight,
      threshold: 3,
      ratio: round(longestRatio),
    };
  }
  return null;
}

type HorizontalBandRow = {
  lumaDelta: number;
  redGreenDelta: number;
  yellowBlueDelta: number;
  coherentRatio: number;
};

function horizontalBandRow(
  before: ImageData,
  after: ImageData,
  x0: number,
  x1: number,
  y: number
): HorizontalBandRow {
  const span = Math.max(1, x1 - x0 + 1);
  let lumaDelta = 0;
  let redGreenDelta = 0;
  let yellowBlueDelta = 0;
  const samples: Array<[number, number, number]> = [];

  for (let x = x0; x <= x1; x += 1) {
    const i = (y * before.width + x) * 4;
    const red = (after.data[i] ?? 0) - (before.data[i] ?? 0);
    const green = (after.data[i + 1] ?? 0) - (before.data[i + 1] ?? 0);
    const blue = (after.data[i + 2] ?? 0) - (before.data[i + 2] ?? 0);
    const dl = luma(red, green, blue);
    const rg = red - green;
    const yb = (red + green) / 2 - blue;
    samples.push([dl, rg, yb]);
    lumaDelta += dl;
    redGreenDelta += rg;
    yellowBlueDelta += yb;
  }

  const mean = {
    lumaDelta: lumaDelta / span,
    redGreenDelta: redGreenDelta / span,
    yellowBlueDelta: yellowBlueDelta / span,
    coherentRatio: 0,
  };
  const tolerance = Math.max(4.5, bandSignalMagnitude(mean) * 0.55);
  let run = 0;
  let longestRun = 0;
  for (const [dl, rg, yb] of samples) {
    const sample = {
      lumaDelta: dl,
      redGreenDelta: rg,
      yellowBlueDelta: yb,
      coherentRatio: 0,
    };
    if (
      bandSignalMagnitude(sample) >= 4 &&
      bandFeatureDistance(sample, mean) <= tolerance
    ) {
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 0;
    }
  }
  return { ...mean, coherentRatio: longestRun / span };
}

function meanBandRows(rows: readonly HorizontalBandRow[]): HorizontalBandRow {
  const count = Math.max(1, rows.length);
  return {
    lumaDelta: rows.reduce((sum, row) => sum + row.lumaDelta, 0) / count,
    redGreenDelta: rows.reduce((sum, row) => sum + row.redGreenDelta, 0) / count,
    yellowBlueDelta: rows.reduce((sum, row) => sum + row.yellowBlueDelta, 0) / count,
    coherentRatio: rows.reduce((sum, row) => sum + row.coherentRatio, 0) / count,
  };
}

function bandFeatureDistance(
  a: HorizontalBandRow,
  b: HorizontalBandRow
): number {
  return Math.hypot(
    a.lumaDelta - b.lumaDelta,
    (a.redGreenDelta - b.redGreenDelta) * 0.55,
    (a.yellowBlueDelta - b.yellowBlueDelta) * 0.55
  );
}

function bandSignalMagnitude(row: HorizontalBandRow): number {
  return Math.hypot(
    row.lumaDelta,
    row.redGreenDelta * 0.55,
    row.yellowBlueDelta * 0.55
  );
}

function normalizedBox(
  landmarks: Landmarks,
  indices: readonly number[],
  pad: number
): PixelBox | null {
  const points = indices
    .map((index) => point(landmarks, index))
    .filter((item): item is { x: number; y: number } => Boolean(item));
  if (points.length < 2) return null;
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  return {
    x0: clamp01(Math.min(...xs) - pad),
    y0: clamp01(Math.min(...ys) - pad),
    x1: clamp01(Math.max(...xs) + pad),
    y1: clamp01(Math.max(...ys) + pad),
  };
}

function readPixels(
  image: HTMLImageElement,
  width: number,
  height: number
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function targetBox(
  landmarks: Landmarks,
  procedures: readonly ProcedureDef[]
): { x0: number; y0: number; x1: number; y1: number } | null {
  const indices = [
    ...new Set(
      procedures.flatMap((procedure) =>
        previewRegionsForProcedure(procedure).regions.flatMap(
          (region) => REGION_INDICES[region]
        )
      )
    ),
  ];
  if (indices.length === 0) return null;
  const points = indices
    .map((index) => point(landmarks, index))
    .filter((item): item is { x: number; y: number } => !!item);
  if (points.length < 3) return null;
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max(0.025, (maxX - minX) * 0.35);
  const padY = Math.max(0.025, (maxY - minY) * 0.35);
  return {
    x0: clamp01(minX - padX),
    y0: clamp01(minY - padY),
    x1: clamp01(maxX + padX),
    y1: clamp01(maxY + padY),
  };
}

function luma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function geometry(landmarks: Landmarks):
  | {
      interEye: number;
      faceWidth: number;
      faceHeight: number;
      eyeToNose: number;
      noseToMouth: number;
    }
  | null {
  const rightEye = midpoint(landmarks, 33, 133);
  const leftEye = midpoint(landmarks, 263, 362);
  const nose = point(landmarks, 1);
  const mouth = midpoint(landmarks, 13, 14);
  const chin = point(landmarks, 152);
  const forehead = point(landmarks, 10);
  const rightCheek = point(landmarks, 234);
  const leftCheek = point(landmarks, 454);
  if (!rightEye || !leftEye || !nose || !mouth || !chin || !forehead || !rightCheek || !leftCheek) {
    return null;
  }
  const eyeMid = {
    x: (rightEye.x + leftEye.x) / 2,
    y: (rightEye.y + leftEye.y) / 2,
  };
  return {
    interEye: dist(rightEye, leftEye),
    faceWidth: dist(rightCheek, leftCheek),
    faceHeight: dist(forehead, chin),
    eyeToNose: dist(eyeMid, nose),
    noseToMouth: dist(nose, mouth),
  };
}

function point(
  landmarks: Landmarks,
  index: number
): { x: number; y: number } | null {
  const p = landmarks[index];
  return p ? { x: p.x, y: p.y } : null;
}

function midpoint(
  landmarks: Landmarks,
  a: number,
  b: number
): { x: number; y: number } | null {
  const pa = point(landmarks, a);
  const pb = point(landmarks, b);
  if (!pa || !pb) return null;
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
