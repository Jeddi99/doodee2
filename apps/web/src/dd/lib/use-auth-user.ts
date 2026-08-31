"use client";

/**
 * Phase 158.37 — Expose the currently signed-in Supabase user's profile
 * fields (email, display name, avatar URL) to the React tree.
 *
 * Used by UpgradeSidebar to replace the hardcoded "ผู้ใช้ DOODEE" + "D"
 * placeholder with the real Gmail identity once the user is signed in.
 *
 * Strategy:
 *   - Read the persisted Supabase session on mount (sync read from
 *     localStorage via `auth.getSession()` — no API round-trip).
 *   - Subscribe to auth state changes so the hook updates when the user
 *     signs in or out without a page reload.
 *
 * Google OAuth populates `user_metadata` with `avatar_url`, `full_name`,
 * `name`, and `picture`. Email-link users only have `email`. We fall
 * back gracefully when metadata fields are missing.
 */

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
// Was `@/lib/supabase/client` upstream. That module was the Supabase browser
// SDK bootstrap and has no counterpart here — auth runs on Firebase behind
// `auth-client`, which exposes the same two things this hook needed: a one-shot
// read of the current user and a change subscription.
import { getCurrentUser, supabaseConfigured } from "@/lib/supabase/auth-client";
import { onAuthChange } from "@/lib/supabase/auth-client";

export interface AuthUserState {
  /** Authenticated email, or null when signed out. */
  email: string | null;
  /** Human-readable display name (full_name | name | email prefix). */
  displayName: string | null;
  /** HTTPS URL of the avatar from the OAuth provider. */
  avatarUrl: string | null;
  /** True until the first auth state read resolves. */
  loading: boolean;
}

function derive(user: User | null): Omit<AuthUserState, "loading"> {
  if (!user) {
    return { email: null, displayName: null, avatarUrl: null };
  }
  const md = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? null;
  const displayName =
    pickString(md.full_name) ??
    pickString(md.name) ??
    pickString(md.user_name) ??
    (email ? email.split("@")[0] ?? null : null);
  const avatarUrl =
    pickString(md.avatar_url) ??
    pickString(md.picture) ??
    null;
  return { email, displayName, avatarUrl };
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export function useAuthUser(): AuthUserState {
  const [state, setState] = useState<AuthUserState>({
    email: null,
    displayName: null,
    avatarUrl: null,
    loading: true,
  });

  useEffect(() => {
    if (!supabaseConfigured()) {
      setState({
        email: null,
        displayName: null,
        avatarUrl: null,
        loading: false,
      });
      return;
    }

    let cancelled = false;

    // Initial read — served from `auth-client`'s module-level cache after the
    // first call, so repeat mounts do not wait on Firebase.
    void getCurrentUser().then((user) => {
      if (cancelled) return;
      setState({ ...derive(user), loading: false });
    });

    const unsub = onAuthChange((user) => {
      setState({ ...derive(user), loading: false });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return state;
}
