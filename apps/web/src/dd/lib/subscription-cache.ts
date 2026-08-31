/**
 * Phase 158.35 — Module-level subscription cache.
 *
 * Holds the one true `SubscriptionRow` for the current tab, plus a set of
 * listeners that re-render whenever the row changes. Lives in its own
 * module (instead of `use-subscription.ts`) so `quota.ts` can write to
 * the cache without a circular import on the React hook.
 *
 * Write paths:
 *   - `consumeQuotaApi` / `refundQuotaApi` push the new row right after
 *     the HTTP response lands (no refetch needed)
 *   - `incrementGuestUsage` / `refundGuestUsage` push the synthesized
 *     guest row after touching `localStorage`
 *   - The Stripe success page + admin tier overrides push their result
 *
 * Read paths:
 *   - `useSubscription` reads + subscribes — every mounted instance
 *     re-renders within one React tick when the cache updates
 */

import type { SubscriptionRow } from "@/lib/supabase/types";

type Listener = (row: SubscriptionRow | null, isGuest: boolean) => void;

let cachedRow: SubscriptionRow | null = null;
let cachedIsGuest = false;
const listeners = new Set<Listener>();

/**
 * Phase 191 — Cross-tab sync key. Each `setSubscriptionCache` write
 * stamps a fresh timestamp into localStorage. Other tabs listen for
 * `storage` events on this key and refetch their subscription. Without
 * this, redeeming a code or paying for an upgrade in tab A left tab B
 * staring at the old free-tier quota until the user refocused it.
 */
export const SUBSCRIPTION_CROSS_TAB_KEY = "doodee:subscription-bump";

function emit(): void {
  for (const fn of listeners) {
    try {
      fn(cachedRow, cachedIsGuest);
    } catch {
      /* one subscriber's error shouldn't break the others */
    }
  }
}

export function getCachedRow(): SubscriptionRow | null {
  return cachedRow;
}

export function getCachedIsGuest(): boolean {
  return cachedIsGuest;
}

export function subscribeToSubscriptionCache(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Write a known-good subscription row into the global cache. Every
 * mounted `useSubscription` re-renders with this value within one React
 * tick. Safe to call from anywhere — server-side imports of this module
 * are inert because the listener set is empty there.
 */
export function setSubscriptionCache(row: SubscriptionRow | null): void {
  cachedRow = row;
  cachedIsGuest = row?.user_id === "guest";
  emit();
  // Phase 191 — broadcast to other tabs so a redeem / Stripe upgrade /
  // quota-burn in tab A doesn't leave tab B showing stale tier or
  // quota. Best-effort: localStorage may throw (private-mode Safari,
  // quota full) — we swallow because the local emit() already worked.
  if (typeof window !== "undefined") {
    try {
      // Phase 192o — two-back-to-back consume calls within the same ms
      // would write identical timestamps and `storage` then fires zero
      // events (the spec only emits on VALUE CHANGE). A monotonic
      // counter behind a Math.random tail guarantees a fresh value
      // every call, so the cross-tab refetch is never silently dropped.
      window.localStorage.setItem(
        SUBSCRIPTION_CROSS_TAB_KEY,
        `${Date.now()}:${Math.random().toString(36).slice(2)}`,
      );
    } catch {
      /* cross-tab is best-effort */
    }
  }
}
