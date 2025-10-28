import React, { useState, useEffect, useRef } from 'react';
import type { ChatConversation } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { MoreVerticalIcon } from './icons/MoreVerticalIcon';
import { PencilIcon } from './icons/PencilIcon';

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
  onRenameConversation: (id: string, newTitle: string) => void;
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
  onRenameConversation,
  onClearAll,
  isDeleting,
  isMobilePanelOpen,
  onCloseMobilePanel,
}) => {
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, convoId: string } | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const longPressTimer = useRef<number>();

    const openContextMenu = (e: React.MouseEvent | React.TouchEvent, convoId: string) => {
        e.preventDefault();
        const touch = 'touches' in e ? e.touches[0] : null;
        setContextMenu({
            x: touch ? touch.clientX : e.clientX,
            y: touch ? touch.clientY : e.clientY,
            convoId,
        });
    };

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        if (contextMenu) {
            window.addEventListener('click', handleClickOutside);
            window.addEventListener('contextmenu', handleClickOutside, true); // Capture phase
        }
        return () => {
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('contextmenu', handleClickOutside, true);
        };
    }, [contextMenu]);
    
    const handleTouchStart = (e: React.TouchEvent, convoId: string) => {
        longPressTimer.current = window.setTimeout(() => {
            openContextMenu(e, convoId);
        }, 500); // 500ms for long press
    };

    const handleTouchEnd = () => {
        clearTimeout(longPressTimer.current);
    };

    const startRename = (convo: ChatConversation) => {
        setRenamingId(convo.id);
        setRenameValue(convo.title);
        setContextMenu(null);
    };

    const handleRenameSubmit = () => {
        if (renamingId && renameValue.trim()) {
            onRenameConversation(renamingId, renameValue);
        }
        setRenamingId(null);
    };

    const handleMobileSelect = (id: string) => {
        if (renamingId !== id) {
            onSelectConversation(id);
            onCloseMobilePanel();
        }
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
                {renamingId === convo.id ? (
                    <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSubmit();
                            if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        className="w-full text-left p-2.5 rounded-md bg-white border-2 border-lime-500 text-gray-800"
                    />
                ) : (
                    <div
                        onClick={() => isMobile ? handleMobileSelect(convo.id) : onSelectConversation(convo.id)}
                        onContextMenu={(e) => openContextMenu(e, convo.id)}
                        onTouchStart={(e) => handleTouchStart(e, convo.id)}
                        onTouchEnd={handleTouchEnd}
                        className={`w-full text-left p-2.5 rounded-md transition-colors cursor-pointer flex justify-between items-center ${
                          activeConversationId === convo.id
                            ? 'bg-lime-200 text-lime-900'
                            : 'text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                      <div className="flex-1 overflow-hidden">
                          <p className={`truncate ${activeConversationId === convo.id ? 'font-semibold' : ''}`}>{convo.title}</p>
                          <p className={`text-xs ${activeConversationId === convo.id ? 'text-lime-700' : 'text-gray-500'}`}>
                              {timeAgo(convo.lastUpdatedAt)}
                          </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openContextMenu(e, convo.id); }}
                        className="p-1 text-gray-400 hover:text-gray-700 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity md:opacity-100"
                        aria-label="More options"
                      >
                        <MoreVerticalIcon className="w-4 h-4" />
                      </button>
                    </div>
                )}
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
      {contextMenu && (
          <div
              style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
              className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 z-50 animate-fade-in-up"
              onClick={(e) => e.stopPropagation()}
          >
              <ul className="py-1">
                  <li>
                      <button 
                        onClick={() => startRename(conversations.find(c => c.id === contextMenu.convoId)!)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <PencilIcon className="w-4 h-4" /> Rename
                      </button>
                  </li>
                  <li>
                      <button 
                        onClick={() => { onDeleteConversation(contextMenu.convoId); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <TrashIcon className="w-4 h-4" /> Delete
                      </button>
                  </li>
              </ul>
          </div>
      )}
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