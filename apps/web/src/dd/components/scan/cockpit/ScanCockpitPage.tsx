"use client";

import { useEffect } from "react";
import { ScanFlowClient } from "@/components/scan/ScanFlowClient";
import { useT } from "@/lib/i18n";
import { ScanTipsPanel } from "./ScanTipsPanel";
import { ScanHistoryPanel } from "./ScanHistoryPanel";
import { WhyDoodeeCard } from "./WhyDoodeeCard";

export function ScanCockpitPage() {
  const { t } = useT();

  // Phase 192q — Page-scoped idle prewarm. Was previously in (app) shell,
  // running on every /history /upgrade /settings mount and burning ~27MB
  // of cold downloads (MediaPipe + HairSegmenter + ONNX). Now only fires
  // when the user actually lands on /scan, AND only on desktop. Mobile
  // skips the prewarm and pays a 200-500ms first-scan latency hit instead
  // — far better than the bandwidth/battery tax on unrelated pages.
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
    const ric = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | null = null;
    const start = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      void import("@/lib/use-mediapipe")
        .then((m) => {
          if (cancelled) return;
          m.idlePrewarm();
        })
        .catch(() => {});
    };
    const timer = window.setTimeout(() => {
      if (typeof ric.requestIdleCallback === "function") {
        idleId = ric.requestIdleCallback(start, { timeout: 3000 });
      } else {
        start();
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleId !== null && typeof ric.cancelIdleCallback === "function") {
        ric.cancelIdleCallback(idleId);
      }
    };
  }, []);

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-5">
      <section className="relative w-full max-w-full overflow-hidden rounded-3xl border border-[#241f1a]/10 bg-white/82 p-4 text-[#241f1a] shadow-[0_18px_54px_-44px_rgba(36,31,26,0.38)] backdrop-blur-md dark:border-[#263149] dark:bg-[#070b1a] dark:text-white dark:shadow-[0_18px_54px_-44px_rgba(0,0,0,0.86)] sm:p-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(240,249,255,0.75)_52%,rgba(6,182,212,0.1))] dark:bg-[linear-gradient(135deg,rgba(11,16,32,0.98),rgba(5,8,22,0.95)_48%,rgba(6,182,212,0.08))]" />
        <div className="relative max-w-3xl space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0e7490] dark:text-[#67e8f9]">
            {t.nav.scan}
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-[#241f1a] dark:text-white sm:text-4xl">
            {t.scanCockpit.title}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[#5f574f] dark:text-white/64 sm:text-base">
            {t.scanCockpit.subtitle}
          </p>
        </div>
      </section>

      <div className="grid w-full max-w-full min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <div id="scan-flow" className="scroll-mt-24">
            <ScanFlowClient hideIntro />
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <ScanHistoryPanel />
          <ScanTipsPanel />
        </aside>
      </div>

      <WhyDoodeeCard compact />
    </div>
  );
}
