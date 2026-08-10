// Promo codes grant paid entitlement for a fixed number of days. Codes are stored uppercase
// on the server, so normalise here rather than making every caller remember.

export const MIN_CODE_LENGTH = 8;

export const normalizeCode = (input) => String(input ?? '').trim().toUpperCase();

/** Cheap client-side check so a code too short to exist never costs a rate-limit slot. */
export const canSubmitCode = (input) => normalizeCode(input).length >= MIN_CODE_LENGTH;

/**
 * Whole days left on an entitlement, or null when there is none.
 *
 * Rounds up so the last partial day still reads as "1 day left" rather than zero, and returns
 * null once it has passed so callers show nothing instead of a negative count.
 */
export function daysRemaining(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end) || end <= now) return null;
  return Math.ceil((end - now) / 86_400_000);
}

export const isVipActive = (expiresAt, now = Date.now()) => daysRemaining(expiresAt, now) !== null;
