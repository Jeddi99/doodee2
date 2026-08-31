"use client";

/**
 * Phase 152 → 158.35 — React hook over the module-level subscription cache.
 *
 * The cache itself lives in `subscription-cache.ts` so `quota.ts` can write
 * to it without a circular import. This file owns the React glue:
 *   - hydrate state from the cache on mount
 *   - subscribe to cache updates and re-render
 *   - own the coalesced `fetchAndCache()` refetch (called on auth change,
 *     tab visibility, focus, pageshow, and via `notifySubscriptionChanged`)
 *
 * Previously the cache + hook were intertwined: every mount got its own
 * state slot, refetches raced with the consume-quota response, and the
 * sidebar kept showing stale numbers. Phase 158.35 makes the cache global
 * and lets the quota client push the updated row directly — sidebar
 * refreshes within one React tick of a successful scan.
 */

import { useCallback, useEffect, useState } from "react";
import {
  getAccessToken,
  onAuthChange,
  supabaseConfigured,
} from "@/lib/supabase/auth-client";
import type { SubscriptionRow } from "@/lib/supabase/types";
import { fetchSubscription, getGuestQuotaLocal } from "@/lib/quota";
import {
  getCachedIsGuest,
  getCachedRow,
  setSubscriptionCache,
  subscribeToSubscriptionCache,
  SUBSCRIPTION_CROSS_TAB_KEY,
} from "@/lib/subscription-cache";

// Re-export so existing imports (`from "@/lib/use-subscription"`) keep working.
export { setSubscriptionCache };

export const SUBSCRIPTION_CHANGED_EVENT = "doodee:subscription-changed";

export interface UseSubscriptionState {
  subscription: SubscriptionRow | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  isGuest: boolean;
}

// Phase 192g — Module-level caching strategy.
//
// The /api/quota fetch is the single biggest latency cost on mobile route
// changes. Without coordination, every mount of `useSubscription` (sidebar,
// quota chip, account page, upgrade banner — sometimes 4-6 per render
// tree) would fire its own GET, then React Router transitions would do it
// all over again 300ms later.
//
// We layer four mechanisms to keep wire traffic minimal:
//
//   1. **Module-level cache** (`subscription-cache.ts`) — one row, all
//      consumers subscribe; mount returns immediately with whatever the
//      cache holds (stale-while-revalidate baseline).
//   2. **Singleton in-flight promise** (`inflightFetch`) — concurrent
//      callers await the SAME network request instead of stacking N.
//   3. **TTL guard** (`lastFetchAt` + `FETCH_TTL_MS`) — within 30s of a
//      successful fetch, mount-triggered refetches are skipped entirely.
//      Explicit invalidations (auth change, redeem, Stripe return,
//      `notifySubscriptionChanged`, focus/visibility/pageshow, storage)
//      bypass the TTL via `forceRefresh = true`.
//   4. **Optimistic push** — `consume`/`refund`/`redeem`/Stripe-success
//      write the authoritative row directly into the cache so the UI
//      updates in one React tick with zero network round-trip.
//
// Cache CLEAR (not just invalidate) happens only on sign-out, via the
// auth listener — see `installGlobalListeners` below. That path is
// preserved exactly so no PRO data flashes to a logged-out user.
let inflightFetch: Promise<void> | null = null;
let lastFetchAt = 0;
// Phase 192p — Mobile networks are flaky and switching apps repeatedly
// (visibility flip) used to trigger a refetch storm. Use a much longer
// TTL on mobile so visibility/focus-driven refetches collapse into one
// hit per 5 minutes instead of one per app-switch.
function isMobileViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 768px)").matches
  );
}
function getFetchTtlMs(): number {
  return isMobileViewport() ? 5 * 60_000 : 30_000;
}

function isQuotaAuthError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "fetch-subscription-401" ||
      error.message === "fetch-subscription-403")
  );
}

async function fetchSubscriptionWithFreshTokenRetry(): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  try {
    await fetchSubscription(token);
    return true;
  } catch (error) {
    if (!isQuotaAuthError(error)) throw error;
    const freshToken = await getAccessToken(true).catch(() => null);
    if (!freshToken) {
      return false;
    }
    try {
      await fetchSubscription(freshToken);
      return true;
    } catch (retryError) {
      if (!isQuotaAuthError(retryError)) throw retryError;
      return false;
    }
  }
}

async function fetchAndCache(forceRefresh = false): Promise<void> {
  // Phase 192g — TTL fast-path. If we successfully fetched within the
  // last 30s AND the cache holds a row AND the caller didn't ask for a
  // forced refresh, skip the network entirely. This is what kills the
  // mount-time round-trip on route changes.
  if (
    !forceRefresh &&
    getCachedRow() !== null &&
    Date.now() - lastFetchAt < getFetchTtlMs()
  ) {
    return;
  }
  if (inflightFetch) {
    await inflightFetch;
    return;
  }
  inflightFetch = (async () => {
    try {
      // Phase 158.20 made auth mandatory; Phase 158.36d removes the guest
      // fallback that was overwriting an already-correct DB row whenever
      // a stale auth-state-change event fired with a momentarily empty
      // session. Now: no token → leave cache untouched (the auth listener
      // will retry once a real session is available).
      if (!supabaseConfigured()) {
        setSubscriptionCache(getGuestQuotaLocal());
        lastFetchAt = Date.now();
        return;
      }
      const loaded = await fetchSubscriptionWithFreshTokenRetry();
      if (!loaded) {
        lastFetchAt = 0;
        return;
      }
      lastFetchAt = Date.now();
    } catch (e) {
      // Phase 192v — A failed refetch (401 mid-rotation, timeout, malformed
      // JSON) used to leave this IIFE rejecting with no handler: cache stayed
      // null, `lastFetchAt` was never advanced → perpetual loading with no
      // retry. Reset `lastFetchAt = 0` so the next mount / auth-change /
      // focus bypasses the TTL and retries. We SWALLOW (don't re-throw)
      // deliberately: `installGlobalListeners` floats this via
      // `void fetchAndCache(true)`, so a re-throw would create an unhandled
      // rejection — the exact silent-failure class this phase removes. The
      // consumer `.finally(() => setLoading(false))` blocks (refresh / mount)
      // still clear the spinner because the awaited promise now RESOLVES.
      console.warn("[useSubscription] refetch failed", e);
      lastFetchAt = 0;
    } finally {
      inflightFetch = null;
    }
  })();
  await inflightFetch;
}

/**
 * Phase 192g — Invalidate the TTL so the next `fetchAndCache()` call hits
 * the network. Use after redeem / Stripe-return / coupon flows where the
 * server-side row may have changed without us optimistically patching the
 * cache locally.
 */
export function invalidateSubscriptionCache(): void {
  lastFetchAt = 0;
}

/**
 * Fire a refetch. Safe to call from anywhere; multiple calls coalesce
 * into one network request via `inflightFetch`. Use `setSubscriptionCache`
 * instead when you already have the updated row — it's instant + saves
 * a network call.
 */
export function notifySubscriptionChanged(): void {
  // Phase 192g — Surface fetch failures instead of silently swallowing.
  // The previous `void fetchAndCache()` floated the promise; if the
  // refetch threw (network blip, 401 mid-rotation, malformed JSON), the
  // rejection went nowhere and the cache silently held a stale row.
  // Logging here gives at least a console breadcrumb without changing
  // the fire-and-forget contract callers depend on.
  // Phase 192g — `notifySubscriptionChanged` is the explicit "something
  // changed on the server" signal (redeem/Stripe-return/admin override).
  // Bypass the 30s TTL so we hit the network now.
  fetchAndCache(true).catch((e) => {
    console.error("[subscription] notify fetch failed", e);
  });
}

// ---------------------------------------------------------------------------
// Phase 171 — Module-level window listeners.
//
// Previously every `useSubscription` mount registered its own visibility +
// focus + pageshow + custom-event + auth-change listeners. With the
// sidebar + page content both calling the hook, that's 10 listeners,
// 10 callbacks per event, all collapsing to a single coalesced fetch
// via `inflightFetch`. Cheap on a fast machine but burns event-loop time
// on mobile / Safari.
//
// Now: install the 5 listeners once when the first mount happens, reuse
// for every subsequent mount, tear down when no mounts remain.
// ---------------------------------------------------------------------------
let listenerRefCount = 0;
let globalUnsubAuth: (() => void) | null = null;

function installGlobalListeners(): void {
  if (typeof window === "undefined") return;
  if (!supabaseConfigured()) {
    listenerRefCount++;
    return;
  }
  if (listenerRefCount > 0) {
    listenerRefCount++;
    return;
  }
  listenerRefCount = 1;
  // Phase 192g — All global refetch triggers (focus/visibility/pageshow/
  // cross-tab) are user-intent or state-change signals that should win
  // over the 30s TTL. Pass `true` so they always hit the wire.
  function refetch(): void {
    void fetchAndCache(true);
  }
  function onVisibility(): void {
    if (document.visibilityState === "visible") refetch();
  }
  // Phase 191 — Cross-tab sync. When tab A redeems a code or pays for
  // an upgrade, `setSubscriptionCache` writes a fresh timestamp into
  // localStorage under SUBSCRIPTION_CROSS_TAB_KEY; this listener picks
  // up the `storage` event in every OTHER tab and refetches. Without
  // this, tab B kept showing the old free-tier quota until refocus.
  function onStorage(e: StorageEvent): void {
    if (e.key === SUBSCRIPTION_CROSS_TAB_KEY) refetch();
  }
  window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, refetch);
  // Phase 192p — On mobile, app-switching/tab-switching triggers
  // visibilitychange + focus repeatedly with spotty networks. Skip these
  // listeners on mobile; pageshow (BFCache restore) is rare and still
  // important so it stays wired up for both desktop and mobile.
  const mobile = isMobileViewport();
  if (!mobile) {
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refetch);
  }
  window.addEventListener("pageshow", refetch);
  window.addEventListener("storage", onStorage);
  const authUnsub = onAuthChange((user) => {
    // Phase 182d — When the user signs out (or the session expires),
    // wipe the cached row so a brief flash of the previous user's
    // tier/quota can't leak into the next sign-in. Without this clear,
    // the module-level cache holds the previous user's row until a
    // fresh token + /api/quota response replaces it — visible as a
    // ~100 ms flicker of PRO quotas on the /login screen after a sign-
    // out from a PRO session.
    if (!user) {
      // Phase 192g — Sign-out wipes the cache AND resets the TTL so the
      // next mounted consumer immediately fetches the new user's row
      // (rather than waiting up to 30s).
      setSubscriptionCache(null);
      lastFetchAt = 0;
      return;
    }
    // Phase 192o — User-identity change (login as a different account,
    // session refreshed onto a different user) must NOT show the
    // previous user's quota while the new fetch is in flight. Clearing
    // the row to null forces every mounted `useSubscription` to flip to
    // loading state for the brief window between auth event + /api/quota
    // response. Previously we just kicked off `fetchAndCache(true)` and
    // left the stale row visible — a PRO-tier user's quota could flash
    // on a free-tier user's screen for ~200ms after a fast account swap.
    const cachedRow = getCachedRow();
    if (cachedRow && cachedRow.user_id !== user.id) {
      setSubscriptionCache(null);
    }
    lastFetchAt = 0;
    // Phase 192g — Auth change = user-identity change; force refresh.
    void fetchAndCache(true);
  });
  globalUnsubAuth = () => {
    window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, refetch);
    if (!mobile) {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refetch);
    }
    window.removeEventListener("pageshow", refetch);
    window.removeEventListener("storage", onStorage);
    authUnsub();
  };
}

function releaseGlobalListeners(): void {
  if (typeof window === "undefined") return;
  listenerRefCount = Math.max(0, listenerRefCount - 1);
  if (listenerRefCount === 0 && globalUnsubAuth) {
    globalUnsubAuth();
    globalUnsubAuth = null;
  }
}

export function useSubscription(): UseSubscriptionState {
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(
    getCachedRow()
  );
  const [isGuest, setIsGuest] = useState(getCachedIsGuest());
  const [loading, setLoading] = useState(getCachedRow() === null);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    // Phase 192g — Explicit refresh() call from a consumer (e.g. "Refresh"
    // button) bypasses the 30s TTL.
    // Phase 192o — Always clear `loading` when the fetch settles. If the
    // network response writes a fresh row, the cache subscriber clears
    // loading via onChange. If the response is identical (no row change,
    // no emit), the cache subscriber never fires — so a manual `loading
    // → false` flip in `finally` is the only thing preventing a stuck
    // spinner on the "Refresh" button. Same pattern in the mount effect
    // below.
    fetchAndCache(true)
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err : new Error("subscription-load-failed")
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    function onChange(row: SubscriptionRow | null, guest: boolean): void {
      setSubscription(row);
      setIsGuest(guest);
      setLoading(false);
      setError(null);
    }
    const unsub = subscribeToSubscriptionCache(onChange);
    // Phase 158.36c → 192g — Kick off a refetch on mount, BUT respect the
    // 30s TTL inside fetchAndCache. Route changes that re-mount this hook
    // 200-500ms after the last successful fetch will now early-return
    // without touching the network. Auth-change / focus / explicit
    // refresh() / notifySubscriptionChanged still force a refresh.
    // Phase 192o — When the TTL early-returns or `!token` early-returns,
    // the cache never emits and onChange never runs, so initial loading
    // state stays `true` indefinitely. Always clear loading when the
    // mount-time fetch settles regardless of whether the cache changed.
    fetchAndCache()
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err : new Error("subscription-load-failed")
        );
      })
      .finally(() => {
        setLoading(false);
      });
    return unsub;
  }, []);

  // Phase 171 — install global listeners ONCE for all mounts, not per
  // instance. The listeners only ever call the coalesced fetchAndCache,
  // which already dedupes — so duplicate listeners just burn event-loop
  // ticks. Ref-counted teardown means the last unmount cleans up.
  useEffect(() => {
    installGlobalListeners();
    return releaseGlobalListeners;
  }, []);

  return { subscription, loading, error, refresh, isGuest };
}
