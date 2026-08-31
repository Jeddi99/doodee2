/**
 * Root of the UI ported from the Next.js `doodee` app.
 *
 * Replaces that app's `src/app/layout.tsx`. Everything that file did through
 * framework machinery — server-side language detection, `next/font` variables,
 * a pre-paint theme script, `<html>` attributes — has to happen in a component
 * here, because a Vite SPA has no server render and no document control.
 *
 * The `.dd-ui` wrapper is load-bearing, not cosmetic: the scoped Tailwind reset
 * and the rewritten `body:has(.dd-ui)` theme rules both key off it. Nothing from
 * this tree should ever render outside it.
 */
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { LangProvider, type Lang } from "@/lib/i18n";
import { th } from "@/locales/th";
import { en } from "@/locales/en";
import { MobileMotionGuard } from "@/components/MobileMotionGuard";
import { AuthCodeCatcher } from "@/components/AuthCodeCatcher";
import { ProductFunnelTracker } from "@/components/ProductFunnelTracker";

// The pre-existing app stores the language under `doodee_language` (see
// src/useLocale.ts); the ported tree uses `doodee:lang`. Both hold "th" | "en",
// so the two are kept in step rather than letting a user's choice apply to only
// half the app during the migration.
const LEGACY_LANG_KEY = "doodee_language";
const DD_LANG_KEY = "doodee:lang";
const THEME_KEY = "doodee.theme.v2";

function readInitialLang(): Lang {
  try {
    const dd = window.localStorage.getItem(DD_LANG_KEY);
    if (dd === "th" || dd === "en") return dd;
    const legacy = window.localStorage.getItem(LEGACY_LANG_KEY);
    if (legacy === "th" || legacy === "en") return legacy;
  } catch {
    // Private browsing with storage disabled.
  }
  // Thailand-first product: an unset preference means Thai, matching both
  // useLocale.ts and the server-side default the Next app used.
  return "th";
}

/**
 * Upstream this ran as a blocking inline `<script>` in `<head>` so the first
 * paint already carried the saved theme. There is no document to inject into
 * here, so it runs as early as a module can — at import time, before React
 * mounts — which achieves the same thing for everything but the empty shell.
 */
function applyStoredTheme(): void {
  const root = document.documentElement;
  let theme = "dark";
  try {
    if (window.localStorage.getItem(THEME_KEY) === "light") theme = "light";
  } catch {
    // Storage disabled — the dark default stands.
  }
  root.classList.add(theme);
  root.setAttribute("data-theme", theme);
}

if (typeof document !== "undefined") applyStoredTheme();

export function DoodeeUI({ children }: { children: ReactNode }) {
  const initialLang = useMemo(readInitialLang, []);
  const initialDict = initialLang === "en" ? en : th;

  // Mirror the ported tree's language choice back onto the legacy key so a
  // toggle on a ported screen is still honoured by a pre-existing one.
  useEffect(() => {
    const sync = () => {
      try {
        const dd = window.localStorage.getItem(DD_LANG_KEY);
        if (dd === "th" || dd === "en") window.localStorage.setItem(LEGACY_LANG_KEY, dd);
      } catch {
        // Storage disabled.
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <MobileMotionGuard>
      <LangProvider initialLang={initialLang} initialDict={initialDict}>
        <div className="dd-ui">
          {/* Rescues an auth link that landed off /auth/callback. */}
          <AuthCodeCatcher />
          <ProductFunnelTracker />
          {children}
        </div>
      </LangProvider>
    </MobileMotionGuard>
  );
}

export default DoodeeUI;
