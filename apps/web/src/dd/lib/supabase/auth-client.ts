"use client";

/**
 * The seam between the ported UI and this app's authentication.
 *
 * Upstream (the Next.js `doodee` app) this module wrapped Supabase Auth. Here it
 * keeps the same path, the same exported names and the same signatures, but is
 * backed by the Firebase auth this app already runs and whose ID tokens the
 * Django backend already verifies. Keeping the module's shape means the ~20
 * ported call sites needed no edits, and it is the single file to look at to
 * understand how ported screens get a session.
 *
 * The `User` objects handed back are Supabase-shaped (`id`, `email`,
 * `user_metadata`) because that is what the ported components read. Firebase's
 * own `User` is mapped across in `toPortableUser` rather than leaking through.
 *
 * Deliberately NOT reproduced from upstream:
 *   - Google *ID-token* sign-in with a nonce. Firebase does the Google exchange
 *     itself via a popup, so `signInWithGoogleIdToken` ignores its arguments and
 *     runs the popup flow. `createGoogleNoncePair` still returns a real pair so
 *     callers that render a Google button keep working.
 *   - `scope: "global"` sign-out. Firebase has no client-side "revoke every
 *     session everywhere"; `signOut` revokes locally and wipes local state,
 *     which is what the rest of this app has always done.
 */

import type { Session, User } from "@supabase/supabase-js";
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  type User as FirebaseUser,
} from "firebase/auth";
import { emailSignIn, firebaseSignOut, getFirebaseAuth, googleSignIn } from "../../../lib/firebase.js";
import { setSubscriptionCache } from "../subscription-cache";
import {
  clearLocalDevSignedIn,
  LOCAL_DEV_TOKEN,
  localDevBrowserAvailable,
  localDevUser,
  readLocalDevSignedIn,
  writeLocalDevSignedIn,
} from "@/lib/local-dev-auth";

const EMAIL_PENDING_KEY = "doodee_email_pending";

/**
 * Upstream this reported whether Supabase credentials were present. The name is
 * kept because `AuthGate` and three other screens branch on it to show a
 * "sign-in unavailable" state instead of a broken button; what it now reports is
 * whether Firebase is configured.
 */
export function supabaseConfigured(): boolean {
  try {
    getFirebaseAuth();
    return true;
  } catch {
    return false;
  }
}

/**
 * Firebase `User` → the Supabase-shaped object the ported components read.
 * `user_metadata.name`/`full_name` and `avatar_url` are the keys those
 * components look under, so the display name and photo are mapped onto both
 * spellings rather than making the call sites aware of the difference.
 */
function toPortableUser(user: FirebaseUser | null): User | null {
  if (!user) return null;
  const name = user.displayName ?? undefined;
  return {
    id: user.uid,
    email: user.email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {
      provider: user.providerData[0]?.providerId ?? "firebase",
      providers: user.providerData.map((p) => p.providerId),
    },
    user_metadata: {
      name,
      full_name: name,
      avatar_url: user.photoURL ?? undefined,
      email_verified: user.emailVerified,
    },
    created_at: user.metadata.creationTime
      ? new Date(user.metadata.creationTime).toISOString()
      : undefined,
    email_confirmed_at: user.emailVerified ? user.metadata.creationTime : null,
    is_anonymous: user.isAnonymous,
  };
}

/**
 * Firebase has no `Session` object; the ported code only ever reads
 * `access_token` and `user` off one, so a session is synthesised from the ID
 * token at the moment of sign-in.
 */
async function toSession(user: FirebaseUser): Promise<Session> {
  const access_token = await user.getIdToken();
  return { access_token, token_type: "bearer", user: toPortableUser(user)! };
}

// Mirrors upstream's module-level cache. `AuthGate` remounts on every route
// change inside the app shell and reads the user on each mount; without this,
// every navigation would await Firebase again. `undefined` means "not yet
// checked" and is distinct from a confirmed-signed-out `null`.
let cachedUser: User | null | undefined = undefined;
let inflightUser: Promise<User | null> | null = null;

export function getCachedUserSync(): User | null | undefined {
  if (readLocalDevSignedIn()) {
    cachedUser = localDevUser();
    return cachedUser;
  }
  return cachedUser;
}

export function invalidateAuthUserCache(): void {
  cachedUser = undefined;
  inflightUser = null;
}

export type AuthClientIssue =
  | "email-missing"
  | "google-client-missing"
  | "google-origin-not-allowed"
  | "google-provider-misconfigured"
  | "google-token-missing"
  | "network"
  | "session-missing"
  | "unknown";

export class AuthClientError extends Error {
  readonly code: AuthClientIssue;

  constructor(code: AuthClientIssue, message: string) {
    super(message);
    this.name = "AuthClientError";
    this.code = code;
  }
}

export type GoogleNoncePair = { nonce: string; hashedNonce: string };

export function authClientIssue(error: unknown): AuthClientIssue | null {
  return error instanceof AuthClientError ? error.code : null;
}

/**
 * Maps Firebase's `auth/*` error codes onto the issue vocabulary the ported
 * login screen already renders messages for. Anything unrecognised becomes
 * "unknown", which those screens show as a generic failure.
 */
function toAuthClientError(error: unknown): AuthClientError {
  const code = (error as { code?: string })?.code ?? "";
  const message = error instanceof Error ? error.message : String(error);
  if (code === "auth/network-request-failed") return new AuthClientError("network", message);
  if (code === "auth/invalid-email" || code === "auth/missing-email") {
    return new AuthClientError("email-missing", message);
  }
  if (code === "auth/unauthorized-domain") {
    return new AuthClientError("google-origin-not-allowed", message);
  }
  if (code === "auth/operation-not-allowed") {
    return new AuthClientError("google-provider-misconfigured", message);
  }
  if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
    return new AuthClientError("google-token-missing", message);
  }
  return new AuthClientError("unknown", message);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/[^a-zA-Z0-9]/g, "");
}

function hashToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createGoogleNoncePair(): Promise<GoogleNoncePair | null> {
  if (typeof globalThis.btoa !== "function") return null;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues || !cryptoApi.subtle) return null;
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  const nonce = bytesToBase64(bytes);
  const encoded = new TextEncoder().encode(nonce);
  const hashedNonce = hashToHex(await cryptoApi.subtle.digest("SHA-256", encoded));
  return { nonce, hashedNonce };
}

/**
 * Upstream these gated a Google Identity Services button that needed its own
 * client ID. Firebase owns the Google provider config, so Google sign-in is
 * available exactly when Firebase is.
 */
export function googleIdentityConfigured(): boolean {
  return supabaseConfigured();
}

export function getGoogleClientId(): string | null {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || null;
}

export function localDevLoginAvailable(): boolean {
  return localDevBrowserAvailable();
}

export function signInLocalDev(): User {
  writeLocalDevSignedIn();
  const user = localDevUser();
  cachedUser = user;
  inflightUser = null;
  return user;
}

/**
 * The `idToken`/`nonce` arguments are accepted and ignored: Firebase runs the
 * whole Google exchange in its own popup, so there is no caller-supplied token
 * to forward. The signature is kept so the ported login screen still compiles.
 */
export async function signInWithGoogleIdToken(
  _idToken?: string,
  _nonce?: string,
): Promise<Session> {
  try {
    const credential = await googleSignIn();
    cachedUser = toPortableUser(credential.user);
    inflightUser = null;
    return await toSession(credential.user);
  } catch (error) {
    throw toAuthClientError(error);
  }
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  try {
    const credential = await emailSignIn(email, password);
    cachedUser = toPortableUser(credential.user);
    inflightUser = null;
    return await toSession(credential.user);
  } catch (error) {
    throw toAuthClientError(error);
  }
}

export async function sendEmailLink(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new AuthClientError("email-missing", "missing-email");
  try {
    await sendSignInLinkToEmail(getFirebaseAuth(), normalizedEmail, {
      url: `${window.location.origin}/auth/callback`,
      handleCodeInApp: true,
    });
  } catch (error) {
    throw toAuthClientError(error);
  }
  window.localStorage.setItem(EMAIL_PENDING_KEY, normalizedEmail);
}

/**
 * Completes an email-link sign-in when the user lands back on the app from
 * their inbox. Returns `null` — not an error — when the current URL is not a
 * sign-in link, because `AuthCodeCatcher` calls this on every route change.
 */
export async function completeAuthRedirectSignIn(): Promise<Session | null> {
  const auth = getFirebaseAuth();
  const href = window.location.href;
  if (!isSignInWithEmailLink(auth, href)) return null;

  let email: string | null = null;
  try {
    email = window.localStorage.getItem(EMAIL_PENDING_KEY);
  } catch {
    // Private browsing with storage disabled — fall through to the prompt.
  }
  // The link can be opened on a different device from the one that requested
  // it, where nothing was stashed. Upstream had the same fallback.
  if (!email) email = window.prompt("Confirm your email to finish signing in") ?? null;
  if (!email) throw new AuthClientError("email-missing", "missing-email");

  try {
    const credential = await signInWithEmailLink(auth, email, href);
    cachedUser = toPortableUser(credential.user);
    inflightUser = null;
    window.localStorage.removeItem(EMAIL_PENDING_KEY);
    return await toSession(credential.user);
  } catch (error) {
    throw toAuthClientError(error);
  }
}

export const completeEmailLinkSignIn = completeAuthRedirectSignIn;

// Prefixes wiped on sign-out so the next person on a shared browser cannot see
// cached preview drafts, scores or tokens. `sb-` is kept from upstream: a
// browser that used the Supabase build may still hold those keys.
const LOCAL_WIPE_PREFIXES = ["doodee:", "sb-", "preview:", "score:"];

export async function signOut(): Promise<void> {
  // Cache is dropped FIRST so a concurrent read (an AuthGate remount firing
  // while the network revoke is still in flight) cannot resolve to the
  // pre-signOut user. Each step is independently caught so an offline server or
  // a storage quota error cannot leave the app half signed-out.
  invalidateAuthUserCache();
  cachedUser = null;
  inflightUser = null;
  try {
    setSubscriptionCache(null);
  } catch {
    // Cache write failed; the sign-out itself still has to happen.
  }
  try {
    clearLocalDevSignedIn();
  } catch {
    // Storage disabled.
  }
  try {
    await firebaseSignOut();
  } catch {
    // Offline, or already signed out. Local state is wiped regardless.
  }
  try {
    const doomed = Object.keys(window.localStorage).filter((key) =>
      LOCAL_WIPE_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // Safari private mode throws on storage access.
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (readLocalDevSignedIn()) {
    cachedUser = localDevUser();
    return cachedUser;
  }
  if (cachedUser !== undefined) return cachedUser;
  // Concurrent callers de-dupe onto one `authStateReady` rather than racing.
  if (inflightUser) return inflightUser;
  inflightUser = (async () => {
    try {
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      const user = toPortableUser(auth.currentUser);
      cachedUser = user;
      return user;
    } catch {
      cachedUser = null;
      return null;
    } finally {
      inflightUser = null;
    }
  })();
  return inflightUser;
}

/**
 * Returns the Firebase ID token — the credential the Django backend verifies.
 * `forceRefresh` is honoured: callers reach for it after a 401 to rule out a
 * merely-expired token before treating the user as signed out.
 */
export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (readLocalDevSignedIn()) return LOCAL_DEV_TOKEN;
  try {
    const auth = getFirebaseAuth();
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (readLocalDevSignedIn()) {
    const id = window.setTimeout(() => callback(localDevUser()), 0);
    return () => window.clearTimeout(id);
  }
  try {
    return onAuthStateChanged(getFirebaseAuth(), (user) => {
      const next = toPortableUser(user);
      cachedUser = next;
      inflightUser = null;
      callback(next);
    });
  } catch {
    // Firebase unconfigured: report signed-out once so callers leave their
    // loading state instead of hanging on a subscription that never fires.
    const id = window.setTimeout(() => callback(null), 0);
    return () => window.clearTimeout(id);
  }
}
