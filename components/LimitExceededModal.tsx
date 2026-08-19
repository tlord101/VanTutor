import React from 'react';
import type { UserProfile, AppSettings } from '../types';
import { Browser } from '@capacitor/browser';
import { isNative } from '../utils/capacitorUtils';

interface LimitExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  appSettings?: AppSettings;
  cost: number;
  balance: number;
  addToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onSuccessPurchase?: () => void;
  onNavigate?: (view: string) => void;
}

export const LimitExceededModal: React.FC<LimitExceededModalProps> = ({
  isOpen,
  onClose,
  cost,
  balance,
  onNavigate,
}) => {
  if (!isOpen) return null;

  const handleUpgradeAccount = async () => {
    onClose();
    if (onNavigate) {
      onNavigate('billing');
      return;
    }
    const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
    const plansUrl = `${baseUrl}/plans`;
    if (isNative()) {
      await Browser.open({ url: plansUrl });
    } else {
      window.location.href = plansUrl;
    }
  };

  const handleBuyCredits = async () => {
    onClose();
    if (onNavigate) {
      onNavigate('billing');
      return;
    }
    const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
    const refillUrl = `${baseUrl}/refill-credits`;
    if (isNative()) {
      await Browser.open({ url: refillUrl });
    } else {
      window.location.href = refillUrl;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in backdrop-blur-md">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-white dark:bg-[#1C2128] rounded-[32px] w-full max-w-md relative z-10 overflow-hidden shadow-2xl border border-slate-200/80 dark:border-[#373E47] animate-scale-in">
        {/* Header banner */}
        <div className="bg-gradient-to-br from-amber-500/10 via-rose-500/10 to-orange-500/10 dark:from-rose-950/40 dark:to-amber-950/30 p-6 sm:p-7 text-center border-b border-amber-200/60 dark:border-[#373E47]">
           <div className="w-16 h-16 bg-gradient-to-tr from-amber-500 to-rose-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-3.5 shadow-lg shadow-amber-500/20">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
           </div>
           <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-1.5">
             Credits Exhausted
           </h3>
           <p className="text-sm font-medium text-slate-600 dark:text-slate-300 max-w-xs mx-auto">
             This action requires <span className="font-bold text-amber-600 dark:text-amber-400">{cost} credits</span>, but you only have <span className="font-bold text-rose-600 dark:text-rose-400">{balance} credits</span> left.
           </p>
        </div>

        {/* Dual Actions Body */}
        <div className="p-5 sm:p-6 space-y-3">
           {/* Action 1: Upgrade Account */}
           <button
              onClick={handleUpgradeAccount}
              className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-extrabold py-3.5 px-5 rounded-2xl transition-all shadow-md shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-between group cursor-pointer"
           >
              <div className="flex items-center gap-3">
                 <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                 </div>
                 <div className="text-left">
                    <div className="text-sm font-bold leading-tight">Upgrade Account</div>
                    <div className="text-[11px] text-emerald-100 font-medium">Unlock Unlimited Studytime & Pro Features</div>
                 </div>
              </div>
              <span className="text-base group-hover:translate-x-1 transition-transform">→</span>
           </button>

           {/* Action 2: Buy Extra Credits */}
           <button
              onClick={handleBuyCredits}
              className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-[#2D333B] dark:hover:bg-[#444C56] border border-slate-200 dark:border-[#444C56] text-white font-bold py-3.5 px-5 rounded-2xl transition-all shadow-xs active:scale-[0.98] flex items-center justify-between group cursor-pointer"
           >
              <div className="flex items-center gap-3">
                 <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                 </div>
                 <div className="text-left">
                    <div className="text-sm font-bold text-slate-100 leading-tight">Buy Extra Credits</div>
                    <div className="text-[11px] text-slate-400 font-medium">Top-up instant AI credits starting at ₦100</div>
                 </div>
              </div>
              <span className="text-base text-slate-400 group-hover:translate-x-1 transition-transform">→</span>
           </button>
           
           {/* Dismiss */}
           <button
              onClick={onClose}
              className="w-full py-2.5 text-center text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
           >
              Maybe Later
           </button>
        </div>
      </div>
    </div>
  );
};
