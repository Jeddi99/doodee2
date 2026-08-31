// Phase 182b — Type-only import. Runtime values are dynamic-imported
// inside `load()` (see face-mesh.ts for rationale).
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

const WASM_CDN = "/wasm";
// MediaPipe SelfieMulticlass — outputs per-pixel category at 256×256:
//   0 = background, 1 = hair, 2 = body-skin, 3 = face-skin,
//   4 = clothes, 5 = others (accessories)
//
// Phase 206 HOTFIX: Hosted locally to bypass all CDN/Adblock network blocks.
const MODEL_URL = "/models/selfie_multiclass_256x256.tflite";

type Detectable = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/**
 * Phase 57 — pixel-perfect hair mask from MediaPipe SelfieMulticlass.
 *
 * Replaces the heuristic rectangle-mask + lum-threshold filter
 * (Phases 18, 56) that bled hair recolor into dark backgrounds and
 * forehead skin. Now we get an actual semantic segmentation that
 * separates HAIR from BACKGROUND, FACE-SKIN, and CLOTHES.
 *
 * Lazy-loaded — model + WASM only fetch when hair color is actually
 * used (try-on hair tab or `/hair-color` page). Subsequent calls
 * reuse the cached session.
 */
// Phase 186 — Module-level singleton cache, same shape as
// `FaceMeshDetector`. See that file for the full rationale: switching
// between /try-on and /hair-color used to dispose + re-init this
// segmenter on every page change, causing a visible 1-3 s lag.
let sharedSegmenter: HairSegmenter | null = null;
let inflightLoad: Promise<HairSegmenter> | null = null;

export class HairSegmenter {
  private constructor(private readonly inner: ImageSegmenter) {}

  static async load(): Promise<HairSegmenter> {
    if (sharedSegmenter) return sharedSegmenter;
    if (inflightLoad) return inflightLoad;
    inflightLoad = (async () => {
      // Phase 182b — Dynamic import of `@mediapipe/tasks-vision` so the
      // bundle ships as its own chunk and stays out of the try-on /
      // hair-color route bundles until segmentation actually fires.
      const { ImageSegmenter: IS, FilesetResolver: FR } = await import(
        "@mediapipe/tasks-vision"
      );
      const fileset = await FR.forVisionTasks(WASM_CDN);
      const segmenter = await IS.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      sharedSegmenter = new HairSegmenter(segmenter);
      return sharedSegmenter;
    })();
    try {
      return await inflightLoad;
    } finally {
      inflightLoad = null;
    }
  }

  /**
   * Run segmentation and return a HAIR-ONLY binary mask.
   *
   * The MediaPipe output is a 256×256 `MPMask` of category indices.
   * We resample / project it onto `targetW × targetH` using nearest-
   * neighbor (no smoothing — we want crisp hair-edge boundaries that
   * won't bleed via the canvas-resize antialiasing).
   *
   * @returns A `Uint8Array` of length `targetW × targetH` where each
   *          byte is 1 (hair pixel) or 0 (not hair). null on failure.
   */
  segmentHairMask(
    source: Detectable,
    targetW: number,
    targetH: number
  ): Uint8Array | null {
    const result = this.inner.segment(source);
    const category = result.categoryMask;
    if (!category) {
      result.close();
      return null;
    }
    // MPMask gives us a 256×256 uint8 array of category indices.
    const raw = category.getAsUint8Array();
    const srcW = category.width;
    const srcH = category.height;

    // Nearest-neighbor upsample to targetW × targetH.
    const out = new Uint8Array(targetW * targetH);
    for (let y = 0; y < targetH; y += 1) {
      const sy = Math.floor((y * srcH) / targetH);
      for (let x = 0; x < targetW; x += 1) {
        const sx = Math.floor((x * srcW) / targetW);
        const c = raw[sy * srcW + sx] ?? 0;
        // Category 1 = hair
        out[y * targetW + x] = c === 1 ? 1 : 0;
      }
    }

    result.close();
    return out;
  }

  // Phase 186 — No-op dispose for the shared instance. See face-mesh.ts.
  dispose(): void {
    /* no-op — see Phase 186 note */
  }
}

// Phase 192g — Idle prewarm. Mirrors the face-mesh strategy: schedule
// the heavy `await import('@mediapipe/tasks-vision')` +
// `ImageSegmenter.createFromOptions(...)` inside `requestIdleCallback`
// (5000ms timeout) with a `setTimeout` fallback for Safari. Reuses the
// same `inflightLoad` + `sharedSegmenter` singletons that `load()` uses,
// so a real hair-color invocation that arrives before the idle callback
// fires simply joins the inflight promise — no double-init, no race.
//
// Guards (same as face-mesh):
//   - skip on `effectiveType === '2g'` / `'slow-2g'` (low bandwidth)
//   - skip on `navigator.connection.saveData` (data-saver mode)
//   - skip on coarse-pointer mobile when `deviceMemory < 4`
//   - skip in non-browser environments (SSR safety)
export function idlePrewarm(): void {
  if (typeof window === "undefined") return;
  if (sharedSegmenter || inflightLoad) return;

  type ConnLike = {
    saveData?: boolean;
    effectiveType?: string;
  };
  const conn = (navigator as Navigator & { connection?: ConnLike }).connection;
  const slowNet =
    conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g";
  if (slowNet) return;
  if (conn?.saveData === true) return;

  const deviceMemory = (
    navigator as Navigator & { deviceMemory?: number }
  ).deviceMemory;
  const isCoarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  if (
    isCoarsePointer &&
    typeof deviceMemory === "number" &&
    deviceMemory < 4
  ) {
    return;
  }

  type RIC = {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const ric = window as unknown as RIC;
  const fire = () => {
    // `HairSegmenter.load()` is itself idempotent — re-checks
    // `sharedSegmenter` / `inflightLoad` before kicking off the import.
    // Safe to call here without re-checking ourselves.
    void HairSegmenter.load().catch(() => {
      // Swallow — real hair-color path will retry + surface errors.
    });
  };
  if (typeof ric.requestIdleCallback === "function") {
    ric.requestIdleCallback(fire, { timeout: 5000 });
  } else {
    window.setTimeout(fire, 2000);
  }
}
