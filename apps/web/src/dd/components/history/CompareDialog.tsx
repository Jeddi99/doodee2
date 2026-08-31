"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ScanRecord } from "@/lib/scan-history";
import type { Category } from "@/lib/scoring";
import { useT } from "@/lib/i18n";
import { humanizeError } from "@/lib/humanizeError";
import { PhotoABCompare } from "./PhotoABCompare";
import {
  callGeminiCompareCommentary,
  loadCompareCommentaryFromCache,
  saveCompareCommentaryToCache,
  type CompareCommentary,
  type CompareScanSummary,
} from "@/lib/ai-gemini";

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  earlier: ScanRecord | null;
  later: ScanRecord | null;
}

function formatDate(ts: number, lang: "th" | "en"): string {
  const d = new Date(ts);
  return d.toLocaleString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const CATEGORIES: Category[] = [
  "harmony",
  "angularity",
  "dimorphism",
  "eye-area",
  "features",
  "symmetry",
];

export function CompareDialog({
  open,
  onOpenChange,
  earlier,
  later,
}: CompareDialogProps) {
  const { t, lang } = useT();

  // Sort so left = older, right = newer for natural reading. Computed
  // unconditionally so React-hook order stays consistent across renders.
  const ordered =
    earlier && later
      ? earlier.timestamp < later.timestamp
        ? ([earlier, later] as const)
        : ([later, earlier] as const)
      : null;
  const left = ordered?.[0] ?? null;
  const right = ordered?.[1] ?? null;
  const overallDiff = left && right ? right.overall - left.overall : 0;

  // Phase 125 — AI Compare Commentary
  const [commentary, setCommentary] = useState<CompareCommentary | null>(null);
  const [commentaryPending, setCommentaryPending] = useState(false);
  const [commentaryError, setCommentaryError] = useState<string | null>(null);
  const [commentaryRequest, setCommentaryRequest] = useState<{
    key: string;
    idToken: string;
  } | null>(null);

  useEffect(() => {
    if (!open || !left || !right) return;
    setCommentary(null);
    setCommentaryError(null);

    const cached = loadCompareCommentaryFromCache(left.timestamp, right.timestamp);
    if (cached) {
      setCommentary(cached);
      return;
    }
    const pairKey = `${left.timestamp}:${right.timestamp}`;
    if (commentaryRequest?.key !== pairKey) {
      setCommentaryPending(false);
      return;
    }

    // Phase 158.13 — server proxy uses GEMINI_API_SECRET; no per-user key
    // gate here. If the server has no key the proxy returns 503 and we
    // silently degrade (catch below records the error).
    setCommentaryPending(true);
    const earlierSummary: CompareScanSummary = {
      timestamp: left.timestamp,
      overall: left.overall,
      tier: t.tier[left.tier],
      categories: left.categories,
      gender: left.options.gender,
      ethnicity: left.options.ethnicity,
    };
    const laterSummary: CompareScanSummary = {
      timestamp: right.timestamp,
      overall: right.overall,
      tier: t.tier[right.tier],
      categories: right.categories,
      gender: right.options.gender,
      ethnicity: right.options.ethnicity,
    };

    callGeminiCompareCommentary({
      earlier: earlierSummary,
      later: laterSummary,
      lang,
      idToken: commentaryRequest.idToken,
    })
      .then((c) => {
        setCommentary(c);
        saveCompareCommentaryToCache(left.timestamp, right.timestamp, c);
      })
      .catch((e: unknown) => {
        // Phase 190 — friendly i18n message; raw error in console.
        if (typeof console !== "undefined") {
          console.warn("[CompareDialog] ai commentary failed:", e);
        }
        setCommentaryError(humanizeError(e, lang));
      })
      .finally(() => setCommentaryPending(false));
  }, [open, left, right, lang, t, commentaryRequest]);

  const requestCommentary = useCallback(async () => {
    if (!left || !right || commentaryPending) return;
    try {
      const { getAccessToken } = await import("@/lib/supabase/auth-client");
      const idToken = (await getAccessToken(true)) ?? undefined;
      if (!idToken) throw new Error("auth-token-missing");
      setCommentaryError(null);
      setCommentaryRequest({
        key: `${left.timestamp}:${right.timestamp}`,
        idToken,
      });
    } catch (e: unknown) {
      setCommentaryError(humanizeError(e, lang));
    }
  }, [commentaryPending, lang, left, right]);

  if (!earlier || !later || !left || !right) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-h-[92dvh] max-w-2xl gap-0 overflow-hidden !border-white/60 !bg-white/60 p-0 text-[#241f1a] !shadow-[0_24px_80px_-48px_rgba(36,31,26,0.55)] backdrop-blur-md sm:w-[calc(100%-1.5rem)]">
        <div className="border-b border-white/50 bg-white/40 px-6 pb-3 pt-6 pr-12 backdrop-blur">
          <DialogTitle className="font-serif text-3xl font-light italic text-[#241f1a]">{t.compare.title}</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-[#625a52]">
            {t.compare.subtitle}
          </DialogDescription>
        </div>

        <div className="min-w-0 px-5 py-5 space-y-5 max-h-[70dvh] overflow-y-auto overscroll-contain">
          {/* Header row — two columns showing dates */}
          <div className="grid gap-3 sm:grid-cols-2">
            <ScanHeader rec={left} lang={lang} label={t.compare.earlier} />
            <ScanHeader rec={right} lang={lang} label={t.compare.later} />
          </div>

          {/* Phase 139 — visual A/B compare on the actual photos.
              Renders the draggable slider when both records have a
              saved photo (Phase 138 onwards). Older records get a
              numbers-only fallback inside the component itself. */}
          <PhotoABCompare earlier={left} later={right} />

          {/* Phase 125 — AI Compare Commentary. Renders the narrative
              from Gemini, or a pending state, or nothing (silently)
              when no API key is configured. */}
          {!commentary && !commentaryPending && !commentaryError && (
            <div className="rounded-2xl border border-white/60 bg-white/35 p-4 backdrop-blur">
              <button
                type="button"
                onClick={requestCommentary}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-medium text-[#6f4fc8] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {lang === "th"
                  ? "สรุปรายงาน (ใช้ 1 สิทธิ์ประเมิน)"
                  : "Report summary (uses 1 assessment credit)"}
              </button>
            </div>
          )}
          {(commentary || commentaryPending || commentaryError) && (
            <div className="space-y-2 rounded-2xl border border-white/60 bg-white/35 p-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#7a5bd6]" />
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#6f4fc8]">
                  {lang === "th" ? "สรุปการเปลี่ยนแปลง" : "Change summary"}
                </p>
              </div>
              {commentaryPending && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 text-sm text-[#625a52]"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7a5bd6]" />
                  {lang === "th"
                    ? "กำลังจัดทำสรุปการเปลี่ยนแปลง..."
                    : "Preparing change summary..."}
                </div>
              )}
              {commentary && (
                <>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#241f1a]">
                    {commentary.narrative}
                  </p>
                  {(commentary.topImprovement ||
                    commentary.topRegression ||
                    commentary.nextFocus) && (
                    <div className="flex min-w-0 flex-wrap gap-2 pt-1">
                      {commentary.topImprovement && (
                        <span className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-good/30 bg-good/[0.06] px-2 py-0.5 text-[10px] text-good">
                          <TrendingUp className="h-2.5 w-2.5" />
                          {lang === "th" ? "เพิ่มมากสุด" : "largest gain"}:{" "}
                          {commentary.topImprovement}
                        </span>
                      )}
                      {commentary.topRegression && (
                        <span className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-warn/30 bg-warn/[0.06] px-2 py-0.5 text-[10px] text-warn">
                          <TrendingDown className="h-2.5 w-2.5" />
                          {lang === "th" ? "ลดมากสุด" : "largest drop"}:{" "}
                          {commentary.topRegression}
                        </span>
                      )}
                      {commentary.nextFocus && (
                        <span className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-[#7a5bd6]/25 bg-[#f6f1ff] px-2 py-0.5 text-[10px] text-[#6f4fc8]">
                          <Sparkles className="h-2.5 w-2.5" />
                          {lang === "th" ? "ควรติดตาม" : "next focus"}:{" "}
                          {commentary.nextFocus}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
              {commentaryError && (
                <p className="text-xs text-warn/85">
                  {lang === "th"
                  ? "สรุปรายงานไม่พร้อม — แสดงเฉพาะตัวเลข"
                  : "Change summary unavailable - showing numbers only"}
                </p>
              )}
            </div>
          )}

          {/* Overall comparison */}
          <div className="space-y-3 rounded-2xl border border-white/60 bg-white/35 p-4 backdrop-blur">
            <p className="text-center text-[11px] uppercase tracking-[0.18em] text-[#8f8379]">
              {t.compare.overallLabel}
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
              <ScoreCell value={left.overall} tier={t.tier[left.tier]} align="end" />
              <DiffArrow diff={overallDiff} />
              <ScoreCell value={right.overall} tier={t.tier[right.tier]} align="start" />
            </div>
          </div>

          {/* Per-category comparison */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8f8379]">
              {t.compare.categoriesLabel}
            </p>
            <div className="space-y-1.5">
              {CATEGORIES.map((cat) => {
                const a = left.categories[cat];
                const b = right.categories[cat];
                if (a === undefined && b === undefined) return null;
                const diff =
                  a !== undefined && b !== undefined ? b - a : null;
                return (
                  <CategoryRow
                    key={cat}
                    label={t.category[cat]}
                    a={a}
                    b={b}
                    diff={diff}
                  />
                );
              })}
            </div>
          </div>

          {/* Calibration note if different */}
          {(left.options.gender !== right.options.gender ||
            left.options.ethnicity !== right.options.ethnicity) && (
            <div className="rounded-xl border border-warn/30 bg-warn/[0.05] p-3 text-[11px] text-warn leading-relaxed">
              {t.compare.calibrationMismatch}
            </div>
          )}
        </div>

      <div className="flex justify-end border-t border-white/50 bg-white/26 px-5 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-sm font-medium text-[#625a52] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.3)] backdrop-blur transition hover:bg-white/65 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
          >
            <X className="h-3.5 w-3.5" />
            {t.dialog.close}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScanHeader({
  rec,
  lang,
  label,
}: {
  rec: ScanRecord;
  lang: "th" | "en";
  label: string;
}) {
  const { t } = useT();
  return (
    <div className="min-w-0 space-y-1 rounded-xl border border-white/60 bg-white/35 p-3 backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#8f8379]">
        {label}
      </p>
      <p className="text-sm font-medium text-[#241f1a]">
        {formatDate(rec.timestamp, lang)}
      </p>
      <p className="break-words text-[10px] text-[#625a52]">
        {t.calibration[rec.options.gender]} ·{" "}
        {t.calibration[rec.options.ethnicity]} ·{" "}
        {rec.views.side ? "Front + Side" : "Front"}
      </p>
    </div>
  );
}

function ScoreCell({
  value,
  tier,
  align,
}: {
  value: number;
  tier: string;
  align: "start" | "end";
}) {
  // Phase 192v — was `text-${align}` (a dynamically-built class). Tailwind's
  // JIT only generates classes it can find as complete literal strings at
  // build time, so `text-start` / `text-end` were NEVER emitted — both score
  // cells silently fell back to default (left) alignment instead of mirroring
  // inward toward the center diff arrow. Map to the static `text-right` /
  // `text-left` literals the design intends (matches CompareView's ScoreCell).
  return (
    <div className={`${align === "end" ? "text-right" : "text-left"} min-w-0 space-y-0.5`}>
      <p className="font-serif text-3xl font-light italic leading-none tabular-nums text-[#241f1a] sm:text-4xl">
        {value.toFixed(1)}
      </p>
      <p className="break-words text-[10px] uppercase tracking-[0.12em] text-[#7c746d] sm:tracking-[0.18em]">
        {tier}
      </p>
    </div>
  );
}

function DiffArrow({ diff }: { diff: number }) {
  const abs = Math.abs(diff);
  const Icon = diff > 0.05 ? TrendingUp : diff < -0.05 ? TrendingDown : Minus;
  const tone =
    diff > 0.05 ? "text-good" : diff < -0.05 ? "text-warn" : "text-[#8f8379]";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return (
    <div
      className={`flex flex-col items-center gap-1 ${tone}`}
      aria-label={`Difference ${sign}${abs.toFixed(2)}`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs tabular-nums font-medium">
        {sign}
        {abs.toFixed(2)}
      </span>
    </div>
  );
}

function CategoryRow({
  label,
  a,
  b,
  diff,
}: {
  label: string;
  a?: number;
  b?: number;
  diff: number | null;
}) {
  const diffTone =
    diff === null
      ? "text-[#8f8379]"
      : diff > 0.05
        ? "text-good"
        : diff < -0.05
          ? "text-warn"
          : "text-[#8f8379]";
  const diffSign =
    diff === null ? "—" : diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.25rem_2.25rem_2.75rem] items-center gap-2 rounded-xl border border-white/60 bg-white/40 px-3 py-2 text-xs backdrop-blur sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-3">
      <span className="min-w-0 leading-snug text-[#625a52]">{label}</span>
      <span className="text-right tabular-nums text-[#7c746d] sm:w-10">
        {a !== undefined ? a.toFixed(1) : "—"}
      </span>
      <span className="text-right tabular-nums text-[#241f1a] sm:w-10">
        {b !== undefined ? b.toFixed(1) : "—"}
      </span>
      <span className={`text-right tabular-nums font-medium sm:w-12 ${diffTone}`}>
        {diff !== null
          ? `${diffSign}${Math.abs(diff).toFixed(2)}`
          : diffSign}
      </span>
    </div>
  );
}
