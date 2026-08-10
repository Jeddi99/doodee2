import { createApi } from '@doodee/shared';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebase = getApps().length ? getApp() : initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

export const auth = getAuth(firebase);
export const api = createApi(process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8001/api/v1', () => auth.currentUser?.getIdToken() || Promise.resolve(null));
