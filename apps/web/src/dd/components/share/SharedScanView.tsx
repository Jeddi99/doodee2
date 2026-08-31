"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { m } from "framer-motion";
import {
  ArrowRight,
  Minus,
  Share2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import type { SharedScan } from "@/lib/share-link";
import { loadHistory, type ScanRecord } from "@/lib/scan-history";
import { BellCurve } from "@/components/results/BellCurve";
import { RadarChart } from "@/components/results/RadarChart";
import { AppBackground } from "@/components/AppBackground";

interface SharedScanViewProps {
  scan: SharedScan | null;
}

const REVEAL = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

export function SharedScanView({ scan }: SharedScanViewProps) {
  const { t, lang } = useT();
  const [yourLatest, setYourLatest] = useState<ScanRecord | null>(null);
  useEffect(() => {
    const h = loadHistory();
    setYourLatest(h[0] ?? null);
  }, []);

  if (!scan) {
    return (
      <>
        <AppBackground />
        <article className="share-invalid-card mx-auto mt-10 max-w-md space-y-6 rounded-3xl border px-6 py-8 text-center">
          <h1 className="share-invalid-title text-3xl font-semibold">
            {t.share.invalidTitle}
          </h1>
          <p className="share-invalid-body text-sm">{t.share.invalidBody}</p>
          <Link
            href="/scan"
            className="share-invalid-cta inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2"
          >
            {t.share.startYourOwn}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </article>
      </>
    );
  }

  const tierLabel = (t.tier as Record<string, string>)[scan.t] ?? scan.t;
  const tierDescription =
    (t.tierDescription as Record<string, string>)[scan.t] ?? "";
  const dateLabel = new Date(scan.ts).toLocaleString(
    lang === "th" ? "th-TH" : "en-US",
    {
      calendar: "gregory",
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  );

  return (
    <>
      <AppBackground />
      <article className="app-glass-page mx-auto max-w-2xl space-y-8 px-5 py-8 text-[#f8fafc] sm:space-y-10 sm:py-10">
        <m.header
          variants={REVEAL}
          initial="hidden"
          animate="visible"
          className="text-center space-y-3"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-[#067e96]/20 bg-[#eef8f8]/70 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#067e96] shadow-[0_14px_34px_-28px_rgba(6,126,150,0.55)] backdrop-blur-md">
            <Share2 className="h-3 w-3" />
            {t.share.eyebrow}
          </p>
          <p className="text-xs uppercase tracking-widest text-[#6f625a]">
            {t.result.overall} · {dateLabel}
          </p>
          <div className="relative inline-flex min-h-[7rem] items-center justify-center rounded-[2rem] border border-[#241f1a]/10 bg-white/55 px-8 py-5 shadow-[0_22px_70px_-52px_rgba(36,31,26,0.5)] backdrop-blur-md">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-light tabular-nums text-[#067e96]/10 blur-[8px] md:text-8xl"
            >
              {scan.o.toFixed(1)}
            </span>
            <div className="relative font-serif text-7xl font-light italic leading-none tabular-nums text-[#241f1a] md:text-8xl">
              {scan.o.toFixed(1)}
            </div>
          </div>
          <p className="text-sm text-[#6f625a]">
            {tierLabel} · {t.result.outOf}
          </p>
          <p className="mx-auto max-w-md text-xs leading-relaxed text-[#6f625a]">
            {tierDescription}
          </p>
          {(scan.geo !== undefined ||
            scan.s !== undefined ||
            scan.l !== undefined) && (
            <div className="mt-2 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl border border-[#241f1a]/10 bg-white/50 px-3 py-2 text-[11px] tabular-nums text-[#6f625a] shadow-[0_12px_28px_-24px_rgba(36,31,26,0.3)] backdrop-blur-md sm:rounded-full sm:py-1">
              {scan.geo !== undefined && (
                <span>
                  <span className="text-[#8d8378]">
                    {t.result.geometricShort}
                  </span>{" "}
                  <span className="font-medium text-[#241f1a]">
                    {scan.geo.toFixed(1)}
                  </span>
                </span>
              )}
              {scan.s !== undefined && (
                <>
                  <span className="text-[#b8afa6]">·</span>
                  <span>
                    <span className="text-[#8d8378]">
                      {t.result.secondOpinionShort}
                    </span>{" "}
                    <span className="font-medium text-[#241f1a]">
                      {scan.s.toFixed(1)}
                    </span>
                  </span>
                </>
              )}
              {scan.l !== undefined && (
                <>
                  <span className="text-[#b8afa6]">·</span>
                  <span>
                    <span className="text-[#7a5bd6]">
                      {t.result.learnedShort}
                    </span>{" "}
                    <span className="font-medium text-[#5b43ad]">
                      {scan.l.toFixed(1)}
                    </span>
                  </span>
                </>
              )}
            </div>
          )}
          {yourLatest && (
            <VsYouChip yourOverall={yourLatest.overall} theirOverall={scan.o} />
          )}
        </m.header>

        <m.div variants={REVEAL} initial="hidden" animate="visible">
          <div className="max-w-sm mx-auto">
            <BellCurve score={scan.o} label={t.result.overallDistribution} />
          </div>
        </m.div>

        <m.div variants={REVEAL} initial="hidden" animate="visible">
          <div className="rounded-2xl border border-[#241f1a]/10 bg-white/55 p-6 shadow-[0_18px_55px_-42px_rgba(36,31,26,0.32)] backdrop-blur-md">
            <p className="mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-[#6f625a]">
              {t.result.radarLabel}
            </p>
            <RadarChart categoryScores={scan.c} />
          </div>
        </m.div>

        <m.div variants={REVEAL} initial="hidden" animate="visible">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#241f1a]/10 bg-white/50 px-4 py-3 text-xs text-[#6f625a] shadow-[0_14px_42px_-36px_rgba(36,31,26,0.28)] backdrop-blur-md">
            <span>
              {t.calibration[scan.g]} · {t.calibration[scan.e]}
            </span>
            <Link
              href="/scan"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#153f39] px-4 py-2.5 text-xs font-medium text-white shadow-[0_16px_34px_-24px_rgba(21,63,57,0.55)] transition hover:bg-[#1f5a52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f6268]/35 sm:w-auto"
            >
              {t.share.startYourOwn}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </m.div>

        <p className="mx-auto max-w-md text-center text-[11px] leading-relaxed text-[#6f625a]">
          {t.share.privacyNote}
        </p>
      </article>
    </>
  );
}

function VsYouChip({
  yourOverall,
  theirOverall,
}: {
  yourOverall: number;
  theirOverall: number;
}) {
  const { t } = useT();
  const diff = yourOverall - theirOverall;
  const abs = Math.abs(diff);
  const Icon = diff > 0.05 ? TrendingUp : diff < -0.05 ? TrendingDown : Minus;
  const tone =
    diff > 0.05 ? "text-good" : diff < -0.05 ? "text-warn" : "text-[#6f625a]";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return (
    <div className="mt-2 inline-flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-2xl border border-[#241f1a]/10 bg-white/50 px-3 py-2 text-xs shadow-[0_12px_28px_-24px_rgba(36,31,26,0.3)] backdrop-blur-md sm:rounded-full sm:py-1">
      <Icon className={`h-3 w-3 ${tone}`} />
      <span className={`tabular-nums font-medium ${tone}`}>
        {sign}
        {abs.toFixed(1)}
      </span>
      <span className="text-[#8d8378]">
        · {t.share.vsYou} {yourOverall.toFixed(1)}
      </span>
    </div>
  );
}
