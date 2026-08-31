import type { MetricKey, MetricResult } from "@/types";
import type { ScanResult } from "./computeAll";

const SIGNALS: ReadonlyArray<{
  key: MetricKey;
  target: number;
  weight: number;
}> = [
  { key: "fwhr", target: 6.4, weight: 0.22 },
  { key: "jaw-width-to-cheek-ratio", target: 6.6, weight: 0.26 },
  { key: "chin-width-ratio", target: 6.4, weight: 0.2 },
  { key: "gonial-angle", target: 6.2, weight: 0.22 },
  { key: "bizygomatic-width-ratio", target: 6.4, weight: 0.1 },
];

export function facialFullnessPenalty(scan: ScanResult): number {
  let weakness = 0;
  let totalWeight = 0;

  for (const signal of SIGNALS) {
    const metric = usable(scan.metrics[signal.key]);
    if (!metric) continue;
    weakness +=
      Math.max(0, (signal.target - metric.score) / signal.target) *
      signal.weight;
    totalWeight += signal.weight;
  }

  if (totalWeight <= 0) return 0;

  const metricPenalty = (weakness / totalWeight) * 0.75;
  const shapePenalty =
    rawAbove(scan.metrics.fwhr, 1.68, 2.05) * 0.18 +
    rawAbove(scan.metrics["jaw-width-to-cheek-ratio"], 0.86, 1.06) * 0.22 +
    rawAbove(scan.metrics["chin-width-ratio"], 0.23, 0.36) * 0.16;
  const categoryPenalty =
    Math.max(
      0,
      (6.2 -
        Math.min(
          scoreOrNeutral(scan.categories.angularity),
          scoreOrNeutral(scan.categories.dimorphism),
          scoreOrNeutral(scan.categories.harmony),
        )) /
        6.2,
    ) * 0.25;

  return clamp(metricPenalty + shapePenalty + categoryPenalty, 0, 0.85);
}

export function applyFacialFullnessPenalty(scan: ScanResult): ScanResult {
  const penalty = facialFullnessPenalty(scan);
  const previous = scan.fullnessPenalty ?? 0;
  const delta = Math.max(0, penalty - previous);
  if (delta < 0.03) {
    return penalty > previous ? { ...scan, fullnessPenalty: penalty } : scan;
  }
  return {
    ...scan,
    overall: clamp(scan.overall - delta, 0, 10),
    geometric:
      scan.geometric === undefined
        ? undefined
        : clamp(scan.geometric - delta, 0, 10),
    secondOpinion:
      scan.secondOpinion === undefined
        ? undefined
        : clamp(scan.secondOpinion - delta * 0.75, 0, 10),
    aiScore:
      scan.aiScore === undefined ? undefined : clamp(scan.aiScore - delta, 0, 10),
    fullnessPenalty: penalty,
  };
}

function usable(metric: MetricResult | undefined): MetricResult | null {
  if (!metric || metric.flagged || (metric.confidence ?? 1) < 0.55) return null;
  return Number.isFinite(metric.score) ? metric : null;
}

function rawAbove(
  metric: MetricResult | undefined,
  start: number,
  full: number,
): number {
  const usableMetric = usable(metric);
  if (!usableMetric || usableMetric.raw <= start) return 0;
  return clamp((usableMetric.raw - start) / (full - start), 0, 1);
}

function scoreOrNeutral(score: number | undefined): number {
  return typeof score === "number" && Number.isFinite(score) ? score : 10;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
