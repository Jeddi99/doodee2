import { alignAndCrop } from "./align";
import { pixelsToTensor } from "./crop";
import { loadManifest, type ModelManifest } from "./manifest";
import { mapModelOutputToDoodee } from "./score";
import type { Landmarks } from "@/types";

const MODEL_URL = "/models/attractiveness.onnx";

// Cached for the page lifetime — first scan pays the WASM/WebGPU init
// cost (~200ms), every later scan reuses.
let cachedSession: unknown = null;
let availabilityCheck: Promise<boolean> | null = null;
let cachedAvailability: boolean | null = null;
let scratchCanvas: HTMLCanvasElement | null = null;
// Phase 192g — Inflight de-dupe for `getSession()`. Previously the
// function was naive about concurrent callers: if scan A called
// `getSession()` and scan B fired before A's WASM/WebGPU init
// resolved, B would also enter the `try` block and trigger a SECOND
// `InferenceSession.create()`. With idle-prewarm now in the mix, a
// real scan landing during the prewarm window would have caused
// exactly that race. The inflight singleton fixes it: every concurrent
// caller awaits the same promise, only the first call performs the
// actual import + session create.
let inflightSession: Promise<unknown | null> | null = null;

/**
 * Ensemble configuration (Phase 29 / "30s ok ขอความแม่น"):
 *
 * - **paddings** = how much context around the face to include
 * - **flips** = horizontal-flip TTA — a face's attractiveness score
 *   should be invariant to flip; averaging stabilizes the model's
 *   left-right biases
 *
 * Total passes per scan = `paddings.length × flips.length`. Each pass
 * is one full forward through the network. With WASM EP a pass is
 * ~200-500ms; WebGPU is ~30-80ms.
 */
// Phase 99 fix: SCUT-FBP5500 training images are 350px portrait crops
// where the FACE fills ~55-70% of the frame, including hair + neckline.
// Old paddings [0.08, 0.15, 0.3] produced tight face-only crops (~85-95%
// face) far from the training distribution → the model output drifted
// toward "no face" baseline (~2.5/5). The new paddings [0.3, 0.5, 0.7]
// match the SCUT portrait crop ratio, restoring confident scores.
const ENSEMBLE_PADDINGS = [0.3, 0.5, 0.7];
const ENSEMBLE_FLIPS = [false, true];

/**
 * HEAD-probe whether the model file exists on the server. Cached per
 * page load. Returns false on 404 / network error.
 */
export async function isModelAvailable(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;
  if (availabilityCheck) return availabilityCheck;
  if (typeof window === "undefined") return false;
  availabilityCheck = (async () => {
    try {
      const res = await fetch(MODEL_URL, { method: "HEAD" });
      const ok = res.ok;
      cachedAvailability = ok;
      return ok;
    } catch {
      cachedAvailability = false;
      return false;
    } finally {
      availabilityCheck = null;
    }
  })();
  return availabilityCheck;
}

/**
 * Lazy-load + cache the ONNX session. Tries WebGPU first (5-10× faster
 * than WASM for these models), falls back to WASM if WebGPU isn't
 * available in the browser.
 *
 * Phase 192g — Switched to inflight de-dupe (`inflightSession`) so the
 * idle prewarm + a real scan landing in the same window share one
 * `InferenceSession.create()` call. Without this, the second caller
 * would import onnxruntime-web a second time and try to allocate a
 * second WASM heap.
 */
async function getSession(): Promise<unknown | null> {
  if (cachedSession) return cachedSession;
  if (inflightSession) return inflightSession;
  inflightSession = (async () => {
    const available = await isModelAvailable();
    if (!available) return null;
    try {
      const ort = await import("onnxruntime-web");
      // Phase 99: point onnxruntime-web at its WASM binaries on jsdelivr.
      // Default behaviour expects the .wasm files to be siblings of the JS
      // bundle, which Next.js's webpack does NOT emit. Without this, the
      // browser hits `/_next/static/chunks/ort-wasm-simd.wasm 404` and the
      // session never initializes (silent failure, learned score absent).
      // Pinning to the exact installed package version keeps this stable
      // across upgrades.
      if (ort.env?.wasm) {
        ort.env.wasm.wasmPaths =
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";
      }
      const session = await ort.InferenceSession.create(MODEL_URL, {
        // WebGPU first — onnxruntime-web auto-falls-back to WASM if the
        // browser doesn't have a WebGPU adapter.
        executionProviders: ["webgpu", "wasm"],
        graphOptimizationLevel: "all",
      });
      cachedSession = session;
      return session;
    } catch (e) {
      if (typeof console !== "undefined") {
        console.warn("[learned] onnxruntime-web failed to init", e);
      }
      return null;
    }
  })();
  try {
    return await inflightSession;
  } finally {
    inflightSession = null;
  }
}

// Phase 192g — Idle prewarm. The ONNX session init pays ~200ms of
// onnxruntime-web import + WASM init + graph optimization on first
// scan. We hide that cost in `requestIdleCallback` (with a
// `setTimeout` fallback for Safari) so the user's first scan click
// is responsive even on cold load.
//
// Reuses `getSession()` directly — that function now de-dupes inflight
// calls via `inflightSession`, so the prewarm + a concurrent real scan
// resolve to the same session without double WASM heap allocation.
//
// Guards:
//   - skip when model HEAD probe will fail (avoids polluting cache
//     with a "not available" lookup before the user is even ready)
//   - skip on `effectiveType === '2g'` / `'slow-2g'` (data savings)
//   - skip on `saveData` user preference
//   - skip on coarse-pointer + `deviceMemory < 4` (mobile constrained)
export function idlePrewarm(): void {
  if (typeof window === "undefined") return;
  if (cachedSession || inflightSession) return;

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
    void getSession().catch(() => {
      // Swallow — actual scan path will retry and surface the failure.
    });
  };
  if (typeof ric.requestIdleCallback === "function") {
    ric.requestIdleCallback(fire, { timeout: 5000 });
  } else {
    window.setTimeout(fire, 2000);
  }
}

interface OrtInferenceSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(
    feeds: Record<string, unknown>
  ): Promise<Record<string, { data: ArrayLike<number>; dispose?: () => void }>>;
}

/**
 * One forward pass: align + crop + normalize + infer. Returns the raw
 * model output (whatever the manifest's `outputRange` covers) OR null
 * on any failure. Manifest-driven so the same code handles 224 / 384 /
 * 512 inputs + imagenet / halved / none normalize.
 */
async function runSinglePass(
  session: OrtInferenceSession,
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks,
  manifest: ModelManifest,
  padding: number,
  flip: boolean
): Promise<number | null> {
  const size = manifest.inputSize;
  if (!scratchCanvas || scratchCanvas.width !== size) {
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = size;
    scratchCanvas.height = size;
  }
  const pixels = alignAndCrop(image, landmarks, scratchCanvas, {
    padding,
    flip,
    align: true,
    size,
  });
  if (!pixels) return null;
  const tensor = pixelsToTensor(pixels, {
    size,
    normalize: manifest.normalize,
  });
  let out: Record<string, { data: ArrayLike<number>; dispose?: () => void }> | undefined;
  let ortTensor: any;
  try {
    const ort = await import("onnxruntime-web");
    ortTensor = new ort.Tensor("float32", tensor, [1, 3, size, size]);
    const inputName = session.inputNames[0];
    if (!inputName) return null;
    out = await session.run({ [inputName]: ortTensor });
    const outName = session.outputNames[manifest.outputIndex] ?? session.outputNames[0];
    if (!outName) return null;
    const raw = out[outName]?.data?.[0];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    return raw;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[learned] inference pass failed", e);
    }
    return null;
  } finally {
    if (ortTensor && typeof ortTensor.dispose === "function") {
      ortTensor.dispose();
    }
    if (out) {
      for (const key in out) {
        if (typeof out[key]?.dispose === "function") out[key].dispose!();
      }
    }
  }
}

/**
 * Aggregate an array of raw model outputs into a single doodee 0-10
 * score.
 *
 * - 0 samples → null
 * - 1 sample  → just remap
 * - ≥ 5 samples → trim the highest + lowest (robust mean), then average
 * - 2-4 samples → plain arithmetic mean
 *
 * Trimming protects against a single bad augmentation (e.g., a tight
 * crop that clips the chin) dragging the ensemble.
 *
 * Pure function — exposed for testability. `outputRange` defaults to
 * `[1, 5]` for backward compat (SCUT-FBP5500 convention).
 */
export function aggregateEnsemble(
  scores: number[],
  outputRange: readonly [number, number] = [1, 5]
): number | null {
  if (scores.length === 0) return null;
  if (scores.length === 1) return mapModelOutputToDoodee(scores[0]!, outputRange);
  let pool = scores;
  if (scores.length >= 5) {
    const sorted = [...scores].sort((a, b) => a - b);
    pool = sorted.slice(1, -1);
  }
  const mean = pool.reduce((s, v) => s + v, 0) / pool.length;
  return mapModelOutputToDoodee(mean, outputRange);
}

/**
 * Run the multi-pass ensemble: `paddings.length × flips.length` forward
 * passes through the model. Failed passes (alignment error, inference
 * exception) are skipped; the aggregator still returns a result as long
 * as at least one pass succeeded.
 *
 * Returns 0-10 doodee score OR null.
 *
 * Approximate wallclock with the default 3×2 = 6 passes:
 * - WASM EP: ~1.5-3 sec
 * - WebGPU EP: ~0.3-0.8 sec
 *
 * Both well within the 30s user-tolerance budget.
 */
export async function predictAttractiveness(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmarks
): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const session = (await getSession()) as OrtInferenceSession | null;
  if (!session) return null;
  const manifest = await loadManifest();

  const passes: number[] = [];
  for (const padding of ENSEMBLE_PADDINGS) {
    for (const flip of ENSEMBLE_FLIPS) {
      const score = await runSinglePass(
        session,
        image,
        landmarks,
        manifest,
        padding,
        flip
      );
      if (score !== null) passes.push(score);
    }
  }
  return aggregateEnsemble(passes, manifest.outputRange);
}

/**
 * Reset cached state — primarily for tests + dev reload. Does NOT
 * release the ORT session (which holds WASM heap); browsers GC that
 * when the tab closes.
 */
export function resetLearnedCache(): void {
  cachedSession = null;
  inflightSession = null;
  availabilityCheck = null;
  cachedAvailability = null;
  scratchCanvas = null;
  // Importing here to avoid a cycle at module load.
  void import("./manifest").then((m) => m.resetManifestCache());
}
