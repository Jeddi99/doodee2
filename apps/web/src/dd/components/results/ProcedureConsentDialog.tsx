"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Heart,
  Info,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

interface ProcedureConsentDialogProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export function ProcedureConsentDialog({
  open,
  onAccept,
  onCancel,
}: ProcedureConsentDialogProps) {
  const { lang } = useT();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="!flex w-[calc(100%-1rem)] max-w-md !max-h-[calc(100dvh-0.75rem)] !flex-col gap-0 !overflow-hidden p-0 !border-[#241f1a]/10 !bg-white/80 !text-[#241f1a] !shadow-[0_28px_90px_-54px_rgba(36,31,26,0.48)] !backdrop-blur-md sm:w-[calc(100%-1.5rem)] sm:!max-h-[calc(100dvh-1.5rem)]">
        <div className="shrink-0 border-b border-[#241f1a]/10 px-4 pb-3 pt-5 pr-12 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="mb-3 inline-flex items-center justify-center gap-2 rounded-full border border-[#3f6268]/25 bg-[#eef3f2]/70 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#3f6268] shadow-[0_14px_34px_-28px_rgba(63,98,104,0.45)] backdrop-blur-md">
            <ShieldCheck className="h-3 w-3" />
            {lang === "th" ? "ก่อนเริ่มใช้งาน" : "Before you start"}
          </div>
          <DialogTitle className="text-[1.7rem] sm:text-2xl">
            {lang === "th"
              ? "ตรวจสอบเงื่อนไขก่อนดูภาพอ้างอิง"
              : "Review before viewing references"}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-xs leading-relaxed text-[#6a6259]">
            {lang === "th"
              ? "ภาพอ้างอิงเป็นแนวทางเพื่อช่วยคิดและตั้งคำถาม ไม่ใช่ผลลัพธ์ทางการแพทย์จริง"
              : "These references are directional visuals for questions and decisions, not medical predictions."}
          </DialogDescription>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-3 sm:px-6 sm:py-5">
          <ConsentLine
            icon={<Info className="h-4 w-4 text-[#3f6268]" />}
            title={lang === "th" ? "ภาพเป็นเพียงภาพอ้างอิง" : "Visual is directional"}
            body={
              lang === "th"
                ? "ผลจริงขึ้นกับโครงสร้างใบหน้า เทคนิคของแพทย์ และการดูแลหลังทำ ภาพนี้จึงไม่ใช่คำสัญญาผลลัพธ์"
                : "Actual results depend on facial structure, clinician technique, and aftercare. This is not an outcome guarantee."
            }
          />
          <ConsentLine
            icon={<Heart className="h-4 w-4 text-[#9a6a2f]" />}
            title={
              lang === "th"
                ? "ควรปรึกษาผู้เชี่ยวชาญก่อนตัดสินใจ"
                : "Consult a qualified specialist"
            }
            body={
              lang === "th"
                ? "ใช้ภาพนี้เพื่อเตรียมคำถามและทิศทางการคุย ไม่ควรใช้แทนคำแนะนำทางการแพทย์"
                : "Use this visual to prepare questions and direction. Do not use it instead of medical advice."
            }
          />
          <ConsentLine
            icon={<AlertTriangle className="h-4 w-4 text-bad/85" />}
            title={lang === "th" ? "ไม่ใช่ภาพการแพทย์" : "Not a clinical record"}
            body={
              lang === "th"
                ? "อย่านำภาพนี้ไปอ้างเป็นผลลัพธ์จริง หรือใช้แทนการประเมินจากแพทย์"
                : "Do not present this as a real clinical result or as a substitute for professional assessment."
            }
          />
          <ConsentLine
            icon={<ShieldCheck className="h-4 w-4 text-good/85" />}
            title={lang === "th" ? "ใช้เฉพาะคำขอนี้" : "Used only for this request"}
            body={
              lang === "th"
                ? "รูปจะถูกส่งผ่าน DOODEE ไปยังผู้ให้บริการ AI เพื่อสร้างภาพอ้างอิงรอบนี้เท่านั้น"
                : "Your photo is sent through DOODEE to the configured AI provider to create this reference only."
            }
          />
        </div>

        <div className="shrink-0 space-y-3 border-t border-[#241f1a]/10 bg-white/75 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur-md sm:px-6 sm:pb-4">
          <p className="rounded-xl border border-[#241f1a]/10 bg-white/50 px-3 py-2 text-[11px] leading-relaxed text-[#4d463f] sm:text-[12px]">
            {lang === "th"
              ? "กดดำเนินการต่อเมื่อเข้าใจว่าภาพอ้างอิงไม่ใช่ผลลัพธ์ทางการแพทย์ และควรปรึกษาผู้เชี่ยวชาญก่อนตัดสินใจจริง"
              : "Continue only if you understand this is not a medical outcome and real decisions should be reviewed with a specialist."}
          </p>

          <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-[#6a6259] transition hover:bg-white/55 hover:text-[#241f1a] sm:w-auto sm:rounded-lg"
            >
              <X className="h-3.5 w-3.5" />
              {lang === "th" ? "ยังก่อน" : "Not now"}
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="order-first inline-flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#241f1a] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_38px_-28px_rgba(36,31,26,0.7)] transition hover:bg-[#342d27] sm:order-none sm:w-auto sm:min-h-[44px] sm:rounded-lg sm:py-1.5 sm:text-xs"
            >
              <Check className="h-3.5 w-3.5" />
              {lang === "th" ? "เข้าใจและดำเนินการต่อ" : "I understand and continue"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConsentLine({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#241f1a]/10 bg-white/50 p-3 shadow-[0_12px_30px_-26px_rgba(36,31,26,0.28)] backdrop-blur-md">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[#241f1a]/10 bg-white/50 backdrop-blur-md">
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[13px] font-medium text-[#241f1a]">{title}</p>
        <p className="text-[11px] leading-relaxed text-[#5f574f]">{body}</p>
      </div>
    </div>
  );
}
