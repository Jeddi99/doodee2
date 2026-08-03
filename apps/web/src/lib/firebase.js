import { getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  GoogleAuthProvider,
  initializeAuth,
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
      persistence: browserSessionPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return auth;
}

export async function googleSignIn() {
  return signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
}

export const firebaseSignOut = () => signOut(getFirebaseAuth());
