"use client";

/**
 * Phase 175 — Dedicated side-by-side scan compare at /history/compare.
 *
 * Reads `?a=<ts>&b=<ts>` from the URL, loads the matching records from
 * localStorage, renders the same delta + photo-slider + AI-commentary
 * UX that the `<CompareDialog>` modal at /history shows, but as a real
 * page so the URL is bookmarkable.
 *
 * Reuses `<PhotoABCompare>` and the Gemini compare-commentary helpers.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanizeError } from "@/lib/humanizeError";
import { loadHistory, type ScanRecord } from "@/lib/scan-history";
import type { Category } from "@/lib/scoring";
import { decodeShare, sharedToRecord } from "@/lib/share-link";
import { PhotoABCompare } from "./PhotoABCompare";
import {
  callGeminiCompareCommentary,
  loadCompareCommentaryFromCache,
  saveCompareCommentaryToCache,
  type CompareCommentary,
  type CompareScanSummary,
} from "@/lib/ai-gemini";

const CATEGORIES: Category[] = [
  "harmony",
  "angularity",
  "dimorphism",
  "eye-area",
  "features",
  "symmetry",
];

function fmtDate(ts: number, lang: "th" | "en"): string {
  return new Date(ts).toLocaleString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CompareView(): React.JSX.Element {
  const { t, lang } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const aParam = params?.get("a");
  const bParam = params?.get("b");
  // Phase 179 — `?b=share&payload=<encoded>` lets the same page render
  // a comparison against a foreign (URL-pasted) scan, replacing the old
  // modal-based paste-share flow.
  const payloadParam = params?.get("payload");

  const [records, setRecords] = useState<ScanRecord[] | null>(null);
  useEffect(() => {
    setRecords(loadHistory());
  }, []);

  const matched = useMemo(() => {
    if (!records) return null;
    const aTs = Number(aParam);
    if (!Number.isFinite(aTs)) {
      return { left: null, right: null, missingParams: true } as const;
    }
    const a = records.find((r) => r.timestamp === aTs);
    if (!a) {
      return { left: null, right: null, notFound: true } as const;
    }

    // Phase 179 — share-encoded foreign scan as the second side.
    if (bParam === "share" && payloadParam) {
      const decoded = decodeShare(payloadParam);
      if (!decoded) {
        return { left: null, right: null, notFound: true } as const;
      }
      const sharedRec = sharedToRecord(decoded) as ScanRecord;
      const [left, right] =
        a.timestamp < sharedRec.timestamp ? [a, sharedRec] : [sharedRec, a];
      return { left, right, shareSide: true } as const;
    }

    const bTs = Number(bParam);
    if (!Number.isFinite(bTs)) {
      return { left: null, right: null, missingParams: true } as const;
    }
    const b = records.find((r) => r.timestamp === bTs);
    if (!b) {
      return { left: null, right: null, notFound: true } as const;
    }
    const [left, right] =
      a.timestamp < b.timestamp ? [a, b] : [b, a];
    return { left, right } as const;
  }, [records, aParam, bParam, payloadParam]);

  // ---- AI commentary
  const [commentary, setCommentary] = useState<CompareCommentary | null>(null);
  const [pending, setPending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [commentaryRequest, setCommentaryRequest] = useState<{
    key: string;
    idToken: string;
  } | null>(null);

  useEffect(() => {
    if (!matched || !matched.left || !matched.right) return;
    const { left, right } = matched;
    setCommentary(null);
    setAiError(null);

    const cached = loadCompareCommentaryFromCache(
      left.timestamp,
      right.timestamp
    );
    if (cached) {
      setCommentary(cached);
      return;
    }
    const pairKey = `${left.timestamp}:${right.timestamp}`;
    if (commentaryRequest?.key !== pairKey) {
      setPending(false);
      return;
    }
    setPending(true);
    let cancelled = false;
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
        if (cancelled) return;
        setCommentary(c);
        saveCompareCommentaryToCache(left.timestamp, right.timestamp, c);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Phase 190 — friendly i18n message; raw error in console.
        if (typeof console !== "undefined") {
          console.warn("[CompareView] ai commentary failed:", e);
        }
        setAiError(humanizeError(e, lang));
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matched, lang, t, commentaryRequest]);

  const requestCommentary = useCallback(async () => {
    if (!matched || !matched.left || !matched.right || pending) return;
    try {
      const { getAccessToken } = await import("@/lib/supabase/auth-client");
      const idToken = (await getAccessToken(true)) ?? undefined;
      if (!idToken) throw new Error("auth-token-missing");
      setAiError(null);
      setCommentaryRequest({
        key: `${matched.left.timestamp}:${matched.right.timestamp}`,
        idToken,
      });
    } catch (e: unknown) {
      setAiError(humanizeError(e, lang));
    }
  }, [lang, matched, pending]);

  // ----- Loading + empty states
  if (records === null) {
    return <CompareLoadingState lang={lang} />;
  }
  if (matched?.missingParams || matched?.notFound) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
        <p className="text-lg text-[#241f1a]">
          {matched.missingParams
            ? lang === "th"
              ? "ลิงก์เปรียบเทียบไม่สมบูรณ์ — กลับไปเลือกสแกน 2 ครั้งจากหน้าประวัติ"
              : "Incomplete comparison link - go back and pick two scans from history"
            : lang === "th"
              ? "ไม่พบข้อมูลสแกนคู่นี้บนอุปกรณ์นี้"
              : "Couldn't find those two scans on this device"}
        </p>
        <Link
          href={"/history" as never}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#7a5bd6]/25 bg-[#f6f1ff] px-4 py-2 text-xs font-medium text-[#6f4fc8] hover:bg-[#efe7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
        >
          <ArrowLeft className="h-3 w-3" />
          {lang === "th" ? "กลับไปหน้าประวัติ" : "Back to history"}
        </Link>
      </div>
    );
  }
  if (!matched || !matched.left || !matched.right) return <div />;

  const { left, right } = matched;
  const overallDiff = right.overall - left.overall;
  const calibrationMismatch =
    left.options.gender !== right.options.gender ||
    left.options.ethnicity !== right.options.ethnicity;

  return (
    <article className="mx-auto min-w-0 max-w-2xl space-y-6 text-[#241f1a]">
      <header className="space-y-2">
        <Link
          href={"/history" as never}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-[#625a52] transition hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
        >
          <ArrowLeft className="h-3 w-3" />
          {lang === "th" ? "กลับไปประวัติ" : "Back to history"}
        </Link>
        <h1 className="font-serif text-3xl font-light italic">
          {t.compare.title}
        </h1>
        <p className="text-sm text-[#625a52]">{t.compare.subtitle}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <ScanHeader rec={left} lang={lang} label={t.compare.earlier} />
        <ScanHeader rec={right} lang={lang} label={t.compare.later} />
      </div>

      <PhotoABCompare earlier={left} later={right} />

      {!commentary && !pending && !aiError && (
        <div className="rounded-2xl border border-[#7a5bd6]/20 bg-white/60 p-4 shadow-[0_18px_52px_-46px_rgba(36,31,26,0.32)] backdrop-blur-md">
          <button
            type="button"
            onClick={requestCommentary}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#7a5bd6]/25 bg-[#f6f1ff] px-4 py-2 text-xs font-medium text-[#6f4fc8] transition hover:bg-[#efe7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {lang === "th"
              ? "สรุปรายงาน (ใช้ 1 สิทธิ์ประเมิน)"
              : "Report summary (uses 1 assessment credit)"}
          </button>
        </div>
      )}
      {(commentary || pending || aiError) && (
        <div className="space-y-2 rounded-2xl border border-[#7a5bd6]/20 bg-white/60 p-4 shadow-[0_18px_52px_-46px_rgba(36,31,26,0.32)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#7a5bd6]" />
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#6f4fc8]">
              {lang === "th" ? "สรุปการเปลี่ยนแปลง" : "Change summary"}
            </p>
          </div>
          {pending && (
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
          {aiError && !commentary && (
            <p className="text-xs text-warn/85">
              {lang === "th"
                ? "สรุปการเปลี่ยนแปลงไม่พร้อม — แสดงเฉพาะตัวเลข"
                : "Change summary unavailable - showing numbers only"}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-[#241f1a]/10 bg-white/60 p-4 shadow-[0_18px_52px_-46px_rgba(36,31,26,0.32)] backdrop-blur-md">
        <p className="text-center text-[11px] uppercase tracking-[0.18em] text-[#8f8379]">
          {t.compare.overallLabel}
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
          <ScoreCell value={left.overall} tier={t.tier[left.tier]} align="end" />
          <DiffArrow diff={overallDiff} />
          <ScoreCell value={right.overall} tier={t.tier[right.tier]} align="start" />
        </div>
      </div>

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

      {calibrationMismatch && (
        <div className="rounded-xl border border-warn/30 bg-warn/[0.05] p-3 text-[11px] leading-relaxed text-warn">
          {t.compare.calibrationMismatch}
        </div>
      )}

      <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#241f1a]/10 bg-white/60 px-4 py-2 text-xs font-medium text-[#625a52] shadow-[0_12px_32px_-28px_rgba(36,31,26,0.36)] backdrop-blur-md transition hover:bg-white/75 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
        >
          <ArrowLeft className="h-3 w-3" />
          {lang === "th" ? "กลับ" : "Back"}
        </button>
        <Link
          href={"/scan" as never}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#241f1a] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
        >
          {lang === "th" ? "ประเมินรูปใหม่" : "New assessment"}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}

// ----- helper sub-components

function CompareLoadingState({
  lang,
}: {
  lang: "th" | "en";
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="mx-auto max-w-2xl rounded-3xl border border-[#241f1a]/10 bg-white/60 p-6 text-center shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md"
    >
      <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#7a5bd6]" />
      <p className="mt-3 text-sm font-medium text-[#241f1a]">
        {lang === "th" ? "กำลังโหลดข้อมูลเปรียบเทียบ" : "Loading comparison data"}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-2xl bg-white/40" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/40" />
      </div>
    </div>
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
}): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-xl border border-[#241f1a]/10 bg-white/50 p-3 backdrop-blur-md">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#6f4fc8]">
        {label}
      </p>
      <p className="mt-0.5 text-xs text-[#241f1a]">{fmtDate(rec.timestamp, lang)}</p>
      <p className="break-words text-[10px] text-[#7c746d]">
        {rec.options.gender} · {rec.options.ethnicity}
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
}): React.JSX.Element {
  return (
    <div
      className={`min-w-0 space-y-0.5 ${align === "end" ? "text-right" : "text-left"}`}
    >
      <p className="font-serif text-3xl font-light italic leading-none">
        {value.toFixed(1)}
      </p>
      <p className="break-words text-[10px] uppercase tracking-[0.12em] text-[#7c746d] sm:tracking-wider">
        {tier}
      </p>
    </div>
  );
}

function DiffArrow({ diff }: { diff: number }): React.JSX.Element {
  const abs = Math.abs(diff);
  if (abs < 0.05) {
    // Phase 192v — the neutral arrow had no aria-label, so screen readers
    // announced an empty graphic. Give it a "no change" role/label.
    return (
      <span
        role="img"
        aria-label="±0.00"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#241f1a]/10 bg-white/45 text-[#8f8379] backdrop-blur-md"
      >
        <Minus className="h-3.5 w-3.5" />
      </span>
    );
  }
  const positive = diff > 0;
  return (
    <span
      role="img"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${
        positive
          ? "border-good/35 bg-good/[0.1] text-good"
          : "border-warn/35 bg-warn/[0.08] text-warn"
      }`}
      aria-label={`${positive ? "+" : "−"}${abs.toFixed(2)}`}
    >
      {positive ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

function CategoryRow({
  label,
  a,
  b,
  diff,
}: {
  label: string;
  a: number | undefined;
  b: number | undefined;
  diff: number | null;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1.35fr)_2.5rem] items-center gap-2 rounded-xl border border-[#241f1a]/10 bg-white/50 px-3 py-2 backdrop-blur-md sm:grid-cols-[minmax(3rem,1fr)_minmax(0,1.35fr)_minmax(3rem,1fr)]">
      <p className="text-right text-sm tabular-nums">
        {a !== undefined ? a.toFixed(1) : "—"}
      </p>
      <p className="min-w-0 break-words text-center text-[11px] leading-snug text-[#625a52]">
        {label}
        {diff !== null && (
          <span
            className={`ml-1 ${
              diff > 0.05
                ? "text-good"
                : diff < -0.05
                  ? "text-warn"
                  : "text-[#8f8379]"
            }`}
          >
            {diff > 0 ? "+" : ""}
            {diff.toFixed(1)}
          </span>
        )}
      </p>
      <p className="text-left text-sm tabular-nums">
        {b !== undefined ? b.toFixed(1) : "—"}
      </p>
    </div>
  );
}
