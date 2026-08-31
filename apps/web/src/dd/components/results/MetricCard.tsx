"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBar } from "./ScoreBar";
import { useT } from "@/lib/i18n";
import type { MetricKey, MetricResult } from "@/types";

interface MetricCardProps {
  metricKey: MetricKey;
  result: MetricResult;
  onSelect?: (key: MetricKey) => void;
}

// Phase 192p (PERF): browser-skipped off-screen rendering. With 60+ tiles
// on the result grid mobile scroll was painting every CardContent on each
// frame. content-visibility:auto tells the engine to defer paint+layout for
// tiles outside the viewport; contain-intrinsic-size reserves their slot so
// the scroll position stays stable when they pop in.
const CV_STYLE = {
  contentVisibility: "auto" as const,
  containIntrinsicSize: "190px",
};

function MetricCardImpl({ metricKey, result, onSelect }: MetricCardProps) {
  const { t } = useT();
  const label = t.metric[metricKey];
  const status = result.flagged
    ? {
        text: t.result.flaggedLabel,
        tone: "border-[#f4b4aa] bg-[#fff1ee] text-[#b42318]",
      }
    : result.score >= 8
      ? {
          text: t.status.good,
          tone: "border-[#9ad9c1] bg-[#ecfdf6] text-[#047857]",
        }
      : result.score >= 5
        ? {
            text: t.status.borderline,
            tone: "border-[#f3cd86] bg-[#fff7e8] text-[#9a5a00]",
          }
        : {
            text: t.status.poor,
            tone: "border-[#f4b4aa] bg-[#fff1ee] text-[#b42318]",
          };
  const rawFormatted = `${result.raw.toFixed(2)}${result.unit}`;
  const idealFormatted = `${result.ideal[0]}${result.unit} – ${result.ideal[1]}${result.unit}`;

  const conf = result.confidence ?? 1;
  const showLowConf = !result.flagged && conf < 0.6;
  const inner = (
    <CardContent className="space-y-4 p-4 text-[#241f1a] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-sm font-semibold leading-snug">
          {label}
        </h3>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.tone}`}
        >
          {/* Phase 192v (a11y): aria-hidden keeps the Phase 192o decorative-
              icon contract — the adjacent status.text already names the state
              ("Not confident"), so SR shouldn't also announce the triangle. */}
          {result.flagged && <AlertTriangle className="h-3 w-3" aria-hidden />}
          {status.text}
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr] items-end gap-4">
        <div className="min-w-[4.25rem]">
          <p className="font-serif text-4xl font-light italic leading-none tabular-nums text-[#241f1a]">
            {result.score.toFixed(1)}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8f8379]">
            /10
          </p>
        </div>
        <div className="pb-3">
          <ScoreBar
            score={result.score}
            ariaLabel={`${label} ${result.score.toFixed(1)} / 10`}
          />
        </div>
      </div>
      <div className="grid gap-2 text-xs tabular-nums sm:grid-cols-2">
        <div className="rounded-xl border border-[#241f1a]/10 bg-white/40 px-3 py-2 backdrop-blur-md">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8f8379]">
            {t.result.measured}
          </p>
          <p className="mt-0.5 break-words font-medium text-[#241f1a]">
            {rawFormatted}
          </p>
        </div>
        <div className="rounded-xl border border-[#241f1a]/10 bg-white/40 px-3 py-2 backdrop-blur-md sm:text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8f8379]">
            {t.result.ideal}
          </p>
          <p className="mt-0.5 break-words font-medium text-[#4f4740]">
            {idealFormatted}
          </p>
        </div>
      </div>
      {showLowConf && (
        <span
          title={t.result.confidenceTooltip}
          className="block cursor-help text-[10px] font-medium uppercase tracking-[0.18em] text-[#9a5a00]"
        >
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" aria-hidden /> conf{" "}
            {Math.round(conf * 100)}%
          </span>
        </span>
      )}
    </CardContent>
  );

  if (!onSelect) {
    return (
      <Card className="bg-white/50 text-[#241f1a] backdrop-blur-md" style={CV_STYLE}>
        {inner}
      </Card>
    );
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(metricKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(metricKey);
        }
      }}
      style={CV_STYLE}
      className="cursor-pointer bg-white/50 text-[#241f1a] backdrop-blur-md transition-colors hover:border-[#3f6268]/25 hover:bg-white/68 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f6268]/30"
    >
      {inner}
    </Card>
  );
}

// Phase 192p (PERF): shallow-compare memo. CategoryTabs passes a stable
// onSelect (setOpenMetric is identity-stable from useState), and
// result/metricKey only change when the underlying scan changes. Without
// memo, switching tabs or opening the dialog re-rendered every tile;
// with it, tiles re-render only when their own data flips.
export const MetricCard = memo(MetricCardImpl);
