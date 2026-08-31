"use client";

import { ArrowUpRight, Layers, Star, TrendingUp } from "lucide-react";
import type { ScanRecord } from "@/lib/scan-history";
import { useT } from "@/lib/i18n";

interface HistoryStatsRowProps {
  history: ScanRecord[];
}

function score100(value: number): number {
  return Math.max(0, Math.min(100, value * 10));
}

function formatScore(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(1);
}

function formatDate(ts: number | null, lang: "th" | "en"): string {
  if (ts === null) return "—";
  return new Date(ts).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return `${sign}${Math.abs(delta).toFixed(1)}`;
}

type Accent = "violet" | "cyan";

const accentStyles: Record<
  Accent,
  { icon: string; value: string; span: string }
> = {
  violet: {
    icon: "history-stat-icon-violet",
    value: "history-stat-value",
    span: "",
  },
  cyan: {
    icon: "history-stat-icon-cyan",
    value: "history-stat-value",
    span: "sm:col-span-2 xl:col-span-1",
  },
};

export function HistoryStatsRow({ history }: HistoryStatsRowProps) {
  const { t, lang } = useT();
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sorted[0] ?? null;
  const oldest = sorted[sorted.length - 1] ?? null;
  const best =
    sorted.length > 0
      ? sorted.reduce((top, record) =>
          record.overall > top.overall ? record : top
        )
      : null;
  const average =
    sorted.length > 0
      ? sorted.reduce((sum, record) => sum + score100(record.overall), 0) /
        sorted.length
      : null;
  const delta =
    latest && oldest && latest.timestamp !== oldest.timestamp
      ? score100(latest.overall) - score100(oldest.overall)
      : null;

  // Phase 192s // bento emphasis: highest scan is the hero tile,
  // wider on tablet; the rest carry quieter accent icons.
  const cards: Array<{
    icon: typeof Layers;
    label: string;
    value: string;
    suffix: string;
    subtitle: string;
    accent: Accent;
  }> = [
    {
      icon: Star,
      label: t.historyDashboard.stats.highest,
      value: formatScore(best ? score100(best.overall) : null),
      suffix: "/100",
      subtitle: formatDate(best?.timestamp ?? null, lang),
      accent: "cyan",
    },
    {
      icon: ArrowUpRight,
      label: t.historyDashboard.stats.latest,
      value: formatScore(latest ? score100(latest.overall) : null),
      suffix: "/100",
      subtitle: formatDate(latest?.timestamp ?? null, lang),
      accent: "violet",
    },
    {
      icon: TrendingUp,
      label: t.historyDashboard.stats.average,
      value: formatScore(average),
      suffix: "/100",
      subtitle: t.historyDashboard.stats.deltaVsFirst.replace(
        "{delta}",
        formatDelta(delta)
      ),
      accent: "violet",
    },
    {
      icon: Layers,
      label: t.historyDashboard.stats.total,
      value: history.length.toString(),
      suffix: t.historyDashboard.stats.totalUnit,
      subtitle: t.historyDashboard.stats.localOnly,
      accent: "violet",
    },
  ];

  return (
    <section
      className="history-stats-grid grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label={t.historyDashboard.stats.aria}
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const styles = accentStyles[card.accent];
        const isHero = card.accent === "cyan";
        return (
          <div
            key={card.label}
            className={`history-stat-card relative w-full min-w-0 max-w-full overflow-hidden rounded-2xl border p-4 backdrop-blur-md ${styles.span} ${
              isHero ? "history-stat-card-hero" : ""
            }`}
          >
            <div
              className={`history-stat-icon flex h-9 w-9 items-center justify-center rounded-xl border ${styles.icon}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <p className="history-stat-label mt-4 text-[10px] font-semibold uppercase tracking-[0.18em]">
              {card.label}
            </p>
            <div className="mt-2 flex items-end gap-1.5">
              <span
                className={`font-serif font-light italic leading-none tabular-nums ${styles.value} ${
                  isHero ? "text-[2.75rem]" : "text-4xl"
                }`}
              >
                {card.value}
              </span>
              <span className="history-stat-suffix pb-1 text-xs">{card.suffix}</span>
            </div>
            <p className="history-stat-subtitle mt-2 min-h-4 truncate text-xs">
              {card.subtitle}
            </p>
          </div>
        );
      })}
    </section>
  );
}
