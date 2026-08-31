"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, UserRound, X } from "lucide-react";
import { DoodeeLogo } from "@/components/DoodeeLogo";
import { LangToggle } from "@/components/LangToggle";
import { useT } from "@/lib/i18n";
import { useScrollLock } from "@/lib/use-scroll-lock";

const NAV_HREFS = [
  "/methodology",
  "/upgrade",
  "/history",
  "/blog",
  "/faq",
] as const;

export function LandingNav({
  variant = "light",
}: {
  variant?: "light" | "inverted";
}) {
  const { t, lang } = useT();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const inverted = variant === "inverted";
  const navLabels = [
    t.landingV2.nav.methodology,
    t.landingV2.nav.pricing,
    t.landingV2.nav.history,
    t.landingV2.nav.blog,
    t.landingV2.nav.faq,
  ];

  const closeMenu = useCallback(() => setMobileNavOpen(false), []);

  useScrollLock(mobileNavOpen);

  useEffect(() => {
    if (!mobileNavOpen) return;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  return (
    <header className="relative z-[80] mx-auto flex w-full max-w-[1680px] items-center justify-between px-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10 lg:px-12 2xl:px-14">
      <Link
        href={"/" as never}
        className={`group inline-flex min-h-[44px] items-center gap-3 rounded-full py-1.5 transition focus:outline-none focus-visible:ring-2 ${
          inverted
            ? "focus-visible:ring-white/70"
            : "focus-visible:ring-[#067e96]/45"
        }`}
        aria-label="DOODEE"
      >
        <DoodeeLogo
          markClassName={`h-10 w-10 rounded-xl ${
            inverted ? "shadow-[0_2px_14px_rgba(0,0,0,0.65)]" : ""
          }`}
          wordmarkClassName={`text-3xl transition sm:text-4xl ${
            inverted
              ? "hero-on-image text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.65)]"
              : "text-[#241f1a] group-hover:text-[#3a332d]"
          }`}
        />
        <span
          style={inverted ? { color: "#fff" } : undefined}
          className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] shadow-[0_10px_22px_-18px_rgba(23,20,18,0.55)] ${
            inverted
              ? "hero-on-image border border-white/[0.28] bg-black/[0.36] shadow-[0_8px_24px_-14px_rgba(0,0,0,0.8)]"
              : "border border-white/60 bg-white/50 text-[#056f82] backdrop-blur"
          }`}
        >
          EARLY
        </span>
      </Link>

      <nav
        aria-label={lang === "th" ? "เมนูหลัก" : "Main navigation"}
        className={`hidden items-center lg:flex ${
          inverted
            ? "gap-1 rounded-full border border-white/[0.16] bg-slate-950/55 px-2 py-1.5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.65)] backdrop-blur-[3px]"
            : "gap-8"
        }`}
      >
        {navLabels.map((label, index) => (
          <Link
            key={label}
            href={NAV_HREFS[index] as never}
            className={`inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[#067e96]/45 ${
              inverted
              ? "hero-nav-link px-3 text-white drop-shadow-[0_1px_10px_rgba(0,0,0,0.7)] hover:bg-white/[0.13] focus-visible:bg-white/[0.16] focus-visible:ring-white/[0.7]"
                : "text-[#625a52] hover:text-[#241f1a]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href={"/login" as never}
          aria-label={t.landingV2.nav.login}
          className={`hidden min-h-12 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold shadow-[0_16px_34px_-26px_rgba(36,31,26,0.52)] transition focus:outline-none focus:ring-2 focus:ring-[#067e96]/35 sm:inline-flex sm:px-6 ${
            inverted
              ? "hero-on-image border border-white/[0.18] bg-slate-950/50 text-white hover:bg-slate-950/68 active:scale-[0.98] focus-visible:ring-white/[0.75]"
              : "bg-[#241f1a] text-white hover:bg-[#342d27]"
          }`}
        >
          <UserRound className="h-4 w-4" />
          <span className="hidden sm:inline">{t.landingV2.nav.login}</span>
        </Link>
        <LangToggle variant={inverted ? "inverted" : "default"} />
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label={lang === "th" ? "เปิดเมนู" : "Open menu"}
          aria-expanded={mobileNavOpen}
          aria-controls="landing-mobile-nav"
          style={inverted ? { color: "#fff" } : undefined}
          className={`inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-full shadow-[0_10px_24px_-18px_rgba(23,20,18,0.45)] transition focus:outline-none focus:ring-2 focus:ring-[#067e96]/45 lg:hidden ${
            inverted
              ? "hero-on-image border border-white/[0.28] bg-slate-950/55 shadow-[0_14px_34px_-22px_rgba(0,0,0,0.75)] hover:bg-slate-950/68 focus-visible:ring-white/[0.75]"
              : "border border-white/60 bg-white/50 text-[#241f1a] backdrop-blur-md hover:bg-white/70"
          }`}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileNavOpen && (
        <div
          id="landing-mobile-nav"
          className="fixed inset-0 z-[70] h-[100dvh] max-h-[100dvh] overflow-hidden lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={lang === "th" ? "เมนู" : "Menu"}
        >
          <button
            type="button"
            className="absolute inset-0 bg-[#241f1a]/25 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={closeMenu}
            aria-label={lang === "th" ? "ปิดเมนู" : "Close menu"}
          />
          <div className="landing-menu-panel absolute bottom-0 right-0 top-0 flex h-[100dvh] max-h-[100dvh] w-72 max-w-[84vw] flex-col overflow-y-auto overscroll-contain border-l border-white/60 bg-white/70 px-6 pb-[max(calc(env(safe-area-inset-bottom)_+_1.5rem),2rem)] pt-[max(env(safe-area-inset-top),1.5rem)] shadow-[0_30px_80px_-40px_rgba(23,20,18,0.55)] backdrop-blur-md animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between">
              <DoodeeLogo
                markClassName="h-9 w-9 rounded-xl"
                wordmarkClassName="text-2xl text-[#241f1a]"
              />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMenu}
                aria-label={lang === "th" ? "ปิดเมนู" : "Close menu"}
                className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-full border border-white/60 bg-white/50 text-[#241f1a] transition hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav
              aria-label={lang === "th" ? "เมนูมือถือ" : "Mobile navigation"}
              className="mt-10 flex flex-col gap-1"
            >
              {navLabels.map((label, index) => (
                <Link
                  key={label}
                  href={NAV_HREFS[index] as never}
                  onClick={closeMenu}
                  className="rounded-xl px-3 py-3 text-base font-medium text-[#5f574f] transition hover:bg-white/55 hover:text-[#241f1a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <Link
              href={"/login" as never}
              onClick={closeMenu}
              className="mb-1 mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#241f1a] px-5 text-sm font-semibold text-white shadow-[0_18px_34px_-26px_rgba(36,31,26,0.7)] transition hover:bg-[#342d27] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
            >
              <UserRound className="h-4 w-4" />
              {t.landingV2.nav.login}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
