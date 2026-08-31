/**
 * Surgery preview client helpers.
 *
 * Client code sends typed procedure keys plus image bytes to server routes.
 * Provider keys, model prompts, quota burn, retry, and refunds stay backend-side.
 */

import type { Gender } from "@/types";
import type { RecommendMetricsSummary } from "./recommend-metrics-summary";
import {
  reserveQuotaSlot,
  releaseQuotaSlot,
  type QuotaReservation,
} from "@/lib/quota";
import { setSubscriptionCache } from "@/lib/subscription-cache";
import type { SubscriptionRow } from "@/lib/supabase/types";
// ---------- Procedure presets ----------

import {
  MAX_COMBO_PROCEDURES,
  PROCEDURES,
  coreProcedureKeys,
  findProcedure,
  findProcedureInfo,
  type Intensity,
  type ProcedureDef,
  type ProcedureInfo,
  type ProcedureKey,
} from "./ai-procedure-catalog";
import {
  anchorsFromLandmarks,
  buildPreviewEditContract,
  mergePreviewEditContracts,
  previewRegionsForProcedure,
  type PreviewEditContract,
} from "./procedure-preview-contract";
import {
  applyMembraneColorOffsets,
  computeSectorColorDeltas,
  estimateSimilarityTransform,
  type SimilarityTransform,
} from "./image-align";
import {
  detectPreviewLandmarks,
  procedureTargetCropPayload,
  type ProcedureMaskPayload,
  type ProcedureTargetCropPayload,
} from "./procedure-mask";
import { type ProcedureTargetGuidePayload } from "./procedure-target-guide";
import {
  procedureVariantOptions,
  type ProcedureVariantId,
  type ProcedureVariantOption,
} from "./procedure-variant-options";
import { applyProcedureEffectPlans } from "./procedure-preview-effects";
import {
  assertProcedurePreviewPostCheck,
  validateProcedurePreviewPostCheck,
} from "./procedure-preview-postcheck";
import { assessProcedureBaseline } from "./procedure-preview-semantics";

const PROVIDER_PREVIEW_BLEND = Object.freeze({
  A: 0.24,
  B: 0.34,
  C: 0.44,
  D: 0.54,
} satisfies Record<ProcedureVariantId, number>);

function providerPreviewBlend(variant: ProcedureVariantId | undefined): number {
  return variant ? PROVIDER_PREVIEW_BLEND[variant] : 0.45;
}
export {
  MAX_COMBO_PROCEDURES,
  PROCEDURES,
  PROCEDURE_INFO,
  findProcedure,
  findProcedureInfo,
  formatBaht,
  parseCostRange,
  summarizeSelection,
} from "./ai-procedure-catalog";
export type {
  Intensity,
  ProcedureCategory,
  ProcedureDef,
  ProcedureInfo,
  ProcedureKey,
  ProcedureKind,
  SelectionSummary,
} from "./ai-procedure-catalog";
export type { ProcedureVariantId, ProcedureVariantOption } from "./procedure-variant-options";


const MAXPLUS_4K_PORTRAIT_WIDTH = 2160;
const MAXPLUS_4K_PORTRAIT_HEIGHT = 3840;
const MAXPLUS_4K_PORTRAIT_ASPECT = MAXPLUS_4K_PORTRAIT_WIDTH / MAXPLUS_4K_PORTRAIT_HEIGHT;

export function isMaxPlus4KPortrait(width: number, height: number): boolean {
  if (width < MAXPLUS_4K_PORTRAIT_WIDTH || height < MAXPLUS_4K_PORTRAIT_HEIGHT) return false;
  return Math.abs(width / height - MAXPLUS_4K_PORTRAIT_ASPECT) <= 0.015;
}

const CLIENT_IMAGE_DECODE_TIMEOUT_MS = 8_000;

async function loadHtmlImage(
  url: string,
  timeoutMs = CLIENT_IMAGE_DECODE_TIMEOUT_MS
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      im.onload = null;
      im.onerror = null;
      resolve(value);
    };
    const timeout = setTimeout(() => finish(null), timeoutMs);
    im.onload = () => finish(im);
    im.onerror = () => finish(null);
    im.src = url;
  });
}

/**
 * Phase 619 — shared crop-window math. `imageToPortraitBase64Jpeg` uses
 * this to decide what rectangle of the source photo actually gets sent
 * to Gemini as the reference image; `alignAfterToBeforeFace` uses the
 * SAME rectangle to know exactly where in the full photo the AI's output
 * belongs. Keeping one function means the two can never drift apart
 * again (see ADR for the Phase 619 root-cause writeup).
 */
function computePortraitCropRect(
  w: number,
  h: number,
  targetAspect = 9 / 16
): { sx: number; sy: number; sw: number; sh: number } {
  const sourceAspect = w / h;
  const sw = sourceAspect > targetAspect ? Math.round(h * targetAspect) : w;
  const sh = sourceAspect > targetAspect ? h : Math.round(w / targetAspect);
  const sx = Math.max(0, Math.round((w - sw) / 2));
  const sy = Math.max(0, Math.round((h - sh) * 0.42));
  return { sx, sy, sw: Math.min(sw, w - sx), sh: Math.min(sh, h - sy) };
}

/**
 * Phase 619 — root-cause rewrite (was Phase 146's landmark-alignment
 * approach). Gemini only ever sees a 9:16 PORTRAIT CROP of the source
 * photo (`imageToPortraitBase64Jpeg`'s crop window), not the full frame
 * — so a returned variant only ever depicts that cropped rectangle, at
 * whatever resolution the 2x2 grid quadrant happens to be. Placement is
 * therefore fully determined by that same rectangle, not by re-detecting
 * landmarks and hoping the two independently-guessed scales agree:
 *
 *   1. Draw the ORIGINAL, untouched photo across the whole canvas first.
 *      Every pixel outside the AI's edit window is the real photo — the
 *      canvas is always 100% "full," never a gap or black bar
 *      ("รูปไม่เต็ม").
 *   2. Cover-scale the after-image (one grid quadrant) to exactly fill
 *      that SAME crop rectangle, and draw it there.
 *
 * This dropped the MediaPipe landmark-detection dependency entirely —
 * there is nothing to guess: the crop rectangle is authoritative because
 * this codebase chose it. It also fixes a Phase 619 regression path this
 * function briefly took (nose-pinned + forced full-canvas coverage),
 * which — for the same reason the OLD full-canvas-cover approach did —
 * inflated the composited face size when the crop and canvas aspect
 * ratios differ, tripping `identityDrift`'s sanity check downstream
 * (measured ratio up to 1.48x in testing on a 9:16 crop vs an 0.80
 * aspect source photo). Because the after-image now only ever fills its
 * own known-correct window, the face scale naturally stays close to 1:1.
 */
// Phase 632 — how far the feathered mask extends past a target region's
// own box before falling fully transparent, as a multiple of the box's
// own half-size. Matches the padding/feather ratio validated in the
// offline landmark-alignment + masked-composite experiment (see ADR).
const MASK_PAD_FACTOR = 1.35;
const MASK_FEATHER_FACTOR = 1.6;
const MASK_OPAQUE_STOP = 0.68;
const COLOR_MATCH_MIN_DELTA = 2;
// Phase 634 — exclusion circles for identity-critical regions (eyes,
// brows, nose, lips) NOT being targeted. Generous padding (this cutout
// errs toward protecting too much, not too little). The feather is wide
// and gradual, not tight: a hard-edged cut leaves a visible seam where
// 100%-original skin meets AI-edited-and-color-matched skin that was
// corrected against a ring centered on the target region, not against
// this boundary. A gradual ramp spreads that mismatch over enough
// pixels to disappear; COLOR_MATCH_MAX_DELTA already bounds how far any
// residual color that leaks into the ramp can be from the real photo.
const PROTECTED_PAD_FACTOR = 1.4;
const PROTECTED_FEATHER_FACTOR = 1.9;
const PROTECTED_OPAQUE_STOP = 0.45;
// Phase 635 — a wide region (cheek/jaw combos) on a tightly-cropped
// photo can compute an outerR that reaches past the actual face edge
// into hair or backdrop. AI content painted there at partial (feather)
// alpha shows as a translucent ghost/double-exposure of the face
// silhouette against the background — visible on cheekbone_reduction's
// "cleaner jaw contour" / "masseter transition" variants specifically,
// where Gemini's redraw shifts the jaw edge a few pixels from the
// original. Capping every region's radius to a face-relative bound
// keeps any single region from ever reaching past the face, regardless
// of how large its own landmark box, padding, or feather grew.
const MAX_REGION_RADIUS_FACTOR = 0.34;
// Phase 634 — a feather ring can land partly off-face (hair, collar,
// backdrop) on tightly-cropped photos or multi-region combos where one
// region's outer radius runs into another region's territory. An
// uncontaminated skin-tone mismatch is a mild correction; a ring that
// picked up background is not. Capping the shift means a contaminated
// sample can only under-correct, never paint the region a wildly wrong
// color.
const COLOR_MATCH_MAX_DELTA = 32;

// Phase 640 — landmark-based re-alignment of the AI output (the
// founder's "re-detect + affine transform" workflow step). Gemini's
// redraw routinely shifts/rescales the face a few pixels; the old
// deterministic crop-rect placement couldn't see that, which is what
// produced the Phase 635 ghosting. Now MediaPipe re-runs on the AI
// image, matching anchor points are fit with a least-squares similarity
// transform, and the AI layer is drawn through that transform so its
// landmarks land EXACTLY on the original photo's. Fit is rejected (→
// fall back to crop-rect placement) when too few stable anchors exist,
// the transform is implausible, or the residual says the two faces
// don't actually correspond.
const ALIGN_MIN_ANCHORS = 3;
// Phase 641b — scale bounds are a RATIO against the cover-scale
// baseline (AI image resolution differs from the canvas), and they are
// deliberately wide: the mean-residual check below is the real
// correctness signal (8-11 stable anchors landing within 2% of the
// image dimension can't happen on a wrong fit), while the scale window
// only guards absurdity. Tight bounds here rejected exactly the cases
// the warp exists to rescue — Gemini reframing the person smaller,
// where the crop-rect fallback misplaces features by 90-140px (measured
// on real outputs in the headless precision harness).
const ALIGN_SCALE_MIN = 0.45;
const ALIGN_SCALE_MAX = 2.2;
const ALIGN_MAX_ROTATION_DEG = 12;
const ALIGN_MAX_RESIDUAL_FRAC = 0.02;
// Phase 640 — feather-ring color sampling is now per-sector (membrane
// interpolation, the smooth-tone component of Poisson seamless cloning)
// instead of one uniform delta, so directional lighting mismatch (one
// side of the region brighter than the other) gets corrected too.
const COLOR_MATCH_SECTORS = 16;

type AnchorKey = keyof PreviewEditContract["anchors"];
type RegionKey = PreviewEditContract["targetRegions"][number];

// Anchors sitting inside (or directly moved by) a targeted region can't
// be used for alignment — the AI is SUPPOSED to move them. Everything
// else is assumed stable between the original and the AI redraw.
const ANCHOR_EXCLUDED_BY_REGION: Record<AnchorKey, readonly RegionKey[]> = {
  rightEye: [
    "rightEye",
    "rightBrow",
    "rightOuterCanthus",
  ],
  leftEye: [
    "leftEye",
    "leftBrow",
    "leftOuterCanthus",
  ],
  rightBrow: ["rightBrow", "forehead"],
  leftBrow: ["leftBrow", "forehead"],
  noseTip: ["nose"],
  mouthCenter: ["lips"],
  chin: ["chin"],
  rightJaw: ["chin", "cheekRight"],
  leftJaw: ["chin", "cheekLeft"],
  // Phase 641 — denser stable set: cheeks + forehead apex give every
  // procedure at least 8 usable anchors (nose procedures previously
  // fit on 6).
  rightCheek: ["cheekRight"],
  leftCheek: ["cheekLeft"],
  forehead: ["forehead"],
};

// Phase 641 — per-region mask tuning. One global pad/feather pair can't
// fit every organ: the nose sits millimeters from eyes and lips (needs
// a tight mask), cheeks blend into large skin areas (want a wide, soft
// feather), lips/jaw are wide-flat shapes where a circle over-covers
// vertically. Regions absent here keep the global defaults.
const REGION_MASK_TUNING: Partial<
  Record<RegionKey, { pad?: number; feather?: number }>
> = {
  nose: { pad: 1.2, feather: 1.45 },
  lips: { pad: 1.25, feather: 1.5 },
  chin: { pad: 1.3, feather: 1.55 },
  cheekLeft: { pad: 1.3, feather: 1.75 },
  cheekRight: { pad: 1.3, feather: 1.75 },
  leftEye: { pad: 1.45, feather: 1.6 },
  rightEye: { pad: 1.45, feather: 1.6 },
  leftIris: { pad: 1.2, feather: 1.25 },
  rightIris: { pad: 1.2, feather: 1.25 },
  leftUnderEye: { pad: 1.2, feather: 1.55 },
  rightUnderEye: { pad: 1.2, feather: 1.55 },
  leftUpperEyelid: { pad: 1.15, feather: 1.35 },
  rightUpperEyelid: { pad: 1.15, feather: 1.35 },
  leftOuterCanthus: { pad: 1.15, feather: 1.45 },
  rightOuterCanthus: { pad: 1.15, feather: 1.45 },
  leftCrowsFeet: { pad: 1.2, feather: 1.6 },
  rightCrowsFeet: { pad: 1.2, feather: 1.6 },
  leftNasolabial: { pad: 1.05, feather: 1.35 },
  rightNasolabial: { pad: 1.05, feather: 1.35 },
  forehead: { pad: 1.25, feather: 1.6 },
};
// Very flat landmark boxes (lips, closed eyes) would otherwise produce
// a sliver mask that misses the visible change above/below the box.
const REGION_MIN_ASPECT = 0.5;

type ProtectedMaskTuning = {
  pad: number;
  feather: number;
  minAspect: number;
  opaqueStop: number;
};

const PROTECTED_TIGHT_EYE_TUNING: ProtectedMaskTuning = {
  pad: 1.02,
  feather: 1.18,
  minAspect: 0.25,
  opaqueStop: 0.84,
};

const PROTECTED_FINE_EYE_TUNING: Partial<
  Record<RegionKey, ProtectedMaskTuning>
> = {
  leftIris: { ...PROTECTED_TIGHT_EYE_TUNING, minAspect: 0.7 },
  rightIris: { ...PROTECTED_TIGHT_EYE_TUNING, minAspect: 0.7 },
  leftUnderEye: { ...PROTECTED_TIGHT_EYE_TUNING, minAspect: 0.22 },
  rightUnderEye: { ...PROTECTED_TIGHT_EYE_TUNING, minAspect: 0.22 },
  leftUpperEyelid: { ...PROTECTED_TIGHT_EYE_TUNING, minAspect: 0.22 },
  rightUpperEyelid: { ...PROTECTED_TIGHT_EYE_TUNING, minAspect: 0.22 },
};

const POST_EFFECT_RESTORE_TUNING: Partial<
  Record<RegionKey, ProtectedMaskTuning>
> = {
  leftEye: { pad: 1.02, feather: 1.12, minAspect: 0.22, opaqueStop: 0.86 },
  rightEye: { pad: 1.02, feather: 1.12, minAspect: 0.22, opaqueStop: 0.86 },
  leftIris: { pad: 1.12, feather: 1.18, minAspect: 0.7, opaqueStop: 0.92 },
  rightIris: { pad: 1.12, feather: 1.18, minAspect: 0.7, opaqueStop: 0.92 },
  leftBrow: { pad: 1.02, feather: 1.12, minAspect: 0.2, opaqueStop: 0.86 },
  rightBrow: { pad: 1.02, feather: 1.12, minAspect: 0.2, opaqueStop: 0.86 },
  nose: { pad: 1.02, feather: 1.12, minAspect: 0.28, opaqueStop: 0.86 },
  lips: { pad: 1.02, feather: 1.12, minAspect: 0.22, opaqueStop: 0.86 },
  leftUnderEye: { pad: 1.01, feather: 1.08, minAspect: 0.18, opaqueStop: 0.9 },
  rightUnderEye: { pad: 1.01, feather: 1.08, minAspect: 0.18, opaqueStop: 0.9 },
  leftUpperEyelid: { pad: 1.01, feather: 1.08, minAspect: 0.18, opaqueStop: 0.9 },
  rightUpperEyelid: { pad: 1.01, feather: 1.08, minAspect: 0.18, opaqueStop: 0.9 },
  leftNasolabial: { pad: 1.08, feather: 1.18, minAspect: 0.14, opaqueStop: 0.96 },
  rightNasolabial: { pad: 1.08, feather: 1.18, minAspect: 0.14, opaqueStop: 0.96 },
};

const POST_EFFECT_DEFAULT_RESTORE_TUNING: ProtectedMaskTuning = {
  pad: 1.02,
  feather: 1.12,
  minAspect: 0.28,
  opaqueStop: 0.86,
};

export interface RegionEllipse {
  region: RegionKey;
  cx: number;
  cy: number;
  rxOut: number;
  ryOut: number;
  opaqueStop?: number;
}

type RegionGeometryItem = PreviewEditContract["targetGeometry"][number];

// Phase 647 — extracted from the composite-drawing code so the exact
// same ellipse math the real compositor uses can be exercised by tests
// (a hand-reimplemented copy in a test file would drift from production
// and silently stop catching the class of bug Phase 646 fixed — a
// target region's paint reach outrunning a protected region's punch-out
// reach along their shared boundary).
export function computeTargetRegionEllipses(
  targetGeometry: readonly RegionGeometryItem[],
  targetW: number,
  targetH: number,
  faceSize: { width: number; height: number } | null
): RegionEllipse[] {
  // Phase 635 — face-relative ceiling on how far any region's outer
  // radius can reach, regardless of its own landmark box size. Falls
  // back to an image-relative bound when face geometry wasn't passed
  // in, so the cap still exists (just looser) rather than disappearing.
  const maxOuterR = faceSize
    ? Math.min(faceSize.width * targetW, faceSize.height * targetH) *
      MAX_REGION_RADIUS_FACTOR
    : Math.min(targetW, targetH) * MAX_REGION_RADIUS_FACTOR;

  // Phase 641 — masks are ELLIPSES sized separately from the landmark
  // box's width and height (was one circle from the larger side, which
  // over-covered vertically on wide-flat regions like lips and jaw).
  // Pad/feather come from the per-region tuning table with the global
  // factors as defaults; the Phase 635 face-relative radius cap still
  // bounds both axes.
  return targetGeometry.map((region) => {
    const tuning = REGION_MASK_TUNING[region.region] ?? {};
    const pad = tuning.pad ?? MASK_PAD_FACTOR;
    const feather = tuning.feather ?? MASK_FEATHER_FACTOR;
    const cx = region.centerX * targetW;
    const cy = region.centerY * targetH;
    const halfW = Math.max(4, (region.width * targetW) / 2) * pad;
    const halfH = Math.max(4, (region.height * targetH) / 2) * pad;
    const rx = Math.max(halfW, halfH * REGION_MIN_ASPECT);
    const ry = Math.max(halfH, halfW * REGION_MIN_ASPECT);
    return {
      region: region.region,
      cx,
      cy,
      rxOut: Math.min(rx * feather, maxOuterR),
      ryOut: Math.min(ry * feather, maxOuterR),
    };
  });
}

// Phase 647 — same extraction rationale as computeTargetRegionEllipses,
// for the protected-region punch-out ellipses (Phase 634).
export function computeProtectedRegionEllipses(
  protectedGeometry: readonly RegionGeometryItem[],
  targetW: number,
  targetH: number,
  targetRegions: readonly RegionKey[] = []
): RegionEllipse[] {
  return protectedGeometry.map((region) => {
    const fineEyeTuning = PROTECTED_FINE_EYE_TUNING[region.region];
    const besideEyeTarget =
      (region.region === "leftEye" && targetRegions.some((target) =>
        target === "leftOuterCanthus" || target === "leftCrowsFeet"
      )) ||
      (region.region === "rightEye" && targetRegions.some((target) =>
        target === "rightOuterCanthus" || target === "rightCrowsFeet"
      ));
    const tuning = fineEyeTuning ?? (besideEyeTarget
      ? PROTECTED_TIGHT_EYE_TUNING
      : undefined);
    const cx = region.centerX * targetW;
    const cy = region.centerY * targetH;
    // Phase 641 — protection cutouts are ellipses too. Eyes and lips are
    // wide-flat: a circle sized from the wider axis over-punched
    // vertically, carving skin above/below the feature back to the
    // original and leaving a horizontal band of uncorrected transition
    // through the edited area.
    const halfW =
      Math.max(4, (region.width * targetW) / 2) *
      (tuning?.pad ?? PROTECTED_PAD_FACTOR);
    const halfH =
      Math.max(4, (region.height * targetH) / 2) *
      (tuning?.pad ?? PROTECTED_PAD_FACTOR);
    const minAspect = tuning?.minAspect ?? REGION_MIN_ASPECT;
    const rx = Math.max(halfW, halfH * minAspect);
    const ry = Math.max(halfH, halfW * minAspect);
    const feather = tuning?.feather ?? PROTECTED_FEATHER_FACTOR;
    return {
      region: region.region,
      cx,
      cy,
      rxOut: rx * feather,
      ryOut: ry * feather,
      ...(tuning ? { opaqueStop: tuning.opaqueStop } : {}),
    };
  });
}

export function computePostEffectRestoreEllipses(
  protectedGeometry: readonly RegionGeometryItem[],
  targetW: number,
  targetH: number
): RegionEllipse[] {
  return protectedGeometry.map((region) => {
    const tuning =
      POST_EFFECT_RESTORE_TUNING[region.region] ??
      POST_EFFECT_DEFAULT_RESTORE_TUNING;
    const halfW = Math.max(4, (region.width * targetW) / 2) * tuning.pad;
    const halfH = Math.max(4, (region.height * targetH) / 2) * tuning.pad;
    const rx = Math.max(halfW, halfH * tuning.minAspect);
    const ry = Math.max(halfH, halfW * tuning.minAspect);
    return {
      region: region.region,
      cx: region.centerX * targetW,
      cy: region.centerY * targetH,
      rxOut: rx * tuning.feather,
      ryOut: ry * tuning.feather,
      opaqueStop: tuning.opaqueStop,
    };
  });
}

const ALL_ANCHOR_KEYS = Object.keys(
  ANCHOR_EXCLUDED_BY_REGION
) as AnchorKey[];

export function stableAnchorKeys(
  targetRegions: readonly RegionKey[]
): AnchorKey[] {
  return ALL_ANCHOR_KEYS.filter(
    (key) =>
      !ANCHOR_EXCLUDED_BY_REGION[key].some((region) =>
        targetRegions.includes(region)
      )
  );
}

async function computeAfterImageWarp(
  afterImg: HTMLImageElement,
  afterW: number,
  afterH: number,
  targetW: number,
  targetH: number,
  contract: PreviewEditContract,
  // Phase 641b — the cover-scale the crop-rect fallback would use.
  // The AI image arrives at a DIFFERENT resolution than the canvas
  // (grid quadrant vs original photo), so the fitted scale's neutral
  // baseline is this value, not 1.0. Checking the raw scale against
  // [0.7, 1.4] rejected perfect fits whenever the resolutions differed
  // by more than 40% — caught by the headless precision harness, where
  // both real Gemini outputs fit to sub-3px accuracy but were gated out
  // (fit scale 0.59 vs cover-scale baseline 0.59 → ratio 1.0 = sane).
  expectedScale: number
): Promise<SimilarityTransform | null> {
  try {
    const detected = await detectPreviewLandmarks(afterImg);
    if (!detected) return null;
    const newAnchors = anchorsFromLandmarks(detected.landmarks);
    const keys = stableAnchorKeys(contract.targetRegions);
    if (keys.length < ALIGN_MIN_ANCHORS) return null;
    const from = keys.map((key) => ({
      x: newAnchors[key].x * afterW,
      y: newAnchors[key].y * afterH,
    }));
    const to = keys.map((key) => ({
      x: contract.anchors[key].x * targetW,
      y: contract.anchors[key].y * targetH,
    }));
    const transform = estimateSimilarityTransform(from, to);
    if (!transform) return null;
    const scaleRatio =
      expectedScale > 0 ? transform.scale / expectedScale : transform.scale;
    if (
      scaleRatio < ALIGN_SCALE_MIN ||
      scaleRatio > ALIGN_SCALE_MAX ||
      Math.abs(transform.rotationDeg) > ALIGN_MAX_ROTATION_DEG ||
      transform.meanResidual >
        Math.max(targetW, targetH) * ALIGN_MAX_RESIDUAL_FRAC
    ) {
      return null;
    }
    return transform;
  } catch {
    return null;
  }
}

/**
 * Phase 633 → 640 — matches the AI layer's color to the real photo's
 * skin at the feather ring, now as a smoothly interpolated per-sector
 * offset field (membrane approximation of Poisson cloning) instead of
 * one uniform delta. Corrects both overall white-balance drift AND
 * directional lighting mismatch across the region. Per-sector deltas
 * stay clamped to ±COLOR_MATCH_MAX_DELTA (Phase 634's contaminated-ring
 * guard).
 */
function colorMatchAiLayerToBase(
  layerCtx: CanvasRenderingContext2D,
  baseCtx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rxOut: number,
  ryOut: number,
  canvasW: number,
  canvasH: number
): void {
  const left = Math.max(0, Math.floor(cx - rxOut));
  const top = Math.max(0, Math.floor(cy - ryOut));
  const right = Math.min(canvasW, Math.ceil(cx + rxOut));
  const bottom = Math.min(canvasH, Math.ceil(cy + ryOut));
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return;

  const baseData = baseCtx.getImageData(left, top, w, h).data;
  const layerImageData = layerCtx.getImageData(left, top, w, h);

  const sectors = computeSectorColorDeltas(
    baseData,
    layerImageData.data,
    w,
    h,
    left,
    top,
    cx,
    cy,
    rxOut,
    ryOut,
    MASK_OPAQUE_STOP,
    COLOR_MATCH_SECTORS,
    COLOR_MATCH_MAX_DELTA
  );
  if (!sectors || sectors.maxAbsDelta < COLOR_MATCH_MIN_DELTA) return;

  applyMembraneColorOffsets(
    layerImageData.data,
    w,
    h,
    left,
    top,
    cx,
    cy,
    rxOut,
    ryOut,
    sectors
  );
  layerCtx.putImageData(layerImageData, left, top);
}

export async function alignAfterToBeforeFace(
  beforeImg: HTMLImageElement,
  afterUrl: string,
  // Phase 640 — the whole edit contract now rides along (replaces the
  // three separate targetGeometry/protectedGeometry/faceSize params):
  // its anchors are pts_old for the landmark re-alignment, its regions
  // drive the mask, and its ratios bound the region radii.
  contract?: PreviewEditContract | null,
  variant?: ProcedureVariantId
): Promise<string> {
  const targetW = beforeImg.naturalWidth || beforeImg.width;
  const targetH = beforeImg.naturalHeight || beforeImg.height;
  const hasLocalTarget = Boolean(contract?.targetGeometry?.length);
  const originalUrl = beforeImg.currentSrc || beforeImg.src || afterUrl;
  const safeFallback = hasLocalTarget ? originalUrl : afterUrl;
  if (targetW <= 0 || targetH <= 0) return safeFallback;

  const afterImg = await loadHtmlImage(afterUrl);
  if (!afterImg) {
    return hasLocalTarget
      ? safeFallback
      : normalizeAfterToBeforeDimensions(beforeImg, afterUrl);
  }
  const afterW = afterImg.naturalWidth;
  const afterH = afterImg.naturalHeight;
  if (afterW <= 0 || afterH <= 0) {
    return hasLocalTarget
      ? safeFallback
      : normalizeAfterToBeforeDimensions(beforeImg, afterUrl);
  }

  const crop = computePortraitCropRect(targetW, targetH);
  if (crop.sw <= 0 || crop.sh <= 0) {
    return hasLocalTarget
      ? safeFallback
      : normalizeAfterToBeforeDimensions(beforeImg, afterUrl);
  }

  const targetGeometry = contract?.targetGeometry;
  const protectedGeometry = contract?.protectedGeometry;
  const faceSize = contract
    ? { width: contract.ratios.faceWidth, height: contract.ratios.faceHeight }
    : null;
  // Cover-scale for the crop-rect placement path; ALSO the neutral
  // baseline the warp's scale-sanity gate normalizes against (the AI
  // image arrives at a different resolution than the canvas, so a
  // correct fit's scale sits near this value, not near 1.0).
  const coverScale = Math.max(crop.sw / afterW, crop.sh / afterH);
  // Phase 640 — re-detect landmarks on the AI image and fit a
  // similarity transform onto the original photo's anchors. Null when
  // detection fails or the fit is implausible → crop-rect fallback.
  // Phase 641 — computed for global (skin) procedures too, so the
  // unmasked before/after slider comparison is landmark-aligned as well.
  const warp = contract
    ? await computeAfterImageWarp(
        afterImg,
        afterW,
        afterH,
        targetW,
        targetH,
        contract,
        coverScale
      )
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return hasLocalTarget
      ? safeFallback
      : normalizeAfterToBeforeDimensions(beforeImg, afterUrl);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const providerBlend = providerPreviewBlend(variant);
  // Trusted geometry-first base. Client effects are bounded by their
  // explicit handle/appearance radii; the mask below bounds provider pixels.
  ctx.drawImage(beforeImg, 0, 0, targetW, targetH);
  if (hasLocalTarget && contract?.effects?.length) {
    applyProcedureEffectPlans(canvas, contract.effects, variant);
  }
  // AI content, cover-scaled to exactly fill the crop window Gemini
  // actually saw — no more, no less.
  const drawW = afterW * coverScale;
  const drawH = afterH * coverScale;
  const dx = crop.sx + (crop.sw - drawW) / 2;
  const dy = crop.sy + (crop.sh - drawH) / 2;

  if (targetGeometry && targetGeometry.length > 0) {
    // Phase 632 — masked composite: only the pixels inside the
    // (feathered) target-region mask come from the AI layer; everything
    // else reverts to the original photo, even within the crop window.
    // The mask is computed entirely client-side from landmark geometry
    // and is never sent to Gemini (Phase 611 found that sending a mask
    // image to Gemini itself causes visible artifacts — confirmed still
    // true on gemini-3-pro-image in a live test, see ADR).
    const layer = document.createElement("canvas");
    layer.width = targetW;
    layer.height = targetH;
    const lctx = layer.getContext("2d", { willReadFrequently: true });
    if (!lctx) {
      canvas.width = 0;
      canvas.height = 0;
      layer.width = 0;
      layer.height = 0;
      return hasLocalTarget
        ? safeFallback
        : normalizeAfterToBeforeDimensions(beforeImg, afterUrl);
    }
    lctx.imageSmoothingEnabled = true;
    lctx.imageSmoothingQuality = "high";
    if (warp) {
      // Phase 640 — draw the AI image through the landmark-fit
      // similarity transform so its face lands exactly on the original
      // photo's coordinates (canvas 2D setTransform: x' = m11·x + m21·y
      // + dx, y' = m12·x + m22·y + dy).
      lctx.setTransform(warp.a, warp.b, -warp.b, warp.a, warp.tx, warp.ty);
      lctx.drawImage(afterImg, 0, 0);
      lctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      lctx.drawImage(afterImg, dx, dy, drawW, drawH);
    }

    if (contract?.effects?.length) {
      applyProcedureEffectPlans(layer, contract.effects, variant);
    }

    const regionRadii = computeTargetRegionEllipses(
      targetGeometry,
      targetW,
      targetH,
      faceSize
    );

    for (const { cx, cy, rxOut, ryOut } of regionRadii) {
      colorMatchAiLayerToBase(
        lctx,
        ctx,
        cx,
        cy,
        rxOut,
        ryOut,
        targetW,
        targetH
      );
    }

    const mask = document.createElement("canvas");
    mask.width = targetW;
    mask.height = targetH;
    const mctx = mask.getContext("2d");
    if (!mctx) {
      mask.width = 0;
      mask.height = 0;
      layer.width = 0;
      layer.height = 0;
      try {
        return canvas.toDataURL("image/png");
      } catch {
        return safeFallback;
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    for (const { cx, cy, rxOut, ryOut } of regionRadii) {
        // Elliptical feathered fill: paint a circular radial gradient in
        // a scaled coordinate space (canvas has no elliptical gradients).
        mctx.save();
        mctx.translate(cx, cy);
        mctx.scale(1, ryOut / rxOut);
        const grad = mctx.createRadialGradient(0, 0, 0, 0, 0, rxOut);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(MASK_OPAQUE_STOP, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        mctx.fillStyle = grad;
        mctx.beginPath();
        mctx.arc(0, 0, rxOut, 0, Math.PI * 2);
        mctx.fill();
        mctx.restore();
      }
      // Phase 634 — hard-exclude identity-critical regions (eyes, brows,
      // nose, lips) that this procedure isn't targeting, regardless of
      // how far a target region's feather radius happened to reach.
      // Without this, a wide/tightly-cropped photo can push a cheek or
      // jaw region's outerR over the eyes and the "shape blends cleanly"
      // guarantee silently breaks.
      if (protectedGeometry && protectedGeometry.length > 0) {
        mctx.globalCompositeOperation = "destination-out";
        const protectedRadii = computeProtectedRegionEllipses(
          protectedGeometry,
          targetW,
          targetH,
          contract.targetRegions
        );
        for (const { cx, cy, rxOut, ryOut, opaqueStop } of protectedRadii) {
          mctx.save();
          mctx.translate(cx, cy);
          mctx.scale(1, ryOut / rxOut);
          const grad = mctx.createRadialGradient(0, 0, 0, 0, 0, rxOut);
          grad.addColorStop(0, "rgba(0,0,0,1)");
          grad.addColorStop(
            opaqueStop ?? PROTECTED_OPAQUE_STOP,
            "rgba(0,0,0,1)"
          );
          grad.addColorStop(1, "rgba(0,0,0,0)");
          mctx.fillStyle = grad;
          mctx.beginPath();
          mctx.arc(0, 0, rxOut, 0, Math.PI * 2);
          mctx.fill();
          mctx.restore();
        }
        mctx.globalCompositeOperation = "source-over";
      }
      lctx.globalCompositeOperation = "destination-in";
    lctx.drawImage(mask, 0, 0);
    mask.width = 0;
    mask.height = 0;
    ctx.save();
    ctx.globalAlpha = providerBlend;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    layer.width = 0;
    layer.height = 0;
  } else if (warp) {
    // Phase 641 — global (skin) procedures have no mask, but the
    // landmark warp still aligns the whole AI image to the original so
    // the before/after slider doesn't jump.
    ctx.save();
    ctx.globalAlpha = providerBlend;
    ctx.setTransform(warp.a, warp.b, -warp.b, warp.a, warp.tx, warp.ty);
    ctx.drawImage(afterImg, 0, 0);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = providerBlend;
    ctx.drawImage(afterImg, dx, dy, drawW, drawH);
    ctx.restore();
  }

  if (!hasLocalTarget && contract?.effects?.length) {
    applyProcedureEffectPlans(canvas, contract.effects, variant);
  }
  if (hasLocalTarget && protectedGeometry?.length) {
    restoreProtectedRegionsAfterEffect(
      ctx,
      beforeImg,
      protectedGeometry,
      targetW,
      targetH
    );
  }

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return safeFallback;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function paintEllipseMask(
  ctx: CanvasRenderingContext2D,
  ellipses: readonly RegionEllipse[],
  defaultOpaqueStop: number
): void {
  for (const { cx, cy, rxOut, ryOut, opaqueStop } of ellipses) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ryOut / rxOut);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rxOut);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(opaqueStop ?? defaultOpaqueStop, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, rxOut, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function restoreProtectedRegionsAfterEffect(
  ctx: CanvasRenderingContext2D,
  beforeImg: HTMLImageElement,
  protectedGeometry: readonly RegionGeometryItem[],
  targetW: number,
  targetH: number
): void {
  const ellipses = computePostEffectRestoreEllipses(
    protectedGeometry,
    targetW,
    targetH
  );
  if (ellipses.length === 0) return;
  const layer = document.createElement("canvas");
  layer.width = targetW;
  layer.height = targetH;
  const layerCtx = layer.getContext("2d");
  if (!layerCtx) return;
  layerCtx.drawImage(beforeImg, 0, 0, targetW, targetH);
  const mask = document.createElement("canvas");
  mask.width = targetW;
  mask.height = targetH;
  const maskCtx = mask.getContext("2d");
  if (!maskCtx) {
    layer.width = 0;
    return;
  }
  paintEllipseMask(maskCtx, ellipses, 0.86);
  layerCtx.globalCompositeOperation = "destination-in";
  layerCtx.drawImage(mask, 0, 0);
  ctx.drawImage(layer, 0, 0);
  layer.width = 0;
  mask.width = 0;
}

/**
 * Phase 136 - normalize the generated image to match the original
 * photo's dimensions and aspect ratio. Gemini sometimes returns a
 * square crop or a slightly rescaled output; on a draggable slider
 * this looks like the before/after halves don't line up (the face
 * sits in a different spot on each side). We fix that here by
 * compositing the AI output onto a canvas the exact size of the
 * input photo, using cover-and-center math.
 *
 * Why cover instead of contain: empty letterbox bars would break
 * the illusion. Cover crops the after image slightly so it fills
 * the same shape - the face stays centered the way it was in the
 * input.
 *
 * Returns a data URL on success, or the original `afterUrl` if the
 * source image can't be measured (offscreen DOM, broken URL).
 */
export async function normalizeAfterToBeforeDimensions(
  beforeImg: HTMLImageElement,
  afterUrl: string
): Promise<string> {
  const targetW = beforeImg.naturalWidth || beforeImg.width;
  const targetH = beforeImg.naturalHeight || beforeImg.height;
  if (targetW <= 0 || targetH <= 0) return afterUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      if (sw <= 0 || sh <= 0) {
        resolve(afterUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(afterUrl);
        return;
      }
      // cover-and-center: scale by the larger ratio so the source
      // fully covers the target, then center any overflow.
      const scale = Math.max(targetW / sw, targetH / sh);
      const drawW = sw * scale;
      const drawH = sh * scale;
      const dx = (targetW - drawW) / 2;
      const dy = (targetH - drawH) / 2;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, dx, dy, drawW, drawH);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(afterUrl);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
    img.onerror = () => resolve(afterUrl);
    img.src = afterUrl;
  });
}

// ---------- API call ----------

export async function imageToBase64Jpeg(image: HTMLImageElement, maxSide = 1024): Promise<string> {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-2d-unavailable");
  ctx.drawImage(image, 0, 0, tw, th);
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return dataUrl.split(",")[1] ?? "";
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Intensity language - scales visual strength without implying measured outcomes. */
export async function imageToPortraitBase64Jpeg(
  image: HTMLImageElement,
  maxWidth = 2160
): Promise<string> {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (w <= 0 || h <= 0) return imageToBase64Jpeg(image, maxWidth);

  const { sx, sy, sw, sh } = computePortraitCropRect(w, h);
  const tw = Math.min(maxWidth, sw);
  const th = Math.round(tw / (9 / 16));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-2d-unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, tw, th);
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
    return dataUrl.split(",")[1] ?? "";
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export interface SurgeryPreviewInput {
  image: HTMLImageElement;
  procedure: ProcedureDef;
  gender: Gender;
  customNote?: string;
  /** Phase 130 — user-selected intensity. Defaults to "normal". */
  intensity?: Intensity;
  /** Phase 152 → 180 — Supabase access token. The Gemini call now lands
   *  on `/api/ai/image-gen` which `requireUser`s; the token is also used
   *  by server-side quota enforcement. */
  idToken?: string;
  /** Cancels the browser-to-server request when the preview dialog closes. */
  signal?: AbortSignal;
}

export interface SurgeryPreviewResult {
  /** data:image/png;base64,... URL ready to drop into <img src>. */
  imageDataUrl: string;
  /** Any descriptive text the model returned alongside the image. */
  description?: string;
  /** Client-only geometry used to mask-composite the provider output. */
  editContract?: PreviewEditContract;
  source?: "provider" | "deterministic";
}

export interface ProcedureVariantPreview {
  option: ProcedureVariantOption;
  imageDataUrl: string;
  source?: "provider" | "deterministic";
}

export interface ProcedureVariantGridResult {
  gridImageDataUrl: string;
  variants: ProcedureVariantPreview[];
  providerRejectedCount?: number;
  description?: string;
  /** Phase 632 — client-side-only landmark geometry for the selected
   *  procedure's target region(s). Never sent to Gemini (see
   *  buildSecureProviderBody's variant_grid branch) — used purely to
   *  mask-composite each variant locally in alignAfterToBeforeFace. */
  editContract?: PreviewEditContract;
}

interface PreviewGenerationPayload {
  editContract?: PreviewEditContract;
  mask?: ProcedureMaskPayload;
  crop?: ProcedureTargetCropPayload;
  guide?: ProcedureTargetGuidePayload;
}

const inFlightPreviewRequests = new Map<string, Promise<SurgeryPreviewResult>>();

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function previewImageFingerprint(image: HTMLImageElement): string {
  const src = image.currentSrc || image.src || image.getAttribute("src") || "inline";
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  return `${hashString(src)}:${width}x${height}`;
}

function withInFlightPreviewDedupe(
  key: string,
  run: () => Promise<SurgeryPreviewResult>
): Promise<SurgeryPreviewResult> {
  const existing = inFlightPreviewRequests.get(key);
  if (existing) return existing;
  const promise = run().finally(() => {
    inFlightPreviewRequests.delete(key);
  });
  inFlightPreviewRequests.set(key, promise);
  return promise;
}

function previewDedupeKey(parts: readonly string[]): string {
  return parts.join("\u001f");
}

// Phase 152 — reserve a quota slot (server-side for users / localStorage
// for guests), run the gen, refund on failure.
//
// Phase 192ad — Finding 3 (CWE-345): removed the client `trackUsageApi`
// POST. The server AI routes (`/api/ai/image-gen`, `/api/ai/recommend`)
// now write the authoritative usage_log row after their real provider
// call, so the client no longer declares (and could forge) the op. This
// wrapper itself is already unused — every preview/recommend path moved
// quota enforcement server-side (see the "Dropped withQuotaGuard" notes
// above) — and is retained only as a reference for the guest-quota shape.
async function withQuotaGuard<T>(
  kind: "previews" | "scans",
  idToken: string | undefined,
  run: () => Promise<T>
): Promise<T> {
  let reservation: QuotaReservation | null = null;
  try {
    reservation = await reserveQuotaSlot(kind, idToken ?? null);
  } catch (err) {
    throw err;
  }
  try {
    return await run();
  } catch (err) {
    if (reservation) await releaseQuotaSlot(reservation);
    throw err;
  }
}

/**
 * Phase 180 — Server-side Gemini image proxy.
 *
 * Old shape: client posted directly to `generativelanguage.googleapis.com`
 * with a user-supplied API key. New shape: client POSTs `{ body, candidates }`
 * to `/api/ai/image-gen`; server forwards with `GEMINI_API_SECRET`,
 * tries each candidate model in order, returns the first 2xx response
 * along with the model that won.
 *
 * Returns the same `{ ok, data | status, errText }` shape the rest of
 * the file expects, so existing call sites need zero changes beyond
 * dropping the apiKey arg + folding the candidate list into one call.
 */
// Phase 306 — Client fetch timeout for the AI proxy legs. The server routes
// cap at maxDuration=60s, but the browser→server connection has no ceiling:
// a stalled mobile network or a dropped response can leave `await fetch`
// pending indefinitely, freezing the surgery-preview / recommend spinner
// with no recovery but a reload. 90s is above the server window so a
// slow-but-working image generation still completes; a dead connection
// aborts and the caller surfaces a normal error instead of hanging.
const AI_PROXY_TIMEOUT_MS = 180_000;
const AI_PROXY_MAX_ATTEMPTS = 3;
const AI_PROXY_RETRY_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

async function fetchProxyWithTimeout(
  input: string,
  init: RequestInit,
  ms: number = AI_PROXY_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) controller.abort();
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

function proxyRetryDelayMs(attempt: number): number {
  return Math.min(1_500 * 2 ** attempt, 6_000);
}

function canRetryProxy(status: number): boolean {
  return AI_PROXY_RETRY_STATUSES.has(status);
}

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function callImageGenProxy(
  request: object,
  idToken: string | null,
  maxAttempts = AI_PROXY_MAX_ATTEMPTS,
  signal?: AbortSignal
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; errText: string }
> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const payload = JSON.stringify(request);
  let lastFailure: { status: number; errText: string } | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetchProxyWithTimeout("/api/ai/image-gen", {
        method: "POST",
        headers,
        body: payload,
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      lastFailure = {
        status: 0,
        errText: err instanceof Error ? err.message.slice(0, 320) : "network",
      };
      if (attempt < maxAttempts - 1) await wait(proxyRetryDelayMs(attempt));
      continue;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      lastFailure = { status: res.status, errText: errText.slice(0, 320) };
      if (canRetryProxy(res.status) && attempt < maxAttempts - 1) {
        await wait(proxyRetryDelayMs(attempt));
        continue;
      }
      return { ok: false, ...lastFailure };
    }
    const parsed = (await res.json()) as {
      data?: unknown;
      subscription?: SubscriptionRow;
    };
    if (parsed.subscription?.user_id) setSubscriptionCache(parsed.subscription);
    return {
      ok: true,
      data: parsed.data,
    };
  }
  return { ok: false, status: lastFailure?.status ?? 0, errText: lastFailure?.errText ?? "network" };
}

function imageProxyFailureMessage(failure: {
  status: number;
  errText: string;
}): string {
  const labels = ["AI_IMAGE_FAILED", String(failure.status)];
  try {
    const body = JSON.parse(failure.errText) as {
      code?: unknown;
      error?: unknown;
      kind?: unknown;
    };
    for (const value of [body.code, body.error, body.kind]) {
      if (typeof value === "string" && value.trim()) {
        labels.push(value.trim().slice(0, 80));
      }
    }
  } catch {}
  return labels.join(":");
}

function parseImageProxyResult(data: unknown): SurgeryPreviewResult {
  const json = data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inline_data?: { mime_type?: string; data?: string };
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
      finishReason?: string;
      safetyRatings?: unknown;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new Error(`blocked: ${json.promptFeedback.blockReason}`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  let imageDataUrl: string | null = null;
  let description: string | undefined;

  for (const p of parts) {
    if (p.text) description = (description ?? "") + p.text;
    const inline = (p.inline_data ?? p.inlineData) as
      | { mime_type?: string; mimeType?: string; data?: string }
      | undefined;
    const mime = inline?.mime_type ?? inline?.mimeType;
    const raw = inline?.data;
    if (raw && mime?.startsWith("image/") && !imageDataUrl) {
      imageDataUrl = `data:${mime};base64,${raw}`;
    }
  }

  if (!imageDataUrl) {
    const finish = json.candidates?.[0]?.finishReason;
    throw new Error(`no-image-returned${finish ? ` (finishReason=${finish})` : ""}`);
  }

  return {
    imageDataUrl,
    ...(description ? { description } : {}),
  };
}

export async function splitVariantGridImage(
  gridImageDataUrl: string,
  options: readonly ProcedureVariantOption[]
): Promise<ProcedureVariantPreview[]> {
  const grid = await loadHtmlImage(gridImageDataUrl);
  if (!grid) throw new Error("variant-grid-image-load-failed");
  const width = grid.naturalWidth || grid.width;
  const height = grid.naturalHeight || grid.height;
  if (width < 2 || height < 2) throw new Error("variant-grid-image-too-small");

  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const boxes = [
    { x: 0, y: 0, w: halfW, h: halfH },
    { x: halfW, y: 0, w: width - halfW, h: halfH },
    { x: 0, y: halfH, w: halfW, h: height - halfH },
    { x: halfW, y: halfH, w: width - halfW, h: height - halfH },
  ] as const;
  const variants: ProcedureVariantPreview[] = [];
  for (let index = 0; index < boxes.length; index += 1) {
    const option = options[index];
    const box = boxes[index];
    if (!option || !box) continue;
    const canvas = document.createElement("canvas");
    canvas.width = box.w;
    canvas.height = box.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas-2d-unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(grid, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    try {
      variants.push({
        option,
        imageDataUrl: canvas.toDataURL("image/png"),
      });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  if (variants.length !== 4) throw new Error("variant-grid-split-failed");
  return variants;
}

function shouldRetryWithSourceReference(failure: {
  status: number;
  errText: string;
}): boolean {
  if (failure.status === 0) return true;
  return failure.errText.includes("AI_IMAGE_FAILED");
}

async function callImageGenProxyWithReferenceFallback(
  image: HTMLImageElement,
  idToken: string | undefined,
  buildRequest: (base64: string) => object
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; errText: string }
> {
  const first = await callImageGenProxy(
    buildRequest(await imageToPortraitBase64Jpeg(image)),
    idToken ?? null
  );
  if (first.ok || !shouldRetryWithSourceReference(first)) return first;

  try {
    return await callImageGenProxy(
      buildRequest(await imageToBase64Jpeg(image, 1536)),
      idToken ?? null
    );
  } catch {
    return first;
  }
}

// Phase 192j — Sibling proxy for the text-model recommend flow. Same
// shape as `callImageGenProxy` but targets `/api/ai/recommend`, which
// allowlists text Flash models and burns the "scans" quota kind.
// Kept separate so the two paths can evolve independently (different
// allowlists, body caps, retry policies).
async function callRecommendProxy(
  request: object,
  idToken: string | null
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; errText: string }
> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const payload = JSON.stringify(request);
  let lastFailure: { status: number; errText: string } | null = null;
  for (let attempt = 0; attempt < AI_PROXY_MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetchProxyWithTimeout("/api/ai/recommend", {
        method: "POST",
        headers,
        body: payload,
      });
    } catch (err) {
      lastFailure = {
        status: 0,
        errText: err instanceof Error ? err.message.slice(0, 320) : "network",
      };
      if (attempt < AI_PROXY_MAX_ATTEMPTS - 1) await wait(proxyRetryDelayMs(attempt));
      continue;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      lastFailure = { status: res.status, errText: errText.slice(0, 320) };
      if (canRetryProxy(res.status) && attempt < AI_PROXY_MAX_ATTEMPTS - 1) {
        await wait(proxyRetryDelayMs(attempt));
        continue;
      }
      return { ok: false, ...lastFailure };
    }
    const parsed = (await res.json()) as {
      data?: unknown;
      subscription?: SubscriptionRow;
    };
    if (parsed.subscription?.user_id) setSubscriptionCache(parsed.subscription);
    return {
      ok: true,
      data: parsed.data,
    };
  }
  return { ok: false, status: lastFailure?.status ?? 0, errText: lastFailure?.errText ?? "network" };
}

export interface ComboPreviewInput {
  image: HTMLImageElement;
  procedures: ProcedureDef[];
  gender: Gender;
  customNote?: string;
  intensity?: Intensity;
  /** Phase 152 → 180 — Supabase access token; see SurgeryPreviewInput. */
  idToken?: string;
}

export async function callGeminiProcedureVariantGrid(
  input: SurgeryPreviewInput
): Promise<ProcedureVariantGridResult> {
  const {
    image,
    procedure,
    gender,
    customNote,
    intensity = "normal",
    idToken,
    signal,
  } = input;
  const dedupeKey = previewDedupeKey([
    "variant-grid",
    previewImageFingerprint(image),
    procedure.key,
    gender,
    intensity,
    customNote ?? "",
    idToken ? "auth" : "anon",
  ]);
  return withInFlightVariantGridDedupe(dedupeKey, () =>
    runProcedureVariantGrid({
      image,
      procedure,
      gender,
      idToken,
      signal,
      intensity,
      ...(customNote ? { customNote } : {}),
    })
  );
}

const inFlightVariantGridRequests = new Map<string, Promise<ProcedureVariantGridResult>>();

function withInFlightVariantGridDedupe(
  key: string,
  run: () => Promise<ProcedureVariantGridResult>
): Promise<ProcedureVariantGridResult> {
  const existing = inFlightVariantGridRequests.get(key);
  if (existing) return existing;
  const promise = run().finally(() => {
    inFlightVariantGridRequests.delete(key);
  });
  inFlightVariantGridRequests.set(key, promise);
  return promise;
}

async function runProcedureVariantGrid(args: {
  image: HTMLImageElement;
  procedure: ProcedureDef;
  gender: Gender;
  idToken: string | undefined;
  signal: AbortSignal | undefined;
  customNote?: string;
  intensity: Intensity;
}): Promise<ProcedureVariantGridResult> {
  const { image, procedure, gender, idToken, customNote, intensity, signal } = args;
  const payload = await buildPreviewGenerationPayload(
    image,
    [procedure],
    intensity,
    { includeTargetCrop: true }
  );
  const options = procedureVariantOptions(procedure.key);
  const proxy = await callImageGenProxy(
    {
      mode: "variant_grid",
      procedureKey: procedure.key,
      gender,
      intensity,
      ...(customNote ? { customNote } : {}),
      ...payload,
      context: {
        mime_type: "image/jpeg",
        data: await imageToBase64Jpeg(image, 1024),
      },
      image: {
        mime_type: "image/jpeg",
        data: await imageToPortraitBase64Jpeg(image),
      },
    },
    idToken ?? null,
    1,
    signal
  );
  if (!proxy.ok) {
    if (proxy.status === 0 || proxy.status >= 500) {
      return deterministicVariantGridFallback(image, options, payload.editContract);
    }
    throw new Error(imageProxyFailureMessage(proxy));
  }
  let parsed: SurgeryPreviewResult;
  let variants: ProcedureVariantPreview[];
  try {
    parsed = parseImageProxyResult(proxy.data);
    variants = await splitVariantGridImage(parsed.imageDataUrl, options);
  } catch {
    return deterministicVariantGridFallback(image, options, payload.editContract);
  }
  const rawReports = await Promise.all(
    variants.map((variant) =>
      validateProcedurePreviewPostCheck({
        beforeImage: image,
        afterImageDataUrl: variant.imageDataUrl,
        procedures: [procedure],
        stage: "provider",
        loadTimeoutMs: 5000,
      }).catch(() => null)
    )
  );
  const hasLocalTarget = Boolean(payload.editContract?.targetGeometry?.length);
  const acceptedVariants = variants.filter((_, index) => {
    const report = rawReports[index];
    return Boolean(
      report?.ok || (hasLocalTarget && report?.code === "identity-drift")
    );
  });
  if (acceptedVariants.length === 0) {
    return deterministicVariantGridFallback(
      image,
      options,
      payload.editContract,
      variants.length
    );
  }
  const sharedProviderVariant =
    acceptedVariants.find((variant) => variant.option.id === "B") ??
    acceptedVariants[0];
  if (!sharedProviderVariant) {
    return deterministicVariantGridFallback(
      image,
      options,
      payload.editContract,
      variants.length
    );
  }
  return {
    gridImageDataUrl: parsed.imageDataUrl,
    variants: options.map((option) => ({
      option,
      imageDataUrl: sharedProviderVariant.imageDataUrl,
      source: "provider" as const,
    })),
    providerRejectedCount: variants.length - acceptedVariants.length,
    ...(parsed.description ? { description: parsed.description } : {}),
    ...(payload.editContract ? { editContract: payload.editContract } : {}),
  };
}

async function deterministicVariantGridFallback(
  image: HTMLImageElement,
  options: readonly ProcedureVariantOption[],
  editContract?: PreviewEditContract,
  providerRejectedCount = 0
): Promise<ProcedureVariantGridResult> {
  const sourceDataUrl = `data:image/jpeg;base64,${await imageToBase64Jpeg(image)}`;
  if (options.length !== 4) throw new Error("preview-options-missing");
  return {
    gridImageDataUrl: sourceDataUrl,
    variants: options.map((option) => ({
      option,
      imageDataUrl: sourceDataUrl,
      source: "deterministic",
    })),
    providerRejectedCount,
    ...(editContract ? { editContract } : {}),
  };
}

/**
 * Phase 135 — generate a single edited image that combines multiple
 * procedures. Identical request shape to `callGeminiSurgeryPreview`
 * except the prompt covers all modifications at once. Caps the input
 * at `MAX_COMBO_PROCEDURES` items to keep quality acceptable.
 */
export async function callGeminiComboPreview(
  input: ComboPreviewInput
): Promise<SurgeryPreviewResult> {
  const {
    image,
    procedures,
    gender,
    customNote,
    intensity = "normal",
    idToken,
  } = input;
  if (procedures.length === 0) throw new Error("combo-empty");
  if (procedures.length === 1) {
    // Single procedure → bills as a surgery preview, not a combo.
    return callGeminiSurgeryPreview({
      image,
      procedure: procedures[0]!,
      gender,
      ...(customNote ? { customNote } : {}),
      intensity,
      ...(idToken ? { idToken } : {}),
    });
  }
  // Phase 192j — quota now enforced server-side by /api/ai/image-gen.
  // Dropped the client-side withQuotaGuard("previews", ...) wrapper
  // because Phase 192f added consumeQuota to the route. Keeping both
  // burned two preview slots per generated image (client reserve +
  // server consume); this is the F8 regression that drained users'
  // preview budgets twice as fast as expected.
  const trimmedKeys = procedures
    .slice(0, MAX_COMBO_PROCEDURES)
    .map((p) => p.key)
    .join(",");
  const dedupeKey = previewDedupeKey([
    "combo",
    previewImageFingerprint(image),
    trimmedKeys,
    gender,
    intensity,
    customNote ?? "",
    idToken ? "auth" : "anon",
  ]);
  return withInFlightPreviewDedupe(dedupeKey, () =>
    runComboPreview({
      image,
      procedures,
      gender,
      idToken,
      intensity,
      ...(customNote ? { customNote } : {}),
    })
  );
}

async function runComboPreview(args: {
  image: HTMLImageElement;
  procedures: ProcedureDef[];
  gender: Gender;
  idToken: string | undefined;
  customNote?: string;
  intensity: Intensity;
}): Promise<SurgeryPreviewResult> {
  const { image, procedures, gender, idToken, customNote, intensity } = args;
  const trimmed = procedures.slice(0, MAX_COMBO_PROCEDURES);
  const payload = await buildPreviewGenerationPayload(
    image,
    trimmed,
    intensity
  );

  const proxy = await callImageGenProxyWithReferenceFallback(
    image,
    idToken,
    (base64) => ({
      mode: "combo",
      procedureKeys: trimmed.map((procedure) => procedure.key),
      gender,
      intensity,
      ...(customNote ? { customNote } : {}),
      ...payload,
      image: {
        mime_type: "image/jpeg",
        data: base64,
      },
    })
  );
  if (!proxy.ok) {
    throw new Error(imageProxyFailureMessage(proxy));
  }
  const json = proxy.data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inline_data?: { mime_type?: string; data?: string };
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new Error(`blocked: ${json.promptFeedback.blockReason}`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  let imageDataUrl: string | null = null;
  let description: string | undefined;
  for (const p of parts) {
    if (p.text) description = (description ?? "") + p.text;
    const inline = (p.inline_data ?? p.inlineData) as
      | { mime_type?: string; mimeType?: string; data?: string }
      | undefined;
    const mime = inline?.mime_type ?? inline?.mimeType;
    const data = inline?.data;
    if (data && mime?.startsWith("image/") && !imageDataUrl) {
      imageDataUrl = `data:${mime};base64,${data}`;
    }
  }
  if (!imageDataUrl) {
    const finish = json.candidates?.[0]?.finishReason;
    throw new Error(`no-image-returned${finish ? ` (finishReason=${finish})` : ""}`);
  }

  await assertProcedurePreviewPostCheck({
    beforeImage: image,
    afterImageDataUrl: imageDataUrl,
    procedures: trimmed,
    stage: "provider",
  });

  return {
    imageDataUrl,
    source: "provider",
    ...(description ? { description } : {}),
    ...(payload.editContract ? { editContract: payload.editContract } : {}),
  };
}

export async function callGeminiSurgeryPreview(
  input: SurgeryPreviewInput
): Promise<SurgeryPreviewResult> {
  const {
    image,
    procedure,
    gender,
    customNote,
    intensity = "normal",
    idToken,
  } = input;

  // Phase 192j — quota now enforced server-side by /api/ai/image-gen.
  // Dropped withQuotaGuard("previews", ...) wrapper because the route's
  // Phase 192f consumeQuota now owns the slot decrement. The previous
  // client+server pair burned two previews per image (the F8 regression).
  const dedupeKey = previewDedupeKey([
    "single",
    previewImageFingerprint(image),
    procedure.key,
    gender,
    intensity,
    customNote ?? "",
    idToken ? "auth" : "anon",
  ]);
  return withInFlightPreviewDedupe(dedupeKey, () =>
    runSurgeryPreview({
      image,
      procedure,
      gender,
      idToken,
      intensity,
      ...(customNote ? { customNote } : {}),
    })
  );
}

async function runSurgeryPreview(args: {
  image: HTMLImageElement;
  procedure: ProcedureDef;
  gender: Gender;
  idToken: string | undefined;
  customNote?: string;
  intensity: Intensity;
}): Promise<SurgeryPreviewResult> {
  const { image, procedure, gender, idToken, customNote, intensity } = args;
  const payload = await buildPreviewGenerationPayload(
    image,
    [procedure],
    intensity
  );

  const proxy = await callImageGenProxyWithReferenceFallback(
    image,
    idToken,
    (base64) => ({
      mode: "single",
      procedureKey: procedure.key,
      gender,
      intensity,
      ...(customNote ? { customNote } : {}),
      ...payload,
      image: {
        mime_type: "image/jpeg",
        data: base64,
      },
    })
  );
  if (!proxy.ok) {
    throw new Error(imageProxyFailureMessage(proxy));
  }
  const json = proxy.data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inline_data?: { mime_type?: string; data?: string };
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
      finishReason?: string;
      safetyRatings?: unknown;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new Error(`blocked: ${json.promptFeedback.blockReason}`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  let imageDataUrl: string | null = null;
  let description: string | undefined;

  for (const p of parts) {
    if (p.text) description = (description ?? "") + p.text;
    const inline = (p.inline_data ?? p.inlineData) as
      | { mime_type?: string; mimeType?: string; data?: string }
      | undefined;
    const mime = inline?.mime_type ?? inline?.mimeType;
    const data = inline?.data;
    if (data && mime?.startsWith("image/") && !imageDataUrl) {
      imageDataUrl = `data:${mime};base64,${data}`;
    }
  }

  if (!imageDataUrl) {
    const finish = json.candidates?.[0]?.finishReason;
    throw new Error(`no-image-returned${finish ? ` (finishReason=${finish})` : ""}`);
  }

  await assertProcedurePreviewPostCheck({
    beforeImage: image,
    afterImageDataUrl: imageDataUrl,
    procedures: [procedure],
    stage: "provider",
  });

  return {
    imageDataUrl,
    source: "provider",
    ...(description ? { description } : {}),
    ...(payload.editContract ? { editContract: payload.editContract } : {}),
  };
}

async function buildPreviewGenerationPayload(
  image: HTMLImageElement,
  procedures: readonly ProcedureDef[],
  intensity: Intensity,
  options: { includeTargetCrop?: boolean } = {}
): Promise<PreviewGenerationPayload> {
  if (procedures.some((procedure) => procedure.key === "body_fat_reduction")) {
    throw new Error("preview-input-unsupported:body-capture-required");
  }
  // Masks and guides stay client-only because providers copied their
  // technical marks into results. Variant grids may add one compressed,
  // photographic target crop; the edit contract still stays local and
  // drives the masked composite after the provider returns.
  const requiresLocalMask = procedures.some(
    (procedure) => !previewRegionsForProcedure(procedure).global
  );
  const detected = await detectPreviewLandmarks(image).catch(() => null);
  if (!detected) {
    if (requiresLocalMask) throw new Error("preview-landmarks-unavailable");
    return {};
  }
  for (const procedure of procedures) {
    const baseline = assessProcedureBaseline({
      image,
      landmarks: detected.landmarks,
      procedure,
    });
    if (baseline && !baseline.passed) {
      throw new Error(`preview-effect-not-applicable:${procedure.key}`);
    }
  }
  const editContract = mergePreviewEditContracts(
    procedures.map((procedure) =>
      buildPreviewEditContract(procedure, detected.landmarks, intensity)
    )
  );
  if (requiresLocalMask && (!editContract || editContract.targetGeometry.length === 0)) {
    throw new Error("preview-mask-unavailable");
  }
  return {
    ...(editContract ? { editContract } : {}),
    ...(options.includeTargetCrop
      ? {
          crop: procedureTargetCropPayload(
            image,
            detected.landmarks,
            procedures.map((procedure) => procedure.key)
          ) ?? undefined,
        }
      : {}),
  };
}

/**
 * Phase 129 — list models that the user's API key has access to and
 * which support `generateContent`. Used by the API key dialog to give
 * the user a discoverable list when the default model 404s.
 */
export interface AvailableModel {
  name: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods: string[];
  /** Heuristic: does it look like an image-generation model? */
  likelyImageCapable: boolean;
}

// ============================================================================
// Phase 133 — AI procedure recommendation
// ============================================================================
//
// Sends the user's photo + the procedure catalog to a text-capable Gemini
// model and asks for an ordered list of procedures (high → low impact)
// with a one-line rationale per item. The UI renders these as a checklist
// with a "Try selected" action that hands keys back to the preview flow.

export type RecommendImpact = "low" | "mid" | "high";
export type AnatomyLayer = "bone" | "muscle" | "fat" | "skin" | "volume" | "dental";

export interface RecommendItem {
  key: ProcedureKey;
  priority: number;
  reason_th: string;
  reason_en: string;
  impact: RecommendImpact;
  anatomy_layer: AnatomyLayer;
  visible_cue_th: string;
  visible_cue_en: string;
  why_this_key_th: string;
  why_this_key_en: string;
  why_not_other_keys_th: string;
  why_not_other_keys_en: string;
  expected_change_th: string;
  expected_change_en: string;
}

export interface NotRecommendedItem {
  key: ProcedureKey;
  reason_th: string;
  reason_en: string;
}

export interface RecommendResult {
  items: RecommendItem[];
  not_recommended: NotRecommendedItem[];
  summary_th?: string;
  summary_en?: string;
}

export interface RecommendInput {
  image: HTMLImageElement;
  gender: Gender;
  /** Phase 152 → 180 — Supabase access token; see SurgeryPreviewInput. */
  idToken?: string;
  /**
   * Phase 638 — full on-device MediaPipe measurement set (same
   * `computeAll` pipeline as /scan), sent alongside the photo so the
   * recommendation is grounded in measured ratios/angles, not the
   * photo alone. Optional — absent when the caller doesn't have a
   * computed scan (falls back to photo-only analysis server-side).
   */
  metrics?: RecommendMetricsSummary;
}

// Phase 192l — bumped from implicit v1 prompt; declared as a code-side
// constant so future logging / A-B switches can pin a known revision
// without parsing the prompt body. Not interpolated into the prompt
// itself (Gemini doesn't need it, and exposing version in output risks
// leaking it back into JSON parsing).
const ANATOMY_LAYERS: ReadonlySet<AnatomyLayer> = new Set([
  "bone",
  "muscle",
  "fat",
  "skin",
  "volume",
  "dental",
]);

export function impactToIntensity(impact: RecommendImpact): Intensity {
  if (impact === "high") return "strong";
  if (impact === "low") return "mild";
  return "normal";
}

export function priorityToIntensity(
  priority: number,
  impact: RecommendImpact
): Intensity {
  if (priority <= 1 && impact !== "low") return "strong";
  if (priority >= 4 && impact !== "high") return "mild";
  return impactToIntensity(impact);
}

async function runProcedureRecommend(args: {
  image: HTMLImageElement;
  gender: Gender;
  idToken: string | undefined;
  metrics?: RecommendMetricsSummary;
}): Promise<RecommendResult> {
  const { image, gender, idToken, metrics } = args;
  const base64 = await imageToBase64Jpeg(image, 768);

  const proxy = await callRecommendProxy(
    {
      gender,
      image: {
        mime_type: "image/jpeg",
        data: base64,
      },
      ...(metrics ? { metrics } : {}),
    },
    idToken ?? null
  );
  if (!proxy.ok) {
    throw new Error(`AI_RECOMMEND_FAILED:${proxy.status}`);
  }
  const json = proxy.data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("AI_RECOMMEND_EMPTY");

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    throw new Error("AI_RECOMMEND_BAD_JSON");
  }

  const obj = parsed as {
    summary_th?: unknown;
    summary_en?: unknown;
    items?: unknown;
    not_recommended?: unknown;
  };
  if (!Array.isArray(obj.items)) throw new Error("AI_RECOMMEND_NO_ITEMS");

  // Phase 614 — filter to the curated CORE catalog, not all 60+ legacy
  // keys. Even though the v17 prompt only lists core keys, the model can
  // still echo a familiar off-catalog key (e.g. under_eye_rejuvenation,
  // skin_smoothing); dropping them here guarantees every recommendation
  // maps to a previewable core procedure and stops the "same old
  // recommendations" drift.
  const known = new Set<ProcedureKey>(coreProcedureKeys());
  const items: RecommendItem[] = [];
  const seenKeys = new Set<ProcedureKey>();
  for (const raw of obj.items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const key = typeof it.key === "string" ? (it.key as ProcedureKey) : null;
    if (!key || !known.has(key)) continue;
    if (seenKeys.has(key)) continue;
    const reason_th = firstString(it, [
      "reason_th",
      "reason",
      "why_this_key_th",
      "visible_cue_th",
    ]);
    const reason_en = firstString(it, [
      "reason_en",
      "reason",
      "why_this_key_en",
      "visible_cue_en",
    ]);
    const impactRaw = typeof it.impact === "string" ? it.impact : "mid";
    const impact: RecommendImpact =
      impactRaw === "low" || impactRaw === "high" ? impactRaw : "mid";
    const anatomyRaw = typeof it.anatomy_layer === "string" ? it.anatomy_layer : "";
    const anatomy_layer: AnatomyLayer = ANATOMY_LAYERS.has(anatomyRaw as AnatomyLayer)
      ? (anatomyRaw as AnatomyLayer)
      : "skin";
    const priority = readPriority(it.priority, items.length + 1);
    seenKeys.add(key);
    items.push({
      key,
      priority,
      reason_th,
      reason_en,
      impact,
      anatomy_layer,
      visible_cue_th: firstString(it, ["visible_cue_th", "visible_cue"]),
      visible_cue_en: firstString(it, ["visible_cue_en", "visible_cue"]),
      why_this_key_th: firstString(it, ["why_this_key_th", "why_this_key"]),
      why_this_key_en: firstString(it, ["why_this_key_en", "why_this_key"]),
      why_not_other_keys_th: firstString(it, [
        "why_not_other_keys_th",
        "why_not_other_keys",
      ]),
      why_not_other_keys_en: firstString(it, [
        "why_not_other_keys_en",
        "why_not_other_keys",
      ]),
      expected_change_th: firstString(it, ["expected_change_th", "expected_change"]),
      expected_change_en: firstString(it, ["expected_change_en", "expected_change"]),
    });
    // Phase 614 — v17 prompt asks for 1-4 ranked items.
    if (items.length >= 4) break;
  }
  const notRecommended: NotRecommendedItem[] = [];
  const seenNotRecommended = new Set<ProcedureKey>();
  if (Array.isArray(obj.not_recommended)) {
    for (const raw of obj.not_recommended) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Record<string, unknown>;
      const key = typeof it.key === "string" ? (it.key as ProcedureKey) : null;
      if (!key || !known.has(key) || seenNotRecommended.has(key)) continue;
      const reason_th = firstString(it, ["reason_th", "reason"]);
      const reason_en = firstString(it, ["reason_en", "reason"]);
      if (!reason_th && !reason_en) continue;
      seenNotRecommended.add(key);
      notRecommended.push({ key, reason_th, reason_en });
      if (notRecommended.length >= 5) break;
    }
  }
  items.sort((a, b) => a.priority - b.priority);
  return {
    items,
    not_recommended: notRecommended,
    ...(typeof obj.summary_th === "string" && obj.summary_th
      ? { summary_th: obj.summary_th }
      : {}),
    ...(typeof obj.summary_en === "string" && obj.summary_en
      ? { summary_en: obj.summary_en }
      : {}),
  };
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readPriority(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(5, Math.max(1, Math.round(value)));
  }
  return Math.min(5, Math.max(1, fallback));
}

/**
 * Best-effort JSON extractor: strips ```json fences, trims to the first
 * `{...}` block, and tries `JSON.parse`. Throws on hard failure.
 */
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // First fenced or unfenced object
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

export async function callGeminiProcedureRecommend(
  input: RecommendInput
): Promise<RecommendResult> {
  // Phase 192j — quota now enforced server-side by /api/ai/recommend.
  // Removed client-side withQuotaGuard("scans", ...) wrapper because
  // the route's server-side consumeQuota now owns the slot decrement.
  // Keeping both would double-burn (one "scans" client + one "scans"
  // server) every recommend call — the same pattern that bit the
  // preview flows once /api/ai/image-gen took over quota.
  return runProcedureRecommend({
    image: input.image,
    gender: input.gender,
    idToken: input.idToken,
    ...(input.metrics ? { metrics: input.metrics } : {}),
  });
}

