"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Download,
  GitCompare,
  History as HistoryIcon,
  Link2,
  Loader2,
  RefreshCw,
  ScanFace,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import {
  clearHistory,
  deleteScan,
  importHistory,
  loadHistory,
  type ScanRecord,
} from "@/lib/scan-history";
import { encodeShare, shareUrl, toSharedScan, type SharedScan } from "@/lib/share-link";
import { useT } from "@/lib/i18n";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { SavedPreviewsPanel } from "@/components/results/SavedPreviewsPanel";
import { CompareDialog } from "./CompareDialog";
import { HistoryBestScanCard } from "./HistoryBestScanCard";
import { HistoryCompareCTA } from "./HistoryCompareCTA";
import { HistoryRecentList } from "./HistoryRecentList";
import { HistoryStatsRow } from "./HistoryStatsRow";
import type { HistoryRange } from "./HistoryTrendCard";
import { PasteShareDialog } from "./PasteShareDialog";
import { ScanDetailDialog } from "./ScanDetailDialog";
import { trackProductEvent } from "@/lib/product-events";

// Phase 192p — Defer below-fold chart components. Both are SVG charts
// that sit below the StatsRow / inside the sidebar aside; deferring
// them via next/dynamic({ ssr: false }) cuts the initial /history JS
// bundle by ~5.5KB gzipped each + skips their useMemo geometry passes
// until they actually mount.
const HistoryTrendCard = dynamic(
  () => import("./HistoryTrendCard").then((m) => m.HistoryTrendCard),
  { ssr: false, loading: () => null }
);
const HistoryRadarCard = dynamic(
  () => import("./HistoryRadarCard").then((m) => m.HistoryRadarCard),
  { ssr: false, loading: () => null }
);

// Phase 192k // url-driven tabs so /history?tab=previews is shareable and
// survives refresh. Default tab = "scans" preserves prior behavior for
// users hitting /history with no query string.
type HistoryTab = "scans" | "previews";

function exportHistory(history: ScanRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    const blob = new Blob([JSON.stringify(history, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `doodee-history-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch {
    return;
  }
}

function sortNewestFirst(history: ScanRecord[]): ScanRecord[] {
  return [...history].sort((a, b) => b.timestamp - a.timestamp);
}

function filterByRange(history: ScanRecord[], range: HistoryRange): ScanRecord[] {
  if (range === "all") return history;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((record) => record.timestamp >= cutoff);
}

function bestScan(history: ScanRecord[]): ScanRecord | null {
  if (history.length === 0) return null;
  return history.reduce((best, record) =>
    record.overall > best.overall ? record : best
  );
}

export function HistoryPage() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [range, setRange] = useState<HistoryRange>("all");
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [externalCompareScan, setExternalCompareScan] =
    useState<ScanRecord | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [shareToastTs, setShareToastTs] = useState<number | null>(null);
  const [sharePendingTs, setSharePendingTs] = useState<number | null>(null);
  const [copyPendingTs, setCopyPendingTs] = useState<number | null>(null);
  const [detailRecord, setDetailRecord] = useState<ScanRecord | null>(null);
  const [importToast, setImportToast] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Phase 192k // sync the active tab from `?tab=` so reload + share work.
  // Falls back to "scans" for any unrecognized value so a stale link to a
  // future tab name doesn't blank the page.
  const tabParam = searchParams?.get("tab");
  const activeTab: HistoryTab = tabParam === "previews" ? "previews" : "scans";

  function setActiveTab(next: HistoryTab) {
    if (next === activeTab) return;
    // Phase 192k // scroll: false keeps the user's scroll position when
    // switching tabs — without it Next.js scrolls to top on every nav.
    const href = next === "previews" ? "/history?tab=previews" : "/history";
    router.replace(href as never, { scroll: false });
  }

  useEffect(() => {
    setHistory(sortNewestFirst(loadHistory()));
  }, []);

  useEffect(() => {
    if (activeTab !== "scans") return;
    void trackProductEvent("journal_viewed", {
      source: "history",
      dayLabel: "other",
    });
  }, [activeTab]);

  const { pullPx, refreshing, willTrigger } = usePullToRefresh(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    setHistory(sortNewestFirst(loadHistory()));
  });

  const filteredHistory = useMemo(
    () => filterByRange(history, range),
    [history, range]
  );
  const latestRecord = history[0] ?? null;
  const bestRecord = useMemo(() => bestScan(history), [history]);
  // Phase 192g // memoize selected lookup so 60fps pull-to-refresh ticks don't re-filter history
  const selectedRecords = useMemo(
    () =>
      selected
        .map((timestamp) => history.find((record) => record.timestamp === timestamp))
        .filter((record): record is ScanRecord => Boolean(record)),
    [selected, history]
  );
  const compareEarlier =
    externalCompareScan && selectedRecords[0]
      ? selectedRecords[0]
      : selectedRecords[0] ?? null;
  const compareLater = externalCompareScan
    ? externalCompareScan
    : selectedRecords[1] ?? null;

  function refreshHistory(next?: ScanRecord[]) {
    setHistory(sortNewestFirst(next ?? loadHistory()));
  }

  function handleImportHistory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        const result = importHistory(json);
        if (!result) {
          setImportToast(t.history.importErr);
        } else {
          setImportToast(
            t.history.importOk
              .replace("{added}", result.added.toString())
              .replace("{skipped}", result.skipped.toString())
          );
          refreshHistory();
        }
      } catch {
        setImportToast(t.history.importErr);
      } finally {
        setImporting(false);
        window.setTimeout(() => setImportToast(null), 2500);
      }
    };
    reader.onerror = () => {
      setImporting(false);
      setImportToast(t.history.importErr);
      window.setTimeout(() => setImportToast(null), 2500);
    };
    reader.readAsText(file);
  }

  // Phase 192g // useCallback so the share/copy props are reference-stable across renders
  const copyShareForRow = useCallback(async function copyShareForRow(
    record: ScanRecord,
    intent: "share" | "copy" = "share"
  ) {
    if (typeof window === "undefined") return;
    const setPending = intent === "copy" ? setCopyPendingTs : setSharePendingTs;
    setPending(record.timestamp);
    const shared = toSharedScan({
      overall: record.overall,
      tier: record.tier,
      categories: record.categories,
      options: record.options,
      timestamp: record.timestamp,
      ...(record.geometric !== undefined ? { geometric: record.geometric } : {}),
      ...(record.secondOpinion !== undefined
        ? { secondOpinion: record.secondOpinion }
        : {}),
      ...(record.learned !== undefined ? { learned: record.learned } : {}),
    });
    const url = shareUrl(window.location.origin, shared);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt(t.share.copyFallback, url);
      }
      setShareToastTs(record.timestamp);
      window.setTimeout(() => {
        setShareToastTs((current) =>
          current === record.timestamp ? null : current
        );
      }, 1800);
    } catch {
      return;
    } finally {
      setPending((current) => (current === record.timestamp ? null : current));
    }
  }, [t.share.copyFallback]);

  function handlePasted(record: ScanRecord, payload: string) {
    setPasteOpen(false);
    const aTs = history[0]?.timestamp;
    if (aTs) {
      router.push(`/history/compare?a=${aTs}&b=share&payload=${encodeURIComponent(payload)}` as never);
      return;
    }
    setExternalCompareScan(record);
    setCompareOpen(true);
  }

  function onClear() {
    clearHistory();
    refreshHistory([]);
    setSelected([]);
    setCompareMode(false);
  }

  // Phase 192g // stable callbacks so React.memo on HistoryRow can actually skip re-renders
  const onDelete = useCallback(
    (timestamp: number) => {
      if (typeof window !== "undefined" && !window.confirm(t.history.deleteConfirm)) {
        return;
      }
      const next = deleteScan(timestamp);
      refreshHistory(next);
      setSelected((current) => current.filter((item) => item !== timestamp));
    },
    [t.history.deleteConfirm]
  );

  // Phase 192g // stable toggleSelect for memoized HistoryRow
  const toggleSelect = useCallback((timestamp: number) => {
    setSelected((current) => {
      if (current.includes(timestamp)) {
        return current.filter((item) => item !== timestamp);
      }
      if (current.length >= 2) return [current[1]!, timestamp];
      return [...current, timestamp];
    });
  }, []);

  function exitCompareMode() {
    setCompareMode(false);
    setSelected([]);
  }

  function openCompareRoute() {
    if (selected.length === 2 && selected[0] && selected[1]) {
      router.push(`/history/compare?a=${selected[0]}&b=${selected[1]}` as never);
      return;
    }
    setCompareOpen(true);
  }

  // Phase 192g // CSS variable so pull-to-refresh's 60fps tick doesn't rebuild the style object
  const openPaste = useCallback(() => setPasteOpen(true), []);
  // Phase 192g // stable share/copy wrappers so memoized HistoryRow doesn't reconcile per render
  const handleRowShare = useCallback(
    (record: ScanRecord) => void copyShareForRow(record, "share"),
    [copyShareForRow]
  );
  const handleRowCopy = useCallback(
    (record: ScanRecord) => void copyShareForRow(record, "copy"),
    [copyShareForRow]
  );
  const handleShowAll = useCallback(() => setRange("all"), []);

  return (
    <article
      className="history-pull-root relative mx-auto w-full min-w-0 max-w-6xl space-y-4 overflow-x-hidden pb-[calc(var(--bottom-nav-clear)+5rem)] text-[#241f1a] sm:space-y-6 lg:overflow-visible lg:pb-0"
      style={
        {
          "--pull-y": pullPx > 0 ? `${pullPx}px` : "0px",
          transition:
            refreshing || pullPx === 0
              ? "transform 240ms cubic-bezier(0.16,1,0.3,1)"
              : undefined,
        } as React.CSSProperties
      }
    >
      {(pullPx > 0 || refreshing) && (
        <div
          className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 lg:hidden"
          style={{ opacity: Math.min(1, pullPx / 50) }}
          aria-live="polite"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/45 shadow-[0_14px_34px_-28px_rgba(36,31,26,0.45)] backdrop-blur-md">
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin text-violet" />
            ) : (
              <RefreshCw
                className={`h-4 w-4 transition-transform ${
                  willTrigger ? "rotate-180 text-[#7a5bd6]" : "text-[#625a52]"
                }`}
              />
            )}
          </div>
        </div>
      )}

      <header className="mx-auto max-w-3xl space-y-1.5 text-center sm:space-y-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#7a5bd6] sm:text-[10px] sm:tracking-[0.28em]">
          {activeTab === "previews"
            ? t.previewsHistory.eyebrow
            : t.historyDashboard.header.eyebrow}
        </p>
        <h1 className="font-serif text-[2.3rem] font-light italic leading-[0.95] text-[#241f1a] sm:text-5xl md:text-6xl">
          {activeTab === "previews"
            ? t.previewsHistory.title
            : t.historyDashboard.header.title}
        </h1>
        <p className="mx-auto max-w-[20rem] text-xs leading-snug text-[#625a52] sm:max-w-none sm:text-sm sm:leading-relaxed">
          {activeTab === "previews"
            ? t.previewsHistory.subtitle
            : t.historyDashboard.header.subtitle.replace(
                "{count}",
                history.length.toString()
              )}
        </p>
      </header>

      {/* Phase 192k // pill toggle between scans + procedure previews.
          Mirrors the surgery flow's recommend/browse pill so the
          interaction language is consistent across the app. */}
      <div className="flex min-w-0 justify-center">
        <div
          role="tablist"
          aria-label={t.historyDashboard.header.title}
          className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-full border border-white/60 bg-white/45 p-1 shadow-[0_14px_44px_-38px_rgba(36,31,26,0.42)] backdrop-blur-md"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "scans"}
            onClick={() => setActiveTab("scans")}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition ${
              activeTab === "scans"
                ? "bg-[#241f1a] text-white font-medium"
                : "text-[#625a52] hover:text-[#241f1a]"
            }`}
          >
            <HistoryIcon className="h-3 w-3" />
            {t.historyTabs.scans}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "previews"}
            onClick={() => setActiveTab("previews")}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition ${
              activeTab === "previews"
                ? "bg-[#241f1a] text-white font-medium"
                : "text-[#625a52] hover:text-[#241f1a]"
            }`}
          >
            <Wand2 className="h-3 w-3" />
            {t.historyTabs.previews}
          </button>
        </div>
      </div>

      {activeTab === "previews" ? (
        // Phase 192k // previews tab. SavedPreviewsPanel handles its own
        // empty state (Wand2 + CTA to /surgery) when 0 items stored.
        <SavedPreviewsPanel />
      ) : history.length === 0 ? (
        <HistoryEmptyState onPaste={openPaste} />
      ) : (
        <>
          <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-6 overflow-x-hidden lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-visible">
            <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden lg:overflow-visible">
              <HistoryStatsRow history={history} />
              <HistoryTrendCard
                records={filteredHistory}
                range={range}
                onRangeChange={setRange}
              />

              {compareMode && (
              <div className="min-w-0 rounded-2xl border border-white/60 bg-white/45 p-3 shadow-[0_14px_34px_-28px_rgba(36,31,26,0.3)] backdrop-blur-md">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-[#4f4740]">
                      {t.history.comparePrompt.replace(
                        "{n}",
                        selected.length.toString()
                      )}
                    </p>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={selected.length !== 2}
                        onClick={openCompareRoute}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#241f1a] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 disabled:pointer-events-none disabled:opacity-45"
                      >
                        <GitCompare className="h-3.5 w-3.5" />
                        {t.history.compare}
                      </button>
                      <button
                        type="button"
                        disabled={selected.length < 1}
                        onClick={() => setPasteOpen(true)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-3.5 py-2 text-xs font-medium text-[#6f4fc8] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 disabled:pointer-events-none disabled:opacity-45"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {t.history.compareWithLink}
                      </button>
                      <button
                        type="button"
                        onClick={exitCompareMode}
                        className="inline-flex min-h-[44px] items-center rounded-full border border-white/60 bg-white/45 px-3.5 py-2 text-xs font-medium text-[#625a52] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
                      >
                        {t.history.cancel}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <HistoryRecentList
                records={filteredHistory}
                compareMode={compareMode}
                selected={selected}
                shareToastTs={shareToastTs}
                sharePendingTs={sharePendingTs}
                copyPendingTs={copyPendingTs}
                onOpen={setDetailRecord}
                onSelect={toggleSelect}
                onShare={handleRowShare}
                onCopy={handleRowCopy}
                onDelete={onDelete}
                onShowAll={handleShowAll}
              />

              <HistoryDataTools
                history={history}
                importToast={importToast}
                importing={importing}
                onImport={handleImportHistory}
                onClear={onClear}
              />
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <HistoryRadarCard record={latestRecord} />
              <HistoryBestScanCard
                record={bestRecord}
                onOpen={setDetailRecord}
              />
              <HistoryCompareCTA
                history={history}
                onStart={() => setCompareMode(true)}
              />
            </aside>
          </div>
        </>
      )}

      <CompareDialog
        open={compareOpen}
        onOpenChange={(open) => {
          setCompareOpen(open);
          if (!open) setExternalCompareScan(null);
        }}
        earlier={compareEarlier}
        later={compareLater}
      />

      <PasteShareDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onScan={handlePasted}
      />

      <ScanDetailDialog
        open={detailRecord !== null}
        onOpenChange={(open) => {
          if (!open) setDetailRecord(null);
        }}
        record={detailRecord}
        sharedJustNow={
          detailRecord !== null && shareToastTs === detailRecord.timestamp
        }
        sharePending={
          detailRecord !== null && sharePendingTs === detailRecord.timestamp
        }
        onShare={(record) => copyShareForRow(record, "share")}
        onDelete={(record) => {
          onDelete(record.timestamp);
          setDetailRecord(null);
        }}
      />
    </article>
  );
}

function HistoryDataTools({
  history,
  importToast,
  importing,
  onImport,
  onClear,
}: {
  history: ScanRecord[];
  importToast: string | null;
  importing: boolean;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
      <button
        type="button"
        onClick={() => exportHistory(history)}
        disabled={importing}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/60 bg-white/45 px-3.5 py-2 text-xs font-medium text-[#625a52] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 hover:text-[#241f1a] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
      >
        <Download className="h-3.5 w-3.5" />
        {t.history.exportAll}
      </button>
      <label
        aria-disabled={importing}
        className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/60 bg-white/45 px-3.5 py-2 text-xs font-medium text-[#625a52] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 hover:text-[#241f1a] focus-within:ring-2 focus-within:ring-[#7a5bd6]/35 ${
          importing ? "pointer-events-none opacity-45" : "cursor-pointer"
        }`}
      >
        {importing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {t.history.importAll}
        <input
          type="file"
          accept="application/json,.json"
          onChange={onImport}
          disabled={importing}
          className="sr-only"
        />
      </label>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-bad/35 bg-bad/[0.04] px-3.5 py-2 text-xs font-medium text-bad transition hover:bg-bad/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t.history.clearAll}
      </button>
      {importToast && (
        <span
          role="status"
          aria-live="polite"
          className="w-full text-center text-[11px] text-[#6f4fc8]"
        >
          {importToast}
        </span>
      )}
    </div>
  );
}

function HistoryEmptyState({ onPaste }: { onPaste: () => void }) {
  const { t } = useT();
  const sampleHref = useMemo(() => {
    const sample: SharedScan = {
      v: 1,
      o: 7.8,
      t: "chadlite",
      c: {
        harmony: 7.6,
        angularity: 8.2,
        dimorphism: 7.4,
        "eye-area": 8.1,
        features: 7.5,
        symmetry: 8.6,
      },
      g: "male",
      e: "asian",
      ts: Date.UTC(2026, 4, 1, 12, 0, 0),
      geo: 7.6,
      s: 8.0,
      l: 8.1,
    };
    return `/share?d=${encodeShare(sample)}`;
  }, []);

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-white/60 bg-white/50 p-8 text-center shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md md:p-10">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#7a5bd6]/25 bg-[#f6f1ff] text-[#7a5bd6]">
        <HistoryIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-6 font-serif text-3xl font-light italic text-[#241f1a]">
        {t.historyDashboard.empty.title}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#625a52]">
        {t.historyDashboard.empty.body}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={"/scan" as never}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#241f1a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
        >
          <ScanFace className="h-4 w-4" />
          {t.historyDashboard.empty.scanCta}
        </Link>
        <a
          href={sampleHref}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#7a5bd6]/25 bg-[#f6f1ff] px-4 py-2.5 text-xs font-medium text-[#6f4fc8] transition hover:bg-[#efe7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t.historyDashboard.empty.sampleCta}
        </a>
        <button
          type="button"
          onClick={onPaste}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-xs font-medium text-[#625a52] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
        >
          <Link2 className="h-3.5 w-3.5" />
          {t.historyDashboard.empty.pasteCta}
          <ArrowRight className="h-3.5 w-3.5 opacity-60" />
        </button>
      </div>
    </div>
  );
}
