"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface ProcedurePreviewCopy {
  title: string;
  description: string;
  rating: string;
}

type ThumbnailVariant = "lines" | "jaw" | "lift" | "contour";

const PROCEDURE_IMAGES: Record<ThumbnailVariant, string> = {
  lines: "/upgrade-assets/landing-procedure-lines-light.png",
  jaw: "/upgrade-assets/landing-procedure-filler-light.png",
  lift: "/upgrade-assets/landing-procedure-thread-light.png",
  contour: "/upgrade-assets/landing-procedure-lift-light.png",
};

export function ProcedurePreviewCard({
  icon: Icon,
  procedure,
  variant,
}: {
  icon: LucideIcon;
  procedure: ProcedurePreviewCopy;
  variant: ThumbnailVariant;
}) {
  const { t, lang } = useT();

  return (
    <article
      aria-label={`${procedure.title}: ${procedure.description}`}
      className="group relative min-h-[184px] overflow-hidden rounded-2xl border border-[#241f1a]/[0.12] bg-white/50 shadow-[0_20px_54px_-38px_rgba(36,31,26,0.32)] ring-1 ring-white/70 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-[#067e96]/35 hover:bg-white/60 hover:shadow-[0_28px_72px_-46px_rgba(36,31,26,0.42)] focus-within:border-[#067e96]/40 focus-within:ring-[#067e96]/20 motion-reduce:hover:translate-y-0"
    >
      <Image
        src={PROCEDURE_IMAGES[variant]}
        alt=""
        fill
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover object-[74%_center] opacity-95 saturate-[0.92] transition duration-700 group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(251,250,247,0.88)_0%,rgba(249,247,242,0.82)_43%,rgba(249,247,242,0.46)_68%,rgba(249,247,242,0.08)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.42),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#067e96]/35 to-transparent opacity-80" />
      <div className="pointer-events-none absolute inset-y-5 left-0 w-px bg-gradient-to-b from-transparent via-[#2f6f66]/30 to-transparent opacity-70" />

      <div className="relative z-10 flex min-h-[184px] flex-col justify-between p-5 sm:p-6">
        <div className="max-w-[67%] space-y-3.5">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/65 text-[#056f82] shadow-[0_14px_30px_-22px_rgba(36,31,26,0.38)] backdrop-blur-md"
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-[17px] font-semibold leading-tight tracking-normal text-[#241f1a] sm:text-lg">
              {procedure.title}
            </h3>
            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[#5d554e]">
              {procedure.description}
            </p>
          </div>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/70 bg-white/65 px-2.5 text-[11px] font-semibold text-[#056f82] shadow-[0_10px_22px_-18px_rgba(36,31,26,0.34)] backdrop-blur-md">
            <Star className="h-3 w-3 fill-[#067e96]/20 text-[#056f82]" />
            {lang === "th" ? "ภาพอ้างอิง" : "Visual reference"}
          </span>
        </div>

        <Link
          href={"/surgery" as never}
          aria-label={`${t.landingV2.aesthetics.details}: ${procedure.title}`}
          className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-[#241f1a]/10 bg-white/60 px-3 text-xs font-semibold text-[#056f82] shadow-[0_12px_24px_-20px_rgba(36,31,26,0.38)] backdrop-blur-md transition hover:border-[#067e96]/25 hover:bg-white/75 hover:text-[#241f1a] focus:outline-none focus:ring-2 focus:ring-[#067e96]/35"
        >
          {t.landingV2.aesthetics.details}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
