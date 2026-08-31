"use client";

import { useEffect, useState } from "react";
import { m } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";

interface AnalysisStepsProps {
  scanStage: "model" | "detecting" | "computing" | "ai" | "done";
  isFreeUser: boolean;
  onMinTimeReached: () => void;
  onCancel: () => void;
}

function emptyCompleted(): boolean[] {
  return [false, false, false, false, false];
}

export function AnalysisSteps({
  scanStage,
  isFreeUser,
  onMinTimeReached,
  onCancel,
}: AnalysisStepsProps) {
  const { t, lang } = useT();
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(emptyCompleted);

  const steps =
    lang === "th"
      ? [
          "กำลังอ่านสัดส่วนใบหน้า",
          "กำลังประเมินสมดุลโดยรวม",
          "กำลังจัดลำดับสิ่งที่ควรทำก่อน",
          "กำลังเตรียมรายงานส่วนตัว",
        ]
      : [
          "Reading facial proportions",
          "Assessing overall balance",
          "Prioritizing what to review first",
          "Preparing your private report",
        ];
  const visibleSteps = [
    lang === "th" ? "กำลังเตรียมระบบอ่านใบหน้า" : "Preparing face reading",
    ...steps,
  ];
  const processingCopy =
    scanStage === "ai"
      ? lang === "th"
        ? "กำลังจัดลำดับรายงานขั้นสุดท้าย โดยทั่วไปใช้เวลาประมาณ 20-90 วินาที"
        : "Finalizing the report. Usually takes about 20-90 seconds."
      : isFreeUser
        ? lang === "th"
          ? "กำลังอ่านสัดส่วนใบหน้าอย่างปลอดภัย"
          : "Preparing your report securely"
        : lang === "th"
          ? "กำลังประเมินสมดุลโดยรวม"
          : "Processing your report";

  useEffect(() => {
    if (!isFreeUser) return;

    const totalDuration = 18000;
    const stepCumulative = [3000, 6500, 10000, 14500, 18000];
    const startTime = Date.now();

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalDuration) * 100);
      let currentStep = 0;
      const nextCompleted = emptyCompleted();

      for (let i = 0; i < visibleSteps.length; i++) {
        if (elapsed >= stepCumulative[i]!) {
          nextCompleted[i] = true;
          currentStep = i + 1;
        } else {
          currentStep = i;
          break;
        }
      }

      setProgress(pct);
      setActiveStep((prev) => {
        const next = Math.min(visibleSteps.length - 1, currentStep);
        return prev === next ? prev : next;
      });
      setCompleted((prev) => {
        const changed = prev.some((value, i) => value !== nextCompleted[i]);
        return changed ? nextCompleted : prev;
      });

      if (elapsed >= totalDuration) {
        window.clearInterval(timer);
        onMinTimeReached();
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [isFreeUser, onMinTimeReached, visibleSteps.length]);

  useEffect(() => {
    if (isFreeUser) return;

    if (scanStage === "model") {
      setActiveStep(0);
      setCompleted(emptyCompleted());
      setProgress(8);
    } else if (scanStage === "detecting") {
      setActiveStep(1);
      setCompleted([true, false, false, false, false]);
      setProgress(28);
    } else if (scanStage === "computing") {
      setActiveStep(2);
      setCompleted([true, true, false, false, false]);
      setProgress(52);
    } else if (scanStage === "ai") {
      setActiveStep(3);
      setCompleted([true, true, true, false, false]);
      setProgress(76);
    } else if (scanStage === "done") {
      setActiveStep(4);
      setCompleted([true, true, true, true, true]);
      setProgress(100);
      onMinTimeReached();
    }
  }, [scanStage, isFreeUser, onMinTimeReached]);

  return (
    <div className="relative flex min-h-[500px] select-none flex-col items-center justify-center px-4 py-12">
      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex w-full max-w-lg flex-col space-y-8 rounded-3xl border border-[#241f1a]/10 bg-white/82 px-6 py-8 text-[#241f1a] shadow-[0_24px_70px_-42px_rgba(36,31,26,0.34)] backdrop-blur-md dark:border-[#263149] dark:bg-[#070b1a] dark:text-white dark:shadow-[0_24px_70px_-42px_rgba(0,0,0,0.9)] sm:p-8"
      >
        <div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/70 dark:border-[#263149] dark:bg-[#0b1020]">
          <div className="absolute h-24 w-24 rounded-full border border-[#241f1a]/10 dark:border-white/10" />
          <div className="absolute h-16 w-16 rounded-full border border-[#06b6d4]/25" />
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#06b6d4]/25 bg-[#e9fbff] dark:bg-[#052b36]">
            <Loader2 className="h-8 w-8 animate-spin text-[#67e8f9]" />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold text-[#241f1a] dark:text-white">
            {t.scan.processing}
          </h2>
          <p className="text-sm leading-relaxed text-[#5f574f] dark:text-white/64">
            {processingCopy}
          </p>
        </div>

        <div className="flex flex-col space-y-4">
          {visibleSteps.map((text, idx) => {
            const isCompleted = completed[idx];
            const isActive = activeStep === idx && !isCompleted;

            return (
              <m.div
                key={text}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                className={`flex items-center space-x-4 rounded-xl border p-4 transition-colors duration-200 ${
                  isActive
                    ? "border-[#06b6d4]/30 bg-[#e9fbff] dark:bg-[#052b36]"
                    : "border-[#241f1a]/10 bg-white/70 dark:border-[#263149] dark:bg-[#0b1020]"
                }`}
              >
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <m.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-[#06b6d4]/30 bg-[#e9fbff] dark:bg-[#052b36]"
                    >
                      <Check className="h-4 w-4 text-[#67e8f9]" />
                    </m.div>
                  ) : isActive ? (
                    <Loader2 className="h-6 w-6 animate-spin text-[#67e8f9]" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[#241f1a]/15 text-xs font-medium text-[#6a6259] dark:border-white/15 dark:text-white/46">
                      {idx + 1}
                    </div>
                  )}
                </div>

                <p
                  className={`min-w-0 flex-1 text-sm leading-relaxed transition-colors duration-200 md:text-base ${
                    isActive
                      ? "font-semibold text-[#241f1a] dark:text-white"
                      : isCompleted
                        ? "font-medium text-[#67e8f9]"
                        : "text-[#6a6259] dark:text-white/58"
                  }`}
                >
                  {text}
                </p>
              </m.div>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold uppercase tracking-[0.14em] text-[#6a6259] dark:text-white/52">
            <span>{lang === "th" ? "ความคืบหน้า" : "Progress"}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full border border-[#241f1a]/10 bg-white/70 dark:border-[#263149] dark:bg-[#0b1020]">
            <m.div
              className="h-full origin-left bg-gradient-to-r from-[#06b6d4] to-[#a855f7]"
              style={{ transform: `scaleX(${progress / 100})` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="flex w-full items-center justify-center space-x-2 rounded-xl border border-[#241f1a]/12 bg-white/70 px-6 py-3 text-sm font-medium text-[#4b423a] transition-colors hover:border-[#06b6d4]/40 hover:bg-white hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]/35 dark:border-[#263149] dark:bg-[#0b1020] dark:text-white/72 dark:hover:bg-[#11182b] dark:hover:text-white"
        >
          <X className="h-4 w-4" />
          <span>{t.scanCockpit.cancel}</span>
        </button>
      </m.div>
    </div>
  );
}
