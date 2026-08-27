// Where a visitor came from, client side. Pure functions with the storage object passed in, so
// the whole file is testable in node — same shape as referral.js next door, and for the same
// reason: this is the only place a marketing number can be silently lost, and it should be
// possible to prove it is not.

// The utm tags read off the landing URL, held until there is an account to attach them to.
// sessionStorage, not localStorage: this tab's arrival belongs to this tab's signup. Sign-in uses
// a popup (see lib/firebase.js), so the tab is never navigated away and the value survives the
// trip without needing an expiry date. A 30-day window in localStorage would instead credit a
// TikTok click from March for a signup in August.
export const UTM_STORAGE_KEY = 'doodee.utm';

// Just a date string — "2026-08-27". Not an identifier, and deliberately not one: the server
// stores no visitor id of any kind, so "one arrival per browser per day" has to be decided here.
// localStorage because it must outlive the tab; a per-tab flag would count every new tab as a
// new visitor.
export const VISIT_DAY_KEY = 'doodee.visit.day';

// Matches attribution.py. Kept short and dull on both sides so the value stored is the value
// sent; anything else is dropped rather than mangled into a neighbouring campaign's row.
const MAX_LEN = 32;
const DIRECT = 'direct';

const cleanTag = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, MAX_LEN);

/**
 * Reads utm_source / utm_medium / utm_campaign out of a URL query string.
 *
 * Returns null when none of the three is present, so a plain visit to the site never overwrites
 * a stored campaign with a row of "direct".
 */
export function utmFromQuery(search) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return null;
  }
  const utm = {
    source: cleanTag(params.get('utm_source')),
    medium: cleanTag(params.get('utm_medium')),
    campaign: cleanTag(params.get('utm_campaign')),
  };
  if (!utm.source && !utm.medium && !utm.campaign) return null;
  return {
    source: utm.source || DIRECT,
    medium: utm.medium || DIRECT,
    campaign: utm.campaign || DIRECT,
  };
}

/**
 * Remember where this visit came from. First write wins.
 *
 * Every CTA on the landing page is a <Link to="/login"> that replaces the whole location, so the
 * query string is gone one click after arrival — the tags have to be taken the moment they are
 * seen. Not overwritten afterwards because first touch is the honest answer: the ad that brought
 * someone here is not the one they happened to click again on the way to signing up.
 */
export function rememberAttribution(utm, storage) {
  if (!utm || !storage) return null;
  try {
    const existing = storage.getItem(UTM_STORAGE_KEY);
    if (existing) return JSON.parse(existing);
    storage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
    return utm;
  } catch {
    // Private browsing with storage disabled, or a value someone hand-edited into nonsense.
    // Attribution is a report column, never a blocker.
    return null;
  }
}

/**
 * What was remembered, or null.
 *
 * Read-only, unlike takeStoredReferralCode: this value is needed twice — once for the arrival
 * beacon and again after sign-in — and clearing it on the first read is exactly how attribution
 * would go missing without anyone noticing.
 */
export function readAttribution(storage) {
  if (!storage) return null;
  try {
    const stored = JSON.parse(storage.getItem(UTM_STORAGE_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return null;
    return {
      source: cleanTag(stored.source) || DIRECT,
      medium: cleanTag(stored.medium) || DIRECT,
      campaign: cleanTag(stored.campaign) || DIRECT,
      landing_path: String(stored.landing_path || '/'),
    };
  } catch {
    return null;
  }
}

/** Which kind of device this is, by viewport. The server is never told anything more. */
export const deviceKind = (width) => (Number(width) > 0 && Number(width) < 768 ? 'mobile' : 'desktop');

/**
 * Whether to count this arrival, and mark it counted. True at most once per browser per day.
 *
 * The whole deduplication lives here because the server has no identifier to deduplicate on. If
 * storage is unavailable this returns true every time, which overcounts a private-browsing
 * visitor rather than losing them — the page calls the figure an estimate either way.
 */
export function shouldSendVisit(storage, today) {
  const day = String(today || '');
  if (!day) return false;
  if (!storage) return true;
  try {
    if (storage.getItem(VISIT_DAY_KEY) === day) return false;
    storage.setItem(VISIT_DAY_KEY, day);
    return true;
  } catch {
    return true;
  }
}

/** Today, as the local calendar date, in the format shouldSendVisit compares. */
export function localDay(date) {
  const value = date || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Exactly the body POST /visit/ expects. Nothing else about the browser is sent. */
export function visitPayload(utm, pathname, width) {
  const stored = utm || {};
  return {
    utm_source: cleanTag(stored.source) || DIRECT,
    utm_medium: cleanTag(stored.medium) || DIRECT,
    utm_campaign: cleanTag(stored.campaign) || DIRECT,
    landing_path: String(pathname || stored.landing_path || '/'),
    device: deviceKind(width),
  };
}

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8001/api/v1';

/**
 * Post one arrival. Raw fetch, on purpose.
 *
 * Not through lib/api.js: request() signs the browser in anonymously when nobody is logged in,
 * and the server would then issue a real Django account for every visitor — inflating the signup
 * figure this whole feature exists to measure. So no Authorization header at all, which is also
 * what lets the endpoint refuse every auth class.
 *
 * Failures are swallowed. A missed visit is a missing tally mark.
 */
export async function sendVisit(payload) {
  try {
    await fetch(`${API_URL}/visit/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Offline, blocked by an extension, or the API is down. None of it is the user's problem.
  }
}
