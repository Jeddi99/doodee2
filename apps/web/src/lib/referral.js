// ชวนเพื่อน, client side. Pure functions only — everything that decides money lives on the
// server, and this file exists so the parts that do not can be tested without a browser.

// Where a ?ref= code waits between landing on the site and having an account to attach it to.
// sessionStorage rather than localStorage: a code is meant for the signup happening right now,
// and one left in localStorage would still be there next month, attaching itself to a second
// account the same person created for their own reasons.
export const REF_STORAGE_KEY = 'doodee.ref';

// Matches the server's alphabet (referral.py): eight characters, no 0/O/1/I/L.
const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

export const normalizeReferralCode = (input) => String(input ?? '').trim().toUpperCase();

/** Whether this could be a real code. Saves a rate-limit slot on something that cannot exist. */
export const isValidReferralCode = (input) => CODE_PATTERN.test(normalizeReferralCode(input));

/** Reads `?ref=` out of a URL query string. Returns '' when there is nothing usable. */
export function referralCodeFromQuery(search) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return '';
  }
  const code = normalizeReferralCode(params.get('ref'));
  return isValidReferralCode(code) ? code : '';
}

/**
 * Remember a code seen in the URL so it survives the trip through the sign-in provider.
 *
 * Google sign-in leaves the page entirely and comes back on a URL with no `?ref=` on it, so a
 * code read only at claim time would be gone by the time there is an account to attach it to.
 * An existing stored code is not overwritten: the first inviter to send someone here is the one
 * who invited them.
 */
export function rememberReferralCode(code, storage) {
  const normalized = normalizeReferralCode(code);
  if (!isValidReferralCode(normalized) || !storage) return '';
  const existing = storage.getItem(REF_STORAGE_KEY);
  if (existing) return existing;
  storage.setItem(REF_STORAGE_KEY, normalized);
  return normalized;
}

export function takeStoredReferralCode(storage) {
  if (!storage) return '';
  const code = normalizeReferralCode(storage.getItem(REF_STORAGE_KEY));
  // Cleared on read, whatever happens next. A code that stayed put after a failed claim would
  // be retried on every page load for as long as the tab stayed open, burning the rate limit.
  storage.removeItem(REF_STORAGE_KEY);
  return isValidReferralCode(code) ? code : '';
}

/** The link a user shares. Built from the current origin so staging never hands out prod URLs. */
export const shareUrl = (code, origin) =>
  `${String(origin || '').replace(/\/$/, '')}/?ref=${normalizeReferralCode(code)}`;

/** Satang to baht for display. Nothing is ever stored or sent as a decimal. */
export function baht(satang) {
  const value = Number(satang || 0) / 100;
  return `฿${value.toLocaleString(undefined, {
    minimumFractionDigits: Number(satang || 0) % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * How a discount reads on a card, before any specific price is known.
 *
 * The cap has to appear. "ลด 10%" against the ฿4,990 yearly plan promises ฿499 and delivers
 * ฿100, and a user who finds that out at the payment step has been misled by this label.
 */
export function describeDiscount(discount, lang = 'th') {
  if (!discount) return '';
  if (discount.discount_type !== 'percent') {
    return lang === 'en'
      ? `${baht(discount.discount_value)} off`
      : `ลด ${baht(discount.discount_value)}`;
  }
  const capped = discount.max_discount_satang
    ? (lang === 'en'
      ? ` (up to ${baht(discount.max_discount_satang)})`
      : ` (ไม่เกิน ${baht(discount.max_discount_satang)})`)
    : '';
  return lang === 'en'
    ? `${discount.discount_value}% off${capped}`
    : `ลด ${discount.discount_value}%${capped}`;
}

/**
 * What a yearly plan saves against paying monthly, as a whole percent.
 *
 * Returns null when the comparison would be meaningless — a missing monthly row, a free tier —
 * rather than 0, so the caller can leave the badge off instead of printing "ประหยัด 0%".
 */
export function yearlySavingPercent(monthlyPlan, yearlyPlan) {
  const monthly = Number(monthlyPlan?.price_satang || 0);
  const yearly = Number(yearlyPlan?.price_satang || 0);
  if (monthly <= 0 || yearly <= 0) return null;
  const full = monthly * 12;
  if (yearly >= full) return null;
  return Math.round(((full - yearly) / full) * 100);
}

/** Pairs each monthly plan with its `_year` counterpart, for the monthly/yearly toggle. */
export function planPairs(plans) {
  const byCode = new Map((plans || []).map((plan) => [plan.code, plan]));
  return (plans || [])
    .filter((plan) => plan.interval !== 'year')
    .map((plan) => ({
      monthly: plan,
      yearly: byCode.get(`${plan.code}_year`) || null,
    }));
}
