/**
 * Phase 151 — Obedience check.
 *
 * Gemini 2.5 Flash Image (Nano Banana) is probabilistic. Even with the
 * strict "edit, don't regenerate" prompt structure from Phase 150 it
 * sometimes also tweaks lips, eyes, or skin tone when asked to only
 * change the chin. This module gives us an automated guardrail:
 *
 *   1. Define facial regions from MediaPipe landmarks (lips, eyes,
 *      brows, nose, chin, cheeks, forehead).
 *   2. After alignment, compute mean pixel diff per region between
 *      the original photo and the AI output (both in the same coord
 *      space, so the diff is meaningful per-region).
 *   3. Flag regions that changed when the procedure did NOT target
 *      them ("drift"). Severity ladder: none → minor → major.
 *
 * It also exports `renderDiffHeatmap` which paints the per-pixel diff
 * as an orange→red overlay for the "Show what changed" UI toggle.
 *
 * Why bboxes instead of polygons:
 *   - The user only sees a severity chip, not the actual mask.
 *   - Bboxes built from a tight landmark cluster are good enough to
 *     localize "did this region change a lot."
 *   - Polygon scanline tests would add complexity for marginal accuracy.
 *
 * Why MediaPipe re-detection:
 *   - We already detect on the before-image during `alignAfterToBeforeFace`
 *     in ai-gemini-image.ts. Callers can pass those landmarks in via
 *     `beforeLandmarks` to skip the second detection (~30ms saved).
 */

import type { Landmarks } from "@/types";
import { PROCEDURES, type ProcedureKey } from "./ai-procedure-catalog";
import {
  REGION_INDICES,
  previewRegionsForProcedure,
  type FaceRegionKey,
} from "./procedure-preview-contract";

export type { FaceRegionKey } from "./procedure-preview-contract";

// ============================================================================
// Region landmark clusters
// ============================================================================
//
// Each region is defined by a cluster of MediaPipe FaceLandmarker v2
// indices (478-point model). The diff computation uses the axis-aligned
// bounding box of those landmarks as the sampling area.
//
// Some adjacent regions overlap at their edges (e.g., chin shares a
// strip with the lower lip). That's intentional — the bbox is a coarse
// sampling area, and our threshold (~5%) tolerates a bit of edge noise.

const REGION_LANDMARK_INDICES = REGION_INDICES;

export const REGION_LABELS: Record<FaceRegionKey, { th: string; en: string }> =
  {
    lips: { th: "ปาก", en: "Lips" },
    leftEye: { th: "ตา (ซ้าย)", en: "Left eye" },
    rightEye: { th: "ตา (ขวา)", en: "Right eye" },
    leftIris: { th: "ม่านตา (ซ้าย)", en: "Left iris" },
    rightIris: { th: "ม่านตา (ขวา)", en: "Right iris" },
    leftUnderEye: { th: "ใต้ตา (ซ้าย)", en: "Left under-eye" },
    rightUnderEye: { th: "ใต้ตา (ขวา)", en: "Right under-eye" },
    leftUpperEyelid: { th: "เปลือกตาบน (ซ้าย)", en: "Left upper eyelid" },
    rightUpperEyelid: { th: "เปลือกตาบน (ขวา)", en: "Right upper eyelid" },
    leftOuterCanthus: { th: "หางตา (ซ้าย)", en: "Left outer canthus" },
    rightOuterCanthus: { th: "หางตา (ขวา)", en: "Right outer canthus" },
    leftCrowsFeet: { th: "รอยตีนกา (ซ้าย)", en: "Left crow's feet" },
    rightCrowsFeet: { th: "รอยตีนกา (ขวา)", en: "Right crow's feet" },
    leftNasolabial: { th: "ร่องแก้ม (ซ้าย)", en: "Left nasolabial fold" },
    rightNasolabial: { th: "ร่องแก้ม (ขวา)", en: "Right nasolabial fold" },
    leftBrow: { th: "คิ้ว (ซ้าย)", en: "Left brow" },
    rightBrow: { th: "คิ้ว (ขวา)", en: "Right brow" },
    nose: { th: "จมูก", en: "Nose" },
    chin: { th: "คาง", en: "Chin" },
    cheekLeft: { th: "แก้ม (ซ้าย)", en: "Left cheek" },
    cheekRight: { th: "แก้ม (ขวา)", en: "Right cheek" },
    forehead: { th: "หน้าผาก", en: "Forehead" },
  };

export const ALL_REGION_KEYS: readonly FaceRegionKey[] = Object.keys(
  REGION_LANDMARK_INDICES
) as FaceRegionKey[];

// ============================================================================
// Procedure → expected regions
// ============================================================================
//
// String-keyed (not ProcedureKey-typed) to avoid a circular import with
// ai-gemini-image.ts. The test asserts that every ProcedureKey in the
// canonical catalog has an entry here, so this stays in sync.

export interface ProcedureRegionMap {
  /** Regions the procedure should modify. Empty when `global` is true. */
  regions: FaceRegionKey[];
  /**
   * Procedures like skin_smoothing or facial_thinning touch the entire
   * face by design — we suppress drift detection for these and only
   * keep the per-region diff as informational data.
   */
  global: boolean;
}

export const PROCEDURE_REGION_MAP: Record<ProcedureKey, ProcedureRegionMap> =
  Object.fromEntries(
    PROCEDURES.map((procedure) => [
      procedure.key,
      previewRegionsForProcedure(procedure),
    ])
  ) as Record<ProcedureKey, ProcedureRegionMap>;

export function getProcedureRegions(key: string): ProcedureRegionMap {
  const mapped: ProcedureRegionMap | undefined =
    PROCEDURE_REGION_MAP[key as ProcedureKey];
  if (!mapped) throw new Error(`procedure-region-unmapped:${key}`);
  return mapped;
}

export function mergeProcedureRegions(keys: string[]): ProcedureRegionMap {
  const merged = new Set<FaceRegionKey>();
  let global = false;
  for (const k of keys) {
    const meta = getProcedureRegions(k);
    if (meta.global) global = true;
    for (const r of meta.regions) merged.add(r);
  }
  return { regions: [...merged], global };
}

export function hasOverlappingProcedureRegions(keys: readonly string[]): boolean {
  if (keys.length < 2) return false;
  const seen = new Set<FaceRegionKey>();
  for (const key of keys) {
    const meta = getProcedureRegions(key);
    if (meta.global) return true;
    for (const region of meta.regions) {
      if (seen.has(region)) return true;
      seen.add(region);
    }
  }
  return false;
}

// ============================================================================
// Report types
// ============================================================================

export type RegionDiff = {
  region: FaceRegionKey;
  /** Mean per-pixel RGB diff in 0..1 (Euclidean / sqrt(3)). */
  meanDiff: number;
  p90Diff: number;
  topTailMeanDiff: number;
  changedPixelRatio: number;
  pixelCount: number;
  isExpected: boolean;
};

export type DriftSeverity = "none" | "minor" | "major";

export type ObedienceReport = {
  expected: FaceRegionKey[];
  perRegion: RegionDiff[];
  /** Non-expected regions whose diff crossed the minor threshold. */
  drift: Array<{
    region: FaceRegionKey;
    meanDiff: number;
    p90Diff: number;
    topTailMeanDiff: number;
    changedPixelRatio: number;
    label: { th: string; en: string };
  }>;
  severity: DriftSeverity;
  /** The single largest non-expected diff (0..1). */
  maxDriftMeanDiff: number;
  /** Mean diff inside the expected regions — sanity check that the AI actually did the job. */
  expectedMeanDiff: number;
  /** True for whole-face procedures (skin_smoothing, facial_thinning). Drift suppressed. */
  global: boolean;
};

// Thresholds tuned against re-encoded JPEG baseline noise (~0.02-0.03)
// plus a margin. Override if user reports false positives.
export const MINOR_DRIFT_THRESHOLD = 0.05;
export const MAJOR_DRIFT_THRESHOLD = 0.11;
export const LOCALIZED_CHANGE_PIXEL_THRESHOLD = 0.14;
export const MINOR_CHANGED_PIXEL_RATIO = 0.015;
export const MAJOR_CHANGED_PIXEL_RATIO = 0.08;
export const MINOR_P90_THRESHOLD = 0.09;
export const MAJOR_P90_THRESHOLD = 0.24;
export const MINOR_TOP_TAIL_THRESHOLD = 0.16;
export const MAJOR_TOP_TAIL_THRESHOLD = 0.55;

// ============================================================================
// Pure computation (testable without browser canvas / MediaPipe)
// ============================================================================

export interface PureObedienceInput {
  landmarks: Landmarks;
  beforeData: ImageData;
  afterData: ImageData;
  expectedRegions: FaceRegionKey[];
  global: boolean;
}

export function computeObedienceReport(
  input: PureObedienceInput
): ObedienceReport {
  const { landmarks, beforeData, afterData, expectedRegions, global } = input;
  const w = beforeData.width;
  const h = beforeData.height;
  const expectedSet = expandedExpectedRegions(expectedRegions);
  const perRegion: RegionDiff[] = [];

  for (const region of ALL_REGION_KEYS) {
    const bbox = regionBbox(
      REGION_LANDMARK_INDICES[region],
      landmarks,
      w,
      h
    );
    if (!bbox) continue;
    const {
      meanDiff,
      p90Diff,
      topTailMeanDiff,
      changedPixelRatio,
      pixelCount,
    } = bboxRegionDiff(
      bbox,
      beforeData,
      afterData
    );
    perRegion.push({
      region,
      meanDiff,
      p90Diff,
      topTailMeanDiff,
      changedPixelRatio,
      pixelCount,
      isExpected: expectedSet.has(region),
    });
  }

  const driftCandidates = perRegion.filter((r) => !r.isExpected);
  const drift = driftCandidates
    .map((region) => ({ region, severity: regionDriftSeverity(region) }))
    .filter((item) => item.severity !== "none")
    .map((r) => ({
      region: r.region.region,
      meanDiff: r.region.meanDiff,
      p90Diff: r.region.p90Diff,
      topTailMeanDiff: r.region.topTailMeanDiff,
      changedPixelRatio: r.region.changedPixelRatio,
      severity: r.severity,
      label: REGION_LABELS[r.region.region],
    }))
    .sort((a, b) => {
      const rank = { none: 0, minor: 1, major: 2 } as const;
      return rank[b.severity] - rank[a.severity] ||
        b.topTailMeanDiff - a.topTailMeanDiff ||
        b.meanDiff - a.meanDiff;
    });

  const maxDriftMeanDiff = drift.reduce(
    (max, item) => Math.max(max, item.meanDiff),
    0
  );
  let severity: DriftSeverity = "none";
  if (!global) {
    if (drift.some((item) => item.severity === "major")) severity = "major";
    else if (drift.length > 0) severity = "minor";
  }

  const expectedDiffs = perRegion.filter((r) => r.isExpected);
  const expectedMeanDiff = expectedDiffs.length
    ? expectedDiffs.reduce((s, r) => s + r.meanDiff, 0) / expectedDiffs.length
    : 0;

  return {
    expected: expectedRegions,
    perRegion,
    drift,
    severity,
    maxDriftMeanDiff,
    expectedMeanDiff,
    global,
  };
}

function expandedExpectedRegions(
  regions: readonly FaceRegionKey[]
): Set<FaceRegionKey> {
  const expanded = new Set(regions);
  for (const region of regions) {
    if (
      region === "leftUnderEye" ||
      region === "leftUpperEyelid" ||
      region === "leftOuterCanthus" ||
      region === "leftCrowsFeet"
    ) {
      expanded.add("leftEye");
    }
    if (
      region === "rightUnderEye" ||
      region === "rightUpperEyelid" ||
      region === "rightOuterCanthus" ||
      region === "rightCrowsFeet"
    ) {
      expanded.add("rightEye");
    }
    if (region === "leftOuterCanthus") {
      expanded.add("leftUpperEyelid");
      expanded.add("leftCrowsFeet");
    }
    if (region === "rightOuterCanthus") {
      expanded.add("rightUpperEyelid");
      expanded.add("rightCrowsFeet");
    }
    if (region === "leftNasolabial") expanded.add("cheekLeft");
    if (region === "rightNasolabial") expanded.add("cheekRight");
  }
  return expanded;
}

function regionDriftSeverity(region: RegionDiff): DriftSeverity {
  const majorLocalized =
    region.changedPixelRatio >= MAJOR_CHANGED_PIXEL_RATIO &&
    region.topTailMeanDiff >= MAJOR_TOP_TAIL_THRESHOLD;
  if (
    region.meanDiff >= MAJOR_DRIFT_THRESHOLD ||
    region.p90Diff >= MAJOR_P90_THRESHOLD ||
    majorLocalized
  ) {
    return "major";
  }
  const minorLocalized =
    region.changedPixelRatio >= MINOR_CHANGED_PIXEL_RATIO &&
    region.topTailMeanDiff >= MINOR_TOP_TAIL_THRESHOLD;
  if (
    region.meanDiff >= MINOR_DRIFT_THRESHOLD ||
    region.p90Diff >= MINOR_P90_THRESHOLD ||
    minorLocalized
  ) {
    return "minor";
  }
  return "none";
}

// ============================================================================
// Async wrapper — loads images + landmarks then runs the pure check
// ============================================================================

export interface ObedienceCheckInput {
  beforeImage: HTMLImageElement;
  alignedAfterUrl: string;
  expectedRegions: FaceRegionKey[];
  global?: boolean;
  /** Optional pre-detected landmarks for the before image. Skips re-detection. */
  beforeLandmarks?: Landmarks;
}

export async function runObedienceCheck(
  input: ObedienceCheckInput
): Promise<ObedienceReport | null> {
  const {
    beforeImage,
    alignedAfterUrl,
    expectedRegions,
    global = false,
  } = input;

  const w = beforeImage.naturalWidth || beforeImage.width;
  const h = beforeImage.naturalHeight || beforeImage.height;
  if (w <= 0 || h <= 0) return null;

  const afterImg = await loadImage(alignedAfterUrl);
  if (!afterImg) return null;

  let landmarks: Landmarks | null | undefined = input.beforeLandmarks;
  if (!landmarks) {
    try {
      const mod = await import("./mediapipe/face-mesh");
      const detector = await mod.FaceMeshDetector.load();
      try {
        const det = detector.detect(beforeImage);
        landmarks = det?.landmarks;
      } finally {
        try {
          detector.dispose();
        } catch {
          /* no-op */
        }
      }
    } catch {
      return null;
    }
  }
  if (!landmarks || landmarks.length < 478) return null;

  const beforeData = imageToData(beforeImage, w, h);
  const afterData = imageToData(afterImg, w, h);
  if (!beforeData || !afterData) return null;

  return computeObedienceReport({
    landmarks,
    beforeData,
    afterData,
    expectedRegions,
    global,
  });
}

// ============================================================================
// Heatmap renderer for "Show what changed" UI overlay
// ============================================================================

/**
 * Paint a per-pixel diff heatmap (orange → red) for the changed pixels.
 * Pixels below `NOISE_FLOOR` are transparent so the overlay only colors
 * actual changes. Returns a PNG data URL ready to drop into <img>.
 */
export async function renderDiffHeatmap(
  beforeImage: HTMLImageElement,
  alignedAfterUrl: string
): Promise<string | null> {
  const w = beforeImage.naturalWidth || beforeImage.width;
  const h = beforeImage.naturalHeight || beforeImage.height;
  if (w <= 0 || h <= 0) return null;

  const afterImg = await loadImage(alignedAfterUrl);
  if (!afterImg) return null;

  const beforeData = imageToData(beforeImage, w, h);
  const afterData = imageToData(afterImg, w, h);
  if (!beforeData || !afterData) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const heat = ctx.createImageData(w, h);
  const hData = heat.data;
  const bData = beforeData.data;
  const aData = afterData.data;
  const total = w * h;

  const NOISE_FLOOR = 0.04;
  const SATURATION = 0.18;

  for (let p = 0; p < total; p++) {
    const i = p * 4;
    const dr = ((bData[i] ?? 0) - (aData[i] ?? 0)) / 255;
    const dg = ((bData[i + 1] ?? 0) - (aData[i + 1] ?? 0)) / 255;
    const db = ((bData[i + 2] ?? 0) - (aData[i + 2] ?? 0)) / 255;
    const d = Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
    if (d < NOISE_FLOOR) {
      hData[i] = 0;
      hData[i + 1] = 0;
      hData[i + 2] = 0;
      hData[i + 3] = 0;
      continue;
    }
    const t = Math.min(
      1,
      (d - NOISE_FLOOR) / (SATURATION - NOISE_FLOOR)
    );
    // Gradient: warm amber → saturated red as diff grows.
    const r = 255;
    const g = Math.round(180 * (1 - t) + 40 * t);
    const b = Math.round(50 * (1 - t) + 30 * t);
    hData[i] = r;
    hData[i + 1] = g;
    hData[i + 2] = b;
    hData[i + 3] = Math.round(120 + 110 * t);
  }
  ctx.putImageData(heat, 0, 0);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

// ============================================================================
// Internal helpers (exported for tests)
// ============================================================================

export function regionBbox(
  indices: readonly number[],
  landmarks: Landmarks,
  w: number,
  h: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const i of indices) {
    const lm = landmarks[i];
    if (!lm) continue;
    const x = lm.x * w;
    const y = lm.y * h;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    count++;
  }
  if (count < 2) return null;
  return {
    minX: Math.max(0, Math.floor(minX)),
    minY: Math.max(0, Math.floor(minY)),
    maxX: Math.min(w - 1, Math.ceil(maxX)),
    maxY: Math.min(h - 1, Math.ceil(maxY)),
  };
}

export function bboxRegionDiff(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  before: ImageData,
  after: ImageData
): {
  meanDiff: number;
  p90Diff: number;
  topTailMeanDiff: number;
  changedPixelRatio: number;
  pixelCount: number;
} {
  const W = before.width;
  const bData = before.data;
  const aData = after.data;
  let sum = 0;
  let changed = 0;
  let count = 0;
  const diffs: number[] = [];
  for (let y = bbox.minY; y <= bbox.maxY; y++) {
    for (let x = bbox.minX; x <= bbox.maxX; x++) {
      const i = (y * W + x) * 4;
      const dr = ((bData[i] ?? 0) - (aData[i] ?? 0)) / 255;
      const dg = ((bData[i + 1] ?? 0) - (aData[i + 1] ?? 0)) / 255;
      const db = ((bData[i + 2] ?? 0) - (aData[i + 2] ?? 0)) / 255;
      const d = Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
      sum += d;
      diffs.push(d);
      if (d >= LOCALIZED_CHANGE_PIXEL_THRESHOLD) changed++;
      count++;
    }
  }
  if (count === 0) {
    return {
      meanDiff: 0,
      p90Diff: 0,
      topTailMeanDiff: 0,
      changedPixelRatio: 0,
      pixelCount: 0,
    };
  }
  diffs.sort((a, b) => a - b);
  const p90Index = Math.min(count - 1, Math.floor(count * 0.9));
  const tailCount = Math.max(1, Math.ceil(count * 0.05));
  let tailSum = 0;
  for (let i = count - tailCount; i < count; i++) {
    tailSum += diffs[i] ?? 0;
  }
  return {
    meanDiff: sum / count,
    p90Diff: diffs[p90Index] ?? 0,
    topTailMeanDiff: tailSum / tailCount,
    changedPixelRatio: changed / count,
    pixelCount: count,
  };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

function imageToData(
  img: HTMLImageElement,
  w: number,
  h: number
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
