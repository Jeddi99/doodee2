"use client";

import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useIsMobile } from "@/lib/use-is-mobile";
import type { MetricKey } from "@/types";

const FEATURED_METRICS: MetricKey[] = [
  "canthal-tilt",
  "fwhr",
  "gonial-angle",
  "golden-ratio",
  "facial-thirds",
  "eye-spacing-ratio",
  "nose-mouth-ratio",
  "lip-fullness",
  "nasolabial-angle",
  "facial-convexity",
  "palpebral-fissure-aspect",
  "brow-tilt",
  "jaw-width-to-cheek-ratio",
  "midface-ratio",
  "chin-height-ratio",
  "mouth-corner-tilt",
  "mentolabial-angle",
  "forehead-inclination",
  "nasal-dorsum-angle",
  "chin-projection",
  "lip-e-line",
  "interbrow-distance",
  "nose-tip-angle",
  "cupids-bow-height",
  "forehead-width-ratio",
  "brow-arch-height",
  "upper-lid-show",
  "philtrum-length-ratio",
];

export function MetricsMarquee() {
  const isMobile = useIsMobile();
  const { t } = useT();
  if (isMobile) return null;
  const items = FEATURED_METRICS.map((k) => t.metric[k]);
  const doubled = [...items, ...items];

  return (
    <motion.section
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6 }}
      className="relative -mx-6 overflow-hidden"
    >
      <p className="mb-6 text-center text-[11px] uppercase tracking-[0.2em] text-[#2f6f66]">
        {t.landing.marqueeLabel}
      </p>

      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 md:w-40"
          style={{
            background:
              "linear-gradient(90deg, #f4f1ea 0%, rgba(244,241,234,0.86) 52%, transparent 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 md:w-40"
          style={{
            background:
              "linear-gradient(-90deg, #f4f1ea 0%, rgba(244,241,234,0.86) 52%, transparent 100%)",
          }}
        />
        <div className="marquee-track flex gap-3 motion-reduce:animate-none">
          {doubled.map((name, i) => (
            <span
              key={i}
              className="flex-none whitespace-nowrap rounded-full border border-[#241f1a]/10 bg-white/55 px-4 py-2 text-sm text-[#4d453e] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.28)] backdrop-blur-md"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
