export type PreparedDatasetRow = {
  dataset: string;
  image: string;
  score: number;
  scale?: string;
  preferredSplit?: "train" | "validation";
};

export type PreparedScoringManifest = {
  schemaVersion: 1;
  splits: {
    train: PreparedDatasetRow[];
    validation: PreparedDatasetRow[];
  };
  repeatability?: {
    totalObservations: number;
    cameraShare: number;
    cameraShareTarget: number;
    cameraSharePass: boolean;
  } | null;
  guards: {
    noRawUserImages: boolean;
    noAccountIdentifiers: boolean;
    outputMustStayPrivate: boolean;
  };
};

export function parsePreparedScoringManifest(input: unknown): PreparedScoringManifest {
  if (!isRecord(input)) throw new Error("scoring-manifest-not-object");
  if (input.schemaVersion !== 1) throw new Error("scoring-manifest-schema-version");
  const splits = readSplits(input.splits);
  const guards = readGuards(input.guards);
  const repeatability = readRepeatability(input.repeatability);
  return {
    schemaVersion: 1,
    splits,
    ...(repeatability !== undefined ? { repeatability } : {}),
    guards,
  };
}

function readSplits(input: unknown): PreparedScoringManifest["splits"] {
  if (!isRecord(input)) throw new Error("scoring-manifest-splits-missing");
  const train = readRows(input.train, "train");
  const validation = readRows(input.validation, "validation");
  if (train.length === 0) throw new Error("scoring-manifest-train-empty");
  if (validation.length === 0) throw new Error("scoring-manifest-validation-empty");
  return { train, validation };
}

function readRows(input: unknown, split: string): PreparedDatasetRow[] {
  if (!Array.isArray(input)) throw new Error(`scoring-manifest-${split}-not-array`);
  return input.map((row, index) => readRow(row, split, index));
}

function readRow(input: unknown, split: string, index: number): PreparedDatasetRow {
  if (!isRecord(input)) throw new Error(`scoring-manifest-${split}-${index}-not-object`);
  const dataset = readString(input.dataset, `scoring-manifest-${split}-${index}-dataset`);
  const image = readRelativeImage(input.image, `scoring-manifest-${split}-${index}-image`);
  const score = readNumber(input.score, `scoring-manifest-${split}-${index}-score`);
  const scale = readOptionalString(input.scale);
  const preferredSplit = readPreferredSplit(input.preferredSplit, split, index);
  return {
    dataset,
    image,
    score,
    ...(scale ? { scale } : {}),
    ...(preferredSplit ? { preferredSplit } : {}),
  };
}

function readGuards(input: unknown): PreparedScoringManifest["guards"] {
  if (!isRecord(input)) throw new Error("scoring-manifest-guards-missing");
  const guards = {
    noRawUserImages: input.noRawUserImages === true,
    noAccountIdentifiers: input.noAccountIdentifiers === true,
    outputMustStayPrivate: input.outputMustStayPrivate === true,
  };
  if (!guards.noRawUserImages || !guards.noAccountIdentifiers || !guards.outputMustStayPrivate) {
    throw new Error("scoring-manifest-guards-disabled");
  }
  return guards;
}

function readRepeatability(input: unknown): PreparedScoringManifest["repeatability"] | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (!isRecord(input)) throw new Error("scoring-manifest-repeatability-invalid");
  const totalObservations = readNumber(input.totalObservations, "repeatability-totalObservations");
  const cameraShare = readUnit(input.cameraShare, "repeatability-cameraShare");
  const cameraShareTarget = readUnit(input.cameraShareTarget, "repeatability-cameraShareTarget");
  if (input.cameraSharePass !== true) throw new Error("scoring-manifest-camera-share-failed");
  if (cameraShare < cameraShareTarget) throw new Error("scoring-manifest-camera-share-below-target");
  return {
    totalObservations,
    cameraShare,
    cameraShareTarget,
    cameraSharePass: true,
  };
}

function readString(value: unknown, errorCode: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(errorCode);
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("scoring-manifest-optional-string-invalid");
  return value.trim();
}

function readNumber(value: unknown, errorCode: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(errorCode);
  return value;
}

function readUnit(value: unknown, errorCode: string): number {
  const number = readNumber(value, errorCode);
  if (number < 0 || number > 1) throw new Error(errorCode);
  return number;
}

function readRelativeImage(value: unknown, errorCode: string): string {
  const image = readString(value, errorCode).replaceAll("\\", "/");
  if (
    image.startsWith("/") ||
    image.startsWith("../") ||
    image.includes("/../") ||
    /^[A-Za-z]:\//.test(image) ||
    image.startsWith("http://") ||
    image.startsWith("https://") ||
    image.startsWith("data:")
  ) {
    throw new Error(`${errorCode}-unsafe`);
  }
  return image;
}

function readPreferredSplit(
  value: unknown,
  split: string,
  index: number
): PreparedDatasetRow["preferredSplit"] {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "train" || value === "validation") return value;
  throw new Error(`scoring-manifest-${split}-${index}-preferredSplit`);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
