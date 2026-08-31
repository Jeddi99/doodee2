import {
  buildRepeatabilityReport,
  groupByIdentity,
  type RepeatabilityReport,
  type ScoreObservation,
} from "./accuracy-bench";

export type CalibrationDimension = "quality-source" | "quality" | "source";

export type ScoreCalibrationRule = {
  key: string;
  dimension: CalibrationDimension;
  offset: number;
  samples: number;
  meanResidual: number;
};

export type RepeatabilityCalibrationOptions = {
  minSamplesPerIdentity: number;
  minSamplesPerBucket: number;
  minAbsoluteOffset: number;
  maxAbsoluteOffset: number;
};

export type RepeatabilityCalibration = {
  rules: ScoreCalibrationRule[];
  before: RepeatabilityReport;
  after: RepeatabilityReport;
  observations: ScoreObservation[];
};

const DEFAULT_CALIBRATION_OPTIONS: RepeatabilityCalibrationOptions = {
  minSamplesPerIdentity: 2,
  minSamplesPerBucket: 2,
  minAbsoluteOffset: 0.05,
  maxAbsoluteOffset: 2.5,
};

export function buildRepeatabilityCalibration(
  observations: readonly ScoreObservation[],
  options: Partial<RepeatabilityCalibrationOptions> = {}
): RepeatabilityCalibration {
  const opts = { ...DEFAULT_CALIBRATION_OPTIONS, ...options };
  const rules = buildRules(observations, opts);
  const calibrated = applyRepeatabilityCalibration(observations, rules);
  return {
    rules,
    before: buildRepeatabilityReport(observations),
    after: buildRepeatabilityReport(calibrated),
    observations: calibrated,
  };
}

export function applyRepeatabilityCalibration(
  observations: readonly ScoreObservation[],
  rules: readonly ScoreCalibrationRule[]
): ScoreObservation[] {
  return observations.map((observation) => {
    const rule = pickRule(observation, rules);
    if (!rule) return observation;
    return {
      ...observation,
      score: round1(clamp(observation.score + rule.offset, 0, 10)),
    };
  });
}

function buildRules(
  observations: readonly ScoreObservation[],
  options: RepeatabilityCalibrationOptions
): ScoreCalibrationRule[] {
  const residuals = new Map<string, { dimension: CalibrationDimension; values: number[] }>();
  const groups = groupByIdentity(observations);

  for (const [, group] of groups) {
    if (group.length < options.minSamplesPerIdentity) continue;
    const anchor = identityAnchor(group);
    for (const observation of group) {
      const residual = observation.score - anchor;
      for (const key of keysFor(observation)) {
        const bucket = residuals.get(key.key);
        if (bucket) bucket.values.push(residual);
        else residuals.set(key.key, { dimension: key.dimension, values: [residual] });
      }
    }
  }

  return [...residuals.entries()]
    .map(([key, bucket]) => {
      const meanResidual = mean(bucket.values);
      const offset = -clamp(meanResidual, -options.maxAbsoluteOffset, options.maxAbsoluteOffset);
      return {
        key,
        dimension: bucket.dimension,
        offset: round3(offset),
        samples: bucket.values.length,
        meanResidual: round3(meanResidual),
      };
    })
    .filter(
      (rule) =>
        rule.samples >= options.minSamplesPerBucket &&
        Math.abs(rule.offset) >= options.minAbsoluteOffset
    )
    .sort((a, b) => dimensionRank(a.dimension) - dimensionRank(b.dimension));
}

function pickRule(
  observation: ScoreObservation,
  rules: readonly ScoreCalibrationRule[]
): ScoreCalibrationRule | undefined {
  const byKey = new Map(rules.map((rule) => [rule.key, rule]));
  for (const key of keysFor(observation)) {
    const rule = byKey.get(key.key);
    if (rule) return rule;
  }
  return undefined;
}

function keysFor(observation: ScoreObservation): Array<{
  key: string;
  dimension: CalibrationDimension;
}> {
  const quality = observation.quality ?? "unknown";
  const source = observation.source ?? "unknown";
  return [
    { key: `quality:${quality}|source:${source}`, dimension: "quality-source" },
    { key: `quality:${quality}`, dimension: "quality" },
    { key: `source:${source}`, dimension: "source" },
  ];
}

function identityAnchor(group: readonly ScoreObservation[]): number {
  const reliable = group
    .filter(
      (observation) =>
        observation.quality !== "bad" &&
        (observation.confidence === undefined || observation.confidence >= 0.65)
    )
    .map((observation) => observation.score);
  const scores = reliable.length > 0 ? reliable : group.map((observation) => observation.score);
  return median(scores);
}

function dimensionRank(dimension: CalibrationDimension): number {
  if (dimension === "quality-source") return 0;
  if (dimension === "quality") return 1;
  return 2;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const right = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return right;
  return ((sorted[mid - 1] ?? right) + right) / 2;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}
