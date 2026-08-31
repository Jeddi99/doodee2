"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import type { Category } from "@/lib/scoring";
import type { ScanRecord } from "@/lib/scan-history";
import { useT } from "@/lib/i18n";
import { RadarChart } from "@/components/results/RadarChart";

interface HistoryRadarCardProps {
  record: ScanRecord | null;
}

const RADAR_CATEGORIES: Category[] = [
  "harmony",
  "angularity",
  "dimorphism",
  "eye-area",
  "features",
];

function score100(value: number | undefined): number {
  if (typeof value !== "number") return 0;
  return Math.max(0, Math.min(100, value * 10));
}

export function HistoryRadarCard({ record }: HistoryRadarCardProps) {
  const { t } = useT();
  // Phase 192g // memo so parent re-renders (pull-to-refresh, hover elsewhere) don't recompute geometry
  const values = useMemo(
    () =>
      RADAR_CATEGORIES.map((category) => score100(record?.categories[category])),
    [record]
  );
  const chartScores = useMemo(
    () =>
      RADAR_CATEGORIES.reduce<Partial<Record<Category, number>>>(
        (acc, category) => {
          const value = record?.categories[category];
          if (typeof value === "number") acc[category] = value;
          return acc;
        },
        {}
      ),
    [record]
  );

  return (
    <section className="rounded-3xl border border-white/60 bg-white/45 p-5 shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl border border-[#7a5bd6]/25 bg-[#f6f1ff] text-[#7a5bd6]">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#241f1a]">
            {t.historyDashboard.radar.title}
          </h2>
          <p className="mt-1 text-xs text-[#625a52]">
            {record
              ? t.historyDashboard.radar.subtitle
              : t.historyDashboard.radar.empty}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/60 bg-white/35 p-3 backdrop-blur">
        {record ? (
          <RadarChart categoryScores={chartScores} />
        ) : (
          <div
            role="status"
            className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-white/60 bg-white/35 text-center text-xs leading-relaxed text-[#625a52] backdrop-blur"
          >
            {t.historyDashboard.radar.empty}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2" aria-label={t.historyDashboard.radar.title}>
        {RADAR_CATEGORIES.map((category, index) => (
          <div
            key={category}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs"
          >
            <span className="min-w-0 leading-snug text-[#625a52]">
              {t.category[category]}
            </span>
            <span className="font-medium tabular-nums text-[#241f1a]">
              {record ? Math.round(values[index]!) : "—"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
