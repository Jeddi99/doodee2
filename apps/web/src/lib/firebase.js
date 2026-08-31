import { getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  initializeAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
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

export async function googleSignIn() {
  return signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
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
