"use client";

import { Sparkles, Brush, HeartPulse, Stethoscope } from "lucide-react";
import { m } from "framer-motion";
import type { ScanResult } from "@/lib/scoring";
import type { MetricKey } from "@/types";
import { useT } from "@/lib/i18n";

interface AdviceCardProps {
  result: ScanResult;
}

const DIFFICULTY_META: Record<
  "easy" | "mid" | "hard",
  { label_th: string; label_en: string; tone: string; Icon: typeof Brush }
> = {
  easy: {
    label_th: "ทำได้เลย",
    label_en: "do now",
    tone: "text-good bg-good/10 border-good/30",
    Icon: Brush,
  },
  mid: {
    label_th: "ปรับ lifestyle",
    label_en: "lifestyle",
    tone: "text-[#067e96] bg-[#eef8f8]/70 border-[#067e96]/25 backdrop-blur-md",
    Icon: HeartPulse,
  },
  hard: {
    label_th: "ระยะยาว/หัตถการ",
    label_en: "long-term",
    tone: "text-[#5b43ad] bg-[#f3efff]/70 border-[#7a5bd6]/25 backdrop-blur-md",
    Icon: Stethoscope,
  },
};

export function AdviceCard({ result }: AdviceCardProps) {
  const { t, lang } = useT();
  const advice = result.aiAdvice;
  if (!advice || advice.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#067e96]">
            {lang === "th" ? "คำแนะนำส่วนตัว" : "Personalized advice"}
          </p>
          <h3 className="text-2xl font-semibold text-[#241f1a]">
            {lang === "th"
              ? "5 จุดที่พัฒนาได้ — แบบเฉพาะคุณ"
              : "5 areas to improve — personalized"}
          </h3>
          <p className="max-w-md text-xs leading-relaxed text-[#6f625a]">
            {lang === "th"
              ? "วิเคราะห์จากภาพจริงและค่าวัดสัดส่วนของคุณ → เขียนแนวทางเฉพาะใบหน้าคุณ"
              : "We read your actual photo and proportion measurements to write advice tailored to your face."}
          </p>
        </div>
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[#067e96]/20 bg-[#eef8f8]/70 text-[#067e96] shadow-[0_16px_34px_-28px_rgba(6,126,150,0.75)] backdrop-blur-md">
          <Sparkles className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-3">
        {advice.map((item, i) => {
          const meta = DIFFICULTY_META[item.difficulty] ?? DIFFICULTY_META.mid;
          const Icon = meta.Icon;
          const localizedMetric =
            (t.metric as Record<string, string>)[item.metric] ?? item.metric;
          return (
            <m.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="space-y-3 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-4 text-[#241f1a] shadow-[0_16px_46px_-38px_rgba(36,31,26,0.3)] backdrop-blur-md transition-colors hover:border-[#241f1a]/20 hover:bg-white/65"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[#8d8378]">
                    #{i + 1}
                  </p>
                  <p className="text-sm font-semibold text-[#241f1a]">
                    {localizedMetric}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${meta.tone} flex-none`}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {lang === "th" ? meta.label_th : meta.label_en}
                </span>
              </div>

              <p className="text-sm leading-relaxed text-[#403932]">
                {item.observation}
              </p>

              <ul className="space-y-1.5 pt-1">
                {item.recommendations.map((rec, j) => (
                  <li
                    key={j}
                    className="flex items-start gap-2 text-sm leading-relaxed text-[#6f625a]"
                  >
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-[#067e96]" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </m.div>
          );
        })}
      </div>

      <p className="text-[10px] leading-relaxed text-[#8d8378]">
        {lang === "th"
          ? "คำแนะนำนี้ใช้เป็นข้อมูลประกอบเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์ โปรดปรึกษาผู้เชี่ยวชาญก่อนทำหัตถการใดๆ"
          : "Informational guidance only, not medical advice. Consult a qualified professional before any procedure."}
      </p>
    </div>
  );
}
