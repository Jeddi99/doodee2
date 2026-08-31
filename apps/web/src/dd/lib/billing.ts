import { ddFetch } from "./api-bridge";
/**
 * Phase 152 → 158.18 — Plan-aware billing entrypoint.
 *
 * Checkout now uses dynamic server-created Stripe Sessions:
 *
 *   1. Client POSTs `{ tier }` + Bearer JWT → /api/stripe/checkout
 *   2. Server creates a Session from PLAN_CATALOG/TIER_THB pricing with
 *      `client_reference_id = user.id`, returns
 *      `{ url }` for the user's hosted Stripe Checkout page.
 *   3. After payment, Stripe fires `checkout.session.completed` and our
 *      webhook (`/api/stripe/webhook`) credits the right user.
 *
 * Guests are redirected to /login; the upgrade page guards before calling.
 */

import type { SubscriptionTier } from "@/types";
import { getAccessToken } from "@/lib/supabase/auth-client";

// PlanKey alias kept for legacy imports. New code should use SubscriptionTier.
export type PlanKey = SubscriptionTier;

// Phase 192r — `"card"` → recurring subscription, `"promptpay"` → one-time
// 30-day grant. Defaults to "card" so existing callers stay unchanged.
export type CheckoutMethod = "card" | "promptpay";
export type CheckoutOffer = "new_user_plus_29";

export const promptPayCheckoutEnabled =
  import.meta.env.VITE_STRIPE_PROMPTPAY === "1";

const PENDING_CHECKOUT_KEY = "doodee.checkout.pending";
const PENDING_CHECKOUT_MAX_AGE_MS = 10 * 60 * 1000;

type PaidTier = Exclude<SubscriptionTier, "free">;

export type PendingCheckout = {
  tier: PaidTier;
  method: CheckoutMethod;
  createdAt: number;
};

export type CheckoutOptions = {
  offer?: CheckoutOffer;
};

export type CheckoutResult =
  | "checkout"
  | "scan"
  | "unauthorized"
  | "unconfigured"
  // Phase 192r — server returned 400 `promptpay-not-enabled`. Distinct from
  // `unconfigured` so the UI can show "use a card instead" rather than a
  // generic "checkout not configured" message.
  | "promptpay-disabled"
  | "offer-ineligible"
  | "failed";

let checkoutInFlight: Promise<CheckoutResult> | null = null;

/**
 * Phase 158.18 — Always true. The server `/api/stripe/checkout` route owns
 * the Price ID lookup now; if STRIPE_PRICE_* env vars are missing it returns
 * a 400 we surface to the user. Keeping the function so the existing
 * callers (UpgradePage `billingConfigured()` guard) stay source-compatible.
 */
export function billingConfigured(tier: SubscriptionTier): boolean {
  return tier === "free" ? true : true;
}

// Phase 192r — Pull the `reason` field out of a 400 body without throwing
// if it isn't JSON. The route returns `{ error, reason }`.
//
// Phase 192v — a Response body is a one-shot stream, so read it ONCE here and
// return the whole parsed object. The route now also sends `detail`/`param`
// on a `stripe_error`, and the caller logs the full body for diagnosis; it
// still reads `body.reason` for the branch decision, exactly as before.
interface BadRequestBody {
  error?: unknown;
  reason?: unknown;
  param?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function paidTier(value: unknown): PaidTier | null {
  return value === "plus" || value === "pro" ? value : null;
}

function checkoutMethod(value: unknown): CheckoutMethod | null {
  return value === "card" || value === "promptpay" ? value : null;
}

export function savePendingCheckout(
  tier: SubscriptionTier,
  method: CheckoutMethod
): void {
  if (tier === "free" || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({ tier, method, createdAt: Date.now() })
    );
  } catch {}
}

export function consumePendingCheckout(): PendingCheckout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const tier = paidTier(parsed.tier);
    const method = checkoutMethod(parsed.method);
    const createdAt = parsed.createdAt;
    if (!tier || !method || typeof createdAt !== "number") return null;
    if (Date.now() - createdAt > PENDING_CHECKOUT_MAX_AGE_MS) return null;
    return { tier, method, createdAt };
  } catch {
    return null;
  }
}

async function readBadRequestBody(res: Response): Promise<BadRequestBody | null> {
  return (await res.json().catch(() => null)) as BadRequestBody | null;
}

function reasonOf(body: BadRequestBody | null): string | null {
  return typeof body?.reason === "string" ? body.reason : null;
}

/**
 * Phase 158.18 — Open Stripe Checkout for a paid tier.
 *
 * Returns synchronously for "scan" (free); for paid tiers returns a Promise
 * because we have to fetch a fresh access token + create a Stripe Session
 * server-side. Callers await this and inspect the result.
 *
 * Phase 192r — `method` selects card (subscription) vs PromptPay (one-time).
 */
export async function openCheckout(
  tier: SubscriptionTier,
  // Phase 192r — caller picks the rail. The body field is what the
  // /api/stripe/checkout route branches on (`method: "card" | "promptpay"`).
  method: CheckoutMethod = "card",
  options: CheckoutOptions = {}
): Promise<CheckoutResult> {
  if (checkoutInFlight) return checkoutInFlight;
  const checkout = runCheckout(tier, method, options);
  checkoutInFlight = checkout;
  try {
    return await checkout;
  } finally {
    if (checkoutInFlight === checkout) {
      checkoutInFlight = null;
    }
  }
}

async function runCheckout(
  tier: SubscriptionTier,
  method: CheckoutMethod,
  options: CheckoutOptions
): Promise<CheckoutResult> {
  if (tier === "free") {
    if (typeof window !== "undefined") window.location.href = "/scan";
    return "scan";
  }

  const token = await getAccessToken();
  if (!token) {
    // Not signed in — redirect to login and return them here after.
    if (typeof window !== "undefined") {
      savePendingCheckout(tier, method);
      window.location.href = `/login?next=${encodeURIComponent("/upgrade")}`;
    }
    return "unauthorized";
  }

  let res: Response;
  try {
    res = await ddFetch("/api/stripe/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tier, method, offer: options.offer }),
    });
  } catch {
    return "failed";
  }

  if (res.status === 400) {
    // Phase 192r — disambiguate the 400 reasons. `promptpay-not-enabled`
    // means the server feature flag is off (Stripe method not activated);
    // surface a "use a card" hint. Any other 400 is a Price-ID mis-config.
    //
    // Phase 192v — read the WHOLE body (not just `reason`) and log it so the
    // operator sees the real cause in the browser console. The server now
    // returns `{ error:"stripe_error", reason, detail, param }` when Stripe
    // throws (e.g. a LIVE key rejecting a TEST `price_` → detail "No such
    // price: price_xxx"). Without this log the UI still just shows
    // "เปิดหน้าชำระเงินไม่ได้" and the cause stays invisible.
    const body = await readBadRequestBody(res);
    const reason = reasonOf(body);
    if (reason === "promptpay-not-enabled") return "promptpay-disabled";
    if (reason === "intro-offer-ineligible") return "offer-ineligible";
    // stripe_error / price-not-configured both mean the operator must fix
    // Stripe config. Log the full body so the real reason isn't swallowed.
    return "unconfigured";
  }
  if (!res.ok) {
    return "failed";
  }

  const data = (await res.json().catch(() => ({}))) as { url?: string };
  if (!data.url) return "failed";

  if (typeof window !== "undefined") {
    window.location.href = data.url;
  }
  return "checkout";
}

/**
 * Phase 158.18 — Synchronous lookup is no longer possible (depends on a
 * server round-trip). Callers should use `openCheckout` directly or render
 * a button that triggers the async flow. Kept for backwards compat —
 * returns `null` for paid tiers so legacy callers fall through to scan.
 */
export function checkoutLinkFor(tier: SubscriptionTier): string | null {
  if (tier === "free") return "/scan";
  return null;
}

/**
 * Phase 189 — Open the Stripe Customer Portal so the user can manage
 * an existing subscription: change payment method, view invoices,
 * cancel, or re-enable a cancelled-at-period-end subscription.
 *
 * Result codes match `openCheckout` so existing UI error-handling
 * shapes work. `"no-customer"` is returned when the user has never
 * paid (Stripe Customer object doesn't exist yet) — caller should
 * redirect them to /upgrade.
 */
export type PortalResult =
  | "portal"
  | "unauthorized"
  | "no-customer"
  | "failed";

export async function openBillingPortal(): Promise<PortalResult> {
  const token = await getAccessToken();
  if (!token) {
    if (typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent("/settings")}`;
    }
    return "unauthorized";
  }

  let res: Response;
  try {
    res = await ddFetch("/api/stripe/portal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return "failed";
  }

  if (res.status === 409) {
    return "no-customer";
  }
  if (!res.ok) {
    return "failed";
  }

  const data = (await res.json().catch(() => ({}))) as { url?: string };
  if (!data.url) return "failed";

  if (typeof window !== "undefined") {
    window.location.href = data.url;
  }
  return "portal";
}
