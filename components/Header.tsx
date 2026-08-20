import React, { useState, useRef, useEffect } from 'react';
import { NotificationBellIcon } from './icons/NotificationBellIcon';
import { MenuIcon } from './icons/MenuIcon';
import { MessengerIcon } from './icons/MessengerIcon';
import { Avatar } from './Avatar';
import { AppUpdateBadge } from './AppUpdateBadge';
import type { UserProfile } from '../types';
import { Browser } from '@capacitor/browser';
import { isNative } from '../utils/capacitorUtils';

interface HeaderProps {
  currentPageLabel: string;
  onNotificationsClick?: () => void;
  unreadCount?: number;
  onMenuClick: () => void;
  onMessengerClick?: () => void;
  onCalendarClick?: () => void;
  unreadMessagesCount?: number;
  rightActions?: React.ReactNode;
  leftActions?: React.ReactNode;
  userProfile?: UserProfile;
  className?: string;
  onNavigate?: (route: string) => void;
  onLogoutClick?: () => void;
  hideTitle?: boolean;
  hideDefaultRightActions?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
    currentPageLabel, 
    onNotificationsClick, 
    unreadCount = 0, 
    onMenuClick, 
    onMessengerClick, 
    onCalendarClick,
    unreadMessagesCount = 0,
    rightActions,
    leftActions,
    userProfile,
    className,
    onNavigate,
    onLogoutClick,
    hideTitle,
    hideDefaultRightActions
}) => {
    const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsAvatarMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNavigation = (route: string) => {
        setIsAvatarMenuOpen(false);
        if (onNavigate) {
            onNavigate(route);
        }
    };

    return (
        <header className={`sticky top-0 z-50 flex-shrink-0 flex items-center justify-between px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 border-b border-slate-200/80 dark:border-slate-800/80 ${className || 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-md'}`}>
            <div className="flex items-center min-w-0 flex-1 mr-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {leftActions && <div className="flex items-center min-w-0 flex-1">{leftActions}</div>}
                    {!hideTitle && (
                        <>
                            <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase truncate">
                                {currentPageLabel}
                            </h2>
                            {userProfile?.use_personal_token && userProfile?.personal_api_key && (
                                <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-black tracking-widest uppercase rounded-full border border-amber-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    AI Token Active
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {!hideDefaultRightActions && <AppUpdateBadge />}
                {rightActions ? rightActions : (!hideDefaultRightActions && (
                    <>
                        <button 
                            onClick={onCalendarClick}
                            className="relative text-slate-600 dark:text-slate-300 hover:text-amber-500 dark:hover:text-amber-400 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                            aria-label="Study Timetable"
                            title="Study Timetable"
                        >
                            <i className="bi bi-calendar3 text-lg"></i>
                        </button>
                        <button 
                            onClick={onMessengerClick}
                            data-tour-id="header-messenger"
                            className="relative text-slate-600 dark:text-slate-300 hover:text-amber-500 dark:hover:text-amber-400 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                            aria-label={`Messenger (${unreadMessagesCount} unread)`}
                        >
                            <i className="bi bi-chat-dots text-lg"></i>
                            {unreadMessagesCount > 0 && (
                                <div className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-4 text-slate-950 shadow-xs flex items-center justify-center">
                                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                                </div>
                            )}
                        </button>
                        <button 
                            onClick={onNotificationsClick}
                            className="relative text-slate-600 dark:text-slate-300 hover:text-amber-500 dark:hover:text-amber-400 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                            aria-label={`Notifications (${unreadCount} unread)`}
                        >
                            <i className="bi bi-bell text-lg"></i>
                            {unreadCount > 0 && (
                                <div className="absolute top-1.5 right-1.5">
                                    <span className="flex h-2 w-2 rounded-full bg-amber-500" />
                                </div>
                            )}
                        </button>
                    </>
                ))}
                
                {/* Profile Avatar always shows */}
                <div className="relative ml-2" ref={menuRef}>
                    <button
                                onClick={() => setIsAvatarMenuOpen(!isAvatarMenuOpen)}
                                className="focus:outline-none transition-transform active:scale-95"
                            >
                                <Avatar 
                                    display_name={userProfile?.display_name || null} 
                                    photo_url={userProfile?.photo_url} 
                                    className="w-10 h-10 border-2 border-white shadow-sm ring-1 ring-slate-200" 
                                />
                            </button>

                            {isAvatarMenuOpen && (
                                <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-black dark:bg-card rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-gray-800 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                                    <div className="px-4 py-3 border-b border-slate-50 dark:border-gray-800 mb-2">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{userProfile?.display_name || 'User'}</p>
                                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-gray-400 uppercase tracking-widest">{userProfile?.level || 'New'} Level</p>
                                    </div>
                                    <button
                                        onClick={() => handleNavigation('user_profile')}
                                        className="w-full text-left px-4 py-2 text-sm font-semibold text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:bg-black dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    >
                                        User Profile
                                    </button>
                                    <button
                                        onClick={() => handleNavigation('billing')}
                                        className="w-full text-left px-4 py-2 text-sm font-semibold text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:bg-black dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    >
                                        Billing & Subscriptions
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsAvatarMenuOpen(false);
                                            const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
                                            const plansUrl = `${baseUrl}/plans?uid=${userProfile?.uid || ''}&plan=premium`;
                                            if (isNative()) {
                                                window.open(plansUrl, '_system');
                                            } else {
                                                window.open(plansUrl, '_blank');
                                            }
                                        }}
                                        className="w-full flex items-center justify-between text-left px-4 py-2 text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                        <span>Upgrade to Pro</span>
                                        <span className="flex h-2 w-2 rounded-full bg-blue-600"></span>
                                    </button>
                                    <button
                                        onClick={() => handleNavigation('settings')}
                                        className="w-full text-left px-4 py-2 text-sm font-semibold text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:bg-black dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    >
                                        Account Settings
                                    </button>
                                    <button
                                        onClick={() => handleNavigation('help')}
                                        className="w-full text-left px-4 py-2 text-sm font-semibold text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:bg-black dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    >
                                        Help & Support
                                    </button>
                                    <div className="border-t border-slate-50 my-2"></div>
                                    <button
                                        onClick={() => {
                                            setIsAvatarMenuOpen(false);
                                            if (onLogoutClick) onLogoutClick();
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        Log Out
                                    </button>
                                </div>
                            )}
                        </div>
                {/* End of Avatar */}
            </div>
        </header>
    );
};