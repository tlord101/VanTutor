import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Step 3: Initialize Firebase using global constants.
// These variables are expected to be injected into the global scope by the runtime environment.
// We declare them here to inform TypeScript about their existence.
declare var __firebase_config: any;
declare var __app_id: string;

let app: FirebaseApp;
const appName = __app_id;

// Robustly get or initialize the Firebase app instance.
// This prevents issues in environments with hot-reloading or where multiple
// Firebase apps might be present.
const existingApp = getApps().find(app => app.name === appName);

if (existingApp) {
  app = existingApp;
} else {
  app = initializeApp(__firebase_config, appName);
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, storage, googleProvider };