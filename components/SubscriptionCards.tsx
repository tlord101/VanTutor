import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { UserProfile, AppSettings } from '../types';

interface SubscriptionCardsProps {
  userProfile: UserProfile;
  appSettings: AppSettings;
  isVerifyingKey?: boolean;
  onSelectPlan: (plan: 'free' | 'basic' | 'premium' | 'personal_token', extraData?: { apiKey: string }) => void;
  showCurrentPlan?: boolean;
}

export const SubscriptionCards: React.FC<SubscriptionCardsProps> = ({
  userProfile,
  appSettings,
  isVerifyingKey = false,
  onSelectPlan,
  showCurrentPlan = true
}) => {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annually'>('monthly');
  const [usePersonalToken, setUsePersonalToken] = useState(userProfile.use_personal_token || false);
  const [personalApiKey, setPersonalApiKey] = useState(userProfile.personal_api_key || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const usageSettings = appSettings.usage_settings;
  const tiers = usageSettings?.tiers || (usageSettings as any)?.plans || {};

  if (!usageSettings) return null;

  return (
    <>
      {/* Toggle Billing Period */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-full inline-flex border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setBillingInterval('monthly')}
            className={`px-6 py-1.5 rounded-full text-xs font-black transition-all ${
              billingInterval === 'monthly'
                ? 'bg-white dark:bg-black text-blue-600 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval('annually')}
            className={`px-6 py-1.5 rounded-full text-xs font-black transition-all ${
              billingInterval === 'annually'
                ? 'bg-white dark:bg-black text-blue-600 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
            }`}
          >
            Annually
          </button>
        </div>
      </div>

      {/* Plan Upgrade Grid Cards */}
      <div className="flex overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden gap-6 mb-6 pb-4 px-2 scroll-smooth">

        {/* Card 1: Forever Free */}
        <div className={`w-[85vw] max-w-[300px] shrink-0 snap-center rounded-[24px] border border-slate-200 dark:border-white/10 bg-white dark:bg-black p-6 flex flex-col justify-between transition-all relative hover:border-blue-300 ${
          showCurrentPlan && (userProfile.subscription_status === 'free' || !userProfile.subscription_status)
            ? 'border-blue-500 shadow-lg'
            : ''
        }`}>
          <div className="flex flex-col flex-grow">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#5BBFFF] to-[#0070B8] flex items-center justify-center text-white mb-6 shadow-sm">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12" />
                <rect x="2" y="7" width="20" height="5" rx="1" />
                <line x1="12" y1="22" x2="12" y2="7" />
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
            </div>
            <h4 className="font-extrabold text-xl text-slate-900 dark:text-white leading-tight">
              {tiers?.free?.display_name || 'Forever Free'}
            </h4>
            <div className="text-sm text-slate-500 dark:text-gray-400 mt-2 font-semibold leading-snug min-h-[40px] prose prose-sm prose-slate prose-p:my-0 prose-strong:text-slate-800 dark:prose-strong:text-white">
              <ReactMarkdown>{tiers?.free?.description || "Perfect if you're just getting started with your study promotion."}</ReactMarkdown>
            </div>
            <div className="flex items-baseline gap-1.5 mt-5 mb-5">
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                ₦{tiers?.free?.price_ngn ?? 0}
              </span>
              <span className="text-slate-500 dark:text-gray-400 font-bold text-sm">Free</span>
            </div>

            {showCurrentPlan && (userProfile.subscription_status === 'free' || !userProfile.subscription_status) ? (
              <span className="w-full text-center py-3 bg-slate-50 dark:bg-black text-slate-400 text-sm font-bold rounded-xl block border border-slate-200 dark:border-white/10 mb-6">Current Plan</span>
            ) : (
              <button
                onClick={() => onSelectPlan('free')}
                disabled={isVerifyingKey}
                className="w-full py-3 bg-white dark:bg-black hover:bg-slate-50 dark:hover:bg-gray-900 border border-slate-200 dark:border-white/10 hover:border-slate-300 text-slate-800 dark:text-white text-sm font-bold rounded-xl transition-all shadow-sm active:scale-[0.98] mb-6"
              >
                Select Free
              </button>
            )}

            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-3 font-semibold text-left">
              <li className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span>{tiers?.free?.credit_allocation ?? 30} Monthly Credits</span>
              </li>
              <li className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span>Standard AI Tutoring</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Card 2: Student Plan */}
        <div className={`w-[85vw] max-w-[300px] shrink-0 snap-center rounded-[24px] border-2 flex flex-col justify-between transition-all relative overflow-hidden p-6 pt-12 hover:-translate-y-1 ${
          showCurrentPlan && userProfile.subscription_status === 'basic'
            ? 'border-blue-650 bg-white dark:bg-black shadow-xl'
            : 'border-blue-600 dark:border-blue-500 bg-white dark:bg-black hover:shadow-2xl'
        }`}>
          <div className="absolute top-0 left-0 right-0 bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest text-center py-2">
            Most Popular
          </div>

          <div className="flex flex-col flex-grow">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF4E98] to-[#FF8E53] flex items-center justify-center text-white mb-6 shadow-sm">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="7" />
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
              </svg>
            </div>
            <h4 className="font-extrabold text-xl text-slate-900 dark:text-white leading-tight">
              {tiers?.basic?.display_name || 'Student Plan'}
            </h4>
            <div className="text-sm text-slate-500 dark:text-gray-400 mt-2 font-semibold leading-snug min-h-[40px] prose prose-sm prose-slate prose-p:my-0 prose-strong:text-slate-800 dark:prose-strong:text-white">
              <ReactMarkdown>{tiers?.basic?.description || "Take your study promotion to the next level."}</ReactMarkdown>
            </div>
            <div className="flex items-baseline gap-1.5 mt-5 mb-5">
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                ₦{billingInterval === 'monthly' ? tiers?.basic?.price_ngn ?? 1000 : Math.round((tiers?.basic?.price_ngn ?? 1000) * 0.75)}
              </span>
              <span className="text-slate-500 dark:text-gray-400 font-bold text-sm">/month</span>
            </div>

            {showCurrentPlan && userProfile.subscription_status === 'basic' ? (
              <span className="w-full text-center py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-bold rounded-xl block border border-blue-200 dark:border-blue-500/30 mb-6">Current Plan</span>
            ) : (
              <button
                onClick={() => onSelectPlan('basic')}
                disabled={isVerifyingKey}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-500/25 active:scale-[0.98] mb-6"
              >
                Select Student
              </button>
            )}

            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-3 font-semibold text-left">
              <li className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span>{tiers?.basic?.credit_allocation ?? 500} Monthly Credits</span>
              </li>
              <li className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span>Blue Verification Badge</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Card 3: Pro Plan */}
        <div className={`w-[85vw] max-w-[300px] shrink-0 snap-center rounded-[24px] border border-slate-200 dark:border-white/10 bg-white dark:bg-black p-6 flex flex-col justify-between transition-all relative hover:border-purple-300 ${
          showCurrentPlan && userProfile.subscription_status === 'premium'
            ? 'border-blue-500 shadow-lg'
            : ''
        }`}>
          <div className="flex flex-col flex-grow">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFB000] to-[#FF6B00] flex items-center justify-center text-white mb-6 shadow-sm">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h12l4 6-10 13L2 9z" />
                <path d="M11 3 8 9l4 13 4-13-3-6" />
                <path d="M2 9h20" />
              </svg>
            </div>
            <h4 className="font-extrabold text-xl text-slate-900 dark:text-white leading-tight">
              {tiers?.premium?.display_name || 'Pro Plan'}
            </h4>
            <div className="text-sm text-slate-500 dark:text-gray-400 mt-2 font-semibold leading-snug min-h-[40px] prose prose-sm prose-slate prose-p:my-0 prose-strong:text-slate-800 dark:prose-strong:text-white">
              <ReactMarkdown>{tiers?.premium?.description || "Completely automate your learning progress with maximum options."}</ReactMarkdown>
            </div>
            <div className="flex items-baseline gap-1.5 mt-5 mb-5">
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                ₦{billingInterval === 'monthly' ? tiers?.premium?.price_ngn ?? 3000 : Math.round((tiers?.premium?.price_ngn ?? 3000) * 0.75)}
              </span>
              <span className="text-slate-500 dark:text-gray-400 font-bold text-sm">/month</span>
            </div>

            {showCurrentPlan && userProfile.subscription_status === 'premium' ? (
              <span className="w-full text-center py-3 bg-slate-50 dark:bg-black text-slate-400 text-sm font-bold rounded-xl block border border-slate-200 dark:border-white/10 mb-6">Current Plan</span>
            ) : (
              <button
                onClick={() => onSelectPlan('premium')}
                disabled={isVerifyingKey}
                className="w-full py-3 bg-white dark:bg-black hover:bg-slate-50 dark:hover:bg-gray-900 border border-slate-200 dark:border-white/10 hover:border-slate-300 text-slate-800 dark:text-white text-sm font-bold rounded-xl transition-all shadow-sm active:scale-[0.98] mb-6"
              >
                Select Pro
              </button>
            )}

            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-3 font-semibold text-left">
              <li className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span>{tiers?.premium?.credit_allocation ?? 2000} Monthly Credits</span>
              </li>
              <li className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span>Purple Verification Badge</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Card 4: Connect to Gemini */}
        <div className={`w-[85vw] max-w-[300px] shrink-0 snap-center rounded-[24px] border border-slate-200 dark:border-white/10 bg-white dark:bg-black p-6 flex flex-col justify-between transition-all relative hover:border-emerald-300 ${
          showCurrentPlan && userProfile.subscription_status === 'personal_token'
            ? 'border-emerald-600 shadow-lg'
            : ''
        }`}>
          <div className="flex flex-col flex-grow">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center text-white mb-6 shadow-sm">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </div>
            <h4 className="font-extrabold text-xl text-slate-900 dark:text-white leading-tight">Connect to Gemini</h4>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-2 font-semibold leading-snug min-h-[40px]">
              We partner with Google to give you the best services. Connect your personal Google Gemini API key to bypass all limits.
            </p>
            <div className="flex items-baseline gap-1.5 mt-5 mb-5">
              <span className="text-4xl font-extrabold text-emerald-600 tracking-tight">Gemini</span>
              <span className="text-slate-500 dark:text-gray-400 font-bold text-sm">Key</span>
            </div>

            <div className="mb-6">
              {(showCurrentPlan && (usePersonalToken || userProfile.subscription_status === 'personal_token')) || (!showCurrentPlan && usePersonalToken) ? (
                <div className="space-y-2 text-left">
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="Paste Gemini API key"
                      value={personalApiKey}
                      onChange={(e) => setPersonalApiKey(e.target.value)}
                      className="w-full bg-white dark:bg-black border border-slate-200 dark:border-white/10 focus:border-blue-500 rounded-lg py-2 px-3 pr-10 text-slate-800 dark:text-white font-medium focus:outline-none transition-all font-mono text-[11px] shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-gray-400 hover:text-slate-700 text-xs font-bold"
                    >
                      {showApiKey ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                  <button
                    onClick={() => onSelectPlan('personal_token', { apiKey: personalApiKey })}
                    disabled={isVerifyingKey || !personalApiKey.trim()}
                    className="w-full py-2 bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    {isVerifyingKey ? 'Saving...' : 'Save Token'}
                  </button>
                  {showCurrentPlan && userProfile.subscription_status === 'personal_token' && (
                    <span className="text-[11px] text-emerald-650 font-bold block text-center mt-1">✓ Active Token</span>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setUsePersonalToken(true)}
                  disabled={isVerifyingKey}
                  className="w-full py-3 bg-white dark:bg-black hover:bg-slate-50 dark:hover:bg-gray-900 border border-slate-200 dark:border-white/10 hover:border-slate-300 text-slate-800 dark:text-white text-sm font-bold rounded-xl transition-all active:scale-[0.98] shadow-sm mb-6"
                >
                  Configure Personal Token
                </button>
              )}
            </div>

            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-3 font-semibold text-left">
              <li className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span>Unlimited Usage</span>
              </li>
              <li className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span>Custom Dev Badge</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};
