import React, { useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, updateDoc, writeBatch, query, orderBy, limit, serverTimestamp, getDocs, runTransaction } from 'firebase/firestore';
import type { UserProfile, UserProgress, DashboardData, Notification as NotificationType, ExamHistoryItem } from './types';
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

declare var __app_id: string;

const getWeekId = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${weekNo}`;
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
    
    const { addToast } = useToast();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

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
    }, [user, addToast]);
    
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
        if (!userProfile) return;
        
        let unsubNotifications: () => void;
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
                    snapshot.forEach(doc => fetchedNotifications.push({ id: doc.id, ...doc.data() } as NotificationType));
                    setNotifications(fetchedNotifications);
                });
            } catch (error) {
                console.error("Error setting up dashboard/notification listeners:", error);
            }
        };

        setupListeners();
        return () => unsubNotifications && unsubNotifications();
    }, [userProfile]);


    const handleLogout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            setUserProfile(null);
            setActiveItem('dashboard');
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
            courseId: profileData.courseId,
            level: profileData.level,
            totalXP: 0,
            totalTestXP: 0,
            currentStreak: 0,
            lastActivityDate: now,
        };
        try {
            const batch = writeBatch(db);
            const userRef = doc(db, 'users', user.uid);
            batch.set(userRef, newUserProfile);
            
            const notificationRef = doc(collection(db, 'users', user.uid, 'notifications'));
            batch.set(notificationRef, {
                type: 'welcome',
                title: 'Welcome to VANTUTOR!',
                message: 'Your learning journey starts now. Explore the study guide to begin.',
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

    const handleProfileUpdate = async (updatedData: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
        if (!user || !userProfile) return { success: false, error: 'User not authenticated.' };

        try {
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, 'users', user.uid);
                transaction.update(userRef, updatedData);

                if (updatedData.displayName) {
                    await updateProfile(user, { displayName: updatedData.displayName });
                    const overallLeadRef = doc(db, 'leaderboardOverall', user.uid);
                    const weeklyLeadRef = doc(db, 'leaderboardWeekly', user.uid);
                    transaction.update(overallLeadRef, { displayName: updatedData.displayName });
                    transaction.update(weeklyLeadRef, { displayName: updatedData.displayName });
                }
            });
            return { success: true };
        } catch (err: any) {
            console.error("Error updating profile:", err);
            return { success: false, error: err.message };
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
                if (overallLeadSnap.exists()) {
                    transaction.update(overallLeadRef, { xp: overallXP });
                } else {
                    transaction.set(overallLeadRef, { uid: userProfile.uid, displayName: userProfile.displayName, xp: overallXP });
                }

                if (weeklyLeadSnap.exists() && weeklyLeadSnap.data().weekId === weekId) {
                    transaction.update(weeklyLeadRef, { xp: weeklyLeadSnap.data().xp + xp });
                } else {
                    transaction.set(weeklyLeadRef, { uid: userProfile.uid, displayName: userProfile.displayName, xp, weekId });
                }
            });
            addToast(`+${xp} XP earned!`, 'success');
        } catch (error) {
            console.error("Failed to update XP:", error);
            addToast("There was an issue recording your XP.", "error");
        }
    }, [userProfile, addToast]);

    const handleMarkNotificationRead = async (id: string) => {
        if (!user) return;
        const notifRef = doc(db, 'users', user.uid, 'notifications', id);
        await updateDoc(notifRef, { isRead: true });
    };

    const handleMarkAllNotificationsRead = async () => {
        if (!user) return;
        const unread = notifications.filter(n => !n.isRead);
        if (unread.length === 0) return;
        const batch = writeBatch(db);
        unread.forEach(n => {
            const notifRef = doc(db, 'users', user.uid, 'notifications', n.id);
            batch.update(notifRef, { isRead: true });
        });
        await batch.commit();
    };

    const renderContent = () => {
        if (!userProfile) return null;
        switch (activeItem) {
            case 'dashboard': return <Dashboard userProfile={userProfile} userProgress={userProgress} dashboardData={dashboardData} />;
            case 'study_guide': return <StudyGuide userProfile={userProfile} onXPEarned={(xp) => handleXPEarned(xp, 'lesson')} />;
            case 'chat': return <Chat userProfile={userProfile} />;
            case 'visual_solver': return <VisualSolver userProfile={userProfile} />;
            case 'exam': return <Exam userProfile={userProfile} userProgress={userProgress} onXPEarned={(xp) => handleXPEarned(xp, 'test')} />;
            case 'leaderboard': return <Leaderboard userProfile={userProfile} />;
            case 'settings': return <Settings user={user} userProfile={userProfile} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} />;
            case 'help': return <Help />;
            default: return <Dashboard userProfile={userProfile} userProgress={userProgress} dashboardData={dashboardData} />;
        }
    };
    
    if (isLoading || isProfileLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="w-12 h-12 border-4 border-t-lime-500 border-gray-300 rounded-full animate-spin"></div>
            </div>
        );
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
    const currentPage = navigationItems.find(item => item.id === activeItem);

    return (
        <div className="h-full flex flex-col md:flex-row bg-gray-100 p-2 md:p-4 gap-4">
            <Sidebar
                activeItem={activeItem}
                onItemClick={setActiveItem}
                isExpanded={isSidebarExpanded}
                onMouseEnter={() => setIsSidebarExpanded(true)}
                onMouseLeave={() => setIsSidebarExpanded(false)}
                displayName={userProfile.displayName}
                onLogout={handleLogout}
                isMobileSidebarOpen={isMobileSidebarOpen}
                onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
            />
            <main className="flex-1 flex flex-col min-w-0 pb-24 md:pb-0 overflow-hidden">
                <Header 
                    currentPageLabel={currentPage?.label || 'Dashboard'}
                    unreadCount={unreadCount}
                    onNotificationsClick={() => setIsNotificationsPanelOpen(true)}
                    onMenuClick={() => setIsMobileSidebarOpen(true)}
                />
                {renderContent()}
            </main>
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
        </div>
    );
};

export default App;