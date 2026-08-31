"use client";

/**
 * Phase 123 → 158.29 — AI summary card.
 *
 * Reads `result.aiReasoning` that Gemini wrote during the scan-time
 * scoring pass. With Phase 158.13's server-side proxy the user no
 * longer supplies an API key — the card always renders the reasoning
 * when present, and stays quiet when AI fell back to MediaPipe-only.
 *
 * Phase 158.29 — Loud "proof-of-work" framing so users can see this
 * is literally Gemini speaking, not a templated message. Shows model
 * id + confidence so it's not just word soup.
 */

import { m } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { PhotoQualityReport, ScanResult } from "@/lib/scoring";
import { useT } from "@/lib/i18n";

interface AiSummaryCardProps {
  result: ScanResult;
  /** Kept for API compat — quality flags would have already informed Gemini's reasoning. */
  quality?: PhotoQualityReport | null;
}

export function AiSummaryCard({ result }: AiSummaryCardProps) {
  const { lang } = useT();
  const reasoning = result.aiReasoning?.trim();
  if (!reasoning) return null;

  const confidencePct =
    typeof result.aiConfidence === "number"
      ? Math.round(result.aiConfidence * 100)
      : null;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl border border-[#241f1a]/10 bg-white/55 shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md"
    >
      <div className="relative overflow-hidden rounded-2xl p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7a5bd6]/20 to-transparent"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-none">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[#241f1a]/10 bg-white/45 backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-[#3f6268]" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a5bd6]">
                {lang === "th" ? "สรุปการประเมิน" : "Assessment summary"}
              </p>
            </div>
          </div>
          {confidencePct !== null && (
            <span
              className="inline-flex flex-none items-center gap-1 rounded-full border border-[#241f1a]/10 bg-white/45 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-[#4f4841] backdrop-blur-md"
              title={
                lang === "th"
                  ? "ระดับความมั่นใจของระบบในการประเมินรอบนี้"
                  : "System confidence for this assessment"
              }
            >
              {lang === "th" ? "ความมั่นใจ" : "confidence"} {confidencePct}%
            </span>
          )}
        </div>

        <blockquote
          aria-live="polite"
          className="relative mt-4 border-l-2 border-[#3f6268]/35 pl-4"
        >
          <p className="font-serif text-lg italic leading-relaxed text-[#241f1a] whitespace-pre-wrap md:text-xl">
            {reasoning}
          </p>
        </blockquote>

        {result.aiPerceived && (
          <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[10px] text-[#6a6259]">
            <span className="rounded-full border border-[#241f1a]/10 bg-white/45 px-2 py-0.5 backdrop-blur-md">
              {lang === "th" ? "สีหน้าที่เห็น" : "visible expression"}
              {": "}
              <span className="font-semibold text-[#241f1a]">
                {result.aiPerceived.expression}
              </span>
            </span>
            <span className="rounded-full border border-[#241f1a]/10 bg-white/45 px-2 py-0.5 backdrop-blur-md">
              {lang === "th" ? "คุณภาพรูป" : "photo"}
              {": "}
              <span className="font-semibold text-[#241f1a]">
                {result.aiPerceived.photoQuality}
              </span>
            </span>
          </div>
        )}

        <p className="relative mt-4 border-t border-[#241f1a]/10 pt-2.5 text-[9px] uppercase tracking-[0.18em] text-[#766e65]">
          {lang === "th" ? "จัดทำจากข้อมูลในรายงานนี้ ดูนโยบายความเป็นส่วนตัวสำหรับขอบเขตการประมวลผล" : "Prepared from this assessment. See Privacy for what is processed."}
        </p>
      </div>
    </m.div>
  );
}
