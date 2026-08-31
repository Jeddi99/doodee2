import type { MetricKey, MetricResult } from "@/types";
import type { AiScoreResult } from "../ai-gemini";
import type { Category, ScanResult } from "./computeAll";
import { METRIC_CATEGORY } from "./computeAll";
import { facialFullnessPenalty } from "./facial-fullness";
import type { PhotoQualityReport, QualitySeverity } from "./photo-quality";

const CATEGORIES: Category[] = [
  "harmony",
  "angularity",
  "dimorphism",
  "eye-area",
  "features",
  "symmetry",
];

export function reconcileWithAi(
  scan: ScanResult,
  ai: AiScoreResult,
  quality?: PhotoQualityReport | null
): ScanResult {
  if (!Number.isFinite(ai.aiScore) || ai.aiScore < 0 || ai.aiScore > 10) {
    return { ...scan, aiSource: "geometric" };
  }

  const aiRawScore = clamp(ai.aiScore, 0, 10);
  const aiOverall = calibrateAiScore(scan, ai, quality);
  const fullnessPenalty = scan.fullnessPenalty ?? facialFullnessPenalty(scan);
  const aiCats = ai.categories ?? {};
  const hasAiCategories = CATEGORIES.every((cat) => typeof aiCats[cat] === "number");
  const categories: Partial<Record<Category, number>> = {};
  const categoryScales: Partial<Record<Category, number>> = {};

  if (hasAiCategories) {
    for (const [catRaw, avg] of Object.entries(scan.categories)) {
      if (typeof avg !== "number") continue;
      const cat = catRaw as Category;
      const direct = clamp(aiCats[cat] ?? avg, 0, 10);
      const adjusted = clamp(direct * (aiOverall / Math.max(aiRawScore, 0.01)), 0, 10);
      categories[cat] = adjusted;
      categoryScales[cat] = adjusted / Math.max(avg, 0.01);
    }
    for (const cat of CATEGORIES) {
      if (categories[cat] === undefined && typeof aiCats[cat] === "number") {
        categories[cat] = clamp(
          clamp(aiCats[cat], 0, 10) * (aiOverall / Math.max(aiRawScore, 0.01)),
          0,
          10
        );
      }
    }
  } else {
    const scale = aiOverall / Math.max(scan.overall, 0.01);
    for (const [catRaw, avg] of Object.entries(scan.categories)) {
      if (typeof avg !== "number") continue;
      const cat = catRaw as Category;
      categories[cat] = clamp(avg * scale, 0, 10);
      categoryScales[cat] = scale;
    }
  }

  const metrics: Partial<Record<MetricKey, MetricResult>> = {};
  for (const [keyRaw, metric] of Object.entries(scan.metrics)) {
    if (!metric) continue;
    const key = keyRaw as MetricKey;
    const scale = categoryScales[METRIC_CATEGORY[key]];
    metrics[key] =
      metric.flagged || typeof scale !== "number" || !Number.isFinite(scale)
        ? metric
        : { ...metric, score: clamp(metric.score * scale, 0, 10) };
  }

  return {
    ...scan,
    metrics,
    categories,
    overall: aiOverall,
    aiRawScore,
    aiScore: aiOverall,
    fullnessPenalty,
    aiReasoning: ai.reasoning,
    aiConfidence: calibrateAiConfidence(ai, scan, quality),
    aiSource: "ai",
    aiPerceived: ai.perceived,
    ...(Array.isArray(ai.advice) && ai.advice.length > 0
      ? { aiAdvice: ai.advice }
      : {}),
    ...(ai.potential ? { aiPotential: calibratePotential(ai.potential, aiOverall) } : {}),
  };
}

export function calibrateAiScore(
  scan: ScanResult,
  ai: AiScoreResult,
  quality?: PhotoQualityReport | null
): number {
  const baseline = clamp(scan.geometric ?? scan.overall, 0, 10);
  const raw = clamp(ai.aiScore, 0, 10);
  const reliability = evidenceReliability(scan, ai, quality);
  const maxDelta = allowedDelta(scan, ai, quality);
  const clampedRaw = clamp(raw, baseline - maxDelta, baseline + maxDelta);
  const aiWeight = 0.55 + reliability * 0.35;
  let out = baseline * (1 - aiWeight) + clampedRaw * aiWeight;
  out -= (scan.fullnessPenalty ?? facialFullnessPenalty(scan)) * 0.65;

  const weakUnder6 = weakMetricCount(scan, 6);
  if (reliability < 0.8 && weakUnder6 >= 4) out = Math.min(out, 7.0);
  else if (reliability < 0.65 && weakUnder6 >= 2) out = Math.min(out, 7.2);

  return round1(clamp(out, 0, 10));
}

function calibrateAiConfidence(
  ai: AiScoreResult,
  scan: ScanResult,
  quality?: PhotoQualityReport | null
): number {
  return round3(
    clamp(
      Math.min(ai.aiConfidence, scan.confidence ?? 1) * evidenceReliability(scan, ai, quality),
      0.05,
      1
    )
  );
}

function evidenceReliability(
  scan: ScanResult,
  ai: AiScoreResult,
  quality?: PhotoQualityReport | null
): number {
  let r = clamp(ai.aiConfidence, 0, 1) * 0.45 + clamp(scan.confidence ?? 0.75, 0, 1) * 0.55;
  const severity = combinedQuality(ai, quality);
  if (severity === "bad") r *= 0.55;
  else if (severity === "warn") r *= 0.75;
  return clamp(r, 0.2, 1);
}

function allowedDelta(
  scan: ScanResult,
  ai: AiScoreResult,
  quality?: PhotoQualityReport | null
): number {
  const severity = combinedQuality(ai, quality);
  const confidence = Math.min(clamp(ai.aiConfidence, 0, 1), clamp(scan.confidence ?? 0.75, 0, 1));
  if (severity === "bad" || confidence < 0.55) return 0.8;
  if (severity === "warn" || confidence < 0.7) return 1.2;
  if (confidence < 0.85) return 1.6;
  return 2.2;
}

function combinedQuality(
  ai: AiScoreResult,
  quality?: PhotoQualityReport | null
): QualitySeverity {
  if (quality?.overall === "bad" || ai.perceived.photoQuality === "poor") return "bad";
  if (quality?.overall === "warn") return "warn";
  return "ok";
}

function weakMetricCount(scan: ScanResult, threshold: number): number {
  return Object.values(scan.metrics).filter(
    (m) => m && !m.flagged && (m.confidence ?? 1) >= 0.55 && m.score < threshold
  ).length;
}

function calibratePotential(
  potential: NonNullable<AiScoreResult["potential"]>,
  score: number
): NonNullable<AiScoreResult["potential"]> {
  return {
    ifEasy: round1(clamp(potential.ifEasy, score, score + 0.7)),
    ifMid: round1(clamp(potential.ifMid, score, score + 1.5)),
    ifHard: round1(clamp(potential.ifHard, score, score + 2.5)),
    ...(potential.note ? { note: potential.note } : {}),
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}
