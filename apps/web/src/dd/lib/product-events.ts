"use client";

import { getAccessToken } from "@/lib/supabase/auth-client";
import type { ProductEventName } from "@/lib/supabase/types";
import type {
  AgeRange,
  AestheticReference,
  ProfileGoal,
} from "@/lib/user-prefs";

export type ProductEventMetadata = Partial<{
  reason: "auto" | "manual" | "after_attempt" | "permission_denied";
  ageRange: AgeRange;
  gender: "male" | "female";
  goal: ProfileGoal;
  aestheticReference: AestheticReference;
  source: "scan" | "onboarding" | "history" | "offer";
  page:
    | "home"
    | "login"
    | "scan"
    | "history"
    | "upgrade"
    | "pricing"
    | "surgery"
    | "settings"
    | "account"
    | "blog"
    | "faq"
    | "methodology"
    | "other";
  offer: "new_user_plus_29";
  dayLabel: "day_1" | "day_7" | "day_30" | "other";
  scoreBucket: "0_4" | "4_6" | "6_8" | "8_10";
}>;

const VISITOR_ID_KEY = "doodee.analytics.visitor.v1";
const SESSION_ID_KEY = "doodee.analytics.session.v1";
const ANONYMOUS_EVENTS = new Set<ProductEventName>(["site_visit", "page_view"]);

export function scoreBucket(score: number): ProductEventMetadata["scoreBucket"] {
  if (score < 4) return "0_4";
  if (score < 6) return "4_6";
  if (score < 8) return "6_8";
  return "8_10";
}

export function analyticsPageFromPath(pathname: string): NonNullable<ProductEventMetadata["page"]> {
  if (pathname === "/") return "home";
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  if (
    segment === "login" ||
    segment === "scan" ||
    segment === "history" ||
    segment === "upgrade" ||
    segment === "pricing" ||
    segment === "surgery" ||
    segment === "settings" ||
    segment === "account" ||
    segment === "blog" ||
    segment === "faq" ||
    segment === "methodology"
  ) {
    return segment;
  }
  return "other";
}

function createId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function readOrCreate(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing && /^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing;
  const next = createId();
  storage.setItem(key, next);
  return next;
}

function analyticsIdentity(): { anonymousId: string; sessionId: string } | null {
  if (typeof window === "undefined") return null;
  try {
    return {
      anonymousId: readOrCreate(window.localStorage, VISITOR_ID_KEY),
      sessionId: readOrCreate(window.sessionStorage, SESSION_ID_KEY),
    };
  } catch {
    return null;
  }
}

export async function trackProductEvent(
  event: ProductEventName,
  metadata: ProductEventMetadata = {}
): Promise<void> {
  if (typeof window === "undefined") return;
  const identity = analyticsIdentity();
  if (!identity) return;
  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch {
    token = null;
  }
  if (!token && !ANONYMOUS_EVENTS.has(event)) return;
  try {
    await fetch("/api/product-events", {
      method: "POST",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        event,
        metadata,
        anonymousId: identity.anonymousId,
        sessionId: identity.sessionId,
      }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {}
}
