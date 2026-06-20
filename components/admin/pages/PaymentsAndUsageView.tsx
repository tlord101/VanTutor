import React, { useState } from 'react';
import { CreditCard, Activity, TrendingUp, Search, Download, CheckCircle, XCircle } from 'lucide-react';
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

    return (
        <div className="space-y-6">
            {/* Header Tabs */}
            <div className="flex gap-4 border-b border-slate-200">
                <button 
                    onClick={() => setActiveTab('payments')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'payments' ? 'border-emerald-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <CreditCard className="w-4 h-4" />
                    Financial Logs
                </button>
                <button 
                    onClick={() => setActiveTab('usage')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'usage' ? 'border-emerald-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Activity className="w-4 h-4" />
                    System Usage Analytics
                </button>
            </div>

            {activeTab === 'payments' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
                            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                            <p className="text-emerald-100 text-xs font-black uppercase tracking-widest mb-1">Total Revenue</p>
                            <h3 className="text-4xl font-black">₦{totalRevenue.toLocaleString()}</h3>
                        </div>
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm">
                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Total Transactions</p>
                            <h3 className="text-4xl font-black text-slate-800">{paymentLogs.length}</h3>
                        </div>
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm">
                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Premium Users</p>
                            <h3 className="text-4xl font-black text-slate-800">{allUsersList.filter(u => u.subscription_status === 'premium').length}</h3>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
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
                                        className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <button className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition flex items-center gap-2">
                                    <Download className="w-4 h-4" /> Export
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
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
                                        <tr key={i} className="hover:bg-slate-50 transition">
                                            <td className="px-6 py-4 font-mono text-xs text-slate-600">{log.reference}</td>
                                            <td className="px-6 py-4 font-semibold text-slate-800">{log.user_email}</td>
                                            <td className="px-6 py-4 font-bold text-slate-900">₦{(Number(log.amount) || 0).toLocaleString()}</td>
                                            <td className="px-6 py-4 uppercase text-xs font-black text-emerald-600">{log.tier_id}</td>
                                            <td className="px-6 py-4">
                                                <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-[10px] font-black uppercase">
                                                    <CheckCircle className="w-3 h-3" /> Success
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-500 font-medium">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredPayments.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold">No transactions found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'usage' && (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/60 shadow-sm flex flex-col items-center">
                    <TrendingUp className="w-16 h-16 text-slate-300 mb-4" />
                    <h3 className="font-black text-xl text-slate-800">Advanced Analytics Hub</h3>
                    <p className="text-slate-500 mt-2 max-w-md">Detailed breakdown of AI inference queries, feature usage, and retention metrics will be visualized here.</p>
                </div>
            )}
        </div>
    );
};
