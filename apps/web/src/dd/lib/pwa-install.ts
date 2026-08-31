/**
 * Phase 68 — Progressive Web App install prompt management.
 *
 * Browsers fire a `beforeinstallprompt` event when the app meets PWA
 * install criteria (manifest + reachable icon + secure context, in
 * Chromium-based browsers; Safari & Firefox don't fire this and rely
 * on user-initiated install via the address bar). This module:
 *
 * 1. Captures the deferred prompt so we can call `.prompt()` later
 *    when the user clicks our custom Install button.
 * 2. Tracks a "dismissed" flag in localStorage with a 7-day cooldown
 *    so the floating banner doesn't badger users who already said no.
 * 3. Detects whether the app is already installed (display-mode:
 *    standalone) so the prompt stays hidden in that case.
 *
 * No exported component — purely state + side effects. The
 * `InstallPrompt` component subscribes via `subscribeInstallable`.
 */

const DISMISS_KEY = "doodee:pwa:dismissed";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(installable: boolean) => void>();

function notify(installable: boolean) {
  for (const fn of listeners) {
    try {
      fn(installable);
    } catch {
      // Listener crashed — never let one bad subscriber break the others.
    }
  }
}

/**
 * Subscribe to install-availability changes. Returns an unsubscribe.
 * Call from a `useEffect` cleanup.
 *
 * Immediately invokes the listener with the current state.
 */
export function subscribeInstallable(
  fn: (installable: boolean) => void
): () => void {
  listeners.add(fn);
  fn(canPrompt());
  return () => {
    listeners.delete(fn);
  };
}

function canPrompt(): boolean {
  if (!deferred) return false;
  if (isInstalled()) return false;
  if (isDismissed()) return false;
  return true;
}

/** True if the page is being rendered as an installed PWA (standalone). */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Chromium / Firefox / Edge
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    // iOS Safari sets navigator.standalone on Home-Screen launches
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
  } catch {
    // ignore
  }
  return false;
}

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Mark the prompt as dismissed for the cooldown window. Called when
 * the user clicks the X on the floating banner.
 */
export function dismissInstall(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, Date.now().toString());
  } catch {
    // ignore
  }
  notify(false);
}

/**
 * Trigger the deferred native install prompt. Returns the outcome.
 *
 * Returns `"unavailable"` if there's no deferred event (e.g., browser
 * doesn't support it, criteria not met, or already prompted).
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  try {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event can only be used once — drop the reference either way.
    deferred = null;
    notify(false);
    return outcome;
  } catch {
    deferred = null;
    notify(false);
    return "unavailable";
  }
}

/**
 * Wire up the global `beforeinstallprompt` and `appinstalled` listeners.
 * Idempotent: safe to call from multiple components.
 *
 * Returns true if listeners are now active. Should be called once on
 * client mount — `<InstallPrompt />` does this on first render.
 */
let wired = false;
export function ensureWired(): boolean {
  if (typeof window === "undefined") return false;
  if (wired) return true;
  wired = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify(canPrompt());
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify(false);
  });

  return true;
}
