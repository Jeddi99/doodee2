"use client";

import { WifiOff, RefreshCw } from "lucide-react";
import { useOnline } from "@/lib/use-online";
import { useT } from "@/lib/i18n";

/**
 * Phase 48 → 192s — sticky offline banner. Mounts in the app layout
 * above everything else; only visible when `navigator.onLine === false`.
 *
 * Designed to inform, not alarm — the scan pipeline (landmark detector
 * cached by service worker on second load, all metric math, share-link
 * encoding) runs offline. What DOESN'T work offline:
 *   - First-time landmark / segmentation model download (~3 MB CDN fetch)
 *   - AI scoring / image generation (server proxy)
 *   - Receiving a shared link (depends on server reachability)
 */
export function OfflineBanner() {
  const online = useOnline();
  const { t } = useT();
  if (online) return null;

  // Phase 192s — retry affordance. `navigator.onLine` already flips the
  // banner off reactively via the `online` event (useOnline), so the only
  // job here is to RE-FETCH the data that failed while offline. If the
  // radio is back, a reload re-hydrates the deferred fetches (shared links,
  // personalized notes, model download); if still offline it's a cheap
  // no-op and the banner stays. Cheap, no probe request of our own.
  const handleRetry = () => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      window.location.reload();
    }
  };

  return (
    // Phase 192r — top-anchored offline banner. It is sticky top-0 z-40 and
    // full-width, which made it render OVER the floating LangToggle (fixed
    // top-right z-30, ~44px) and intercept taps meant for it. Two fixes
    // PRESERVED here:
    //   1. `pointer-events-none` lets taps fall through to the LangToggle (and
    //      anything else) underneath. The retry button below re-enables pointer
    //      events on ITSELF only (`pointer-events-auto`) so it stays tappable.
    //   2. Right padding equal to the toggle footprint keeps the centered
    //      message from colliding with the toggle visually on small screens.
    // NavProgress (fixed top-0 z-[60], 2px line) intentionally stays above
    // this banner; z-40 < z-60 preserves that.
    // Phase 192s — restyled from a flat tinted strip into an intentional
    // notice: amber `warn` tone (caution, not error), a contained icon chip
    // for depth, and the optional retry control. backdrop-blur is a no-op on
    // mobile (globals strips it <=768px, compensating with raised bg opacity),
    // so depth here also leans on the border + bg gradient, not blur alone.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none sticky top-0 z-40 border-b border-warn/25 bg-gradient-to-b from-warn/[0.12] to-warn/[0.06] backdrop-blur-md"
    >
      <div className="container flex items-center justify-center gap-2.5 py-2 pr-24 text-warn lg:pr-0">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-warn/30 bg-warn/10">
          <WifiOff className="h-3 w-3" />
        </span>
        <span className="text-[12px] leading-snug">{t.offline.banner}</span>
        <button
          type="button"
          onClick={handleRetry}
          className="pointer-events-auto ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] font-medium text-warn transition-colors hover:bg-warn/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn/50"
        >
          <RefreshCw className="h-3 w-3" />
          <span>{t.offline.retry}</span>
        </button>
      </div>
    </div>
  );
}
