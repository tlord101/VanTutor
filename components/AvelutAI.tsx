import React from 'react';
import type { UserProfile } from '../types';
import { Chat } from './Chat';

interface AvelutAIProps {
  userProfile: UserProfile;
  onNavigate?: (tab: string) => void;
  setCustomHeaderConfig?: (config: any) => void;
  unreadMessagesCount?: number;
}

/** Avelut AI chat shell — uses unified Chat component */
export default function AvelutAI({ userProfile, onNavigate, setCustomHeaderConfig, unreadMessagesCount = 0 }: AvelutAIProps) {
  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-white dark:bg-black">
      <Chat userProfile={userProfile} />
    </div>
  );
}
