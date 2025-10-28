import React, { useState, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, increment, runTransaction, collection, onSnapshot, query, orderBy, limit, getDocs, addDoc, writeBatch } from 'firebase/firestore';
import type { UserProfile, UserProgress, ExamHistoryItem, Subject, DashboardData, Notification } from './types';
import { navigationItems, secondaryNavigationItems } from './constants';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NotificationsPanel } from './components/NotificationsPanel';
import { Dashboard } from './components/Dashboard';
import { Onboarding } from './components/Onboarding';
import { StudyGuide } from './components/StudyGuide';
import { Chat } from './components/Chat';
import { Exam } from './components/Exam';
import { Leaderboard } from './components/Leaderboard';
import { Settings } from './components/Settings';
import Help from './components/Help';
import { SignUp } from './components/SignUp';
import { Login } from './components/Login';
import { Subscription } from './components/Subscription';
import { VisualSolver } from './components/VisualSolver';
import { BottomNavBar } from './components/BottomNavBar';

declare var __app_id: string;

const getWeekId = (date: Date): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${weekNo}`;
};


const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-100">
    <div className="w-16 h-16 border-4 border-t-lime-500 border-gray-300 rounded-full animate-spin"></div>
  </div>
);

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userProgress, setUserProgress] = useState<UserProgress>({});
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePage, setActivePage] = useState('dashboard');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [authScreen, setAuthScreen] = useState<'signup' | 'login'>('signup');
  const sidebarLeaveTimer = useRef<number | null>(null);


  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setUserProfile(null);
        setUserProgress({});
        setNotifications([]);
        setIsLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribeProgress: (() => void) | undefined;
    let unsubscribeNotifications: (() => void) | undefined;

    const setupUserSubscriptions = async () => {
        // Profile Subscription
        const userProfileRef = doc(db, 'users', user.uid);
        unsubscribeProfile = onSnapshot(userProfileRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // FIX: Provide default values for fields that may not exist on older user documents
                // to prevent 'undefined' values from being passed to Firestore transactions.
                const profile: UserProfile = {
                    uid: data.uid,
                    displayName: data.displayName,
                    courseId: data.courseId,
                    level: data.level,
                    totalXP: data.totalXP || 0,
                    totalTestXP: data.totalTestXP || 0,
                    plan: data.plan || 'free',
                    currentStreak: data.currentStreak || 0,
                    lastActivityDate: data.lastActivityDate || 0,
                };
                setUserProfile(profile);
            } else {
                setUserProfile(null); // Onboarding needed
            }
            setIsLoading(false);
        });

        // Progress Subscription
        const progressColRef = collection(db, 'users', user.uid, 'progress');
        unsubscribeProgress = onSnapshot(progressColRef, (snapshot) => {
            const progressData: UserProgress = {};
            snapshot.forEach(doc => {
                progressData[doc.id] = doc.data() as { isComplete: boolean; xpEarned: number; };
            });
            setUserProgress(progressData);
        });

        // Notifications Subscription
        const notificationsRef = collection(db, 'users', user.uid, 'notifications');
        const q = query(notificationsRef, orderBy('timestamp', 'desc'));
        unsubscribeNotifications = onSnapshot(q, (snapshot) => {
            const fetchedNotifications: Notification[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                fetchedNotifications.push({ id: doc.id, ...data } as Notification);
            });
            setNotifications(fetchedNotifications);
        });
    }

    setupUserSubscriptions();

    return () => {
        if (sidebarLeaveTimer.current) clearTimeout(sidebarLeaveTimer.current);
        if (unsubscribeProfile) unsubscribeProfile();
        if (unsubscribeProgress) unsubscribeProgress();
        if (unsubscribeNotifications) unsubscribeNotifications();
    };

  }, [user]);

  useEffect(() => {
    if (isMobileSidebarOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    if (!userProfile) {
        setDashboardData(null);
        return;
    }

    const fetchData = async () => {
        try {
            const uid = userProfile.uid;

            // Fetch course data for total topics count
            const courseDocRef = doc(db, `artifacts/${__app_id}/public/data/courses`, userProfile.courseId);
            const courseSnap = await getDoc(courseDocRef);
            let totalTopics = 0;
            if (courseSnap.exists()) {
                const subjects: Subject[] = courseSnap.data().subjectList || [];
                totalTopics = subjects.reduce((acc, subject) => acc + (subject.topics?.length || 0), 0);
            }

            // Fetch recent exam history
            const historyRef = collection(db, 'users', uid, 'examHistory');
            const historyQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(5));
            const historySnapshot = await getDocs(historyQuery);
            const examHistory = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamHistoryItem));
            
            // Fetch and process XP history for the last 30 days
            const today = new Date();
            const xpHistory: { date: string, xp: number }[] = [];
            const dateMap = new Map<string, number>();
            for (let i = 29; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const dateString = d.toISOString().split('T')[0];
                dateMap.set(dateString, 0);
            }
            
            const xpHistoryRef = collection(db, 'users', uid, 'xpHistory');
            const xpHistorySnapshot = await getDocs(xpHistoryRef);
            
            const sortedDocs = xpHistorySnapshot.docs.sort((a, b) => a.id.localeCompare(b.id));
            for (const doc of sortedDocs) {
                if (dateMap.has(doc.id)) {
                    dateMap.set(doc.id, doc.data().totalCombinedXP);
                }
            }

            let previousXP = 0;
            for (const [date, xp] of dateMap.entries()) {
                if (xp === 0) {
                    dateMap.set(date, previousXP);
                } else {
                    previousXP = xp;
                }
                xpHistory.push({ date, xp });
            }

            setDashboardData({ totalTopics, examHistory, xpHistory });

        } catch (error) {
            console.error("Failed to fetch dashboard data:", error);
        }
    };

    fetchData();
  }, [userProfile]);

  const handleOnboardingComplete = async (profileData: { courseId: string; level: string }) => {
    if (!user) return;
    const newProfile: UserProfile = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || `user_${user.uid.substring(0, 5)}`,
      ...profileData,
      totalXP: 0,
      totalTestXP: 0,
      plan: 'free',
      currentStreak: 0,
      lastActivityDate: 0,
    };
    
    try {
      const userProfileRef = doc(db, 'users', user.uid);
      await setDoc(userProfileRef, newProfile);
      
      const welcomeNotification = {
        type: 'welcome',
        title: 'Welcome to VANTUTOR!',
        message: 'We are excited to have you. Explore the Study Guide to get started.',
        timestamp: Date.now(),
        isRead: false,
        link: '/study_guide'
      };
      const notificationsRef = collection(db, 'users', user.uid, 'notifications');
      await addDoc(notificationsRef, welcomeNotification);

      setUserProfile(newProfile);

    } catch (error) {
        console.error("Failed to save user profile:", error);
    }
  };

  const createXpUpdateTransaction = (xp: number, isTestXp: boolean) => async (transaction: any) => {
      if (!user) throw new Error("User not available");

      const userProfileRef = doc(db, 'users', user.uid);
      const weeklyLeaderboardRef = doc(db, 'leaderboardWeekly', user.uid);

      // --- All READS must happen first ---
      const userProfileDoc = await transaction.get(userProfileRef);
      const weeklyDoc = await transaction.get(weeklyLeaderboardRef);
      
      if (!userProfileDoc.exists()) {
        throw new Error("User profile document not found during transaction.");
      }
      const currentProfile: UserProfile = userProfileDoc.data() as UserProfile;

      // --- Calculations based on read data ---
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastActivityDate = new Date(currentProfile.lastActivityDate || 0);
      lastActivityDate.setHours(0, 0, 0, 0);
      
      let newStreak = currentProfile.currentStreak || 0;
      if (lastActivityDate.getTime() < today.getTime()) {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          newStreak = lastActivityDate.getTime() === yesterday.getTime() ? newStreak + 1 : 1;
      }
      
      const newTotalCombinedXP = (currentProfile.totalXP || 0) + (currentProfile.totalTestXP || 0) + xp;
      const todayDateString = new Date().toISOString().split('T')[0];
      const currentWeekId = getWeekId(new Date());

      const overallLeaderboardRef = doc(db, 'leaderboardOverall', user.uid);
      const xpHistoryRef = doc(db, 'users', user.uid, 'xpHistory', todayDateString);

      // --- All WRITES happen last ---
      transaction.update(userProfileRef, {
          [isTestXp ? 'totalTestXP' : 'totalXP']: increment(xp),
          currentStreak: newStreak,
          lastActivityDate: Date.now()
      });
      transaction.set(overallLeaderboardRef, { uid: user.uid, displayName: currentProfile.displayName, xp: newTotalCombinedXP }, { merge: true });
      transaction.set(xpHistoryRef, { totalCombinedXP: newTotalCombinedXP }, { merge: true });

      const weeklyData = weeklyDoc.data();
      if (weeklyDoc.exists() && weeklyData?.weekId === currentWeekId) {
          transaction.update(weeklyLeaderboardRef, { xp: increment(xp) });
      } else {
          transaction.set(weeklyLeaderboardRef, { uid: user.uid, displayName: currentProfile.displayName, xp: xp, weekId: currentWeekId });
      }

      return newStreak;
  };

  const handleStudyXPEarned = async (xp: number) => {
    if (!user || !userProfile) return;
    try {
        const newStreak = await runTransaction(db, createXpUpdateTransaction(xp, false));
        setUserProfile(prev => prev ? { ...prev, totalXP: prev.totalXP + xp, currentStreak: newStreak, lastActivityDate: Date.now() } : null);
    } catch (error) {
        console.error("Failed to update user Study XP:", error);
    }
  };

  const handleXPEarned = async (xp: number) => {
    if (!user || !userProfile) return;
    try {
        const newStreak = await runTransaction(db, createXpUpdateTransaction(xp, true));
        setUserProfile(prev => prev ? { ...prev, totalTestXP: prev.totalTestXP + xp, currentStreak: newStreak, lastActivityDate: Date.now() } : null);
    } catch (error) {
        console.error("Failed to update user Test XP:", error);
    }
  };
  
  const handleProfileUpdate = async (updatedData: Partial<UserProfile>) => {
    if (!user || !userProfile) {
        return { success: false, error: "User not authenticated." };
    }

    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, 'users', user.uid);
            const overallLeaderboardRef = doc(db, 'leaderboardOverall', user.uid);
            const weeklyLeaderboardRef = doc(db, 'leaderboardWeekly', user.uid);
            let overallDoc, weeklyDoc;

            if (updatedData.displayName) {
                overallDoc = await transaction.get(overallLeaderboardRef);
                weeklyDoc = await transaction.get(weeklyLeaderboardRef);
            }
            transaction.update(userRef, updatedData);
            if (updatedData.displayName) {
                if(overallDoc?.exists()) transaction.update(overallLeaderboardRef, { displayName: updatedData.displayName });
                if(weeklyDoc?.exists()) transaction.update(weeklyLeaderboardRef, { displayName: updatedData.displayName });
            }
        });

        setUserProfile(prev => prev ? { ...prev, ...updatedData } : null);
        return { success: true };
    } catch (error) {
        console.error("Failed to update profile:", error);
        return { success: false, error: "Could not update profile. Please try again." };
    }
  };

  const handleMarkNotificationAsRead = async (id: string) => {
    if (!user) return;
    const notificationRef = doc(db, 'users', user.uid, 'notifications', id);
    try {
      await updateDoc(notificationRef, { isRead: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    if (!user) return;
    const unreadNotifications = notifications.filter(n => !n.isRead);
    if (unreadNotifications.length === 0) return;

    const batch = writeBatch(db);
    unreadNotifications.forEach(notification => {
      const notificationRef = doc(db, 'users', user.uid, 'notifications', notification.id);
      batch.update(notificationRef, { isRead: true });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

  const handleNavItemClick = (id: string) => {
    setActivePage(id);
    setIsNotificationsOpen(false);
  };

  const handleSidebarMouseEnter = () => {
    if (sidebarLeaveTimer.current) clearTimeout(sidebarLeaveTimer.current);
    if (window.innerWidth >= 768) setIsSidebarExpanded(true);
  };

  const handleSidebarMouseLeave = () => {
    if (window.innerWidth >= 768) {
      sidebarLeaveTimer.current = window.setTimeout(() => setIsSidebarExpanded(false), 300);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const renderContent = () => {
    if (!userProfile) return null;

    switch(activePage) {
      case 'dashboard':
        return <Dashboard userProfile={userProfile} userProgress={userProgress} dashboardData={dashboardData} />;
      case 'study_guide':
        return <StudyGuide userProfile={userProfile} onStudyXPEarned={handleStudyXPEarned} />;
      case 'chat':
        return <Chat userProfile={userProfile} />;
      case 'visual_solver':
        return <VisualSolver userProfile={userProfile} />;
      case 'exam':
        return <Exam userProfile={userProfile} onXPEarned={handleXPEarned} userProgress={userProgress} />;
      case 'leaderboard':
        return <Leaderboard userProfile={userProfile} />;
      case 'subscription':
        return <Subscription user={user} userProfile={userProfile} onProfileUpdate={handleProfileUpdate} />;
      case 'settings':
        return <Settings user={user} userProfile={userProfile} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} />;
      case 'help':
        return <Help />;
      default:
        return <Dashboard userProfile={userProfile} userProgress={userProgress} dashboardData={dashboardData} />;
    }
  }

  if (isLoading) return <LoadingSpinner />;

  if (!user) {
    if (authScreen === 'signup') return <SignUp onSwitchToLogin={() => setAuthScreen('login')} />;
    return <Login onSwitchToSignUp={() => setAuthScreen('signup')} />;
  }
  
  if (!userProfile) return <Onboarding user={user} onOnboardingComplete={handleOnboardingComplete} />;
  
  const allNavItems = [...navigationItems, ...secondaryNavigationItems];
  const currentPageLabel = allNavItems.find(item => item.id === activePage)?.label || 'Dashboard';
  const unreadNotificationsCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="h-screen bg-gray-100 text-gray-800 font-sans md:p-6 lg:p-8 flex md:gap-6 lg:gap-8">
      <Sidebar
        activeItem={activePage}
        onItemClick={handleNavItemClick}
        isExpanded={isSidebarExpanded}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        displayName={userProfile.displayName}
        onLogout={handleLogout}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
      />
      <main className="flex-1 bg-white md:border border-gray-200 md:rounded-2xl flex flex-col relative overflow-hidden pb-28 md:pb-0">
        <Header
          currentPageLabel={currentPageLabel}
          onNotificationsClick={() => setIsNotificationsOpen(prev => !prev)}
          unreadCount={unreadNotificationsCount}
          onMenuClick={() => setIsMobileSidebarOpen(true)}
        />
        <NotificationsPanel
            notifications={notifications}
            isOpen={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            onMarkAllAsRead={handleMarkAllNotificationsAsRead}
            onMarkAsRead={handleMarkNotificationAsRead}
        />
        <div className="flex-1 min-h-0">
          {renderContent()}
        </div>
      </main>
      <BottomNavBar
        activeItem={activePage}
        onItemClick={handleNavItemClick}
        isVisible={!!userProfile}
      />
    </div>
  );
}

export default App;