"use client";

/**
 * The seam between the ported UI's data calls and this app's backend.
 *
 * The UI was ported from a Next.js app that shipped its own `/api/*` routes.
 * Those routes do not exist here — this app talks to Django at
 * `VITE_API_URL` (`/api/v1/...` by default), with a different domain model.
 * Left alone, every ported `fetch("/api/…")` would hit the SPA's own index.html
 * and fail on the JSON parse, which is how a missing backend turns into an
 * unreadable client-side crash.
 *
 * `ddFetch` is a drop-in for `fetch` at those call sites. It routes each ported
 * endpoint to one of three outcomes:
 *
 *   MAPPED    — a Django endpoint with the same meaning exists; call it.
 *   NO-OP     — the endpoint only recorded analytics. Dropping the call costs
 *               nothing a user can see, so it resolves 204 rather than erroring.
 *   NOT WIRED — no Django counterpart exists yet. Resolves a well-formed 501
 *               with a machine-readable body, so the calling screen shows its
 *               own error state instead of throwing on an HTML response.
 *
 * The NOT-WIRED set is deliberately NOT faked. The quota endpoints are the
 * clearest case: the ported client expects a `SubscriptionRow` counting
 * `scans_quota`/`scans_used`, while Django meters plan tiers with per-month
 * entitlements for previews, saves and chat turns, and has no scan counter at
 * all. Synthesising a row would put invented allowance numbers in front of
 * users and silently mis-gate paid features. Which Django concept each ported
 * quota field maps to is a product decision, and it belongs in a commit that
 * makes it, not in a shim that guesses.
 */

const NOT_WIRED_STATUS = 501;

/** Endpoints that only recorded analytics upstream. Safe to drop. */
const ANALYTICS_ENDPOINTS = new Set(["/api/product-events", "/api/usage/track"]);

/**
 * Ported endpoint → Django path, for the cases where the two mean the same
 * thing and take the same shape. Empty today; entries land here as each screen
 * is wired, and every addition should be justified against Django's serializer
 * rather than assumed from the name.
 */
const MAPPED_ENDPOINTS: Record<string, string> = {};

/** Endpoints known to have no Django counterpart, with why, for the 501 body
 *  and for anyone reading a console warning. */
const NOT_WIRED_REASONS: Record<string, string> = {
  "/api/quota": "Django meters plan tiers + per-month entitlements, not scan/preview counters",
  "/api/quota/consume": "no scan counter exists on the Django side",
  "/api/quota/refund": "no scan counter exists on the Django side",
  "/api/user-profile": "Django /profile/ is read-only; onboarding preferences have no write endpoint",
  "/api/redeem": "Django /redeem/ exists but takes a different request and response shape",
  "/api/stripe/checkout": "billing runs on Omise here; checkout goes through /orders/",
  "/api/stripe/portal": "no self-serve billing portal on Omise",
  "/api/dataset/consent-sample": "dataset-consent capture was not ported",
};

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001/api/v1";

// One warning per endpoint per session. These fire on ordinary navigation, and
// a warning per render would bury everything else in the console.
const warned = new Set<string>();

function warnOnce(path: string, message: string): void {
  if (warned.has(path)) return;
  warned.add(path);
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[dd/api-bridge] ${path}: ${message}`);
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Drop-in replacement for `fetch` at the ported `/api/*` call sites.
 *
 * Anything that is not a ported `/api/…` path is passed straight through, so
 * this is safe to use unconditionally.
 */
export async function ddFetch(input: string, init?: RequestInit): Promise<Response> {
  const path = input.split("?")[0];

  if (!path.startsWith("/api/")) return fetch(input, init);

  if (ANALYTICS_ENDPOINTS.has(path)) {
    warnOnce(path, "analytics endpoint not ported — dropping the call");
    return new Response(null, { status: 204 });
  }

  const mapped = MAPPED_ENDPOINTS[path];
  if (mapped) {
    const suffix = input.slice(path.length); // preserve any query string
    return fetch(`${API_BASE}${mapped}${suffix}`, init);
  }

  const reason = NOT_WIRED_REASONS[path] ?? "no Django counterpart";
  warnOnce(path, `not wired — ${reason}`);
  return jsonResponse(
    { error: "endpoint_not_wired", endpoint: path, reason },
    NOT_WIRED_STATUS,
  );
}

/** True when a response came from the not-wired branch above, so a screen can
 *  tell "this feature is not connected yet" from a genuine server failure. */
export function isNotWired(response: Response): boolean {
  return response.status === NOT_WIRED_STATUS;
}
