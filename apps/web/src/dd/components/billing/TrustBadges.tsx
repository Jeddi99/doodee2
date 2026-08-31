"use client";

import {
  CreditCard,
  Lock,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

interface Badge {
  icon: LucideIcon;
  th: string;
  en: string;
}

const BADGES: Badge[] = [
  { icon: ShieldCheck, th: "ชำระเงินผ่านระบบปลอดภัย", en: "Secure payment" },
  { icon: Lock, th: "จัดการภาพอย่างเป็นส่วนตัว", en: "Private photo handling" },
  { icon: CreditCard, th: "PromptPay / บัตร", en: "PromptPay / card" },
  { icon: RefreshCw, th: "เปลี่ยนหรือยกเลิกได้เอง", en: "Self-serve plan changes" },
];

export function TrustBadges({ lang }: { lang: "th" | "en" }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {BADGES.map((badge) => {
        const Icon = badge.icon;
        return (
          <div
            key={badge.en}
            className="rounded-2xl border border-white/60 bg-white/45 px-4 py-3.5 shadow-[0_16px_44px_-38px_rgba(36,31,26,0.42)] backdrop-blur-md"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/50 text-[#056f82] shadow-[0_10px_24px_-22px_rgba(6,126,150,0.28)]">
                <Icon className="h-4 w-4" />
              </span>
              <p className="min-w-0 text-[12px] font-semibold leading-snug text-[#342d27]">
                {lang === "th" ? badge.th : badge.en}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
