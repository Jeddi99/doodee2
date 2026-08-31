import type { ProcedurePreviewPostCheckReport } from "./procedure-preview-postcheck";
import type { ProcedureVariantId } from "./procedure-variant-options";

const ORDER: readonly ProcedureVariantId[] = ["A", "B", "C", "D"];
const THIN_LINE_METRIC = "upper_lid_edge_energy_bilateral";

export interface ProcedureVariantOrderReport {
  ok: boolean;
  magnitudes: readonly number[];
  directionMagnitudes: readonly number[];
}

export function procedureVariantEffectMagnitude(
  report: ProcedurePreviewPostCheckReport
): number | null {
  const stats = report.effect?.stats;
  if (!report.ok || !stats) return null;
  return (
    stats.meanDiff * 0.5 +
    stats.changedRatio * 0.3 +
    stats.p90Diff * 0.2
  );
}

export function validateProcedureVariantOrder(
  reports: Partial<Record<ProcedureVariantId, ProcedurePreviewPostCheckReport>>
): ProcedureVariantOrderReport {
  const pixelById: Partial<Record<ProcedureVariantId, number>> = {};
  const directionById: Partial<Record<ProcedureVariantId, number>> = {};
  const directionMetrics: string[] = [];
  for (const id of ORDER) {
    const report = reports[id];
    if (!report) return { ok: false, magnitudes: [], directionMagnitudes: [] };
    const magnitude = procedureVariantEffectMagnitude(report);
    const directionMagnitude = procedureVariantDirectionMagnitude(report);
    const directionMetric = report.effect?.direction?.metric;
    if (
      magnitude === null ||
      directionMagnitude === null ||
      !directionMetric ||
      !Number.isFinite(magnitude) ||
      !Number.isFinite(directionMagnitude)
    ) {
      return { ok: false, magnitudes: [], directionMagnitudes: [] };
    }
    pixelById[id] = magnitude;
    directionById[id] = directionMagnitude;
    directionMetrics.push(directionMetric);
  }
  const directionMetric = directionMetrics[0] ?? "";
  const pixels = directionMetric === THIN_LINE_METRIC
    ? validateThinLinePixelMagnitudes(pixelById)
    : validateProcedureVariantMagnitudes(pixelById);
  const directionMagnitudes = ORDER.map((id) => directionById[id]) as number[];
  const directionIsOrdered = directionMagnitudes.every((magnitude, index) => {
    if (index === 0) return magnitude > 0;
    const previous = directionMagnitudes[index - 1] ?? 0;
    return magnitude >=
      previous + Math.max(0.00005, Math.abs(previous) * 0.01);
  });
  return {
    ok:
      pixels.ok &&
      directionIsOrdered &&
      new Set(directionMetrics).size === 1,
    magnitudes: pixels.magnitudes,
    directionMagnitudes,
  };
}

function validateThinLinePixelMagnitudes(
  byId: Partial<Record<ProcedureVariantId, number>>
): ProcedureVariantOrderReport {
  const magnitudes = ORDER.map((id) => byId[id]);
  if (magnitudes.some((value) => value === undefined || !Number.isFinite(value))) {
    return {
      ok: false,
      magnitudes: magnitudes.filter((value): value is number => value !== undefined),
      directionMagnitudes: [],
    };
  }
  const complete = magnitudes as number[];
  const first = complete[0] ?? 0;
  const last = complete[complete.length - 1] ?? 0;
  const locallyStable = complete.every((magnitude, index) => {
    if (index === 0) return magnitude > 0;
    const previous = complete[index - 1] ?? 0;
    const noiseTolerance = Math.max(0.00005, previous * 0.04);
    return magnitude >= previous - noiseTolerance;
  });
  return {
    ok:
      locallyStable &&
      last >= first + Math.max(0.00005, first * 0.01),
    magnitudes: complete,
    directionMagnitudes: [],
  };
}

export function procedureVariantDirectionMagnitude(
  report: ProcedurePreviewPostCheckReport
): number | null {
  const direction = report.effect?.direction;
  if (!report.ok || !direction?.passed) return null;
  if (
    direction.metric === "localized_directional_ridge_reduction" ||
    direction.metric === "localized_edge_reduction"
  ) {
    return 1 - direction.ratio;
  }
  if (
    direction.metric === "frontal_chin_length_width_retention" ||
    direction.metric === "upper_lid_edge_energy_bilateral"
  ) {
    return direction.ratio - 1;
  }
  return direction.ratio;
}

export function validateProcedureVariantMagnitudes(
  byId: Partial<Record<ProcedureVariantId, number>>
): ProcedureVariantOrderReport {
  const magnitudes = ORDER.map((id) => byId[id]);
  if (magnitudes.some((value) => value === undefined || !Number.isFinite(value))) {
    return {
      ok: false,
      magnitudes: magnitudes.filter((value): value is number => value !== undefined),
      directionMagnitudes: [],
    };
  }
  const complete = magnitudes as number[];
  const ok = complete.every((magnitude, index) => {
    if (index === 0) return magnitude > 0;
    const previous = complete[index - 1] ?? 0;
    const minimumGrowth = Math.max(0.0001, previous * 0.02);
    return magnitude >= previous + minimumGrowth;
  });
  return { ok, magnitudes: complete, directionMagnitudes: [] };
}
