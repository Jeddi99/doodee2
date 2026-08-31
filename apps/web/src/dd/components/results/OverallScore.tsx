"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Link2,
  Loader2,
  Check,
  ShieldAlert,
  Share2,
  ChevronDown,
} from "lucide-react";
import type { ScanResult } from "@/lib/scoring";
import type { AiScoreSource } from "@/lib/ai-gemini";
import { tierFor, overallPercentile } from "@/lib/scoring";
import { previousScan, type ScanRecord } from "@/lib/scan-history";
import { shareUrl, toSharedScan } from "@/lib/share-link";
import { useT } from "@/lib/i18n";
import { useTrackedTimeout } from "@/lib/use-tracked-timeout";
import { BellCurve } from "./BellCurve";
import { ShareCard } from "./ShareCard";
import { TierLadder } from "./TierLadder";

interface OverallScoreProps {
  result: ScanResult;
  /** True while the Phase 28 async ONNX ensemble is running. */
  learnedPending?: boolean;
  /**
   * Phase 158.27 — proof of work for the visible score.
   *   "ai"       → server AI ran and reconciled the score
   *   "fallback" → AI errored, MediaPipe-only (warn pill)
   *   "disabled" → no GEMINI_API_SECRET (neutral muted pill)
   *   null/undefined → don't render the pill (older history rows, etc.)
   */
  aiSource?: AiScoreSource | null;
}

export function OverallScore({
  result,
  learnedPending,
  aiSource,
}: OverallScoreProps) {
  const { t } = useT();
  const tier = tierFor(result.overall, result.options.gender);
  const [previous, setPrevious] = useState<ScanRecord | null>(null);
  useEffect(() => {
    setPrevious(previousScan());
  }, [result.overall]);
  // Phase 192g: count-up state lives inside <AnimatedScoreNumber/> so
  // BellCurve/TierLadder/ShareCard don't re-render at 60fps during reveal.
  const diff = previous ? result.overall - previous.overall : null;
  return (
    <div className="min-w-0 space-y-6">
      <div className="scan-complete-card relative mx-auto min-w-0 max-w-xl overflow-hidden rounded-[2rem] border border-[#241f1a]/10 bg-white/60 px-5 py-7 text-center shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7a5bd6]/55 via-[#3f6268]/45 to-transparent" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#766e65]">
          {t.result.overall}
        </p>
        <AnimatedScoreNumber target={result.overall} />
        <p className="mt-1 text-sm">
          <span className="font-serif italic text-[#241f1a]">
            {t.tier[tier]}
          </span>
          <span className="text-[#b5aa9f]"> · </span>
          <span className="text-xs uppercase tracking-wider text-[#766e65]">
            {t.result.outOf}
          </span>
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <PercentilePill score={result.overall} />
        </div>
        {/* Phase 116 — keep BlendChip ONLY when geometric path is the
            source of truth. When AI takes over, the breakdown chips +
            reasoning panel are hidden (UX feedback: too much detail,
            don't need to "announce" AI usage). */}
        {result.aiSource !== "ai" &&
          result.geometric !== undefined &&
          result.secondOpinion !== undefined && (
            <BlendChip
              geometric={result.geometric}
              secondOpinion={result.secondOpinion}
              learned={result.learned}
              learnedPending={learnedPending}
            />
          )}
        <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-[#5f574f]">
          {t.tierDescription[tier]}
        </p>
        {diff !== null && previous && (
          <DiffPill diff={diff} prevOverall={previous.overall} />
        )}
        {result.confidence < 0.65 && (
          <LowConfidenceBanner confidence={result.confidence} />
        )}
      </div>
      <div className="max-w-sm mx-auto">
        <BellCurve
          score={result.overall}
          label={t.result.overallDistribution}
        />
      </div>
      <ShareLinkButton result={result} tier={tier} />
      <ShareCard overall={result.overall} tier={tier} />
      <details className="max-w-sm mx-auto">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 text-center text-xs font-medium text-[#5f574f] transition-colors hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f6268]/30">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          {t.result.viewAllTiers}
        </summary>
        <div className="pt-4">
          <TierLadder currentTier={tier} gender={result.options.gender} />
        </div>
      </details>
    </div>
  );
}

// Phase 192g: animated count-up isolated to its own leaf. Owns its own
// useState so setDisplayed at ~60fps only re-renders this subtree —
// BellCurve, TierLadder, ShareCard, and the rest of OverallScore stay stable.
// Phase 192n (a11y B2): the visible animated number is aria-hidden so
// VoiceOver doesn't read intermediate count-up values ("3.2", "5.7"...)
// at 60fps. A sibling sr-only live region announces the final value
// exactly once, after framer-motion's onComplete settles `settled=true`.
function AnimatedScoreNumber({ target }: { target: number }) {
  const [displayed, setDisplayed] = useState(0);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    // Phase 192g: framer-motion animate() drives 0 → target over ~0.9s.
    // Cleanup stops the animation if target changes mid-flight.
    // Phase 192n (a11y B2): settled flips false on prop change so a new
    // count-up re-announces, then true on onComplete so the sr-only
    // polite region speaks the final score exactly once.
    setSettled(false);
    const ctrl = animate(0, target, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setDisplayed,
      onComplete: () => setSettled(true),
    });
    return () => ctrl.stop();
  }, [target]);
  return (
    <div className="relative inline-flex max-w-full items-baseline justify-center">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-2 bottom-4 -z-10 h-px bg-gradient-to-r from-transparent via-[#7a5bd6]/20 to-transparent"
      />
      <div
        aria-hidden="true"
        className="relative max-w-full font-serif italic font-light leading-none text-[4.9rem] tabular-nums text-[#241f1a] sm:text-[5.5rem] md:text-[7rem]"
      >
        {displayed.toFixed(1)}
      </div>
      <span
        aria-hidden="true"
        className="relative ml-1 font-serif italic text-xl text-[#766e65] md:text-2xl"
      >
        /10
      </span>
      <span className="sr-only" aria-live="polite">
        {settled ? `${target.toFixed(1)} out of 10` : ""}
      </span>
    </div>
  );
}

function ShareLinkButton({
  result,
  tier,
}: {
  result: ScanResult;
  tier: ReturnType<typeof tierFor>;
}) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "busy" | "copied" | "err">("idle");
  const [hasNativeShare, setHasNativeShare] = useState(false);
  // Phase 192q — tracked timeout so the share-state revert doesn't fire
  // on an unmounted button if the user navigates while sharing.
  const scheduleTimeout = useTrackedTimeout();

  useEffect(() => {
    // Phase 78: detect Web Share API support — mobile Safari, Android
    // Chrome/Edge support it; most desktops don't.
    setHasNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  function buildUrl(): string {
    const shared = toSharedScan({
      overall: result.overall,
      tier,
      categories: result.categories,
      options: result.options,
      timestamp: Date.now(),
      geometric: result.geometric,
      secondOpinion: result.secondOpinion,
      learned: result.learned,
    });
    return shareUrl(window.location.origin, shared);
  }

  async function handleShare() {
    if (typeof window === "undefined") return;
    if (state === "busy") return;
    setState("busy");
    try {
      const url = buildUrl();
      // Phase 78: prefer native share on mobile — opens OS share sheet
      // (Twitter, IG DMs, Messages, etc.) without the user having to
      // paste a link. AbortError = user dismissed; not an error.
      if (hasNativeShare && navigator.share) {
        try {
          await navigator.share({
            title: t.share.nativeTitle,
            text: t.share.nativeText.replace(
              "{score}",
              result.overall.toFixed(1),
            ),
            url,
          });
          setState("idle");
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") {
            setState("idle");
            return;
          }
          // Other errors fall through to clipboard.
        }
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setState("copied");
      } else {
        // Fallback for old Safari / non-secure-context environments.
        window.prompt(t.share.copyFallback, url);
        setState("copied");
      }
      scheduleTimeout(() => setState("idle"), 1800);
    } catch {
      setState("err");
      scheduleTimeout(() => setState("idle"), 1800);
    }
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={handleShare}
        disabled={state === "busy"}
        aria-busy={state === "busy" ? "true" : undefined}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#241f1a]/10 bg-white/50 px-5 text-sm font-semibold text-[#4f4841] shadow-[0_12px_30px_-24px_rgba(36,31,26,0.3)] backdrop-blur-md transition hover:bg-white/70 hover:text-[#241f1a] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
      >
        {state === "busy" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {hasNativeShare ? t.share.shareScan : t.share.copyLink}
          </>
        ) : state === "copied" ? (
          <>
            <Check className="h-3.5 w-3.5 text-good" />
            {t.share.copied}
          </>
        ) : state === "err" ? (
          <>
            <Link2 className="h-3.5 w-3.5 text-warn" />
            {t.share.copyError}
          </>
        ) : hasNativeShare ? (
          <>
            <Share2 className="h-3.5 w-3.5" />
            {t.share.shareScan}
          </>
        ) : (
          <>
            <Link2 className="h-3.5 w-3.5" />
            {t.share.copyLink}
          </>
        )}
      </button>
    </div>
  );
}

function BlendChip({
  geometric,
  secondOpinion,
  learned,
  learnedPending,
}: {
  geometric: number;
  secondOpinion: number;
  learned?: number;
  learnedPending?: boolean;
}) {
  const { t } = useT();
  return (
    <div
      title={t.result.blendTooltip}
      className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-[#241f1a]/10 bg-white/45 px-3 py-1 text-[11px] tabular-nums text-[#5f574f] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.28)] backdrop-blur-md cursor-help"
    >
      <span>
        <span className="text-[#766e65]">{t.result.geometricShort}</span>{" "}
        <span className="font-medium text-[#241f1a]">
          {geometric.toFixed(1)}
        </span>
      </span>
      <span className="text-[#b5aa9f]">·</span>
      <span>
        <span className="text-[#766e65]">{t.result.secondOpinionShort}</span>{" "}
        <span className="font-medium text-[#241f1a]">
          {secondOpinion.toFixed(1)}
        </span>
      </span>
      {learned !== undefined ? (
        <>
          <span className="text-[#b5aa9f]">·</span>
          <span>
            <span className="text-[#7a5bd6]">{t.result.learnedShort}</span>{" "}
            <span className="font-medium text-[#241f1a]">
              {learned.toFixed(1)}
            </span>
          </span>
        </>
      ) : learnedPending ? (
        <>
          <span className="text-[#b5aa9f]">·</span>
          <span className="flex items-center gap-1 text-[#7a5bd6]">
            <span className="block h-1.5 w-1.5 rounded-full bg-[#7a5bd6] animate-pulse" />
            {t.result.learnedAnalyzing}
          </span>
        </>
      ) : null}
    </div>
  );
}

function PercentilePill({ score }: { score: number }) {
  const { t } = useT();
  const pct = overallPercentile(score);
  const display = pct >= 99 ? "Top 1%" : `Top ${(100 - pct).toFixed(1)}%`;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside-tap (mobile) — desktop hover-leave handled by CSS.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block max-w-full group">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-label={t.result.percentileTooltip}
        className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-[#7a5bd6]/20 bg-[#f3efff]/70 px-3 py-1 text-[11px] text-[#5f574f] shadow-[0_10px_26px_-24px_rgba(122,91,214,0.28)] backdrop-blur-md transition hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
      >
        <span className="font-medium tabular-nums">{display}</span>
        <span className="text-[#766e65]">· {t.result.populationLabel}</span>
        <Info className="h-3 w-3 text-[#766e65]" aria-hidden />
      </button>
      <div
        role="tooltip"
        className={`absolute left-1/2 top-full z-30 mt-2 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 transform rounded-xl border border-[#241f1a]/10 bg-white/70 p-3 text-left text-[11px] leading-relaxed text-[#5f574f] shadow-[0_18px_46px_-34px_rgba(36,31,26,0.35)] backdrop-blur-md transition-opacity ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        } group-hover:opacity-100 group-hover:pointer-events-auto`}
      >
        {t.result.percentileTooltip}
      </div>
    </div>
  );
}

function LowConfidenceBanner({ confidence }: { confidence: number }) {
  const { t } = useT();
  return (
    <div className="mx-auto inline-flex max-w-md items-start gap-2 rounded-xl border border-[#b7791f]/25 bg-[#fff8ec]/82 px-3 py-2 text-left text-[11px] text-[#8a5a13] backdrop-blur-md">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
      <span className="leading-relaxed">
        {t.result.lowConfidence.replace(
          "{pct}",
          Math.round(confidence * 100).toString(),
        )}
      </span>
    </div>
  );
}

function DiffPill({
  diff,
  prevOverall,
}: {
  diff: number;
  prevOverall: number;
}) {
  const { t } = useT();
  const abs = Math.abs(diff);
  const Icon = diff > 0.05 ? TrendingUp : diff < -0.05 ? TrendingDown : Minus;
  const tone =
    diff > 0.05
      ? "text-[#067e96]"
      : diff < -0.05
        ? "text-[#8a5a13]"
        : "text-[#766e65]";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-[#241f1a]/10 bg-white/45 px-3 py-1 text-xs shadow-[0_10px_26px_-24px_rgba(36,31,26,0.28)] backdrop-blur-md">
      <Icon className={`h-3 w-3 ${tone}`} />
      <span className={`tabular-nums font-medium ${tone}`}>
        {sign}
        {abs.toFixed(1)}
      </span>
      <span className="text-[#766e65]">
        · {t.history.fromPrevious} {prevOverall.toFixed(1)}
      </span>
    </div>
  );
}
