"use client";

import { EyeOff, Ruler, Smile, Sun } from "lucide-react";
import { useT } from "@/lib/i18n";

export function ScanTipsPanel() {
  const { t } = useT();
  const rows = [
    { icon: Sun, label: t.scanCockpit.tips.light },
    { icon: Smile, label: t.scanCockpit.tips.lookStraight },
    { icon: EyeOff, label: t.scanCockpit.tips.noObstruction },
    { icon: Ruler, label: t.scanCockpit.tips.distance },
  ];

  return (
    <section className="rounded-3xl border border-[#241f1a]/10 bg-white/82 p-5 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md dark:border-[#263149] dark:bg-[#070b1a] dark:text-white dark:shadow-[0_18px_46px_-38px_rgba(0,0,0,0.72)]">
      <h2 className="font-serif text-2xl font-light italic text-[#241f1a] dark:text-white">
        {t.scanCockpit.tipsHeader}
      </h2>
      <div className="mt-4 space-y-2.5">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="flex items-center gap-3 rounded-2xl border border-[#241f1a]/10 bg-white/70 p-3 dark:border-[#263149] dark:bg-[#0b1020]"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[#06b6d4]/25 bg-[#e9fbff] text-[#0e7490] dark:bg-[#052b36] dark:text-[#67e8f9]">
                <Icon className="h-4 w-4" />
              </span>
              <p className="text-sm font-medium leading-snug text-[#4b423a] dark:text-white/74">
                {row.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
