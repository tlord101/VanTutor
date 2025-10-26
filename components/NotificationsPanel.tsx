import React from 'react';
import type { Notification } from '../types';
import { StudyGuideIcon } from './icons/StudyGuideIcon';
import { LeaderboardIcon } from './icons/LeaderboardIcon';
import { ExamIcon } from './icons/ExamIcon';
import { LogoIcon } from './icons/LogoIcon';
import { NotificationBellIcon } from './icons/NotificationBellIcon';

const timeAgo = (timestamp: number): string => {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const NotificationTypeIcon: React.FC<{ type: Notification['type'], className?: string }> = ({ type, className = "w-6 h-6" }) => {
    switch (type) {
        case 'welcome':
            return <LogoIcon className={className} />;
        case 'study_update':
            return <StudyGuideIcon className={className} />;
        case 'leaderboard_change':
            return <LeaderboardIcon className={className} />;
        case 'exam_reminder':
            return <ExamIcon className={className} />;
        default:
            return <NotificationBellIcon className={className} />;
    }
};

interface NotificationsPanelProps {
  notifications: Notification[];
  isOpen: boolean;
  onClose: () => void;
  onMarkAllAsRead: () => void;
  onMarkAsRead: (id: string) => void;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ notifications, isOpen, onClose, onMarkAllAsRead, onMarkAsRead }) => {
    if (!isOpen) return null;

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true">
            <div className="absolute inset-0 bg-black/30"></div>
            <div
                className="absolute top-20 right-4 md:right-6 lg:right-8 w-full max-w-sm bg-gray-800/80 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl"
                onClick={e => e.stopPropagation()} // Prevent clicks inside from closing the panel
            >
                <div className="p-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="font-bold text-white text-lg">Notifications</h3>
                    {unreadCount > 0 && (
                        <button onClick={onMarkAllAsRead} className="text-sm text-lime-400 hover:text-lime-300 font-semibold">
                            Mark all as read
                        </button>
                    )}
                </div>
                <div className="max-h-[60vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {notifications.length > 0 ? (
                        <ul>
                            {notifications.map(notification => (
                                <li key={notification.id} className="border-b border-white/5 last:border-b-0">
                                    <button 
                                        onClick={() => onMarkAsRead(notification.id)}
                                        className="w-full text-left flex items-start gap-4 p-4 hover:bg-white/5 transition-colors"
                                    >
                                        {!notification.isRead && (
                                            <div className="w-2 h-2 rounded-full bg-lime-400 flex-shrink-0 mt-2" aria-label="Unread"></div>
                                        )}
                                        <div className={`text-gray-400 flex-shrink-0 ${notification.isRead ? 'ml-4' : ''}`}>
                                           <NotificationTypeIcon type={notification.type} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-white">{notification.title}</p>
                                            <p className="text-sm text-gray-300">{notification.message}</p>
                                            <p className="text-xs text-gray-500 mt-1">{timeAgo(notification.timestamp)}</p>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center p-8 text-gray-400">
                            <NotificationBellIcon className="w-12 h-12 mx-auto mb-2 text-gray-600" />
                            <p>No notifications yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};