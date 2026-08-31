"use client";

import { m } from "framer-motion";
import { useT } from "@/lib/i18n";

const REVEAL = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const STAGGER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export function StatsStrip() {
  const { t } = useT();
  return (
    <m.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={STAGGER}
      className="relative"
    >
      <m.p
        variants={REVEAL}
        className="mb-8 text-center text-[11px] uppercase tracking-[0.2em] text-[#056f82]"
      >
        {t.landing.statsEyebrow}
      </m.p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {t.landing.stats.map((s, i) => (
          <m.div
            key={i}
            variants={REVEAL}
            className="group relative overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/50 p-5 text-center shadow-[0_18px_54px_-46px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:border-[#067e96]/25 hover:bg-white/65 md:p-7"
          >
            <div
              aria-hidden
              className="absolute inset-x-0 -top-px h-px opacity-60"
              style={{
                background:
                  i % 2 === 0
                    ? "linear-gradient(90deg, transparent, rgba(6,126,150,0.3), transparent)"
                    : "linear-gradient(90deg, transparent, rgba(47,111,102,0.32), transparent)",
              }}
            />
            <div className="relative space-y-1.5">
              <p className="font-serif text-4xl font-light italic leading-none tabular-nums text-[#241f1a] md:text-5xl">
                {s.value}
              </p>
              <p className="text-[11px] leading-snug text-[#625a52] md:text-xs">
                {s.label}
              </p>
            </div>
          </m.div>
        ))}
      </div>
    </m.section>
  );
}
