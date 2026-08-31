/**
 * Stands in for `@supabase/supabase-js` in the ported UI, aliased in
 * `vite.config.js`.
 *
 * The Supabase SDK is not a dependency of this app — authentication runs on
 * Firebase (see `lib/supabase/auth-client.ts`, which keeps the original module
 * path but is Firebase-backed underneath). What survived the port is a handful
 * of `import type { User } from "@supabase/supabase-js"` lines in modules that
 * only ever read `id`, `email` and `user_metadata`. Declaring those shapes here
 * lets those files stay untouched and keeps the SDK out of the bundle.
 *
 * These are structural stand-ins, not the SDK's real types: they describe the
 * fields the ported code actually reads, so a call site that starts using more
 * of the Supabase surface will fail to typecheck rather than fail at runtime.
 */

/** The subset of Supabase's `User` the ported tree reads. */
export interface User {
  id: string;
  email?: string | null;
  aud?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
}

/** The subset of Supabase's `Session` the ported tree reads. */
export interface Session {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user: User;
}

/**
 * Only ever appeared in `import type` position in the ported code. Typed as
 * `never`-ish rather than `any` so any attempt to actually construct or call
 * one is a compile error — there is no Supabase client here to return.
 */
export type SupabaseClient = never;
