/**
 * Phase 135 — one-time consent gate for procedure previews.
 *
 * Persists a single boolean in localStorage. Once the user accepts the
 * caveat (visualization only, not a medical recommendation), we don't
 * show it again. They can reset it from settings if they want to.
 */

const KEY = "doodee:procedure-consent";

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasAcceptedProcedureConsent(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  try {
    return ls.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptProcedureConsent(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY, "1");
  } catch {
    /* no-op */
  }
}

export function resetProcedureConsent(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(KEY);
  } catch {
    /* no-op */
  }
}
