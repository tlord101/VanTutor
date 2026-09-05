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

function parsePath(path: string): string[] {
  return path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

export function ref(_db: unknown, path: string): DbRef {
  return { path: path.replace(/^\/+|\/+$/g, '') };
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
  if (!isSupabaseConfigured) return null;
  const parts = parsePath(path);

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

  try {
    const { data } = await supabase.from('app_kv').select('value').eq('key', path).maybeSingle();
    return data?.value ?? pathDataCache.get(path) ?? null;
  } catch {
    return pathDataCache.get(path) ?? null;
  }
}

export async function get(r: DbRef) {
  const value = await loadPath(r.path);
  return makeSnap(value);
}

export function onValue(r: DbRef, callback: (snap: any) => void): Unsub {
  const path = r.path;
  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path)!.add(callback);

  loadPath(path).then((v) => notify(path, v));

  const parts = parsePath(path);

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
    if (value === null) {
      await supabase.from('notifications').delete().eq('id', parts[2]);
    } else {
      await supabase.from('notifications').upsert({
        id: parts[2],
        user_id: parts[1],
        title: value.title,
        body: value.body || value.message,
        type: value.type,
        data: value.data || {},
        is_read: value.is_read ?? false,
      });
    }
    notify(`notifications/${parts[1]}`, await loadPath(`notifications/${parts[1]}`));
    return;
  }

  if (parts[0] === 'users' && parts.length === 2) {
    await supabase
      .from('profiles')
      .update({
        is_online: value.isOnline ?? value.is_online,
        last_seen: value.lastSeen ? new Date(value.lastSeen).toISOString() : new Date().toISOString(),
      })
      .eq('id', parts[1]);
    return;
  }

  pathDataCache.set(r.path, value);
  notify(r.path, value);
}

export async function update(r: DbRef, values: Record<string, any>): Promise<void> {
  const parts = parsePath(r.path);

  if (parts[0] === 'chat_meta_data' && parts[2] === 'typing' && parts.length >= 4) {
    await set(r, values);
    return;
  }

  if (parts[0] === 'users' && parts.length === 2) {
    const patch: any = {};
    if ('isOnline' in values || 'is_online' in values) patch.is_online = values.isOnline ?? values.is_online;
    if ('lastSeen' in values || 'last_seen' in values) {
      const ls = values.lastSeen ?? values.last_seen;
      patch.last_seen = typeof ls === 'number' ? new Date(ls).toISOString() : ls;
    }
    if (Object.keys(patch).length) {
      await supabase.from('profiles').update(patch).eq('id', parts[1]);
    }
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

export function push(r: DbRef, value?: any): { key: string | null; then?: any } {
  const parts = parsePath(r.path);
  const key = crypto.randomUUID();

  const promise = (async () => {
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

      notify(r.path, await loadPath(r.path));
      return;
    }

    if (parts[0] === 'notifications' && parts.length === 2) {
      await supabase.from('notifications').insert({
        id: key,
        user_id: parts[1],
        title: value?.title,
        body: value?.body || value?.message,
        type: value?.type || 'general',
        data: value?.data || {},
      });
      notify(r.path, await loadPath(r.path));
      return;
    }

    pathDataCache.set(`${r.path}/${key}`, value);
  })();

  const result: any = { key };
  result.then = promise.then.bind(promise);
  result.catch = promise.catch.bind(promise);
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
