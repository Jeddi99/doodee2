"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import { Info, ScanFace } from "lucide-react";
import type { ScanRecord } from "@/lib/scan-history";
import { useT } from "@/lib/i18n";

export type HistoryRange = "7d" | "30d" | "90d" | "all";

interface HistoryTrendCardProps {
  records: ScanRecord[];
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
}

interface ChartPoint {
  record: ScanRecord;
  value: number;
  x: number;
  y: number;
}

const VIEWBOX = { width: 720, height: 260, padX: 54, padY: 30 };
const Y_TICKS = [25, 50, 75, 100] as const;
const RANGES: HistoryRange[] = ["7d", "30d", "90d", "all"];

function score100(value: number): number {
  return Math.max(0, Math.min(100, value * 10));
}

function formatDate(ts: number, lang: "th" | "en"): string {
  return new Date(ts).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
  });
}

function yFor(value: number): number {
  const { height, padY } = VIEWBOX;
  return padY + (1 - value / 100) * (height - padY * 2);
}

function pointsToPath(points: ChartPoint[]): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");
}

function tickIndexes(length: number): number[] {
  if (length <= 1) return [0];
  const indexes = new Set<number>([
    0,
    Math.floor((length - 1) / 3),
    Math.floor(((length - 1) * 2) / 3),
    length - 1,
  ]);
  return [...indexes].sort((a, b) => a - b);
}

export function HistoryTrendCard({
  records,
  range,
  onRangeChange,
}: HistoryTrendCardProps) {
  const { t, lang } = useT();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chronological = useMemo(
    () => [...records].sort((a, b) => a.timestamp - b.timestamp),
    [records]
  );
  const points = useMemo<ChartPoint[]>(() => {
    const { width, height, padX, padY } = VIEWBOX;
    const usableW = width - padX * 2;
    return chronological.map((record, index) => {
      const value = score100(record.overall);
      const x =
        chronological.length <= 1
          ? width / 2
          : padX + (index * usableW) / (chronological.length - 1);
      const y = padY + (1 - value / 100) * (height - padY * 2);
      return { record, value, x, y };
    });
  }, [chronological]);

  const { average, linePath, areaPath } = useMemo(() => {
    const path = pointsToPath(points);
    return {
      average:
        points.length > 0
          ? points.reduce((sum, point) => sum + point.value, 0) / points.length
          : 0,
      linePath: path,
      areaPath:
        points.length > 0
          ? `${path} L ${points[points.length - 1]!.x.toFixed(1)} ${
              VIEWBOX.height - VIEWBOX.padY
            } L ${points[0]!.x.toFixed(1)} ${VIEWBOX.height - VIEWBOX.padY} Z`
          : "",
    };
  }, [points]);
  const activePoint =
    activeIndex !== null && points[activeIndex] ? points[activeIndex] : null;

  // Phase 192g // rAF-throttle mousemove so 60+fps cursor events don't trigger full chart re-renders
  const rafRef = useRef<number | null>(null);
  const pendingClientX = useRef<number>(0);
  const pendingRect = useRef<DOMRect | null>(null);
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const handleMove = useCallback(
    (event: MouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
      if (points.length === 0) return;
      const clientX = "touches" in event ? event.touches[0]!.clientX : event.clientX;
      pendingClientX.current = clientX;
      pendingRect.current = event.currentTarget.getBoundingClientRect();
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const rect = pendingRect.current;
        if (!rect) return;
        const ratio = (pendingClientX.current - rect.left) / rect.width;
        const x = ratio * VIEWBOX.width;
        let nearest = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < points.length; i += 1) {
          const distance = Math.abs(points[i]!.x - x);
          if (distance < bestDistance) {
            nearest = i;
            bestDistance = distance;
          }
        }
        // skip setState if unchanged — prevents redundant chart reconciliation
        setActiveIndex((prev) => (prev === nearest ? prev : nearest));
      });
    },
    [points]
  );

  const handleLeave = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setActiveIndex(null);
  }, []);

  const handleFocus = useCallback(() => {
    setActiveIndex(points.length - 1);
  }, [points.length]);

  return (
    <section className="min-w-0 rounded-3xl border border-white/60 bg-white/45 p-4 shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md md:p-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#241f1a]">
              {t.historyDashboard.trend.title}
            </h2>
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#241f1a]/10 text-[#8f8379]"
              title={t.historyDashboard.trend.info}
            >
              <Info className="h-3 w-3" />
            </span>
          </div>
          <p className="mt-1 text-xs text-[#625a52]">
            {t.historyDashboard.trend.info}
          </p>
        </div>
        <div className="no-scrollbar flex max-w-full overflow-x-auto overscroll-x-contain rounded-full border border-white/60 bg-white/40 p-1 backdrop-blur">
          {RANGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onRangeChange(item)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50 ${
                range === item
                  ? "bg-[#241f1a] text-white"
                  : "text-[#625a52] hover:text-[#241f1a]"
              }`}
            >
              {t.historyDashboard.trend.ranges[item]}
            </button>
          ))}
        </div>
      </div>

      {points.length < 1 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/60 bg-white/35 p-6 text-center backdrop-blur">
          <p className="text-sm text-[#625a52]">
            {t.historyDashboard.trend.empty}
          </p>
          <Link
            href={"/scan" as never}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#241f1a] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
          >
            <ScanFace className="h-3.5 w-3.5" />
            {t.historyDashboard.trend.scanCta}
          </Link>
        </div>
      ) : (
        <div className="relative mt-5 min-w-0">
          <svg
            viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
            className="h-[270px] w-full overflow-hidden"
            role="img"
            aria-label={t.historyDashboard.trend.title}
            onMouseMove={handleMove}
            onTouchMove={handleMove}
            onTouchStart={handleMove}
            onMouseLeave={handleLeave}
            onTouchEnd={handleLeave}
            onFocus={handleFocus}
          >
            <defs>
              <linearGradient id="history-trend-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(122,91,214,0.18)" />
                <stop offset="100%" stopColor="rgba(122,91,214,0)" />
              </linearGradient>
            </defs>
            <TrendStaticLayer
              points={points}
              areaPath={areaPath}
              linePath={linePath}
              lang={lang}
            />
            {/* Phase 192g // dynamic active-dot overlay separated so only this reconciles on hover */}
            <TrendActiveOverlay activePoint={activePoint} />
          </svg>
          {activePoint && (
            <div
              className="pointer-events-none absolute w-max max-w-[calc(100%-1rem)] rounded-xl border border-white/60 bg-white/60 px-3 py-2 text-xs shadow-[0_18px_40px_-30px_rgba(36,31,26,0.45)] backdrop-blur-md"
              style={{
                left: `${Math.max(8, Math.min(92, (activePoint.x / VIEWBOX.width) * 100))}%`,
                top: `${(activePoint.y / VIEWBOX.height) * 100}%`,
                transform: "translate(-50%, calc(-100% - 12px))",
              }}
            >
              <p className="text-[#7c746d]">
                {formatDate(activePoint.record.timestamp, lang)}
              </p>
              <p className="mt-0.5 font-serif text-2xl font-light italic leading-none text-[#241f1a] tabular-nums">
                {activePoint.value.toFixed(1)}
                <span className="ml-1 text-xs text-[#8f8379]">/100</span>
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#7a5bd6]/20 bg-[#f6f1ff] px-3 py-1 text-[#6f4fc8]">
          <span className="h-2 w-2 rounded-full bg-[#7a5bd6]" />
          {t.historyDashboard.trend.legendScore}
        </div>
        <p className="text-[#625a52]">
          {t.historyDashboard.trend.average.replace(
            "{value}",
            average.toFixed(1)
          )}
        </p>
      </div>
    </section>
  );
}

// Phase 192g // static SVG layer: rings, axis labels, line, base dots, x-tick labels — only re-renders when points change
interface TrendStaticLayerProps {
  points: ChartPoint[];
  areaPath: string;
  linePath: string;
  lang: "th" | "en";
}

const TrendStaticLayer = memo(function TrendStaticLayer({
  points,
  areaPath,
  linePath,
  lang,
}: TrendStaticLayerProps) {
  const lastIndex = points.length - 1;
  return (
    <>
      {Y_TICKS.map((tick) => (
        <g key={tick}>
          <line
            x1={VIEWBOX.padX}
            x2={VIEWBOX.width - VIEWBOX.padX}
            y1={yFor(tick)}
            y2={yFor(tick)}
            stroke="rgba(36,31,26,0.10)"
            strokeDasharray="4 8"
          />
          <text
            x={VIEWBOX.padX - 14}
            y={yFor(tick) + 4}
            textAnchor="end"
            className="fill-[#8f8379] text-[10px] tabular-nums"
          >
            {tick}
          </text>
        </g>
      ))}
      {areaPath && <path d={areaPath} fill="url(#history-trend-area)" />}
      {linePath && (
        <>
          <path
            d={linePath}
            fill="none"
            stroke="rgba(122,91,214,0.18)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={linePath}
            fill="none"
            stroke="rgba(122,91,214,0.82)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {points.map((point, index) => {
        const isLast = index === lastIndex;
        return (
          <circle
            key={point.record.timestamp}
            cx={point.x}
            cy={point.y}
            r={isLast ? 5 : 3}
            fill={isLast ? "#06b6d4" : "#7a5bd6"}
            stroke="var(--history-trend-dot-stroke, rgba(255,255,255,0.85))"
            strokeWidth={isLast ? 1 : 0}
          />
        );
      })}
      {tickIndexes(points.length).map((index) => {
        const point = points[index]!;
        return (
          <text
            key={point.record.timestamp}
            x={point.x}
            y={VIEWBOX.height - 5}
            textAnchor="middle"
            className="fill-[#8f8379] text-[10px]"
          >
            {formatDate(point.record.timestamp, lang)}
          </text>
        );
      })}
    </>
  );
});

// Phase 192g // dynamic overlay: only this re-renders on hover
const TrendActiveOverlay = memo(function TrendActiveOverlay({
  activePoint,
}: {
  activePoint: ChartPoint | null;
}) {
  if (!activePoint) return null;
  return (
    <g>
      <line
        x1={activePoint.x}
        x2={activePoint.x}
        y1={VIEWBOX.padY}
        y2={VIEWBOX.height - VIEWBOX.padY}
        stroke="rgba(6,182,212,0.45)"
        strokeDasharray="4 6"
      />
      <circle
        cx={activePoint.x}
        cy={activePoint.y}
        r={7}
        fill="rgba(6,182,212,0.16)"
        stroke="rgba(6,182,212,0.85)"
      />
    </g>
  );
});
