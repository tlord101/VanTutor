import React from 'react';
import type { UserProfile, AppSettings } from '../types';
import { Browser } from '@capacitor/browser';
import { isNative } from '../utils/capacitorUtils';

interface LimitExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  appSettings: AppSettings;
  cost: number;
  balance: number;
  addToast: (msg: string, type: 'success'|'error') => void;
  onSuccessPurchase: () => void;
}

export const LimitExceededModal: React.FC<LimitExceededModalProps> = ({
  isOpen,
  onClose,
  cost,
  balance,
}) => {
  if (!isOpen) return null;

  const handlePurchase = async () => {
    onClose();
    
    // Redirect to the web billing page
    const baseUrl = isNative() ? 'https://avelut.xyz' : window.location.origin;
    const billingUrl = `${baseUrl}/billing`;

    if (isNative()) {
      await Browser.open({ url: billingUrl });
    } else {
      window.location.href = billingUrl;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-white dark:bg-[#1e1e1e] rounded-3xl w-full max-w-md relative z-10 overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10">
        <div className="bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/30 p-8 text-center border-b border-rose-100 dark:border-rose-900/50">
           <div className="w-16 h-16 bg-white dark:bg-rose-900/50 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
              <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
           </div>
           <h3 className="text-2xl font-black text-rose-900 dark:text-rose-100 mb-2">Insufficient Credits</h3>
           <p className="text-rose-700/80 dark:text-rose-300 font-medium">This action requires {cost} credits, but you only have {balance}.</p>
        </div>

        <div className="p-6 space-y-4">
           <button
              onClick={handlePurchase}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-md active:scale-[0.98]"
           >
              Buy Credits on Web Portal
           </button>
           
           <button
              onClick={onClose}
              className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-[#2a2a2a] dark:hover:bg-[#333] text-slate-700 dark:text-slate-300 font-bold py-4 px-6 rounded-xl transition-all active:scale-[0.98]"
           >
              Maybe Later
           </button>
        </div>
      </div>
    </div>
  );
};
