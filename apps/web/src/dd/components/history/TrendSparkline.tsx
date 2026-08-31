"use client";

import type { ScanRecord } from "@/lib/scan-history";
import { useT } from "@/lib/i18n";

interface TrendSparklineProps {
  history: ScanRecord[];
}

// Builds an SVG path string from N points evenly spaced on x, scaled
// vertically to [0..10] => [h-pad..pad]. Drops the leading "M" only when
// concatenating; this returns a complete d="..." value.
function buildPath(values: number[], w: number, h: number, pad: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) {
    const y = pad + (1 - (values[0]! / 10)) * (h - pad * 2);
    return `M ${pad} ${y} L ${w - pad} ${y}`;
  }
  const stepX = (w - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - v / 10) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TrendSparkline({ history }: TrendSparklineProps) {
  const { t } = useT();
  const W = 280;
  const H = 80;
  const PAD = 8;

  if (history.length < 2) {
    return (
      <div className="rounded-2xl border border-white/60 bg-white/45 p-4 backdrop-blur-md">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#8f8379]">
          {t.history.trendLabel}
        </p>
        <p className="mt-2 text-xs text-[#625a52]">{t.history.trendEmpty}</p>
      </div>
    );
  }

  // history is newest-first; reverse to oldest-first for left-to-right reading
  const chronological = [...history].slice(0, 12).reverse();
  const values = chronological.map((r) => r.overall);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const delta = last - first;
  // Phase 92: find peak index for "best" marker. If multiple ties, the
  // most-recent peak wins so the marker stays close to "now" thinking.
  let peakIdx = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i]! >= values[peakIdx]!) peakIdx = i;
  }
  const isLastPeak = peakIdx === values.length - 1;
  const deltaTone =
    delta > 0.05 ? "text-good" : delta < -0.05 ? "text-warn" : "text-[#8f8379]";
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "−" : "±";

  const linePath = buildPath(values, W, H, PAD);
  const areaPath = `${linePath} L ${W - PAD} ${H - PAD} L ${PAD} ${H - PAD} Z`;

  return (
    <div className="space-y-3 rounded-2xl border border-white/60 bg-white/45 p-4 backdrop-blur-md">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#8f8379]">
          {t.history.trendLabel}
        </p>
        <p className={`text-xs tabular-nums font-medium ${deltaTone}`}>
          {deltaSign}
          {Math.abs(delta).toFixed(2)}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        aria-label="Score trend"
      >
        <defs>
          <linearGradient id="spark-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(122,91,214,0.18)" />
            <stop offset="100%" stopColor="rgba(122,91,214,0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#spark-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="rgba(122,91,214,0.82)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {values.map((v, i) => {
          const x =
            PAD + (i * (W - PAD * 2)) / Math.max(values.length - 1, 1);
          const y = PAD + (1 - v / 10) * (H - PAD * 2);
          const isLast = i === values.length - 1;
          const isPeak = i === peakIdx && !isLast;
          return (
            <g key={i}>
              {/* Phase 92: a soft marker around the peak point. */}
              {isPeak && (
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill="rgba(16,185,129,0.18)"
                  stroke="rgba(16,185,129,0.5)"
                  strokeWidth={1}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={isLast ? 3 : isPeak ? 2.4 : 1.6}
                fill={
                  isLast
                    ? "#06b6d4"
                    : isPeak
                      ? "#10b981"
                      : "rgba(122,91,214,0.82)"
                }
              />
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[10px] tabular-nums text-[#8f8379]">
        <span>{min.toFixed(1)}</span>
        {/* Phase 92: small inline legend for the green peak marker */}
        {!isLastPeak && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="block h-1.5 w-1.5 rounded-full bg-good" />
            {t.history.bestLabel} {values[peakIdx]!.toFixed(1)}
          </span>
        )}
        <span>{max.toFixed(1)}</span>
      </div>
    </div>
  );
}
