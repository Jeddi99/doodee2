import type { User } from "@supabase/supabase-js";
import type {
  ProfileRow,
  QuotaKind,
  SubscriptionRow,
} from "@/lib/supabase/types";

export const LOCAL_DEV_AUTH_KEY = "doodee.local_dev_auth.v1";
export const LOCAL_DEV_TOKEN = "doodee-local-dev-token";
export const LOCAL_DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_DEV_EMAIL = "local-dev@doodee.test";
const LOCAL_DEV_SCAN_QUOTA = 10;
const LOCAL_DEV_PREVIEW_QUOTA = 5;

declare global {
  var __doodeeLocalDevUsage: Record<QuotaKind, number> | undefined;
}

function localDevUsage(): Record<QuotaKind, number> {
  globalThis.__doodeeLocalDevUsage ??= {
    scans: 0,
    previews: 0,
  };
  return globalThis.__doodeeLocalDevUsage;
}

export function localDevAuthEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function localDevBrowserAvailable(): boolean {
  return (
    localDevAuthEnabled() &&
    typeof window !== "undefined" &&
    isLocalhostOrigin(window.location.origin)
  );
}

export function isLocalDevToken(token: string): boolean {
  return localDevAuthEnabled() && token === LOCAL_DEV_TOKEN;
}

export function isLocalDevUserId(userId: string): boolean {
  return localDevAuthEnabled() && userId === LOCAL_DEV_USER_ID;
}

export function readLocalDevSignedIn(): boolean {
  if (!localDevBrowserAvailable()) return false;
  try {
    return window.localStorage.getItem(LOCAL_DEV_AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLocalDevSignedIn(): void {
  if (!localDevBrowserAvailable()) return;
  window.localStorage.setItem(LOCAL_DEV_AUTH_KEY, "1");
}

export function clearLocalDevSignedIn(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCAL_DEV_AUTH_KEY);
  } catch {}
}

export function localDevUser(): User {
  return {
    id: LOCAL_DEV_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: LOCAL_DEV_EMAIL,
    app_metadata: { provider: "local-dev", providers: ["local-dev"] },
    user_metadata: { name: "Local Dev", full_name: "Local Dev" },
    created_at: "2026-07-06T00:00:00.000Z",
    updated_at: "2026-07-06T00:00:00.000Z",
    confirmed_at: "2026-07-06T00:00:00.000Z",
    email_confirmed_at: "2026-07-06T00:00:00.000Z",
    is_anonymous: false,
  } as unknown as User;
}

export function localDevProfileRow(): ProfileRow {
  return {
    user_id: LOCAL_DEV_USER_ID,
    email: LOCAL_DEV_EMAIL,
    display_name: "Local Dev",
    is_dev: true,
    banned_at: null,
    banned_reason: null,
    created_at: "2026-07-06T00:00:00.000Z",
    updated_at: "2026-07-06T00:00:00.000Z",
  };
}

export function localDevSubscriptionRow(): SubscriptionRow {
  const usage = localDevUsage();
  return {
    user_id: LOCAL_DEV_USER_ID,
    tier: "plus",
    status: "active",
    current_period_start: "2026-07-06T00:00:00.000Z",
    current_period_end: "2026-08-05T00:00:00.000Z",
    cancel_at_period_end: false,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    scans_quota: LOCAL_DEV_SCAN_QUOTA,
    scans_used: usage.scans,
    previews_quota: LOCAL_DEV_PREVIEW_QUOTA,
    previews_used: usage.previews,
    credit_override_scans: 0,
    credit_override_previews: 0,
    updated_at: "2026-07-06T00:00:00.000Z",
  };
}

export function consumeLocalDevQuota(kind: QuotaKind): SubscriptionRow | null {
  const row = localDevSubscriptionRow();
  const quota = kind === "scans" ? row.scans_quota : row.previews_quota;
  const used = kind === "scans" ? row.scans_used : row.previews_used;
  if (used >= quota) return null;
  localDevUsage()[kind] += 1;
  return localDevSubscriptionRow();
}

export function resetLocalDevQuotaUsage(): SubscriptionRow {
  const usage = localDevUsage();
  usage.scans = 0;
  usage.previews = 0;
  return localDevSubscriptionRow();
}
