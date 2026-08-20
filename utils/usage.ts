import { db } from '../firebase';
import { ref as dbRef, push, set, update, get, runTransaction } from 'firebase/database';
import type { UserProfile, AppSettings } from '../types';
import { DEFAULT_USAGE_SETTINGS, DEFAULT_APP_SETTINGS } from './appSettings';
import { saveLocalCredits, recordLocalCreditDeduction } from '../services/creditsStorageService';

// Load Paystack script dynamically
const loadPaystackScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if ((window as any).PaystackPop) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

interface PaystackPurchaseOptions {
  publicKey: string;
  email: string;
  amount: number;
  userId: string;
  userName?: string;
  purchaseType: 'subscription' | 'additional_credits';
  metadata?: any;
  onSuccess: (reference: string) => Promise<void>;
  onCancel?: () => void;
  onError?: (err: any) => void;
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const triggerPaystackPurchase = async (options: PaystackPurchaseOptions) => {
  const { publicKey, email, amount, userId, userName, purchaseType, metadata, onSuccess, onCancel, onError, addToast } = options;

  let paymentLogRef: any = null;
  try {
    paymentLogRef = push(dbRef(db, 'usage_logs/payments'));
    await set(paymentLogRef, {
      id: paymentLogRef.key,
      user_id: userId,
      user_name: userName || metadata?.user_name || 'Student',
      user_email: email,
      email: email,
      amount: amount,
      purchase_type: purchaseType,
      plan_key: metadata?.plan_key || (purchaseType === 'subscription' ? 'basic' : null),
      credit_amount: metadata?.credit_amount || null,
      metadata: metadata || {},
      status: 'initiated',
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Failed to create payment log:', err);
  }

  const paystackMetadata = {
    ...(metadata || {}),
    payment_log_id: paymentLogRef?.key || metadata?.payment_log_id,
    custom_fields: [
      ...(Array.isArray(metadata?.custom_fields) ? metadata.custom_fields : []),
      { display_name: 'User ID', variable_name: 'user_id', value: userId },
      { display_name: 'Purchase Type', variable_name: 'purchase_type', value: purchaseType },
      ...(metadata?.plan_key ? [{ display_name: 'Plan Key', variable_name: 'plan_key', value: metadata.plan_key }] : []),
    ],
  };

  if (!publicKey) {
    addToast('Demo Mode: Simulating checkout...', 'info');
    setTimeout(async () => {
      const referenceId = 'demo_' + Math.random().toString(36).substring(2, 11);
      if (paymentLogRef) {
        try {
          await update(paymentLogRef, { status: 'success', reference: referenceId });
        } catch (e) {}
      }
      try {
        await onSuccess(referenceId);
      } catch (e) {
        if (onError) onError(e);
      }
    }, 2000);
    return;
  }

  const isLoaded = await loadPaystackScript();
  if (!isLoaded) {
    addToast('Could not load payment gateway.', 'error');
    if (paymentLogRef) {
      try {
        await update(paymentLogRef, { status: 'failed', error: 'Script load failed' });
      } catch (e) {}
    }
    if (onError) onError(new Error('Paystack script load failed'));
    return;
  }

  try {
    const handler = (window as any).PaystackPop.setup({
      key: publicKey,
      email: email,
      amount: amount * 100, // in kobo
      currency: 'NGN',
      metadata: paystackMetadata,
      callback: (response: any) => {
        const runAsyncCallback = async () => {
          const reference = response?.reference || 'ref_missing';

          if (response?.status && response.status !== 'success') {
            if (paymentLogRef) {
              try {
                await update(paymentLogRef, { status: 'failed', reference, error: response.message || 'Transaction failed' });
              } catch (e) {}
            }
            if (onError) onError(new Error(response.message || 'Transaction was not successful'));
            return;
          }

          if (paymentLogRef) {
            try {
              await update(paymentLogRef, { status: 'processing', reference }); // Changed to processing as backend verifies
            } catch (e) {}
          }
          try {
            await onSuccess(reference);
            if (paymentLogRef) {
               await update(paymentLogRef, { status: 'success' });
            }
          } catch (e) {
            if (paymentLogRef) {
              try {
                await update(paymentLogRef, { status: 'failed', error: e instanceof Error ? e.message : 'Verification failed' });
              } catch (err) {}
            }
            if (onError) onError(e);
          }
        };
        void runAsyncCallback();
      },
      onClose: () => {
        const runAsyncClose = async () => {
          if (paymentLogRef) {
            try {
              await update(paymentLogRef, { status: 'cancelled' });
            } catch (e) {}
          }
          addToast('Payment cancelled.', 'info');
          if (onCancel) onCancel();
        };
        void runAsyncClose();
      },
    });
    handler.openIframe();
  } catch (e: any) {
    console.error(e);
    if (paymentLogRef) {
      try {
        await update(paymentLogRef, { status: 'failed', error: e.message });
      } catch (err) {}
    }
    addToast('Error during payment processing.', 'error');
    if (onError) onError(e);
  }
};

// Helper to get dynamic costs from app settings with fallbacks
export const getFeatureCost = (
  feature: 'visual_solve' | 'chat_interaction' | 'flashcard_generation' | 'study_guide_extraction' | 'ai_quiz_generation' | 'study_guide_lesson',
  appSettings: AppSettings
): number => {
  return appSettings.usage_settings?.feature_costs?.[feature] ?? DEFAULT_USAGE_SETTINGS.feature_costs[feature];
};

export const getFeatureModel = (
  feature: 'visual_solve' | 'chat_interaction' | 'flashcard_generation' | 'study_guide_extraction' | 'ai_quiz_generation' | 'study_guide_lesson' | 'title_generation',
  appSettings: AppSettings
): string => {
  return appSettings.usage_settings?.feature_models?.[feature] || appSettings.primary_gemini_model || DEFAULT_APP_SETTINGS.primary_gemini_model;
};

// Legacy object for backward compatibility, mapped to dynamic getter
export const AI_COSTS = {
  get VISUAL_SOLVE() { return DEFAULT_USAGE_SETTINGS.feature_costs.visual_solve; },
  get CHAT_INTERACTION() { return DEFAULT_USAGE_SETTINGS.feature_costs.chat_interaction; },
  get FLASHCARD_GENERATION() { return DEFAULT_USAGE_SETTINGS.feature_costs.flashcard_generation; },
};

// Check if user is exempt from limits
const isExempt = (userProfile: UserProfile): boolean => {
  return !!(userProfile.is_admin || userProfile.use_personal_token || userProfile.subscription_status === 'personal_token');
};

/**
 * Validates if the user has enough AI credits for a given action.
 */
export const checkAICredits = (
  userProfile: UserProfile,
  cost: number,
  appSettings: AppSettings
) => {
  if (isExempt(userProfile)) {
    return { allowed: true, balance: Infinity, cost: 0 };
  }

  const planKey = (userProfile.subscription_status === 'pro' ? 'premium' : (userProfile.subscription_status || 'free')) as 'free' | 'basic' | 'premium';
  const usageSettings = appSettings.usage_settings || DEFAULT_USAGE_SETTINGS;
  const tiers = usageSettings?.tiers || (usageSettings as any)?.plans || DEFAULT_USAGE_SETTINGS.tiers;
  const monthlyLimit = tiers[planKey]?.credit_allocation ?? DEFAULT_USAGE_SETTINGS.tiers.free.credit_allocation;
  
  const balance = userProfile.ai_credits_balance ?? monthlyLimit;
  const allowed = balance >= cost;

  return { allowed, balance, cost };
};

/**
 * Safely decrements user AI credit balance in the database.
 */
export const deductAICredits = async (userId: string, cost: number, featureName: string, appSettings?: AppSettings) => {
  if (!userId || cost <= 0) return;
  try {
    const creditsRef = dbRef(db, `users/${userId}/ai_credits_balance`);
    const result = await runTransaction(creditsRef, (currentBalance) => {
      const balance = typeof currentBalance === 'number' ? currentBalance : 15;
      return Math.max(0, balance - cost);
    }, { applyLocally: true });

    if (result.committed) {
      const updatedBalance = result.snapshot.val() ?? 0;
      saveLocalCredits(userId, updatedBalance, 'free').catch(console.warn);
      recordLocalCreditDeduction(userId, cost, featureName).catch(console.warn);

      // Log usage in cloud asynchronously
      const usageLogRef = push(dbRef(db, `usage_logs/credits/${userId}`));
      void set(usageLogRef, {
        feature: featureName,
        deduction: cost,
        timestamp: Date.now(),
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[Credits] Deduction note:', err);
    recordLocalCreditDeduction(userId, cost, featureName).catch(() => {});
  }
};

// LEGACY trackers kept temporarily for smooth migration or removed if not referenced.
// We will replace their calls in components in the next step.
