"use client";

import type { ComponentType } from "react";
import { Ban, Eye, Focus, Sun } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ScanFaceHologram } from "./ScanFaceHologram";
import { ScanProgressRing } from "./ScanProgressRing";

interface ScanCockpitCardProps {
  /**
   * Phase 191 — `metrics` is now optional. The component used to render
   * a fake hardcoded grid (sharpness 92%, light 86%, headAngle 2°,
   * quality "good") on every scan regardless of the input photo. When
   * the caller doesn't have a real measurement yet, pass `null` and the
   * card renders only the progress ring + ETA — no fabricated trust
   * signals.
   */
  metrics: {
    sharpness: number;
    light: number;
    headAngle: number;
    qualityLabel: string;
    qualityTone: "good" | "warn" | "bad";
  } | null;
  progressPct: number;
  etaSeconds: number;
  onCancel: () => void;
}

export function ScanCockpitCard({
  metrics,
  progressPct,
  etaSeconds,
  onCancel,
}: ScanCockpitCardProps) {
  const { t } = useT();
  const eta = etaSeconds.toString().padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-white/60 bg-white/55 shadow-[0_20px_60px_-48px_rgba(36,31,26,0.38)] backdrop-blur-md">
        <div className="relative overflow-hidden rounded-[1.5rem]">
          <div className="relative space-y-5 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#0f6f7f]/20 bg-[#eff8f8]/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0f6f7f] backdrop-blur-md">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-[#0f6f7f]"
                />
                {t.scanCockpit.inProgress}
              </div>
            </div>
            <div
              className={
                metrics
                  ? "grid gap-5 md:grid-cols-[190px_minmax(220px,1fr)_150px] md:items-center lg:gap-4"
                  : "grid gap-5 md:grid-cols-[minmax(220px,1fr)_180px] md:items-center lg:gap-4"
              }
            >
              {metrics && (
                <div className="space-y-3">
                  <MetricRow
                    label={t.scanCockpit.metrics.sharpness}
                    value={`${metrics.sharpness}%`}
                    pct={metrics.sharpness}
                  />
                  <MetricRow
                    label={t.scanCockpit.metrics.light}
                    value={`${metrics.light}%`}
                    pct={metrics.light}
                  />
                  <MetricRow
                    label={t.scanCockpit.metrics.headAngle}
                    value={`${metrics.headAngle}°`}
                    pct={100 - Math.min(100, Math.abs(metrics.headAngle) * 8)}
                  />
                  <MetricRow
                    label={t.scanCockpit.metrics.quality}
                    value={metrics.qualityLabel}
                    tone={metrics.qualityTone}
                  />
                </div>
              )}

              <div className="flex items-center justify-center">
                <ScanFaceHologram size={metrics ? 300 : 340} />
              </div>

              <div className="flex flex-col items-center gap-4 text-center">
                <ScanProgressRing value={progressPct} size={metrics ? 148 : 168} />
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5b5148]">
                    {t.scanCockpit.progress.etaLabel}
                  </p>
                  <p className="font-serif text-4xl font-light italic text-[#241f1a] tabular-nums">
                    00:{eta}
                  </p>
                  <p className="text-xs font-medium text-[#4f4841]">
                    {t.scanCockpit.progress.unit}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/40 p-3 backdrop-blur-md">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0f6f7f]">
                {t.scanCockpit.bestPractices.header}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <PracticeChip icon={Eye} label={t.scanCockpit.bestPractices.a} />
                <PracticeChip icon={Sun} label={t.scanCockpit.bestPractices.b} />
                <PracticeChip icon={Ban} label={t.scanCockpit.bestPractices.c} />
                <PracticeChip
                  icon={Focus}
                  label={t.scanCockpit.bestPractices.d}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-full border border-white/60 bg-white/50 px-5 py-2 text-sm font-semibold text-[#3d3731] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.35)] backdrop-blur-md transition hover:border-[#0f6f7f]/30 hover:bg-[#eff8f8]/70 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f7f]/35"
        >
          {t.scanCockpit.cancel}
        </button>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct?: number;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/40 p-3.5 backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5b5148]">
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        {tone ? (
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${toneClass(
              tone
            )}`}
          >
            {value}
          </span>
        ) : (
          <p className="font-serif text-3xl font-light italic leading-none text-[#241f1a] tabular-nums">
            {value}
          </p>
        )}
      </div>
      {pct !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0f6f7f] to-[#047857]"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PracticeChip({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/45 px-3 py-2 backdrop-blur-md">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#eff8f8]/70 text-[#0f6f7f]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-xs font-medium leading-snug text-[#3d3731]">
        {label}
      </span>
    </div>
  );
}

function toneClass(tone: "good" | "warn" | "bad"): string {
  if (tone === "good") return "border-[#0f766e]/25 bg-[#ecfdf5] text-[#047857]";
  if (tone === "warn") return "border-[#b45309]/25 bg-[#fff7ed]/70 text-[#92400e]";
  return "border-[#b91c1c]/25 bg-[#fef2f2] text-[#991b1b]";
}
