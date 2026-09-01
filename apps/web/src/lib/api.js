import { signInAnonymously } from 'firebase/auth';
import { getFirebaseAuth, googleSignIn } from './firebase';
import { errorMessage } from './apiError';


// Matches the port compose.yaml publishes the api service on, and the mobile app's default.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';

async function request(path, options = {}) {
  let token = null;
  try {
    const firebaseAuth = getFirebaseAuth();
    await firebaseAuth.authStateReady();
    if (!firebaseAuth.currentUser) {
      await signInAnonymously(firebaseAuth).catch(() => {});
    }
    token = await firebaseAuth.currentUser?.getIdToken();
  } catch {
    token = 'dev-guest-token';
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token || 'dev-guest-token'}` }
    });
  } catch (cause) {
    const error = new Error(`Cannot reach the API at ${API_URL}`, { cause });
    error.code = 'api_unreachable';
    // No `status`: the request never reached the server. `queryRetry.isRetriable` reads the
    // absence as "worth one more try", which is what a dead socket deserves.
    throw error;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(errorMessage(payload) || `Request failed (${response.status})`);
    // Carried so `queryRetry` can tell a 503 worth retrying from a 429 that is already the
    // final answer. Nothing read these before, so adding them cannot change existing behaviour.
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export async function signIn() {
  await googleSignIn();
  return request('/session/');
}

/**
 * Reserve a scan, PUT each image to its signed URL, then commit.
 *
 * Options rather than positional arguments: this took eight in a row, which was already at the
 * limit of what a call site can be read against, and the upload path adds a ninth. Mobile uses
 * `uploadScanDirect` in @doodee/shared and is unaffected.
 */
export function uploadScan(files, {
  ageBand, referenceAgeBand, referenceProfile, referencePopulation, consentVersion,
  scanMode = 'standard', captureMethod = 'web_camera', uploadAttestationVersion = '',
}) {
  const key = crypto.randomUUID();
  const metadata = {
    age_band: ageBand, reference_age_band: referenceAgeBand, reference_profile: referenceProfile,
    reference_population: referencePopulation, analysis_consent_version: consentVersion,
    scan_mode: scanMode, capture_method: captureMethod,
    // Only sent when it means something. The server requires it for an upload and records it as
    // the policy version behind the photo_owner consent row.
    ...(uploadAttestationVersion ? { upload_attestation_version: uploadAttestationVersion } : {}),
    files: Object.fromEntries(Object.entries(files).filter(([, file]) => file).map(([view, file]) => [view, file.type])),
  };
  return request('/scans/uploads/', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(metadata),
  }).then(async (reserved) => {
    await Promise.all(Object.entries(reserved.uploads).map(async ([view, upload]) => {
      const response = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': upload.content_type }, body: files[view] });
      if (!response.ok) throw new Error(`Storage upload failed (${response.status})`);
    }));
    return request(`/scans/${reserved.id}/commit/`, { method: 'POST' });
  });
}

export const getScan = (scanId) => request(`/scans/${scanId}/status/`);
export const getScans = () => request('/scans/');
// 403 for a free account, 409 while the scan is still being analysed — the caller shows a
// different thing for each, so neither is smoothed into an empty result here.
export const getScoreCard = (scanId) => request(`/scans/${scanId}/score-card/`);
/**
 * The user's skin readings over time, already split into runs the server judged comparable.
 *
 * The splitting is deliberately not done here: `skin_engine.comparison_break` is one definition
 * of when two photographs may be compared, and a second copy in JavaScript would drift from it.
 */
export const getSkinTrend = () => request('/scans/skin-trend/');
export const getSkinAnalysis = (scanId) => request(`/scans/${scanId}/skin/`);
// Both directions go through POST: the consent log is append-only, so withdrawing writes a row
// rather than deleting one, and the version says which wording was on screen when they agreed.
export const setSkinVisionConsent = (accepted, policyVersion) => request('/consent/skin-vision/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ accepted, policy_version: policyVersion }),
});
export const getSession = () => request('/session/');
// หน้าโปรไฟล์: identity, plan and expiry, quotas, benefits, referral summary and the last ten
// receipts in one read — the page is a single answer, not four.
export const getProfile = () => request('/profile/');
export const deleteScan = (scanId) => request(`/scans/${scanId}/`, { method: 'DELETE' });
// Without a region this returns the whole catalog, which the simulation view needs: a stacked
// selection has to name shapes and procedures for regions whose tab is not open.
export const getProcedures = (region) => request(region ? `/procedures/?region=${encodeURIComponent(region)}` : '/procedures/');
// `selections` is an array of `{ region, preset_id }` — one entry per region being simulated.
export const createSimulation = (scanId, selections, consentVersion) => request('/simulations/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ scan_id: scanId, selections, simulation_consent_version: consentVersion }),
});
export const previewSimulation = (scanId, selections, consentVersion) => request('/simulations/preview/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ scan_id: scanId, selections, simulation_consent_version: consentVersion }),
});
export const getSimulation = (simulationId) => request(`/simulations/${simulationId}/status/`);
// DOODEE Chat. Only the measurements travel upstream — the backend never sends the photos,
// and there is deliberately no way to attach one from here.
// Bumping this records a fresh ConsentEvent for every user, so change it only when what we
// send, or who we send it to, actually changes.
export const CHAT_CONSENT_VERSION = '2026.3-chat';
export const getChats = () => request('/chat/');
// Questions answerable from the scan's own numbers. No model, no key, no quota — these work
// even when chat_enabled is false.
export const getChatFacts = (lang) => request(`/chat/facts/?lang=${lang === 'en' ? 'en' : 'th'}`);
// The three voices. Wording and order come from the admin, so they are fetched, not listed here.
export const getChatRoles = (lang) => request(`/chat/roles/?lang=${lang === 'en' ? 'en' : 'th'}`);
export const askChatTopic = ({ topic, conversationId, scanId, lang }) => request('/chat/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ topic, conversation_id: conversationId, scan_id: scanId, lang }),
});
export const getChat = (conversationId) => request(`/chat/${conversationId}/`);
export const deleteChat = (conversationId) => request(`/chat/${conversationId}/`, { method: 'DELETE' });
// 429 when the month's turns are gone, 503 without an API key, 502 when Claude is unreachable —
// each says something different to the user, so none are collapsed into one failure here.
// chat_consent_version is required and separate from the analysis consent: this is the only
// call in the app that sends anything to a third party (the measurements, never the photos).
// `role` is honoured only when opening a new conversation: the server keeps an existing
// thread on the voice it started with, so the cached prompt prefix stays byte-identical.
export const sendChat = ({ message, conversationId, scanId, role }) => request('/chat/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({
    message,
    conversation_id: conversationId,
    scan_id: scanId,
    role,
    chat_consent_version: CHAT_CONSENT_VERSION,
  }),
});
// Plans, coupons and orders. Prices cross the wire in satang (integer) — never baht floats.
export const getPlans = () => request('/plans/');
export const getOrders = () => request('/orders/');
// Prices the discount without spending the coupon, so the total can be shown before the user
// commits. The server re-checks it at order time; this result is a preview, not a reservation.
export const validateCoupon = (code, plan) => request('/coupons/validate/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code, plan }),
});
// `useCredit` spends referral credit against this order. The server re-reads the real balance
// when the order settles, so what is asked for here is a request, not a reservation.
export const createOrder = (plan, coupon, useCredit = false) => request('/orders/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan, coupon, use_credit: useCredit }),
});
// ชวนเพื่อน. The overview mints this account's code on first read, so calling it is what
// creates one — there is nothing to POST.
export const getReferral = () => request('/referral/');
// Records that this account was invited and hands over the friend discount. The inviter's ฿30
// is not paid here; it vests when this account first pays for something.
export const claimReferral = (code) => request('/referral/claim/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
// Which link brought this account here, for the admin marketing report. Written once server
// side and never updated, so calling it twice is harmless. The arrival itself is counted by
// lib/visit.js, which must not go through this client — see the note in sendVisit().
export const postAttribution = (utm) => request('/attribution/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    utm_source: utm?.source || 'direct',
    utm_medium: utm?.medium || 'direct',
    utm_campaign: utm?.campaign || 'direct',
    landing_path: utm?.landing_path || '/',
  }),
});
export const getCredits = () => request('/credits/');
// Where withdrawals are sent. The GET never returns the full number — there is no endpoint that
// does. Only an operator making a transfer can read it, through an audited action in the admin.
export const getPayoutAccount = () => request('/payout-account/');
export const savePayoutAccount = (account) => request('/payout-account/', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(account),
});
export const getWithdrawals = () => request('/withdrawals/');
// Omit `amountSatang` to withdraw the whole withdrawable balance. Creating a request deducts the
// credit immediately, so it cannot also be spent on a subscription while an operator processes it.
export const requestWithdrawal = (amountSatang) => request('/withdrawals/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount_satang: amountSatang ?? null }),
});
export const cancelWithdrawal = (id) => request(`/withdrawals/${id}/cancel/`, { method: 'POST' });
// แผนพัฒนาตนเอง. 403 on the free tier and 409 before the scan has been scored — the caller says
// something different for each, so neither is flattened into an empty plan here.
export const getDevelopmentPlan = (scanId, lang) =>
  request(`/scans/${scanId}/development-plan/?lang=${lang === 'en' ? 'en' : 'th'}`);
export const getNotifications = () => request('/notifications/');
export const markNotificationsRead = (ids) => request('/notifications/read/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ids }),
});
export const deleteAccount = () => request('/account/', { method: 'DELETE' });
export const redeemCode = (code) => request('/redeem/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
