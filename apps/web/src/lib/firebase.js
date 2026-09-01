import { getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  initializeAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';


const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
let auth;

export function getFirebaseAuth() {
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error('Firebase is not configured. Copy .env.example to .env and add your Firebase web credentials.');
  }
  if (!auth) {
    const app = getApps()[0] || initializeApp(config);
    auth = initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return auth;
}

// A popup is the better experience when it is allowed: the page keeps its state and the user
// comes straight back. These are the codes that mean it was never going to open, as opposed to
// the user changing their mind — `auth/popup-closed-by-user` is deliberately NOT here, because
// someone who closed the window on purpose should not have the whole page navigate away from
// under them as a reward.
const POPUP_UNUSABLE = new Set([
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

/**
 * Sign in with Google, falling back to a full-page redirect when the popup cannot open.
 *
 * Blocked popups are the common way this fails — a browser that blocks them by default, an
 * extension, or an in-app webview — and until now that left the user with a generic error and no
 * way through. The redirect works in all of those, at the cost of leaving the page, so it is the
 * fallback rather than the default.
 *
 * On the redirect path this never resolves: the browser navigates away mid-call. The caller must
 * therefore not treat "did not return" as failure, and the session is picked up on the way back
 * by `completeGoogleRedirect`.
 */
export async function googleSignIn() {
  const auth = getFirebaseAuth();
  try {
    return await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (!POPUP_UNUSABLE.has(error?.code)) throw error;
    await signInWithRedirect(auth, new GoogleAuthProvider());
    // Unreachable in a browser; the line above tears the document down. Awaiting forever keeps
    // the caller from running its success path against a sign-in that has not happened yet.
    return new Promise(() => {});
  }
}

/**
 * Pick up a sign-in that completed through the redirect path.
 *
 * Returns the credential when this page load is the return leg, and null on every ordinary load.
 * Firebase restores the session by itself, so this is called for the *result* — to know a
 * redirect just finished, and to surface an error that happened on the other side.
 */
export async function completeGoogleRedirect() {
  try {
    return await getRedirectResult(getFirebaseAuth());
  } catch (error) {
    // A failed redirect must not strand the page on a blank screen. The caller reports it.
    return Promise.reject(error);
  }
}

// Email and password, for people without a Google account or who do not want to use one.
// The backend needs no change for these: it verifies whatever Firebase ID token arrives and
// creates the Django user on first sight (see backend/doodee/authentication.py).
export async function emailSignUp(email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  if (displayName && displayName.trim()) {
    try {
      await updateProfile(credential.user, { displayName: displayName.trim() });
    } catch {
      // ignore
    }
  }
  // Nothing used to send this, so `email_verified` was false forever on every password account.
  // The referral reward is ฿30 and the server now refuses to attach an invite to an unverified
  // identity — without this mail, signing up with an address you own would be the only way
  // through, and signing up with one you do not would be impossible to distinguish.
  //
  // Awaited but not allowed to fail the signup: the account exists either way, and a user who
  // is told "sign-up failed" after their account was created cannot retry it. They can ask for
  // the mail again from Settings.
  try {
    await sendEmailVerification(credential.user);
  } catch {
    // Rate-limited by Firebase, or the address bounced. Not the signup's problem.
  }
  return credential;
}

/** Send the verification mail again. Resolves either way; the caller shows one message. */
export async function resendEmailVerification() {
  const user = getFirebaseAuth().currentUser;
  if (!user || user.emailVerified) return false;
  await sendEmailVerification(user);
  return true;
}

export async function emailSignIn(email, password) {
  return signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
}

// Firebase sends and hosts the reset page, so no password ever reaches this app or the server.
export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export const firebaseSignOut = () => signOut(getFirebaseAuth());
