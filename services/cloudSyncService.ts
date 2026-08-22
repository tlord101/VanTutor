import { db } from '../firebase';
import { ref as dbRef, set, update, remove, get } from 'firebase/database';
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
    if (!this.isOnline()) {
      const queue = await getPendingSyncQueue();
      this.updateStatus('offline', queue.length);
      return;
    }

    try {
      this.isSyncing = true;
      const pendingItems = await getPendingSyncQueue();

      if (pendingItems.length > 0) {
        this.updateStatus('syncing', pendingItems.length);
        await this.processOutgoingSyncQueue(pendingItems);
      }

      // Download downstream remote changes from Firebase if user is logged in
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
   * Push local SQLite mutations up to Firebase Realtime Database.
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
              await remove(dbRef(db, `chat_conversations/${userId}/${item.entity_id}`));
              await remove(dbRef(db, `chat_messages/${item.entity_id}`));
            } else {
              const convoRef = dbRef(db, `chat_conversations/${userId}/${item.entity_id}`);
              await update(convoRef, {
                title: payload.title || 'New Chat',
                created_at: payload.created_at || Date.now(),
                last_updated_at: payload.last_updated_at || Date.now(),
              });
              await markConversationSynced(item.entity_id);
            }
            break;
          }

          case 'message': {
            if (item.action === 'delete') {
              // Not commonly single-deleted, but handled safely
              await remove(dbRef(db, `chat_messages/${payload.conversation_id}/${item.entity_id}`));
            } else {
              const msgRef = dbRef(db, `chat_messages/${payload.conversation_id}/${item.entity_id}`);
              await set(msgRef, {
                sender: payload.sender,
                text: payload.text,
                attachments: payload.attachments_json ? JSON.parse(payload.attachments_json) : null,
                image_url: payload.image_url || null,
                timestamp: payload.timestamp || Date.now(),
              });
              await markMessageSynced(item.entity_id);
            }
            break;
          }

          case 'flashcard': {
            const userId = payload.user_id || this.currentUserId;
            if (!userId) break;
            const fcRef = dbRef(db, `users/${userId}/flashcards/${item.entity_id}`);
            if (item.action === 'delete') {
              await remove(fcRef);
            } else {
              await set(fcRef, payload);
            }
            break;
          }

          case 'history': {
            const userId = payload.user_id || this.currentUserId;
            if (!userId) break;
            const histRef = dbRef(db, `users/${userId}/history/${item.entity_id}`);
            if (item.action === 'delete') {
              await remove(histRef);
            } else {
              await set(histRef, payload);
            }
            break;
          }

          case 'app_state': {
            const userId = payload.userId || this.currentUserId;
            if (userId) {
              await set(dbRef(db, `user_cache/${userId}/${payload.key}`), {
                category: payload.category,
                payload: payload.payload,
                updated_at: Date.now()
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
   * Pull latest conversations, exams, and history from Firebase and merge into local SQLite.
   */
  private async pullDownstreamChanges(userId: string): Promise<void> {
    try {
      const conversationsRef = dbRef(db, `chat_conversations/${userId}`);
      const snapshot = await get(conversationsRef);

      if (snapshot.exists()) {
        const val = snapshot.val() || {};
        const remoteConversations: LocalConversation[] = [];

        Object.keys(val).forEach((key) => {
          const item = val[key];
          if (item) {
            remoteConversations.push({
              id: key,
              user_id: userId,
              title: item.title || 'New Chat',
              created_at: Number(item.created_at || Date.now()),
              last_updated_at: Number(item.last_updated_at || item.created_at || Date.now()),
              sync_status: 'synced',
              is_deleted: 0,
            });
          }
        });

        if (remoteConversations.length > 0) {
          await bulkUpsertRemoteConversations(remoteConversations);
        }
      }

      // Pull remote exams into SQLite
      const examRef = dbRef(db, `exam_history/${userId}`);
      const examSnap = await get(examRef);
      if (examSnap.exists()) {
        const examVal = examSnap.val() || {};
        const { bulkUpsertRemoteExams } = await import('./examStorageService');
        const remoteExams = Object.keys(examVal).map(k => ({
          ...examVal[k],
          id: k
        }));
        await bulkUpsertRemoteExams(userId, remoteExams);
      }

      // Pull remote history into SQLite
      const histRef = dbRef(db, `users/${userId}/history`);
      const histSnap = await get(histRef);
      if (histSnap.exists()) {
        const histVal = histSnap.val() || {};
        const { bulkUpsertRemoteMaterials } = await import('./materialStorageService');
        const remoteMaterials = Object.keys(histVal).map(k => ({
          ...histVal[k],
          id: k
        }));
        await bulkUpsertRemoteMaterials(userId, remoteMaterials);
      }
    } catch (err) {
      console.warn('[CloudSync] Failed to pull downstream changes from Firebase:', err);
    }
  }

  /**
   * Pull messages for a specific conversation on-demand from Firebase and save to SQLite.
   */
  public async pullMessagesForConversation(conversationId: string, userId: string): Promise<void> {
    if (!conversationId || !this.isOnline()) return;

    try {
      const messagesRef = dbRef(db, `chat_messages/${conversationId}`);
      const snapshot = await get(messagesRef);

      if (snapshot.exists()) {
        const val = snapshot.val() || {};
        const remoteMessages: LocalMessage[] = [];

        Object.keys(val).forEach((key) => {
          const item = val[key];
          if (item) {
            remoteMessages.push({
              id: key,
              conversation_id: conversationId,
              user_id: userId,
              sender: item.sender || 'user',
              text: item.text || '',
              attachments_json: item.attachments ? JSON.stringify(item.attachments) : null,
              image_url: item.image_url || null,
              timestamp: Number(item.timestamp || Date.now()),
              sync_status: 'synced',
              is_deleted: 0,
            });
          }
        });

        if (remoteMessages.length > 0) {
          await bulkUpsertRemoteMessages(remoteMessages);
        }
      }
    } catch (err) {
      console.warn(`[CloudSync] Failed to pull messages for conversation ${conversationId}:`, err);
    }
  }
}

export const cloudSyncEngine = new CloudSyncEngine();
