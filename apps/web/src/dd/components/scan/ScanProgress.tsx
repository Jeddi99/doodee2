"use client";

// Phase 192f — step labels + done state + AI note now flow through the
// i18n dict so EN users see English while TH users see Thai.
//
import { CheckCircle2, Loader2, ScanFace, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";

export type ScanStage = "model" | "detecting" | "computing" | "ai" | "done";

interface ScanProgressProps {
  stage: ScanStage;
  hasAi: boolean;
}

interface StepDef {
  key: ScanStage;
  label: string;
  hint: string;
  /** Order index for status comparison. */
  order: number;
}

export function ScanProgress({ stage, hasAi }: ScanProgressProps) {
  const { t, lang } = useT();

  const stepsBase: StepDef[] = [
    {
      key: "model",
      label: lang === "th" ? "เตรียมโมเดลตรวจจับใบหน้า" : "Preparing face detection model",
      hint:
        lang === "th"
          ? "ทำงานผ่านเบราว์เซอร์ของคุณ"
          : "Running in your browser",
      order: 0,
    },
    {
      key: "detecting",
      label: t.scanProgress.steps.detecting.label,
      hint: t.scanProgress.steps.detecting.hint,
      order: 1,
    },
    {
      key: "computing",
      label: t.scanProgress.steps.computing.label,
      hint: t.scanProgress.steps.computing.hint,
      order: 2,
    },
  ];
  const stepAi: StepDef = {
    key: "ai",
    label: t.scanProgress.steps.ai.label,
    hint: t.scanProgress.steps.ai.hint,
    order: 3,
  };

  const steps = hasAi ? [...stepsBase, stepAi] : stepsBase;
  const currentOrder =
    stage === "done"
      ? steps.length
      : (steps.find((s) => s.key === stage)?.order ?? 0);

  const currentStepLabel =
    stage === "done"
      ? t.scanProgress.doneLabel
      : (steps.find((s) => s.key === stage)?.label ?? "");

  const progressPct = Math.min(
    100,
    ((currentOrder + (stage === "done" ? 0 : 1)) / steps.length) * 100,
  );

  return (
    <div
      className="mx-auto w-full max-w-md space-y-6"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${t.scanProgress.ariaLabelPrefix} — ${currentStepLabel}`}
    >
      <div className="relative mx-auto h-24 w-24">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full border border-white/60 bg-white/60 backdrop-blur-md"
        />
        <div
          aria-hidden
          className="absolute inset-2 rounded-full border border-[#3f6268]/16 bg-[#eff8f8]/70"
        />
        <Loader2
          aria-hidden
          className="absolute inset-0 h-full w-full animate-spin text-[#3f6268]/65 [animation-duration:1.4s]"
          strokeWidth={1.25}
        />
        <div className="relative flex h-full w-full items-center justify-center">
          {stage === "ai" ? (
            <Sparkles
              className="h-9 w-9 text-[#3f6268]"
              strokeWidth={1.5}
            />
          ) : (
            <ScanFace
              className="h-9 w-9 text-[#0f6f7f]"
              strokeWidth={1.5}
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step) => {
          const isComplete = step.order < currentOrder;
          const isCurrent = step.order === currentOrder && stage !== "done";
          const isUpcoming = step.order > currentOrder;
          return (
            <div
              key={step.key}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors duration-200 ${
                isCurrent
                  ? "border-[#3f6268]/25 bg-[#eff8f8]/70 backdrop-blur-md"
                  : isComplete
                    ? "border-white/60 bg-white/55 backdrop-blur-md"
                    : "border-white/50 bg-white/40 backdrop-blur-md"
              }`}
            >
              <div className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center">
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4 text-[#3f6268]" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#3f6268]" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-[#b5aa9f]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium transition-colors ${
                    isCurrent
                      ? "text-[#241f1a]"
                      : isComplete
                        ? "text-[#3f6268]"
                        : "text-[#5f574f]"
                  }`}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[#766e65]">
                  {step.hint}
                </p>
              </div>
              {isCurrent && (
                <span
                  aria-hidden
                  className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-[#3f6268]"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/40">
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-[#0f6f7f] to-[#047857] transition-transform duration-500 ease-out"
          style={{ transform: `scaleX(${progressPct / 100})` }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#3f6268] transition-[left] duration-500 ease-out"
          style={{ left: `calc(${progressPct}% - 4px)` }}
        />
      </div>

      {stage === "ai" && (
        <p className="text-center text-[11px] leading-relaxed text-[#3f6268]">
          {t.scanProgress.aiNote}
        </p>
      )}
    </div>
  );
}
