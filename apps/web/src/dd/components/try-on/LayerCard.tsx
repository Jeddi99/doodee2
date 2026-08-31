"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export function LayerCard({
  title,
  description,
  cta,
  icon: Icon,
  active,
  onClick,
}: {
  title: string;
  description: string;
  cta: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative min-w-0 overflow-hidden rounded-2xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-[#067e96]/30 ${
        active
          ? "border-[#067e96]/35 bg-white/55 shadow-[0_18px_44px_-34px_rgba(6,126,150,0.35)] backdrop-blur-md"
          : "border-white/60 bg-white/40 shadow-[0_12px_34px_-30px_rgba(36,31,26,0.34)] backdrop-blur-md hover:border-white/80 hover:bg-white/60"
      }`}
    >
      <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/45 text-[#067e96] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="relative mt-4 text-lg font-semibold text-[#241f1a]">
        {title}
      </h3>
      <p className="relative mt-2 min-h-[42px] text-xs leading-relaxed text-[#6f625a]">
        {description}
      </p>
      <span className="relative mt-4 inline-flex items-center gap-2 text-xs font-medium text-[#067e96]">
        {cta}
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
