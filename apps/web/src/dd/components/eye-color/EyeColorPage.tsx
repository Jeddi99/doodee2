"use client";

import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import { Eye, Loader2 } from "lucide-react";
import { PhotoUpload } from "@/components/scan/PhotoUpload";
import { Skeleton } from "@/components/ui/skeleton";
import { EyeColorPanel } from "./EyeColorPanel";
import { FaceMeshDetector } from "@/lib/mediapipe";
import { useMediaPipePreload } from "@/lib/use-mediapipe";
import { useT } from "@/lib/i18n";
import type { ScanPhoto } from "@/types";

type Phase =
  | { kind: "idle" }
  | { kind: "loadingModel" }
  | { kind: "processing" }
  | { kind: "ready"; scan: ScanPhoto }
  | { kind: "error"; reason: "noFace" | "failed" };

export function EyeColorPage() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const detectorRef = useRef<FaceMeshDetector | null>(null);
  const lastImageRef = useRef<HTMLImageElement | null>(null);
  const mountedRef = useRef(true);
  const uploadTokenRef = useRef(0);

  useEffect(() => {
    if (phase.kind === "ready") {
      lastImageRef.current = phase.scan.image;
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      uploadTokenRef.current += 1;
      if (lastImageRef.current && lastImageRef.current.src.startsWith("blob:")) {
        try { URL.revokeObjectURL(lastImageRef.current.src); } catch {}
      }
    };
  }, []);

  // Phase 37: preload + dispose lifecycle via the shared hook.
  useMediaPipePreload(detectorRef);

  async function ensureDetector(): Promise<FaceMeshDetector> {
    if (detectorRef.current) return detectorRef.current;
    setPhase({ kind: "loadingModel" });
    const detector = await FaceMeshDetector.load();
    detectorRef.current = detector;
    return detector;
  }

  async function handlePhoto(image: HTMLImageElement) {
    const token = uploadTokenRef.current + 1;
    uploadTokenRef.current = token;
    try {
      const detector = await ensureDetector();
      if (!mountedRef.current || uploadTokenRef.current !== token) {
        if (image.src.startsWith("blob:")) try { URL.revokeObjectURL(image.src); } catch {}
        return;
      }
      setPhase({ kind: "processing" });
      const detected = detector.detect(image);
      if (!mountedRef.current || uploadTokenRef.current !== token) {
        if (image.src.startsWith("blob:")) try { URL.revokeObjectURL(image.src); } catch {}
        return;
      }
      if (!detected) {
        if (image.src.startsWith("blob:")) try { URL.revokeObjectURL(image.src); } catch {}
        setPhase({ kind: "error", reason: "noFace" });
        return;
      }
      const { landmarks, blendshapes } = detected;
      setPhase({
        kind: "ready",
        scan: { image, landmarks, ...(blendshapes ? { blendshapes } : {}) },
      });
    } catch {
      if (!mountedRef.current || uploadTokenRef.current !== token) {
        if (image.src.startsWith("blob:")) try { URL.revokeObjectURL(image.src); } catch {}
        return;
      }
      if (image.src.startsWith("blob:")) try { URL.revokeObjectURL(image.src); } catch {}
      setPhase({ kind: "error", reason: "failed" });
    }
  }

  function reset() {
    uploadTokenRef.current += 1;
    if (lastImageRef.current && lastImageRef.current.src.startsWith("blob:")) {
      try { URL.revokeObjectURL(lastImageRef.current.src); } catch {}
    }
    lastImageRef.current = null;
    setPhase({ kind: "idle" });
  }

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-8 overflow-x-clip">
      <m.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="min-w-0 space-y-4 text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/50 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#067e96] shadow-[0_12px_30px_-24px_rgba(6,126,150,0.45)] backdrop-blur-md">
          <Eye className="h-3 w-3" />
          {t.eyeColor.eyebrow}
        </div>
        <h1 className="font-serif italic font-light text-4xl md:text-5xl text-[#241f1a] leading-tight">
          {t.eyeColor.title}
        </h1>
        <p className="max-w-xl mx-auto text-sm md:text-base text-[#625a52] leading-relaxed">
          {t.eyeColor.subtitle}
        </p>
      </m.header>

      <m.section
        key={phase.kind}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="min-w-0 space-y-6"
      >
        {phase.kind === "idle" && (
          <PhotoUpload
            onPhoto={handlePhoto}
            promptText={t.eyeColor.uploadPrompt}
          />
        )}

        {(phase.kind === "loadingModel" || phase.kind === "processing") && (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="mx-auto w-full max-w-md space-y-4 rounded-3xl border border-white/60 bg-white/45 p-4 shadow-[0_18px_48px_-40px_rgba(36,31,26,0.34)] backdrop-blur-md"
          >
            <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
            <div className="rounded-2xl border border-white/60 bg-white/40 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.48)] backdrop-blur">
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-[#067e96]">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                {phase.kind === "loadingModel"
                  ? t.scan.loadingModel
                  : t.scan.processing}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/50">
                <div
                  className="h-full rounded-full bg-[#067e96] transition-all duration-300"
                  style={{ width: phase.kind === "loadingModel" ? "42%" : "74%" }}
                />
              </div>
            </div>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="rounded-2xl border border-white/60 bg-white/45 p-8 text-center shadow-[0_18px_48px_-40px_rgba(36,31,26,0.34)] space-y-4 backdrop-blur-md">
            <p className="text-sm text-warn">
              {phase.reason === "noFace" ? t.scan.noFace : t.scan.failed}
            </p>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-[#5e45b8] hover:text-[#4f35a5] transition-colors"
            >
              {t.scan.tryAnother}
            </button>
          </div>
        )}

        {phase.kind === "ready" && (
          <EyeColorPanel scan={phase.scan} onReset={reset} />
        )}
      </m.section>
    </div>
  );
}
