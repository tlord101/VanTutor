/**
 * App-wide database API (Supabase Realtime WebSockets).
 * Import from here instead of 'firebase/database'.
 */
export {
  db,
  ref,
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
  type DbRef,
} from './supabaseRealtimeDb';
