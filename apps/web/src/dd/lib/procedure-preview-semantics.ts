import type { Landmarks } from "@/types";
import type {
  Intensity,
  ProcedureDef,
  ProcedureKey,
} from "./ai-procedure-catalog";
import {
  REGION_INDICES,
  previewRegionsForProcedure,
  type FaceRegionKey,
} from "./procedure-preview-contract";
export type ProcedureSemanticCode =
  | "ok"
  | "effect-not-applicable"
  | "effect-too-weak"
  | "effect-too-strong"
  | "effect-wrong-direction"
  | "effect-unverifiable"
  | "unsupported-input";

export interface ProcedureEffectStats {
  procedureKey: ProcedureKey;
  meanDiff: number;
  changedRatio: number;
  p90Diff: number;
  beforeEdgeEnergy: number;
  afterEdgeEnergy: number;
  beforeMeanLuma: number;
  afterMeanLuma: number;
  controlMeanDiff: number;
  beforeControlEdgeEnergy: number;
  afterControlEdgeEnergy: number;
  beforeControlMeanLuma: number;
  afterControlMeanLuma: number;
  beforeDirectionalRidgeEnergy: number;
  afterDirectionalRidgeEnergy: number;
  beforeControlDirectionalRidgeEnergy: number;
  afterControlDirectionalRidgeEnergy: number;
  beforeCenterMeanLuma: number;
  afterCenterMeanLuma: number;
  sideBeforeEdgeEnergy: readonly number[];
  sideAfterEdgeEnergy: readonly number[];
  sideBeforeDirectionalRidgeEnergy: readonly number[];
  sideAfterDirectionalRidgeEnergy: readonly number[];
  sideBeforeControlDirectionalRidgeEnergy: readonly number[];
  sideAfterControlDirectionalRidgeEnergy: readonly number[];
  sideBeforeMeanLuma: readonly number[];
  sideAfterMeanLuma: readonly number[];
  sideBeforeCenterMeanLuma: readonly number[];
  sideAfterCenterMeanLuma: readonly number[];
  sideMeanDiff: readonly number[];
  sideCenterMeanDiff: readonly number[];
}

export interface ProcedureDirectionReport {
  metric: string;
  before: number;
  after: number;
  ratio: number;
  passed: boolean;
}

export interface ProcedureSemanticReport {
  ok: boolean;
  code: ProcedureSemanticCode;
  procedureKey?: ProcedureKey;
  stats?: ProcedureEffectStats;
  baseline?: ProcedureDirectionReport;
  direction?: ProcedureDirectionReport;
}

const THIN_LINE_KEYS = new Set<ProcedureKey>([
  "double_eyelid",
  "botox_crows_feet",
  "filler_nasolabial",
  "botox_forehead",
  "botox_glabellar",
]);

const EDGE_REDUCTION_KEYS = new Set<ProcedureKey>([
  "eye_bag_removal",
  "under_eye_rejuvenation",
  "under_eye_fat_repositioning",
  "botox_crows_feet",
  "filler_nasolabial",
  "botox_forehead",
  "botox_glabellar",
]);

const BILATERAL_EDGE_REDUCTION_KEYS = new Set<ProcedureKey>([
  "eye_bag_removal",
  "under_eye_rejuvenation",
  "under_eye_fat_repositioning",
  "botox_crows_feet",
  "filler_nasolabial",
]);

const GEOMETRY_KEYS = new Set<ProcedureKey>([
  "rhinoplasty",
  "tip_refinement",
  "alar_reduction",
  "nose_filler",
  "canthoplasty",
  "chin_augmentation",
  "filler_chin",
  "genioplasty_consult",
  "jaw_reduction",
  "v_line_surgery",
  "botox_masseter",
  "thread_lift_consult",
  "cheekbone_reduction",
  "buccal_fat",
  "midface_support_filler",
  "temple_filler",
]);

const LUMA_VOLUME_DIRECTION_KEYS = new Set<ProcedureKey>([
  "nose_filler",
  "filler_tear_trough",
  "forehead_volume_consult",
  "midface_support_filler",
]);

const LINE_BASELINE_KEYS = new Set<ProcedureKey>([
  "botox_crows_feet",
  "botox_forehead",
  "botox_glabellar",
]);

export function validateProcedurePreviewSemantics(input: {
  beforeImage: HTMLImageElement;
  afterImage: HTMLImageElement;
  beforeLandmarks: Landmarks;
  afterLandmarks: Landmarks;
  procedures: readonly ProcedureDef[];
  intensity?: Intensity;
}): ProcedureSemanticReport {
  const beforeWidth = input.beforeImage.naturalWidth || input.beforeImage.width;
  const beforeHeight = input.beforeImage.naturalHeight || input.beforeImage.height;
  const afterWidth = input.afterImage.naturalWidth || input.afterImage.width;
  const width = Math.min(768, beforeWidth, afterWidth);
  const height = Math.round(width * beforeHeight / Math.max(1, beforeWidth));
  if (width <= 0 || height <= 0) return { ok: false, code: "effect-unverifiable" };
  const before = readPixels(input.beforeImage, width, height);
  const after = readPixels(input.afterImage, width, height);
  if (!before || !after) return { ok: false, code: "effect-unverifiable" };
  const intensity = input.intensity ?? "normal";
  let verifiedDirection: ProcedureDirectionReport | undefined;
  let verifiedStats: ProcedureEffectStats | undefined;

  for (const procedure of input.procedures) {
    if (procedure.key === "body_fat_reduction") {
      return {
        ok: false,
        code: "unsupported-input",
        procedureKey: procedure.key,
      };
    }
    const regions = previewRegionsForProcedure(procedure).regions;
    if (regions.length === 0) {
      return {
        ok: false,
        code: "effect-unverifiable",
        procedureKey: procedure.key,
      };
    }
    const stats = computeProcedureEffectStats(
      before,
      after,
      input.beforeLandmarks,
      regions,
      procedure.key
    );
    if (!stats) {
      return {
        ok: false,
        code: "effect-unverifiable",
        procedureKey: procedure.key,
      };
    }
    const baseline = visibleBaselineEvidence(procedure.key, stats);
    if (baseline && !baseline.passed) {
      return {
        ok: false,
        code: "effect-not-applicable",
        procedureKey: procedure.key,
        stats,
        baseline,
      };
    }
    if (!isMeaningfulProcedureEffect(procedure.key, intensity, stats)) {
      return {
        ok: false,
        code: "effect-too-weak",
        procedureKey: procedure.key,
        stats,
      };
    }
    if (!isPlausibleProcedureEffect(procedure.key, intensity, stats)) {
      return {
        ok: false,
        code: "effect-too-strong",
        procedureKey: procedure.key,
        stats,
      };
    }
    if (EDGE_REDUCTION_KEYS.has(procedure.key)) {
      const direction = edgeReductionIsLocalized(
        procedure.key,
        stats,
        intensity,
        BILATERAL_EDGE_REDUCTION_KEYS.has(procedure.key),
        LINE_BASELINE_KEYS.has(procedure.key)
      );
      if (!direction.passed) {
        return {
          ok: false,
          code: "effect-wrong-direction",
          procedureKey: procedure.key,
          stats,
          direction,
        };
      }
      verifiedDirection = direction;
    }
    if (procedure.key === "double_eyelid") {
      const direction = bilateralEdgeIncreaseIsBetter(stats);
      if (!direction.passed) {
        return {
          ok: false,
          code: "effect-wrong-direction",
          procedureKey: procedure.key,
          stats,
          direction,
        };
      }
      verifiedDirection = direction;
    }
    let direction = measureProcedureDirection(
      procedure.key,
      input.beforeLandmarks,
      input.afterLandmarks,
      intensity
    );
    if (LUMA_VOLUME_DIRECTION_KEYS.has(procedure.key)) {
      const volumeDirection = volumeHighlightIsBetter(
        stats,
        intensity,
        procedure.key === "filler_tear_trough" ||
          procedure.key === "midface_support_filler"
      );
      if (!volumeDirection.passed) {
        return {
          ok: false,
          code: "effect-wrong-direction",
          procedureKey: procedure.key,
          stats,
          direction: volumeDirection,
        };
      }
      if (!direction) direction = volumeDirection;
    }
    if (direction && !direction.passed) {
      return {
        ok: false,
        code: "effect-wrong-direction",
        procedureKey: procedure.key,
        stats,
        direction,
      };
    }
    if (direction) verifiedDirection = direction;
    if (GEOMETRY_KEYS.has(procedure.key) && !direction) {
      return {
        ok: false,
        code: "effect-unverifiable",
        procedureKey: procedure.key,
        stats,
      };
    }
    verifiedStats = stats;
  }
  return {
    ok: true,
    code: "ok",
    ...(verifiedStats
      ? { procedureKey: verifiedStats.procedureKey, stats: verifiedStats }
      : {}),
    ...(verifiedDirection ? { direction: verifiedDirection } : {}),
  };
}

export function visibleBaselineEvidence(
  key: ProcedureKey,
  stats: Pick<
    ProcedureEffectStats,
    | "beforeEdgeEnergy"
    | "beforeControlEdgeEnergy"
    | "beforeDirectionalRidgeEnergy"
    | "beforeControlDirectionalRidgeEnergy"
    | "sideBeforeDirectionalRidgeEnergy"
    | "sideBeforeControlDirectionalRidgeEnergy"
  >
): ProcedureDirectionReport | null {
  if (!LINE_BASELINE_KEYS.has(key)) return null;
  const edgeRatio = stats.beforeEdgeEnergy /
    Math.max(stats.beforeControlEdgeEnergy, 0.0001);
  const targets = stats.sideBeforeDirectionalRidgeEnergy.length > 0
    ? stats.sideBeforeDirectionalRidgeEnergy
    : [stats.beforeDirectionalRidgeEnergy];
  const controls = stats.sideBeforeControlDirectionalRidgeEnergy.length > 0
    ? stats.sideBeforeControlDirectionalRidgeEnergy
    : [stats.beforeControlDirectionalRidgeEnergy];
  const requiredSides = key === "botox_crows_feet" ? 2 : 1;
  const ratios = targets.slice(0, requiredSides).map((target, index) =>
    target / Math.max(controls[index] ?? stats.beforeControlDirectionalRidgeEnergy, 0.05)
  );
  const directionalTarget = Math.min(...targets.slice(0, requiredSides));
  const directionalControl = Math.max(...controls.slice(0, requiredSides));
  const ratio = Math.min(...ratios);
  const hasEverySide = targets.length >= requiredSides &&
    controls.length >= requiredSides;
  const relativeEvidence = directionalTarget >= 0.05 && ratio >= 1.05 &&
    edgeRatio >= 0.85;
  const strongAbsoluteEvidence = directionalTarget >= 2.5;
  return {
    metric: "visible_oriented_line_baseline",
    before: round(directionalTarget),
    after: round(directionalControl),
    ratio: round(ratio),
    passed: hasEverySide && (relativeEvidence || strongAbsoluteEvidence),
  };
}

export function assessProcedureBaseline(input: {
  image: HTMLImageElement;
  landmarks: Landmarks;
  procedure: ProcedureDef;
}): ProcedureDirectionReport | null {
  if (!LINE_BASELINE_KEYS.has(input.procedure.key)) return null;
  const sourceWidth = input.image.naturalWidth || input.image.width;
  const sourceHeight = input.image.naturalHeight || input.image.height;
  const width = Math.min(768, sourceWidth);
  const height = Math.round(width * sourceHeight / Math.max(1, sourceWidth));
  if (width <= 0 || height <= 0) return null;
  const before = readPixels(input.image, width, height);
  if (!before) return null;
  const stats = computeProcedureEffectStats(
    before,
    before,
    input.landmarks,
    previewRegionsForProcedure(input.procedure).regions,
    input.procedure.key
  );
  return stats ? visibleBaselineEvidence(input.procedure.key, stats) : null;
}

export function isMeaningfulProcedureEffect(
  key: ProcedureKey,
  intensity: Intensity,
  stats: Pick<ProcedureEffectStats, "meanDiff" | "changedRatio" | "p90Diff">
): boolean {
  const threshold = meaningfulThreshold(key, intensity);
  return stats.meanDiff >= threshold.meanDiff &&
    stats.changedRatio >= threshold.changedRatio;
}

export function isPlausibleProcedureEffect(
  key: ProcedureKey,
  intensity: Intensity,
  stats: Pick<ProcedureEffectStats, "meanDiff" | "changedRatio" | "p90Diff">
): boolean {
  const maximum = plausibleMaximum(key, intensity);
  return stats.meanDiff <= maximum.meanDiff &&
    stats.changedRatio <= maximum.changedRatio &&
    stats.p90Diff <= maximum.p90Diff;
}

export function measureProcedureDirection(
  key: ProcedureKey,
  before: Landmarks,
  after: Landmarks,
  intensity: Intensity
): ProcedureDirectionReport | null {
  const threshold = intensity === "mild" ? 0.0015 : intensity === "strong" ? 0.004 : 0.0025;
  const liftThreshold = intensity === "mild" ? 0.0025 : intensity === "strong" ? 0.005 : 0.0035;
  const maximum = intensity === "mild" ? 0.09 : intensity === "strong" ? 0.18 : 0.13;
  const maximumLift = intensity === "mild" ? 0.035 : intensity === "strong" ? 0.075 : 0.055;
  switch (key) {
    case "rhinoplasty":
    case "tip_refinement":
    case "nose_filler":
      return bilateralHorizontalIsBetter(
        "tip_width",
        before,
        after,
        98,
        327,
        "inward",
        threshold,
        maximum
      );
    case "alar_reduction":
      return bilateralHorizontalIsBetter(
        "alar_width",
        before,
        after,
        129,
        358,
        "inward",
        threshold,
        maximum
      );
    case "canthoplasty":
      return canthalWidthAndLiftAreBetter(
        before,
        after,
        threshold,
        maximum,
        liftThreshold,
        maximumLift
      );
    case "chin_augmentation":
    case "filler_chin":
    case "genioplasty_consult":
      return frontalChinShapeIsBetter(before, after, threshold, maximum);
    case "jaw_reduction":
    case "v_line_surgery":
      return bilateralHorizontalIsBetter("lower_jaw_width", before, after, 172, 397, "inward", threshold, maximum);
    case "botox_masseter":
      return bilateralHorizontalIsBetter("masseter_width", before, after, 136, 365, "inward", threshold, maximum);
    case "cheekbone_reduction":
      return bilateralHorizontalIsBetter("cheekbone_width", before, after, 234, 454, "inward", threshold, maximum);
    case "buccal_fat":
      return bilateralHorizontalIsBetter("mid_cheek_width", before, after, 132, 361, "inward", threshold, maximum);
    case "thread_lift_consult":
      return bilateralRelativeLiftIsBetter(
        "lower_cheek_lift",
        before,
        after,
        [132, 172],
        [361, 397],
        [33, 133, 1],
        [263, 362, 1],
        liftThreshold,
        maximumLift
      );
    case "midface_support_filler":
      return bilateralHorizontalIsBetter(
        "malar_projection",
        before,
        after,
        234,
        454,
        "outward",
        threshold,
        maximum
      );
    case "temple_filler":
      return bilateralHorizontalIsBetter("temple_width", before, after, 127, 356, "outward", threshold, maximum);
    default:
      return null;
  }
}

export function computeProcedureEffectStats(
  before: ImageData,
  after: ImageData,
  landmarks: Landmarks,
  regions: readonly FaceRegionKey[],
  procedureKey: ProcedureKey
): ProcedureEffectStats | null {
  const ellipses = procedureKey === "filler_nasolabial"
    ? [
        lineRegionEllipse(landmarks, 129, 61, before.width, before.height),
        lineRegionEllipse(landmarks, 358, 291, before.width, before.height),
      ]
    : procedureKey === "botox_crows_feet"
      ? [
          outerEyeLineEllipse(landmarks, 33, -1, before.width, before.height),
          outerEyeLineEllipse(landmarks, 263, 1, before.width, before.height),
        ]
      : procedureKey === "botox_forehead"
        ? [foreheadLineEllipse(landmarks, before.width, before.height)]
        : procedureKey === "botox_glabellar"
          ? [glabellarLineEllipse(landmarks, before.width, before.height)]
        : regions.map((region) =>
            regionEllipse(REGION_INDICES[region], landmarks, before.width, before.height)
          );
  const validEllipses = ellipses.filter(
    (item): item is RegionEllipse => item !== null
  );
  if (validEllipses.length === 0) return null;
  const edgeEllipses = procedureKey === "double_eyelid"
    ? [
        upperLidCreaseEllipse(landmarks, [33, 133, 159, 160], before.width, before.height),
        upperLidCreaseEllipse(landmarks, [263, 362, 386, 385], before.width, before.height),
      ].filter((item): item is RegionEllipse => item !== null)
    : validEllipses;
  const creaseEllipses = procedureKey === "double_eyelid"
    ? [
        upperLidFoldEllipse(landmarks, [33, 133, 159, 160], before.width, before.height),
        upperLidFoldEllipse(landmarks, [263, 362, 386, 385], before.width, before.height),
      ].filter((item): item is RegionEllipse => item !== null)
    : [];
  const bounds = ellipseBounds(validEllipses, before.width, before.height, 1.65);
  const histogram = new Uint32Array(101);
  const sideBeforeEdges = edgeEllipses.map(() => 0);
  const sideAfterEdges = edgeEllipses.map(() => 0);
  const sideEdgeCounts = edgeEllipses.map(() => 0);
  const sideBeforeDirectional = edgeEllipses.map(() => 0);
  const sideAfterDirectional = edgeEllipses.map(() => 0);
  const sideDirectionalCounts = edgeEllipses.map(() => 0);
  const sideBeforeControlDirectional = edgeEllipses.map(() => 0);
  const sideAfterControlDirectional = edgeEllipses.map(() => 0);
  const sideControlDirectionalCounts = edgeEllipses.map(() => 0);
  const sideBeforeLuma = validEllipses.map(() => 0);
  const sideAfterLuma = validEllipses.map(() => 0);
  const sideLumaCounts = validEllipses.map(() => 0);
  const sideBeforeCenterLuma = validEllipses.map(() => 0);
  const sideAfterCenterLuma = validEllipses.map(() => 0);
  const sideCenterCounts = validEllipses.map(() => 0);
  const sideDiffTotals = validEllipses.map(() => 0);
  const sideDiffCounts = validEllipses.map(() => 0);
  const sideCenterDiffTotals = validEllipses.map(() => 0);
  let diffTotal = 0;
  let changed = 0;
  let count = 0;
  let beforeEdges = 0;
  let afterEdges = 0;
  let beforeLuma = 0;
  let afterLuma = 0;
  let edgeCount = 0;
  let controlDiff = 0;
  let controlBeforeEdges = 0;
  let controlAfterEdges = 0;
  let controlBeforeLuma = 0;
  let controlAfterLuma = 0;
  let controlCount = 0;
  let beforeDirectional = 0;
  let afterDirectional = 0;
  let directionalCount = 0;
  let controlBeforeDirectional = 0;
  let controlAfterDirectional = 0;
  let controlDirectionalCount = 0;
  let centerBeforeLuma = 0;
  let centerAfterLuma = 0;
  let centerCount = 0;
  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const inTarget = validEllipses.some((ellipse) => insideEllipse(x, y, ellipse));
      if (!inTarget) {
        const controlIndex = validEllipses.findIndex((ellipse) =>
          insideControlRing(x, y, ellipse)
        );
        if (controlIndex < 0) continue;
        controlDiff += pixelDiff(before.data, after.data, before.width, x, y);
        controlBeforeEdges += edgeAt(before.data, before.width, before.height, x, y);
        controlAfterEdges += edgeAt(after.data, after.width, after.height, x, y);
        controlBeforeLuma += lumaAt(before.data, before.width, x, y);
        controlAfterLuma += lumaAt(after.data, after.width, x, y);
        controlCount += 1;
        if (LINE_BASELINE_KEYS.has(procedureKey)) {
          const ellipse = validEllipses[controlIndex];
          if (ellipse) {
            const beforeRidge = directionalDarkRidgeAt(
              before.data,
              before.width,
              before.height,
              x,
              y,
              procedureKey,
              landmarks,
              ellipse
            );
            const afterRidge = directionalDarkRidgeAt(
              after.data,
              after.width,
              after.height,
              x,
              y,
              procedureKey,
              landmarks,
              ellipse
            );
            controlBeforeDirectional += beforeRidge;
            controlAfterDirectional += afterRidge;
            controlDirectionalCount += 1;
            sideBeforeControlDirectional[controlIndex] =
              (sideBeforeControlDirectional[controlIndex] ?? 0) + beforeRidge;
            sideAfterControlDirectional[controlIndex] =
              (sideAfterControlDirectional[controlIndex] ?? 0) + afterRidge;
            sideControlDirectionalCounts[controlIndex] =
              (sideControlDirectionalCounts[controlIndex] ?? 0) + 1;
          }
        }
        continue;
      }
      const diff = pixelDiff(before.data, after.data, before.width, x, y);
      beforeLuma += lumaAt(before.data, before.width, x, y);
      afterLuma += lumaAt(after.data, after.width, x, y);
      validEllipses.forEach((ellipse, index) => {
        if (!insideEllipse(x, y, ellipse)) return;
        sideBeforeLuma[index] = (sideBeforeLuma[index] ?? 0) +
          lumaAt(before.data, before.width, x, y);
        sideAfterLuma[index] = (sideAfterLuma[index] ?? 0) +
          lumaAt(after.data, after.width, x, y);
        sideLumaCounts[index] = (sideLumaCounts[index] ?? 0) + 1;
        sideDiffTotals[index] = (sideDiffTotals[index] ?? 0) + diff;
        sideDiffCounts[index] = (sideDiffCounts[index] ?? 0) + 1;
        if (ellipseRadiusSquared(x, y, ellipse) > 0.25) return;
        sideBeforeCenterLuma[index] = (sideBeforeCenterLuma[index] ?? 0) +
          lumaAt(before.data, before.width, x, y);
        sideAfterCenterLuma[index] = (sideAfterCenterLuma[index] ?? 0) +
          lumaAt(after.data, after.width, x, y);
        sideCenterDiffTotals[index] = (sideCenterDiffTotals[index] ?? 0) + diff;
        sideCenterCounts[index] = (sideCenterCounts[index] ?? 0) + 1;
      });
      diffTotal += diff;
      if (diff >= 0.01) changed += 1;
      histogram[Math.min(100, Math.floor(diff * 100))] =
        (histogram[Math.min(100, Math.floor(diff * 100))] ?? 0) + 1;
      let inEdgeRegion = false;
      edgeEllipses.forEach((ellipse, index) => {
        if (!insideEllipse(x, y, ellipse)) return;
        const beforeEdge = edgeAt(before.data, before.width, before.height, x, y);
        const afterEdge = edgeAt(after.data, after.width, after.height, x, y);
        sideBeforeEdges[index] = (sideBeforeEdges[index] ?? 0) + beforeEdge;
        sideAfterEdges[index] = (sideAfterEdges[index] ?? 0) + afterEdge;
        sideEdgeCounts[index] = (sideEdgeCounts[index] ?? 0) + 1;
        if (LINE_BASELINE_KEYS.has(procedureKey)) {
          const beforeRidge = directionalDarkRidgeAt(
            before.data,
            before.width,
            before.height,
            x,
            y,
            procedureKey,
            landmarks,
            ellipse
          );
          const afterRidge = directionalDarkRidgeAt(
            after.data,
            after.width,
            after.height,
            x,
            y,
            procedureKey,
            landmarks,
            ellipse
          );
          sideBeforeDirectional[index] =
            (sideBeforeDirectional[index] ?? 0) + beforeRidge;
          sideAfterDirectional[index] =
            (sideAfterDirectional[index] ?? 0) + afterRidge;
          sideDirectionalCounts[index] =
            (sideDirectionalCounts[index] ?? 0) + 1;
          beforeDirectional += beforeRidge;
          afterDirectional += afterRidge;
          directionalCount += 1;
        }
        inEdgeRegion = true;
      });
      if (inEdgeRegion) {
        beforeEdges += edgeAt(before.data, before.width, before.height, x, y);
        afterEdges += edgeAt(after.data, after.width, after.height, x, y);
        edgeCount += 1;
      }
      if (validEllipses.some((ellipse) => ellipseRadiusSquared(x, y, ellipse) <= 0.25)) {
        centerBeforeLuma += lumaAt(before.data, before.width, x, y);
        centerAfterLuma += lumaAt(after.data, after.width, x, y);
        centerCount += 1;
      }
      count += 1;
    }
  }
  if (count === 0) return null;
  const creaseBefore = creaseEllipses.map((ellipse) =>
    foldContrast(before.data, before.width, before.height, ellipse)
  );
  const creaseAfter = creaseEllipses.map((ellipse) =>
    foldContrast(after.data, after.width, after.height, ellipse)
  );
  return {
    procedureKey,
    meanDiff: diffTotal / count,
    changedRatio: changed / count,
    p90Diff: histogramPercentile(histogram, count, 0.9) / 100,
    beforeEdgeEnergy: beforeEdges / Math.max(1, edgeCount),
    afterEdgeEnergy: afterEdges / Math.max(1, edgeCount),
    beforeMeanLuma: beforeLuma / count,
    afterMeanLuma: afterLuma / count,
    controlMeanDiff: controlDiff / Math.max(1, controlCount),
    beforeControlEdgeEnergy: controlBeforeEdges / Math.max(1, controlCount),
    afterControlEdgeEnergy: controlAfterEdges / Math.max(1, controlCount),
    beforeControlMeanLuma: controlBeforeLuma / Math.max(1, controlCount),
    afterControlMeanLuma: controlAfterLuma / Math.max(1, controlCount),
    beforeDirectionalRidgeEnergy: beforeDirectional /
      Math.max(1, directionalCount),
    afterDirectionalRidgeEnergy: afterDirectional /
      Math.max(1, directionalCount),
    beforeControlDirectionalRidgeEnergy: controlBeforeDirectional /
      Math.max(1, controlDirectionalCount),
    afterControlDirectionalRidgeEnergy: controlAfterDirectional /
      Math.max(1, controlDirectionalCount),
    beforeCenterMeanLuma: centerBeforeLuma / Math.max(1, centerCount),
    afterCenterMeanLuma: centerAfterLuma / Math.max(1, centerCount),
    sideBeforeEdgeEnergy: sideBeforeEdges.map((value, index) =>
      value / Math.max(1, sideEdgeCounts[index] ?? 0)
    ),
    sideAfterEdgeEnergy: sideAfterEdges.map((value, index) =>
      value / Math.max(1, sideEdgeCounts[index] ?? 0)
    ),
    sideBeforeDirectionalRidgeEnergy: procedureKey === "double_eyelid"
      ? creaseBefore
      : sideBeforeDirectional.map((value, index) =>
          value / Math.max(1, sideDirectionalCounts[index] ?? 0)
        ),
    sideAfterDirectionalRidgeEnergy: procedureKey === "double_eyelid"
      ? creaseAfter
      : sideAfterDirectional.map((value, index) =>
          value / Math.max(1, sideDirectionalCounts[index] ?? 0)
        ),
    sideBeforeControlDirectionalRidgeEnergy: sideBeforeControlDirectional.map(
      (value, index) => value /
        Math.max(1, sideControlDirectionalCounts[index] ?? 0)
    ),
    sideAfterControlDirectionalRidgeEnergy: sideAfterControlDirectional.map(
      (value, index) => value /
        Math.max(1, sideControlDirectionalCounts[index] ?? 0)
    ),
    sideBeforeMeanLuma: sideBeforeLuma.map((value, index) =>
      value / Math.max(1, sideLumaCounts[index] ?? 0)
    ),
    sideAfterMeanLuma: sideAfterLuma.map((value, index) =>
      value / Math.max(1, sideLumaCounts[index] ?? 0)
    ),
    sideBeforeCenterMeanLuma: sideBeforeCenterLuma.map((value, index) =>
      value / Math.max(1, sideCenterCounts[index] ?? 0)
    ),
    sideAfterCenterMeanLuma: sideAfterCenterLuma.map((value, index) =>
      value / Math.max(1, sideCenterCounts[index] ?? 0)
    ),
    sideMeanDiff: sideDiffTotals.map((value, index) =>
      value / Math.max(1, sideDiffCounts[index] ?? 0)
    ),
    sideCenterMeanDiff: sideCenterDiffTotals.map((value, index) =>
      value / Math.max(1, sideCenterCounts[index] ?? 0)
    ),
  };
}

interface RegionEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
}

function regionEllipse(
  indices: readonly number[],
  landmarks: Landmarks,
  width: number,
  height: number
): RegionEllipse | null {
  const points = indices.map((index) => landmarks[index]).filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (points.length < 2) return null;
  const xs = points.map((item) => item.x * width);
  const ys = points.map((item) => item.y * height);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: Math.max(5, (maxX - minX) * 0.75),
    ry: Math.max(5, (maxY - minY) * 0.9, (maxX - minX) * 0.2),
    rotation: 0,
  };
}

function lineRegionEllipse(
  landmarks: Landmarks,
  startIndex: number,
  endIndex: number,
  width: number,
  height: number
): RegionEllipse | null {
  const start = landmarks[startIndex];
  const end = landmarks[endIndex];
  if (!start || !end) return null;
  const ax = start.x * width;
  const ay = start.y * height;
  const bx = end.x * width;
  const by = end.y * height;
  const length = Math.hypot(bx - ax, by - ay);
  return {
    cx: (ax + bx) / 2,
    cy: (ay + by) / 2,
    rx: Math.max(6, length * 0.72),
    ry: Math.max(5, length * 0.38),
    rotation: Math.atan2(by - ay, bx - ax),
  };
}

function upperLidCreaseEllipse(
  landmarks: Landmarks,
  indices: readonly number[],
  width: number,
  height: number
): RegionEllipse | null {
  const points = indices
    .map((index) => landmarks[index])
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (points.length < 2) return null;
  const xs = points.map((item) => item.x * width);
  const ys = points.map((item) => item.y * height);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const baseRy = Math.max(2, (maxY - minY) * 0.9);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2 - baseRy * 1.03,
    rx: Math.max(5, (maxX - minX) * 0.56),
    ry: Math.max(2, baseRy * 0.24),
    rotation: 0,
  };
}

function upperLidFoldEllipse(
  landmarks: Landmarks,
  indices: readonly number[],
  width: number,
  height: number
): RegionEllipse | null {
  const points = indices
    .map((index) => landmarks[index])
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (points.length < 2) return null;
  const xs = points.map((item) => item.x * width);
  const ys = points.map((item) => item.y * height);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const ry = Math.max(height * 0.008, (maxY - minY) * 0.9);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2 - ry * 0.95,
    rx: Math.max(width * 0.012, (maxX - minX) * 0.56),
    ry,
    rotation: 0,
  };
}

function foldContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ellipse: RegionEllipse
): number {
  const x0 = Math.max(0, Math.floor(ellipse.cx - ellipse.rx));
  const x1 = Math.min(width - 1, Math.ceil(ellipse.cx + ellipse.rx));
  const y0 = Math.max(0, Math.floor(ellipse.cy - ellipse.ry));
  const y1 = Math.min(height - 1, Math.ceil(ellipse.cy + ellipse.ry));
  let darkTotal = 0;
  let darkWeight = 0;
  let lightTotal = 0;
  let lightWeight = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const u = (x - ellipse.cx) / ellipse.rx;
      const v = (y - ellipse.cy) / ellipse.ry;
      if (u * u + v * v >= 1) continue;
      const horizontalWeight = 1 - u * u;
      const dark = Math.exp(-((v + 0.07) ** 2) / 0.005) * horizontalWeight;
      const light = Math.exp(-((v - 0.13) ** 2) / 0.016) * horizontalWeight;
      const value = lumaAt(data, width, x, y);
      darkTotal += value * dark;
      darkWeight += dark;
      lightTotal += value * light;
      lightWeight += light;
    }
  }
  if (darkWeight <= 0.0001 || lightWeight <= 0.0001) return 0;
  return lightTotal / lightWeight - darkTotal / darkWeight;
}

function outerEyeLineEllipse(
  landmarks: Landmarks,
  outerIndex: number,
  direction: -1 | 1,
  width: number,
  height: number
): RegionEllipse {
  const outer = point(landmarks, outerIndex);
  const rightCheek = point(landmarks, 234);
  const leftCheek = point(landmarks, 454);
  const boundaryX = outerIndex === 33
    ? (point(landmarks, 127).x + rightCheek.x) / 2
    : (point(landmarks, 356).x + leftCheek.x) / 2;
  const forehead = point(landmarks, 10);
  const chin = point(landmarks, 152);
  const faceWidth = Math.hypot(
    (rightCheek.x - leftCheek.x) * width,
    (rightCheek.y - leftCheek.y) * height
  );
  const faceHeight = Math.hypot(
    (forehead.x - chin.x) * width,
    (forehead.y - chin.y) * height
  );
  const lateralGap = Math.abs(outer.x - boundaryX) * width;
  return {
    cx: outer.x * width + direction * lateralGap * 0.35,
    cy: outer.y * height,
    rx: Math.max(6, faceWidth * 0.025, lateralGap * 0.4),
    ry: Math.max(5, faceHeight * 0.025),
    rotation: 0,
  };
}

function foreheadLineEllipse(
  landmarks: Landmarks,
  width: number,
  height: number
): RegionEllipse {
  const top = point(landmarks, 10);
  const browY = meanY(
    landmarks,
    [70, 63, 105, 66, 107, 300, 293, 334, 296, 336]
  );
  const rightCheek = point(landmarks, 234);
  const leftCheek = point(landmarks, 454);
  const faceWidth = Math.hypot(
    (rightCheek.x - leftCheek.x) * width,
    (rightCheek.y - leftCheek.y) * height
  );
  const span = Math.max(8, (browY - top.y) * height);
  return {
    cx: (rightCheek.x + leftCheek.x) * 0.5 * width,
    cy: top.y * height + span * 0.58,
    rx: Math.max(8, faceWidth * 0.28),
    ry: Math.max(5, span * 0.22),
    rotation: 0,
  };
}

function glabellarLineEllipse(
  landmarks: Landmarks,
  width: number,
  height: number
): RegionEllipse {
  const firstInnerBrow = point(landmarks, 107);
  const secondInnerBrow = point(landmarks, 336);
  const bridge = point(landmarks, 168);
  const forehead = point(landmarks, 10);
  const chin = point(landmarks, 152);
  const rightCheek = point(landmarks, 234);
  const leftCheek = point(landmarks, 454);
  const faceWidth = Math.hypot(
    (rightCheek.x - leftCheek.x) * width,
    (rightCheek.y - leftCheek.y) * height
  );
  const faceHeight = Math.hypot(
    (forehead.x - chin.x) * width,
    (forehead.y - chin.y) * height
  );
  const browY = (firstInnerBrow.y + secondInnerBrow.y) * 0.5;
  return {
    cx: (firstInnerBrow.x + secondInnerBrow.x) * 0.5 * width,
    cy: (browY * 0.6 + bridge.y * 0.4) * height,
    rx: Math.max(5, faceWidth * 0.045),
    ry: Math.max(7, faceHeight * 0.07),
    rotation: 0,
  };
}

function ellipseBounds(
  ellipses: readonly RegionEllipse[],
  width: number,
  height: number,
  scale = 1
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, Math.floor(Math.min(...ellipses.map((item) => item.cx - Math.max(item.rx, item.ry) * scale)))),
    y0: Math.max(0, Math.floor(Math.min(...ellipses.map((item) => item.cy - Math.max(item.rx, item.ry) * scale)))),
    x1: Math.min(width - 1, Math.ceil(Math.max(...ellipses.map((item) => item.cx + Math.max(item.rx, item.ry) * scale)))),
    y1: Math.min(height - 1, Math.ceil(Math.max(...ellipses.map((item) => item.cy + Math.max(item.rx, item.ry) * scale)))),
  };
}

function insideEllipse(x: number, y: number, ellipse: RegionEllipse): boolean {
  return ellipseRadiusSquared(x, y, ellipse) <= 1;
}

function insideControlRing(x: number, y: number, ellipse: RegionEllipse): boolean {
  const radiusSquared = ellipseRadiusSquared(x, y, ellipse);
  return radiusSquared >= 1.21 && radiusSquared <= 2.7225;
}

function ellipseRadiusSquared(x: number, y: number, ellipse: RegionEllipse): number {
  const dx = x - ellipse.cx;
  const dy = y - ellipse.cy;
  const cos = Math.cos(ellipse.rotation);
  const sin = Math.sin(ellipse.rotation);
  const u = (dx * cos + dy * sin) / ellipse.rx;
  const v = (-dx * sin + dy * cos) / ellipse.ry;
  return u * u + v * v;
}

function meaningfulThreshold(
  key: ProcedureKey,
  intensity: Intensity
): { meanDiff: number; changedRatio: number; p90Diff: number } {
  const scale = intensity === "mild" ? 0.72 : intensity === "strong" ? 1.22 : 1;
  if (THIN_LINE_KEYS.has(key)) {
    return {
      meanDiff: 0.0006 * scale,
      changedRatio: 0.006 * scale,
      p90Diff: 0,
    };
  }
  if (key === "botox_masseter") {
    return {
      meanDiff: 0.0007 * scale,
      changedRatio: 0.025 * scale,
      p90Diff: 0,
    };
  }
  if (GEOMETRY_KEYS.has(key)) {
    return {
      meanDiff: 0.0015 * scale,
      changedRatio: 0.04 * scale,
      p90Diff: 0,
    };
  }
  return {
    meanDiff: 0.0015 * scale,
    changedRatio: 0.045 * scale,
    p90Diff: 0,
  };
}

function plausibleMaximum(
  key: ProcedureKey,
  intensity: Intensity
): { meanDiff: number; changedRatio: number; p90Diff: number } {
  const scale = intensity === "mild" ? 0.8 : intensity === "strong" ? 1.2 : 1;
  if (key === "botox_crows_feet") {
    return {
      meanDiff: 0.08 * scale,
      changedRatio: Math.min(0.92, 0.84 * scale),
      p90Diff: 0.28 * scale,
    };
  }
  if (THIN_LINE_KEYS.has(key)) {
    return {
      meanDiff: 0.08 * scale,
      changedRatio: Math.min(0.72, 0.56 * scale),
      p90Diff: 0.28 * scale,
    };
  }
  if (GEOMETRY_KEYS.has(key)) {
    if (key === "canthoplasty") {
      return {
        meanDiff: 0.14 * scale,
        changedRatio: Math.min(0.94, 0.88 * scale),
        p90Diff: 0.42 * scale,
      };
    }
    return {
      meanDiff: 0.14 * scale,
      changedRatio: Math.min(0.9, 0.78 * scale),
      p90Diff: 0.42 * scale,
    };
  }
  return {
    meanDiff: 0.16 * scale,
    changedRatio: Math.min(0.92, 0.84 * scale),
    p90Diff: 0.5 * scale,
  };
}

function bilateralHorizontalIsBetter(
  metric: string,
  before: Landmarks,
  after: Landmarks,
  firstIndex: number,
  secondIndex: number,
  direction: "inward" | "outward",
  threshold: number,
  maximum: number
): ProcedureDirectionReport {
  const beforeCenter = meanX(before, [1, 4, 152]);
  const afterCenter = meanX(after, [1, 4, 152]);
  const beforeSides = [
    Math.abs(point(before, firstIndex).x - beforeCenter),
    Math.abs(point(before, secondIndex).x - beforeCenter),
  ];
  const afterSides = [
    Math.abs(point(after, firstIndex).x - afterCenter),
    Math.abs(point(after, secondIndex).x - afterCenter),
  ];
  const changes = beforeSides.map((value, index) => {
    const ratio = value > 0 ? (afterSides[index] ?? value) / value : 1;
    return direction === "inward" ? 1 - ratio : ratio - 1;
  });
  const asymmetryCap = Math.max(threshold * 3, Math.min(maximum * 0.3, 0.04));
  const passed = changes.every((value) => value >= threshold && value <= maximum) &&
    Math.abs((changes[0] ?? 0) - (changes[1] ?? 0)) <= asymmetryCap;
  const beforeMean = mean(beforeSides);
  const afterMean = mean(afterSides);
  return {
    metric,
    before: round(beforeMean),
    after: round(afterMean),
    ratio: round(Math.min(...changes)),
    passed,
  };
}

function higherIsBetter(
  metric: string,
  before: number,
  after: number,
  threshold: number,
  maximum: number
): ProcedureDirectionReport {
  const ratio = before > 0 ? after / before : 1;
  return {
    metric,
    before: round(before),
    after: round(after),
    ratio: round(ratio),
    passed: ratio >= 1 + threshold && ratio <= 1 + maximum,
  };
}

function bilateralRelativeLiftIsBetter(
  metric: string,
  beforeLandmarks: Landmarks,
  afterLandmarks: Landmarks,
  firstTargets: readonly number[],
  secondTargets: readonly number[],
  firstAnchors: readonly number[],
  secondAnchors: readonly number[],
  threshold: number,
  maximum: number
): ProcedureDirectionReport {
  const scale = Math.max(distance(beforeLandmarks, 10, 152), 0.0001);
  const beforeGaps = [
    meanY(beforeLandmarks, firstTargets) - meanY(beforeLandmarks, firstAnchors),
    meanY(beforeLandmarks, secondTargets) - meanY(beforeLandmarks, secondAnchors),
  ].map((value) => value / scale);
  const afterGaps = [
    meanY(afterLandmarks, firstTargets) - meanY(afterLandmarks, firstAnchors),
    meanY(afterLandmarks, secondTargets) - meanY(afterLandmarks, secondAnchors),
  ].map((value) => value / scale);
  const improvements = beforeGaps.map((value, index) =>
    value - (afterGaps[index] ?? value)
  );
  const asymmetryCap = Math.max(threshold * 2, Math.min(maximum * 0.3, 0.018));
  const passed = improvements.every((value) => value >= threshold && value <= maximum) &&
    Math.abs((improvements[0] ?? 0) - (improvements[1] ?? 0)) <= asymmetryCap;
  return {
    metric,
    before: round(mean(beforeGaps)),
    after: round(mean(afterGaps)),
    ratio: round(Math.min(...improvements)),
    passed,
  };
}

function canthalWidthAndLiftAreBetter(
  before: Landmarks,
  after: Landmarks,
  widthThreshold: number,
  maximumWidth: number,
  liftThreshold: number,
  maximumLift: number
): ProcedureDirectionReport {
  const beforeWidths = [distance(before, 33, 133), distance(before, 263, 362)];
  const afterWidths = [distance(after, 33, 133), distance(after, 263, 362)];
  const widthGains = beforeWidths.map((value, index) =>
    value > 0 ? (afterWidths[index] ?? value) / value - 1 : 0
  );
  const faceHeight = Math.max(distance(before, 10, 152), 0.0001);
  const beforeOffsets = [
    point(before, 33).y - point(before, 133).y,
    point(before, 263).y - point(before, 362).y,
  ];
  const afterOffsets = [
    point(after, 33).y - point(after, 133).y,
    point(after, 263).y - point(after, 362).y,
  ];
  const lifts = beforeOffsets.map((value, index) =>
    (value - (afterOffsets[index] ?? value)) / faceHeight
  );
  const widthAsymmetryCap = Math.max(widthThreshold * 3, Math.min(maximumWidth * 0.3, 0.04));
  const liftAsymmetryCap = Math.max(liftThreshold * 2, Math.min(maximumLift * 0.3, 0.018));
  const combined = Math.min(...widthGains, ...lifts);
  return {
    metric: "canthal_width_and_lift",
    before: 0,
    after: round(combined),
    ratio: round(combined),
    passed: widthGains.every((value) => value >= widthThreshold && value <= maximumWidth) &&
      lifts.every((value) => value >= liftThreshold && value <= maximumLift) &&
      Math.abs((widthGains[0] ?? 0) - (widthGains[1] ?? 0)) <= widthAsymmetryCap &&
      Math.abs((lifts[0] ?? 0) - (lifts[1] ?? 0)) <= liftAsymmetryCap,
  };
}

function frontalChinShapeIsBetter(
  before: Landmarks,
  after: Landmarks,
  threshold: number,
  maximum: number
): ProcedureDirectionReport {
  const beforeLength = verticalGap(before, [13, 14], [152]);
  const afterLength = verticalGap(after, [13, 14], [152]);
  const lengthRatio = beforeLength > 0 ? afterLength / beforeLength : 1;
  const beforeWidth = Math.abs(point(before, 377).x - point(before, 148).x);
  const afterWidth = Math.abs(point(after, 377).x - point(after, 148).x);
  const widthRatio = beforeWidth > 0 ? afterWidth / beforeWidth : 0;
  const minimumLengthGain = Math.max(threshold, 0.006);
  const maximumLengthGain = Math.min(Math.max(maximum, 0.18), 0.22);
  return {
    metric: "frontal_chin_length_width_retention",
    before: round(beforeLength),
    after: round(afterLength),
    ratio: round(lengthRatio),
    passed: lengthRatio >= 1 + minimumLengthGain &&
      lengthRatio <= 1 + maximumLengthGain &&
      widthRatio >= 0.98 &&
      widthRatio <= 1.04,
  };
}

function edgeReductionIsLocalized(
  key: ProcedureKey,
  stats: ProcedureEffectStats,
  intensity: Intensity,
  bilateral: boolean,
  directional: boolean
): ProcedureDirectionReport {
  const maximumRatio = intensity === "mild" ? 0.999 : intensity === "strong" ? 0.994 : 0.997;
  const minimumRetention = intensity === "mild" ? 0.42 : intensity === "strong" ? 0.22 : 0.3;
  const beforeTarget = directional
    ? stats.beforeDirectionalRidgeEnergy
    : stats.beforeEdgeEnergy;
  const afterTarget = directional
    ? stats.afterDirectionalRidgeEnergy
    : stats.afterEdgeEnergy;
  const beforeControl = directional
    ? stats.beforeControlDirectionalRidgeEnergy
    : stats.beforeControlEdgeEnergy;
  const afterControl = directional
    ? stats.afterControlDirectionalRidgeEnergy
    : stats.afterControlEdgeEnergy;
  const sideBefore = directional
    ? stats.sideBeforeDirectionalRidgeEnergy
    : stats.sideBeforeEdgeEnergy;
  const sideAfter = directional
    ? stats.sideAfterDirectionalRidgeEnergy
    : stats.sideAfterEdgeEnergy;
  const targetRatio = beforeTarget > 0
    ? afterTarget / beforeTarget
    : 1;
  const controlRatio = beforeControl > 0.0001
    ? afterControl / beforeControl
    : 1;
  const targetReduction = 1 - targetRatio;
  const controlReduction = 1 - controlRatio;
  const localizedDiff = stats.meanDiff >= stats.controlMeanDiff * 1.2 + 0.0002;
  const localizedReduction = targetReduction >= controlReduction + 0.0015;
  const spatialEvidence = key === "botox_forehead"
    ? targetReduction >= 0.03
    : localizedDiff && localizedReduction;
  const sideRatios = sideBefore.map((value, index) =>
    value > 0.0001 ? (sideAfter[index] ?? value) / value : 1
  );
  const sideReductions = sideRatios.map((ratio) => 1 - ratio);
  const bilateralPassed = !bilateral || (
    sideRatios.length >= 2 &&
    sideRatios.every((ratio) => ratio <= maximumRatio && ratio >= minimumRetention) &&
    Math.abs((sideReductions[0] ?? 0) - (sideReductions[1] ?? 0)) <= 0.3
  );
  return {
    metric: directional
      ? "localized_directional_ridge_reduction"
      : "localized_edge_reduction",
    before: round(beforeTarget),
    after: round(afterTarget),
    ratio: round(targetRatio),
    passed: targetRatio <= maximumRatio &&
      targetRatio >= minimumRetention &&
      spatialEvidence &&
      bilateralPassed,
  };
}

function bilateralEdgeIncreaseIsBetter(
  stats: ProcedureEffectStats
): ProcedureDirectionReport {
  const gains = stats.sideBeforeDirectionalRidgeEnergy.map((value, index) =>
    (stats.sideAfterDirectionalRidgeEnergy[index] ?? value) - value
  );
  const minimumGain = gains.length > 0 ? Math.min(...gains) : 0;
  const maximumGain = gains.length > 0 ? Math.max(...gains) : 0;
  const bilateralBalance = maximumGain > 0 &&
    minimumGain / maximumGain >= 0.35;
  return {
    metric: "upper_lid_edge_energy_bilateral",
    before: round(mean(stats.sideBeforeDirectionalRidgeEnergy)),
    after: round(mean(stats.sideAfterDirectionalRidgeEnergy)),
    ratio: round(1 + minimumGain / 255),
    passed: gains.length >= 2 &&
      gains.every((gain) => gain >= 1) &&
      bilateralBalance,
  };
}

function volumeHighlightIsBetter(
  stats: ProcedureEffectStats,
  intensity: Intensity,
  bilateral: boolean
): ProcedureDirectionReport {
  const minimum = intensity === "mild" ? 0.0015 : intensity === "strong" ? 0.003 : 0.002;
  const maximum = intensity === "mild" ? 0.045 : intensity === "strong" ? 0.09 : 0.065;
  const change = (stats.afterMeanLuma - stats.beforeMeanLuma) / 255;
  const controlChange = (stats.afterControlMeanLuma - stats.beforeControlMeanLuma) / 255;
  const centerChange = (stats.afterCenterMeanLuma - stats.beforeCenterMeanLuma) / 255;
  const localizedChange = change - controlChange;
  const centerBias = centerChange - change;
  const textureRatio = stats.beforeEdgeEnergy > 0.0001
    ? stats.afterEdgeEnergy / stats.beforeEdgeEnergy
    : 0;
  const sideChanges = stats.sideBeforeMeanLuma.map((value, index) =>
    ((stats.sideAfterMeanLuma[index] ?? value) - value) / 255
  );
  const sideCenterBiases = stats.sideBeforeCenterMeanLuma.map((value, index) => {
    const centerChange = ((stats.sideAfterCenterMeanLuma[index] ?? value) - value) / 255;
    return centerChange - (sideChanges[index] ?? 0);
  });
  const bilateralPassed = !bilateral || (
    sideChanges.length >= 2 &&
    sideChanges.every((value) => value >= minimum * 0.75 && value <= maximum) &&
    sideCenterBiases.every((value) => value >= minimum * 0.2) &&
    Math.abs((sideChanges[0] ?? 0) - (sideChanges[1] ?? 0)) <=
      Math.max(minimum * 2, maximum * 0.3)
  );
  return {
    metric: "localized_volume_highlight",
    before: round(stats.beforeMeanLuma),
    after: round(stats.afterMeanLuma),
    ratio: round(localizedChange),
    passed: change >= minimum && change <= maximum &&
      localizedChange >= minimum * 0.75 &&
      centerBias >= minimum * 0.35 &&
      textureRatio >= 0.55 && textureRatio <= 1.85 &&
      stats.meanDiff >= stats.controlMeanDiff * 1.2 + 0.0002 &&
      bilateralPassed,
  };
}

function readPixels(image: HTMLImageElement, width: number, height: number): ImageData | null {
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

function pixelDiff(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
): number {
  const i = (y * width + x) * 4;
  const dr = ((before[i] ?? 0) - (after[i] ?? 0)) / 255;
  const dg = ((before[i + 1] ?? 0) - (after[i + 1] ?? 0)) / 255;
  const db = ((before[i + 2] ?? 0) - (after[i + 2] ?? 0)) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
}

function edgeAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const xr = Math.min(width - 1, x + 1);
  const yd = Math.min(height - 1, y + 1);
  return Math.abs(lumaAt(data, width, xr, y) - lumaAt(data, width, x, y)) +
    Math.abs(lumaAt(data, width, x, yd) - lumaAt(data, width, x, y));
}

function directionalDarkRidgeAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  key: ProcedureKey,
  landmarks: Landmarks,
  ellipse: RegionEllipse
): number {
  const tangent = expectedLineTangent(key, landmarks, ellipse, x, y, width, height);
  const normal = { x: -tangent.y, y: tangent.x };
  const center = lumaAt(data, width, x, y);
  let best = 0;
  for (const scale of [1, 2, 3]) {
    const normalMean = (
      sampleLuma(data, width, height, x + normal.x * scale, y + normal.y * scale) +
      sampleLuma(data, width, height, x - normal.x * scale, y - normal.y * scale)
    ) * 0.5;
    const tangentMean = (
      sampleLuma(data, width, height, x + tangent.x * scale, y + tangent.y * scale) +
      sampleLuma(data, width, height, x - tangent.x * scale, y - tangent.y * scale)
    ) * 0.5;
    const darkRidge = normalMean - center;
    const alongLineVariation = Math.abs(tangentMean - center);
    best = Math.max(best, darkRidge - alongLineVariation * 0.5);
  }
  return Math.max(0, best);
}

function expectedLineTangent(
  key: ProcedureKey,
  landmarks: Landmarks,
  ellipse: RegionEllipse,
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  if (key === "botox_glabellar") return { x: 0, y: 1 };
  if (key !== "botox_crows_feet") return { x: 1, y: 0 };
  const outerIndices = [33, 263] as const;
  const outer = outerIndices
    .map((index) => point(landmarks, index))
    .map((item) => ({ x: item.x * width, y: item.y * height }))
    .sort((first, second) =>
      Math.hypot(first.x - ellipse.cx, first.y - ellipse.cy) -
      Math.hypot(second.x - ellipse.cx, second.y - ellipse.cy)
    )[0];
  if (!outer) return { x: 1, y: 0 };
  const dx = x - outer.x;
  const dy = y - outer.y;
  const length = Math.hypot(dx, dy);
  return length >= 0.5 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
}

function sampleLuma(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  return lumaAt(
    data,
    width,
    Math.max(0, Math.min(width - 1, Math.round(x))),
    Math.max(0, Math.min(height - 1, Math.round(y)))
  );
}

function lumaAt(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const i = (y * width + x) * 4;
  return (data[i] ?? 0) * 0.2126 + (data[i + 1] ?? 0) * 0.7152 + (data[i + 2] ?? 0) * 0.0722;
}

function histogramPercentile(histogram: Uint32Array, total: number, percentile: number): number {
  const target = Math.ceil(total * percentile);
  let seen = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    seen += histogram[i] ?? 0;
    if (seen >= target) return i;
  }
  return histogram.length - 1;
}

function point(landmarks: Landmarks, index: number): { x: number; y: number } {
  const value = landmarks[index];
  return { x: value?.x ?? 0, y: value?.y ?? 0 };
}

function distance(landmarks: Landmarks, a: number, b: number): number {
  return distancePoint(point(landmarks, a), point(landmarks, b));
}

function verticalGap(
  landmarks: Landmarks,
  upper: readonly number[],
  lower: readonly number[]
): number {
  const scale = Math.max(distance(landmarks, 33, 263), 0.0001);
  return (meanY(landmarks, lower) - meanY(landmarks, upper)) / scale;
}

function distancePoint(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function meanY(landmarks: Landmarks, indices: readonly number[]): number {
  return indices.reduce((sum, index) => sum + point(landmarks, index).y, 0) / indices.length;
}

function meanX(landmarks: Landmarks, indices: readonly number[]): number {
  return indices.reduce((sum, index) => sum + point(landmarks, index).x, 0) / indices.length;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
