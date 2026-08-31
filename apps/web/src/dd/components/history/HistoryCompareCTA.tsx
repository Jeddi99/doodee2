"use client";

import Image from "next/image";
import { GitCompare, Lock } from "lucide-react";
import type { ScanRecord } from "@/lib/scan-history";
import { useT } from "@/lib/i18n";

interface HistoryCompareCTAProps {
  history: ScanRecord[];
  onStart: () => void;
}

function FaceCircle({
  record,
  label,
}: {
  record: ScanRecord | null;
  label: string;
}) {
  return (
    <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/60 bg-white/35 backdrop-blur">
      {record?.photoDataUrl ? (
        <Image
          src={record.photoDataUrl}
          alt=""
          fill
          unoptimized
          sizes="56px"
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[#625a52]">
          {label}
        </div>
      )}
    </div>
  );
}

export function HistoryCompareCTA({ history, onStart }: HistoryCompareCTAProps) {
  const { t } = useT();
  const disabled = history.length < 2;
  const first = history[0] ?? null;
  const second = history[1] ?? null;

  return (
    <section className="rounded-3xl border border-white/60 bg-white/45 p-5 shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-[#7a5bd6]" />
        <h2 className="text-sm font-semibold text-[#241f1a]">
          {t.historyDashboard.compare.title}
        </h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#625a52]">
        {t.historyDashboard.compare.subtitle}
      </p>

      <div className="mt-5 flex items-center justify-center gap-3">
        <FaceCircle record={first} label="A" />
        <span className="rounded-full border border-[#7a5bd6]/25 bg-[#f6f1ff] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f4fc8]">
          {t.historyDashboard.compare.vs}
        </span>
        <FaceCircle record={second} label="B" />
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#241f1a] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 disabled:pointer-events-none disabled:opacity-45"
      >
        {disabled ? <Lock className="h-3.5 w-3.5" /> : <GitCompare className="h-3.5 w-3.5" />}
        {t.historyDashboard.compare.start}
      </button>
      {disabled && (
        <p className="mt-2 text-center text-[11px] text-[#8f8379]">
          {t.historyDashboard.compare.needTwo}
        </p>
      )}
    </section>
  );
}
