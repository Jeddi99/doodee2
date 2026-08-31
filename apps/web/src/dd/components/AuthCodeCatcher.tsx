"use client";

/**
 * Phase 192x → 192ae — OAuth / magic-link rescue.
 *
 * Supabase Auth falls back to the project's "Site URL" when the `redirectTo`
 * we pass doesn't EXACTLY match the dashboard's Redirect-URL allowlist. That
 * fallback drops the `/auth/callback` path and lands the credentials on the
 * site root — as `?code=...` (PKCE) OR, for magic links / the implicit grant,
 * as a `#access_token=...&refresh_token=...` HASH.
 *
 * Phase 192ae — ROOT-CAUSE FIX. The previous version forwarded to
 * `/auth/callback${search}${hash}` via `router.replace`. The Next.js App
 * Router DROPS the hash fragment on a client-side navigation, so the
 * forwarded callback saw no tokens and bounced every magic-link / fallback
 * login to `/login?error` — login failed on PC and mobile alike.
 *
 * Fix: process the tokens IN PLACE, wherever they landed. `completeAuthRedirect
 * SignIn()` reads BOTH the `?code=` (exchangeCodeForSession) and the
 * `#access_token` hash (setSession) off `window.location`, so we never depend
 * on a fragile hash-preserving navigation. After the session is set we do a
 * clean route change to the intended page.
 *
 * The dashboard config is still the proper upstream fix (Site URL =
 * https://doodee.app, Redirect URLs += https://doodee.app/auth/callback +
 * https://doodee.app/**); this component is the belt-and-suspenders that makes
 * login resilient even when that allowlist is imperfect.
 *
 * `?code=` / the auth hash are used exclusively by Supabase auth here (redeem
 * codes go through a form, never the URL), so catching them anywhere is safe.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { completeAuthRedirectSignIn } from "@/lib/supabase/auth-client";

const NEXT_KEY = "doodee.login.next";

function readNextPath(): string {
  if (typeof window === "undefined") return "/scan";
  try {
    const raw = window.sessionStorage.getItem(NEXT_KEY);
    window.sessionStorage.removeItem(NEXT_KEY);
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/scan";
    return raw;
  } catch {
    return "/scan";
  }
}

export function AuthCodeCatcher(): null {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // The dedicated /auth/callback page owns its own processing.
    if (pathname === "/auth/callback") return;

    const search = window.location.search;
    const hash = window.location.hash;
    const hasCode = Boolean(new URLSearchParams(search).get("code"));
    const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const hasHashSession = Boolean(
      hashParams.get("access_token") && hashParams.get("refresh_token")
    );
    if (!hasCode && !hasHashSession) return;

    let cancelled = false;
    // Phase 192ae — process where the tokens are; do NOT forward a hash the
    // router would silently drop.
    completeAuthRedirectSignIn()
      .then((session) => {
        if (cancelled) return;
        router.replace(
          (session ? readNextPath() : "/login?error=auth-callback-failed") as never
        );
      })
      .catch(() => {
        if (cancelled) return;
        router.replace("/login?error=auth-callback-failed" as never);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
