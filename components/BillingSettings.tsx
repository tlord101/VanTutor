import React, { useState } from 'react';
import type { UserProfile, AppSettings } from '../types';
import { SubscriptionCards } from './SubscriptionCards';
import { LimitExceededModal } from './LimitExceededModal';
import { useToast } from '../hooks/useToast';
import { VerificationBadge } from './VerificationBadge';
import { isNative } from '../utils/capacitorUtils';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { triggerPaystackPurchase } from '../utils/usage';
import { DEFAULT_USAGE_SETTINGS } from '../utils/appSettings';

interface BillingSettingsProps {
  userProfile: UserProfile;
  appSettings: AppSettings;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
}

export const BillingSettingsScreen: React.FC<BillingSettingsProps> = ({ userProfile, appSettings, onProfileUpdate }) => {
  const [isRefillModalOpen, setIsRefillModalOpen] = useState(false);
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);
  const { addToast } = useToast();
  
  const usageSettings = appSettings.usage_settings || DEFAULT_USAGE_SETTINGS;
  const tiers = usageSettings?.tiers || (usageSettings as any)?.plans || DEFAULT_USAGE_SETTINGS.tiers;

  const handleSwitchToFreePlan = async () => {
    setIsVerifyingKey(true);
    try {
      const result = await onProfileUpdate({
        is_activated: true,
        subscription_status: 'free',
        use_personal_token: false,
      });
      if (result.success) {
        addToast('Switched to Free Plan successfully!', 'success');
      } else {
        addToast('Failed to switch plan.', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error switching plan.', 'error');
    } finally {
      setIsVerifyingKey(false);
    }
  };

  const handleUpgradePlan = async (planKey: any) => {
    const effectivePlanKey = planKey === 'pro' ? 'premium' : planKey;
    const activePlan = tiers[effectivePlanKey];
    const amount = activePlan.price_ngn;

    setIsVerifyingKey(true);

    if (isNative()) {
      if (!appSettings.revenuecat_api_key_android) {
        addToast("In-app purchases are not configured for Android yet.", "error");
        setIsVerifyingKey(false);
        return;
      }
      try {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        await Purchases.configure({ apiKey: appSettings.revenuecat_api_key_android });
        await Purchases.logIn({ appUserID: userProfile.uid });
        const currentOfferings = await Purchases.getOfferings();
        
        if (!currentOfferings.current) {
          addToast("Could not load packages.", "error");
          setIsVerifyingKey(false);
          return;
        }

        const pkgToBuy = currentOfferings.current.availablePackages.find((p: any) => p.identifier.toLowerCase().includes(effectivePlanKey));
        if (!pkgToBuy) {
          addToast("This plan is not available on Android.", "error");
          setIsVerifyingKey(false);
          return;
        }

        const purchaseResult = await Purchases.purchasePackage({ aPackage: pkgToBuy });
        
        if (typeof purchaseResult.customerInfo.entitlements.active !== "undefined" && Object.keys(purchaseResult.customerInfo.entitlements.active).length > 0) {
          const result = await onProfileUpdate({
            is_activated: true,
            subscription_status: planKey,
            use_personal_token: false,
            paystack_reference: 'google-play-' + purchaseResult.transaction.transactionIdentifier,
          });
          if (result.success) {
            addToast(`AVELUT ${activePlan.name || activePlan.display_name} activated successfully!`, 'success');
          } else {
            addToast('Purchase successful but activation failed. Contact support.', 'error');
          }
        }
      } catch (e: any) {
        console.error("RevenueCat Purchase Error:", e);
        if (!e.userCancelled) {
          addToast("Failed to complete purchase via Google Play.", "error");
        }
      } finally {
        setIsVerifyingKey(false);
      }
      return;
    }

    const publicKey = appSettings.paystack_public_key?.trim();
    const email = `${userProfile.uid}@avelut.com`;

    await triggerPaystackPurchase({
      publicKey,
      email,
      amount,
      userId: userProfile.uid,
      purchaseType: 'subscription',
      metadata: { plan_tier: planKey, upgrade: true },
      addToast,
      onSuccess: async (reference) => {
        const result = await onProfileUpdate({
          is_activated: true,
          subscription_status: planKey,
          use_personal_token: false,
          paystack_reference: reference,
        });
        if (result.success) {
          addToast(`AVELUT ${activePlan.name || activePlan.display_name} activated successfully!`, 'success');
        } else {
          addToast('Payment received but upgrade failed. Contact support.', 'error');
        }
        setIsVerifyingKey(false);
      },
      onCancel: () => {
        setIsVerifyingKey(false);
      },
      onError: (err) => {
        console.error(err);
        setIsVerifyingKey(false);
      }
    });
  };

  const handlePlanSelection = async (planKey: string, extraData?: { apiKey: string }) => {
    if (planKey === 'free') {
      handleSwitchToFreePlan();
    } else if (planKey === 'personal_token') {
      // Handled internally or needs a dedicated function, assuming it's done via SubscriptionCards state usually
      // For now we will invoke onProfileUpdate directly for token logic
      if (extraData?.apiKey) {
        setIsVerifyingKey(true);
        const result = await onProfileUpdate({
          is_activated: true,
          subscription_status: 'personal_token',
          use_personal_token: true,
          personal_api_key: extraData.apiKey,
        });
        if (result.success) {
          addToast('Personal Google Token activated successfully!', 'success');
        } else {
          addToast('Failed to save token.', 'error');
        }
        setIsVerifyingKey(false);
      }
    } else {
      handleUpgradePlan(planKey);
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
              onClick={() => setIsRefillModalOpen(true)}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/30 active:scale-[0.98] w-full md:w-auto border border-blue-500"
            >
              Refill Credits
            </button>
          </div>
        </div>
      </div>

      {/* Subscription Status Details */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2 block">Current Subscription</span>
          <div className="flex items-center gap-3">
            <h4 className="font-extrabold text-slate-900 text-xl">
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

      {/* Subscription Plans Slider */}
      <div>
        <div className="mb-6 px-2">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Upgrade Your Plan</h3>
            <p className="text-sm text-slate-500 font-semibold mt-1">Swipe to view all available tiers. Cancel anytime.</p>
        </div>
        
        <SubscriptionCards
          userProfile={userProfile}
          appSettings={appSettings}
          onSelectPlan={handlePlanSelection}
          isVerifyingKey={isVerifyingKey}
          showCurrentPlan={true}
        />
      </div>

      <LimitExceededModal
        isOpen={isRefillModalOpen}
        onClose={() => setIsRefillModalOpen(false)}
        userProfile={userProfile}
        appSettings={appSettings}
        cost={0}
        balance={userProfile.ai_credits_balance ?? 0}
        addToast={addToast}
        onSuccessPurchase={() => {}}
      />
    </div>
  );
};
