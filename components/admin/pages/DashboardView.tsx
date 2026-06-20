import React from 'react';
import { CreditCard, Sparkles, Users, Crown, ArrowUpRight, TrendingUp, Activity } from 'lucide-react';
import type { UserProfile } from '../../../types';
import type { AdminTab } from '../AdminLayout';

interface DashboardViewProps {
    paymentLogs: any[];
    aiRequestLogs: any[];
    allUsersList: UserProfile[];
    onNavigate: (tab: AdminTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
    paymentLogs, aiRequestLogs, allUsersList, onNavigate
}) => {
    const premiumUsersCount = allUsersList.filter(u => u.subscription_status === 'premium').length;

    const cards = [
        {
            title: 'Total Payments',
            value: paymentLogs.length,
            icon: CreditCard,
            color: 'from-blue-500 to-blue-600',
            bg: 'bg-blue-50',
            border: 'border-blue-100',
            text: 'text-blue-700',
            tab: 'payments' as AdminTab
        },
        {
            title: 'AI Queries',
            value: aiRequestLogs.length,
            icon: Sparkles,
            color: 'from-emerald-500 to-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            text: 'text-emerald-700',
            tab: 'usage-analytics' as AdminTab
        },
        {
            title: 'Registered Users',
            value: allUsersList.length,
            icon: Users,
            color: 'from-amber-400 to-amber-500',
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            text: 'text-amber-700',
            tab: 'users' as AdminTab
        },
        {
            title: 'Premium Subs',
            value: premiumUsersCount,
            icon: Crown,
            color: 'from-rose-500 to-rose-600',
            bg: 'bg-rose-50',
            border: 'border-rose-100',
            text: 'text-rose-700',
            tab: 'users' as AdminTab
        }
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {cards.map((card, idx) => {
                    const Icon = card.icon;
                    return (
                        <div key={idx} className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-300">
                            <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${card.color} rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500`} />
                            
                            <div className="flex items-center justify-between relative z-10">
                                <div className={`w-12 h-12 rounded-2xl ${card.bg} ${card.border} border flex items-center justify-center ${card.text}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <button 
                                    onClick={() => onNavigate(card.tab)}
                                    className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                    <ArrowUpRight className="w-4 h-4" />
                                </button>
                            </div>
                            
                            <div className="mt-6 relative z-10">
                                <h3 className="text-4xl font-black text-slate-900 tracking-tight">{card.value}</h3>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">{card.title}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* We can add recent activity or charts here later to make it more professional */}
                <div className="lg:col-span-2 bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm min-h-[300px] flex flex-col items-center justify-center text-slate-400">
                    <TrendingUp className="w-12 h-12 mb-4 text-slate-200" />
                    <p className="font-bold">Analytics Chart Overview</p>
                    <p className="text-sm">Revenue and user growth over time will be displayed here.</p>
                </div>
                
                <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm min-h-[300px] flex flex-col items-center justify-center text-slate-400">
                    <Activity className="w-12 h-12 mb-4 text-slate-200" />
                    <p className="font-bold">Recent System Activity</p>
                    <p className="text-sm">Live stream of system events.</p>
                </div>
            </div>
        </div>
    );
};
