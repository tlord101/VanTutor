import React, { useState, useEffect } from 'react';
import type { UserProfile, AppSettings } from '../types';
import { VerificationBadge } from './VerificationBadge';
import { DEFAULT_USAGE_SETTINGS } from '../utils/appSettings';
import { Browser } from '@capacitor/browser';
import { isNative } from '../utils/capacitorUtils';
import { db } from '../firebase';
import { ref as dbRef, query, orderByChild, equalTo, get } from 'firebase/database';
import { CheckCircle, Clock } from 'lucide-react';

interface BillingSettingsProps {
  userProfile: UserProfile;
  appSettings: AppSettings;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
}

export const BillingSettingsScreen: React.FC<BillingSettingsProps> = ({ userProfile, appSettings }) => {
  const usageSettings = appSettings.usage_settings || DEFAULT_USAGE_SETTINGS;
  const tiers = usageSettings?.tiers || (usageSettings as any)?.plans || DEFAULT_USAGE_SETTINGS.tiers;
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoadingTx, setIsLoadingTx] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!userProfile.email) {
        setIsLoadingTx(false);
        return;
      }
      try {
        const q = query(dbRef(db, 'usage_logs/payments'), orderByChild('user_email'), equalTo(userProfile.email));
        const snap = await get(q);
        if (snap.exists()) {
          const data = snap.val();
          const list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
          list.sort((a: any, b: any) => b.timestamp - a.timestamp);
          setTransactions(list);
        }
      } catch (err) {
        console.error("Error fetching transactions:", err);
      } finally {
        setIsLoadingTx(false);
      }
    };
    fetchTransactions();
  }, [userProfile.email]);

  const handleManageBilling = async () => {
    // Determine the base URL. Use the current origin if on web, or a fixed domain if native.
    const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
    const billingUrl = `${baseUrl}/billing`;

    if (isNative()) {
      try {
        await Browser.open({ url: billingUrl });
      } catch (err) {
        window.open(billingUrl, '_system');
      }
    } else {
      window.open(billingUrl, '_blank');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-8 animate-in fade-in duration-300 max-w-6xl mx-auto">
      
      {/* Live AI Balance Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 sm:p-10 border border-slate-700 shadow-2xl overflow-hidden relative group">
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-400/30 transition-all duration-700" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <span className="text-[11px] font-black text-blue-400 uppercase tracking-[0.25em] mb-2 block drop-shadow-sm">Live AI Balance</span>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl sm:text-7xl font-black text-white tracking-tighter drop-shadow-lg">{userProfile.ai_credits_balance ?? 0}</span>
              <span className="text-sm font-bold text-slate-300">Credits</span>
            </div>
            <p className="text-sm text-slate-400 mt-4 max-w-sm font-medium">Use credits to generate answers, ask follow-up questions, and analyze images with our AI tutors.</p>
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto">
            <button
              onClick={handleManageBilling}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors w-full md:w-auto"
            >
              Refill Credits
            </button>
          </div>
        </div>
      </div>

      {/* Subscription Status Details */}
      <div className="bg-white dark:bg-black p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2 block">Current Subscription</span>
          <div className="flex items-center gap-3">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-xl">
              {(userProfile.subscription_status === 'pro' || userProfile.subscription_status === 'premium') && (tiers?.premium?.display_name || 'Premium Plan')}
              {userProfile.subscription_status === 'basic' && (tiers?.basic?.display_name || 'Student Plan')}
              {(userProfile.subscription_status === 'free' || !userProfile.subscription_status) && (tiers?.free?.display_name || 'Free Plan')}
              {userProfile.subscription_status === 'personal_token' && 'Personal Google Token'}
            </h4>
            <VerificationBadge status={userProfile.subscription_status || 'free'} />
          </div>
        </div>
        <div className="shrink-0">
           <span className="inline-flex items-center justify-center px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 shadow-sm">
             Active Tier
           </span>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white dark:bg-black p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col gap-6">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Recent Transactions</h3>
          <p className="text-sm text-slate-500 font-medium mt-1">Your recent payments and credit refills.</p>
        </div>
        
        {isLoadingTx ? (
           <div className="py-8 text-center text-sm text-slate-500">Loading transactions...</div>
        ) : transactions.length === 0 ? (
           <div className="py-12 flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/5">
             <Clock className="w-8 h-8 text-slate-300 mb-3" />
             <p className="text-sm font-bold text-slate-600 dark:text-slate-400">No transactions yet</p>
           </div>
        ) : (
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="border-b border-slate-100 dark:border-white/10">
                   <th className="py-3 px-4 text-xs font-black uppercase tracking-widest text-slate-400">Date</th>
                   <th className="py-3 px-4 text-xs font-black uppercase tracking-widest text-slate-400">Reference</th>
                   <th className="py-3 px-4 text-xs font-black uppercase tracking-widest text-slate-400">Tier</th>
                   <th className="py-3 px-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Amount</th>
                   <th className="py-3 px-4 text-xs font-black uppercase tracking-widest text-slate-400 text-center">Status</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                 {transactions.slice(0, 10).map((tx) => (
                   <tr key={tx.id} className="text-sm hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                     <td className="py-4 px-4 text-slate-600 dark:text-slate-400 font-medium">
                       {new Date(tx.timestamp).toLocaleDateString()}
                     </td>
                     <td className="py-4 px-4 font-mono text-xs text-slate-500">{tx.reference || 'N/A'}</td>
                     <td className="py-4 px-4 font-bold text-slate-700 dark:text-slate-300 uppercase text-xs">{tx.tier_id}</td>
                     <td className="py-4 px-4 text-right font-black text-slate-900 dark:text-white">
                       ₦{(Number(tx.amount) || 0).toLocaleString()}
                     </td>
                     <td className="py-4 px-4">
                        <div className="flex justify-center">
                          {(!tx.status || tx.status === 'success' || tx.status === 'successful') ? (
                              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md text-[10px] font-black uppercase">
                                  <CheckCircle className="w-3 h-3" /> Success
                              </span>
                          ) : (
                              <span className="flex items-center gap-1 text-red-600 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded-md text-[10px] font-black uppercase">
                                  Failed
                              </span>
                          )}
                        </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        )}
      </div>

    </div>
  );
};
