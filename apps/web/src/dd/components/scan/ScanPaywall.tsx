"use client";

import { m } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface ScanPaywallProps {
  onUnlockClick: () => void;
  onCancel: () => void;
}

export function ScanPaywall({ onUnlockClick, onCancel }: ScanPaywallProps) {
  const { t, lang } = useT();

  return (
    <div className="relative flex min-h-[600px] select-none flex-col items-center justify-center px-4 py-12">
      <m.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex w-full max-w-md flex-col items-center space-y-7 rounded-3xl border border-[#263149] bg-[#070b1a] px-6 py-8 text-center text-white shadow-[0_22px_70px_-52px_rgba(0,0,0,0.78)] sm:p-8"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#06b6d4]/25 bg-[#052b36]">
          <ShieldCheck className="h-8 w-8 text-[#67e8f9]" />
        </div>

        <div className="space-y-3">
          <h2 className="font-serif text-3xl font-bold italic tracking-tight text-white">
            {lang === "th" ? "รายงานเต็มถูกล็อกไว้" : "Your full report is locked"}
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-white/68">
            {lang === "th"
              ? "ปลดล็อก Plus 30 วัน ราคาเปิดตัว 29 บาท หลังจากเห็น teaser แล้ว"
              : "Unlock 30 days of Plus for the new-user ฿29 offer after seeing your teaser."}
          </p>
        </div>

        <div className="w-full rounded-2xl border border-[#263149] bg-[#0b1020] p-4 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-[#06b6d4]/25 bg-[#052b36]">
              <Lock className="h-5 w-5 text-[#67e8f9]" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#67e8f9]">
                {lang === "th" ? "รายงานถูกล็อกไว้" : "Report locked"}
              </p>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <p className="text-2xl font-semibold leading-none text-white">
                  {lang === "th" ? "29 บาท" : "฿29"}
                </p>
                <p className="pb-0.5 text-xs font-medium text-white/48">
                  <span className="line-through">
                    {lang === "th" ? "ปกติ 149 บาท" : "฿149"}
                  </span>
                </p>
              </div>
              <p className="text-xs font-medium text-white/58">
                {lang === "th" ? "ลด 80% • จ่ายครั้งเดียว" : "80% off • one-time"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-3">
          <PaywallRow
            icon={CheckCircle2}
            iconClassName="text-[#67e8f9]"
            iconBgClassName="bg-[#052b36]"
            text={t.scanPaywall.metrics}
          />
          <PaywallRow
            icon={Sparkles}
            iconClassName="text-[#67e8f9]"
            iconBgClassName="bg-[#052b36]"
            text={t.scanPaywall.aiComplete}
          />
          <PaywallRow
            icon={FileText}
            iconClassName="text-[#c4b5fd]"
            iconBgClassName="bg-[#22133b]"
            text={t.scanPaywall.reportReady}
          />
        </div>

        <p className="text-xs leading-relaxed text-white/52">
          {lang === "th"
            ? "* ชำระผ่าน Stripe Checkout / PromptPay แบบ one-time ไม่ใช่ subscription discount"
            : "* Paid through Stripe Checkout / PromptPay as a one-time offer, not a subscription discount."}
        </p>

        <div className="flex w-full flex-col space-y-3 pt-2">
          <m.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={onUnlockClick}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-white px-6 py-4 font-semibold tracking-wide text-[#050816] shadow-[0_0_34px_rgba(168,85,247,0.28)] transition-all hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45"
          >
            <span>
              {lang === "th"
                ? "ปลดล็อก Plus 30 วัน - 29 บาท"
                : "Unlock Plus - ฿29"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </m.button>

          <Button
            variant="ghost"
            onClick={onCancel}
            className="min-h-11 w-full text-xs font-semibold uppercase tracking-wider text-white/58 transition-colors hover:bg-[#11182b] hover:text-white"
          >
            {lang === "th"
              ? "ยกเลิกสแกนและกลับไปหน้าเดิม"
              : "Cancel scan and go back"}
          </Button>
        </div>
      </m.div>
    </div>
  );
}

function PaywallRow({
  icon: Icon,
  iconClassName,
  iconBgClassName,
  text,
}: {
  icon: typeof CheckCircle2;
  iconClassName: string;
  iconBgClassName: string;
  text: string;
}) {
  return (
    <div className="flex items-center space-x-3 rounded-xl border border-[#263149] bg-[#0b1020] p-3.5 text-left">
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconBgClassName}`}
      >
        <Icon className={`h-4 w-4 ${iconClassName}`} />
      </div>
      <span className="text-sm font-medium text-white/74">{text}</span>
    </div>
  );
}
