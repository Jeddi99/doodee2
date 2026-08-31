import type { ObservationQuality, ScoreObservation } from "./accuracy-bench";

const qualities = new Set<ObservationQuality>(["ok", "warn", "bad"]);
const sources = new Set<NonNullable<ScoreObservation["source"]>>([
  "camera",
  "album",
  "import",
]);

export function parseScoreObservations(input: unknown): ScoreObservation[] {
  const rows = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.observations)
      ? input.observations
      : null;
  if (!rows) throw new Error("repeatability-observations-missing");
  return rows.map((row, index) => parseObservation(row, index));
}

function parseObservation(input: unknown, index: number): ScoreObservation {
  if (!isRecord(input)) throw new Error(`observation-${index}-not-object`);
  const identityId = readRequiredString(input, "identityId", index);
  const score = readRequiredNumber(input, "score", index);
  const quality = readOptionalEnum(input, "quality", qualities, index);
  const confidence = readOptionalNumber(input, "confidence", index);
  const source = readOptionalEnum(input, "source", sources, index);
  const modelVersion = readOptionalString(input, "modelVersion", index);
  if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
    throw new Error(`observation-${index}-confidence-out-of-range`);
  }
  return {
    identityId,
    score,
    ...(quality ? { quality } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(source ? { source } : {}),
    ...(modelVersion ? { modelVersion } : {}),
  };
}

function readRequiredString(
  row: Record<string, unknown>,
  key: string,
  index: number
): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`observation-${index}-${key}-invalid`);
  }
  return value.trim();
}

function readOptionalString(
  row: Record<string, unknown>,
  key: string,
  index: number
): string | undefined {
  const value = row[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`observation-${index}-${key}-invalid`);
  return value.trim();
}

function readRequiredNumber(
  row: Record<string, unknown>,
  key: string,
  index: number
): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`observation-${index}-${key}-invalid`);
  }
  return value;
}

function readOptionalNumber(
  row: Record<string, unknown>,
  key: string,
  index: number
): number | undefined {
  const value = row[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`observation-${index}-${key}-invalid`);
  }
  return value;
}

function readOptionalEnum<T extends string>(
  row: Record<string, unknown>,
  key: string,
  allowed: ReadonlySet<T>,
  index: number
): T | undefined {
  const value = row[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`observation-${index}-${key}-invalid`);
  }
  return value as T;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
