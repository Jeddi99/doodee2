"use client";

import type { ReactNode } from "react";

export function ScanHudFrame({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={`relative w-full max-w-full min-w-0 overflow-hidden rounded-[1.5rem] border border-[#241f1a]/10 bg-white/82 shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md dark:border-[#263149] dark:bg-[#050816] dark:shadow-[0_20px_60px_-48px_rgba(0,0,0,0.9)] ${
        compact ? "min-h-[300px] sm:min-h-[390px]" : "min-h-[310px] sm:min-h-[430px]"
      }`}
      aria-label="Face scan upload stage"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(241,249,255,0.72))] dark:bg-[linear-gradient(180deg,rgba(11,16,32,0.94),rgba(5,8,22,1))]" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#06b6d4]/35 to-transparent" />

      <div
        className={`relative z-10 flex min-w-0 items-center justify-center p-4 sm:p-8 ${
          compact ? "min-h-[300px] sm:min-h-[390px]" : "min-h-[310px] sm:min-h-[430px]"
        }`}
      >
        {children}
      </div>
    </section>
  );
}
