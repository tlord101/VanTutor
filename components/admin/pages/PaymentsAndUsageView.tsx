import React, { useState, useMemo } from 'react';
import { CreditCard, Activity, Search, Download, CheckCircle, BrainCircuit, Key, Server } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import type { UserProfile } from '../../../types';

interface PaymentsAndUsageViewProps {
    paymentLogs: any[];
    aiRequestLogs: any[];
    allUsersList: UserProfile[];
}

export const PaymentsAndUsageView: React.FC<PaymentsAndUsageViewProps> = ({ paymentLogs, aiRequestLogs, allUsersList }) => {
    const [activeTab, setActiveTab] = useState<'payments' | 'usage'>('payments');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredPayments = paymentLogs.filter(log => 
        log.reference?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        log.user_email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalRevenue = paymentLogs.reduce((acc, log) => acc + (Number(log.amount) || 0), 0);

    // AI Query Volume Data (Area Chart)
    const queryVolumeData = useMemo(() => {
        const last30Days = Array.from({ length: 30 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (29 - i));
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const dataMap: Record<string, number> = {};
        last30Days.forEach(date => dataMap[date] = 0);

        aiRequestLogs.forEach(log => {
            if (!log.timestamp) return;
            const dateStr = new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dataMap[dateStr] !== undefined) {
                dataMap[dateStr] += 1;
            }
        });

        return last30Days.map(date => ({
            date,
            queries: dataMap[date]
        }));
    }, [aiRequestLogs]);

    // Personal vs Platform Token Data (Pie Chart)
    const tokenTypeData = useMemo(() => {
        let personalCount = 0;
        let platformCount = 0;
        aiRequestLogs.forEach(log => {
            if (log.use_personal_token) personalCount++;
            else platformCount++;
        });
        
        return [
            { name: 'Platform API Key', value: platformCount, color: '#10b981' }, // Emerald
            { name: 'User Personal Key', value: personalCount, color: '#f59e0b' } // Amber
        ];
    }, [aiRequestLogs]);

    // Model Usage Breakdown (Bar Chart)
    const modelUsageData = useMemo(() => {
        const modelCounts: Record<string, number> = {};
        aiRequestLogs.forEach(log => {
            const modelName = log.model || 'Unknown Model';
            modelCounts[modelName] = (modelCounts[modelName] || 0) + 1;
        });

        return Object.keys(modelCounts).map(model => ({
            name: model,
            count: modelCounts[model]
        })).sort((a, b) => b.count - a.count); // Sort descending
    }, [aiRequestLogs]);

    return (
        <div className="space-y-6">
            {/* Header Tabs */}
            <div className="flex gap-4 border-b border-slate-200 dark:border-white/10">
                <button 
                    onClick={() => setActiveTab('payments')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'payments' ? 'border-emerald-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700'}`}
                >
                    <CreditCard className="w-4 h-4" />
                    Financial Logs
                </button>
                <button 
                    onClick={() => setActiveTab('usage')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'usage' ? 'border-emerald-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700'}`}
                >
                    <Activity className="w-4 h-4" />
                    System Usage Analytics
                </button>
            </div>

            {activeTab === 'payments' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
                            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white dark:bg-black/10 rounded-full blur-xl" />
                            <p className="text-emerald-100 text-xs font-black uppercase tracking-widest mb-1">Total Revenue</p>
                            <h3 className="text-4xl font-black">₦{totalRevenue.toLocaleString()}</h3>
                        </div>
                        <div className="bg-white dark:bg-black rounded-3xl p-6 border border-slate-200 dark:border-white/10/60 shadow-sm">
                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Total Transactions</p>
                            <h3 className="text-4xl font-black text-slate-800">{paymentLogs.length}</h3>
                        </div>
                        <div className="bg-white dark:bg-black rounded-3xl p-6 border border-slate-200 dark:border-white/10/60 shadow-sm">
                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Premium Users</p>
                            <h3 className="text-4xl font-black text-slate-800">{allUsersList.filter(u => u.subscription_status === 'premium').length}</h3>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-black rounded-3xl border border-slate-200 dark:border-white/10/60 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="font-black text-lg text-slate-800">Transaction History</h3>
                            <div className="flex gap-3">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Search reference or email..." 
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="pl-9 pr-4 py-2 border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <button className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition flex items-center gap-2">
                                    <Download className="w-4 h-4" /> Export
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-black text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-gray-400">
                                    <tr>
                                        <th className="px-6 py-4">Reference</th>
                                        <th className="px-6 py-4">User Email</th>
                                        <th className="px-6 py-4">Amount</th>
                                        <th className="px-6 py-4">Tier</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {filteredPayments.map((log, i) => (
                                        <tr key={i} className="hover:bg-slate-50 dark:bg-black transition">
                                            <td className="px-6 py-4 font-mono text-xs text-slate-600">{log.reference}</td>
                                            <td className="px-6 py-4 font-semibold text-slate-800">{log.user_email}</td>
                                            <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">₦{(Number(log.amount) || 0).toLocaleString()}</td>
                                            <td className="px-6 py-4 uppercase text-xs font-black text-emerald-600">{log.tier_id}</td>
                                            <td className="px-6 py-4">
                                                <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-[10px] font-black uppercase">
                                                    <CheckCircle className="w-3 h-3" /> Success
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-500 dark:text-gray-400 font-medium">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredPayments.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-gray-400 font-bold">No transactions found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'usage' && (
                <div className="space-y-6">
                    {/* Top Row: AI Volume */}
                    <div className="bg-white dark:bg-black border border-slate-200 dark:border-white/10/60 rounded-3xl p-6 shadow-sm min-h-[350px] flex flex-col">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <BrainCircuit className="w-5 h-5 text-emerald-500" /> AI Query Volume (Last 30 Days)
                        </h3>
                        <div className="flex-grow w-full h-full min-h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={queryVolumeData}>
                                    <defs>
                                        <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number) => [value, 'Total AI Queries']}
                                    />
                                    <Area type="monotone" dataKey="queries" stroke="#10b981" fillOpacity={1} fill="url(#colorQueries)" strokeWidth={3} activeDot={{ r: 6 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Bottom Row: Pies and Bars */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Token Type Distribution */}
                        <div className="bg-white dark:bg-black border border-slate-200 dark:border-white/10/60 rounded-3xl p-6 shadow-sm min-h-[350px] flex flex-col">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Key className="w-5 h-5 text-amber-500" /> Token Authorization Source
                            </h3>
                            <div className="flex-grow w-full h-full min-h-[250px] flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={tokenTypeData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {tokenTypeData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            formatter={(value: number) => [value, 'Requests']}
                                        />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Model Usage */}
                        <div className="bg-white dark:bg-black border border-slate-200 dark:border-white/10/60 rounded-3xl p-6 shadow-sm min-h-[350px] flex flex-col">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Server className="w-5 h-5 text-indigo-500" /> API Model Traffic
                            </h3>
                            <div className="flex-grow w-full h-full min-h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={modelUsageData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#475569' }} />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            formatter={(value: number) => [value, 'Queries']}
                                            cursor={{fill: '#f1f5f9'}}
                                        />
                                        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
