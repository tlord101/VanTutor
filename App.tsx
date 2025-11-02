import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut, updateProfile, deleteUser } from 'firebase/auth';
import { auth, db } from './firebase';
import { supabase } from './supabase';
import { doc, getDoc, setDoc, onSnapshot, collection, updateDoc, writeBatch, query, orderBy, limit, serverTimestamp, getDocs, runTransaction, where, WriteBatch, deleteDoc, arrayUnion } from 'firebase/firestore';
import type { UserProfile, UserProgress, DashboardData, Notification as NotificationType, ExamHistoryItem, PrivateChat } from './types';
import { Login } from './components/Login';
import { SignUp } from './components/SignUp';
import { Onboarding } from './components/Onboarding';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { StudyGuide } from './components/StudyGuide';
import { Chat } from './components/Chat';
import { VisualSolver } from './components/VisualSolver';
import { Exam } from './components/Exam';
import { Leaderboard } from './components/Leaderboard';
import { Settings } from './components/Settings';
import Help from './components/Help';
import { NotificationsPanel } from './components/NotificationsPanel';
import { BottomNavBar } from './components/BottomNavBar';
import { useToast } from './hooks/useToast';
import { navigationItems } from './constants';
import { Messenger } from './components/Messenger';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import GuidedTour, { TourStep } from './components/GuidedTour';

declare var __app_id: string;

const getWeekId = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${weekNo}`;
};

const AppLoader: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100" role="status" aria-label="Loading application">
      <svg className="w-24 h-24 loader-logo" viewBox="0 0 52 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="loader-path-1" d="M4.33331 17.5L26 4.375L47.6666 17.5L26 30.625L4.33331 17.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path className="loader-path-2" d="M41.5 21V29.75C41.5 30.825 40.85 32.55 39.4166 33.25L27.75 39.375C26.6666 39.9 25.3333 39.9 24.25 39.375L12.5833 33.25C11.15 32.55 10.5 30.825 10.5 29.75V21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path className="loader-path-3" d="M47.6667 17.5V26.25" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
};

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [userProgress, setUserProgress] = useState<UserProgress>({});
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [notifications, setNotifications] = useState<NotificationType[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isProfileLoading, setIsProfileLoading] = useState(true);
    const [isOnboarding, setIsOnboarding] = useState(false);
    const [authView, setAuthView] = useState<'login' | 'signup'>('login');
    
    const [activeItem, setActiveItem] = useState('dashboard');
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
    const [chatInitiationData, setChatInitiationData] = useState<{ image: string; tutorialText: string } | null>(null);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [isTourOpen, setIsTourOpen] = useState(false);


    const { addToast } = useToast();
    const initialNotificationsLoaded = useRef(false);
    const initialMessagesLoaded = useRef(false);
    const chatsRef = useRef<PrivateChat[]>([]);
    const sessionStartRef = useRef<number | null>(null);
    const tourStatusRef = useRef<'unknown' | 'checked' | 'shown'>('unknown');

    const triggerPushNotification = useCallback(async (title: string, message: string) => {
        if (userProfile?.notificationsEnabled && 'serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(title, {
                    body: message,
                    icon: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20viewBox%3D%220%200%2052%2042%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M4.33331%2017.5L26%204.375L47.6666%2017.5L26%2030.625L4.33331%2017.5Z%22%20stroke%3D%22%2523A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M41.5%2021V29.75C41.5%2030.825%2040.85%2032.55%2039.4166%2033.25L27.75%2039.375C26.6666%2039.9%2025.3333%2039.9%2024.25%2039.375L12.5833%2033.25C11.15%2032.55%2010.5%2030.825%2010.5%2029.75V21%22%20stroke%3D%22%2523A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M47.6667%2017.5V26.25%22%20stroke%3D%22%2523A3E635%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E',
                    badge: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20viewBox%3D%220%200%2052%2042%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M4.33331%2017.5L26%204.375L47.6666%2017.5L26%2030.625L4.33331%2017.5Z%22%20fill%3D%22%2523FFFFFF%22%2F%3E%3C%2Fsvg%3E'
                });
            } catch (err) {
                console.error('Error showing notification:', err);
            }
        }
    }, [userProfile]);

    const startTour = useCallback(() => {
        setActiveItem('dashboard'); // Reset to a known state for the tour
        setTimeout(() => setIsTourOpen(true), 300); // Small delay to allow UI to settle
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const logSessionEnd = useCallback(async () => {
        if (!userProfile || !sessionStartRef.current) return;
    
        const endTime = Date.now();
        const durationSeconds = Math.round((endTime - sessionStartRef.current) / 1000);
        
        if (durationSeconds > 5) { // Only log sessions longer than 5 seconds
            const activityRef = doc(db, 'userActivity', userProfile.uid);
            const sessionEntry = {
                startTime: sessionStartRef.current,
                endTime,
                durationSeconds,
            };
            try {
                await updateDoc(activityRef, { sessionHistory: arrayUnion(sessionEntry) });
            } catch (e) {
                 try {
                    await setDoc(activityRef, { sessionHistory: [sessionEntry] }, { merge: true });
                 } catch (set_e) {
                     console.error("Failed to log session end:", set_e);
                 }
            }
        }
        sessionStartRef.current = null; // Prevent duplicate logging
    }, [userProfile]);
    
    // Presence Management and Session End Logging
    useEffect(() => {
        if (!user) return;
    
        const userStatusRef = doc(db, 'users', user.uid);
        updateDoc(userStatusRef, { isOnline: true });
    
        window.addEventListener('beforeunload', logSessionEnd);
    
        return () => {
            window.removeEventListener('beforeunload', logSessionEnd);
            logSessionEnd();
            updateDoc(userStatusRef, {
                isOnline: false,
                lastSeen: serverTimestamp()
            });
        };
    }, [user, logSessionEnd]);

    const handleProfileUpdate = useCallback(async (updatedData: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
        if (!user) return { success: false, error: 'User not authenticated.' };
    
        try {
            const authUpdatePayload: { displayName?: string; photoURL?: string } = {};
            if (updatedData.displayName) {
                authUpdatePayload.displayName = updatedData.displayName;
            }
            if (updatedData.photoURL !== undefined) {
                authUpdatePayload.photoURL = updatedData.photoURL;
            }
    
            if (Object.keys(authUpdatePayload).length > 0) {
                await updateProfile(user, authUpdatePayload);
            }
    
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, 'users', user.uid);
                
                if (Object.keys(authUpdatePayload).length > 0) {
                    const overallLeadRef = doc(db, 'leaderboardOverall', user.uid);
                    const weeklyLeadRef = doc(db, 'leaderboardWeekly', user.uid);
    
                    const [overallSnap, weeklySnap] = await Promise.all([
                        transaction.get(overallLeadRef),
                        transaction.get(weeklyLeadRef)
                    ]);
                    
                    transaction.update(userRef, updatedData);
                    if (overallSnap.exists()) transaction.update(overallLeadRef, authUpdatePayload);
                    if (weeklySnap.exists()) transaction.update(weeklyLeadRef, authUpdatePayload);
                } else {
                    transaction.update(userRef, updatedData);
                }
            });
            return { success: true };
        } catch (err: any) {
            console.error("Error updating profile:", err);
            return { success: false, error: err.message };
        }
    }, [user]);
    
    const handleConsent = async (granted: boolean) => {
        setShowPrivacyModal(false);
        await handleProfileUpdate({ privacyConsent: { granted, timestamp: Date.now() } });
    };

    useEffect(() => {
        if (userProfile && !sessionStartRef.current) {
            sessionStartRef.current = Date.now();
    
            if (userProfile.privacyConsent === undefined) {
                setShowPrivacyModal(true);
            }
        }
    }, [userProfile]);

    useEffect(() => {
        if (!user) {
            setUserProfile(null);
            setIsProfileLoading(false);
            return;
        }

        setIsProfileLoading(true);
        const profileRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(profileRef, (docSnap) => {
            if (docSnap.exists()) {
                const profileData = docSnap.data() as UserProfile;
                setUserProfile(profileData);
                setIsOnboarding(false);
                if (tourStatusRef.current === 'unknown') {
                    if (profileData.privacyConsent?.granted && !profileData.hasCompletedTour) {
                        startTour();
                        tourStatusRef.current = 'shown';
                    } else {
                        tourStatusRef.current = 'checked';
                    }
                }
            } else {
                setIsOnboarding(true);
            }
            setIsProfileLoading(false);
        }, (error) => {
            console.error("Error fetching user profile:", error);
            addToast("Failed to load your profile.", "error");
            setIsProfileLoading(false);
        });
        return () => unsubscribe();
    }, [user, addToast, startTour]);
    
    useEffect(() => {
        if (!userProfile) return;
        const progressRef = collection(db, 'users', userProfile.uid, 'progress');
        const unsubscribe = onSnapshot(progressRef, (snapshot) => {
            const progressData: UserProgress = {};
            snapshot.forEach(doc => {
                progressData[doc.id] = doc.data() as { isComplete: boolean; xpEarned: number; };
            });
            setUserProgress(progressData);
        });
        return () => unsubscribe();
    }, [userProfile]);

    useEffect(() => {
        if (!userProfile) {
            setUnreadMessagesCount(0);
            return;
        };
        
        let unsubNotifications: () => void;
        let unsubMessages: () => void;

        const setupListeners = async () => {
            try {
                // Fetch Total Topics Count
                const courseDocRef = doc(db, `artifacts/${__app_id}/public/data/courses`, userProfile.courseId);
                const courseSnap = await getDoc(courseDocRef);
                const totalTopics = courseSnap.exists() ? (courseSnap.data().subjectList || []).reduce((acc: number, subject: any) => acc + (subject.topics?.length || 0), 0) : 0;
                
                // Fetch Exam History
                const historyRef = collection(db, 'users', userProfile.uid, 'examHistory');
                const historyQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(5));
                const historySnapshot = await getDocs(historyQuery);
                const examHistory = historySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ExamHistoryItem));

                // Fetch XP History
                const xpHistoryRef = collection(db, 'users', userProfile.uid, 'xpHistory');
                const xpHistoryQuery = query(xpHistoryRef, orderBy('date', 'desc'), limit(30));
                const xpHistorySnapshot = await getDocs(xpHistoryQuery);
                const xpHistory = xpHistorySnapshot.docs.map(d => d.data() as { date: string, xp: number }).reverse();

                setDashboardData({ totalTopics, examHistory, xpHistory });

                // Notifications listener
                const notificationsRef = collection(db, 'users', userProfile.uid, 'notifications');
                const notificationsQuery = query(notificationsRef, orderBy('timestamp', 'desc'), limit(20));
                unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
                    const fetchedNotifications: NotificationType[] = [];
                    
                    if (initialNotificationsLoaded.current) {
                        snapshot.docChanges().forEach((change) => {
                            if (change.type === "added") {
                                const newNotif = change.doc.data() as NotificationType;
                                triggerPushNotification(newNotif.title, newNotif.message);
                            }
                        });
                    }

                    snapshot.forEach(doc => fetchedNotifications.push({ id: doc.id, ...doc.data() } as NotificationType));
                    setNotifications(fetchedNotifications);

                    if (!initialNotificationsLoaded.current) {
                        initialNotificationsLoaded.current = true;
                    }
                });

                // Private Messages listener for count and notifications
                const privateChatsCollectionRef = collection(db, 'privateChats');
                const privateChatsQuery = query(privateChatsCollectionRef, where('members', 'array-contains', userProfile.uid));
                unsubMessages = onSnapshot(privateChatsQuery, (snapshot) => {
                    let count = 0;
                    const newChats: PrivateChat[] = [];

                    if (initialMessagesLoaded.current) {
                        snapshot.docChanges().forEach((change) => {
                            if (change.type === "modified") {
                                const newData = change.doc.data() as PrivateChat;
                                const oldData = chatsRef.current.find(c => c.id === change.doc.id);

                                if (
                                    newData.lastMessage && 
                                    newData.lastMessage.senderId !== userProfile.uid &&
                                    (!oldData?.lastMessage || newData.lastMessage.timestamp > oldData.lastMessage.timestamp)
                                ) {
                                     const senderName = newData.memberInfo[newData.lastMessage.senderId]?.displayName || 'Someone';
                                     const messageText = newData.lastMessage.text || 'Sent an image';
                                     triggerPushNotification(`New message from ${senderName}`, messageText);
                                }
                            }
                        });
                    }

                    snapshot.forEach(doc => {
                        const chat = { id: doc.id, ...doc.data() } as PrivateChat;
                        newChats.push(chat);
                        if (chat.lastMessage && !chat.lastMessage.readBy?.includes(userProfile.uid)) {
                            count++;
                        }
                    });

                    chatsRef.current = newChats;
                    setUnreadMessagesCount(count);

                    if (!initialMessagesLoaded.current) {
                        initialMessagesLoaded.current = true;
                    }
                });


            } catch (error) {
                console.error("Error setting up dashboard/notification listeners:", error);
            }
        };

        setupListeners();
        return () => {
            unsubNotifications && unsubNotifications();
            unsubMessages && unsubMessages();
            initialNotificationsLoaded.current = false;
            initialMessagesLoaded.current = false;
        }
    }, [userProfile, triggerPushNotification]);


    const handleLogout = async () => {
        try {
            await logSessionEnd();
            if(user) {
              const userStatusRef = doc(db, 'users', user.uid);
              await updateDoc(userStatusRef, {
                  isOnline: false,
                  lastSeen: serverTimestamp()
              });
            }
            await signOut(auth);
            setUser(null);
            setUserProfile(null);
            setActiveItem('dashboard');
            tourStatusRef.current = 'unknown';
        } catch (error) {
            console.error("Logout failed:", error);
            addToast("Failed to log out. Please try again.", "error");
        }
    };
    
    const handleOnboardingComplete = async (profileData: { courseId: string; level: string }) => {
        if (!user) return;
        const now = Date.now();
        const newUserProfile: UserProfile = {
            uid: user.uid,
            displayName: user.displayName || 'Learner',
            photoURL: user.photoURL || '',
            courseId: profileData.courseId,
            level: profileData.level,
            totalXP: 0,
            totalTestXP: 0,
            currentStreak: 0,
            lastActivityDate: now,
            notificationsEnabled: false,
            isOnline: true,
            lastSeen: now,
            hasCompletedTour: false,
        };
        try {
            const batch = writeBatch(db);
            const userRef = doc(db, 'users', user.uid);
            batch.set(userRef, newUserProfile);
            
            const notificationRef = doc(collection(db, 'users', user.uid, 'notifications'));
            const notificationData = {
                type: 'welcome' as const,
                title: 'Welcome to VANTUTOR!',
                message: 'Your learning journey starts now. Explore the study guide to begin.',
            };
            batch.set(notificationRef, {
                ...notificationData,
                timestamp: serverTimestamp(),
                isRead: false,
            });
            await batch.commit();
            
            setUserProfile(newUserProfile);
            setIsOnboarding(false);
        } catch (error) {
            console.error("Failed to complete onboarding:", error);
            addToast("Could not save your profile. Please try again.", "error");
        }
    };

    const handleXPEarned = useCallback(async (xp: number, type: 'lesson' | 'test' = 'lesson') => {
        if (!userProfile) return;
        const today = new Date().toISOString().split('T')[0];
        const weekId = getWeekId(new Date());

        try {
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, 'users', userProfile.uid);
                const xpHistoryRef = doc(db, 'users', userProfile.uid, 'xpHistory', today);
                const overallLeadRef = doc(db, 'leaderboardOverall', userProfile.uid);
                const weeklyLeadRef = doc(db, 'leaderboardWeekly', userProfile.uid);

                const [userSnap, xpHistorySnap, overallLeadSnap, weeklyLeadSnap] = await Promise.all([
                    transaction.get(userRef),
                    transaction.get(xpHistoryRef),
                    transaction.get(overallLeadRef),
                    transaction.get(weeklyLeadRef)
                ]);

                if (!userSnap.exists()) throw new Error("User does not exist!");
                const currentProfile = userSnap.data() as UserProfile;

                const xpField = type === 'test' ? 'totalTestXP' : 'totalXP';
                transaction.update(userRef, { [xpField]: currentProfile[xpField] + xp });

                const currentDailyXP = xpHistorySnap.exists() ? xpHistorySnap.data().xp : 0;
                transaction.set(xpHistoryRef, { date: today, xp: currentDailyXP + xp }, { merge: true });

                const overallXP = (currentProfile.totalXP + currentProfile.totalTestXP) + xp;
                const leaderboardPayload = { 
                    uid: userProfile.uid, 
                    displayName: userProfile.displayName, 
                    photoURL: userProfile.photoURL || "",
                    xp: overallXP 
                };

                if (overallLeadSnap.exists()) {
                    transaction.update(overallLeadRef, { xp: overallXP });
                } else {
                    transaction.set(overallLeadRef, leaderboardPayload);
                }

                if (weeklyLeadSnap.exists() && weeklyLeadSnap.data().weekId === weekId) {
                    transaction.update(weeklyLeadRef, { xp: weeklyLeadSnap.data().xp + xp });
                } else {
                    transaction.set(weeklyLeadRef, { ...leaderboardPayload, xp, weekId });
                }
            });
        } catch (error) {
            console.error("Failed to update XP:", error);
            addToast("There was an issue recording your XP.", "error");
        }
    }, [userProfile, addToast]);

    const handleMarkNotificationRead = async (id: string) => {
        if (!user) return;
        const notifRef = doc(db, 'users', user.uid, 'notifications', id);
        try {
            await deleteDoc(notifRef);
        } catch (error) {
            console.error("Error deleting notification:", error);
            addToast("Could not clear notification.", "error");
        }
    };

    const handleMarkAllNotificationsRead = async () => {
        if (!user) return;
        const unread = notifications.filter(n => !n.isRead);
        if (unread.length === 0) return;
        try {
            const batch = writeBatch(db);
            unread.forEach(n => {
                const notifRef = doc(db, 'users', user.uid, 'notifications', n.id);
                batch.delete(notifRef);
            });
            await batch.commit();
            addToast(`${unread.length} notification${unread.length > 1 ? 's' : ''} cleared.`, 'success');
        } catch (error) {
            console.error("Error clearing notifications:", error);
            addToast("Could not clear notifications.", "error");
        }
    };

    const deleteSubcollection = async (batch: WriteBatch, collectionPath: string) => {
        const collectionRef = collection(db, collectionPath);
        const snapshot = await getDocs(collectionRef);
        snapshot.forEach(doc => batch.delete(doc.ref));
    };

    const handleAccountDeletion = async (): Promise<{ success: boolean; error?: string }> => {
        const currentUser = auth.currentUser;
        if (!currentUser) return { success: false, error: 'User not authenticated.' };
        
        try {
            const batch = writeBatch(db);

            // 1. Delete all subcollections under the user's document
            // Chat conversations and their messages
            const convosRef = collection(db, 'users', currentUser.uid, 'chatConversations');
            const convosSnap = await getDocs(convosRef);
            for (const convoDoc of convosSnap.docs) {
                await deleteSubcollection(batch, `users/${currentUser.uid}/chatConversations/${convoDoc.id}/messages`);
                batch.delete(convoDoc.ref);
            }
            // Other subcollections
            const otherSubcollections = ['progress', 'examHistory', 'xpHistory', 'notifications'];
            for (const sub of otherSubcollections) {
                await deleteSubcollection(batch, `users/${currentUser.uid}/${sub}`);
            }

            // 2. Delete main user document and activity log
            const userDocRef = doc(db, 'users', currentUser.uid);
            batch.delete(userDocRef);
            const activityDocRef = doc(db, 'userActivity', currentUser.uid);
            batch.delete(activityDocRef);

            // 3. Delete leaderboard entries
            const overallLeadRef = doc(db, 'leaderboardOverall', currentUser.uid);
            batch.delete(overallLeadRef);
            const weeklyLeadRef = doc(db, 'leaderboardWeekly', currentUser.uid);
            batch.delete(weeklyLeadRef);
            
            // 4. Delete private chats
            const privateChatsQuery = query(collection(db, 'privateChats'), where('members', 'array-contains', currentUser.uid));
            const privateChatsSnapshot = await getDocs(privateChatsQuery);
            for (const chatDoc of privateChatsSnapshot.docs) {
                await deleteSubcollection(batch, `privateChats/${chatDoc.id}/messages`);
                batch.delete(chatDoc.ref);
            }

            await batch.commit();

            // 5. Delete storage data (profile picture) - best effort
            try {
                await supabase.storage.from('profile-pictures').remove([currentUser.uid]);
            } catch (storageError: any) {
                // Supabase client might throw an error if object not found, which is fine.
                // Log other errors as a warning.
                if (storageError.message !== 'The resource was not found') {
                    console.warn("Could not delete profile picture from Supabase:", storageError);
                }
            }
            
            // 6. Delete Firebase Auth user
            await deleteUser(currentUser);

            addToast('Your account has been successfully deleted.', 'success');
            return { success: true };
        } catch (error: any) {
            console.error("Error deleting account:", error);
            if (error.code === 'auth/requires-recent-login') {
                return { success: false, error: 'This is a sensitive operation. Please log out and log back in before trying again.' };
            }
            return { success: false, error: 'An error occurred while deleting your account. Please try again later.' };
        }
    };

    const handleStartChatFromTutorial = useCallback((image: string, tutorialText: string) => {
        setChatInitiationData({ image, tutorialText });
        setActiveItem('chat');
    }, []);
    
    const handleTourClose = (completed: boolean) => {
        setIsTourOpen(false);
        if (completed && userProfile && !userProfile.hasCompletedTour) {
            handleProfileUpdate({ hasCompletedTour: true });
        }
    };
    
    const isMobile = window.innerWidth < 768;

    const tourSteps: TourStep[] = [
      {
        target: 'body',
        title: '👋 Welcome to VANTUTOR!',
        content: "Let's take a quick tour of your new learning dashboard.",
        placement: 'center',
      },
      {
        target: '[data-tour-id="dashboard-content"]',
        title: '📊 Your Dashboard',
        content: 'View your progress, streaks, and personalized lessons.',
        placement: 'bottom',
      },
      {
        target: isMobile ? '[data-tour-id="bottomnav-study_guide"]' : '[data-tour-id="sidebar-study_guide"]',
        title: '📚 Study Guide',
        content: 'Explore tutorials and start new lessons anytime.',
        placement: isMobile ? 'top' : 'right',
      },
      {
        target: isMobile ? '[data-tour-id="bottomnav-chat"]' : '[data-tour-id="sidebar-chat"]',
        title: '💬 AI Tutor Chat',
        content: 'Chat with your AI tutor and ask any questions.',
        placement: isMobile ? 'top' : 'right',
      },
      {
        target: isMobile ? '[data-tour-id="bottomnav-visual_solver"]' : '[data-tour-id="sidebar-visual_solver"]',
        title: '📸 Visual Solver',
        content: 'Scan any problem and get instant or detailed tutorials.',
        placement: isMobile ? 'top' : 'right',
      },
      {
        target: isMobile ? '[data-tour-id="bottomnav-messenger"]' : '[data-tour-id="header-messenger"]',
        title: '🤝 Messenger',
        content: 'Connect with other learners and chat privately.',
        placement: isMobile ? 'top' : 'bottom',
      },
      ...(isMobile ? [{
        target: '[data-tour-id="mobile-menu-button"]',
        title: '⚙️ Main Menu',
        content: 'Access your settings, help, and logout options from here.',
        placement: 'bottom' as const,
      }] : [{
        target: '[data-tour-id="sidebar-settings"]',
        title: '⚙️ Settings',
        content: 'Update your info and view your achievements.',
        placement: 'top' as const,
      }]),
      {
        target: 'body',
        title: "🎉 You're all set!",
        content: 'Enjoy exploring your learning journey. Tap "Finish" to start!',
        placement: 'center',
      },
    ];

    const renderContent = () => {
        if (!userProfile) return null;
        switch (activeItem) {
            case 'dashboard': return <Dashboard userProfile={userProfile} userProgress={userProgress} dashboardData={dashboardData} />;
            case 'study_guide': return <StudyGuide userProfile={userProfile} onXPEarned={(xp) => handleXPEarned(xp, 'lesson')} />;
            case 'chat': return <Chat userProfile={userProfile} initiationData={chatInitiationData} onInitiationComplete={() => setChatInitiationData(null)} />;
            case 'visual_solver': return <VisualSolver userProfile={userProfile} onStartChat={handleStartChatFromTutorial} />;
            case 'exam': return <Exam userProfile={userProfile} userProgress={userProgress} onXPEarned={(xp) => handleXPEarned(xp, 'test')} />;
            case 'leaderboard': return <Leaderboard userProfile={userProfile} />;
            case 'settings': return <Settings user={user} userProfile={userProfile} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} onDeleteAccount={handleAccountDeletion} />;
            case 'help': return <Help onStartTour={startTour} />;
            case 'messenger': return <Messenger userProfile={userProfile} />;
            default: return <Dashboard userProfile={userProfile} userProgress={userProgress} dashboardData={dashboardData} />;
        }
    };
    
    if (isLoading || isProfileLoading) {
        return <AppLoader />;
    }

    if (!user) {
        return authView === 'login' 
            ? <Login onSwitchToSignUp={() => setAuthView('signup')} /> 
            : <SignUp onSwitchToLogin={() => setAuthView('login')} />;
    }

    if (isOnboarding) {
        return <Onboarding user={user} onOnboardingComplete={handleOnboardingComplete} />;
    }
    
    if (!userProfile) { // Should be covered by loading, but as a fallback
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <p>An error occurred loading your profile. Please refresh.</p>
            </div>
        );
    }

    const unreadCount = notifications.filter(n => !n.isRead).length;
    const currentPageLabel = activeItem === 'messenger' 
        ? 'Messenger' 
        : (navigationItems.find(item => item.id === activeItem)?.label || 'Dashboard');

    return (
        <div className="h-full flex flex-col md:flex-row bg-gray-100 p-2 md:p-4 gap-4">
            <Sidebar
                activeItem={activeItem}
                onItemClick={setActiveItem}
                isExpanded={isSidebarExpanded}
                onMouseEnter={() => setIsSidebarExpanded(true)}
                onMouseLeave={() => setIsSidebarExpanded(false)}
                userProfile={userProfile}
                onLogout={handleLogout}
                isMobileSidebarOpen={isMobileSidebarOpen}
                onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
            />
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header 
                    currentPageLabel={currentPageLabel}
                    unreadCount={unreadCount}
                    onNotificationsClick={() => setIsNotificationsPanelOpen(true)}
                    onMenuClick={() => setIsMobileSidebarOpen(true)}
                    onMessengerClick={() => setActiveItem('messenger')}
                    unreadMessagesCount={unreadMessagesCount}
                />
                <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden content-with-bottom-nav">
                    {renderContent()}
                </div>
            </main>
            {showPrivacyModal && <PrivacyConsentModal onAllow={() => handleConsent(true)} onDeny={() => handleConsent(false)} />}
            <NotificationsPanel
                notifications={notifications}
                isOpen={isNotificationsPanelOpen}
                onClose={() => setIsNotificationsPanelOpen(false)}
                onMarkAsRead={handleMarkNotificationRead}
                onMarkAllAsRead={handleMarkAllNotificationsRead}
            />
            <BottomNavBar
              activeItem={activeItem}
              onItemClick={setActiveItem}
              isVisible={!isMobileSidebarOpen}
            />
            <GuidedTour 
                steps={tourSteps}
                isOpen={isTourOpen}
                onClose={handleTourClose}
            />
        </div>
    );
};

export default App;