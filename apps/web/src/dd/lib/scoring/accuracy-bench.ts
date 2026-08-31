export type ObservationQuality = "ok" | "warn" | "bad";

export type ScoreObservation = {
  identityId: string;
  score: number;
  quality?: ObservationQuality;
  confidence?: number;
  source?: "camera" | "album" | "import";
  modelVersion?: string;
};

export type RepeatabilityThresholds = {
  minSamplesPerIdentity: number;
  maxSameIdentityRange: number;
  maxSameIdentityStdDev: number;
  maxBadPhotoAdvantage: number;
  minReliableConfidence: number;
};

export type RepeatabilityIssueCode =
  | "same_identity_range"
  | "same_identity_stddev"
  | "bad_photo_advantage";

export type RepeatabilityIssue = {
  code: RepeatabilityIssueCode;
  identityId: string;
  severity: "high" | "medium";
  detail: string;
  values: Record<string, number>;
};

export type IdentityRepeatability = {
  identityId: string;
  samples: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  range: number;
  stdDev: number;
};

export type RepeatabilityReport = {
  pass: boolean;
  totalObservations: number;
  totalIdentities: number;
  testedIdentities: number;
  unstableIdentities: number;
  worstRange: number;
  worstStdDev: number;
  issues: RepeatabilityIssue[];
  identities: IdentityRepeatability[];
};

export const DEFAULT_REPEATABILITY_THRESHOLDS: RepeatabilityThresholds = {
  minSamplesPerIdentity: 2,
  maxSameIdentityRange: 0.9,
  maxSameIdentityStdDev: 0.35,
  maxBadPhotoAdvantage: 0.5,
  minReliableConfidence: 0.65,
};

export function buildRepeatabilityReport(
  observations: readonly ScoreObservation[],
  thresholds: RepeatabilityThresholds = DEFAULT_REPEATABILITY_THRESHOLDS
): RepeatabilityReport {
  const groups = groupByIdentity(observations.filter(isValidObservation));
  const identities: IdentityRepeatability[] = [];
  const issues: RepeatabilityIssue[] = [];

  for (const [identityId, group] of groups) {
    if (group.length < thresholds.minSamplesPerIdentity) continue;
    const scores = group.map((item) => item.score);
    const stats = identityStats(identityId, scores);
    identities.push(stats);

    if (stats.range > thresholds.maxSameIdentityRange) {
      issues.push({
        code: "same_identity_range",
        identityId,
        severity: "high",
        detail: "Same identity score range is too wide.",
        values: { range: round3(stats.range), maxAllowed: thresholds.maxSameIdentityRange },
      });
    }

    if (stats.stdDev > thresholds.maxSameIdentityStdDev) {
      issues.push({
        code: "same_identity_stddev",
        identityId,
        severity: "medium",
        detail: "Same identity score variance is too high.",
        values: { stdDev: round3(stats.stdDev), maxAllowed: thresholds.maxSameIdentityStdDev },
      });
    }

    const badAdvantage = badPhotoAdvantage(group, thresholds.minReliableConfidence);
    if (badAdvantage > thresholds.maxBadPhotoAdvantage) {
      issues.push({
        code: "bad_photo_advantage",
        identityId,
        severity: "high",
        detail: "A bad-quality photo outranks reliable photos for the same identity.",
        values: {
          advantage: round3(badAdvantage),
          maxAllowed: thresholds.maxBadPhotoAdvantage,
        },
      });
    }
  }

  const unstableIdentities = new Set(issues.map((issue) => issue.identityId)).size;
  return {
    pass: issues.every((issue) => issue.severity !== "high"),
    totalObservations: observations.length,
    totalIdentities: groups.size,
    testedIdentities: identities.length,
    unstableIdentities,
    worstRange: round3(maxOf(identities.map((item) => item.range))),
    worstStdDev: round3(maxOf(identities.map((item) => item.stdDev))),
    issues,
    identities: identities.sort((a, b) => b.range - a.range),
  };
}

export function groupByIdentity(
  observations: readonly ScoreObservation[]
): Map<string, ScoreObservation[]> {
  const groups = new Map<string, ScoreObservation[]>();
  for (const observation of observations) {
    const bucket = groups.get(observation.identityId);
    if (bucket) bucket.push(observation);
    else groups.set(observation.identityId, [observation]);
  }
  return groups;
}

function identityStats(identityId: string, scores: readonly number[]): IdentityRepeatability {
  const sorted = [...scores].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return {
    identityId,
    samples: scores.length,
    mean: round3(mean(scores)),
    median: round3(median(sorted)),
    min: round3(min),
    max: round3(max),
    range: round3(max - min),
    stdDev: round3(stdDev(scores)),
  };
}

function badPhotoAdvantage(
  observations: readonly ScoreObservation[],
  minReliableConfidence: number
): number {
  const badScores = observations
    .filter((item) => item.quality === "bad")
    .map((item) => item.score);
  const reliableScores = observations
    .filter(
      (item) =>
        item.quality !== "bad" &&
        (item.confidence === undefined || item.confidence >= minReliableConfidence)
    )
    .map((item) => item.score);
  if (badScores.length === 0 || reliableScores.length === 0) return 0;
  return maxOf(badScores) - median([...reliableScores].sort((a, b) => a - b));
}

function isValidObservation(item: ScoreObservation): boolean {
  return item.identityId.trim().length > 0 && Number.isFinite(item.score);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(sortedValues: readonly number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  const right = sortedValues[mid] ?? 0;
  if (sortedValues.length % 2 === 1) return right;
  return ((sortedValues[mid - 1] ?? right) + right) / 2;
}

function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function maxOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
