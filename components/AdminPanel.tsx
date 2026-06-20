import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { ref as dbRef, get } from 'firebase/database';
import type { UserProfile } from '../types';
import { getWindowPathname } from '../utils/pathname';
import { AdminLayout, AdminTab } from './admin/AdminLayout';
import { DashboardView } from './admin/pages/DashboardView';
import { AcademicUnitsView } from './admin/pages/AcademicUnitsView';
import { UserControlView } from './admin/pages/UserControlView';
import { SystemSettingsView } from './admin/pages/SystemSettingsView';
import { PaymentsAndUsageView } from './admin/pages/PaymentsAndUsageView';
import { PastQuestionsView } from './admin/pages/PastQuestionsView';
import { CourseCatalogView } from './admin/pages/CourseCatalogView';

export const AdminPanel: React.FC = () => {
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [pathname, setPathname] = useState(() => getWindowPathname());
    
    // Derived state for the active tab from the URL
    const activeTab = (pathname.split('/admin/')[1] || 'dashboard') as AdminTab;

    useEffect(() => {
        const handlePopState = () => {
            setPathname(getWindowPathname());
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        if (!auth.currentUser) return;
        get(dbRef(db, `users/${auth.currentUser.uid}`)).then(snap => {
            if (snap.exists()) {
                setUserProfile(snap.val() as UserProfile);
            }
        });
    }, []);

    const handleNavigate = (tab: AdminTab) => {
        const nextPath = `/admin/${tab}`;
        window.history.pushState(null, '', nextPath);
        setPathname(nextPath);
    };

    const handleLogout = () => {
        auth.signOut();
        window.location.href = '/';
    };

    if (!userProfile) return null;

    return (
        <AdminLayout
            userProfile={userProfile}
            activeTab={activeTab}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
        >
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'departments' && <AcademicUnitsView />}
            {activeTab === 'courses' && <CourseCatalogView />}
            {activeTab === 'questions' && <PastQuestionsView />}
            {activeTab === 'users' && <UserControlView />}
            {(activeTab === 'payments' || activeTab === 'usage-analytics') && <PaymentsAndUsageView />}
            {(activeTab === 'app' || activeTab === 'email-configs') && <SystemSettingsView />}
        </AdminLayout>
    );
};
