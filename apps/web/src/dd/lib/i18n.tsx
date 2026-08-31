"use client";

/**
 * Phase 177 — i18n with lazy-loaded dicts.
 *
 * Each language dictionary (`th.ts` 1.6k LOC, `en.ts` 1.7k LOC) used to
 * be statically imported at the top of this module. Webpack bundled
 * both into the shared chunk, so every page paid for the language the
 * user is NOT seeing. ~80 KB of waste on the critical path.
 *
 * The new shape:
 *
 *   1. Server detects the user's lang via `Accept-Language` (Phase 176)
 *      and dynamically imports ONLY that dict (`loadDict(lang)`).
 *   2. Server passes the dict to `<LangProvider>` as a prop. Next.js
 *      embeds it in the RSC payload, so the client receives it with the
 *      initial HTML — no extra network round-trip on first paint.
 *   3. Client toggle (`setLang(next)`) calls the same `loadDict(next)`,
 *      which Webpack code-splits into its own chunk. The "other" lang
 *      only ever loads when a user actually switches.
 *
 * The provider keeps a cache so once a lang's dict has been fetched
 * (e.g. user toggled EN once), re-toggling doesn't re-fetch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Translations } from "@/locales/types";

export type Lang = "th" | "en";

const STORAGE_KEY = "doodee:lang";
const DEFAULT_LANG: Lang = "th";

/**
 * Phase 177 — Dynamic dictionary loader. Each `import()` call becomes
 * its own chunk so only the requested lang is downloaded.
 */
export async function loadDict(lang: Lang): Promise<Translations> {
  if (lang === "th") {
    const mod = await import("@/locales/th");
    return mod.th;
  }
  const mod = await import("@/locales/en");
  return mod.en;
}

/**
 * Phase 87 — Auto-detect browser language on first visit (kept for
 * tests; the live client now defers to the server-detected `initialLang`
 * prop set in Phase 176, so this only fires when no prop is supplied).
 */
export function detectBrowserLang(): Lang | null {
  if (typeof navigator === "undefined") return null;
  const langs: readonly string[] =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language ?? ""];
  for (const raw of langs) {
    if (typeof raw !== "string") continue;
    const tag = raw.toLowerCase();
    if (tag.startsWith("th")) return "th";
  }
  return "en";
}

interface LangContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: Translations;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({
  children,
  initialLang,
  initialDict,
}: {
  children: ReactNode;
  initialLang: Lang;
  initialDict: Translations;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [dict, setDict] = useState<Translations>(initialDict);
  // Module-level cache survives across mounts; ref-level cache survives
  // across renders within the same mount. Use a ref so React Strict
  // Mode's double-invoke doesn't double-fetch the EN dict in dev.
  const dictCache = useRef<Partial<Record<Lang, Translations>>>({
    [initialLang]: initialDict,
  });

  // On hydration check if the user previously toggled to a non-default
  // lang. If so, dynamic-load it and swap. The Phase 176 server-side
  // detection makes this rare in practice — most users will already be
  // on their preferred language by SSR.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if ((saved === "th" || saved === "en") && saved !== lang) {
      void switchLang(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const switchLang = useCallback(async (next: Lang) => {
    const cached = dictCache.current[next];
    if (cached) {
      setLangState(next);
      setDict(cached);
      return;
    }
    try {
      const fresh = await loadDict(next);
      dictCache.current[next] = fresh;
      setLangState(next);
      setDict(fresh);
    } catch (e) {
      console.error("[i18n] Failed to load dict for", next, e);
    }
  }, []);

  const setLang = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, next);
        }
      } catch {
        /* storage disabled — toggle still works in-memory */
      }
      void switchLang(next);
    },
    [lang, switchLang]
  );

  // Phase 192g — Memoize the context value so `useT()` consumers don't
  // re-render on every parent tick. The previous shape built a fresh
  // `{ lang, setLang, t: dict }` object on each render, breaking the
  // reference equality React uses to skip context propagation. With the
  // LangProvider sitting near the root, an unrelated parent re-render
  // (e.g. router transition, theme toggle) cascaded a re-render through
  // every component that calls `useT`. `setLang` and `switchLang` are
  // already `useCallback`-wrapped above, so this memo is stable across
  // renders until `lang` or `dict` actually changes.
  const value = useMemo<LangContextValue>(
    () => ({ lang, setLang, t: dict }),
    [lang, setLang, dict]
  );

  return (
    <LangContext.Provider value={value}>{children}</LangContext.Provider>
  );
}

export function useT(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error("useT must be used inside <LangProvider>");
  }
  return ctx;
}
