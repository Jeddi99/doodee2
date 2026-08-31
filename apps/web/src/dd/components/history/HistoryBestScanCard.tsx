"use client";

import Image from "next/image";
import { ArrowRight, Crown, Sparkles } from "lucide-react";
import type { ScanRecord } from "@/lib/scan-history";
import { useT } from "@/lib/i18n";

interface HistoryBestScanCardProps {
  record: ScanRecord | null;
  onOpen: (record: ScanRecord) => void;
}

function score100(value: number): string {
  return Math.max(0, Math.min(100, value * 10)).toFixed(1);
}

function formatDate(ts: number, lang: "th" | "en"): string {
  return new Date(ts).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Phase 192s // best scan = trophy. Serif hero number, crown badge,
// and a quiet editorial card treatment.
export function HistoryBestScanCard({
  record,
  onOpen,
}: HistoryBestScanCardProps) {
  const { t, lang } = useT();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/45 p-5 shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md">
      <div className="relative flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#7a5bd6]/25 bg-[#f6f1ff] text-[#7a5bd6]">
          <Crown className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7a5bd6]">
          {t.historyDashboard.best.title}
        </h2>
      </div>

      {record ? (
        <div className="relative mt-4 space-y-4">
          <div className="relative h-[124px] overflow-hidden rounded-2xl border border-white/60 bg-white/35 backdrop-blur">
            {record.photoDataUrl ? (
              <Image
                src={record.photoDataUrl}
                alt=""
                fill
                unoptimized
                sizes="320px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#241f1a] text-xl font-bold text-white">
                  D
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/85 to-transparent" />
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/60 px-2 py-0.5 text-[10px] font-medium text-[#4f4740] backdrop-blur">
              <Sparkles className="h-3 w-3 text-[#7a5bd6]" />
              {t.historyDashboard.best.title}
            </span>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-serif text-[3.35rem] font-light italic leading-[1.02] text-[#241f1a] tabular-nums sm:text-6xl">
                {score100(record.overall)}
              </p>
              <p className="mt-2 text-xs text-[#7c746d]">
                {formatDate(record.timestamp, lang)}
              </p>
            </div>
            <span className="mb-1 font-serif text-base italic text-[#8f8379]">
              /100
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpen(record)}
            className="inline-flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-full bg-[#241f1a] px-4 py-3 text-xs font-semibold text-white transition-[transform,background-color] duration-200 hover:bg-[#342d27] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
          >
            {t.historyDashboard.best.cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <p className="relative mt-4 rounded-2xl border border-white/60 bg-white/35 p-4 text-xs leading-relaxed text-[#625a52] backdrop-blur">
          {t.historyDashboard.best.empty}
        </p>
      )}
    </section>
  );
}
