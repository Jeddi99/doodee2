"use client";

import { useEffect, type MutableRefObject } from "react";
import { FaceMeshDetector } from "./mediapipe";
import { idlePrewarm as faceMeshIdlePrewarm } from "./mediapipe/face-mesh";
import { idlePrewarm as hairSegmenterIdlePrewarm } from "./mediapipe/hair-segmenter";

interface RequestIdleCallbackAPI {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
}

/**
 * Phase 37 → 186 — silently preload the MediaPipe model on mount.
 * Drops in anywhere a page owns a `detectorRef`. Cuts the first-upload
 * wait from ~1-3s (network + WASM init) to near-zero.
 *
 * Implementation notes:
 * - **Preload is fire-and-forget.** Failures don't surface — actual
 *   scan paths still call `ensureDetector()`, which retries + errors
 *   properly when the user does something.
 * - **Uses requestIdleCallback** (Chrome/Edge/Firefox) with a `setTimeout`
 *   fallback for Safari (which still lacks rIC support as of 2026).
 * - **Idempotent** — won't overwrite an already-loaded detector that
 *   the user triggered via a real scan during the idle wait.
 *
 * Phase 186 — Removed the dispose-on-unmount path. The MediaPipe
 * detector is now a module-level singleton (see face-mesh.ts and
 * hair-segmenter.ts), shared across every face-aware page. Switching
 * between `/scan` and `/try-on` previously disposed + re-initialized
 * the WASM context on every navigation — causing the 1-3 s lag the
 * user reported. We just null the local ref on unmount now; the
 * underlying instance lives in the shared cache.
 */
export function useMediaPipePreload(
  detectorRef: MutableRefObject<FaceMeshDetector | null>
): void {
  // Phase 23 → 186 — Clear the page-local ref on unmount, but DO NOT
  // call `dispose()`. The detector is shared across pages so a per-
  // page dispose would close the WASM context the next page needs.
  useEffect(() => {
    return () => {
      // Just null the page's local pointer; the shared instance lives on.
      detectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preload (Phase 37 → 182)
  //
  // Phase 182 — Mobile lag fix. The preload starts ~2s after mount and
  // pulls down a ~3 MB WASM + model bundle. On low-end Android the
  // download + WASM-init chokes the main thread for several seconds and
  // the whole try-on page freezes. Skip the preload entirely on:
  //   - touch-primary devices (`pointer: coarse`)
  //   - data-saver users (`navigator.connection.saveData`)
  //   - declared slow connections (2G/3G via `effectiveType`)
  // In those modes the model still loads on demand the first time the
  // user actually picks a photo — same code path, just no idle preload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isCoarsePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    type ConnLike = {
      saveData?: boolean;
      effectiveType?: string;
    };
    const conn = (navigator as Navigator & { connection?: ConnLike }).connection;
    const saveData = conn?.saveData === true;
    const slowNet =
      conn?.effectiveType === "slow-2g" ||
      conn?.effectiveType === "2g" ||
      conn?.effectiveType === "3g";
    if (isCoarsePointer || saveData || slowNet) {
      // Phase 182 — let the on-demand path own the load; preload skipped.
      return;
    }
    let cancelled = false;
    const ric = window as unknown as RequestIdleCallbackAPI;
    const fire = () => {
      if (cancelled) return;
      void FaceMeshDetector.load()
        .then((d) => {
          // Phase 191 — DO NOT dispose on cancel. The Phase 186 cache
          // makes FaceMeshDetector a module-level singleton, so
          // d.dispose() would tear down the WASM context for every
          // other component that depends on the same detector. The
          // earlier code path leaked one detector per cancel; the
          // _right_ fix is to drop the local reference and let GC /
          // the singleton keep the WASM warm.
          if (cancelled) return;
          if (!detectorRef.current) detectorRef.current = d;
        })
        .catch(() => {
          // Network / WASM init failed — let real scan path surface it
        });
    };
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    const scheduleIdle = () => {
      if (cancelled) return;
      if (typeof ric.requestIdleCallback === "function") {
        idleId = ric.requestIdleCallback(fire, { timeout: 4500 });
      } else {
        timeoutId = window.setTimeout(fire, 900);
      }
    };
    timeoutId = window.setTimeout(scheduleIdle, 1200);
    return () => {
      cancelled = true;
      if (idleId !== null && typeof ric.cancelIdleCallback === "function") {
        ric.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Phase 192g — Public idle prewarm entry point for the app shell.
// Fans out to every heavy model singleton (face-mesh, hair-segmenter,
// ONNX learned-scoring) so the first scan/try-on/hair-color click
// isn't blocked by ~200-500ms of cold imports + WASM + GPU init.
//
// Each underlying `idlePrewarm()` runs its own guards (2g / saveData
// / coarse-pointer + low device memory) and de-dupes via its
// module-level inflight singleton, so calling this multiple times
// (HMR, route navigation, re-mounts) is safe and cheap.
//
// The ONNX inference module is dynamic-imported here so the prewarm
// trigger itself does not pull onnxruntime-web's type surface into
// the bundle that hosts this hook.
export function idlePrewarm(): void {
  if (typeof window === "undefined") return;
  faceMeshIdlePrewarm();
  hairSegmenterIdlePrewarm();
  void import("./scoring/learned/inference")
    .then((m) => m.idlePrewarm())
    .catch(() => {
      // Swallow — best-effort prewarm.
    });
}
