import type { Landmarks } from "@/types";
import type {
  Intensity,
  ProcedureDef,
  ProcedureKey,
} from "./ai-procedure-catalog";
import type { ProcedureVariantId } from "./procedure-variant-options";

export type ProcedureEffectEngine =
  | "geometry"
  | "appearance"
  | "hybrid"
  | "provider"
  | "unsupported";

export interface GeometryHandle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radiusX: number;
  radiusY: number;
}

export type AppearanceKind =
  | "smooth"
  | "brighten_smooth"
  | "fold"
  | "volume";

export interface AppearanceZone {
  kind: AppearanceKind;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  strength: number;
}

export interface ProcedureEffectPlan {
  procedureKey: ProcedureKey;
  intensity: Intensity;
  engine: ProcedureEffectEngine;
  geometry: GeometryHandle[];
  appearance: AppearanceZone[];
}

export const PROCEDURE_VARIANT_FACTORS = Object.freeze({
  A: 1,
  B: 1.35,
  C: 1.7,
  D: 2.1,
} satisfies Record<ProcedureVariantId, number>);

export const LOCAL_PREVIEW_EFFECT_SCALE = 0.55;

const CHIN_LENGTH_VARIANT_FACTORS = Object.freeze({
  A: 0.5,
  B: 0.65,
  C: 0.8,
  D: 1,
} satisfies Record<ProcedureVariantId, number>);

const CANTHOPLASTY_VARIANT_FACTORS = Object.freeze({
  A: 0.65,
  B: 0.9,
  C: 1.15,
  D: 1.45,
} satisfies Record<ProcedureVariantId, number>);

const PROCEDURE_VARIANT_FACTOR_OVERRIDES: Partial<
  Record<ProcedureKey, Readonly<Record<ProcedureVariantId, number>>>
> = {
  rhinoplasty: Object.freeze({ A: 0.8, B: 1.05, C: 1.3, D: 1.6 }),
  canthoplasty: CANTHOPLASTY_VARIANT_FACTORS,
  chin_augmentation: CHIN_LENGTH_VARIANT_FACTORS,
  filler_chin: CHIN_LENGTH_VARIANT_FACTORS,
  genioplasty_consult: CHIN_LENGTH_VARIANT_FACTORS,
  tip_refinement: Object.freeze({ A: 0.8, B: 1.05, C: 1.3, D: 1.6 }),
  alar_reduction: Object.freeze({ A: 0.75, B: 1, C: 1.25, D: 1.55 }),
  eye_bag_removal: Object.freeze({ A: 1, B: 1.35, C: 1.75, D: 2.15 }),
  filler_tear_trough: Object.freeze({ A: 1.15, B: 1.55, C: 2, D: 2.4 }),
  temple_filler: Object.freeze({ A: 1.1, B: 1.45, C: 1.85, D: 2.3 }),
  thread_lift_consult: Object.freeze({ A: 0.9, B: 1.07, C: 1.27, D: 1.45 }),
  forehead_volume_consult: Object.freeze({ A: 1.2, B: 1.55, C: 1.9, D: 2.25 }),
  botox_masseter: Object.freeze({ A: 0.7, B: 1, C: 1.3, D: 1.65 }),
  double_eyelid: Object.freeze({ A: 0.8, B: 1.05, C: 1.3, D: 1.6 }),
  filler_nasolabial: Object.freeze({ A: 1.1, B: 1.4, C: 1.72, D: 2.1 }),
  midface_support_filler: Object.freeze({ A: 0.8, B: 1.05, C: 1.3, D: 1.6 }),
};

export function procedureVariantFactor(
  variant: ProcedureVariantId | undefined,
  procedureKey?: ProcedureKey
): number {
  if (!variant) return 1;
  const factors = procedureKey
    ? PROCEDURE_VARIANT_FACTOR_OVERRIDES[procedureKey]
    : undefined;
  return (factors ?? PROCEDURE_VARIANT_FACTORS)[variant];
}

const CORE_UNSUPPORTED = new Set<ProcedureKey>(["body_fat_reduction"]);

export function buildProcedureEffectPlan(
  procedure: ProcedureDef,
  landmarks: Landmarks,
  intensity: Intensity
): ProcedureEffectPlan {
  if (CORE_UNSUPPORTED.has(procedure.key)) {
    return plan(procedure.key, intensity, "unsupported");
  }

  const factor = intensityFactor(intensity);
  const faceWidth = distance(landmarks, 234, 454) || 0.42;
  const faceHeight = distance(landmarks, 10, 152) || 0.48;
  const centerX = midpoint(landmarks, 234, 454).x;
  const h = (
    index: number,
    dx: number,
    dy: number,
    radiusX: number,
    radiusY: number
  ): GeometryHandle => {
    const p = point(landmarks, index);
    return {
      x: p.x,
      y: p.y,
      dx: dx * factor,
      dy: dy * factor,
      radiusX,
      radiusY,
    };
  };
  const inward = (
    index: number,
    amount: number,
    radiusX: number,
    radiusY: number
  ): GeometryHandle => {
    const p = point(landmarks, index);
    return h(
      index,
      Math.sign(centerX - p.x) * amount,
      0,
      radiusX,
      radiusY
    );
  };
  const outward = (
    index: number,
    amount: number,
    radiusX: number,
    radiusY: number
  ): GeometryHandle => {
    const p = point(landmarks, index);
    return h(
      index,
      Math.sign(p.x - centerX) * amount,
      0,
      radiusX,
      radiusY
    );
  };
  const outwardLift = (
    index: number,
    amount: number,
    lift: number,
    radiusX: number,
    radiusY: number
  ): GeometryHandle => {
    const p = point(landmarks, index);
    return h(
      index,
      Math.sign(p.x - centerX) * amount,
      -lift,
      radiusX,
      radiusY
    );
  };
  const zone = (
    kind: AppearanceKind,
    indices: readonly number[],
    padX: number,
    padY: number,
    strength: number,
    rotation = 0
  ): AppearanceZone => appearanceZone(
    kind,
    landmarks,
    indices,
    padX,
    padY,
    strength * factor,
    rotation
  );

  switch (procedure.key) {
    case "rhinoplasty":
      return plan(procedure.key, intensity, "hybrid", [
        inward(98, faceWidth * 0.016, faceWidth * 0.1, faceHeight * 0.12),
        inward(327, faceWidth * 0.016, faceWidth * 0.1, faceHeight * 0.12),
        inward(129, faceWidth * 0.011, faceWidth * 0.09, faceHeight * 0.09),
        inward(358, faceWidth * 0.011, faceWidth * 0.09, faceHeight * 0.09),
        h(1, 0, -faceHeight * 0.009, faceWidth * 0.09, faceHeight * 0.11),
      ], [zone("volume", [168, 6, 197, 195, 5, 4, 1], 1.3, 1.2, 0.35)]);
    case "tip_refinement":
      return plan(procedure.key, intensity, "geometry", [
        inward(98, faceWidth * 0.015, faceWidth * 0.09, faceHeight * 0.09),
        inward(327, faceWidth * 0.015, faceWidth * 0.09, faceHeight * 0.09),
        h(1, 0, -faceHeight * 0.009, faceWidth * 0.08, faceHeight * 0.09),
      ]);
    case "alar_reduction":
      return plan(procedure.key, intensity, "geometry", [
        inward(129, faceWidth * 0.018, faceWidth * 0.1, faceHeight * 0.08),
        inward(358, faceWidth * 0.018, faceWidth * 0.1, faceHeight * 0.08),
      ]);
    case "nose_filler":
      return plan(procedure.key, intensity, "hybrid", [
        inward(98, faceWidth * 0.004, faceWidth * 0.08, faceHeight * 0.12),
        inward(327, faceWidth * 0.004, faceWidth * 0.08, faceHeight * 0.12),
      ], [zone("volume", [168, 6, 197, 195, 5, 4, 1], 1.4, 1.25, 1)]);
    case "double_eyelid":
      return plan(procedure.key, intensity, "appearance", [], [
        upperLidFoldZone(landmarks, [33, 133, 159, 160], factor),
        upperLidFoldZone(landmarks, [263, 362, 386, 385], factor),
      ]);
    case "canthoplasty": {
      const rx = faceWidth * 0.095;
      const ry = faceHeight * 0.065;
      return plan(procedure.key, intensity, "geometry", [
        h(33, -faceWidth * 0.011, -faceHeight * 0.012, rx, ry),
        h(263, faceWidth * 0.011, -faceHeight * 0.012, rx, ry),
      ]);
    }
    case "eye_bag_removal":
      return plan(procedure.key, intensity, "appearance", [], [
        lowerEyeZone(landmarks, "right", factor, "smooth"),
        lowerEyeZone(landmarks, "left", factor, "smooth"),
      ]);
    case "filler_tear_trough":
    case "under_eye_rejuvenation":
    case "under_eye_fat_repositioning":
      return plan(procedure.key, intensity, "appearance", [], [
        lowerEyeZone(landmarks, "right", factor, "brighten_smooth"),
        lowerEyeZone(landmarks, "left", factor, "brighten_smooth"),
      ]);
    case "botox_crows_feet":
      return plan(procedure.key, intensity, "appearance", [], [
        outerEyeZone(landmarks, 33, -1, factor),
        outerEyeZone(landmarks, 263, 1, factor),
      ]);
    case "chin_augmentation":
    case "genioplasty_consult":
      return plan(procedure.key, intensity, "geometry", [
        h(152, 0, faceHeight * 0.024, faceWidth * 0.13, faceHeight * 0.14),
        h(148, 0, faceHeight * 0.018, faceWidth * 0.14, faceHeight * 0.14),
        h(377, 0, faceHeight * 0.018, faceWidth * 0.14, faceHeight * 0.14),
      ]);
    case "filler_chin":
      return plan(procedure.key, intensity, "hybrid", [
        h(152, 0, faceHeight * 0.021, faceWidth * 0.14, faceHeight * 0.15),
        h(148, 0, faceHeight * 0.016, faceWidth * 0.13, faceHeight * 0.14),
        h(377, 0, faceHeight * 0.016, faceWidth * 0.13, faceHeight * 0.14),
      ], [zone("volume", [18, 200, 199, 148, 152, 377], 1.2, 1.2, 0.25)]);
    case "jaw_reduction":
    case "v_line_surgery":
      return plan(procedure.key, intensity, "geometry", [
        inward(172, faceWidth * 0.027, faceWidth * 0.2, faceHeight * 0.18),
        inward(397, faceWidth * 0.027, faceWidth * 0.2, faceHeight * 0.18),
        inward(136, faceWidth * 0.032, faceWidth * 0.18, faceHeight * 0.17),
        inward(365, faceWidth * 0.032, faceWidth * 0.18, faceHeight * 0.17),
        inward(150, faceWidth * 0.018, faceWidth * 0.15, faceHeight * 0.15),
        inward(379, faceWidth * 0.018, faceWidth * 0.15, faceHeight * 0.15),
      ]);
    case "botox_masseter":
      return plan(procedure.key, intensity, "geometry", [
        inward(172, faceWidth * 0.027, faceWidth * 0.18, faceHeight * 0.17),
        inward(397, faceWidth * 0.027, faceWidth * 0.18, faceHeight * 0.17),
        inward(136, faceWidth * 0.022, faceWidth * 0.17, faceHeight * 0.16),
        inward(365, faceWidth * 0.022, faceWidth * 0.17, faceHeight * 0.16),
      ]);
    case "thread_lift_consult":
      return plan(procedure.key, intensity, "geometry", [
        outwardLift(132, 0, faceHeight * 0.05, faceWidth * 0.15, faceHeight * 0.14),
        outwardLift(361, 0, faceHeight * 0.05, faceWidth * 0.15, faceHeight * 0.14),
        outwardLift(172, 0, faceHeight * 0.04, faceWidth * 0.13, faceHeight * 0.13),
        outwardLift(397, 0, faceHeight * 0.04, faceWidth * 0.13, faceHeight * 0.13),
      ]);
    case "cheekbone_reduction":
      return plan(procedure.key, intensity, "geometry", [
        inward(234, faceWidth * 0.018, faceWidth * 0.2, faceHeight * 0.18),
        inward(454, faceWidth * 0.018, faceWidth * 0.2, faceHeight * 0.18),
        inward(93, faceWidth * 0.012, faceWidth * 0.18, faceHeight * 0.18),
        inward(323, faceWidth * 0.012, faceWidth * 0.18, faceHeight * 0.18),
      ]);
    case "buccal_fat":
      return plan(procedure.key, intensity, "hybrid", [
        inward(132, faceWidth * 0.014, faceWidth * 0.19, faceHeight * 0.2),
        inward(361, faceWidth * 0.014, faceWidth * 0.19, faceHeight * 0.2),
      ], [zone("smooth", [50, 123, 132, 280, 352, 361], 1.35, 1.45, 0.2)]);
    case "filler_nasolabial":
      return plan(procedure.key, intensity, "appearance", [], nasolabialZones(landmarks, factor));
    case "midface_support_filler":
      return plan(procedure.key, intensity, "hybrid", [
        outwardLift(234, faceWidth * 0.012, faceHeight * 0.025, faceWidth * 0.16, faceHeight * 0.14),
        outwardLift(454, faceWidth * 0.012, faceHeight * 0.025, faceWidth * 0.16, faceHeight * 0.14),
        outwardLift(50, faceWidth * 0.008, faceHeight * 0.018, faceWidth * 0.11, faceHeight * 0.1),
        outwardLift(280, faceWidth * 0.008, faceHeight * 0.018, faceWidth * 0.11, faceHeight * 0.1),
      ], [
        zone("volume", [234, 127, 132, 50, 123], 0.72, 0.6, 0.36),
        zone("volume", [454, 356, 361, 280, 352], 0.72, 0.6, 0.36),
      ]);
    case "forehead_volume_consult":
      return plan(procedure.key, intensity, "hybrid", [
        outward(67, faceWidth * 0.007, faceWidth * 0.16, faceHeight * 0.14),
        outward(297, faceWidth * 0.007, faceWidth * 0.16, faceHeight * 0.14),
      ], [
        zone("volume", [10, 67, 109, 151, 337, 338, 297, 332], 1.25, 1.4, 0.4),
      ]);
    case "temple_filler":
      return plan(procedure.key, intensity, "hybrid", [
        outward(127, faceWidth * 0.015, faceWidth * 0.15, faceHeight * 0.18),
        outward(356, faceWidth * 0.015, faceWidth * 0.15, faceHeight * 0.18),
      ], [
        zone("volume", [127, 34, 139], 1.15, 1.25, 0.32),
        zone("volume", [356, 264, 368], 1.15, 1.25, 0.32),
      ]);
    case "botox_forehead":
    case "botox_glabellar":
      return plan(procedure.key, intensity, "appearance", [], [
        zone("smooth", [10, 67, 109, 151, 337, 338, 297, 332], 1.25, 1.35, 0.8),
      ]);
    default:
      return plan(procedure.key, intensity, "provider");
  }
}

export function applyProcedureEffectPlans(
  canvas: HTMLCanvasElement,
  plans: readonly ProcedureEffectPlan[],
  variant?: ProcedureVariantId
): boolean {
  const supported = plans.filter((item) => item.engine !== "unsupported");
  if (supported.every((item) => item.geometry.length === 0 && item.appearance.length === 0)) {
    return false;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) return false;
  let image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (const effect of supported) {
    const factor = procedureVariantFactor(variant, effect.procedureKey) * LOCAL_PREVIEW_EFFECT_SCALE;
    if (effect.geometry.length > 0) {
      image.data.set(warpPixels(image, effect.geometry, factor));
    }
    if (effect.appearance.length > 0) {
      image.data.set(applyAppearance(image, effect.appearance, factor));
    }
  }
  ctx.putImageData(image, 0, 0);
  return true;
}

export function warpPoint(
  x: number,
  y: number,
  handles: readonly GeometryHandle[],
  factor = 1
): { x: number; y: number } {
  return inverseWarpPoint(x, y, buildWarpField(handles, factor));
}

interface WarpField {
  handles: readonly GeometryHandle[];
  coefficientsX: readonly number[];
  coefficientsY: readonly number[];
}

function warpPixels(
  image: ImageData,
  handles: readonly GeometryHandle[],
  factor: number
): Uint8ClampedArray {
  const { width, height, data } = image;
  const output = new Uint8ClampedArray(data);
  const bounds = handleBounds(handles, width, height, factor);
  if (!bounds) return output;
  const field = buildWarpField(handles, factor);
  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const source = inverseWarpPoint(x / width, y / height, field);
      sampleBilinear(data, output, width, height, source.x * width, source.y * height, x, y);
    }
  }
  return output;
}

function buildWarpField(
  handles: readonly GeometryHandle[],
  factor: number
): WarpField {
  const matrix = handles.map((row) =>
    handles.map((column) => radialWeight(row.x, row.y, column))
  );
  const desiredX = handles.map((item) => item.dx * factor);
  const desiredY = handles.map((item) => item.dy * factor);
  return {
    handles,
    coefficientsX: solveLinearSystem(matrix, desiredX) ?? desiredX,
    coefficientsY: solveLinearSystem(matrix, desiredY) ?? desiredY,
  };
}

function inverseWarpPoint(
  targetX: number,
  targetY: number,
  field: WarpField
): { x: number; y: number } {
  let sourceX = targetX;
  let sourceY = targetY;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const displacement = fieldDisplacement(sourceX, sourceY, field);
    const nextX = targetX - displacement.x;
    const nextY = targetY - displacement.y;
    if (Math.hypot(nextX - sourceX, nextY - sourceY) < 0.000001) {
      sourceX = nextX;
      sourceY = nextY;
      break;
    }
    sourceX = nextX;
    sourceY = nextY;
  }
  return { x: sourceX, y: sourceY };
}

function fieldDisplacement(
  x: number,
  y: number,
  field: WarpField
): { x: number; y: number } {
  let dx = 0;
  let dy = 0;
  for (let index = 0; index < field.handles.length; index += 1) {
    const handle = field.handles[index];
    if (!handle) continue;
    const weight = radialWeight(x, y, handle);
    dx += (field.coefficientsX[index] ?? 0) * weight;
    dy += (field.coefficientsY[index] ?? 0) * weight;
  }
  return { x: dx, y: dy };
}

function radialWeight(x: number, y: number, handle: GeometryHandle): number {
  const nx = (x - handle.x) / Math.max(handle.radiusX, 0.0001);
  const ny = (y - handle.y) / Math.max(handle.radiusY, 0.0001);
  const r2 = nx * nx + ny * ny;
  return r2 >= 1 ? 0 : (1 - r2) ** 2;
}

function solveLinearSystem(
  input: readonly (readonly number[])[],
  values: readonly number[]
): number[] | null {
  const size = values.length;
  if (size === 0) return [];
  const matrix = input.map((row, index) => [
    ...row,
    values[index] ?? 0,
  ]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row]?.[column] ?? 0) > Math.abs(matrix[pivot]?.[column] ?? 0)) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot]?.[column] ?? 0) < 0.000001) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot]!, matrix[column]!];
    const divisor = matrix[column]?.[column] ?? 1;
    for (let cell = column; cell <= size; cell += 1) {
      matrix[column]![cell] = (matrix[column]?.[cell] ?? 0) / divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const multiplier = matrix[row]?.[column] ?? 0;
      for (let cell = column; cell <= size; cell += 1) {
        matrix[row]![cell] = (matrix[row]?.[cell] ?? 0) - multiplier * (matrix[column]?.[cell] ?? 0);
      }
    }
  }
  return matrix.map((row) => row[size] ?? 0);
}

function applyAppearance(
  image: ImageData,
  zones: readonly AppearanceZone[],
  factor: number
): Uint8ClampedArray {
  const { width, height, data } = image;
  const output = new Uint8ClampedArray(data);
  for (const zone of zones) {
    const rx = Math.max(2, zone.radiusX * width);
    const ry = Math.max(2, zone.radiusY * height);
    const cx = zone.centerX * width;
    const cy = zone.centerY * height;
    const radius = Math.max(rx, ry);
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    const cos = Math.cos(zone.rotation);
    const sin = Math.sin(zone.rotation);
    const strength = Math.min(2.4, zone.strength * factor);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const localX = x - cx;
        const localY = y - cy;
        const u = (localX * cos + localY * sin) / rx;
        const v = (-localX * sin + localY * cos) / ry;
        const r2 = u * u + v * v;
        if (r2 >= 1) continue;
        const weight = (1 - r2) ** 2 * strength;
        const i = (y * width + x) * 4;
        if (zone.kind === "fold") {
          const dark = Math.exp(-((v + 0.07) ** 2) / 0.005) * (1 - u * u) * weight;
          const light = Math.exp(-((v - 0.13) ** 2) / 0.016) * (1 - u * u) * weight;
          for (let c = 0; c < 3; c += 1) {
            const base = data[i + c] ?? 0;
            const average = crossAverage(data, width, height, x, y, c);
            const detail = (base - average) * 0.42 * weight;
            output[i + c] = clampByte(base + detail - 56 * dark + 16 * light);
          }
          continue;
        }
        const smooth = zone.kind === "volume"
          ? weight * 0.34
          : 1 - Math.exp(-weight * 0.92);
        const brighten = zone.kind === "brighten_smooth"
          ? 18 * weight
          : zone.kind === "volume"
            ? 20 * weight
            : 2.5 * weight;
        for (let c = 0; c < 3; c += 1) {
          const base = data[i + c] ?? 0;
          const average = crossAverage(data, width, height, x, y, c);
          output[i + c] = clampByte(base + (average - base) * smooth + brighten);
        }
      }
    }
  }
  return output;
}

function handleBounds(
  handles: readonly GeometryHandle[],
  width: number,
  height: number,
  factor: number
): { x0: number; y0: number; x1: number; y1: number } | null {
  if (handles.length === 0) return null;
  const x0 = Math.min(...handles.flatMap((item) => [
    item.x - item.radiusX,
    item.x + item.dx * factor - item.radiusX,
  ]));
  const y0 = Math.min(...handles.flatMap((item) => [
    item.y - item.radiusY,
    item.y + item.dy * factor - item.radiusY,
  ]));
  const x1 = Math.max(...handles.flatMap((item) => [
    item.x + item.radiusX,
    item.x + item.dx * factor + item.radiusX,
  ]));
  const y1 = Math.max(...handles.flatMap((item) => [
    item.y + item.radiusY,
    item.y + item.dy * factor + item.radiusY,
  ]));
  return {
    x0: Math.max(0, Math.floor(x0 * width)),
    y0: Math.max(0, Math.floor(y0 * height)),
    x1: Math.min(width - 1, Math.ceil(x1 * width)),
    y1: Math.min(height - 1, Math.ceil(y1 * height)),
  };
}

function sampleBilinear(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number
): void {
  const x = Math.max(0, Math.min(width - 1, sx));
  const y = Math.max(0, Math.min(height - 1, sy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const out = (dy * width + dx) * 4;
  for (let c = 0; c < 4; c += 1) {
    const a = source[(y0 * width + x0) * 4 + c] ?? 0;
    const b = source[(y0 * width + x1) * 4 + c] ?? 0;
    const d = source[(y1 * width + x0) * 4 + c] ?? 0;
    const e = source[(y1 * width + x1) * 4 + c] ?? 0;
    output[out + c] = clampByte(
      (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty
    );
  }
}

function crossAverage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number
): number {
  const offsets = [
    [0, 0], [-4, 0], [4, 0], [0, -4], [0, 4],
    [-3, -3], [3, -3], [-3, 3], [3, 3],
  ] as const;
  let total = 0;
  for (const [ox, oy] of offsets) {
    const px = Math.max(0, Math.min(width - 1, x + ox));
    const py = Math.max(0, Math.min(height - 1, y + oy));
    total += data[(py * width + px) * 4 + channel] ?? 0;
  }
  return total / offsets.length;
}

function lowerEyeZone(
  landmarks: Landmarks,
  side: "right" | "left",
  factor: number,
  kind: "smooth" | "brighten_smooth"
): AppearanceZone {
  const indices = side === "right" ? [33, 133, 145, 153, 154] : [263, 362, 373, 374, 380];
  const base = appearanceZone(kind, landmarks, indices, 1.25, 2.7, factor, 0);
  return {
    ...base,
    centerY: base.centerY + base.radiusY * 0.45,
    strength: base.strength,
  };
}

function upperLidFoldZone(
  landmarks: Landmarks,
  indices: readonly number[],
  factor: number
): AppearanceZone {
  const base = appearanceZone("fold", landmarks, indices, 1.12, 1.8, 0.8 * factor, 0);
  return {
    ...base,
    centerY: base.centerY - base.radiusY * 0.95,
  };
}

function outerEyeZone(
  landmarks: Landmarks,
  outerIndex: number,
  direction: -1 | 1,
  factor: number
): AppearanceZone {
  const p = point(landmarks, outerIndex);
  const faceWidth = distance(landmarks, 234, 454) || 0.42;
  const faceHeight = distance(landmarks, 10, 152) || 0.48;
  const boundaryX = outerIndex === 33
    ? (point(landmarks, 127).x + point(landmarks, 234).x) / 2
    : (point(landmarks, 356).x + point(landmarks, 454).x) / 2;
  const lateralGap = Math.abs(p.x - boundaryX);
  return {
    kind: "smooth",
    centerX: p.x + direction * lateralGap * 0.35,
    centerY: p.y,
    radiusX: Math.max(faceWidth * 0.025, lateralGap * 0.4),
    radiusY: faceHeight * 0.025,
    rotation: 0,
    strength: Math.min(1, 0.9 * factor),
  };
}

function nasolabialZones(
  landmarks: Landmarks,
  factor: number
): AppearanceZone[] {
  return [[129, 61], [358, 291]].map(([start, end]) => {
    const a = point(landmarks, start!);
    const b = point(landmarks, end!);
    return {
      kind: "smooth" as const,
      centerX: (a.x + b.x) / 2,
      centerY: (a.y + b.y) / 2,
    radiusX: Math.max(0.018, distancePoints(a, b) * 0.72),
    radiusY: Math.max(0.012, distancePoints(a, b) * 0.38),
      rotation: Math.atan2(b.y - a.y, b.x - a.x),
      strength: Math.min(1, 0.95 * factor),
    };
  });
}

function appearanceZone(
  kind: AppearanceKind,
  landmarks: Landmarks,
  indices: readonly number[],
  padX: number,
  padY: number,
  strength: number,
  rotation: number
): AppearanceZone {
  const points = indices.map((index) => point(landmarks, index));
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    kind,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    radiusX: Math.max(0.012, (maxX - minX) * 0.5 * padX),
    radiusY: Math.max(0.008, (maxY - minY) * 0.5 * padY),
    rotation,
    strength: Math.min(1, strength),
  };
}

function plan(
  procedureKey: ProcedureKey,
  intensity: Intensity,
  engine: ProcedureEffectEngine,
  geometry: GeometryHandle[] = [],
  appearance: AppearanceZone[] = []
): ProcedureEffectPlan {
  return { procedureKey, intensity, engine, geometry, appearance };
}

function point(landmarks: Landmarks, index: number): { x: number; y: number } {
  const item = landmarks[index];
  return { x: item?.x ?? 0.5, y: item?.y ?? 0.5 };
}

function midpoint(landmarks: Landmarks, a: number, b: number): { x: number; y: number } {
  const pa = point(landmarks, a);
  const pb = point(landmarks, b);
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}

function distance(landmarks: Landmarks, a: number, b: number): number {
  return distancePoints(point(landmarks, a), point(landmarks, b));
}

function distancePoints(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function intensityFactor(intensity: Intensity): number {
  if (intensity === "mild") return 0.72;
  if (intensity === "strong") return 1.22;
  return 1;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
