import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from 'react';
import { readCachedJson, writeCachedJson } from './utils/cache';
import { GoogleGenAI, Type } from '@google/genai'; 
import { auth as firebaseAuth, firebaseSignOut, db, onAuthStateChanged, updateProfile, type FirebaseUser } from './firebase';
import { ref as dbRef, onValue, off, set, push, update, onDisconnect, serverTimestamp, get } from 'firebase/database';
import { DEFAULT_USAGE_SETTINGS } from './utils/appSettings';
import type { UserProfile, UserProgress, DashboardData, Notification as NotificationType, ExamHistoryItem, Course, DashboardAssessment, HeaderConfig } from './types';
import { awardDailyStreak } from './utils/streaks';
import { Login } from './components/Login';
import { SignUp } from './components/SignUp'; 
import { AdminLogin } from './components/AdminLogin';
import { UploadCenter } from './components/UploadCenter';
import { Onboarding } from './components/Onboarding';

import { createAvelutAI } from './utils/inference';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App as CapacitorApp } from '@capacitor/app';


const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const LandingPage = lazy(() => import('./components/LandingPage').then(m => ({ default: m.LandingPage })));
const AboutUsPage = lazy(() => import('./components/marketing/AboutUsPage').then(m => ({ default: m.AboutUsPage })));
const ContactUsPage = lazy(() => import('./components/marketing/ContactUsPage').then(m => ({ default: m.ContactUsPage })));
const FounderPage = lazy(() => import('./components/marketing/FounderPage').then(m => ({ default: m.FounderPage })));
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NativePullToRefresh } from './components/NativePullToRefresh';
import { MainContent } from './MainContent';
import { CalendarModal } from './components/CalendarModal';

import { BottomNavBar } from './components/BottomNavBar';
import { useToast } from './hooks/useToast';
import { useApiLimiter } from './hooks/useApiLimiter';
import { useAppSettings } from './hooks/useAppSettings';
import { useGlobalRefresh } from './hooks/useGlobalRefresh';
import { navigationItems, adminNavigationItems } from './constants';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import GuidedTour, { TourStep } from './components/GuidedTour';
import { getWindowPathname } from './utils/pathname';
import ErrorBoundary from './components/ErrorBoundary';
import { MenuIcon } from './components/icons/MenuIcon';
import { ComingSoonScreen } from './components/ComingSoonScreen';
import { SharedChatView } from './components/SharedChatView';
import TermsAndConditions from './components/TermsAndConditions';
import PrivacyPolicy from './components/PrivacyPolicy';
import { initNativeNotifications, cleanupNativeNotifications } from './utils/nativeNotifications';
import { InAppUpdate } from './components/InAppUpdate';
import { Skeleton, PageSkeleton } from './components/Skeleton';

declare var __app_id: string;

const AppLoader: React.FC = () => {
  return (
    <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden animate-pulse">
        {/* Fake Sidebar */}
        <div className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col p-4">
            <div className="flex items-center gap-3 mb-8 px-2">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <Skeleton className="h-6 w-24" />
            </div>
            <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
            </div>
        </div>
        
        {/* Fake Main Content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Fake Header */}
            <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            
            {/* Fake Page */}
            <div className="flex-1 p-6 overflow-hidden">
                <PageSkeleton />
            </div>
        </div>
    </div>
  );
};

// =========================================================================
// HIGH ACCURACY PWA AUTO-INSTALL HOOK & INTERFACE COMPONENT
// =========================================================================
const usePWAInstallEngine = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Check if application environment is running standalone already
        const isAppStandalone = window.matchMedia('(display-mode: standalone)').matches 
            || (window.navigator as any).standalone === true;
        setIsStandalone(isAppStandalone);

        // Track Apple hardware environment profiles
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isAppleDevice);

        const handlePromptCapture = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handlePromptCapture);
        return () => window.removeEventListener('beforeinstallprompt', handlePromptCapture);
    }, []);

    const executeInstallationPipeline = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
    };

    return { deferredPrompt, isIOS, isStandalone, executeInstallationPipeline };
};

const PWAInstallBannerOverlay: React.FC = () => {
    const { deferredPrompt, isIOS, isStandalone, executeInstallationPipeline } = usePWAInstallEngine();
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('pwa_install_dismissed') === 'true';
        }
        return false;
    });
    const canTriggerNativeInstall = !!deferredPrompt;

    useEffect(() => {
        if (dismissed && typeof window !== 'undefined') {
            localStorage.setItem('pwa_install_dismissed', 'true');
        }
    }, [dismissed]);

    if (Capacitor.isNativePlatform() || isStandalone || dismissed) return null;

    return (
        <div className="fixed inset-0 z-[99998] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label="Add AVELUT to Home Screen">
            <div className="relative w-full max-w-sm overflow-hidden rounded-[32px] border border-neutral-100 bg-white shadow-2xl p-6 md:p-8 text-center animate-scale-in">
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 transition-colors"
                    aria-label="Close"
                >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>

                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-neutral-50 mb-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-neutral-100">
                    <img src="/logo_icon.png" alt="AVELUT" className="h-12 w-12 object-contain drop-shadow-sm" />
                </div>
                
                <h2 className="text-2xl font-black tracking-tight text-neutral-900 mb-2">
                    Add to Home Screen
                </h2>
                
                <p className="text-[15px] leading-relaxed text-neutral-600 mb-6 font-medium">
                    Install AVELUT directly on your mobile phone for instant access. <span className="text-brand-600 font-bold">No Google Play Store needed!</span>
                </p>

                {canTriggerNativeInstall ? (
                    <button
                        type="button"
                        onClick={() => executeInstallationPipeline()}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009EE2] hover:bg-[#0070B8] py-4 text-[14px] font-black uppercase tracking-wider text-white shadow-lg shadow-[#009EE2]/30 transition active:scale-95"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
                        </svg>
                        Add to Home Screen
                    </button>
                ) : isIOS ? (
                    <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-100 text-left space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-neutral-200 text-[#007AFF]">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-neutral-700">1. Tap the <strong className="text-neutral-900">Share</strong> button at the bottom of your screen.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-neutral-200 text-neutral-800">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-neutral-700">2. Scroll down and select <strong className="text-neutral-900">Add to Home Screen</strong>.</p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-neutral-50 rounded-2xl p-5 border border-neutral-100 text-left space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-neutral-200 text-neutral-800">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <circle cx="12" cy="5" r="1.5"></circle>
                                    <circle cx="12" cy="12" r="1.5"></circle>
                                    <circle cx="12" cy="19" r="1.5"></circle>
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-neutral-700">1. Tap the <strong className="text-neutral-900">Browser Menu</strong> (three dots) at the top right.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-neutral-200 text-neutral-800">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-neutral-700">2. Select <strong className="text-neutral-900">Install app</strong> or <strong className="text-neutral-900">Add to Home screen</strong>.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ==========================================
// UTILITY ROUTING PROTOCOLS
// ==========================================
const normalizeRouteSegment = (segment: string): string => (segment || '').toLowerCase().replace(/-/g, '_');

const ALLOWED_ROUTE_ITEMS = new Set([
    'dashboard',
    ...navigationItems.map(item => item.id),
    'messenger',
    'settings',
    'user_profile',
    'billing',
    'help',
    'admin'
].map(normalizeRouteSegment));

const resolveActiveItemFromPath = (pathname: string): string => {
    if (pathname === '/' || pathname === '/dashboard') return 'dashboard';
    const rawSegment = pathname.substring(1).split('/')[0];
    if (!rawSegment) return 'dashboard';
    let decodedSegment = rawSegment;
    try {
        decodedSegment = decodeURIComponent(rawSegment);
    } catch (error) {
        console.warn('Invalid route segment encoding:', rawSegment, error);
        return 'dashboard';
    }
    const normalizedSegment = normalizeRouteSegment(decodedSegment);
    return ALLOWED_ROUTE_ITEMS.has(normalizedSegment) ? normalizedSegment : 'dashboard';
};

const normalizeLevelValue = (value?: string): string => {
    if (!value) return '';
    return value.toLowerCase().replace(/\s+/g, '').replace(/level/g, '').replace(/lvl/g, '');
};

const formatDurationForPrompt = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0 minutes';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return remMinutes ? `${hours} hours ${remMinutes} minutes` : `${hours} hours`;
};

const playAlarmSound = () => {
    try {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        
        const playBeep = (time: number, freq: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.3, time + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            
            osc.start(time);
            osc.stop(time + duration);
        };
        
        const now = ctx.currentTime;
        // Two-tone bell chime played twice
        playBeep(now, 880, 0.4);
        playBeep(now + 0.1, 1109.73, 0.5);
        
        playBeep(now + 0.6, 880, 0.4);
        playBeep(now + 0.7, 1109.73, 0.5);
    } catch (e) {
        console.error("Failed to play alarm chime:", e);
    }
};

// ==========================================
// CORE APP CONTEXT ENGINE INITIALIZATION
// ==========================================
const App: React.FC = () => {
    // Auto permissions moved inside the App to allow profile updates
    useGlobalRefresh();
    const [currentPath, setCurrentPath] = useState(getWindowPathname());
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isReadyForBackgroundSync, setIsReadyForBackgroundSync] = useState(false);

    useEffect(() => {
        const handlePopState = () => setCurrentPath(getWindowPathname());
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    const [userProgress, setUserProgress] = useState<UserProgress>({});
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [notifications, setNotifications] = useState<NotificationType[]>([]);
    const [examHistory, setExamHistory] = useState<ExamHistoryItem[]>([]);
    const [departmentData, setDepartmentData] = useState<any>(null);
    const [customHeaderConfig, setCustomHeaderConfig] = useState<HeaderConfig | null>(null);

    const { addToast } = useToast();
    const lastNotifiedRef = useRef<Record<string, boolean>>({});

    useEffect(() => {
        if (!notifications || notifications.length === 0) return;
        const latest = notifications[0];
        const isRecent = Date.now() - latest.timestamp < 15000;
        if (isRecent && !lastNotifiedRef.current[latest.id]) {
            lastNotifiedRef.current[latest.id] = true;
            if (!Capacitor.isNativePlatform() && 'Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification(latest.title || 'AVELUT', { body: latest.message });
                } catch (e) { console.warn('Failed to display web notification'); }
            }
            if (latest.type === 'study_reminder') {
                playAlarmSound();
            }
            addToast(`⏰ ${latest.title}: ${latest.message}`, 'info');
        }
    }, [notifications, addToast]);

    const [isLoading, setIsLoading] = useState(true);
    const [isProfileLoading, setIsProfileLoading] = useState(true);
    const [authView, setAuthView] = useState<'login' | 'signup'>('login');

    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [showOnlineRestored, setShowOnlineRestored] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOffline(false);
            setShowOnlineRestored(true);
            setTimeout(() => setShowOnlineRestored(false), 3000);
        };
        const handleOffline = () => {
            setIsOffline(true);
            setShowOnlineRestored(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const [activeItem, setActiveItemState] = useState<string>(() => {
        const item = resolveActiveItemFromPath(getWindowPathname());
        return item === 'admin' ? 'admin' : item;
    });
    
    // Maintain a simple navigation history stack for back buttons
    const [navHistory, setNavHistory] = useState<string[]>([]);
    
    const setActiveItem = useCallback((newItem: string) => {
        setNavHistory(prev => {
            if (prev[prev.length - 1] === newItem) return prev;
            return [...prev, activeItem].slice(-15);
        });
        setActiveItemState(newItem);
        if (newItem === 'admin') {
            const pathname = getWindowPathname();
            const nextPath = pathname.startsWith('/admin') ? pathname : '/admin';
            if (pathname !== nextPath && typeof window !== 'undefined') {
                window.history.pushState(null, '', nextPath);
            }
            setAdminPath(nextPath);
            return;
        }
        const pathname = getWindowPathname();
        if (pathname === '/admin' && typeof window !== 'undefined') {
            window.history.pushState(null, '', '/');
        } else if (pathname.startsWith('/admin') && typeof window !== 'undefined') {
            window.history.replaceState(null, '', '/');
        }
    }, [activeItem]);

    useEffect(() => {
        const handleGoBack = () => {
            setNavHistory(prev => {
                if (prev.length === 0) {
                    setActiveItemState('dashboard');
                    return prev;
                }
                const newHistory = [...prev];
                const lastRoute = newHistory.pop();
                setActiveItemState(lastRoute || 'dashboard');
                return newHistory;
            });
        };
        window.addEventListener('app-go-back', handleGoBack);
        return () => window.removeEventListener('app-go-back', handleGoBack);
    }, []);

    const [adminPath, setAdminPath] = useState<string>(() => {
        const pathname = getWindowPathname();
        return resolveActiveItemFromPath(pathname) === 'admin' ? pathname : '/admin';
    });

    const syncItemFromPath = useCallback((pathname: string) => {
        const isTermsRoute = pathname === '/t&c' || pathname === '/tc' || pathname === '/terms-and-conditions' || pathname === '/terms';
        const isPolicyRoute = pathname === '/policy' || pathname === '/privacy-policy' || pathname === '/privacy';
        
        if (pathname.startsWith('/upload-center') || pathname.startsWith('/shared-chat') || isTermsRoute || isPolicyRoute) {
            return;
        }
        const item = resolveActiveItemFromPath(pathname);
        setActiveItemState(item === 'admin' ? 'admin' : item);
        if (item === 'admin') {
            setAdminPath(pathname.startsWith('/admin') ? pathname : '/admin');
            return;
        }
        if (pathname !== '/' && pathname !== '/dashboard' && typeof window !== 'undefined') {
            window.history.replaceState(null, '', '/');
        }
    }, []);



    useEffect(() => {
        const handlePopState = () => syncItemFromPath(getWindowPathname());
        handlePopState();
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [syncItemFromPath]);

    useEffect(() => {
        const handleGlobalError = (event: ErrorEvent) => {
            const msg = event.message || '';
            const err = event.error;
            const stack = err?.stack || '';
            if (
                msg.includes("reading 'body'") && 
                (stack.includes("youtube") || stack.includes("widget") || stack.includes("Pb.close") || stack.includes("shutdown_") || stack.includes("onClosed_"))
            ) {
                console.warn("Caught and silenced YouTube Player API unmount exception:", err);
                event.preventDefault();
                event.stopPropagation();
            }
        };

        window.addEventListener('error', handleGlobalError);
        return () => window.removeEventListener('error', handleGlobalError);
    }, []);

    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem('avelut_admin_authenticated') === 'true';
    });
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [pendingMessengerChatId, setPendingMessengerChatId] = useState<string | null>(null);

    const currentPageLabel = activeItem === 'messenger' 
        ? 'Messenger' 
        : (navigationItems.find(item => item.id === activeItem)?.label || 'Dashboard');

    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [isTourOpen, setIsTourOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const triggerScanRef = useRef<(() => void) | null>(null);
    const { settings: appSettings, isLoading: isAppSettingsLoading } = useAppSettings();
    const ai = useMemo(() => (
        createAvelutAI(appSettings, userProfile)
    ), [appSettings, userProfile]);
    const isUploadCenterRoute = getWindowPathname().startsWith('/upload-center');
    const isAdminRoute = getWindowPathname().startsWith('/admin');

        const applyMessengerTarget = useCallback((chatId: string | null | undefined) => {
                if (!chatId) return;
                setActiveItem('messenger');
                setPendingMessengerChatId(chatId);
        }, [setActiveItem]);

        useEffect(() => {
                if (typeof window === 'undefined') return;

                const url = new URL(window.location.href);
                const chatId = url.searchParams.get('openMessengerChatId');
                if (chatId) {
                    applyMessengerTarget(chatId);
                    url.searchParams.delete('openMessengerChatId');
                    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
                }

                const handleServiceWorkerMessage = (event: MessageEvent) => {
                    const data = event.data || {};
                    if (data?.type === 'open-messenger-chat' && data.chatId) {
                        applyMessengerTarget(String(data.chatId));
                    }
                };

                navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
                return () => navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
        }, [applyMessengerTarget]);

    const { attemptApiCall } = useApiLimiter();
    const tourStatusRef = useRef<'unknown' | 'checked' | 'shown'>('unknown');

    const startTour = useCallback(() => {
        setActiveItem('dashboard');
        setTimeout(() => setIsTourOpen(true), 300);
    }, [setActiveItem]);

    useEffect(() => {
        const checkAndSeedUsageSettings = async () => {
            try {
                const usageSettingsRef = dbRef(db, 'app_settings/global/usage_settings');
                const snapshot = await get(usageSettingsRef);
                if (!snapshot.exists()) {
                    await set(usageSettingsRef, DEFAULT_USAGE_SETTINGS);
                    console.log('Seeded default usage settings to Firebase successfully.');
                }
            } catch (err) {
                console.error('Failed to seed usage settings:', err);
            }
        };
        checkAndSeedUsageSettings();
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
          setUser(currentUser);
          if (!currentUser) {
            setUserProfile(null);
            tourStatusRef.current = 'unknown';
            cleanupNativeNotifications();
          } else {
            initNativeNotifications(currentUser, addToast, setActiveItem, setPendingMessengerChatId);
          }
          setIsLoading(false);
        });
        return () => unsubscribe();
    }, [addToast, setActiveItem]);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        const urlListener = CapacitorApp.addListener('appUrlOpen', async (event) => {
            const url = new URL(event.url);
            if (url.protocol.replace(':', '') === 'avelut' && url.host === 'action') {
                const actionId = url.searchParams.get('id');
                const replyText = url.searchParams.get('replyText');
                const chatId = url.searchParams.get('chatId');

                if (actionId === 'reply_action' && replyText && chatId && user) {
                     try {
                         const messagesRef = dbRef(db, `messages/${chatId}`);
                         const newMsgRef = push(messagesRef);
                         await set(newMsgRef, {
                             senderId: user.uid,   // must match Messenger's senderId field
                             text: replyText,
                             timestamp: Date.now(),
                             isRead: false
                         });
                         addToast('Reply sent ✓', 'success');
                     } catch (e) {
                         console.error('Failed to send inline reply:', e);
                         addToast('Failed to send reply', 'error');
                     }
                } else if (actionId === 'open_chat' && chatId) {
                     // Open Chat button from notification drawer
                     setActiveItem('messenger');
                     setPendingMessengerChatId(chatId);
                } else if (actionId === 'study_guide' || actionId === 'timetable') {
                     setActiveItem('study_guide');
                } else if (actionId === 'study_partners') {
                     setActiveItem('study_partners');
                } else if (actionId === 'messenger') {
                     setActiveItem('messenger');
                } else if (actionId === 'notifications') {
                     setActiveItem('notifications');
                } else if (actionId === 'leaderboard') {
                     setActiveItem('leaderboard');
                } else if (actionId === 'exam') {
                     setActiveItem('exam');
                } else if (chatId) {
                     // Notification tap without specific action — open to chat
                     setActiveItem('messenger');
                     setPendingMessengerChatId(chatId);
                } else if (actionId) {
                     // Generic navigation fallback for any other route
                     setActiveItem(actionId);
                }
            }
        });
        return () => {
            urlListener.then(listener => listener.remove());
        };
    }, [user, addToast]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('avelut_admin_authenticated', isAdminAuthenticated ? 'true' : 'false');
    }, [isAdminAuthenticated]);

    const handleProfileUpdate = useCallback(async (updatedData: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
        if (!user) return { success: false, error: 'User not authenticated.' };
        try {
            const userRef = dbRef(db, `users/${user.uid}`);
            await update(userRef, updatedData);
            if (updatedData.display_name || updatedData.photo_url) {
                const profileUpdates: any = {};
                if (updatedData.display_name) profileUpdates.displayName = updatedData.display_name;
                if (updatedData.photo_url) profileUpdates.photoURL = updatedData.photo_url;
                await updateProfile(user, profileUpdates);
            }
            setUserProfile(prevProfile => {
                if (!prevProfile) return null;
                return { ...prevProfile, ...updatedData };
            });
            return { success: true };
        } catch (err: any) {
            console.error("Error updating profile:", err.message || err);
            return { success: false, error: err.message };
        }
    }, [user]);

    const handleConsent = async (granted: boolean) => {
        setShowPrivacyModal(false);
        await handleProfileUpdate({ privacy_consent: { granted, timestamp: Date.now() } });
    };

    useEffect(() => {
        if (!userProfile) return;
        const requestPermissions = async () => {
            try {
                if (Capacitor.isNativePlatform()) {
                    let permStatus = await PushNotifications.checkPermissions();
                    if (permStatus.receive === 'prompt') {
                        permStatus = await PushNotifications.requestPermissions();
                    }
                    if (permStatus.receive === 'granted' && !userProfile.notifications_enabled) {
                        handleProfileUpdate({ notifications_enabled: true });
                    }
                } else {
                    if ('Notification' in window) {
                        const currentPerm = Notification.permission;
                        if (currentPerm === 'default') {
                            const newPerm = await Notification.requestPermission();
                            if (newPerm === 'granted' && !userProfile.notifications_enabled) {
                                handleProfileUpdate({ notifications_enabled: true });
                            }
                        } else if (currentPerm === 'granted' && !userProfile.notifications_enabled) {
                            handleProfileUpdate({ notifications_enabled: true });
                        }
                    }
                }
            } catch (err) {
                console.warn("Auto permissions skipped or failed:", err);
            }
        };
        const timer = setTimeout(requestPermissions, 2500);
        return () => clearTimeout(timer);
    }, [userProfile?.uid, handleProfileUpdate, userProfile?.notifications_enabled]);

    useEffect(() => {
        if (!user) {
            setUserProfile(null);
            setIsProfileLoading(false);
            return;
        }
        const cacheKey = `avelut_profile_${user.uid}`;
        const cachedProfile = readCachedJson<UserProfile | null>(cacheKey, null);
        if (cachedProfile) {
            setUserProfile(cachedProfile);
            if (!navigator.onLine) {
                setIsProfileLoading(false);
            }
            // Removed automatic onboarding redirect from cached profile
        } else {
            setIsProfileLoading(true);
        }

        const userRef = dbRef(db, `users/${user.uid}`);
        
        const unsubscribeProfile = onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                if (data.status === 'suspended' || data.status === 'deleted') {
                    firebaseSignOut(firebaseAuth);
                    addToast(`Your account has been ${data.status}.`, "error");
                    return;
                }
                
                // Avoid overwriting a valid cached profile with an incomplete local optimistic update
                // Firebase RTDB fires local events immediately on update(), which might lack department_id
                // if the full server object hasn't been fetched yet.
                const isPartialUpdate = Object.keys(data).length < 4 && !data.department_id;
                
                if (!isPartialUpdate) {
                    writeCachedJson(cacheKey, data);
                    setUserProfile(data as UserProfile);
                    
                    if (!data.department_id) {
                        setActiveItem('onboarding');
                        sessionStorage.removeItem('just_signed_up');
                    } else {
                        if (tourStatusRef.current === 'unknown') {
                            if (data.privacy_consent?.granted && !data.has_completed_tour) {
                                startTour();
                                tourStatusRef.current = 'shown';
                            } else {
                                tourStatusRef.current = 'checked';
                            }
                        }
                    }

                    // --- Auto Notification Logic ---
                    if (!sessionStorage.getItem('session_notifications_sent')) {
                        sessionStorage.setItem('session_notifications_sent', 'true');
                        const today = new Date().toISOString().split('T')[0];
                        const lastLoginStr = localStorage.getItem('last_login_date');
                        const currentAppVersion = "4.16.15"; // Current version from package.json
                        const lastSeenVersion = localStorage.getItem('last_seen_app_version');

                        // Welcome Back Notification (Once a day)
                        if (lastLoginStr !== today) {
                            localStorage.setItem('last_login_date', today);
                            const notifRef = dbRef(db, `notifications/${user.uid}`);
                            push(notifRef, {
                                type: 'welcome',
                                title: 'Welcome Back!',
                                message: 'Ready for another productive study session?',
                                timestamp: Date.now(),
                                is_read: false,
                                action_buttons: [
                                    { label: 'Open Study Guide', action: 'navigate', route: 'study_guide' },
                                    { label: 'Check Messages', action: 'navigate', route: 'messenger' }
                                ]
                            });
                        }

                        // App Update Notification
                        if (lastSeenVersion !== currentAppVersion) {
                            localStorage.setItem('last_seen_app_version', currentAppVersion);
                            const notifRef = dbRef(db, `notifications/${user.uid}`);
                            push(notifRef, {
                                type: 'app_update',
                                title: 'App Updated',
                                message: `We've updated Avelut to version ${currentAppVersion}! Check out the new Notifications system and profile design.`,
                                timestamp: Date.now(),
                                is_read: false
                            });
                        }
                    }
                    // -------------------------------
                }
                setIsProfileLoading(false);
            } else {
                if (!navigator.onLine) {
                    // Do nothing, wait for network to restore instead of showing an error or fallback.
                } else if (sessionStorage.getItem('just_signed_up') === 'true') {
                    // Prevent forced onboarding page load
                    sessionStorage.removeItem('just_signed_up');
                    setIsProfileLoading(false);
                } else {
                    // If online and no data, we might need to wait for backend creation. 
                    // Do not stop loading if we don't have a cached profile.
                    if (cachedProfile) setIsProfileLoading(false);
                }
            }
        }, (error) => {
            console.error("Error fetching user profile:", error);
            // Never show the "cant fetch" or "failed to load" flash message.
            // Just silently wait, or rely on the network banner.
            if (cachedProfile) {
                setIsProfileLoading(false);
            }
        });
        
        return () => { off(userRef, 'value', unsubscribeProfile); };
    }, [user, addToast, startTour]);

    // =====================================================
    // BACKGROUND SYNC DELAY ENGINE
    // =====================================================
    useEffect(() => {
        if (userProfile && !isReadyForBackgroundSync) {
            const timer = setTimeout(() => setIsReadyForBackgroundSync(true), 1500);
            return () => clearTimeout(timer);
        } else if (!userProfile) {
            setIsReadyForBackgroundSync(false);
        }
    }, [userProfile, isReadyForBackgroundSync]);

    // =====================================================
    // SESSION STREAK: award after 10 seconds in the app
    // =====================================================
    useEffect(() => {
        if (!userProfile) return;
        const SESSION_STREAK_THRESHOLD_MS = 1000; // Reduced to 1 sec to immediately register streak
        const timer = window.setTimeout(async () => {
            await awardDailyStreak(userProfile.uid);
        }, SESSION_STREAK_THRESHOLD_MS);
        return () => window.clearTimeout(timer);
    }, [userProfile?.uid]); // Only re-run if user changes (not on every profile update)


    useEffect(() => {
        if (!user) return;
        const syncAuthIdentityToProfile = async () => {
            try {
                const userRef = dbRef(db, `users/${user.uid}`);
                const snapshot = await get(userRef);
                const existingProfile = snapshot.val() || {};
                
                const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
                const clientTimezoneOffset = new Date().getTimezoneOffset();

                const nextProfile = {
                    uid: user.uid,
                    display_name: user.displayName || existingProfile.display_name || 'User',
                    email: user.email || existingProfile.email || '',
                    photo_url: user.photoURL || existingProfile.photo_url || '',
                    timezone: clientTimezone,
                    timezone_offset: clientTimezoneOffset,
                };
                const hasProfileUpdates = Object.entries(nextProfile).some(([key, value]) => existingProfile[key] !== value && value);
                if (hasProfileUpdates) {
                    await update(userRef, nextProfile);
                }
            } catch (error) {
                console.error('Failed to sync auth identity to profile:', error);
            }
        };
        syncAuthIdentityToProfile();
    }, [user]);



    useEffect(() => {
        if (!userProfile || !user) return;
        const userStatusRef = dbRef(db, `users/${user.uid}`);
        const connectedRef = dbRef(db, '.info/connected');

        const unsubscribeConnected = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                onDisconnect(userStatusRef).update({ is_online: false, last_seen: serverTimestamp() });
                update(userStatusRef, { is_online: true, last_seen: serverTimestamp() });
            }
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                update(userStatusRef, { is_online: true, last_seen: serverTimestamp() });
            } else {
                update(userStatusRef, { is_online: false, last_seen: serverTimestamp() });
            }
        };
        
        window.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('visibilitychange', handleVisibilityChange);
            off(connectedRef, 'value', unsubscribeConnected);
        };
    }, [userProfile?.uid, user]);
    
    useEffect(() => {
        if (!userProfile) return;
        const cacheKey = `avelut_progress_${userProfile.uid}`;
        const cachedProgress = readCachedJson<UserProgress>(cacheKey, {});
        setUserProgress(cachedProgress);

        if (!isReadyForBackgroundSync) return;

        const progressRef = dbRef(db, `user_progress/${userProfile.uid}`);
        const unsubscribeProgress = onValue(progressRef, (snapshot) => {
            const data = snapshot.val() || {};
            setUserProgress(data);
            writeCachedJson(cacheKey, data);
        });
        return () => { off(progressRef, 'value', unsubscribeProgress); };
    }, [userProfile, isReadyForBackgroundSync]);

    useEffect(() => {
        if (!userProfile) {
            setUnreadMessagesCount(0);
            setNotifications([]);
            return;
        }

        const cacheKeyDashboard = `avelut_dashboard_${userProfile.uid}`;
        const cachedDashboard = readCachedJson<DashboardData | null>(cacheKeyDashboard, null);
        if (cachedDashboard) {
            setDashboardData(cachedDashboard);
        }

        const cacheKeyNotif = `avelut_notifications_${userProfile.uid}`;
        const cachedNotif = readCachedJson<NotificationType[]>(cacheKeyNotif, []);
        if (cachedNotif.length > 0) {
            setNotifications(cachedNotif);
        }

        if (!isReadyForBackgroundSync) return;
        
        const notificationsRef = dbRef(db, `notifications/${userProfile.uid}`);
        const unsubscribeNotifications = onValue(notificationsRef, (snapshot) => {
            const data = snapshot.val() || {};
            const notificationList: NotificationType[] = Object.entries(data).map(([id, n]: [string, any]) => ({
                id, ...n, timestamp: n.timestamp
            })).sort((a,b) => b.timestamp - a.timestamp);
            const truncatedNotif = notificationList.slice(0, 20);
            setNotifications(truncatedNotif);
            writeCachedJson(cacheKeyNotif, truncatedNotif);
        });

        const userChatsRef = dbRef(db, `user_chats/${userProfile.uid}`);
        const unsubscribeUnreadCount = onValue(userChatsRef, (snapshot) => {
            const data = snapshot.val() || {};
            let totalUnread = 0;
            Object.values(data).forEach((chat: any) => { totalUnread += (chat.unreadCount || 0); });
            setUnreadMessagesCount(totalUnread);
        });

        return () => {
            off(notificationsRef, 'value', unsubscribeNotifications);
            off(userChatsRef, 'value', unsubscribeUnreadCount);
        };
    }, [userProfile, isReadyForBackgroundSync]);

    useEffect(() => {
        if (!userProfile) {
            setExamHistory([]);
            return;
        }

        if (!isReadyForBackgroundSync) return;

        const examHistoryRef = dbRef(db, `exam_history/${userProfile.uid}`);
        const unsubscribeExamHistory = onValue(examHistoryRef, (snapshot) => {
            const data = snapshot.val() || {};
            const sorted = Object.values(data).sort((a: any, b: any) => b.timestamp - a.timestamp).slice(0, 5) as ExamHistoryItem[];
            setExamHistory(sorted);
        });

        return () => {
            off(examHistoryRef, 'value', unsubscribeExamHistory);
        };
    }, [userProfile, isReadyForBackgroundSync]);

    useEffect(() => {
        if (!userProfile?.school_id || !userProfile?.college_id || !userProfile?.department_id) {
            setDepartmentData(null);
            return;
        }

        const deptCacheKey = `avelut_dept_data_${userProfile.department_id}`;
        const cached = readCachedJson<any>(deptCacheKey, null);
        if (cached) {
            setDepartmentData(cached);
        }

        if (!isReadyForBackgroundSync) return;

        // Always fetch courses from departments_data (the canonical course store)
        // schools_data only contains dept metadata (name, levels), NOT courses.
        const coursesRef = dbRef(db, `departments_data/${userProfile.department_id}`);
        get(coursesRef).then((coursesSnap) => {
            const coursesVal = coursesSnap.val() || {};
            // Also fetch dept metadata (name etc.) from schools_data for display purposes
            const metaRef = dbRef(db, `schools_data/${userProfile.school_id}/colleges/${userProfile.college_id}/departments/${userProfile.department_id}`);
            get(metaRef).then((metaSnap) => {
                const metaVal = metaSnap.val() || {};
                const merged = { ...metaVal, ...coursesVal };
                if (Object.keys(merged).length > 0) {
                    writeCachedJson(deptCacheKey, merged);
                    setDepartmentData(merged);
                }
            }).catch(err => {
                // Meta fetch failed — use courses data alone
                if (coursesVal && Object.keys(coursesVal).length > 0) {
                    writeCachedJson(deptCacheKey, coursesVal);
                    setDepartmentData(coursesVal);
                }
                console.error("Error fetching department metadata:", err);
            });
        }).catch(err => {
            console.error("Error fetching department courses:", err);
        });
    }, [userProfile, isReadyForBackgroundSync]);

    useEffect(() => {
        if (!userProfile || !departmentData) return;

        const normalizedUserLevel = normalizeLevelValue(userProfile.level);
        const rawCourseList = departmentData.course_list;
        const allCourses: Course[] = Array.isArray(rawCourseList)
            ? rawCourseList
            : (rawCourseList && typeof rawCourseList === 'object' ? Object.values(rawCourseList) : []);
        const coursesForLevel = allCourses.filter((course: Course) => (
            normalizeLevelValue(course.level) === normalizedUserLevel
        ));
        
        const totalTopics = coursesForLevel.reduce((acc: number, course: Course) => acc + (course.topics?.length || 0), 0) || 0;
        const topicIdsForLevel = new Set<string>();
    
        coursesForLevel.forEach(course => {
            course.topics?.forEach(topic => { topicIdsForLevel.add(topic.topic_id); });
        });

        const completedTopicsCount = Object.keys(userProgress)
            .filter(topicId => userProgress[topicId]?.is_complete && topicIdsForLevel.has(topicId))
            .length;
        const topicDurations = Object.entries(userProgress)
            .filter(([topicId, progress]) => topicIdsForLevel.has(topicId) && typeof (progress as any).study_duration_seconds === 'number' && (progress as any).study_duration_seconds > 0)
            .map(([, progress]) => (progress as any).study_duration_seconds || 0);
        const totalStudySeconds = topicDurations.reduce((acc: number, seconds: number) => acc + seconds, 0);
        const averageTopicStudySeconds = topicDurations.length > 0 ? Math.round(totalStudySeconds / topicDurations.length) : 0;

        const completedCoursesCount = coursesForLevel.filter((course: Course) => {
            const topicIds = course.topics?.map(topic => topic.topic_id) || [];
            return topicIds.length > 0 && topicIds.every(topicId => userProgress[topicId]?.is_complete);
        }).length;
        const courseDurations = coursesForLevel
            .map((course: Course) => (course.topics || []).reduce((acc: number, topic) => acc + ((userProgress[topic.topic_id] as any)?.study_duration_seconds || 0), 0))
            .filter((seconds: number) => seconds > 0);
        const averageCourseStudySeconds = courseDurations.length > 0 ? Math.round(courseDurations.reduce((acc: number, seconds: number) => acc + seconds, 0) / courseDurations.length) : 0;

        const examAverageScore = examHistory.length > 0 ? examHistory.reduce((acc, exam) => acc + ((exam.score / exam.total_questions) * 100), 0) / examHistory.length : 0;

        const progressPercent = totalTopics > 0 ? (completedTopicsCount / totalTopics) * 100 : 0;
        const understandingScore = Math.max(0, Math.min(100, Math.round((progressPercent * 0.55) + (examAverageScore * 0.45))));
        const understandingLabel = understandingScore >= 85 ? 'Excellent' : understandingScore >= 70 ? 'Strong' : understandingScore >= 50 ? 'Growing' : 'Needs focus';

        const nextDashboardData = { 
            totalTopics, 
            completedTopicsCount, 
            completedCoursesCount,
            totalStudySeconds,
            averageTopicStudySeconds,
            averageCourseStudySeconds,
            examAverageScore: Math.round(examAverageScore),
            understandingScore,
            understandingLabel,
            backedFacts: [
                `Completed topics: ${completedTopicsCount} of ${totalTopics}`,
                `Completed courses: ${completedCoursesCount}`,
                `Total study time: ${formatDurationForPrompt(totalStudySeconds)}`,
                `Average topic time: ${formatDurationForPrompt(averageTopicStudySeconds)}`,
                `Average course time: ${formatDurationForPrompt(averageCourseStudySeconds)}`,
                `Average exam score: ${Math.round(examAverageScore)}%`,
            ],
            examHistory
        };
        setDashboardData(nextDashboardData);
        const cacheKeyDashboard = `avelut_dashboard_${userProfile.uid}`;
        writeCachedJson(cacheKeyDashboard, nextDashboardData);
    }, [userProfile, userProgress, examHistory, departmentData]);



    const handleLogout = async () => {
        try {
            await firebaseSignOut(firebaseAuth);
        } catch (error: any) {
            console.error("Logout failed:", error.message || error);
            addToast(error.message || "Failed to log out.", "error");
        }
    };

    const handleOnboardingComplete = async (profileData: { schoolId: string; collegeId: string; departmentId: string; level: string }) => {
        if (!user) return;
        const now = Date.now();
        const displayName = user.displayName || 'AVELITE';
        const photoURL = user.photoURL || '';
        const userProfileData: Omit<UserProfile, 'privacy_consent'> = {
            uid: user.uid,
            display_name: displayName,
            photo_url: photoURL,
            school_id: profileData.schoolId,
            college_id: profileData.collegeId,
            department_id: profileData.departmentId,
            level: profileData.level,
            current_streak: 0,
            last_activity_date: now,
            notifications_enabled: false,
            is_online: true,
            last_seen: now,
            has_completed_tour: false,
            is_activated: true,
            subscription_status: 'free',
        };
        try {
            const userRef = dbRef(db, `users/${user.uid}`);
            await update(userRef, userProfileData);
            
            const notificationRef = dbRef(db, `notifications/${user.uid}`);
            const newNotifRef = push(notificationRef);
            await set(newNotifRef, {
                type: 'welcome',
                title: 'Welcome to AVELUT!',
                message: 'Your learning journey starts now. Explore the study guide to begin.',
                is_read: false,
                timestamp: serverTimestamp()
            });
            
            setUserProfile(prev => ({...prev, ...userProfileData } as UserProfile));
            setActiveItem('dashboard');
            addToast("Profile completed successfully!", "success");
        } catch (error: any) {
            console.error("Failed to complete onboarding:", error.message || error);
            addToast(error.message || "Could not save your profile.", "error");
        }
    };

    const handleMarkNotificationRead = async (id: string) => {
        if (!user) return;
        const notificationRef = dbRef(db, `notifications/${user.uid}/${id}`);
        try {
            await update(notificationRef, { is_read: true });
        } catch (err: any) {
            console.error("Error marking notification read:", err);
            addToast("Could not update notification.", "error");
        }
    };

    const handleMarkAllNotificationsRead = async () => {
        if (!user) return;
        const notificationsRef = dbRef(db, `notifications/${user.uid}`);
        try {
            const snapshot = await get(notificationsRef);
            const data = snapshot.val() || {};
            const updates: any = {};
            Object.keys(data).forEach(id => {
                if (!data[id].is_read) { updates[`${id}/is_read`] = true; }
            });
            if (Object.keys(updates).length > 0) {
                await update(notificationsRef, updates);
                addToast('All notifications marked as read.', 'success');
            }
        } catch (error: any) {
            console.error("Error clearing notifications:", error);
            addToast("Could not clear notifications.", "error");
        }
    };

    const handleAccountDeletion = async (): Promise<{ success: boolean; error?: string }> => {
        try {
            if (user) {
                await update(dbRef(db, `users/${user.uid}`), { is_deleted: true });
                await user.delete();
                addToast('Your account has been successfully deleted.', 'success');
                return { success: true };
            }
            return { success: false, error: 'User not found.' };
        } catch (error: any) {
            console.error("Error deleting account:", error.message || error);
            return { success: false, error: error.message || 'An error occurred while deleting your account.' };
        }
    };
    
    const handleTourClose = async (completed: boolean) => {
        if (completed && userProfile && !userProfile.has_completed_tour) {
            const result = await handleProfileUpdate({ has_completed_tour: true });
            if (!result.success) {
                addToast(result.error || 'Could not save tour completion status.', 'error');
            }
        }
        setIsTourOpen(false);
    };

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const tourSteps: TourStep[] = [
      { target: 'body', title: '👋 Welcome to AVELUT!', content: "Let's take a quick tour of your new learning dashboard.", placement: 'center' },
      { target: '[data-tour-id="dashboard-content"]', title: '📊 Your Dashboard', content: 'View your progress, streaks, and personalized lessons.', placement: 'bottom' },
      { target: isMobile ? '[data-tour-id="bottomnav-study_guide"]' : '[data-tour-id="sidebar-study_guide"]', title: '📚 Study Guide', content: 'Explore tutorials and start new lessons anytime.', placement: isMobile ? 'top' : 'right' },
      { target: isMobile ? '[data-tour-id="bottomnav-visual_solver"]' : '[data-tour-id="sidebar-visual_solver"]', title: '📸 Visual Solver', content: 'Scan any problem and get instant or detailed tutorials.', placement: isMobile ? 'top' : 'right' },
      { target: isMobile ? '[data-tour-id="bottomnav-messenger"]' : '[data-tour-id="header-messenger"]', title: '🤝 Messenger', content: 'Connect with other learners and chat privately.', placement: isMobile ? 'top' : 'bottom' },
      ...(isMobile ? [{ target: '[data-tour-id="mobile-menu-button"]', title: '⚙️ Main Menu', content: 'Access your settings, help, and logout options from here.', placement: 'bottom' as const }] : [{ target: '[data-tour-id="sidebar-settings"]', title: '⚙️ Settings', content: 'Update your info and view your achievements.', placement: 'top' as const }]),
      { target: 'body', title: "🎉 You're all set!", content: 'Enjoy exploring your learning journey. Tap "Finish" to start!', placement: 'center' },
    ];

    // Only show full-screen loader when we have NO data at all.
    // If we have a cached userProfile, allow the app to render with skeleton UI
    // in individual components rather than blocking the entire screen.
    if (isLoading || (isProfileLoading && !userProfile)) {
        return <div key="app-loader-state"><AppLoader /></div>;
    }

    const isSharedChatRoute = currentPath.startsWith('/shared-chat/');
    const shareId = isSharedChatRoute ? currentPath.substring('/shared-chat/'.length).split('/')[0] : '';

    if (isSharedChatRoute && shareId) {
        return (
            <ErrorBoundary>
                <SharedChatView shareId={shareId} user={user} />
            </ErrorBoundary>
        );
    }

    const isTermsRoute = currentPath === '/t&c' || currentPath === '/tc' || currentPath === '/terms-and-conditions' || currentPath === '/terms';
    const isPolicyRoute = currentPath === '/policy' || currentPath === '/privacy-policy' || currentPath === '/privacy';

    if (isTermsRoute) {
        return (
            <ErrorBoundary>
                <TermsAndConditions />
            </ErrorBoundary>
        );
    }

    if (isPolicyRoute) {
        return (
            <ErrorBoundary>
                <PrivacyPolicy />
            </ErrorBoundary>
        );
    }

    if (activeItem === 'admin') {
        if (!isAdminAuthenticated) {
            return <div key="admin-login-state"><AdminLogin onLogin={() => setIsAdminAuthenticated(true)} /></div>;
        }
        
        const mockAdminProfile: UserProfile = {
            uid: 'admin-hardcoded',
            display_name: 'Admin User',
            department_id: 'admin',
            level: 'admin',
            current_streak: 0,
            last_activity_date: Date.now(),
            notifications_enabled: false,
            is_admin: true
        } as UserProfile;

        return (
            <ErrorBoundary>
                <Suspense fallback={<AppLoader />}>
                    <AdminPanel
                        userProfile={mockAdminProfile}
                        pathname={adminPath}
                        onNavigate={(path) => {
                            setAdminPath(path);
                            if (typeof window !== 'undefined') { window.history.pushState(null, '', path); }
                            if (!path.startsWith('/admin')) {
                                setActiveItem(resolveActiveItemFromPath(path));
                            }
                        }}
                    />
                </Suspense>
            </ErrorBoundary>
        );
    }
    
    if (isUploadCenterRoute) {
        if (!appSettings.upload_center_uploads_enabled) {
            return (
                <ComingSoonScreen
                    title="Textbook uploads are paused"
                    subtitle="The upload center is temporarily locked by an administrator."
                    supportText="Please check back later or contact an admin for access."
                />
            );
        }
        return (
            <ErrorBoundary>
                <UploadCenter />
            </ErrorBoundary>
        );
    }

    if (!user) {
        if (currentPath === '/about') {
            return (
                <ErrorBoundary>
                    <Suspense fallback={<AppLoader />}>
                        <AboutUsPage />
                    </Suspense>
                </ErrorBoundary>
            );
        }
        
        if (currentPath === '/contact') {
            return (
                <ErrorBoundary>
                    <Suspense fallback={<AppLoader />}>
                        <ContactUsPage />
                    </Suspense>
                </ErrorBoundary>
            );
        }
        
        if (currentPath.startsWith('/founder/')) {
            const founderId = currentPath.substring('/founder/'.length).split('/')[0];
            if (founderId) {
                return (
                    <ErrorBoundary>
                        <Suspense fallback={<AppLoader />}>
                            <FounderPage founderId={founderId} />
                        </Suspense>
                    </ErrorBoundary>
                );
            }
        }

        if (currentPath === '/' || currentPath === '' || currentPath === '/home') {
            if (Capacitor.isNativePlatform()) {
                return (
                    <div key="auth-state" className="min-h-screen">
                        {authView === 'login' 
                            ? <Login onSwitchToSignUp={() => setAuthView('signup')} /> 
                            : <SignUp onSwitchToLogin={() => setAuthView('login')} />}
                    </div>
                );
            }
            return (
                <ErrorBoundary>
                    <LandingPage 
                        onLogin={() => {
                            setAuthView('login');
                            if (typeof window !== 'undefined') window.history.pushState(null, '', '/login');
                        }}
                        onSignUp={() => {
                            setAuthView('signup');
                            if (typeof window !== 'undefined') window.history.pushState(null, '', '/signup');
                        }}
                    />
                </ErrorBoundary>
            );
        }
        return (
            <div key="auth-state" className="min-h-screen">
                {authView === 'login' 
                    ? <Login onSwitchToSignUp={() => setAuthView('signup')} /> 
                    : <SignUp onSwitchToLogin={() => setAuthView('login')} />}
            </div>
        );
    }

    if (isAppSettingsLoading) {
        return <div key="settings-loader-state"><AppLoader /></div>;
    }

    if (appSettings.coming_soon_enabled && !isAdminRoute) {
        return (
            <div key="coming-soon-state" className="min-h-screen">
                <ComingSoonScreen
                    title="AVELUT is coming soon"
                    subtitle="We are polishing the full learning experience right now. Admins can reopen the app anytime."
                    supportText="If you are an admin, open the admin panel to manage launch settings."
                />
            </div>
        );
    }


    
    if (!userProfile) {
        return (
            <div key="no-profile-state" className="flex items-center justify-center min-h-screen bg-gray-100">
                <p>An error occurred loading your profile. Please refresh.</p>
            </div>
        );
    }



    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className="flex h-screen w-full bg-off-white font-sans text-charcoal selection:bg-brand-200 selection:text-brand-900 overflow-hidden">
            <NativePullToRefresh />

            {/* Automatic PWA App Intercept Modal Overlay */}
            <PWAInstallBannerOverlay />

            <Sidebar
                activeItem={activeItem}
                onItemClick={setActiveItem}
                userProfile={userProfile}
                onLogout={handleLogout}
                isMobileSidebarOpen={isMobileSidebarOpen}
                onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
                unreadCount={unreadCount}
                unreadMessagesCount={unreadMessagesCount}
            />
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <Header 
                    currentPageLabel={(customHeaderConfig?.title as string) || currentPageLabel}
                    unreadCount={unreadCount}
                    onNotificationsClick={() => setActiveItem('notifications')}
                    onMenuClick={() => setIsMobileSidebarOpen(true)}
                    onMessengerClick={() => setActiveItem('messenger')}
                    onCalendarClick={() => setIsCalendarOpen(true)}
                    unreadMessagesCount={unreadMessagesCount}
                    userProfile={userProfile}
                    leftActions={customHeaderConfig?.leftActions}
                    rightActions={customHeaderConfig?.rightActions}
                    className={customHeaderConfig?.className}
                    onNavigate={(route) => setActiveItem(route)}
                    onLogoutClick={handleLogout}
                />
                <div 
                    id="main-scroll-container"
                    className={
                        activeItem === 'chat' || activeItem === 'messenger'
                        ? "flex-1 min-h-0 overflow-hidden flex flex-col"
                        : "flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden content-with-bottom-nav isolate"
                    }
                >
                    {userProfile && (
                        <MainContent
                            key={activeItem}
                            activeItem={activeItem}
                            user={user}
                            userProfile={userProfile}
                            appSettings={appSettings}
                            userProgress={userProgress}
                            dashboardData={dashboardData}
                                    initialMessengerChatId={pendingMessengerChatId}
                            handleLogout={handleLogout}
                            handleProfileUpdate={handleProfileUpdate}
                            handleDeleteAccount={handleAccountDeletion}
                            startTour={startTour}
                            triggerScanRef={triggerScanRef}
                            onNavigate={setActiveItem}
                            setCustomHeaderConfig={setCustomHeaderConfig}
                            handleOnboardingComplete={handleOnboardingComplete}
                            notifications={notifications}
                            onMarkAsRead={handleMarkNotificationRead}
                            onMarkAllAsRead={handleMarkAllNotificationsRead}
                        />
                    )}
                </div>
            </main>
            {showPrivacyModal && <PrivacyConsentModal onAllow={() => handleConsent(true)} onDeny={() => handleConsent(false)} />}
            {userProfile && (
                <CalendarModal
                    isOpen={isCalendarOpen}
                    onClose={() => setIsCalendarOpen(false)}
                    userProfile={userProfile}
                />
            )}
            <BottomNavBar
              activeItem={activeItem}
              onItemClick={(id) => {
                if (id === 'mobile_menu') {
                    setIsMobileSidebarOpen(true);
                } else {
                    setActiveItem(id);
                }
              }}
              onCenterActionClick={() => {
                  if (activeItem === 'visual_solver') {
                      triggerScanRef.current?.();
                  } else {
                      setActiveItem('visual_solver');
                  }
              }}
              isVisible={activeItem !== 'chat' && !customHeaderConfig?.hideBottomNav}
              userProfile={userProfile}
            />
            <GuidedTour 
                steps={tourSteps}
                isOpen={isTourOpen}
                onClose={handleTourClose}
            />
            <InAppUpdate />
            
            {/* Global Offline/Online Banner */}
            {(isOffline || showOnlineRestored) && (
                <div 
                    className={`fixed bottom-[calc(max(env(safe-area-inset-bottom),0px)+65px)] md:bottom-0 left-0 right-0 z-[100] h-[30px] flex items-center justify-center text-[12px] font-bold text-white transition-all duration-300 shadow-md ${isOffline ? 'bg-red-500' : 'bg-green-500'}`}
                >
                    {isOffline ? 'No internet or slow network' : 'Network restored'}
                </div>
            )}
        </div>
    );
};

export default App;
