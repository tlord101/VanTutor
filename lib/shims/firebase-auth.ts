/** firebase/auth → Supabase */
import { supabaseAuthService } from '../../services/supabaseAuthService';

export type User = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

export function getAuth(_app?: any) {
  return {
    get currentUser() {
      return null;
    },
  };
}

export class GoogleAuthProvider {}

export function onAuthStateChanged(_auth: any, cb: (user: User | null) => void) {
  return supabaseAuthService.onAuthStateChanged((user, profile) => {
    if (!user) return cb(null);
    cb({
      uid: user.id,
      email: user.email,
      displayName: profile?.display_name || user.user_metadata?.full_name || '',
      photoURL: profile?.photo_url || user.user_metadata?.avatar_url || '',
    });
  });
}

export async function signInWithEmailAndPassword(_a: any, email: string, pass: string) {
  const res = await supabaseAuthService.signInWithEmail(email, pass);
  if (res.error) throw new Error(res.error);
  return { user: { uid: res.user.id, email: res.user.email } };
}

export async function createUserWithEmailAndPassword(_a: any, email: string, pass: string) {
  const res = await supabaseAuthService.signUpWithEmail(email, pass, email.split('@')[0]);
  if (res.error) throw new Error(res.error);
  return { user: { uid: res.user.id, email: res.user.email } };
}

export async function signOut(_a?: any) {
  await supabaseAuthService.signOut();
}

export async function sendPasswordResetEmail(_a: any, email: string) {
  const res = await supabaseAuthService.sendPasswordReset(email);
  if (res.error) throw new Error(res.error);
}

export async function updateProfile(user: any, data: { displayName?: string; photoURL?: string }) {
  if (user?.uid) {
    await supabaseAuthService.upsertProfile(user.uid, {
      display_name: data.displayName,
      photo_url: data.photoURL,
    });
  }
}

export async function signInWithPopup() {
  throw new Error('Use supabaseAuthService.signInWithGoogle()');
}

export async function signInAnonymously() {
  const email = `guest_${Date.now()}@avelut.app`;
  const pass = `guest_${Date.now()}`;
  const res = await supabaseAuthService.signUpWithEmail(email, pass, 'Guest');
  if (res.error) throw new Error(res.error);
  return { user: { uid: res.user.id, email: res.user.email } };
}

export async function signInWithCustomToken() {
  throw new Error('Not supported');
}
