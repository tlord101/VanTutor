import React from 'react';
import type { UserProfile, AppSettings } from '../types';
import { VerificationBadge } from './VerificationBadge';
import { DEFAULT_USAGE_SETTINGS } from '../utils/appSettings';
import { Browser } from '@capacitor/browser';
import { isNative } from '../utils/capacitorUtils';

interface BillingSettingsProps {
  userProfile: UserProfile;
  appSettings: AppSettings;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
}

export const BillingSettingsScreen: React.FC<BillingSettingsProps> = ({ userProfile, appSettings }) => {
  const usageSettings = appSettings.usage_settings || DEFAULT_USAGE_SETTINGS;
  const tiers = usageSettings?.tiers || (usageSettings as any)?.plans || DEFAULT_USAGE_SETTINGS.tiers;

  const handleManageBilling = async () => {
    // Determine the base URL. Use the current origin if on web, or a fixed domain if native.
    const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
    const billingUrl = `${baseUrl}/billing`;

    if (isNative()) {
      await Browser.open({ url: billingUrl });
    } else {
      window.location.href = billingUrl;
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
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/30 active:scale-[0.98] w-full md:w-auto border border-blue-500"
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

      {/* Manage Billing & Upgrades */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-900/20 p-8 sm:p-10 rounded-3xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div>
            <h3 className="text-2xl font-black text-indigo-900 dark:text-indigo-100 tracking-tight">Manage Billing</h3>
            <p className="text-sm text-indigo-700/80 dark:text-indigo-300 font-medium mt-2 max-w-md">Upgrade your plan, view available tiers, and securely manage your payment methods on our web portal.</p>
        </div>
        <button
          onClick={handleManageBilling}
          className="shrink-0 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/30 active:scale-[0.98] w-full md:w-auto"
        >
          View Plans & Upgrade
        </button>
      </div>

    </div>
  );
};
