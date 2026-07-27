// Firebase client init. Activate by setting env vars + NEXT_PUBLIC_REPOSITORY_DRIVER=firebase.
// Uncomment after `npm install firebase`.
/*
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const app = getApps().length ? getApps()[0] : initializeApp(config);
// L1 cache: offline persistence (arch §3.1)
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
export const auth = getAuth(app);
*/
export {};
