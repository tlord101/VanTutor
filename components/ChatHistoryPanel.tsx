import React from 'react';
import type { ChatConversation } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';

const timeAgo = (timestamp: number): string => {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days/7);
  return `${weeks}w ago`;
};


interface ChatHistoryPanelProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onClearAll: () => void;
  isDeleting: boolean;
  isMobilePanelOpen: boolean;
  onCloseMobilePanel: () => void;
}

export const ChatHistoryPanel: React.FC<ChatHistoryPanelProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onClearAll,
  isDeleting,
  isMobilePanelOpen,
  onCloseMobilePanel,
}) => {

  const handleMobileSelect = (id: string) => {
    onSelectConversation(id);
    onCloseMobilePanel();
  };

  const handleMobileNewChat = () => {
    onNewChat();
    onCloseMobilePanel();
  };

  const content = (isMobile: boolean) => (
    <div className="h-full bg-gray-50 flex flex-col p-3">
      <button
        onClick={isMobile ? handleMobileNewChat : onNewChat}
        className="w-full flex items-center justify-center gap-2 p-3 mb-4 rounded-lg bg-lime-600 text-white font-semibold hover:bg-lime-700 transition-colors"
      >
        <PlusIcon />
        New Chat
      </button>
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-1 -mr-1">
        <ul className="space-y-1">
          {conversations.map((convo) => (
            <li key={convo.id} className="relative group">
              <button
                onClick={() => isMobile ? handleMobileSelect(convo.id) : onSelectConversation(convo.id)}
                className={`w-full text-left p-2.5 rounded-md transition-colors ${
                  activeConversationId === convo.id
                    ? 'bg-lime-200 text-lime-900'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="flex justify-between items-start">
                    <span className={`flex-1 truncate pr-2 ${activeConversationId === convo.id ? 'font-semibold' : ''}`}>{convo.title}</span>
                    <span className={`text-xs flex-shrink-0 ${activeConversationId === convo.id ? 'text-lime-700' : 'text-gray-500'}`}>
                        {timeAgo(convo.lastUpdatedAt)}
                    </span>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteConversation(convo.id); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-600 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label="Delete conversation"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-shrink-0 pt-3 border-t border-gray-200">
        <button
          onClick={onClearAll}
          disabled={isDeleting || conversations.length === 0}
          className="w-full text-sm text-center text-gray-500 hover:text-red-600 disabled:opacity-50 transition-colors"
        >
          Clear all history
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Panel */}
      <aside className="hidden md:block w-72 flex-shrink-0 border-r border-gray-200">
        {content(false)}
      </aside>
      
      {/* Mobile Panel */}
      <div className={`fixed inset-0 z-40 transform transition-transform duration-300 ease-in-out md:hidden ${isMobilePanelOpen ? 'translate-x-0' : '-translate-x-full'}`} >
          <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm" onClick={onCloseMobilePanel} aria-hidden="true" ></div>
          <div className="relative w-72 h-full border-r border-gray-200">
              {content(true)}
          </div>
      </div>
    </>
  );
};