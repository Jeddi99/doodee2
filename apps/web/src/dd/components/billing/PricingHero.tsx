"use client";

import type { ReactNode } from "react";
import { BarChart3, Lock, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";

export function PricingHero() {
  const { t, lang } = useT();
  const trustItems =
    lang === "th"
      ? [
          {
            icon: <ShieldCheck className="h-4 w-4" />,
            label: "รายงานส่วนตัว",
            body: "เริ่มอ่านภาพจากเบราว์เซอร์ของคุณ",
          },
          {
            icon: <BarChart3 className="h-4 w-4" />,
            label: "โควต้าชัดเจน",
            body: "เห็นสิทธิ์ประเมินและภาพอ้างอิงทุกแพ็กเกจ",
          },
          {
            icon: <Lock className="h-4 w-4" />,
            label: "จัดการได้เอง",
            body: "เปลี่ยนหรือยกเลิกแพ็กเกจผ่านหน้าบิล",
          },
        ]
      : [
          {
            icon: <ShieldCheck className="h-4 w-4" />,
            label: "Private by design",
            body: "Photo review starts in your browser",
          },
          {
            icon: <BarChart3 className="h-4 w-4" />,
            label: "Clear quotas",
            body: "Assessment and reference credits shown per plan",
          },
          {
            icon: <Lock className="h-4 w-4" />,
            label: "Manage anytime",
            body: "Change or cancel from billing",
          },
        ];

  return (
    <header className="relative overflow-hidden rounded-[1.25rem] border border-white/60 bg-white/60 px-4 py-4 shadow-[0_24px_70px_-52px_rgba(36,31,26,0.46)] backdrop-blur-md sm:rounded-[2rem] sm:px-8 sm:py-8 lg:px-10 lg:py-10">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-[-18%] top-[-42%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(122,91,214,0.13)_0%,rgba(122,91,214,0)_68%)]"
      />
      <div className="grid gap-4 sm:gap-8 lg:grid-cols-[1fr_320px] lg:items-end">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/55 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#056f82] shadow-[0_10px_26px_-22px_rgba(36,31,26,0.38)] backdrop-blur sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.16em]">
            <Lock className="h-3.5 w-3.5" />
            {t.upgrade.hero.privacyChip}
          </div>
          <h1 className="mt-3 font-serif text-[2rem] font-light leading-[0.98] tracking-normal text-[#241f1a] sm:mt-5 sm:text-6xl md:text-7xl">
            <span className="block">{t.upgrade.hero.titleLine1}</span>
            <span className="mt-1 block">
              <span className="block sm:inline">
                {t.upgrade.hero.titleLine2Prefix}
              </span>
              <span className="block sm:inline">
                <span className="text-[#5e45b8]">
                  {t.upgrade.hero.titleLine2Accent}
                </span>
                {t.upgrade.hero.titleLine2Suffix}
              </span>
            </span>
          </h1>
          <p className="mt-2 max-w-xl text-xs leading-snug text-[#625a52] sm:mt-5 sm:text-base sm:leading-relaxed">
            {t.upgrade.hero.subtitle}
          </p>
        </div>

        <div className="hidden gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-1">
          {trustItems.map((item) => (
            <HeroTrustItem key={item.label} {...item} />
          ))}
        </div>
      </div>
    </header>
  );
}

function HeroTrustItem({
  icon,
  label,
  body,
}: {
  icon: ReactNode;
  label: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/40 p-4 shadow-[0_14px_34px_-30px_rgba(36,31,26,0.42)] backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/50 text-[#056f82] shadow-[0_10px_24px_-20px_rgba(6,126,150,0.30)]">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-[#241f1a]">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#6f625a]">{body}</p>
        </div>
      </div>
    </div>
  );
}

export function AmbientOrbs() {
  return null;
}
