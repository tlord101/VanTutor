import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import {
  getPendingSyncQueue,
  removeSyncQueueItem,
  updateSyncQueueError,
  markConversationSynced,
  markMessageSynced,
  bulkUpsertRemoteConversations,
  bulkUpsertRemoteMessages,
  LocalConversation,
  LocalMessage
} from './chatStorageService';

export type CloudSyncStatus = 'synced' | 'syncing' | 'offline' | 'pending' | 'error';

type SyncListener = (status: CloudSyncStatus, pendingCount: number) => void;

class CloudSyncEngine {
  private status: CloudSyncStatus = 'synced';
  private listeners: Set<SyncListener> = new Set();
  private isSyncing = false;
  private syncIntervalId: any = null;
  private currentUserId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[CloudSync] Network online detected. Triggering sync...');
        this.triggerSync();
      });

      window.addEventListener('offline', () => {
        console.log('[CloudSync] Network offline detected.');
        this.updateStatus('offline', 0);
      });
    }
  }

  /**
   * Start background sync engine for the logged-in user.
   */
  public start(userId: string): void {
    if (!userId) return;
    this.currentUserId = userId;

    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    // Trigger immediate sync on start
    void this.triggerSync();

    // Background interval sync every 60 seconds
    this.syncIntervalId = setInterval(() => {
      if (this.isOnline()) {
        void this.triggerSync();
      }
    }, 60000);
  }

  /**
   * Stop background sync engine (e.g. on logout).
   */
  public stop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    this.currentUserId = null;
    this.updateStatus('synced', 0);
  }

  public isOnline(): boolean {
    if (typeof window === 'undefined') return true;
    return window.navigator.onLine !== false;
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.status, 0);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateStatus(newStatus: CloudSyncStatus, pendingCount: number = 0): void {
    this.status = newStatus;
    this.listeners.forEach(cb => {
      try {
        cb(newStatus, pendingCount);
      } catch (err) {
        console.error('[CloudSync] Listener notification error:', err);
      }
    });
  }

  /**
   * Main sync workflow: process outgoing mutations then fetch latest remote updates.
   */
  public async triggerSync(): Promise<void> {
    if (this.isSyncing) return;
    if (!this.isOnline() || !isSupabaseConfigured) {
      const queue = await getPendingSyncQueue();
      this.updateStatus(this.isOnline() ? 'synced' : 'offline', queue.length);
      return;
    }

    try {
      this.isSyncing = true;
      const pendingItems = await getPendingSyncQueue();

      if (pendingItems.length > 0) {
        this.updateStatus('syncing', pendingItems.length);
        await this.processOutgoingSyncQueue(pendingItems);
      }

      // Download downstream remote changes from Supabase if user is logged in
      if (this.currentUserId) {
        await this.pullDownstreamChanges(this.currentUserId);
      }

      const remainingQueue = await getPendingSyncQueue();
      if (remainingQueue.length > 0) {
        this.updateStatus('pending', remainingQueue.length);
      } else {
        this.updateStatus('synced', 0);
      }
    } catch (error) {
      console.error('[CloudSync] Sync cycle encountered an error:', error);
      this.updateStatus('error', 0);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Push local SQLite mutations up to Supabase.
   */
  private async processOutgoingSyncQueue(pendingItems: any[]): Promise<void> {
    for (const item of pendingItems) {
      try {
        const payload = item.payload_json ? JSON.parse(item.payload_json) : {};

        switch (item.entity_type) {
          case 'conversation': {
            const userId = payload.user_id || this.currentUserId;
            if (!userId) break;

            if (item.action === 'delete') {
              // Delete conversation from Supabase
              await supabase
                .from('messenger_conversations')
                .delete()
                .eq('id', item.entity_id);
            } else {
              // Upsert conversation metadata
              await supabase
                .from('messenger_conversations')
                .upsert({
                  id: item.entity_id,
                  user1_id: userId,
                  user2_id: payload.other_user_id || userId,
                  last_message_preview: payload.title || 'Conversation',
                  last_message_time: new Date(payload.last_updated_at || Date.now()).toISOString(),
                  updated_at: new Date().toISOString(),
                });
              await markConversationSynced(item.entity_id);
            }
            break;
          }

          case 'message': {
            if (item.action === 'delete') {
              await supabase
                .from('messenger_messages')
                .delete()
                .eq('id', item.entity_id);
            } else {
              await supabase
                .from('messenger_messages')
                .upsert({
                  id: item.entity_id,
                  conversation_id: payload.conversation_id,
                  sender_id: payload.user_id || this.currentUserId,
                  recipient_id: payload.recipient_id || payload.user_id || this.currentUserId,
                  message_type: payload.image_url ? 'image' : 'text',
                  text_content: payload.text,
                  media_url: payload.image_url || null,
                  created_at: new Date(payload.timestamp || Date.now()).toISOString(),
                });
              await markMessageSynced(item.entity_id);
            }
            break;
          }

          case 'app_state': {
            const userId = payload.userId || this.currentUserId;
            if (userId && payload.key === 'profile') {
              await supabase
                .from('profiles')
                .upsert({
                  id: userId,
                  ...payload.payload,
                  updated_at: new Date().toISOString(),
                });
            }
            break;
          }
        }

        // Successfully synced item, remove from queue
        await removeSyncQueueItem(item.id);
      } catch (err: any) {
        console.warn(`[CloudSync] Failed to sync queue item ${item.id}:`, err);
        await updateSyncQueueError(item.id, err.message || 'Network error');
      }
    }
  }

  /**
   * Pull latest conversations and progress from Supabase and merge into local SQLite.
   */
  private async pullDownstreamChanges(userId: string): Promise<void> {
    try {
      const { data: conversations, error } = await supabase
        .from('messenger_conversations')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('updated_at', { ascending: false });

      if (error) {
        console.warn('[CloudSync] Error fetching remote conversations:', error);
        return;
      }

      if (conversations && conversations.length > 0) {
        const remoteConversations: LocalConversation[] = conversations.map(item => ({
          id: item.id,
          user_id: userId,
          title: item.last_message_preview || 'Chat',
          created_at: new Date(item.last_message_time || item.updated_at).getTime(),
          last_updated_at: new Date(item.updated_at).getTime(),
          sync_status: 'synced',
          is_deleted: 0,
        }));
        await bulkUpsertRemoteConversations(remoteConversations);
      }
    } catch (err) {
      console.warn('[CloudSync] Failed to pull downstream changes from Supabase:', err);
    }
  }

  /**
   * Pull messages for a specific conversation on-demand from Supabase and save to SQLite.
   */
  public async pullMessagesForConversation(conversationId: string, userId: string): Promise<void> {
    if (!conversationId || !this.isOnline() || !isSupabaseConfigured) return;

    try {
      const { data: messages, error } = await supabase
        .from('messenger_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn(`[CloudSync] Error pulling messages for ${conversationId}:`, error);
        return;
      }

      if (messages && messages.length > 0) {
        const remoteMessages: LocalMessage[] = messages.map(item => ({
          id: item.id,
          conversation_id: item.conversation_id,
          user_id: item.sender_id,
          sender: item.sender_id === userId ? 'user' : 'assistant',
          text: item.text_content || '',
          attachments_json: null,
          image_url: item.media_url || null,
          timestamp: new Date(item.created_at).getTime(),
          sync_status: 'synced',
          is_deleted: 0,
        }));
        await bulkUpsertRemoteMessages(remoteMessages);
      }
    } catch (err) {
      console.warn(`[CloudSync] Failed to pull messages for conversation ${conversationId}:`, err);
    }
  }
}

export const cloudSyncEngine = new CloudSyncEngine();
export default cloudSyncEngine;
