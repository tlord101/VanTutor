import React, { useState } from 'react';
import { 
    Home, Building, BookOpen, HelpCircle, Users, Settings, 
    CreditCard, Activity, LogOut, Menu, X, Bell, Shield, 
    ChevronRight, CreditCard as PaymentsIcon, Mail, Smartphone
} from 'lucide-react';
import type { UserProfile } from '../../types';

export type AdminTab = 'dashboard' | 'departments' | 'courses' | 'questions' | 'users' | 'firebase-users' | 'payments' | 'usage-analytics' | 'app' | 'app-updates' | 'email-configs' | 'notifications' | 'emails' | 'usage-settings' | 'purchase-logs' | 'tickets' | 'cofounders' | 'seo';

interface AdminLayoutProps {
    children: React.ReactNode;
    activeTab: AdminTab;
    onNavigate: (tab: AdminTab) => void;
    userProfile: UserProfile;
}

const SIDEBAR_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'departments', label: 'Academic Units', icon: Building },
    { id: 'courses', label: 'Course Catalog', icon: BookOpen },
    { id: 'questions', label: 'Past Questions', icon: HelpCircle },
    { id: 'users', label: 'User Control', icon: Users },
    { id: 'firebase-users', label: 'Auth Users', icon: Shield },
    { id: 'payments', label: 'Payments', icon: PaymentsIcon },
    { id: 'usage-analytics', label: 'Analytics', icon: Activity },
    { id: 'notifications', label: 'Push Notifications', icon: Bell },
    { id: 'emails', label: 'SMTP Emails', icon: Mail },
    { id: 'app', label: 'System Settings', icon: Settings },
    { id: 'app-updates', label: 'App Updates', icon: Smartphone },
    { id: 'tickets', label: 'Support Tickets', icon: Mail },
    { id: 'cofounders', label: 'Co-Founders', icon: Users },
    { id: 'seo', label: 'SEO & Marketing', icon: Activity },
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({ 
    children, activeTab, onNavigate, userProfile 
}) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleNav = (tab: AdminTab) => {
        onNavigate(tab);
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex overflow-hidden selection:bg-lime-200">
            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-black/80 backdrop-blur-xl border-r border-slate-200 dark:border-white/10 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
                <div className="p-6 flex items-center justify-between border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-lime-400 to-lime-600 shadow-lg shadow-lime-500/30 flex items-center justify-center text-white">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="font-black text-xl tracking-tight text-slate-900 dark:text-white leading-tight">Admin<span className="text-lime-600">Pro</span></h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Command Center</p>
                        </div>
                    </div>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 dark:bg-black transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 scrollbar-hide">
                    {SIDEBAR_ITEMS.map(item => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => handleNav(item.id as AdminTab)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all relative group overflow-hidden ${
                                    isActive 
                                        ? 'text-lime-700 bg-lime-50/80 shadow-sm border border-lime-100/50' 
                                        : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white hover:bg-slate-50 dark:bg-black'
                                }`}
                            >
                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-lime-500 rounded-r-full shadow-sm" />}
                                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                                <span>{item.label}</span>
                                {isActive && <ChevronRight className="w-4 h-4 ml-auto text-lime-400" />}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-100">
                    <div className="bg-slate-50 dark:bg-black rounded-2xl p-4 border border-slate-200 dark:border-white/10/60 flex items-center gap-3">
                        <img src={userProfile.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.display_name || 'Admin')}&background=0D8ABC&color=fff`} alt="Admin" className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{userProfile.display_name}</p>
                            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 truncate">{userProfile.email}</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
                {/* Mobile Header Overlay */}
                {isMobileMenuOpen && (
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
                )}

                {/* Topbar */}
                <header className="h-20 bg-white dark:bg-black/60 backdrop-blur-xl border-b border-slate-200 dark:border-white/10/60 sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 text-slate-500 dark:text-gray-400 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition">
                            <Menu className="w-6 h-6" />
                        </button>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight capitalize hidden sm:block">
                            {(activeTab || '').replace('-', ' ')}
                        </h2>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="w-10 h-10 rounded-xl bg-white dark:bg-black border border-slate-200 dark:border-white/10 shadow-sm flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-800 hover:bg-slate-50 dark:bg-black transition relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
                        </button>
                    </div>
                </header>

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 scroll-smooth relative">
                    <div className="max-w-6xl mx-auto w-full">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};
