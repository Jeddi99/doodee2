"use client";

/**
 * Phase 192c — Mobile-only persistent quota chip.
 *
 * The desktop `UpgradeSidebar` shows tier + scans + previews remaining,
 * but it's `hidden lg:flex`. Mobile users had zero surface to see their
 * remaining quota without going `/settings → usage` (3 taps deep), so
 * they were complaining "ดูรอบสแกนไม่ได้ รอบทำรูปไม่ได้".
 *
 * Phase 192f — Rendered INLINE at the top of <main> (left-aligned),
 * not as a floating fixed sibling. The previous fixed top-right
 * placement (next to LangToggle) caused it to overlap the page
 * heading on mobile because `top-4` + chip-height ≈ 48px while main
 * starts at `pt-10` = 40px. Inline placement keeps it in document
 * flow so it never floats over page content. Tapping routes to
 * `/upgrade` for full details + upgrade options.
 *
 * Hidden on `lg+` so it doesn't double up with the sidebar.
 */

import Link from "next/link";
import { Eye, ScanFace } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSubscription } from "@/lib/use-subscription";

export function MobileQuotaChip(): React.JSX.Element | null {
  const { lang } = useT();
  const { subscription } = useSubscription();
  // Phase 192d — Render with the cached subscription even while a
  // refetch is in flight (loading=true). The cache hydrates
  // synchronously from `getCachedRow()`, so a brief loading flag on
  // re-fetch (cross-tab event, focus refresh, post-redeem refresh)
  // would otherwise make the chip blink-out. Only hide when the cache
  // is genuinely empty (first-paint pre-auth).
  if (!subscription) return null;

  const scansLeft = Math.max(
    0,
    (subscription.scans_quota ?? 0) +
      (subscription.credit_override_scans ?? 0) -
      (subscription.scans_used ?? 0),
  );
  const previewsLeft = Math.max(
    0,
    (subscription.previews_quota ?? 0) +
      (subscription.credit_override_previews ?? 0) -
      (subscription.previews_used ?? 0),
  );

  return (
    <Link
      href={"/upgrade" as never}
      className="mobile-quota-chip pointer-events-auto inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/60 bg-white/50 px-3 py-1.5 text-[11px] font-semibold text-[#3d3731] shadow-[0_14px_34px_-26px_rgba(36,31,26,0.46)] backdrop-blur-md transition hover:border-white/80 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40 lg:hidden"
      aria-label={
        lang === "th"
          ? `คงเหลือ ${scansLeft} สิทธิ์ประเมิน · ${previewsLeft} ภาพอ้างอิง`
          : `${scansLeft} assessment credits and ${previewsLeft} references remaining`
      }
    >
      <span className="inline-flex items-center gap-1 tabular-nums">
        <ScanFace
          className="mobile-quota-icon-violet h-3 w-3"
          style={{ color: "var(--mobile-quota-scan-icon)" }}
          aria-hidden
        />
        {scansLeft}
      </span>
      <span className="h-3 w-px bg-[#241f1a]/10" aria-hidden />
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Eye
          className="mobile-quota-icon-cyan h-3 w-3"
          style={{ color: "var(--mobile-quota-preview-icon)" }}
          aria-hidden
        />
        {previewsLeft}
      </span>
    </Link>
  );
}
