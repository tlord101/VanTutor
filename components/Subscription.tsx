import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile, UserPlan } from '../types';
import { PremiumIcon } from './icons/PremiumIcon';

// This is a placeholder public key. Replace with your actual Paystack public key.
const PAYSTACK_PUBLIC_KEY = 'pk_live_9ca8fd7f800eb630f535045b6a0467fc95e47f18';

declare var PaystackPop: any;

const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

// IMPORTANT: Replace these placeholder plan codes with the actual codes from your Paystack Dashboard.
// You must create these subscription plans in Paystack for this to work.
// See: https://paystack.com/docs/payments/subscriptions/
const planDetails: { [key in UserPlan]: { name: string; price: number; features: string[], highlight?: boolean; planCode?: string; } } = {
  free: {
    name: 'Free',
    price: 0,
    features: [
      'Access to 1st subject',
      'Access to 1st topic per subject',
      '5 AI interactions per minute',
      'Standard support',
    ],
  },
  starter: {
    name: 'Starter',
    price: 1000, // NGN
    planCode: 'PLN_3s5lsaohhz4qrgg', // Updated plan code
    features: [
      'Access to first 5 subjects',
      'Unlimited topics within subjects',
      '20 AI interactions per minute',
      'Priority email support',
    ],
    highlight: true,
  },
  smart: {
    name: 'Smart',
    price: 3000, // NGN
    planCode: 'PLN_mo4w3qu1nq539h0', // Updated plan code
    features: [
      'Access to all subjects',
      'Unlimited topics',
      'Effectively unlimited AI interactions',
      '24/7 dedicated support',
    ],
  },
};

interface PlanCardProps {
  planKey: UserPlan;
  plan: typeof planDetails[UserPlan];
  currentPlan: UserPlan;
  onSelectPlan: (planKey: UserPlan) => void;
  isProcessing: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({ planKey, plan, currentPlan, onSelectPlan, isProcessing }) => {
  const isCurrent = planKey === currentPlan;

  // FIX: Safeguard against cases where `currentPlan` might be undefined or invalid in a user's profile.
  // Default to the 'free' plan's details for comparison purposes.
  const currentPlanDetails = planDetails[currentPlan] || planDetails.free;
  const isUpgrade = plan.price > currentPlanDetails.price;

  const getButton = () => {
    if (isCurrent) {
      return <button disabled className="w-full py-3 px-4 rounded-lg bg-white/10 text-white font-bold cursor-not-allowed">Your Current Plan</button>;
    }
    if (isUpgrade) {
      return (
        <button
          onClick={() => onSelectPlan(planKey)}
          disabled={isProcessing}
          className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-lime-500 to-teal-500 text-white font-bold hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
              <span>Processing...</span>
            </>
          ) : (
            `Upgrade to ${plan.name}`
          )}
        </button>
      );
    }
    return <button disabled className="w-full py-3 px-4 rounded-lg bg-white/5 text-gray-500 font-bold cursor-not-allowed">Downgrade not supported</button>;
  };

  return (
    <div className={`flex flex-col bg-gradient-to-br from-white/[.07] to-white/0 backdrop-blur-lg p-6 rounded-2xl border ${plan.highlight ? 'border-lime-500' : 'border-white/10'}`}>
      {plan.highlight && <div className="text-center mb-4 text-sm font-bold text-lime-400 bg-lime-500/10 py-1 px-3 rounded-full self-center">Most Popular</div>}
      <h3 className="text-2xl font-bold text-white text-center">{plan.name}</h3>
      <p className="text-center mt-2">
        <span className="text-4xl font-extrabold text-white">₦{plan.price.toLocaleString()}</span>
        <span className="text-gray-400">/month</span>
      </p>
      <ul className="mt-6 space-y-3 flex-grow">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <CheckIcon className="w-5 h-5 text-lime-400 flex-shrink-0 mt-0.5 mr-3" />
            <span className="text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        {getButton()}
      </div>
    </div>
  );
};

interface SubscriptionProps {
  user: User | null;
  userProfile: UserProfile;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
}

export const Subscription: React.FC<SubscriptionProps> = ({ user, userProfile, onProfileUpdate }) => {
  const [processingPlan, setProcessingPlan] = useState<UserPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleUpgrade = (planKey: UserPlan) => {
    if (!user?.email) {
      setError("Your email is not available for payment. Please try again or contact support.");
      return;
    }

    const selectedPlan = planDetails[planKey];
    if (!selectedPlan || !selectedPlan.planCode) {
        setError("Invalid subscription plan selected or plan code is missing.");
        return;
    }

    if (typeof PaystackPop === 'undefined' || !PaystackPop) {
        setError("Payment service failed to load. Please check your internet connection or try again later.");
        setProcessingPlan(null);
        return;
    }

    setProcessingPlan(planKey);
    setError(null);
    setSuccessMessage(null);

    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: user.email,
      plan: selectedPlan.planCode, // Use the plan code for subscriptions
      // 'amount' is not needed when a 'plan' is specified
      ref: `VANTUTOR-SUB-${user.uid}-${Date.now()}`,
      async callback(response: any) {
        // In a real application, you would send the 'response.reference' to your backend
        // to verify the subscription status with Paystack before updating the user's plan.
        if (response.status === 'success') {
          const result = await onProfileUpdate({ plan: planKey });
          if (result.success) {
            setSuccessMessage(`Successfully upgraded to the ${planDetails[planKey].name} plan! Your new features are now active.`);
          } else {
            setError(result.error || "Payment successful, but we couldn't update your plan. Please contact support with your payment reference.");
          }
        } else {
            setError("Subscription was not successful. Please try again or contact your bank.");
        }
        setProcessingPlan(null);
      },
      onClose() {
        setProcessingPlan(null);
      },
    });
    handler.openIframe();
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <p className="text-center text-gray-300 mb-8 max-w-2xl mx-auto">
              Choose a plan to unlock more features and accelerate your learning journey with VANTUTOR.
          </p>
          {error && <div className="bg-red-500/20 border border-red-500 text-red-300 text-center p-3 rounded-lg mb-6">{error}</div>}
          {successMessage && <div className="bg-green-500/20 border border-green-500 text-green-300 text-center p-3 rounded-lg mb-6">{successMessage}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(Object.keys(planDetails) as UserPlan[]).map(planKey => (
                  <PlanCard
                      key={planKey}
                      planKey={planKey}
                      plan={planDetails[planKey]}
                      currentPlan={userProfile.plan}
                      onSelectPlan={handleUpgrade}
                      isProcessing={processingPlan === planKey}
                  />
              ))}
          </div>
      </div>
    </div>
  );
};