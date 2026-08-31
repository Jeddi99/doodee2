import type { MetricKey } from "@/types";
import type { ScanResult } from "./scoring/computeAll";

/**
 * Phase 638 — compact wire shape for sending the full on-device
 * MediaPipe measurement set alongside the photo to the procedure-
 * recommend AI call, so the recommendation is grounded in actual
 * measured ratios/angles rather than the photo alone.
 */
export interface RecommendMetricItem {
  key: MetricKey;
  raw: number;
  score: number;
  unit: string;
  ideal: [number, number];
}

export interface RecommendMetricsSummary {
  overall: number;
  pose: { yaw: number; pitch: number; roll: number; frontness: number };
  metrics: RecommendMetricItem[];
}

const MAX_SUMMARY_METRICS = 80;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Builds the summary from a freshly-computed `ScanResult`. Flagged
 * metrics (landmark-detection errors, not real anatomical outliers)
 * are excluded — they'd mislead the AI into treating a detection glitch
 * as a visible concern.
 */
export function buildRecommendMetricsSummary(
  scan: ScanResult
): RecommendMetricsSummary {
  const metrics: RecommendMetricItem[] = [];
  for (const [key, m] of Object.entries(scan.metrics)) {
    if (!m || m.flagged) continue;
    metrics.push({
      key: key as MetricKey,
      raw: round(m.raw),
      score: round(m.score),
      unit: m.unit,
      ideal: [round(m.ideal[0]), round(m.ideal[1])],
    });
  }
  return {
    overall: round(scan.overall),
    pose: {
      yaw: round(scan.pose.yaw),
      pitch: round(scan.pose.pitch),
      roll: round(scan.pose.roll),
      frontness: round(scan.pose.frontness),
    },
    metrics,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMetricItem(value: unknown): value is RecommendMetricItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    v.key.length > 0 &&
    v.key.length <= 64 &&
    isFiniteNumber(v.raw) &&
    isFiniteNumber(v.score) &&
    typeof v.unit === "string" &&
    Array.isArray(v.ideal) &&
    v.ideal.length === 2 &&
    isFiniteNumber(v.ideal[0]) &&
    isFiniteNumber(v.ideal[1])
  );
}

/**
 * Server-side validator — the summary crosses the network as untrusted
 * client JSON. Returns null (treat as absent) rather than throwing, so
 * a malformed payload degrades to the photo-only recommend behavior
 * instead of failing the whole request.
 */
export function sanitizeRecommendMetricsSummary(
  value: unknown
): RecommendMetricsSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isFiniteNumber(v.overall)) return null;
  const pose = v.pose;
  if (typeof pose !== "object" || pose === null) return null;
  const p = pose as Record<string, unknown>;
  if (
    !isFiniteNumber(p.yaw) ||
    !isFiniteNumber(p.pitch) ||
    !isFiniteNumber(p.roll) ||
    !isFiniteNumber(p.frontness)
  ) {
    return null;
  }
  if (!Array.isArray(v.metrics) || v.metrics.length > MAX_SUMMARY_METRICS) {
    return null;
  }
  const metrics = v.metrics.filter(isMetricItem);
  if (metrics.length === 0) return null;
  return {
    overall: v.overall,
    pose: {
      yaw: p.yaw,
      pitch: p.pitch,
      roll: p.roll,
      frontness: p.frontness,
    },
    metrics,
  };
}
