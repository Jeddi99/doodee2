import { ddFetch } from "./api-bridge";
/**
 * Phase 152 → 158.17 — Client-side quota gateway.
 *
 * Every AI-cost call routes through `consumeQuotaApi` BEFORE the network
 * call and `refundQuotaApi` on a downstream failure that already burned
 * a slot. Signed-in users hit the server (`/api/quota/*`); guests fall
 * back to `localStorage` with the free-tier limits from `PLAN_CATALOG`.
 *
 * Quota policy (see `plans.ts` for full notes):
 *   - `scans`    → text AI: scan analysis + procedure-recommend text
 *   - `previews` → image AI: surgery preview + combo preview (1 gen = 1)
 *   - makeup try-on (lip/eye/hair/blush) → no quota (in-browser)
 */

import type { SubscriptionTier } from "@/types";
import { PLAN_CATALOG, planFeatureAvailable } from "@/lib/plans";
import type { PlanFeatures } from "@/lib/plans";
import type {
  QuotaKind,
  SubscriptionRow,
  UsageOperation,
} from "@/lib/supabase/types";
// Phase 158.35 — push every consume/refund result straight into the
// shared subscription cache so the sidebar updates in the same React
// tick (no refetch round-trip, no race vs. the next focus event).
import { setSubscriptionCache } from "@/lib/subscription-cache";

export type { QuotaKind };

export type QuotaExhaustedCode = "OUT_OF_SCANS" | "OUT_OF_PREVIEWS";

const KIND_TO_CODE: Record<QuotaKind, QuotaExhaustedCode> = {
  scans: "OUT_OF_SCANS",
  previews: "OUT_OF_PREVIEWS",
};

export class QuotaExhaustedError extends Error {
  readonly code: QuotaExhaustedCode;
  readonly kind: QuotaKind;
  readonly tier: SubscriptionTier;
  readonly upgradeUrl: string;

  constructor(input: {
    kind: QuotaKind;
    tier: SubscriptionTier;
    upgradeUrl?: string;
    message?: string;
  }) {
    super(input.message ?? `quota-exhausted:${input.kind}`);
    this.name = "QuotaExhaustedError";
    this.kind = input.kind;
    this.code = KIND_TO_CODE[input.kind];
    this.tier = input.tier;
    this.upgradeUrl = input.upgradeUrl ?? "/upgrade";
  }
}

export class FeatureLockedError extends Error {
  readonly feature: keyof PlanFeatures;
  readonly requiredTier: SubscriptionTier;
  readonly currentTier: SubscriptionTier;

  constructor(input: {
    feature: keyof PlanFeatures;
    requiredTier: SubscriptionTier;
    currentTier: SubscriptionTier;
    message?: string;
  }) {
    super(
      input.message ??
        `feature-locked:${input.feature} (need ${input.requiredTier}, on ${input.currentTier})`
    );
    this.name = "FeatureLockedError";
    this.feature = input.feature;
    this.requiredTier = input.requiredTier;
    this.currentTier = input.currentTier;
  }
}

function gatingFeature(kind: QuotaKind): keyof PlanFeatures | null {
  if (kind === "previews") return "surgeryPreview";
  return null;
}

function lowestTierWithFeature(
  feature: keyof PlanFeatures
): SubscriptionTier {
  const order: SubscriptionTier[] = ["plus", "pro"];
  for (const t of order) {
    if (PLAN_CATALOG[t].features[feature]) return t;
  }
  return "pro";
}

function quotaAmount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function baseQuota(row: SubscriptionRow, kind: QuotaKind): number {
  return kind === "scans" ? row.scans_quota : row.previews_quota;
}

function usedQuota(row: SubscriptionRow, kind: QuotaKind): number {
  return kind === "scans" ? row.scans_used : row.previews_used;
}

function overrideQuota(row: SubscriptionRow, kind: QuotaKind): number {
  return kind === "scans"
    ? row.credit_override_scans
    : row.credit_override_previews;
}

export function remainingQuota(
  row: SubscriptionRow,
  kind: QuotaKind
): number {
  const total =
    quotaAmount(baseQuota(row, kind)) + quotaAmount(overrideQuota(row, kind));
  return Math.max(0, total - quotaAmount(usedQuota(row, kind)));
}

export function hasQuotaAvailable(
  row: SubscriptionRow | null,
  kind: QuotaKind
): boolean {
  return row ? remainingQuota(row, kind) > 0 : true;
}

// ---------------- API client (signed-in users) ----------------

function authHeaders(idToken: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${idToken}`,
  };
}

interface ConsumeErrorBody {
  error?: string;
  code?: QuotaExhaustedCode;
  tier?: SubscriptionTier;
  upgradeUrl?: string;
  // Phase 158.36c — server now includes the authoritative row on 402
  // so the client can reconcile cache + display.
  subscription?: SubscriptionRow | null;
}

export async function fetchSubscription(
  idToken: string
): Promise<SubscriptionRow> {
  const res = await ddFetch("/api/quota", {
    method: "GET",
    headers: authHeaders(idToken),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`fetch-subscription-${res.status}`);
  }
  const row = (await res.json()) as SubscriptionRow;
  setSubscriptionCache(row);
  return row;
}

export async function consumeQuotaApi(
  kind: QuotaKind,
  idToken: string
): Promise<SubscriptionRow> {
  const res = await ddFetch("/api/quota/consume", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ kind }),
  });
  if (res.status === 402) {
    const body = (await res.json().catch(() => ({}))) as ConsumeErrorBody;
    // Phase 158.36c — push the authoritative DB row into the cache even
    // on 402 so the sidebar matches reality (`สแกนคงเหลือ 0`) instead of
    // sticking at the pre-scan value.
    if (body.subscription && typeof body.subscription.user_id === "string") {
      setSubscriptionCache(body.subscription);
    }
    throw new QuotaExhaustedError({
      kind,
      tier: body.tier ?? "free",
      ...(body.upgradeUrl ? { upgradeUrl: body.upgradeUrl } : {}),
    });
  }
  if (!res.ok) {
    throw new Error(`consume-quota-${res.status}`);
  }
  // Phase 158.35 — the response body IS the updated row. Push it to the
  // shared cache so every mounted `useSubscription` re-renders within one
  // React tick. No window event, no refetch, no race.
  const row = (await res.json()) as SubscriptionRow;
  setSubscriptionCache(row);
  return row;
}

export async function refundQuotaApi(
  kind: QuotaKind,
  idToken: string
): Promise<void> {
  try {
    const res = await ddFetch("/api/quota/refund", {
      method: "POST",
      headers: authHeaders(idToken),
      body: JSON.stringify({ kind }),
    });
    if (res.ok) {
      // Phase 158.35 — route now returns the updated row (or `{ ok: true }`
      // for older deployments). Push when it's a real subscription row.
      const body = (await res.json().catch(() => null)) as
        | SubscriptionRow
        | { ok?: boolean }
        | null;
      if (body && typeof (body as SubscriptionRow).user_id === "string") {
        setSubscriptionCache(body as SubscriptionRow);
      }
    }
  } catch (e) {
    // Phase 192v — A failed refund after a downstream AI error permanently
    // debits the user a quota slot (money-equiv loss). Stay best-effort
    // (server-side cron / next consume eventually reconciles) but LOG so a
    // systemic refund outage is visible instead of silently over-debiting.
    console.error("[refundQuota] failed — user may be over-debited", e);
  }
}

export interface TrackUsageInput {
  op: UsageOperation;
  costThb: number;
  metadata?: Record<string, unknown>;
}

export async function trackUsageApi(
  input: TrackUsageInput,
  idToken: string
): Promise<void> {
  try {
    await ddFetch("/api/usage/track", {
      method: "POST",
      headers: authHeaders(idToken),
      body: JSON.stringify(input),
    });
  } catch (e) {
    // Phase 192v — usage_log is analytics-flavor (non-fatal), but a bare
    // swallow meant analytics could be silently dead with zero signal. Log.
    console.warn("[trackUsage] failed", e);
  }
}

// ---------------- Guest fallback (localStorage) ----------------

const GUEST_QUOTA_KEY = "doodee_guest_quota_v1";

const GUEST_LIMITS: Record<QuotaKind, number> = {
  scans: PLAN_CATALOG.free.scansQuota,
  previews: PLAN_CATALOG.free.previewsQuota,
};

interface GuestStorageShape {
  scansUsed: number;
  previewsUsed: number;
}

const EMPTY_GUEST: GuestStorageShape = {
  scansUsed: 0,
  previewsUsed: 0,
};

function clampNonNeg(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function readGuestStorage(): GuestStorageShape {
  if (typeof window === "undefined") return { ...EMPTY_GUEST };
  try {
    const raw = window.localStorage.getItem(GUEST_QUOTA_KEY);
    if (!raw) return { ...EMPTY_GUEST };
    const obj = JSON.parse(raw) as Partial<GuestStorageShape>;
    return {
      scansUsed: clampNonNeg(obj.scansUsed),
      previewsUsed: clampNonNeg(obj.previewsUsed),
    };
  } catch {
    return { ...EMPTY_GUEST };
  }
}

function writeGuestStorage(state: GuestStorageShape): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_QUOTA_KEY, JSON.stringify(state));
  } catch {
    /* storage full / blocked — guest counter is best-effort */
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Synthesizes a free-tier `SubscriptionRow` from the guest counters in
 * localStorage. Lets the same UI render for guests + signed-in users
 * without branching on the auth state.
 */
export function getGuestQuotaLocal(): SubscriptionRow {
  const state = readGuestStorage();
  const free = PLAN_CATALOG.free;
  const now = nowIso();
  return {
    user_id: "guest",
    tier: "free",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    scans_quota: free.scansQuota,
    scans_used: Math.min(state.scansUsed, free.scansQuota),
    previews_quota: free.previewsQuota,
    previews_used: Math.min(state.previewsUsed, free.previewsQuota),
    credit_override_scans: 0,
    credit_override_previews: 0,
    updated_at: now,
  };
}

function usedFieldFor(kind: QuotaKind): keyof GuestStorageShape {
  if (kind === "scans") return "scansUsed";
  return "previewsUsed";
}

/**
 * Burns one slot of the guest's quota. Throws `FeatureLockedError` when
 * the kind isn't unlocked at the free tier, `QuotaExhaustedError` when
 * the user is already out.
 */
export function incrementGuestUsage(kind: QuotaKind): void {
  const feature = gatingFeature(kind);
  if (feature && !planFeatureAvailable("free", feature)) {
    throw new FeatureLockedError({
      feature,
      currentTier: "free",
      requiredTier: lowestTierWithFeature(feature),
    });
  }
  const state = readGuestStorage();
  const field = usedFieldFor(kind);
  const limit = GUEST_LIMITS[kind];
  const remaining = Math.max(0, limit - state[field]);
  if (remaining <= 0) {
    throw new QuotaExhaustedError({ kind, tier: "free" });
  }
  writeGuestStorage({ ...state, [field]: state[field] + 1 });
  // Phase 158.35 — propagate the new synthesized row to the shared cache.
  setSubscriptionCache(getGuestQuotaLocal());
}

export function refundGuestUsage(kind: QuotaKind): void {
  const state = readGuestStorage();
  const field = usedFieldFor(kind);
  const next = Math.max(0, state[field] - 1);
  writeGuestStorage({ ...state, [field]: next });
  setSubscriptionCache(getGuestQuotaLocal());
}

export function resetGuestQuota(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_QUOTA_KEY);
  } catch {
    /* no-op */
  }
}

// ---------------- Unified consume helper ----------------

export interface QuotaReservation {
  readonly kind: QuotaKind;
  readonly mode: "user" | "guest";
  readonly idToken: string | null;
}

export async function reserveQuotaSlot(
  kind: QuotaKind,
  idToken: string | null
): Promise<QuotaReservation> {
  if (idToken) {
    await consumeQuotaApi(kind, idToken);
    return { kind, mode: "user", idToken };
  }
  // Phase 158.20 → 158.36d — Auth is mandatory. If a quota burn is
  // attempted without a token, the user is between auth events (e.g.
  // session-refresh in progress). Surface a clear error instead of
  // silently writing a guest row to cache that masks the real DB state.
  throw new Error("auth-required");
}

export async function releaseQuotaSlot(
  reservation: QuotaReservation
): Promise<void> {
  if (reservation.mode === "user" && reservation.idToken) {
    await refundQuotaApi(reservation.kind, reservation.idToken);
    return;
  }
  refundGuestUsage(reservation.kind);
}
