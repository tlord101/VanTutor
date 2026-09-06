/**
 * Legacy entrypoint — NO Firebase SDK.
 * Auth + realtime DB are Supabase. Storage uses Supabase Storage / R2 callers.
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

const storage: any = { app: { name: 'supabase-storage' } };

function storageRef(_storage: any, path: string) {
  return { fullPath: path, toString: () => path };
}

async function uploadBytes(pathRef: { fullPath: string }, blob: Blob) {
  const path = pathRef.fullPath || String(pathRef);
  const { error } = await supabase.storage.from('uploads').upload(path, blob, { upsert: true });
  if (error) throw error;
  return { metadata: { fullPath: path } };
}

function uploadBytesResumable(pathRef: { fullPath: string }, blob: Blob) {
  const listeners: Record<string, Function[]> = { state_changed: [] };
  const task: any = {
    on(event: string, next?: any, _err?: any, complete?: any) {
      if (event === 'state_changed' && next) listeners.state_changed.push(next);
      void uploadBytes(pathRef, blob)
        .then(() => {
          listeners.state_changed.forEach((fn) =>
            fn({ bytesTransferred: blob.size, totalBytes: blob.size, state: 'success' })
          );
          complete?.();
        })
        .catch((e) => _err?.(e));
      return task;
    },
    snapshot: { ref: pathRef },
    then(onFulfilled: any, onRejected?: any) {
      return uploadBytes(pathRef, blob).then(onFulfilled, onRejected);
    },
  };
  return task;
}

async function getDownloadURL(pathRef: { fullPath: string }) {
  const path = pathRef.fullPath || String(pathRef);
  const { data } = supabase.storage.from('uploads').getPublicUrl(path);
  return data.publicUrl;
}

async function deleteObject(pathRef: { fullPath: string }) {
  const path = pathRef.fullPath || String(pathRef);
  await supabase.storage.from('uploads').remove([path]);
}

function httpsCallable(_functions: any, name: string) {
  return async (_payload?: any) => {
    console.warn(`[shim] httpsCallable('${name}') not on Supabase — add an Edge Function if needed.`);
    return { data: null };
  };
}

function orderByChild(key: string) {
  return { __op: 'orderByChild', key };
}
function equalTo(value: any) {
  return { __op: 'equalTo', value };
}

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
  dbRef as ref,
  dbRef,
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
  orderByChild,
  equalTo,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  storageRef,
  httpsCallable,
};
