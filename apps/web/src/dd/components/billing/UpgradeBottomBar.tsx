"use client";

import Link from "next/link";
import { ArrowRight, Bot, ClipboardList } from "lucide-react";
import { useT } from "@/lib/i18n";

export function UpgradeBottomBar() {
  const { t } = useT();

  return (
    <div className="hidden px-5 pb-10 md:block lg:pb-12">
      <div className="mx-auto max-w-[760px] px-5">
        <div className="relative rounded-3xl border border-white/60 bg-white/50 px-5 py-4 shadow-[0_18px_50px_-36px_rgba(36,31,26,0.42)] backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3 pr-[13.5rem]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/50 text-[#056f82] shadow-[0_10px_24px_-22px_rgba(6,126,150,0.28)]">
              <ClipboardList className="h-4 w-4" />
            </span>
            <p className="min-w-0 truncate text-sm text-[#6f625a]">
              <span className="font-semibold text-[#241f1a]">
                {t.upgrade.bottomBar.comparePrompt}
              </span>{" "}
              <Link
                href={"/upgrade#compare" as never}
                className="inline-flex min-h-[44px] items-center whitespace-nowrap font-semibold text-[#5e45b8] underline-offset-2 transition hover:text-[#241f1a] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
              >
                {t.upgrade.bottomBar.compareLink}
                <ArrowRight className="ml-1 inline-block h-3.5 w-3.5 align-text-bottom" />
              </Link>
            </p>
          </div>

          <Link
            href={"/surgery" as never}
            aria-label={t.upgrade.bottomBar.assistant}
            className="absolute right-4 top-1/2 flex max-w-[12.5rem] -translate-y-1/2 items-center gap-2 rounded-full border border-white/60 bg-white/45 py-2 pl-2 pr-3 text-xs font-semibold text-[#241f1a] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.34)] backdrop-blur transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
          >
            <span className="upgrade-assistant-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#241f1a] text-white [&_svg]:text-white [&_svg]:stroke-white">
              <Bot className="h-4 w-4" />
            </span>
            <span className="truncate">{t.upgrade.bottomBar.assistant}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
