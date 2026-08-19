import { getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  initializeAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
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
export async function emailSignUp(email, password) {
  return createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
}

export async function emailSignIn(email, password) {
  return signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
}

// Firebase sends and hosts the reset page, so no password ever reaches this app or the server.
export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export const firebaseSignOut = () => signOut(getFirebaseAuth());
