import React, { useState, useEffect, useRef } from 'react';
import type { UserProfile, ChatConversation } from '../types';
import { Chat } from './Chat';
import { db, ref as dbRef, onValue, off } from '../firebase';
import { getLocalConversations } from '../services/chatStorageService';

interface AvelutAIProps {
  userProfile: UserProfile;
  onNavigate?: (tab: string) => void;
  setCustomHeaderConfig?: (config: any) => void;
  unreadMessagesCount?: number;
  onConversationsUpdate?: (conversations: ChatConversation[]) => void;
  onOpenMenu?: () => void;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string | null) => void;
}

/** Avelut AI chat shell — uses unified Grok-style Chat component */
export default function AvelutAI({
  userProfile,
  onNavigate,
  setCustomHeaderConfig,
  unreadMessagesCount = 0,
  onConversationsUpdate,
  onOpenMenu,
  activeConversationId,
  onSelectConversation,
}: AvelutAIProps) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipeTriggeredRef = useRef(false);

  useEffect(() => {
    if (!userProfile?.uid || !onConversationsUpdate) return;
    let isMounted = true;

    getLocalConversations(userProfile.uid).then((local) => {
      if (isMounted && local.length > 0) {
        onConversationsUpdate(
          local.map((c) => ({
            id: c.id,
            user_id: c.user_id || userProfile.uid,
            title: c.title || 'New Chat',
            created_at: c.created_at || 0,
            last_updated_at: c.last_updated_at || c.created_at || 0,
          }))
        );
      }
    }).catch(() => {});

    const conversationsRef = dbRef(db, `chat_conversations/${userProfile.uid}`);
    const unsubscribe = onValue(conversationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data: any[] = [];
        snapshot.forEach((child) => {
          const val = child.val() || {};
          data.push({ id: child.key, user_id: val.user_id || userProfile.uid, ...val });
        });
        const sorted = data.sort((a, b) => b.last_updated_at - a.last_updated_at);
        if (isMounted) onConversationsUpdate(sorted as ChatConversation[]);
      } else {
        if (isMounted) onConversationsUpdate([]);
      }
    });

    return () => {
      isMounted = false;
      off(conversationsRef);
    };
  }, [userProfile?.uid, onConversationsUpdate]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    // Don't trigger if user is interacting with text inputs or textareas
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      touchStartRef.current = null;
      return;
    }
    swipeTriggeredRef.current = false;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || swipeTriggeredRef.current || !onOpenMenu) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartRef.current.x;
    const diffY = currentY - touchStartRef.current.y;

    // Must be moving rightwards with horizontal movement significantly greater than vertical movement
    if (diffX > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.25) {
      swipeTriggeredRef.current = true;
      touchStartRef.current = null;
      onOpenMenu();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || swipeTriggeredRef.current || !onOpenMenu) {
      touchStartRef.current = null;
      return;
    }
    const currentX = e.changedTouches[0].clientX;
    const currentY = e.changedTouches[0].clientY;
    const diffX = currentX - touchStartRef.current.x;
    const diffY = currentY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;

    // Quick swipe flick to the right
    if (diffX >= 40 && Math.abs(diffX) > Math.abs(diffY) * 1.25 && elapsed < 350) {
      swipeTriggeredRef.current = true;
      onOpenMenu();
    }
    touchStartRef.current = null;
  };

  return (
    <div 
      className="flex-1 flex flex-col h-full w-full overflow-hidden bg-white dark:bg-[#121212]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Chat
        userProfile={userProfile}
        onNavigate={onNavigate}
        onOpenMenu={onOpenMenu}
        setCustomHeaderConfig={setCustomHeaderConfig}
        activeConversationId={activeConversationId}
        onSelectConversation={onSelectConversation}
      />
    </div>
  );
}
