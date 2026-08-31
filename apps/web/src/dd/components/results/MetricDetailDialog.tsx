"use client";

import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ZoomedFace } from "./ZoomedFace";
import { BellCurve } from "./BellCurve";
import { ScoreBar } from "./ScoreBar";
import { ARC_ANNOTATIONS } from "@/lib/metrics/arc-annotations";
import { MEASUREMENT_LINES } from "@/lib/metrics/measurement-lines";
import { METRIC_EVIDENCE } from "@/data/metric-evidence";
import { METRIC_VIEW, metricPercentile } from "@/lib/scoring";
import { useT } from "@/lib/i18n";
import type { MetricKey, MetricResult, ScanPhoto } from "@/types";

interface MetricDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metricKey: MetricKey;
  result: MetricResult;
  scan: { front: ScanPhoto; side?: ScanPhoto };
}

function strokeColorForScore(score: number): string {
  if (score >= 8) return "#10b981";
  if (score >= 5) return "#f59e0b";
  return "#ef4444";
}

export function MetricDetailDialog({
  open,
  onOpenChange,
  metricKey,
  result,
  scan,
}: MetricDetailDialogProps) {
  const { t } = useT();
  const citation = t.citation[metricKey];
  const note = t.metricNote[metricKey];
  const tip = t.metricTip[metricKey];
  // When the metric is sanity-flagged the underlying landmark positions
  // are unreliable — drawing the lines would visually mislead (e.g. jaw
  // lines hanging off into the neckline). Hide them and let the flagged
  // banner above explain why.
  const lines = result.flagged ? [] : MEASUREMENT_LINES[metricKey];
  const view = METRIC_VIEW[metricKey];
  const photo = view === "front" ? scan.front : scan.side;
  const evidence = METRIC_EVIDENCE[metricKey];
  const strokeColor = strokeColorForScore(result.score);

  const rawFormatted = `${result.raw.toFixed(2)}${result.unit}`;
  const idealFormatted = `${result.ideal[0]}${result.unit} – ${result.ideal[1]}${result.unit}`;

  const arcAnno = result.flagged ? undefined : ARC_ANNOTATIONS[metricKey];
  const arc = arcAnno
    ? {
        ...arcAnno,
        label: `${result.raw.toFixed(1)}${result.unit}`,
      }
    : undefined;
  // Phase 158.3 — always show the numeric value on the photo. For arc-based
  // metrics the arc itself carries the label; for everything else (ratios,
  // symmetry, distances) we add a corner chip so users never see lines with
  // no number attached.
  const valueLabel =
    !arc && !result.flagged
      ? `${result.raw.toFixed(2)}${result.unit}`
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Phase 192t — content-heavy dialog. On mobile (<lg) behave like a
          near-full-height sheet (92dvh leaves a peek of backdrop, full-bleed
          width) with a pinned header and a scrolling body so the 44px close
          affordance and the header stay visible while the long breakdown
          scrolls. Desktop (lg+) reverts to the centered max-w-2xl card. */}
      <DialogContent className="metric-detail-dialog doodee-readable-force w-[calc(100%-1rem)] max-h-[92dvh] max-w-5xl gap-0 overflow-hidden border-[#241f1a]/10 bg-white/60 p-0 text-[#241f1a] shadow-[0_24px_80px_-48px_rgba(36,31,26,0.55)] backdrop-blur-md lg:w-full lg:max-h-[100dvh]">
        {/* Pinned header — pr-12 clears the absolute 44px close button. */}
        <header className="space-y-2 border-b border-[#241f1a]/10 bg-white/50 px-6 pb-4 pr-12 pt-6 backdrop-blur-md">
          <p className="text-xs font-medium uppercase tracking-widest text-[#3f6268]">
            {t.result.metricDetail}
          </p>
          <DialogTitle className="font-serif text-3xl font-light italic text-[#241f1a]">
            {t.metric[metricKey]}
          </DialogTitle>
          <DialogDescription className="text-[#5b5148]">
            {citation.description}
          </DialogDescription>
        </header>

        {/* Phase 192t — scroll body between the pinned header and the dialog
            edge. Capped at 78dvh on mobile so the header stays on-screen; lg+
            caps just under the 100dvh card so tall content still scrolls below
            the pinned header rather than clipping (DialogContent is now
            overflow-hidden, so the body owns the scroll on every breakpoint). */}
        <div className="metric-detail-scroll max-h-[78dvh] space-y-6 overflow-y-auto overscroll-contain px-6 py-6 text-[#241f1a] lg:max-h-[84dvh]">
          {result.flagged && (
            <div className="flex gap-3 rounded-xl border border-[#f4b4aa] bg-[#fff1ee]/82 p-3 text-xs backdrop-blur-md">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#b42318]" />
              <div className="space-y-1">
                <p className="font-semibold text-[#b42318]">
                  {t.result.flaggedTitle}
                </p>
                <p className="leading-relaxed text-[#5b5148]">
                  {t.result.flaggedMessage}
                </p>
              </div>
            </div>
          )}

          <div className="metric-detail-layout grid gap-5 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-start">
            <aside className="metric-detail-zoom-rail order-1 min-w-0 lg:sticky lg:top-4">
          {photo ? (
            <div className="flex justify-center">
              <div className="w-full max-w-[320px]">
                <ZoomedFace
                  key={metricKey}
                  image={photo.image}
                  landmarks={photo.landmarks}
                  measurementLines={lines}
                  viewportSize={320}
                  strokeColor={strokeColor}
                  arc={arc}
                  valueLabel={valueLabel}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-2xl border border-[#241f1a]/10 bg-white/50 p-8 text-center text-xs text-[#5b5148] backdrop-blur-md">
              {t.scan.addSideDescription}
            </div>
          )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label={t.result.yourMeasurement} value={rawFormatted} />
                <Stat label={t.result.idealRange} value={idealFormatted} />
                <Stat
                  label={t.result.score}
                  value={`${result.score.toFixed(1)} / 10`}
                />
              </div>
            </aside>

            <div className="order-2 min-w-0 space-y-6">
              {!result.flagged && (
                <PercentileLine
                  metricKey={metricKey}
                  raw={result.raw}
                  confidence={result.confidence}
                />
              )}

              <div className="rounded-xl border border-[#241f1a]/10 bg-white/50 p-3 backdrop-blur-md">
                <ScoreBar score={result.score} />
              </div>

          {/* Section 6: May indicate */}
          <Panel label={t.result.implicationsLabel}>
            <p className="text-sm leading-relaxed text-[#5b5148]">{note}</p>
          </Panel>

          {/* Section 6b: What you can do */}
          <Panel label={t.result.tipLabel}>
            <p className="text-sm leading-relaxed text-[#5b5148]">{tip}</p>
          </Panel>

          {/* Section 7: About this metric */}
          <Panel label={t.result.aboutLabel}>
            <p className="text-sm leading-relaxed text-[#5b5148]">
              {citation.description}
            </p>
            <p className="pt-2 text-xs text-[#5b5148]">
              <span className="font-medium uppercase tracking-widest text-[#6f625a]">
                {t.result.source}
              </span>{" "}
              · {citation.source}
            </p>
            <div className="pt-2">
              <span
                className={`inline-block rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                  evidence === "research"
                    ? "border-[#9ad9c1] bg-[#ecfdf6] text-[#047857]"
                    : "border-[#f3cd86] bg-[#fff7e8] text-[#9a5a00]"
                }`}
              >
                {evidence === "research"
                  ? t.result.evidenceResearch
                  : t.result.evidenceApproximated}
              </span>
            </div>
          </Panel>

          {/* Section 8: How the score is calculated */}
          <Panel label={t.result.howCalculatedLabel}>
            <p className="text-sm leading-relaxed text-[#5b5148]">
              {t.result.howCalculatedExplanation}
            </p>
            <div className="pt-3">
              <BellCurve
                score={result.score}
                label={`${t.metric[metricKey]} — ${t.result.metricDistribution}`}
              />
            </div>
          </Panel>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-3 text-center text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md">
      <p className="text-[10px] font-medium uppercase tracking-widest text-[#5b5148]">
        {label}
      </p>
      <p className="break-words pt-1 text-sm font-semibold tabular-nums text-[#241f1a]">
        {value}
      </p>
    </div>
  );
}

function PercentileLine({
  metricKey,
  raw,
  confidence,
}: {
  metricKey: MetricKey;
  raw: number;
  confidence?: number;
}) {
  const { t } = useT();
  const pct = metricPercentile(metricKey, raw);
  const display =
    pct >= 50
      ? t.result.populationPercentileLine.replace(
          "{pct}",
          (100 - pct).toFixed(1),
        )
      : `Bottom ${pct.toFixed(1)}%`;
  const c = Math.max(0, Math.min(1, confidence ?? 1));
  const confTone =
    c >= 0.75
      ? "text-[#047857]"
      : c >= 0.45
        ? "text-[#9a5a00]"
        : "text-[#b42318]";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#241f1a]/10 bg-white/50 px-3 py-2 text-[11px] text-[#241f1a] backdrop-blur-md">
      <span
        title={t.result.percentileTooltip}
        className="min-w-0 cursor-help font-medium text-[#5b43ad]"
      >
        {display}
      </span>
      <span
        title={t.result.confidenceTooltip}
        aria-label={t.result.confidenceTooltip}
        className={`cursor-help tabular-nums font-medium ${confTone}`}
      >
        {Math.round(c * 100)}% <span className="text-[#5b5148]">conf</span>
      </span>
    </div>
  );
}

function Panel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-4 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-[#3f6268]">
        {label}
      </h4>
      <div>{children}</div>
    </section>
  );
}
