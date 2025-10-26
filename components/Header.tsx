import React from 'react';
import { MenuIcon } from './icons/MenuIcon';
import { NotificationBellIcon } from './icons/NotificationBellIcon';

interface HeaderProps {
  currentPageLabel: string;
  onMenuClick: () => void;
  onNotificationsClick: () => void;
  unreadCount: number;
}

export const Header: React.FC<HeaderProps> = ({ currentPageLabel, onMenuClick, onNotificationsClick, unreadCount }) => {
    return (
        <header className="flex-shrink-0 flex items-center justify-between pb-6">
            {/* Left side: Menu button for mobile and Page Title for desktop */}
            <div className="flex items-center">
                <button
                    onClick={onMenuClick}
                    className="md:hidden text-gray-400 hover:text-white mr-4"
                    aria-label="Open menu"
                >
                    <MenuIcon />
                </button>
                <h2 className="hidden md:block text-3xl font-bold text-white">
                    {currentPageLabel}
                </h2>
                 {/* Page title for mobile, since it's not shown next to the menu icon */}
                <h2 className="md:hidden text-2xl font-bold text-white">
                    {currentPageLabel}
                </h2>
            </div>

            {/* Right side: Notification Bell */}
            <div className="flex items-center">
                <button 
                    onClick={onNotificationsClick}
                    className="relative text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10"
                    aria-label={`Notifications (${unreadCount} unread)`}
                >
                    <NotificationBellIcon />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 block h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500 border-2 border-gray-800"></span>
                        </span>
                    )}
                </button>
            </div>
        </header>
    );
};