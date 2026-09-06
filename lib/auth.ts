/**
 * Supabase Auth API for Avelut.
 */
export {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  type AuthUser,
  type FirebaseUser,
} from './backend';
