/**
 * Model manifest — optional `public/models/manifest.json` that
 * describes the dropped ONNX checkpoint. Lets you swap a 224×224 SCUT
 * model for a 384×384 or 512×512 model (or one with different
 * normalization / output range) without code changes.
 *
 * If the manifest file is absent, defaults kick in (224 ImageNet [1,5]
 * — matches the SCUT-FBP5500 convention from ADR-011).
 */
export type NormalizeMode = "imagenet" | "halved" | "none";

export interface ModelManifest {
  /** Input H × W (square). Default 224. */
  inputSize: number;
  /** Pixel normalization. Default `imagenet`. */
  normalize: NormalizeMode;
  /** Raw model output range. Default [1, 5] (SCUT-FBP5500). */
  outputRange: [number, number];
  /** Output index when the model has multiple heads. Default 0. */
  outputIndex: number;
}

export const DEFAULT_MANIFEST: ModelManifest = {
  inputSize: 224,
  normalize: "imagenet",
  outputRange: [1, 5],
  outputIndex: 0,
};

const MANIFEST_URL = "/models/manifest.json";

let cachedManifest: ModelManifest | null = null;
let inflight: Promise<ModelManifest> | null = null;

/**
 * Parse + validate a raw manifest object. Unknown fields are ignored;
 * out-of-range values fall back to the default for that field.
 *
 * Exposed for testability — callers should use `loadManifest()`.
 */
export function parseManifest(raw: unknown): ModelManifest {
  if (!raw || typeof raw !== "object") return DEFAULT_MANIFEST;
  const obj = raw as Record<string, unknown>;
  return {
    inputSize: validInputSize(obj.inputSize),
    normalize: validNormalize(obj.normalize),
    outputRange: validOutputRange(obj.outputRange),
    outputIndex: validOutputIndex(obj.outputIndex),
  };
}

function validInputSize(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_MANIFEST.inputSize;
  // Plausible square sizes; integer; > 32 (sanity) and ≤ 1024 (memory ceiling).
  const n = Math.round(v);
  if (n < 32 || n > 1024) return DEFAULT_MANIFEST.inputSize;
  return n;
}

function validNormalize(v: unknown): NormalizeMode {
  if (v === "imagenet" || v === "halved" || v === "none") return v;
  return DEFAULT_MANIFEST.normalize;
}

function validOutputRange(v: unknown): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) return DEFAULT_MANIFEST.outputRange;
  const lo = v[0];
  const hi = v[1];
  if (typeof lo !== "number" || typeof hi !== "number") return DEFAULT_MANIFEST.outputRange;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return DEFAULT_MANIFEST.outputRange;
  if (lo >= hi) return DEFAULT_MANIFEST.outputRange;
  return [lo, hi];
}

function validOutputIndex(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_MANIFEST.outputIndex;
  const n = Math.round(v);
  if (n < 0 || n > 16) return DEFAULT_MANIFEST.outputIndex;
  return n;
}

/**
 * Fetch `/models/manifest.json` once per page and return its parsed
 * form. Falls back to `DEFAULT_MANIFEST` when the file is missing or
 * malformed.
 */
export async function loadManifest(): Promise<ModelManifest> {
  if (cachedManifest) return cachedManifest;
  if (inflight) return inflight;
  if (typeof window === "undefined") return DEFAULT_MANIFEST;
  inflight = (async () => {
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) {
        cachedManifest = DEFAULT_MANIFEST;
        return DEFAULT_MANIFEST;
      }
      const json = await res.json();
      const parsed = parseManifest(json);
      cachedManifest = parsed;
      return parsed;
    } catch {
      cachedManifest = DEFAULT_MANIFEST;
      return DEFAULT_MANIFEST;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Reset cached manifest — for tests + dev reload. */
export function resetManifestCache(): void {
  cachedManifest = null;
  inflight = null;
}
