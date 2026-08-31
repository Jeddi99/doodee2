"use client";

import { FileText, Ruler, ShieldCheck, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";

export function WhyDoodeeCard({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const items = [
    { icon: Sparkles, title: t.scanCockpit.why.a.title, body: t.scanCockpit.why.a.body },
    { icon: FileText, title: t.scanCockpit.why.b.title, body: t.scanCockpit.why.b.body },
    { icon: Ruler, title: t.scanCockpit.why.c.title, body: t.scanCockpit.why.c.body },
    { icon: ShieldCheck, title: t.scanCockpit.why.d.title, body: t.scanCockpit.why.d.body },
  ];

  return (
    <section
      className={`rounded-3xl border border-[#241f1a]/10 bg-white/82 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md dark:border-[#263149] dark:bg-[#070b1a] dark:text-white dark:shadow-[0_18px_46px_-38px_rgba(0,0,0,0.72)] ${
        compact ? "p-4 sm:p-5" : "p-5 sm:p-6"
      }`}
    >
      <h2
        className={`font-serif font-light italic text-[#241f1a] dark:text-white ${
          compact ? "text-2xl" : "text-3xl"
        }`}
      >
        {t.scanCockpit.whyHeader}
      </h2>
      <div
        className={`grid gap-3 sm:grid-cols-2 md:grid-cols-4 ${
          compact ? "mt-4" : "mt-5"
        }`}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className={`rounded-2xl border border-[#241f1a]/10 bg-white/70 dark:border-[#263149] dark:bg-[#0b1020] ${
                compact ? "p-3" : "p-4"
              }`}
            >
              <span
                className={`flex items-center justify-center rounded-2xl border border-[#06b6d4]/25 bg-[#e9fbff] text-[#0e7490] dark:bg-[#052b36] dark:text-[#67e8f9] ${
                  compact ? "h-8 w-8" : "h-10 w-10"
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <h3
                className={`text-sm font-semibold text-[#241f1a] dark:text-white ${
                  compact ? "mt-3" : "mt-4"
                }`}
              >
                {item.title}
              </h3>
              <p
                className={`text-xs font-medium leading-relaxed text-[#5f574f] dark:text-white/62 ${
                  compact ? "mt-1 line-clamp-2" : "mt-2"
                }`}
              >
                {item.body}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
