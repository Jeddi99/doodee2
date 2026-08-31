"use client";

import { memo, useCallback, useMemo } from "react";
import Image from "next/image";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Copy,
  Loader2,
  Minus,
  Share2,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ScanRecord } from "@/lib/scan-history";
import { useT } from "@/lib/i18n";

interface HistoryRecentListProps {
  records: ScanRecord[];
  compareMode: boolean;
  selected: number[];
  shareToastTs: number | null;
  sharePendingTs: number | null;
  copyPendingTs: number | null;
  onOpen: (record: ScanRecord) => void;
  onSelect: (timestamp: number) => void;
  onShare: (record: ScanRecord) => void;
  onCopy: (record: ScanRecord) => void;
  onDelete: (timestamp: number) => void;
  onShowAll: () => void;
}

interface ActionButtonProps {
  label: string;
  icon: LucideIcon;
  tone: "violet" | "cyan" | "bad" | "good";
  onClick: () => void;
  busy?: boolean;
}

function score100(value: number): number {
  return Math.max(0, Math.min(100, value * 10));
}

function formatScore(value: number): string {
  return score100(value).toFixed(1);
}

function formatDate(ts: number, lang: "th" | "en"): string {
  return new Date(ts).toLocaleString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function journalDayLabel(record: ScanRecord, records: ScanRecord[]): string {
  const oldest = records.reduce(
    (min, item) => Math.min(min, item.timestamp),
    record.timestamp
  );
  const day = Math.floor((record.timestamp - oldest) / 86400000) + 1;
  if (day >= 30) return "Day 30";
  if (day >= 7) return "Day 7";
  return "Day 1";
}

function diffLabel(diff: number | null): string {
  if (diff === null || Math.abs(diff) < 0.5) return "0.0";
  const sign = diff > 0 ? "+" : "-";
  return `${sign}${Math.abs(diff).toFixed(1)}`;
}

function diffTone(diff: number | null): string {
  if (diff === null || Math.abs(diff) < 0.5) {
    return "history-diff-neutral";
  }
  return diff > 0
    ? "border-good/30 bg-good/[0.08] text-good"
    : "border-warn/30 bg-warn/[0.08] text-warn";
}

// Phase 192s // directional glyph paired with the delta pill for at-a-glance trend
function diffIcon(diff: number | null): LucideIcon {
  if (diff === null || Math.abs(diff) < 0.5) return Minus;
  return diff > 0 ? ArrowUpRight : ArrowDownRight;
}

function qualityKey(record: ScanRecord): "excellent" | "good" | "fair" {
  if (record.quality?.overall === "bad") return "fair";
  if (record.quality?.overall === "warn") return "good";
  const value = score100(record.overall);
  if (value >= 80) return "excellent";
  if (value >= 65) return "good";
  return "fair";
}

function qualityTone(key: "excellent" | "good" | "fair"): string {
  if (key === "excellent") return "text-good";
  if (key === "good") return "text-cyan";
  return "text-warn";
}

function actionTone(tone: ActionButtonProps["tone"]): string {
  if (tone === "good") return "border-good/35 bg-good/[0.08] text-good";
  if (tone === "cyan") {
    return "border-cyan/30 text-cyan hover:border-cyan/50 hover:bg-cyan/[0.08]";
  }
  if (tone === "bad") {
    return "border-bad/30 text-bad hover:border-bad/50 hover:bg-bad/[0.08]";
  }
  return "border-violet/30 text-violet hover:border-violet/50 hover:bg-violet/[0.08]";
}

function ActionButton({ label, icon, tone, onClick, busy }: ActionButtonProps) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={busy}
      aria-busy={busy ? "true" : undefined}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-xl border bg-white/45 shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition-[transform,background-color,border-color] duration-200 active:scale-[0.92] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 ${actionTone(
        tone
      )}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
    </button>
  );
}

function Avatar({ record }: { record: ScanRecord }) {
  return (
    <div className="relative h-12 w-12 flex-none overflow-hidden rounded-2xl border border-white/60 bg-white/35 backdrop-blur">
      {record.photoDataUrl ? (
        <Image
          src={record.photoDataUrl}
          alt=""
          fill
          unoptimized
          sizes="48px"
          className="object-cover transition-transform duration-200 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-serif text-base italic text-[#625a52]">
          D
        </div>
      )}
    </div>
  );
}

interface HistoryRowProps {
  record: ScanRecord;
  previous: ScanRecord | null;
  selectedRow: boolean;
  compareMode: boolean;
  sharedJustNow: boolean;
  sharePending: boolean;
  copyPending: boolean;
  lang: "th" | "en";
  rowLabels: {
    frontSide: string;
    frontOnly: string;
    normal: string;
    quality: { excellent: string; good: string; fair: string };
    actions: {
      share: string;
      copy: string;
      delete: string;
    };
  };
  calibrationGender: string;
  journalLabel: string;
  onSelect: (timestamp: number) => void;
  onOpen: (record: ScanRecord) => void;
  onShare: (record: ScanRecord) => void;
  onCopy: (record: ScanRecord) => void;
  onDelete: (timestamp: number) => void;
}

// Phase 192g // row extracted + memoized so a single row's hover/select doesn't re-render every sibling
const HistoryRow = memo(function HistoryRow({
  record,
  previous,
  selectedRow,
  compareMode,
  sharedJustNow,
  sharePending,
  copyPending,
  lang,
  rowLabels,
  calibrationGender,
  journalLabel,
  onSelect,
  onOpen,
  onShare,
  onCopy,
  onDelete,
}: HistoryRowProps) {
  const diff = previous
    ? score100(record.overall) - score100(previous.overall)
    : null;
  const quality = qualityKey(record);
  const rowTitle = formatDate(record.timestamp, lang);

  const handleClick = useCallback(() => {
    if (compareMode) onSelect(record.timestamp);
    else onOpen(record);
  }, [compareMode, onSelect, onOpen, record]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (compareMode) onSelect(record.timestamp);
      else onOpen(record);
    },
    [compareMode, onSelect, onOpen, record]
  );

  const handleShare = useCallback(() => onShare(record), [onShare, record]);
  const handleCopy = useCallback(() => onCopy(record), [onCopy, record]);
  const handleDelete = useCallback(
    () => onDelete(record.timestamp),
    [onDelete, record.timestamp]
  );

  const DiffIcon = diffIcon(diff);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={
        compareMode
          ? lang === "th"
            ? `เลือก ${rowTitle} เพื่อเปรียบเทียบ`
            : `Select ${rowTitle} for comparison`
          : lang === "th"
            ? `ดูรายละเอียด ${rowTitle}`
            : `View details for ${rowTitle}`
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`group min-h-[44px] min-w-0 rounded-2xl border p-3 backdrop-blur transition-[transform,background-color,border-color] duration-200 hover:bg-white/65 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 ${
        selectedRow
          ? "border-[#7a5bd6]/35 bg-white/65 shadow-[0_16px_42px_-36px_rgba(122,91,214,0.45)]"
          : "border-white/60 bg-white/45"
      }`}
    >
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1.25fr)_auto_auto_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar record={record} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#241f1a]">
              {rowTitle}
            </p>
            <p className="mt-0.5 text-xs text-[#7c746d]">
              <span className="mr-1.5 rounded-full border border-[#7a5bd6]/20 bg-[#f6f1ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6f4fc8]">
                {journalLabel}
              </span>
              {record.views.side ? rowLabels.frontSide : rowLabels.frontOnly}
              {" / "}
              {rowLabels.normal}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-end justify-between gap-3 md:block md:text-right">
          <p className="font-serif text-3xl font-light italic leading-none text-[#241f1a] tabular-nums">
            {formatScore(record.overall)}
            <span className="ml-1 text-xs text-[#8f8379]">/100</span>
          </p>
          <span
            className={`mt-1 inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums ${diffTone(
              diff
            )}`}
          >
            <DiffIcon className="h-3 w-3" />
            {diffLabel(diff)}
          </span>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 md:block md:min-w-[92px]">
          <p className="inline-flex items-center gap-1.5 text-xs text-[#7c746d] md:justify-end">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className={qualityTone(quality)}>
              {rowLabels.quality[quality]}
            </span>
          </p>
          <p className="mt-1 min-w-0 text-xs text-[#8f8379] md:text-right">
            {calibrationGender}
          </p>
        </div>

        {!compareMode && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
            <ActionButton
              label={rowLabels.actions.share}
              icon={sharedJustNow ? Check : Share2}
              tone={sharedJustNow ? "good" : "violet"}
              onClick={handleShare}
              busy={sharePending}
            />
            <ActionButton
              label={rowLabels.actions.copy}
              icon={Copy}
              tone="cyan"
              onClick={handleCopy}
              busy={copyPending}
            />
            <ActionButton
              label={rowLabels.actions.delete}
              icon={Trash2}
              tone="bad"
              onClick={handleDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export function HistoryRecentList({
  records,
  compareMode,
  selected,
  shareToastTs,
  sharePendingTs,
  copyPendingTs,
  onOpen,
  onSelect,
  onShare,
  onCopy,
  onDelete,
  onShowAll,
}: HistoryRecentListProps) {
  const { t, lang } = useT();
  const visible = records.slice(0, 6);
  const hasMore = records.length > visible.length;
  const rowLabels = useMemo(
    () => ({
      frontSide: t.historyDashboard.recent.frontSide,
      frontOnly: t.historyDashboard.recent.frontOnly,
      normal: t.historyDashboard.recent.normal,
      quality: t.historyDashboard.recent.quality,
      actions: t.historyDashboard.recent.actions,
    }),
    [
      t.historyDashboard.recent.actions,
      t.historyDashboard.recent.frontOnly,
      t.historyDashboard.recent.frontSide,
      t.historyDashboard.recent.normal,
      t.historyDashboard.recent.quality,
    ]
  );

  return (
    <section className="min-w-0 rounded-3xl border border-white/60 bg-white/45 p-4 shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md md:p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-light italic text-[#241f1a]">
            {t.historyDashboard.recent.title}
          </h2>
          <p className="mt-1 text-xs text-[#625a52]">
            {t.historyDashboard.recent.subtitle}
          </p>
        </div>
        {compareMode && (
          <span className="rounded-full border border-[#7a5bd6]/25 bg-[#f6f1ff] px-3 py-1 text-[11px] text-[#6f4fc8]">
            {t.history.comparePrompt.replace("{n}", selected.length.toString())}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {visible.map((record, index) => {
          const previous = records[index + 1] ?? null;
          const selectedRow = selected.includes(record.timestamp);
          const label = journalDayLabel(record, records);
          return (
            <HistoryRow
              key={record.timestamp}
              record={record}
              previous={previous}
              selectedRow={selectedRow}
              compareMode={compareMode}
              sharedJustNow={shareToastTs === record.timestamp}
              sharePending={sharePendingTs === record.timestamp}
              copyPending={copyPendingTs === record.timestamp}
              lang={lang}
              rowLabels={rowLabels}
              calibrationGender={t.calibration[record.options.gender]}
              journalLabel={label}
              onSelect={onSelect}
              onOpen={onOpen}
              onShare={onShare}
              onCopy={onCopy}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-white/60 bg-white/35 p-6 text-center text-sm text-[#625a52] backdrop-blur">
          {t.historyDashboard.recent.empty}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-medium text-[#4f4740] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition-[transform,background-color,color] duration-200 hover:bg-white/65 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
        >
          {t.historyDashboard.recent.viewAll}
        </button>
      )}
    </section>
  );
}
