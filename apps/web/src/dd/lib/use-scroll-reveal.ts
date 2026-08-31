"use client";

import { useEffect, type RefObject } from "react";

/**
 * Lightweight scroll-reveal for the marketing landing.
 *
 * One IntersectionObserver toggles `data-revealed` on every `[data-reveal]`
 * element inside `rootRef` as it enters the viewport. The actual motion is a
 * pure CSS transform/opacity transition (see globals.css) so it stays on the
 * compositor and survives the mobile perf rules (Phase 192) that strip
 * JS/rAF-driven animation.
 *
 * SSR-safe + degrade-safe:
 * - The hidden initial state only applies once this hook adds `reveal-ready`
 *   to the root, so a no-JS / pre-hydration render shows everything.
 * - `prefers-reduced-motion: reduce` → no hiding, no observer at all.
 * - A 4s fallback reveals anything that never intersects.
 */
export function useScrollReveal(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    root.classList.add("reveal-ready");
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (els.length === 0) return;

    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.setAttribute("data-revealed", ""));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "");
            obs.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    els.forEach((el) => observer.observe(el));

    const fallback = window.setTimeout(() => {
      els.forEach((el) => el.setAttribute("data-revealed", ""));
    }, 4000);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [rootRef]);
}
