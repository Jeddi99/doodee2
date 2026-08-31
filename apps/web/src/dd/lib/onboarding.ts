const KEY = "doodee:onboarded:v1";

// Phase 192o — Cache the boolean. hasOnboarded() is called on every
// OnboardingWizard mount, which fires on every full page load while
// the user navigates the app. Cache compares the raw localStorage
// value so the test suite's `localStorage.clear()` between specs still
// re-reads the underlying truth — but in production, after the first
// read every subsequent call is an O(1) string compare.
let cachedRaw: string | null = null;
let cachedValue = false;

function invalidateCache(): void {
  cachedRaw = null;
  cachedValue = false;
}

export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) {
      if (cachedRaw !== null) invalidateCache();
      return false;
    }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    cachedValue = raw === "true";
    return cachedValue;
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "true");
    invalidateCache();
  } catch {
    // ignore
  }
}

export function resetOnboarded(): void {
  if (typeof window === "undefined") {
    invalidateCache();
    return;
  }
  try {
    window.localStorage.removeItem(KEY);
    invalidateCache();
  } catch {
    // ignore
  }
}
