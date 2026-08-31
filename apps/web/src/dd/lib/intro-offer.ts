"use client";

export const INTRO_OFFER_DELAY_MS = 15_000;
export const INTRO_OFFER_DURATION_MS = 30 * 60 * 1000;
const KEY = "doodee:intro-offer:v1";

export interface IntroOfferState {
  shownAt: number;
  expiresAt: number;
  dismissed: boolean;
  clicked: boolean;
}

function fallback(now: number): IntroOfferState {
  return {
    shownAt: now,
    expiresAt: now + INTRO_OFFER_DURATION_MS,
    dismissed: false,
    clicked: false,
  };
}

function isState(value: unknown): value is IntroOfferState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<IntroOfferState>;
  return (
    typeof record.shownAt === "number" &&
    typeof record.expiresAt === "number" &&
    typeof record.dismissed === "boolean" &&
    typeof record.clicked === "boolean"
  );
}

export function readIntroOfferState(now = Date.now()): IntroOfferState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isState(parsed)) return null;
    if (parsed.expiresAt <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function ensureIntroOfferState(now = Date.now()): IntroOfferState {
  const current = readIntroOfferState(now);
  if (current) return current;
  const next = fallback(now);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }
  return next;
}

function updateIntroOfferState(
  patch: Partial<Pick<IntroOfferState, "dismissed" | "clicked">>
): IntroOfferState | null {
  if (typeof window === "undefined") return null;
  const current = readIntroOfferState();
  if (!current) return null;
  const next = { ...current, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function dismissIntroOffer(): IntroOfferState | null {
  return updateIntroOfferState({ dismissed: true });
}

export function markIntroOfferClicked(): IntroOfferState | null {
  return updateIntroOfferState({ clicked: true });
}
