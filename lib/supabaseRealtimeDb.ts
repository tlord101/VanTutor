/**
 * Path-style realtime DB API backed by Supabase (Postgres + Realtime WebSockets).
 * Replaces firebase/database for Messenger, notifications, presence, typing.
 *
 * Typing uses Realtime broadcast channels (no row writes → lower cost).
 * Messages / chats / notifications use tables + postgres_changes WebSockets.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';

export type DbRef = { path: string };

type Unsub = () => void;

const listeners = new Map<string, Set<(snap: { val: () => any; exists: () => boolean }) => void>>();
const pathDataCache = new Map<string, any>();
const channelByPath = new Map<string, ReturnType<typeof supabase.channel>>();

let isAppKvAvailable: boolean | null = typeof window !== 'undefined' && window.sessionStorage?.getItem('avelut_app_kv_missing') === '1' ? false : null;

function getLocalCache(path: string): any {
  if (pathDataCache.has(path)) return pathDataCache.get(path);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(`rtdb_kv_${path}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        pathDataCache.set(path, parsed);
        return parsed;
      }
    } catch {}
  }
  return null;
}

function setLocalCache(path: string, val: any) {
  pathDataCache.set(path, val);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (val === null || val === undefined) {
        window.localStorage.removeItem(`rtdb_kv_${path}`);
      } else {
        window.localStorage.setItem(`rtdb_kv_${path}`, JSON.stringify(val));
      }
    } catch {}
  }
}

function makeSnap(value: any) {
  return {
    val: () => value ?? null,
    exists: () => value !== null && value !== undefined,
  };
}

function notify(path: string, value: any) {
  pathDataCache.set(path, value);
  const set = listeners.get(path);
  if (!set) return;
  const snap = makeSnap(value);
  set.forEach((cb) => {
    try {
      cb(snap);
    } catch (e) {
      console.warn('[supabaseRealtimeDb] listener error', e);
    }
  });
}

function parsePath(pathOrRef: any): string[] {
  if (!pathOrRef) return [];
  const rawPath = typeof pathOrRef === 'string' ? pathOrRef : (pathOrRef?.path ?? pathOrRef?._path ?? '');
  if (!rawPath || typeof rawPath !== 'string') return [];
  return rawPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

export function ref(_db: unknown, path: string): DbRef {
  const safePath = typeof path === 'string' ? path.replace(/^\/+|\/+$/g, '') : '';
  return { path: safePath };
}

export function serverTimestamp(): number {
  return Date.now();
}

export function increment(by: number) {
  return { __op: 'increment', by } as const;
}

export function limitToLast(n: number) {
  return { __op: 'limitToLast', n } as const;
}

export function query(r: DbRef, ..._constraints: any[]): DbRef {
  return r;
}

async function loadPath(path: string): Promise<any> {
  if (!path || path === 'undefined' || path === 'null') return null;

  if (path === '.info/connected' || path.startsWith('.info/')) {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  const parts = parsePath(path);
  if (parts.some((p) => p === 'undefined' || p === 'null' || !p)) {
    return null;
  }

  if (!isSupabaseConfigured) return null;

  if (parts[0] === 'user_progress' && parts.length >= 2) {
    const userId = parts[1];
    try {
      const { data, error } = await supabase.from('user_progress').select('*').eq('user_id', userId);
      if (!error && data) {
        const map: Record<string, any> = {};
        data.forEach((row: any) => {
          if (row.course_id) {
            if (!map[row.course_id]) map[row.course_id] = {};
            if (row.topic_id) {
              map[row.course_id][row.topic_id] = {
                status: row.is_mastered ? 'completed' : 'in_progress',
                completed_boards: row.completed_boards || 0,
                total_boards: row.total_boards || 10,
                score: row.score || 0,
                is_mastered: row.is_mastered,
              };
            }
          }
        });
        return map;
      }
    } catch {}
  }

  if (parts[0] === 'user_chats' && parts.length === 2) {
    const userId = parts[1];
    const { data } = await supabase
      .from('chat_members')
      .select('*')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });
    const map: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      map[row.chat_id] = {
        otherUserId: row.other_user_id,
        timestamp: row.last_message_at ? new Date(row.last_message_at).getTime() : Date.now(),
        unreadCount: row.unread_count || 0,
        last_message: row.last_message_text
          ? {
              text: row.last_message_text,
              sender_id: row.last_message_sender_id,
              isRead: row.last_message_is_read,
              timestamp: row.last_message_at ? new Date(row.last_message_at).getTime() : Date.now(),
            }
          : null,
      };
    });
    return map;
  }

  if (parts[0] === 'user_chats' && parts.length === 3) {
    const [, userId, chatId] = parts;
    const { data } = await supabase
      .from('chat_members')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .maybeSingle();
    if (!data) return null;
    return {
      otherUserId: data.other_user_id,
      timestamp: data.last_message_at ? new Date(data.last_message_at).getTime() : Date.now(),
      unreadCount: data.unread_count || 0,
      last_message: data.last_message_text
        ? {
            text: data.last_message_text,
            sender_id: data.last_message_sender_id,
            isRead: data.last_message_is_read,
          }
        : null,
    };
  }

  if ((parts[0] === 'messages' || parts[0] === 'private_messages') && parts.length === 2) {
    const chatId = parts[1];
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(200);
    const map: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      map[row.id] = {
        id: row.id,
        sender_id: row.sender_id,
        text: row.text,
        media_url: row.media_url,
        media_type: row.media_type,
        reply_to: row.reply_to,
        is_deleted: row.is_deleted,
        timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      };
    });
    return map;
  }

  if (parts[0] === 'notifications' && parts.length === 2) {
    const userId = parts[1];
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    const map: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      map[row.id] = {
        id: row.id,
        title: row.title,
        body: row.body,
        type: row.type,
        data: row.data,
        is_read: row.is_read,
        timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      };
    });
    return map;
  }

  if (parts[0] === 'users' && parts.length === 2) {
    const { data } = await supabase.from('profiles').select('*').eq('id', parts[1]).maybeSingle();
    if (!data) return null;
    return {
      ...data,
      isOnline: data.is_online,
      lastSeen: data.last_seen ? new Date(data.last_seen).getTime() : null,
      display_name: data.full_name,
      photo_url: data.avatar_url,
      notifications_enabled: data.notifications_enabled,
    };
  }

  if (parts[0] === 'users' && parts.length === 1) {
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url, is_online, last_seen, school_id, department_id, level').limit(200);
    const map: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      map[row.id] = {
        display_name: row.full_name,
        photo_url: row.avatar_url,
        isOnline: row.is_online,
        lastSeen: row.last_seen,
        school_id: row.school_id,
        department_id: row.department_id,
        level: row.level,
      };
    });
    return map;
  }

  if (parts[0] === 'study_partners' && parts.length === 2) {
    const { data } = await supabase.from('study_partners').select('partner_id').eq('user_id', parts[1]);
    const map: Record<string, boolean> = {};
    (data || []).forEach((row: any) => {
      map[row.partner_id] = true;
    });
    return map;
  }

  if (parts[0] === 'users' && parts[2] === 'blocked_users' && parts.length === 3) {
    const { data } = await supabase.from('user_blocks').select('blocked_id').eq('user_id', parts[1]);
    const map: Record<string, boolean> = {};
    (data || []).forEach((row: any) => {
      map[row.blocked_id] = true;
    });
    return map;
  }

  if (parts[0] === 'chat_meta_data' && parts[2] === 'typing') {
    return pathDataCache.get(path) || {};
  }

  // Handle app_settings/* via public.app_settings table
  if (parts[0] === 'app_settings' && parts.length >= 2) {
    try {
      const { data, error } = await supabase.from('app_settings').select('value_json').eq('key', parts[1]).maybeSingle();
      if (!error && data?.value_json) {
        if (parts.length === 3 && typeof data.value_json === 'object') {
          return data.value_json[parts[2]] ?? null;
        }
        return data.value_json;
      }
    } catch {}
  }

  const cached = getLocalCache(path);

  if (isAppKvAvailable === false || !isSupabaseConfigured) {
    return cached ?? null;
  }

  try {
    const { data, error } = await supabase.from('app_kv').select('value').eq('key', path).maybeSingle();
    if (error) {
      if (error.code === '42P01' || (error as any).status === 404 || error.message?.includes('does not exist')) {
        isAppKvAvailable = false;
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('avelut_app_kv_missing', '1');
        }
      }
      return cached ?? null;
    }
    isAppKvAvailable = true;
    if (data && 'value' in data) {
      setLocalCache(path, data.value);
      return data.value;
    }
    return cached ?? null;
  } catch {
    isAppKvAvailable = false;
    return cached ?? null;
  }
}

export async function get(r: DbRef) {
  const value = await loadPath(r.path);
  return makeSnap(value);
}

export function onValue(r: DbRef, callback: (snap: any) => void): Unsub {
  const path = r.path;

  if (path === '.info/connected' || path.startsWith('.info/')) {
    const handler = () => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      callback(makeSnap(isOnline));
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handler);
      window.addEventListener('offline', handler);
      handler();
      return () => {
        window.removeEventListener('online', handler);
        window.removeEventListener('offline', handler);
      };
    }
    callback(makeSnap(true));
    return () => {};
  }

  const parts = parsePath(path);
  if (parts.some((p) => p === 'undefined' || p === 'null' || !p)) {
    callback(makeSnap(null));
    return () => {};
  }

  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path)!.add(callback);

  loadPath(path).then((v) => notify(path, v));

  if ((parts[0] === 'messages' || parts[0] === 'private_messages') && parts.length === 2) {
    const chatId = parts[1];
    const chName = `messages:${chatId}`;
    let ch = channelByPath.get(chName);
    if (!ch) {
      ch = supabase
        .channel(chName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
          async () => {
            const v = await loadPath(path);
            notify(path, v);
          }
        )
        .subscribe();
      channelByPath.set(chName, ch);
    }
  }

  if (parts[0] === 'user_chats' && parts.length >= 2) {
    const userId = parts[1];
    const chName = `user_chats:${userId}`;
    let ch = channelByPath.get(chName);
    if (!ch) {
      ch = supabase
        .channel(chName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_members', filter: `user_id=eq.${userId}` },
          async () => {
            const listPath = `user_chats/${userId}`;
            notify(listPath, await loadPath(listPath));
            if (parts.length === 3) {
              notify(path, await loadPath(path));
            }
          }
        )
        .subscribe();
      channelByPath.set(chName, ch);
    }
  }

  if (parts[0] === 'notifications' && parts.length === 2) {
    const userId = parts[1];
    const chName = `notifications:${userId}`;
    let ch = channelByPath.get(chName);
    if (!ch) {
      ch = supabase
        .channel(chName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          async () => notify(path, await loadPath(path))
        )
        .subscribe();
      channelByPath.set(chName, ch);
    }
  }

  if (parts[0] === 'chat_meta_data' && parts[2] === 'typing') {
    const chatId = parts[1];
    const chName = `typing:${chatId}`;
    let ch = channelByPath.get(chName);
    if (!ch) {
      ch = supabase
        .channel(chName)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const current = { ...(pathDataCache.get(path) || {}) };
          if (payload?.uid) {
            if (payload.clear) delete current[payload.uid];
            else current[payload.uid] = payload.state;
            notify(path, current);
          }
        })
        .subscribe();
      channelByPath.set(chName, ch);
    }
  }

  return () => {
    const set = listeners.get(path);
    if (set) {
      set.delete(callback);
      if (set.size === 0) listeners.delete(path);
    }
  };
}

export function off(r?: DbRef, _event?: string, callback?: (snap: any) => void) {
  if (!r) return;
  const set = listeners.get(r.path);
  if (!set) return;
  if (callback) set.delete(callback);
  else set.clear();
}

export async function set(r: DbRef, value: any): Promise<void> {
  const parts = parsePath(r.path);

  if (parts[0] === 'chat_meta_data' && parts[2] === 'typing') {
    const chatId = parts[1];
    const uid = parts[3];
    const chName = `typing:${chatId}`;
    let ch = channelByPath.get(chName);
    if (!ch) {
      ch = supabase.channel(chName).subscribe();
      channelByPath.set(chName, ch);
    }
    if (uid) {
      await ch.send({
        type: 'broadcast',
        event: 'typing',
        payload: value ? { uid, state: value } : { uid, clear: true },
      });
    }
    return;
  }

  if (parts[0] === 'user_chats' && parts.length === 3) {
    const [, userId, chatId] = parts;
    if (value === null) {
      await supabase.from('chat_members').delete().eq('user_id', userId).eq('chat_id', chatId);
      notify(`user_chats/${userId}`, await loadPath(`user_chats/${userId}`));
      return;
    }
    await supabase.from('chat_members').upsert({
      chat_id: chatId,
      user_id: userId,
      other_user_id: value.otherUserId || value.other_user_id || null,
      last_message_text: value.last_message?.text ?? value.last_message_text ?? null,
      last_message_at: value.timestamp
        ? new Date(value.timestamp).toISOString()
        : new Date().toISOString(),
      last_message_sender_id: value.last_message?.sender_id ?? null,
      last_message_is_read: value.last_message?.isRead ?? true,
      unread_count: value.unreadCount ?? value.unread_count ?? 0,
    });
    await supabase.from('chats').upsert({ id: chatId });
    notify(`user_chats/${userId}`, await loadPath(`user_chats/${userId}`));
    return;
  }

  if (parts[0] === 'users' && parts[2] === 'blocked_users' && parts.length === 4) {
    await supabase.from('user_blocks').upsert({ user_id: parts[1], blocked_id: parts[3] });
    return;
  }

  if (parts[0] === 'reports') {
    await supabase.from('reports').insert({
      id: parts[1],
      reporter_id: value.reporter_id ?? value.reporter_uid,
      reported_id: value.reported_id ?? value.reported_uid,
      chat_id: value.chat_id,
      reason: value.reason,
    });
    return;
  }

  if (parts[0] === 'notifications' && parts.length === 3) {
    const userId = parts[1];
    const notifId = parts[2];
    if (value === null) {
      try {
        await supabase.from('notifications').delete().eq('id', notifId);
      } catch (e) {
        console.warn('[supabaseRealtimeDb] delete notification error', e);
      }
    } else {
      const dataPayload = {
        ...(typeof value.data === 'object' && value.data ? value.data : {}),
        ...(value.route ? { route: value.route } : {}),
        ...(value.category ? { category: value.category } : {}),
        ...(value.audience ? { audience: value.audience } : {}),
        ...(value.timestamp ? { timestamp: value.timestamp } : {}),
      };
      try {
        await supabase.from('notifications').upsert({
          id: notifId,
          user_id: userId,
          title: value.title ?? null,
          body: value.body || value.message || null,
          type: value.type || 'general',
          data: dataPayload,
          is_read: value.is_read ?? false,
        });
      } catch (e) {
        console.warn('[supabaseRealtimeDb] upsert notification error', e);
      }
    }
    setLocalCache(`notifications/${userId}/${notifId}`, value);
    notify(`notifications/${userId}`, await loadPath(`notifications/${userId}`));
    return;
  }

  if ((parts[0] === 'messages' || parts[0] === 'private_messages') && parts.length === 3) {
    const chatId = parts[1];
    const msgId = parts[2];
    if (value === null) {
      try {
        await supabase.from('messages').update({ is_deleted: true }).eq('id', msgId);
      } catch (e) {
        console.warn('[supabaseRealtimeDb] delete message error', e);
      }
    } else {
      const row = {
        id: msgId,
        chat_id: chatId,
        sender_id: value.sender_id,
        text: value.text ?? value.message ?? '',
        media_url: value.media_url || value.imageUrl || value.fileUrl || null,
        media_type: value.media_type || value.type || null,
        reply_to: value.reply_to || null,
        is_deleted: value.is_deleted ?? false,
        created_at: value.created_at ? new Date(value.created_at).toISOString() : new Date().toISOString(),
      };
      try {
        await supabase.from('messages').upsert(row);
        const text = row.text || (row.media_url ? '📎 Media' : '');
        await supabase
          .from('chat_members')
          .update({
            last_message_text: text,
            last_message_at: row.created_at,
            last_message_sender_id: row.sender_id,
            last_message_is_read: false,
          })
          .eq('chat_id', chatId);
      } catch (e) {
        console.warn('[supabaseRealtimeDb] upsert message error', e);
      }
    }
    notify(`messages/${chatId}`, await loadPath(`messages/${chatId}`));
    return;
  }

  if (parts[0] === 'users' && parts.length === 2) {
    const userId = parts[1];
    const patch: any = {};
    if ('isOnline' in value || 'is_online' in value) patch.is_online = value.isOnline ?? value.is_online;
    if ('lastSeen' in value || 'last_seen' in value) {
      const ls = value.lastSeen ?? value.last_seen;
      patch.last_seen = typeof ls === 'number' ? new Date(ls).toISOString() : ls;
    }
    if ('display_name' in value || 'displayName' in value || 'full_name' in value) {
      patch.full_name = value.full_name ?? value.display_name ?? value.displayName;
    }
    if ('photo_url' in value || 'photoURL' in value || 'avatar_url' in value) {
      patch.avatar_url = value.avatar_url ?? value.photo_url ?? value.photoURL;
    }
    if ('school_id' in value || 'schoolId' in value) patch.school_id = value.school_id ?? value.schoolId;
    if ('school_name' in value || 'schoolName' in value) patch.school_name = value.school_name ?? value.schoolName;
    if ('college_id' in value || 'collegeId' in value) patch.college_id = value.college_id ?? value.collegeId;
    if ('department_id' in value || 'departmentId' in value) patch.department_id = value.department_id ?? value.departmentId;
    if ('department_name' in value || 'departmentName' in value) patch.department_name = value.department_name ?? value.departmentName;
    if ('level' in value) patch.level = value.level;
    if ('current_streak' in value || 'streak' in value) patch.streak = value.streak ?? value.current_streak;
    if ('ai_credits_balance' in value || 'ai_credits' in value) patch.ai_credits = value.ai_credits ?? value.ai_credits_balance;
    if ('fcm_token' in value || 'fcmToken' in value) patch.fcm_token = value.fcm_token ?? value.fcmToken;
    patch.updated_at = new Date().toISOString();

    try {
      await supabase.from('profiles').update(patch).eq('id', userId);
    } catch (e) {
      console.warn('[supabaseRealtimeDb] update profile error', e);
    }
    setLocalCache(r.path, { ...(getLocalCache(r.path) || {}), ...value });
    notify(r.path, await loadPath(r.path));
    return;
  }

  setLocalCache(r.path, value);
  notify(r.path, value);

  if (isAppKvAvailable !== false && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('app_kv').upsert({
        key: r.path,
        value: value,
        updated_at: new Date().toISOString(),
      });
      if (error && (error.code === '42P01' || (error as any).status === 404 || error.message?.includes('does not exist'))) {
        isAppKvAvailable = false;
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('avelut_app_kv_missing', '1');
        }
      }
    } catch {
      isAppKvAvailable = false;
    }
  }
}

export async function update(r: DbRef, values: Record<string, any>): Promise<void> {
  const parts = parsePath(r.path);

  if (parts[0] === 'chat_meta_data' && parts[2] === 'typing' && parts.length >= 4) {
    await set(r, values);
    return;
  }

  if (parts[0] === 'users' && parts.length === 2) {
    const userId = parts[1];
    const patch: any = {};
    if ('isOnline' in values || 'is_online' in values) patch.is_online = values.isOnline ?? values.is_online;
    if ('lastSeen' in values || 'last_seen' in values) {
      const ls = values.lastSeen ?? values.last_seen;
      patch.last_seen = typeof ls === 'number' ? new Date(ls).toISOString() : ls;
    }
    if ('display_name' in values || 'displayName' in values || 'full_name' in values) {
      patch.full_name = values.full_name ?? values.display_name ?? values.displayName;
    }
    if ('photo_url' in values || 'photoURL' in values || 'avatar_url' in values) {
      patch.avatar_url = values.avatar_url ?? values.photo_url ?? values.photoURL;
    }
    if ('school_id' in values || 'schoolId' in values) patch.school_id = values.school_id ?? values.schoolId;
    if ('school_name' in values || 'schoolName' in values) patch.school_name = values.school_name ?? values.schoolName;
    if ('college_id' in values || 'collegeId' in values) patch.college_id = values.college_id ?? values.collegeId;
    if ('department_id' in values || 'departmentId' in values) patch.department_id = values.department_id ?? values.departmentId;
    if ('department_name' in values || 'departmentName' in values) patch.department_name = values.department_name ?? values.departmentName;
    if ('level' in values) patch.level = values.level;
    if ('current_streak' in values || 'streak' in values) patch.streak = values.streak ?? values.current_streak;
    if ('ai_credits_balance' in values || 'ai_credits' in values) patch.ai_credits = values.ai_credits ?? values.ai_credits_balance;
    if ('fcm_token' in values || 'fcmToken' in values) patch.fcm_token = values.fcm_token ?? values.fcmToken;
    patch.updated_at = new Date().toISOString();

    if (Object.keys(patch).length > 1) {
      try {
        await supabase.from('profiles').update(patch).eq('id', userId);
      } catch (e) {
        console.warn('[supabaseRealtimeDb] update profile error', e);
      }
    }
    setLocalCache(r.path, { ...(getLocalCache(r.path) || {}), ...values });
    notify(r.path, await loadPath(r.path));
    return;
  }

  if (parts[0] === 'user_chats' && parts.length === 3) {
    const [, userId, chatId] = parts;
    const patch: any = {};
    if ('unreadCount' in values) patch.unread_count = values.unreadCount;
    if (values.last_message) {
      patch.last_message_text = values.last_message.text;
      patch.last_message_sender_id = values.last_message.sender_id;
      patch.last_message_is_read = values.last_message.isRead;
      patch.last_message_at = new Date().toISOString();
    }
    if ('timestamp' in values) patch.last_message_at = new Date(values.timestamp).toISOString();
    await supabase.from('chat_members').update(patch).eq('user_id', userId).eq('chat_id', chatId);
    notify(`user_chats/${userId}`, await loadPath(`user_chats/${userId}`));
    return;
  }

  const current = (await loadPath(r.path)) || {};
  const next = { ...current, ...values };
  await set(r, next);
}

export function push(r: DbRef, value?: any): DbRef & { key: string; ref: DbRef; then: any; catch: any } {
  const path = r?.path || (typeof r === 'string' ? r : '');
  const parts = parsePath(path);
  const key = crypto.randomUUID();
  const childPath = path ? `${path}/${key}` : key;
  const childRef: DbRef = { path: childPath };

  let promise: Promise<any>;

  if (value !== undefined) {
    if ((parts[0] === 'messages' || parts[0] === 'private_messages') && parts.length === 2) {
      const chatId = parts[1];
      const row = {
        id: key,
        chat_id: chatId,
        sender_id: value?.sender_id,
        text: value?.text ?? value?.message ?? '',
        media_url: value?.media_url || value?.imageUrl || value?.fileUrl || null,
        media_type: value?.media_type || value?.type || null,
        reply_to: value?.reply_to || null,
        is_deleted: false,
        created_at: new Date().toISOString(),
      };
      promise = (async () => {
        try {
          await supabase.from('messages').insert(row);
          const text = row.text || (row.media_url ? '📎 Media' : '');
          await supabase
            .from('chat_members')
            .update({
              last_message_text: text,
              last_message_at: row.created_at,
              last_message_sender_id: row.sender_id,
              last_message_is_read: false,
            })
            .eq('chat_id', chatId);

          try {
            const { data: members } = await supabase.from('chat_members').select('user_id, unread_count').eq('chat_id', chatId);
            for (const m of members || []) {
              if (m.user_id !== row.sender_id) {
                await supabase
                  .from('chat_members')
                  .update({ unread_count: (m.unread_count || 0) + 1 })
                  .eq('chat_id', chatId)
                  .eq('user_id', m.user_id);
              }
            }
          } catch {
            /* ignore */
          }
        } catch (e) {
          console.warn('[supabaseRealtimeDb] push message error', e);
        }
        notify(path, await loadPath(path));
      })();
    } else if (parts[0] === 'notifications' && parts.length === 2) {
      promise = (async () => {
        try {
          const dataPayload = {
            ...(typeof value?.data === 'object' && value?.data ? value.data : {}),
            ...(value?.route ? { route: value.route } : {}),
            ...(value?.category ? { category: value.category } : {}),
            ...(value?.audience ? { audience: value.audience } : {}),
            ...(value?.timestamp ? { timestamp: value.timestamp } : {}),
          };
          await supabase.from('notifications').insert({
            id: key,
            user_id: parts[1],
            title: value?.title ?? null,
            body: value?.body || value?.message || null,
            type: value?.type || 'general',
            data: dataPayload,
            is_read: value?.is_read ?? false,
          });
        } catch (e) {
          console.warn('[supabaseRealtimeDb] push notification error', e);
        }
        notify(path, await loadPath(path));
      })();
    } else {
      promise = set(childRef, value);
    }
  } else {
    promise = Promise.resolve();
  }

  const result: any = {
    path: childPath,
    key,
    ref: childRef,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return result;
}

export async function remove(r: DbRef): Promise<void> {
  await set(r, null);
}

export function onDisconnect(r: DbRef) {
  return {
    update: async (values: Record<string, any>) => {
      if (typeof window === 'undefined') return;
      const handler = () => {
        void update(r, values);
      };
      window.addEventListener('pagehide', handler);
      window.addEventListener('beforeunload', handler);
    },
    set: async (value: any) => {
      if (typeof window === 'undefined') return;
      const handler = () => void set(r, value);
      window.addEventListener('pagehide', handler);
      window.addEventListener('beforeunload', handler);
    },
    remove: async () => {
      /* no-op */
    },
  };
}

export const db = { __supabaseRealtime: true };
