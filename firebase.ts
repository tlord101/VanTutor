/**
 * Legacy entrypoint — NO Firebase SDK.
 * Auth + realtime DB are Supabase. Storage media prefers R2; uploads use supabase storage helper.
 */

import { supabaseAuthService } from './services/supabaseAuthService';
import {
  db,
  ref as dbRef,
  onValue,
  off,
  set,
  push,
  update,
  get,
  remove,
  onDisconnect,
  serverTimestamp,
  query,
  limitToLast,
  increment,
} from './lib/supabaseRealtimeDb';
import { supabase } from './lib/supabaseClient';

export type FirebaseUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

const auth = {
  get currentUser(): FirebaseUser | null {
    // sync placeholder; real session via onAuthStateChanged
    return (auth as any)._currentUser || null;
  },
  _currentUser: null as FirebaseUser | null,
};

const onAuthStateChanged = (_authObj: any, callback: (user: FirebaseUser | null) => void) => {
  return supabaseAuthService.onAuthStateChanged((user, profile) => {
    if (user) {
      const fbUser: FirebaseUser = {
        uid: user.id,
        email: user.email,
        displayName: profile?.display_name || user.user_metadata?.full_name || '',
        photoURL: profile?.photo_url || user.user_metadata?.avatar_url || '',
      };
      (auth as any)._currentUser = fbUser;
      callback(fbUser);
    } else {
      (auth as any)._currentUser = null;
      callback(null);
    }
  });
};

const signInWithEmailAndPassword = async (_a: any, email: string, pass: string) => {
  const res = await supabaseAuthService.signInWithEmail(email, pass);
  if (res.error) throw new Error(res.error);
  return { user: { uid: res.user.id, email: res.user.email } };
};

const createUserWithEmailAndPassword = async (_a: any, email: string, pass: string) => {
  const res = await supabaseAuthService.signUpWithEmail(email, pass, email.split('@')[0]);
  if (res.error) throw new Error(res.error);
  return { user: { uid: res.user.id, email: res.user.email } };
};

const firebaseSignOut = async (_a?: any) => {
  await supabaseAuthService.signOut();
};

const sendPasswordResetEmail = async (_a: any, email: string) => {
  const res = await supabaseAuthService.sendPasswordReset(email);
  if (res.error) throw new Error(res.error);
};

const updateProfile = async (userObj: any, profileData: { displayName?: string; photoURL?: string }) => {
  if (userObj?.uid) {
    await supabaseAuthService.upsertProfile(userObj.uid, {
      display_name: profileData.displayName,
      photo_url: profileData.photoURL,
    });
  }
};

const signInAnonymously = async () => {
  const anonEmail = `guest_${Date.now()}@avelut.app`;
  const anonPass = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const res = await supabaseAuthService.signUpWithEmail(anonEmail, anonPass, 'Guest User');
  if (res.error) throw new Error(res.error);
  return { user: { uid: res.user.id, email: res.user.email } };
};

/** Minimal storage shim — prefer R2 in app code; this uses Supabase Storage bucket `uploads` */
const storage = {
  app: { name: 'supabase-storage' },
};

async function uploadBytes(pathRef: { fullPath: string }, blob: Blob) {
  const path = pathRef.fullPath || pathRef.toString();
  const { error } = await supabase.storage.from('uploads').upload(path, blob, { upsert: true });
  if (error) throw error;
  return { metadata: { fullPath: path } };
}

async function getDownloadURL(pathRef: { fullPath: string }) {
  const path = pathRef.fullPath || pathRef.toString();
  const { data } = supabase.storage.from('uploads').getPublicUrl(path);
  return data.publicUrl;
}

function storageRef(_storage: any, path: string) {
  return { fullPath: path, toString: () => path };
}

// Dummy Google provider for any leftover imports
class GoogleAuthProvider {}
const googleProvider = new GoogleAuthProvider();
const signInWithPopup = async () => {
  throw new Error('Use supabaseAuthService.signInWithGoogle() instead of signInWithPopup');
};
const signInWithCustomToken = async () => {
  throw new Error('Custom token auth is not supported; use Supabase session');
};
const messaging = null;
const functions = null;

export {
  db,
  storage,
  auth,
  functions,
  messaging,
  googleProvider,
  serverTimestamp,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  firebaseSignOut,
  // re-export path API so callers can migrate off firebase/database gradually
  dbRef as ref,
  onValue,
  off,
  set,
  push,
  update,
  get,
  remove,
  onDisconnect,
  query,
  limitToLast,
  increment,
  uploadBytes,
  getDownloadURL,
  storageRef,
};
