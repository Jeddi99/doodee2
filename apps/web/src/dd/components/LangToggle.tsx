"use client";

import { useT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "th", label: "TH" },
  { value: "en", label: "EN" },
];

export function LangToggle({
  variant = "default",
}: {
  variant?: "default" | "inverted" | "app";
}) {
  const { lang, setLang, t } = useT();
  const inverted = variant === "inverted";
  const app = variant === "app";

  return (
    <div
      role="group"
      aria-label={t.lang.toggleAria}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg p-0.5 text-xs font-semibold",
        app
          ? "doodee-lang-toggle-app"
          : inverted
          ? "theme-locked-dark border border-white/20 bg-slate-950/55 text-white shadow-[0_14px_34px_-22px_rgba(0,0,0,0.65)] backdrop-blur-md"
          : "border border-white/60 bg-white/50 shadow-[0_14px_34px_-26px_rgba(36,31,26,0.44)] backdrop-blur-md"
      )}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setLang(opt.value)}
          aria-pressed={lang === opt.value}
          className={cn(
            "inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-md px-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            lang === opt.value
              ? app
                ? "doodee-lang-toggle-app-active"
                : inverted
                ? "bg-[#f8fafc] text-[#0f172a] shadow-[0_10px_22px_-18px_rgba(0,0,0,0.5)] ring-1 ring-white/15 focus-visible:ring-white/80 focus-visible:ring-offset-[#050816]"
                : "bg-[#241f1a] text-white shadow-[0_10px_22px_-18px_rgba(36,31,26,0.5)] focus-visible:ring-[#067e96]/35 focus-visible:ring-offset-white"
              : app
                ? "doodee-lang-toggle-app-idle"
                : inverted
                ? "text-white/72 hover:bg-white/10 hover:text-white focus-visible:bg-white/12 focus-visible:text-white focus-visible:ring-white/80 focus-visible:ring-offset-[#050816]"
                : "text-[#5f574f] hover:bg-white/70 hover:text-[#241f1a] focus-visible:ring-[#067e96]/35 focus-visible:ring-offset-white"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
