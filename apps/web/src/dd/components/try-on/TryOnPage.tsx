"use client";

// Phase 182b — Dropped framer-motion import for this page. The two
// entrance animations were `opacity + translateY` fades that the user
// barely notices but every framer-motion mount carries an animation-
// engine init cost. On low-end Android this contributed to the
// perceived freeze on `/try-on`. Static markup ships now, plus a tiny
// CSS-only fade via `animate-in` class set on the wrappers.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  TryOnPanel,
  type HairMaskStatus,
  type TryOnPanelStatus,
} from "./TryOnPanel";
import { FaceMeshDetector, HairSegmenter } from "@/lib/mediapipe";
import { useMediaPipePreload } from "@/lib/use-mediapipe";
import { useT } from "@/lib/i18n";
import { decodeLook } from "@/lib/look-share";
import type { EffectKey } from "@/lib/makeover";
import type { ScanPhoto } from "@/types";

type Phase =
  | { kind: "idle" }
  | { kind: "loadingModel" }
  | { kind: "processing" }
  | { kind: "ready"; scan: ScanPhoto }
  | { kind: "error"; reason: "noFace" | "failed" };

interface TryOnPageProps {
  initialEffect?: EffectKey;
  sharedLookParam?: string;
}

export function TryOnPage({ initialEffect, sharedLookParam }: TryOnPageProps) {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [hairMask, setHairMask] = useState<Uint8Array | null>(null);
  const [hairMaskStatus, setHairMaskStatus] =
    useState<HairMaskStatus>("idle");
  const detectorRef = useRef<FaceMeshDetector | null>(null);
  const segmenterRef = useRef<HairSegmenter | null>(null);
  const jobRef = useRef(0);
  const sharedLook = useMemo(() => {
    if (!sharedLookParam) return null;
    return decodeLook(sharedLookParam);
  }, [sharedLookParam]);

  useMediaPipePreload(detectorRef);

  // Phase 186 — Just null the local ref. The HairSegmenter is now a
  // module-level singleton (see hair-segmenter.ts), so disposing on
  // unmount would close the WASM context the next page (also /try-on
  // or /hair-color) needs to reuse.
  const lastImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (phase.kind === "ready") {
      lastImageRef.current = phase.scan.image;
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      jobRef.current += 1;
      segmenterRef.current = null;
      if (lastImageRef.current && lastImageRef.current.src.startsWith("blob:")) {
        try { URL.revokeObjectURL(lastImageRef.current.src); } catch {}
      }
    };
  }, []);

  const ensureDetector = useCallback(async (): Promise<FaceMeshDetector> => {
    if (detectorRef.current) return detectorRef.current;
    const detector = await FaceMeshDetector.load();
    detectorRef.current = detector;
    return detector;
  }, []);

  const runHairSegmentation = useCallback(async (
    image: HTMLImageElement,
    jobId: number
  ) => {
    try {
      setHairMaskStatus("loading");
      await yieldToPaint();
      if (!segmenterRef.current) {
        segmenterRef.current = await HairSegmenter.load();
      }
      if (jobRef.current !== jobId) return;
      const srcW = image.naturalWidth || image.width;
      const srcH = image.naturalHeight || image.height;
      if (srcW === 0 || srcH === 0) {
        setHairMaskStatus("error");
        return;
      }
      await yieldToPaint();
      const mask = segmenterRef.current.segmentHairMask(image, srcW, srcH);
      if (jobRef.current !== jobId) return;
      if (mask) {
        setHairMask(mask);
        setHairMaskStatus("ready");
      } else {
        setHairMaskStatus("error");
      }
    } catch {
      if (jobRef.current === jobId) setHairMaskStatus("error");
      // heuristic hair recolor remains available
    }
  }, []);

  const handlePhoto = useCallback(async (image: HTMLImageElement) => {
    const jobId = jobRef.current + 1;
    jobRef.current = jobId;
    setHairMask(null);
    setHairMaskStatus("idle");
    try {
      setPhase({ kind: "loadingModel" });
      await yieldToPaint();
      const detector = await ensureDetector();
      if (jobRef.current !== jobId) {
        revokeBlobImage(image);
        return;
      }
      setPhase({ kind: "processing" });
      await yieldToPaint();
      const detected = detector.detect(image);
      if (jobRef.current !== jobId) {
        revokeBlobImage(image);
        return;
      }
      if (!detected) {
        revokeBlobImage(image);
        setPhase({ kind: "error", reason: "noFace" });
        return;
      }
      const { landmarks, blendshapes } = detected;
      setPhase({
        kind: "ready",
        scan: { image, landmarks, ...(blendshapes ? { blendshapes } : {}) },
      });
      void runHairSegmentation(image, jobId);
    } catch {
      if (jobRef.current === jobId) {
        revokeBlobImage(image);
        setPhase({ kind: "error", reason: "failed" });
      }
    }
  }, [ensureDetector, runHairSegmentation]);

  const reset = useCallback(() => {
    jobRef.current += 1;
    if (lastImageRef.current && lastImageRef.current.src.startsWith("blob:")) {
      try { URL.revokeObjectURL(lastImageRef.current.src); } catch {}
    }
    lastImageRef.current = null;
    setPhase({ kind: "idle" });
    setHairMask(null);
    setHairMaskStatus("idle");
  }, []);

  return (
    <div
      className={`tryon-mobile-focus mx-auto w-full max-w-6xl min-w-0 space-y-3 overflow-x-clip sm:space-y-8 ${
        phase.kind === "idle" ? "tryon-mobile-lock" : ""
      }`}
    >
      <header className="mx-auto hidden max-w-4xl min-w-0 space-y-4 text-center sm:block">
        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-white/60 bg-white/50 px-4 py-1.5 text-center text-[11px] uppercase tracking-[0.14em] text-[#067e96] shadow-[0_12px_30px_-24px_rgba(6,126,150,0.45)] backdrop-blur-md sm:tracking-[0.22em]">
          {t.tryOnV2.eyebrow}
        </div>
        <h1 className="font-serif text-5xl font-light italic leading-tight text-[#241f1a] sm:text-6xl">
          {t.tryOnV2.title}
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-relaxed text-[#625a52] sm:text-base">
          {t.tryOnV2.subtitle}
        </p>
      </header>

      <section>
        <TryOnPanel
          status={panelStatus(phase)}
          scan={phase.kind === "ready" ? phase.scan : undefined}
          statusText={statusText(phase, t)}
          errorText={errorText(phase, t)}
          onPhoto={handlePhoto}
          onResetPhoto={reset}
          initialEffect={initialEffect}
          hairMask={hairMask}
          hairMaskStatus={hairMaskStatus}
          initialLook={sharedLook}
          sharedLookActive={Boolean(sharedLook)}
        />
      </section>
    </div>
  );
}

function panelStatus(phase: Phase): TryOnPanelStatus {
  if (phase.kind === "loadingModel") return "loading";
  if (phase.kind === "processing") return "processing";
  if (phase.kind === "error") return "error";
  if (phase.kind === "ready") return "ready";
  return "idle";
}

function statusText(phase: Phase, t: ReturnType<typeof useT>["t"]) {
  if (phase.kind === "loadingModel") return t.tryOnV2.stage.loadingModel;
  if (phase.kind === "processing") return t.tryOnV2.stage.detecting;
  return undefined;
}

function errorText(phase: Phase, t: ReturnType<typeof useT>["t"]) {
  if (phase.kind !== "error") return undefined;
  return phase.reason === "noFace" ? t.scan.noFace : t.scan.failed;
}

function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function revokeBlobImage(image: HTMLImageElement): void {
  if (!image.src.startsWith("blob:")) return;
  try { URL.revokeObjectURL(image.src); } catch {}
}
