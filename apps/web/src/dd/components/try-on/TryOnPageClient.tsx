"use client";

/**
 * Phase 119 — dynamic-import wrapper for TryOnPage.
 *
 * TryOnPage imports MediaPipe Tasks (FaceMeshDetector + HairSegmenter).
 * Same problem as ScanFlow: bloats the /try-on route bundle. Dynamic
 * import keeps the route shell tiny and shows a skeleton while the
 * heavy chunk streams in.
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";

interface TryOnPageClientProps {
  initialEffect?: "hair" | "eyes" | "lips" | "blush";
  sharedLookParam?: string;
}

const TryOnPage = dynamic(
  () => import("./TryOnPage").then((m) => ({ default: m.TryOnPage })),
  {
    ssr: false,
    loading: () => null,
  }
);

export function TryOnPageClient(props: TryOnPageClientProps) {
  // Phase 192q — Page-scoped idle prewarm. Was previously in (app) shell,
  // running on every /history /upgrade /settings mount and burning ~27MB
  // of cold downloads (MediaPipe + HairSegmenter + ONNX). Now only fires
  // when the user actually lands on /try-on, AND only on desktop. Mobile
  // skips the prewarm and pays a 200-500ms first-effect latency hit
  // instead — far better than the bandwidth/battery tax on every page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isCoarsePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const isNarrow =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 768px)").matches;
    if (isCoarsePointer || isNarrow) return;
    let cancelled = false;
    void import("@/lib/use-mediapipe")
      .then((m) => {
        if (cancelled) return;
        m.idlePrewarm();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return <TryOnPage {...props} />;
}
