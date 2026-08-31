// Phase 182b — Type-only import keeps the package out of every chunk
// that touches FaceMeshDetector's static type surface. The actual
// runtime values (FaceLandmarker, FilesetResolver) are dynamic-imported
// inside `load()` so the ~134 KB tasks-vision bundle splits into its
// own chunk and only downloads when a scan/try-on actually fires.
import type {
  FaceLandmarker,
  Category,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import type { Blendshapes, Landmarks } from "@/types";

const WASM_CDN = "/wasm";

// Phase 636 — confidence gate for doodee's own accuracy standards.
// SDK defaults sit around 0.5; 0.7 rejects marginal detections (partial
// occlusion, off-axis faces, poor lighting) up front instead of letting
// them through as low-quality landmarks that the photo-quality checks
// have to catch after the fact. Deliberately not 0.9 — that would start
// rejecting genuinely fine photos; this is a starting point to tune
// against real usage, not a final value.
const CONFIDENCE_THRESHOLD = 0.7;

// Phase 206 HOTFIX: Hosted locally to bypass all CDN/Adblock network blocks.
const MODEL_URL = "/models/face_landmarker.task";
const FALLBACK_WASM_CDN = "https://unpkg.com/@mediapipe/tasks-vision@0.10.35/wasm";
const MEDIAPIPE_CONSOLE_NOISE = [
  "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.",
  "OpenGL error checking is disabled",
  "Sets FaceBlendshapesGraph acceleration to xnnpack by default.",
  "GL Driver Message",
] as const;

type Detectable = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface DetectionResult {
  landmarks: Landmarks;
  /**
   * Phase 97 — 52 expression coefficients keyed by name. `null` only
   * when the model didn't return them on this frame (rare; defensive).
   */
  blendshapes: Blendshapes | null;
}

// Phase 186 — Module-level singleton cache. Each face-aware page
// (/scan, /try-on, /hair-color, /eye-color, /lipstick) was allocating
// its own FaceMeshDetector and disposing it on unmount. Switching
// between /scan ↔ /try-on therefore went:
//   /scan unmount → dispose() → WASM context closed
//   /try-on mount → fresh load() → re-fetch WASM + model + GPU init
// That 1-3 s of WASM/GPU init repeated on every page switch was the
// lag the user reported. With this cache the first page that loads
// the model keeps it alive in memory for the rest of the session;
// every subsequent page hits a near-zero cost reuse.
let sharedDetector: FaceMeshDetector | null = null;
let inflightLoad: Promise<FaceMeshDetector> | null = null;

function consoleArgText(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof Event !== "undefined" && arg instanceof Event) {
    return `Event:${arg.type}`;
  }
  try {
    return String(arg);
  } catch {
    return "";
  }
}

function isMediapipeConsoleNoise(args: readonly unknown[]): boolean {
  const text = args.map(consoleArgText).join(" ");
  if (text === "Event:error") return true;
  return MEDIAPIPE_CONSOLE_NOISE.some((needle) => text.includes(needle));
}

function runWithMediapipeConsoleFilter<T>(task: () => T): T {
  if (typeof window === "undefined") return task();
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => {
    if (isMediapipeConsoleNoise(args)) return;
    originalError(...args);
  };
  console.warn = (...args) => {
    if (isMediapipeConsoleNoise(args)) return;
    originalWarn(...args);
  };
  try {
    return task();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

async function withMediapipeConsoleFilter<T>(task: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined") return task();
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => {
    if (isMediapipeConsoleNoise(args)) return;
    originalError(...args);
  };
  console.warn = (...args) => {
    if (isMediapipeConsoleNoise(args)) return;
    originalWarn(...args);
  };
  try {
    return await task();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

export class FaceMeshDetector {
  private constructor(private readonly inner: FaceLandmarker) {}

  static async load(): Promise<FaceMeshDetector> {
    if (sharedDetector) return sharedDetector;
    if (inflightLoad) return inflightLoad;
    // Phase 182b — Dynamic import. Splits `@mediapipe/tasks-vision`
    // (~134 KB minified JS) into a separate webpack chunk that only
    // downloads when the detector is actually loaded — not when the
    // try-on / scan page renders.
    inflightLoad = withMediapipeConsoleFilter(async () => {
      const { FaceLandmarker: FL, FilesetResolver: FR } = await import(
        "@mediapipe/tasks-vision"
      );
      const fileset = await FR.forVisionTasks(WASM_CDN);
      let landmarker: FaceLandmarker;
      try {
        landmarker = await FL.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          // Phase 97 — enable blendshape output. The model already runs the
          // blendshape head; we were just discarding its output. Cost is
          // marginal: ~52 floats per detection.
          outputFaceBlendshapes: true,
          runningMode: "IMAGE",
          numFaces: 1,
          minFaceDetectionConfidence: CONFIDENCE_THRESHOLD,
          minFacePresenceConfidence: CONFIDENCE_THRESHOLD,
          minTrackingConfidence: CONFIDENCE_THRESHOLD,
        });
      } catch {
        try {
          landmarker = await FL.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            outputFaceBlendshapes: true,
            runningMode: "IMAGE",
            numFaces: 1,
            minFaceDetectionConfidence: CONFIDENCE_THRESHOLD,
            minFacePresenceConfidence: CONFIDENCE_THRESHOLD,
            minTrackingConfidence: CONFIDENCE_THRESHOLD,
          });
        } catch {
          // Phase 206 — if JSdelivr is blocked/down, the injected script throws an Event.
          // Try unpkg as a last resort before giving up.
          const fallbackFileset = await FR.forVisionTasks(FALLBACK_WASM_CDN);
          landmarker = await FL.createFromOptions(fallbackFileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            outputFaceBlendshapes: true,
            runningMode: "IMAGE",
            numFaces: 1,
            minFaceDetectionConfidence: CONFIDENCE_THRESHOLD,
            minFacePresenceConfidence: CONFIDENCE_THRESHOLD,
            minTrackingConfidence: CONFIDENCE_THRESHOLD,
          });
        }
      }
      sharedDetector = new FaceMeshDetector(landmarker);
      return sharedDetector;
    });
    try {
      return await inflightLoad;
    } catch (err) {
      let ext = "";
      if (err && typeof err === "object" && "type" in err) ext = ` (type:${(err as Event).type})`;
      throw new Error(
        `wasm-load-failed: ${err instanceof Error ? err.message : String(err)}${ext}`
      );
    } finally {
      inflightLoad = null;
    }
  }

  /**
   * Phase 97 — returns landmarks + blendshapes. For backward-compat,
   * the legacy `Landmarks` shape is still in the result so existing
   * callers that only consume `landmarks` keep working.
   */
  detect(source: Detectable): DetectionResult | null {
    let result: ReturnType<FaceLandmarker["detect"]>;
    try {
      result = runWithMediapipeConsoleFilter(() => this.inner.detect(source));
    } catch (err) {
      // Phase 206 — MediaPipe WASM/GPU inference can throw synchronous
      // exceptions (GPU OOM, WASM runtime crash, unsupported input).
      // Without this catch the exception propagates all the way to
      // ScanFlow's outer catch and shows the generic error. Re-throw
      // with a recognizable prefix so humanizeError can map it to a
      // clear, actionable Thai/English message.
      throw new Error(
        `mediapipe-detect: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const face = result.faceLandmarks[0];
    if (!face || face.length === 0) return null;
    const landmarks: Landmarks = face.map((p: NormalizedLandmark) => ({
      x: p.x,
      y: p.y,
      z: p.z,
    }));

    let blendshapes: Blendshapes | null = null;
    const bsClassifications = result.faceBlendshapes?.[0];
    if (bsClassifications?.categories?.length) {
      const map: Record<string, number> = {};
      for (const cat of bsClassifications.categories as Category[]) {
        if (cat.categoryName) map[cat.categoryName] = cat.score;
      }
      blendshapes = map;
    }
    return { landmarks, blendshapes };
  }

  // Phase 186 — `dispose()` is now a no-op for the shared instance.
  // Page unmounts call this hoping to free the WASM context, but the
  // detector is shared across every face-aware page in the session.
  // We rely on full-page exit (browser-managed teardown) to free the
  // WASM context rather than throwing it away on every SPA navigation.
  // Callers that hold a local ref still get the right semantic: their
  // ref is cleared, but the underlying instance lives on.
  dispose(): void {
    /* no-op — see Phase 186 note */
  }
}

// Phase 192g — Idle prewarm. The first scan click was previously
// blocked by 200-500ms of tasks-vision dynamic import + WASM + GPU
// init because nothing on the app shell touched the model until the
// user actually pressed scan. Now we schedule the heavy
// `await import('@mediapipe/tasks-vision')` + `FaceLandmarker.createFromOptions(...)`
// chain inside `requestIdleCallback` (with a `setTimeout` fallback
// for Safari, which still lacks rIC in 2026). The prewarm reuses
// the same `inflightLoad` + `sharedDetector` singletons that the
// real `load()` path uses — there is no separate cache — so a real
// scan that arrives before idle fires simply joins the inflight
// promise via the standard de-dupe. No double-init, no race.
//
// Guards:
//   - skip on `effectiveType === '2g'` / `'slow-2g'` so we don't
//     burn low-bandwidth users' data on a speculative download
//   - skip when `navigator.deviceMemory < 4` AND `pointer: coarse`
//     (constrained mobile) — on-demand load still works there
//   - skip when not in a browser environment (SSR safety)
export function idlePrewarm(): void {
  if (typeof window === "undefined") return;
  if (sharedDetector || inflightLoad) return;

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
    // Re-check singletons inside the callback — a real load may have
    // arrived between schedule + fire. `FaceMeshDetector.load()` is
    // itself idempotent (returns `sharedDetector` or `inflightLoad`)
    // so calling it here is the safe path; we don't need to inline
    // the body.
    void FaceMeshDetector.load().catch(() => {
      // Swallow — real scan path will retry + surface the error.
    });
  };
  if (typeof ric.requestIdleCallback === "function") {
    ric.requestIdleCallback(fire, { timeout: 5000 });
  } else {
    window.setTimeout(fire, 2000);
  }
}
