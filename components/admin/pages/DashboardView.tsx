import React, { useMemo } from 'react';
import { CreditCard, Sparkles, Users, Crown, ArrowUpRight, TrendingUp, Activity } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

    // Process data for Revenue Chart
    const revenueData = useMemo(() => {
        const last30Days = Array.from({ length: 30 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (29 - i));
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const dataMap: Record<string, number> = {};
        last30Days.forEach(date => dataMap[date] = 0);

        paymentLogs.forEach(log => {
            if (!log.timestamp) return;
            const dateStr = new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dataMap[dateStr] !== undefined) {
                dataMap[dateStr] += Number(log.amount) || 0;
            }
        });

        return last30Days.map(date => ({
            date,
            revenue: dataMap[date]
        }));
    }, [paymentLogs]);

    // Process data for User Growth Chart
    const userGrowthData = useMemo(() => {
        const last30Days = Array.from({ length: 30 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (29 - i));
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const dataMap: Record<string, number> = {};
        last30Days.forEach(date => dataMap[date] = 0);

        allUsersList.forEach(user => {
            // Use last_activity_date if created_at is not available, as a fallback approximation
            const timestamp = (user as any).created_at || user.last_activity_date || 0;
            if (!timestamp) return;
            const dateStr = new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dataMap[dateStr] !== undefined) {
                dataMap[dateStr] += 1;
            }
        });

        return last30Days.map(date => ({
            date,
            users: dataMap[date]
        }));
    }, [allUsersList]);

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
                        <div key={idx} className="bg-white dark:bg-[#121A2F] rounded-3xl p-6 border border-slate-200 dark:border-white/10/60 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-300">
                            <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${card.color} rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500`} />
                            
                            <div className="flex items-center justify-between relative z-10">
                                <div className={`w-12 h-12 rounded-2xl ${card.bg} ${card.border} border flex items-center justify-center ${card.text}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <button 
                                    onClick={() => onNavigate(card.tab)}
                                    className="w-8 h-8 rounded-full bg-slate-50 dark:bg-[#0A101F] border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                    <ArrowUpRight className="w-4 h-4" />
                                </button>
                            </div>
                            
                            <div className="mt-6 relative z-10">
                                <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{card.value}</h3>
                                <p className="text-xs font-bold text-slate-500 dark:text-[#A0ABC0] uppercase tracking-widest mt-1">{card.title}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-[#121A2F] border border-slate-200 dark:border-white/10/60 rounded-3xl p-6 shadow-sm min-h-[350px] flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" /> Revenue (Last 30 Days)
                    </h3>
                    <div className="flex-grow w-full h-full min-h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={revenueData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} tickFormatter={(val) => `₦${val}`} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Revenue']}
                                />
                                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                
                <div className="bg-white dark:bg-[#121A2F] border border-slate-200 dark:border-white/10/60 rounded-3xl p-6 shadow-sm min-h-[350px] flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Users className="w-5 h-5 text-amber-500" /> User Signups (Last 30 Days)
                    </h3>
                    <div className="flex-grow w-full h-full min-h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={userGrowthData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: number) => [value, 'New Users']}
                                />
                                <Bar dataKey="users" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};
