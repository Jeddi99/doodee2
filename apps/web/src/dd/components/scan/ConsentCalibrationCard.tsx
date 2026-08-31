"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccessToken } from "@/lib/supabase/auth-client";
import { useT } from "@/lib/i18n";
import type { PhotoQualityReport, ScanResult } from "@/lib/scoring";
import type { ScoreObservation } from "@/lib/scoring/accuracy-bench";

export type ConsentCaptureSource = NonNullable<ScoreObservation["source"]>;

type SubmitState = "idle" | "submitting" | "sent" | "failed" | "login";

type Props = {
  result: ScanResult;
  quality: PhotoQualityReport | null;
  source: ConsentCaptureSource;
};

export function ConsentCalibrationCard({ result, quality, source }: Props) {
  const { lang } = useT();
  const [state, setState] = useState<SubmitState>("idle");
  const sampleKey = useMemo(
    () =>
      [
        round1(result.overall),
        round1(result.aiScore ?? -1),
        round3(result.confidence),
        quality?.overall ?? "none",
        source,
      ].join(":"),
    [quality?.overall, result.aiScore, result.confidence, result.overall, source]
  );

  useEffect(() => {
    setState("idle");
  }, [sampleKey]);

  if (import.meta.env.VITE_DATASET_CONSENT_CARD !== "1") return null;

  const copy =
    lang === "th"
      ? {
          title: "ช่วยปรับคะแนน DOODEE ให้แม่นขึ้น",
          body: "ส่งเฉพาะคะแนน คุณภาพรูป และแหล่งที่มาของภาพแบบไม่ระบุตัวตน รูปจริงจะไม่ถูกส่งในรอบนี้",
          bullets: ["ต้องกดส่งเอง", "ไม่ส่งรูป", "ไม่เปิดเผยบัญชี"],
          action: "ยินยอมส่งข้อมูลคะแนน",
          sending: "กำลังส่ง",
          sent: "รับข้อมูลแล้ว",
          failed: "ยังส่งไม่ได้ตอนนี้",
          login: "เข้าสู่ระบบก่อนส่งข้อมูล",
        }
      : {
          title: "Help make DOODEE scoring more accurate",
          body: "Sends only anonymized score, photo-quality, and capture-source signals. The real photo is not sent in this phase.",
          bullets: ["Explicit opt-in", "No photo upload", "No account exposed"],
          action: "Consent and send score signal",
          sending: "Sending",
          sent: "Signal saved",
          failed: "Not available right now",
          login: "Sign in before sending",
        };

  async function submit(): Promise<void> {
    if (state === "submitting" || state === "sent") return;
    setState("submitting");
    const token = await getAccessToken(true);
    if (!token) {
      setState("login");
      return;
    }
    const response = await fetch("/api/dataset/consent-sample", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildPayload(result, quality, source)),
    }).catch(() => null);
    setState(response?.ok ? "sent" : "failed");
  }

  const statusText =
    state === "sent"
      ? copy.sent
      : state === "failed"
        ? copy.failed
        : state === "login"
          ? copy.login
          : null;

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-white/60 bg-white/65 p-4 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md dark:border-white/12 dark:bg-white/[0.06] dark:text-white sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#0f6f7f]/20 bg-[#e8f7f8] text-[#0f6f7f] dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-200">
              <Database className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold">{copy.title}</h3>
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-[#5f574f] dark:text-white/70">
            {copy.body}
          </p>
          <div className="flex flex-wrap gap-2">
            {copy.bullets.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded-full border border-[#0f6f7f]/15 bg-[#eff8f8]/80 px-2.5 py-1 text-[11px] font-semibold text-[#0f6f7f] dark:border-cyan-300/15 dark:bg-cyan-300/10 dark:text-cyan-100"
              >
                <ShieldCheck className="h-3 w-3" />
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-[220px]">
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={state === "submitting" || state === "sent"}
            className="h-11 gap-2 rounded-xl bg-[#171412] text-sm font-semibold text-white hover:bg-[#2f2924] disabled:opacity-70 dark:bg-white dark:text-[#0d0b1f] dark:hover:bg-white/90"
          >
            {state === "submitting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : state === "sent" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {state === "submitting"
              ? copy.sending
              : state === "sent"
                ? copy.sent
                : copy.action}
          </Button>
          {statusText && state !== "sent" && (
            <p role="status" className="text-center text-xs font-semibold text-[#8a5b10] dark:text-amber-200">
              {statusText}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function buildPayload(
  result: ScanResult,
  quality: PhotoQualityReport | null,
  source: ConsentCaptureSource
) {
  const score = round1(result.aiScore ?? result.overall);
  const modelVersion =
    result.aiSource === "ai" || result.aiScore !== undefined
      ? "doodee-ai-score-v1"
      : "doodee-geometric-score-v1";
  return {
    consent: true,
    observation: {
      identityId: "account-self",
      score,
      ...(quality ? { quality: quality.overall } : {}),
      confidence: round3(result.confidence),
      source,
      modelVersion,
    },
    scan: {
      overall: round1(result.overall),
      ...(result.aiScore !== undefined ? { aiScore: round1(result.aiScore) } : {}),
      ...(result.geometric !== undefined ? { geometric: round1(result.geometric) } : {}),
      ...(result.secondOpinion !== undefined
        ? { secondOpinion: round1(result.secondOpinion) }
        : {}),
      ...(result.learned !== undefined ? { learned: round1(result.learned) } : {}),
      confidence: round3(result.confidence),
      ...(quality
        ? { quality: { overall: quality.overall, issueCount: quality.issues.length } }
        : {}),
    },
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
