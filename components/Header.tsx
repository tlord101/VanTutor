import React from 'react';
import { NotificationBellIcon } from './icons/NotificationBellIcon';
import { MenuIcon } from './icons/MenuIcon';
import { MessengerIcon } from './icons/MessengerIcon';

interface HeaderProps {
  currentPageLabel: string;
  onNotificationsClick: () => void;
  unreadCount: number;
  onMenuClick: () => void;
  onMessengerClick: () => void;
  unreadMessagesCount: number;
}

export const Header: React.FC<HeaderProps> = ({ currentPageLabel, onNotificationsClick, unreadCount, onMenuClick, onMessengerClick, unreadMessagesCount }) => {
    return (
        <header className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 md:pt-8 pb-6">
            <div className="flex items-center">
                <button
                  onClick={onMenuClick}
                  className="md:hidden mr-4 w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                  aria-label="Open menu"
                >
                  <MenuIcon />
                </button>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                    {currentPageLabel}
                </h2>
            </div>

            <div className="flex items-center gap-2">
                <button 
                    onClick={onMessengerClick}
                    className="relative text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100"
                    aria-label={`Messenger (${unreadMessagesCount} unread)`}
                >
                    <MessengerIcon />
                    {unreadMessagesCount > 0 && (
                        <span className="absolute top-1 right-1 block h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500 border-2 border-white"></span>
                        </span>
                    )}
                </button>
                <button 
                    onClick={onNotificationsClick}
                    className="relative text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100"
                    aria-label={`Notifications (${unreadCount} unread)`}
                >
                    <NotificationBellIcon />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 block h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500 border-2 border-white"></span>
                        </span>
                    )}
                </button>
            </div>
        </header>
    );
};