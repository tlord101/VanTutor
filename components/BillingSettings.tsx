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
    const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
    const billingUrl = `${baseUrl}/refill-credits?uid=${userProfile.uid}`;

    if (isNative()) {
      await Browser.open({ url: billingUrl });
    } else {
      window.open(billingUrl, '_blank');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-8 animate-in fade-in duration-300 max-w-6xl mx-auto">
      
      {/* Account Balance Card */}
      <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Account Balance</span>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">{userProfile.ai_credits_balance ?? 0}</span>
              <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Credits</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 max-w-sm font-medium">Use credits to generate answers, ask follow-up questions, and analyze images with our AI tutors.</p>
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto">
            <button
              onClick={handleManageBilling}
              className="px-8 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-black hover:opacity-90 active:scale-[0.98] rounded-xl text-sm font-bold transition-all w-full md:w-auto"
            >
              Refill Credits
            </button>
          </div>
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
