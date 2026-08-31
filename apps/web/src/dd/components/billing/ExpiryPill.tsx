"use client";

/**
 * Phase 182c — Subscription expiry pill.
 *
 * Single source of truth for the "X days left" / "หมดอายุแล้ว" badge
 * shared by the desktop sidebar and the Settings profile card. Putting
 * the day-count + color-tone logic in one place keeps both surfaces in
 * sync (same threshold colors, same edge cases).
 *
 * Rules:
 *   - tier=free OR no period_end → nothing renders (FREE plans have no
 *     period to track, and Stripe-backed subs occasionally have a null
 *     period_end during a webhook outage).
 *   - period_end is in the past → red, "หมดอายุแล้ว".
 *   - 0 days left (expires today) → red, "หมดอายุวันนี้".
 *   - exactly 1 day left → red, "เหลือ 1 วัน".
 *   - 2–7 days left → amber, "เหลือ N วัน".
 *   - >7 days left → violet/neutral, "เหลือ N วัน".
 *
 * Day count uses `Math.ceil((period_end - now) / day)` so a 7-day grant
 * issued at 16:00 shows "7 วัน" until the moment it expires, not "6"
 * the instant after midnight.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { SubscriptionTier } from "@/types";

export interface ExpiryPillLabels {
  daysLeftLabel: string;
  daysLeftLabelOne: string;
  daysLeftToday: string;
  daysLeftExpired: string;
}

interface ExpiryPillProps {
  periodEnd: string | null;
  tier: SubscriptionTier;
  labels: ExpiryPillLabels;
  /** Optional className to merge with the tone classes. */
  className?: string;
}

export function ExpiryPill({
  periodEnd,
  tier,
  labels,
  className = "",
}: ExpiryPillProps): React.JSX.Element | null {
  // Phase 185 — lang-aware date in the tooltip. Previously
  // `toLocaleString()` with no args used the browser default, so an EN
  // app on a TH device showed Buddhist-era dates and vice versa.
  const { lang } = useT();
  // Phase 183 — tick once per minute so the pill stays accurate on
  // long-lived tabs. Without this, `Date.now()` was sampled at mount
  // and the count never refreshed — a tab opened the day before
  // expiry showed "เหลือ 1 วัน" forever.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tier === "free" || !periodEnd) return;
    // Phase 192d — Re-sample `now` immediately when periodEnd changes
    // (e.g. just after a successful redeem extends the period). Without
    // this the next render reuses the stale `now` from the last
    // 60-second tick, so a 30-day extension done at 23:59 can render
    // as "29 days" until the minute interval next fires.
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [tier, periodEnd]);
  if (tier === "free") return null;
  if (!periodEnd) return null;
  const end = new Date(periodEnd).getTime();
  if (Number.isNaN(end)) return null;
  const msLeft = end - now;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil(msLeft / dayMs);
  let text: string;
  let tone: "neutral" | "warn" | "bad";
  if (msLeft <= 0) {
    text = labels.daysLeftExpired;
    tone = "bad";
    // Phase 192f — Audit HIGH-12: the previous `daysLeft <= 0` branch
    // // here was unreachable. With `Math.ceil(positive / dayMs)` the
    // // result is always >= 1 whenever `msLeft > 0`, so the
    // // "หมดอายุวันนี้" / "Expires today" string never rendered. Gate on
    // // raw `msLeft < dayMs` instead so the locale string fires when
    // // less than 24h remain but the period has not yet ended.
  } else if (msLeft < dayMs) {
    text = labels.daysLeftToday;
    tone = "bad";
  } else if (daysLeft === 1) {
    text = labels.daysLeftLabelOne;
    tone = "bad";
  } else if (daysLeft <= 7) {
    text = labels.daysLeftLabel.replace("{days}", daysLeft.toString());
    tone = "warn";
  } else {
    text = labels.daysLeftLabel.replace("{days}", daysLeft.toString());
    tone = "neutral";
  }
  const toneClasses =
    tone === "bad"
      ? "border-[#b4533b]/35 bg-[#fff4f1]/70 text-[#8a3a2b]"
      : tone === "warn"
        ? "border-[#b8892f]/35 bg-[#fff8e8]/70 text-[#8a5a00]"
        : "border-[#2f7d68]/25 bg-[#edf7f3]/70 text-[#236653]";
  return (
    <span
      className={`expiry-pill doodee-readable-force inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] backdrop-blur-md ${toneClasses} ${className}`}
      // Phase 192f — Audit HIGH-17: force the Gregorian calendar. In
      // // Chrome/Edge the "th-TH" locale defaults to the Buddhist
      // // calendar, rendering 2025 as 2568 in the tooltip and confusing
      // // users who expect Gregorian years across the app. Passing
      // // `calendar: "gregory"` keeps the Thai locale's date/time
      // // formatting (digits, separators, AM/PM) but pins the year to
      // // the Gregorian era.
      title={new Date(periodEnd).toLocaleString(
        lang === "th" ? "th-TH" : "en-US",
        { calendar: "gregory", timeZone: "Asia/Bangkok" }
      )}
    >
      {text}
    </span>
  );
}
