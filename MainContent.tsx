import React from 'react';
import type { User } from '@supabase/supabase-js';
import type { UserProfile, UserProgress, DashboardData } from './types';
import { Dashboard } from './components/Dashboard';
import { StudyGuide } from './components/StudyGuide';
import { Chat } from './components/Chat';
import { VisualSolver } from './components/VisualSolver';
import { Exam } from './components/Exam';
import { Leaderboard } from './components/Leaderboard';
import { Settings } from './components/Settings';
import Help from './components/Help';
import { Messenger } from './components/Messenger';

interface MainContentProps {
    activeItem: string;
    user: User | null;
    userProfile: UserProfile;
    userProgress: UserProgress;
    dashboardData: DashboardData | null;
    chatInitiationData: { image: string; tutorialText: string } | null;
    onInitiationComplete: () => void;
    handleXPEarned: (xp: number, type?: 'lesson' | 'test') => void;
    handleLogout: () => void;
    handleProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string; }>;
    handleDeleteAccount: () => Promise<{ success: boolean; error?: string; }>;
    handleStartChatFromTutorial: (image: string, tutorialText: string) => void;
    startTour: () => void;
}

export const MainContent: React.FC<MainContentProps> = ({
    activeItem,
    user,
    userProfile,
    userProgress,
    dashboardData,
    chatInitiationData,
    onInitiationComplete,
    handleXPEarned,
    handleLogout,
    handleProfileUpdate,
    handleDeleteAccount,
    handleStartChatFromTutorial,
    startTour,
}) => {
    if (!userProfile) return null;

    switch (activeItem) {
        case 'dashboard':
            return <Dashboard userProfile={userProfile} userProgress={userProgress} dashboardData={dashboardData} />;
        case 'study_guide':
            return <StudyGuide userProfile={userProfile} onXPEarned={(xp) => handleXPEarned(xp, 'lesson')} />;
        case 'chat':
            return <Chat userProfile={userProfile} initiationData={chatInitiationData} onInitiationComplete={onInitiationComplete} />;
        case 'visual_solver':
            return <VisualSolver userProfile={userProfile} onStartChat={handleStartChatFromTutorial} />;
        case 'exam':
            return <Exam userProfile={userProfile} userProgress={userProgress} onXPEarned={(xp) => handleXPEarned(xp, 'test')} />;
        case 'leaderboard':
            return <Leaderboard userProfile={userProfile} />;
        case 'settings':
            return <Settings user={user} userProfile={userProfile} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} onDeleteAccount={handleDeleteAccount} />;
        case 'help':
            return <Help onStartTour={startTour} />;
        case 'messenger':
            return <Messenger userProfile={userProfile} />;
        default:
            return <Dashboard userProfile={userProfile} userProgress={userProgress} dashboardData={dashboardData} />;
    }
};
