import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLocalConversations,
  getLocalMessages,
  saveLocalMessage,
  saveLocalConversation,
  renameLocalConversation,
  deleteLocalConversation,
  generateLocalId,
  LocalConversation,
  LocalMessage
} from '../services/chatStorageService';
import { cloudSyncEngine } from '../services/cloudSyncService';

export interface UseChatStorageProps {
  userId: string;
  activeConversationId?: string | null;
}

export function useChatStorage({ userId, activeConversationId }: UseChatStorageProps) {
  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState<boolean>(true);
  const activeConvoRef = useRef<string | null>(activeConversationId || null);

  useEffect(() => {
    activeConvoRef.current = activeConversationId || null;
  }, [activeConversationId]);

  // Load conversations from local SQLite
  const loadConversations = useCallback(async () => {
    if (!userId) {
      setConversations([]);
      setIsLocalLoading(false);
      return;
    }

    try {
      const localConvos = await getLocalConversations(userId);
      setConversations(localConvos);
    } catch (err) {
      console.warn('[useChatStorage] Failed to load local conversations:', err);
    } finally {
      setIsLocalLoading(false);
    }
  }, [userId]);

  // Load messages for the active conversation from local SQLite
  const loadMessages = useCallback(async (convoId?: string | null) => {
    const targetId = convoId ?? activeConvoRef.current;
    if (!targetId) {
      setMessages([]);
      return;
    }

    try {
      const localMsgs = await getLocalMessages(targetId);
      setMessages(localMsgs);

      // Trigger asynchronous remote pull in background without blocking local UI
      if (userId) {
        cloudSyncEngine.pullMessagesForConversation(targetId, userId).then(async () => {
          if (activeConvoRef.current === targetId) {
            const updated = await getLocalMessages(targetId);
            setMessages(updated);
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.warn(`[useChatStorage] Failed to load local messages for ${targetId}:`, err);
    }
  }, [userId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  /**
   * Save a message locally with zero network latency and queue background sync.
   */
  const sendMessageLocally = useCallback(
    async (params: {
      convoId: string;
      text: string;
      sender: 'user' | 'assistant' | 'system';
      attachments?: any[] | null;
      imageUrl?: string | null;
      id?: string;
    }) => {
      const messageId = params.id || generateLocalId('msg');
      const timestamp = Date.now();

      const newMsg: LocalMessage = {
        id: messageId,
        conversation_id: params.convoId,
        user_id: userId,
        sender: params.sender,
        text: params.text,
        attachments_json: params.attachments ? JSON.stringify(params.attachments) : null,
        image_url: params.imageUrl || null,
        timestamp,
        sync_status: 'pending',
        is_deleted: 0
      };

      // 1. Optimistic UI update (0ms)
      setMessages(prev => {
        const existingIdx = prev.findIndex(m => m.id === messageId);
        if (existingIdx >= 0) {
          const clone = [...prev];
          clone[existingIdx] = newMsg;
          return clone;
        }
        return [...prev, newMsg];
      });

      // 2. Instant SQLite write & background sync enqueue
      await saveLocalMessage({
        id: messageId,
        conversation_id: params.convoId,
        user_id: userId,
        sender: params.sender,
        text: params.text,
        attachments_json: newMsg.attachments_json,
        image_url: newMsg.image_url,
        timestamp
      });

      // 3. Update conversation last_updated_at in local list
      setConversations(prev => {
        const updated = prev.map(c =>
          c.id === params.convoId ? { ...c, last_updated_at: timestamp } : c
        );
        return updated.sort((a, b) => b.last_updated_at - a.last_updated_at);
      });

      // 4. Trigger cloud sync asynchronously
      void cloudSyncEngine.triggerSync();

      return messageId;
    },
    [userId]
  );

  /**
   * Create a new conversation locally with zero latency.
   */
  const createNewConversationLocally = useCallback(
    async (title: string = 'New Chat') => {
      const convoId = generateLocalId('conv');
      const now = Date.now();

      const newConvo: LocalConversation = {
        id: convoId,
        user_id: userId,
        title,
        created_at: now,
        last_updated_at: now,
        sync_status: 'pending',
        is_deleted: 0
      };

      // Optimistic UI update
      setConversations(prev => [newConvo, ...prev]);

      // Write to SQLite & queue
      await saveLocalConversation({
        id: convoId,
        user_id: userId,
        title,
        created_at: now,
        last_updated_at: now
      });

      void cloudSyncEngine.triggerSync();
      return convoId;
    },
    [userId]
  );

  /**
   * Rename a conversation locally and queue sync.
   */
  const renameConversationLocally = useCallback(
    async (convoId: string, newTitle: string) => {
      setConversations(prev =>
        prev.map(c => (c.id === convoId ? { ...c, title: newTitle, last_updated_at: Date.now() } : c))
      );

      await renameLocalConversation(convoId, newTitle, userId);
      void cloudSyncEngine.triggerSync();
    },
    [userId]
  );

  /**
   * Delete a conversation locally and queue sync.
   */
  const deleteConversationLocally = useCallback(
    async (convoId: string) => {
      setConversations(prev => prev.filter(c => c.id !== convoId));
      if (activeConvoRef.current === convoId) {
        setMessages([]);
      }

      await deleteLocalConversation(convoId, userId);
      void cloudSyncEngine.triggerSync();
    },
    [userId]
  );

  return {
    conversations,
    messages,
    isLocalLoading,
    sendMessageLocally,
    createNewConversationLocally,
    renameConversationLocally,
    deleteConversationLocally,
    reloadConversations: loadConversations,
    reloadMessages: loadMessages,
  };
}
