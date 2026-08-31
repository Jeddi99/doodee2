"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  loadHistory,
  SCAN_HISTORY_CHANGED_EVENT,
  type ScanRecord,
} from "@/lib/scan-history";

export function ScanHistoryPanel() {
  const { t, lang } = useT();
  const [records, setRecords] = useState<ScanRecord[]>([]);

  useEffect(() => {
    const refresh = () => setRecords(loadHistory().slice(0, 4));
    refresh();
    window.addEventListener(SCAN_HISTORY_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SCAN_HISTORY_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <section className="rounded-3xl border border-white/60 bg-white/55 p-5 shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-light italic text-[#241f1a]">
          {t.scanCockpit.historyHeader}
        </h2>
        <Link
          href="/history"
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-white/55 bg-white/45 px-3.5 py-2 text-xs font-semibold text-[#0f6f7f] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f7f]/35"
        >
          {t.scanCockpit.historyViewAll}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/60 bg-white/40 p-4 text-sm font-medium leading-relaxed text-[#4f4841] backdrop-blur-md">
          {t.scanCockpit.historyEmpty}
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {records.map((record) => (
            <div
              key={record.timestamp}
              className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/40 p-3 backdrop-blur-md"
            >
              <Avatar record={record} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[#5b5148]">
                  {formatDate(record.timestamp, lang)}
                </p>
                <Link
                  href="/history"
                  className="mt-1 inline-flex min-h-[44px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-[#0f6f7f] transition hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f7f]/35"
                >
                  {t.scanCockpit.historyDetail}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <p className="font-serif text-3xl font-light italic leading-none text-[#241f1a] tabular-nums">
                {record.overall.toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Avatar({ record }: { record: ScanRecord }) {
  if (record.photoDataUrl) {
    return (
      <div
        className="h-8 w-8 flex-none rounded-full border border-[#241f1a]/15 bg-cover bg-center"
        style={{ backgroundImage: `url(${record.photoDataUrl})` }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className="h-8 w-8 flex-none rounded-full border border-[#0f6f7f]/20 bg-gradient-to-br from-[#eff8f8] to-[#bde6ea]"
      aria-hidden
    />
  );
}

function formatDate(timestamp: number, lang: "th" | "en"): string {
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
