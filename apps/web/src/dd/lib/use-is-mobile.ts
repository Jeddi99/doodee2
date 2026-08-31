"use client";

import { useEffect, useState } from "react";

// Phase 192p — Shared mobile breakpoint hook used by the "kill all
// decoration on mobile" pass. Mid-range Android was spending >10% of
// main-thread time on AmbientOrbs (4 blurred 380-760px blobs), GlowingOrb
// (5 stacked CSS animations + SVG mesh), MetricsMarquee (56-node
// translateX loop), and AppBackground (4 fixed gradient layers). None of
// them carry meaning — they're purely visual. We swap to `return null`
// below 768px instead of trying to lighten each one individually.
//
// Why a hook and not a CSS `hidden md:block`:
//   - CSS would still mount the React tree, run effects, and ship the
//     SVG markup. With JS we early-return before any of that work.
//   - GlowingOrb owns multiple `repeatCount="indefinite"` <animate>
//     elements that the browser keeps ticking even when display:none.
//
// Defaults to `false` (desktop) so SSR + first paint match desktop
// markup; the effect flips it on mount once we have a real window.
// That means a mobile user sees the decoration for one paint and then
// it unmounts — a tiny FOUC on the orbs is the explicit tradeoff for
// not blocking hydration with a useSyncExternalStore() round-trip.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent): void => {
      setIsMobile(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => {
      mq.removeEventListener("change", handler);
    };
  }, []);

  return isMobile;
}
