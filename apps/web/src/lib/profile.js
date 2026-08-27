// หน้าโปรไฟล์, the parts worth testing without a browser.
//
// The page itself is four cards of read-only text; what can actually be wrong is the arithmetic
// on dates and the decision about which benefits exist. Those live here.

/** Whole days from now until `iso`, or null when there is no date. Negative once it has passed. */
export function daysUntil(iso, now = Date.now()) {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return null;
  // Ceil so the last partial day still reads as "1 วัน" rather than rounding away to zero — the
  // same rule `promoCode.daysRemaining` already uses for the VIP counter.
  return Math.ceil((end - now) / 86_400_000);
}

/**
 * Whether a plan is close enough to its end to say so.
 *
 * A date alone makes the reader do the arithmetic, and the whole point of the card is that they
 * do not have to. Already-expired counts: the most urgent case must not read as "fine".
 */
export function isExpiringSoon(iso, withinDays = 7, now = Date.now()) {
  const days = daysUntil(iso, now);
  return days !== null && days <= withinDays;
}

/**
 * How a plan's end date reads on the card.
 *
 * `null` is not missing data — an account an admin granted a group to has entitlement and no
 * subscription, so there is genuinely no date. Saying "ไม่มีวันหมดอายุ" is true; showing a blank
 * or a dash would look like something failed to load.
 */
export function describeExpiry(iso, lang = "th", now = Date.now()) {
  const days = daysUntil(iso, now);
  if (days === null) return lang === "en" ? "No expiry date" : "ไม่มีวันหมดอายุ";
  if (days < 0) return lang === "en" ? "Expired" : "หมดอายุแล้ว";
  if (days === 0) return lang === "en" ? "Expires today" : "หมดอายุวันนี้";
  return lang === "en" ? `${days} days left` : `เหลืออีก ${days} วัน`;
}

/** A date for display. Locale-aware, and never throws on a value the server did not send. */
export function formatDate(iso, lang = "th") {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", {
    year: "numeric", month: "long", day: "numeric",
  });
}

/**
 * The สิทธิ์ cards, from the profile payload.
 *
 * requirement.md asks for a ใช้สิทธิ์ button per benefit, so each entry carries the `to` the
 * button navigates to — checkout with the benefit already applied, rather than spending anything
 * from the profile page itself.
 *
 * Returns [] rather than a placeholder when there is nothing: the caller renders an honest empty
 * state, and an empty list is easier to assert on than a sentinel.
 */
export function benefitsFor(profile) {
  const benefits = [];
  const credit = Number(profile?.benefits?.credit_satang || 0);
  if (credit > 0) {
    benefits.push({ kind: "credit", amountSatang: credit, to: "/pricing?credit=1" });
  }
  for (const discount of profile?.benefits?.discounts ?? []) {
    benefits.push({
      kind: "discount",
      discount,
      to: `/pricing?coupon=${encodeURIComponent(discount.code)}`,
    });
  }
  return benefits;
}

/** Quota rows for the plan card. `null` stays null all the way to the label — never a number. */
export function quotaRows(profile, lang = "th") {
  const labels = {
    preview_remaining: { th: "จำลองใบหน้า", en: "Simulations" },
    chat_remaining: { th: "แชท", en: "Chat" },
    saved_remaining: { th: "บันทึกภาพ", en: "Saved images" },
  };
  return Object.entries(labels).map(([key, label]) => ({
    key,
    label: label[lang] ?? label.th,
    remaining: profile?.quotas?.[key] ?? null,
    unlimited: (profile?.quotas?.[key] ?? null) === null,
  }));
}
