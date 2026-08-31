"use client";

/**
 * Phase 124 — 90-Day Looksmax Roadmap.
 *
 * Reorganizes the Phase 122 `aiAdvice` array into three time-boxed
 * phases by difficulty:
 *   - NOW (this week)      — easy: makeup, styling, camera angle
 *   - WEEKS 2-6            — mid: lifestyle, exercise, skincare
 *   - WEEKS 7-12+ (long)   — hard: structural / long-term / surgical
 *
 * No new Gemini call required — this is a presentation reorganization
 * of advice already in `result.aiAdvice`. Adds:
 *   - week-numbered phase labels
 *   - estimated next-scan-checkpoint date (today + 30 days)
 *   - one CTA encouraging the user to come back
 *
 * The card turns "5 things to fix" into "a plan you can follow."
 */

import { useMemo } from "react";
import { m } from "framer-motion";
import {
  CalendarCheck,
  Clock,
  Compass,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { ScanResult } from "@/lib/scoring";
import { useT } from "@/lib/i18n";

interface RoadmapCardProps {
  result: ScanResult;
}

type Difficulty = "easy" | "mid" | "hard";

interface PhaseDef {
  key: Difficulty;
  label_th: string;
  label_en: string;
  range_th: string;
  range_en: string;
  hint_th: string;
  hint_en: string;
  Icon: typeof Sparkles;
  tone: string;
  muted: string;
  body: string;
  bullet: string;
  ring: string;
}

const PHASES: PhaseDef[] = [
  {
    key: "easy",
    label_th: "เริ่มจากพื้นฐาน",
    label_en: "start with basics",
    range_th: "สัปดาห์นี้",
    range_en: "this week",
    hint_th: "เริ่มจากรูป แสง การดูแลผิว หรือ grooming ที่ปรับได้ก่อน",
    hint_en: "Start with photo quality, lighting, skincare, or grooming changes first.",
    Icon: Sparkles,
    tone: "text-[#2f7d5f] dark:text-[#7df2c7]",
    muted: "text-[#4d6b5d] dark:text-white/70",
    body: "text-[#24352e] dark:text-white/90",
    bullet: "bg-[#2f7d5f]/75 dark:bg-[#7df2c7]",
    ring:
      "border-[#2f7d5f]/20 bg-[#effaf5] text-[#241f1a] dark:border-[#7df2c7]/25 dark:bg-[#071a18]/90 dark:text-white",
  },
  {
    key: "mid",
    label_th: "ลงทุน lifestyle",
    label_en: "lifestyle build",
    range_th: "สัปดาห์ที่ 2–6",
    range_en: "weeks 2–6",
    hint_th: "สะสม 30+ วันถึงเห็นชัด",
    hint_en: "compound over 30+ days",
    Icon: Target,
    tone: "text-[#3f6268] dark:text-[#7ed8e6]",
    muted: "text-[#52666a] dark:text-white/70",
    body: "text-[#26363a] dark:text-white/90",
    bullet: "bg-[#3f6268]/75 dark:bg-[#7ed8e6]",
    ring:
      "border-[#3f6268]/20 bg-[#eef3f2] text-[#241f1a] dark:border-[#7ed8e6]/25 dark:bg-[#071620]/90 dark:text-white",
  },
  {
    key: "hard",
    label_th: "ระยะยาว / หัตถการ",
    label_en: "long-term play",
    range_th: "สัปดาห์ที่ 7–12+",
    range_en: "weeks 7–12+",
    hint_th: "ปรึกษาผู้เชี่ยวชาญก่อน",
    hint_en: "consult a professional",
    Icon: Compass,
    tone: "text-[#8a5a24] dark:text-[#f3c47d]",
    muted: "text-[#72583b] dark:text-white/70",
    body: "text-[#3b2d1b] dark:text-white/90",
    bullet: "bg-[#9a6a2f]/75 dark:bg-[#f3c47d]",
    ring:
      "border-[#9a6a2f]/20 bg-[#fff7e8] text-[#241f1a] dark:border-[#f3c47d]/25 dark:bg-[#20160a]/90 dark:text-white",
  },
];

function formatCheckpoint(days: number, lang: "th" | "en"): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RoadmapCard({ result }: RoadmapCardProps) {
  const { t, lang } = useT();
  const advice = result.aiAdvice;

  // Group by difficulty
  const byPhase = useMemo(() => {
    const map: Record<Difficulty, NonNullable<ScanResult["aiAdvice"]>> = {
      easy: [],
      mid: [],
      hard: [],
    };
    if (advice) {
      for (const a of advice) {
        const d = (a.difficulty ?? "mid") as Difficulty;
        if (map[d]) map[d].push(a);
      }
    }
    return map;
  }, [advice]);

  if (!advice || advice.length === 0) return null;

  const totalCount = advice.length;
  const easyCount = byPhase.easy.length;
  const midCount = byPhase.mid.length;
  const hardCount = byPhase.hard.length;

  return (
    <div className="min-w-0 space-y-5">
      {/* Header */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#3f6268]">
            {lang === "th" ? "แผน 90 วัน" : "90-day roadmap"}
          </p>
          <h3 className="font-serif italic font-light text-2xl">
            {lang === "th"
              ? "จาก scan เดียว → 3 เดือนข้างหน้า"
              : "From a single scan → the next 3 months"}
          </h3>
          <p className="text-xs text-muted/80 max-w-md leading-relaxed">
            {lang === "th"
              ? `${totalCount} จุดที่พัฒนาได้ จัดเรียงตาม impact + เวลา — เริ่มเลย, สะสม, แล้วค่อยลงทุนระยะยาว`
              : `${totalCount} actionable items, sequenced for impact — quick wins, lifestyle build, then long-term`}
          </p>
        </div>
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#241f1a] shadow-[0_14px_28px_-22px_rgba(36,31,26,0.65)]">
          <CalendarCheck className="h-4 w-4 text-white" />
        </div>
      </div>

      {/* Phase summary chips */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f7d5f]/20 bg-[#effaf5] px-2.5 py-1 text-[#2f7d5f] dark:border-[#7df2c7]/25 dark:bg-[#071a18]/90 dark:text-[#7df2c7]">
          <Sparkles className="h-3 w-3" />
          {easyCount} {lang === "th" ? "ทำได้เลย" : "quick wins"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3f6268]/20 bg-[#eef3f2] px-2.5 py-1 text-[#3f6268] dark:border-[#7ed8e6]/25 dark:bg-[#071620]/90 dark:text-[#7ed8e6]">
          <Target className="h-3 w-3" />
          {midCount} {lang === "th" ? "lifestyle" : "lifestyle"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#9a6a2f]/20 bg-[#fff7e8] px-2.5 py-1 text-[#8a5a24] dark:border-[#f3c47d]/25 dark:bg-[#20160a]/90 dark:text-[#f3c47d]">
          <Compass className="h-3 w-3" />
          {hardCount} {lang === "th" ? "ระยะยาว" : "long-term"}
        </span>
      </div>

      {/* Phase 126 — Potential projection bar. Renders only when Gemini
          returned absolute upside estimates. Shows current score → after
          each phase, with an honest note on realism. */}
      {result.aiPotential && (
        <PotentialBar
          current={result.aiScore ?? result.overall}
          potential={result.aiPotential}
          easyCount={easyCount}
          midCount={midCount}
          hardCount={hardCount}
          lang={lang}
        />
      )}

      {/* Phase blocks */}
      <div className="space-y-4">
        {PHASES.map((phase, pi) => {
          const items = byPhase[phase.key];
          if (items.length === 0) return null;
          const Icon = phase.Icon;
          return (
            <m.div
              key={phase.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: pi * 0.08 }}
              className={`rounded-2xl border p-4 space-y-3 ${phase.ring}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`h-4 w-4 flex-none ${phase.tone}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-medium uppercase tracking-wider ${phase.tone}`}>
                      {lang === "th" ? phase.label_th : phase.label_en}
                    </p>
                    <p className={`text-[10px] ${phase.muted}`}>
                      {lang === "th" ? phase.range_th : phase.range_en}
                      {" · "}
                      {lang === "th" ? phase.hint_th : phase.hint_en}
                    </p>
                  </div>
                </div>
                <span className={`flex-none text-[10px] ${phase.muted}`}>
                  {items.length}{" "}
                  {lang === "th" ? "รายการ" : items.length === 1 ? "item" : "items"}
                </span>
              </div>

              <ul className="space-y-2.5 pl-1">
                {items.map((it, i) => {
                  const localizedMetric =
                    (t.metric as Record<string, string>)[it.metric] ?? it.metric;
                  return (
                    <li key={i} className="space-y-1.5">
                      <p className="text-sm font-semibold text-[#241f1a] dark:text-white">
                        {localizedMetric}
                      </p>
                      <p className={`text-xs italic leading-relaxed ${phase.muted}`}>
                        {it.observation}
                      </p>
                      <ul className="space-y-1 pt-0.5">
                        {it.recommendations.map((rec, j) => (
                          <li
                            key={j}
                            className={`flex items-start gap-2 text-xs leading-relaxed ${phase.body}`}
                          >
                            <span className={`mt-1.5 inline-block h-1 w-1 flex-none rounded-full ${phase.bullet}`} />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </m.div>
          );
        })}
      </div>

      {/* Checkpoint CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-4 text-[#241f1a] shadow-[0_16px_46px_-38px_rgba(36,31,26,0.3)] backdrop-blur-md dark:border-white/10 dark:bg-[#101827]/80 dark:text-white">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#3f6268]" />
            <p className="text-sm font-medium text-[#241f1a] dark:text-white">
              {lang === "th" ? "Checkpoint ต่อไป" : "Next checkpoint"}
            </p>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-[#5f574f] dark:text-white/72">
            {lang === "th"
              ? `กลับมาสแกนซ้ำใน 30 วัน (~${formatCheckpoint(30, lang)}) แล้วใช้ Compare เพื่อติดตามการเปลี่ยนแปลง`
              : `Scan again in 30 days (~${formatCheckpoint(30, lang)}). Use Compare to review measured changes.`}
          </p>
        </div>
        <Link
          href="/history"
          className="inline-flex min-h-[44px] flex-none items-center gap-1.5 rounded-lg border border-[#3f6268]/25 bg-[#eef3f2] px-3 py-1.5 text-xs text-[#3f6268] transition hover:bg-[#e4eeee] dark:border-[#7ed8e6]/25 dark:bg-[#071620]/90 dark:text-[#7ed8e6]"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          {lang === "th" ? "ดูประวัติ" : "View history"}
        </Link>
      </div>

      {/* Footer disclaimer (already on AdviceCard, but worth repeating here) */}
      <p className="text-[10px] leading-relaxed text-[#6a6259] dark:text-white/55">
        {lang === "th"
          ? "แผนนี้ใช้เป็นข้อมูลประกอบเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์ โปรดปรึกษาผู้เชี่ยวชาญก่อนทำหัตถการใดๆ"
          : "Informational plan only, not medical guidance. Consult a qualified professional before any procedure."}
      </p>
    </div>
  );
}

/**
 * Phase 126 — horizontal progression bar showing AI-estimated score
 * upside after each roadmap phase. Visual feedback for "is this work
 * worth it?" — anchors expectations honestly (Gemini was instructed not
 * to inflate estimates).
 */
function PotentialBar({
  current,
  potential,
  easyCount,
  midCount,
  hardCount,
  lang,
}: {
  current: number;
  potential: { ifEasy: number; ifMid: number; ifHard: number; note?: string };
  easyCount: number;
  midCount: number;
  hardCount: number;
  lang: "th" | "en";
}) {
  const SCALE_MIN = Math.max(0, Math.min(current, potential.ifEasy) - 0.5);
  const SCALE_MAX = Math.min(10, Math.max(potential.ifHard, current) + 0.5);
  const span = SCALE_MAX - SCALE_MIN || 1;

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - SCALE_MIN) / span) * 100));

  const stops: Array<{
    value: number;
    label_th: string;
    label_en: string;
    tone: string;
    bg: string;
    visible: boolean;
  }> = [
    {
      value: current,
      label_th: "ตอนนี้",
      label_en: "now",
      tone: "text-[#241f1a] dark:text-white",
      bg: "bg-[#241f1a] dark:bg-white",
      visible: true,
    },
    {
      value: potential.ifEasy,
      label_th: "ถ้าทำ easy",
      label_en: "+ easy",
      tone: "text-[#2f7d5f] dark:text-[#7df2c7]",
      bg: "bg-[#2f7d5f] dark:bg-[#7df2c7]",
      visible: easyCount > 0,
    },
    {
      value: potential.ifMid,
      label_th: "ถ้าทำต่อ lifestyle",
      label_en: "+ lifestyle",
      tone: "text-[#3f6268] dark:text-[#7ed8e6]",
      bg: "bg-[#3f6268] dark:bg-[#7ed8e6]",
      visible: midCount > 0,
    },
    {
      value: potential.ifHard,
      label_th: "ปลายทาง",
      label_en: "long-term",
      tone: "text-[#8a5a24] dark:text-[#f3c47d]",
      bg: "bg-[#8a5a24] dark:bg-[#f3c47d]",
      visible: hardCount > 0,
    },
  ];

  return (
    <div className="min-w-0 space-y-3 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-4 text-[#241f1a] shadow-[0_16px_46px_-38px_rgba(36,31,26,0.3)] backdrop-blur-md dark:border-white/10 dark:bg-[#101827]/80 dark:text-white">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-[#3f6268]" />
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#3f6268]">
          {lang === "th" ? "ประมาณการหลังปรับแผน" : "Projected range"}
        </p>
      </div>

      {/* Bar */}
      <div className="relative mx-1 h-20 sm:h-12">
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#241f1a]/10 dark:bg-white/14" />
        {/* Filled segment from current → ifHard */}
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#3f6268] dark:bg-[#7ed8e6]"
          style={{
            left: `${pct(current)}%`,
            width: `${pct(potential.ifHard) - pct(current)}%`,
          }}
        />

        {/* Stops */}
        {stops
          .filter((s) => s.visible)
          .map((s, i) => {
            const left = pct(s.value);
            return (
              <div
                key={i}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, transform: "translate(-50%, -50%)" }}
              >
                <div
                  className={`h-3 w-3 rounded-full border-2 border-[#fbfaf7] shadow-[0_8px_18px_rgba(36,31,26,0.18)] dark:border-[#0b1020] ${s.bg}`}
                />
                <div
                  className={`absolute top-4 left-1/2 w-16 -translate-x-1/2 text-[10px] leading-tight ${s.tone}`}
                >
                  <span className="block text-center font-medium tabular-nums">
                    {s.value.toFixed(1)}
                  </span>
                  <span className="block text-center opacity-70">
                    {lang === "th" ? s.label_th : s.label_en}
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      {potential.note && (
        <p className="pt-6 text-[11px] italic leading-relaxed text-[#5f574f] dark:text-white/70">
          {potential.note}
        </p>
      )}
    </div>
  );
}
