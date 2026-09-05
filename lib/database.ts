/**
 * App-wide database API (Supabase Realtime WebSockets).
 * Also resolved as alias for 'firebase/database' in vite.config.ts.
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

export function orderByChild(key: string) {
  return { __op: 'orderByChild', key };
}

export function equalTo(value: any) {
  return { __op: 'equalTo', value };
}

export function orderByKey() {
  return { __op: 'orderByKey' };
}

export function orderByValue() {
  return { __op: 'orderByValue' };
}

export function limitToFirst(n: number) {
  return { __op: 'limitToFirst', n };
}

export function startAt(value: any) {
  return { __op: 'startAt', value };
}

export function endAt(value: any) {
  return { __op: 'endAt', value };
}
