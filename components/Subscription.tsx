
import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile, UserPlan } from '../types';
import { PremiumIcon } from './icons/PremiumIcon';

// This is a placeholder public key. Replace with your actual Paystack public key.
const PAYSTACK_PUBLIC_KEY = 'pk_live_9ca8fd7f800eb630f535045b6a0467fc95e47f18';

declare var PaystackPop: any;

// --- TYPE DEFINITIONS ---
const statusColors: { [key: string]: { bg: string; text: string; } } = {
  success: { bg: 'bg-green-100', text: 'text-green-800' },
  failed: { bg: 'bg-red-100', text: 'text-red-800' },
  abandoned: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  pending: { bg: 'bg-blue-100', text: 'text-blue-800' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-800' },
  queued: { bg: 'bg-gray-100', text: 'text-gray-800' },
  reversed: { bg: 'bg-purple-100', text: 'text-purple-800' },
  ongoing: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
};

interface TransactionDetails {
  status: keyof typeof statusColors;
  reference: string;
  amount: number;
  currency: string;
  gateway_response: string;
  paid_at: string | null;
  channel: string;
  customer: {
    email: string;
  };
}

interface PaystackApiResponse {
    status: boolean;
    message: string;
    data: TransactionDetails;
}

// --- HELPER & PLAN DATA ---
const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

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
    planCode: 'PLN_3s5lsaohhz4qrgg',
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
    planCode: 'PLN_mo4w3qu1nq539h0',
    features: [
      'Access to all subjects',
      'Unlimited topics',
      'Effectively unlimited AI interactions',
      '24/7 dedicated support',
    ],
  },
};

// --- API FUNCTION ---
const verifyTransaction = async (reference: string): Promise<TransactionDetails> => {
    // SECURITY WARNING: In a real-world production application, this API call
    // MUST be made from a secure backend server. Exposing your secret key in
    // client-side code is a major security risk.
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    
    if (!PAYSTACK_SECRET_KEY) {
        throw new Error("Payment provider key is not configured.");
    }
    
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
    }

    const result: PaystackApiResponse = await response.json();
    
    if (!result.status) {
        throw new Error(result.message || 'Transaction verification failed.');
    }

    return result.data;
};


// --- COMPONENTS ---
interface PlanCardProps {
  planKey: UserPlan;
  plan: typeof planDetails[UserPlan];
  currentPlan: UserPlan;
  onSelectPlan: (planKey: UserPlan) => void;
  isProcessing: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({ planKey, plan, currentPlan, onSelectPlan, isProcessing }) => {
  const isCurrent = planKey === currentPlan;
  const currentPlanDetails = planDetails[currentPlan] || planDetails.free;
  const isUpgrade = plan.price > currentPlanDetails.price;

  const getButton = () => {
    if (isCurrent) {
      return <button disabled className="w-full py-3 px-4 rounded-lg bg-gray-200 text-gray-800 font-bold cursor-not-allowed">Your Current Plan</button>;
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
    return <button disabled className="w-full py-3 px-4 rounded-lg bg-gray-100 text-gray-500 font-bold cursor-not-allowed">Downgrade not supported</button>;
  };

  return (
    <div className={`flex flex-col bg-white p-6 rounded-2xl border ${plan.highlight ? 'border-lime-500' : 'border-gray-200'}`}>
      {plan.highlight && <div className="text-center mb-4 text-sm font-bold text-lime-700 bg-lime-100 py-1 px-3 rounded-full self-center">Most Popular</div>}
      <h3 className="text-2xl font-bold text-gray-900 text-center">{plan.name}</h3>
      <p className="text-center mt-2">
        <span className="text-4xl font-extrabold text-gray-900">₦{plan.price.toLocaleString()}</span>
        <span className="text-gray-600">/month</span>
      </p>
      <ul className="mt-6 space-y-3 flex-grow">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <CheckIcon className="w-5 h-5 text-lime-500 flex-shrink-0 mt-0.5 mr-3" />
            <span className="text-gray-700">{feature}</span>
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
  const [verificationState, setVerificationState] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [isVerifyingFromRedirect, setIsVerifyingFromRedirect] = useState(false);

  const runVerification = async (reference: string) => {
    setVerificationState('verifying');
    setVerificationMessage('Verifying your payment, please wait...');

    const pendingPlan = sessionStorage.getItem('pendingPlanUpgrade') as UserPlan;
    if (!pendingPlan) {
        setVerificationState('error');
        setVerificationMessage("Could not verify payment: session expired or plan information is missing. Please try again.");
        setIsVerifyingFromRedirect(false);
        return;
    }

    try {
        const transactionDetails = await verifyTransaction(reference);

        if (transactionDetails.status === 'success') {
            const result = await onProfileUpdate({ plan: pendingPlan });
            if (result.success) {
                setVerificationState('success');
                setVerificationMessage(`Successfully upgraded to the ${planDetails[pendingPlan].name} plan! Your new features are now active.`);
            } else {
                setVerificationState('error');
                setVerificationMessage(result.error || "Payment successful, but we couldn't update your plan. Please contact support with your payment reference.");
            }
        } else {
            setVerificationState('error');
            setVerificationMessage(`Your payment status is '${transactionDetails.status}'. Please contact support for assistance.`);
        }
    } catch (error: any) {
        setVerificationState('error');
        setVerificationMessage(error.message || 'An unexpected error occurred while verifying your transaction.');
    } finally {
        sessionStorage.removeItem('pendingPlanUpgrade');
        setIsVerifyingFromRedirect(false);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('trxref') || urlParams.get('reference');

    if (reference) {
      setIsVerifyingFromRedirect(true);
      runVerification(reference);
      // Clean the URL to prevent re-triggering on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleUpgrade = (planKey: UserPlan) => {
    if (!user?.email) {
      setVerificationState('error');
      setVerificationMessage("Your email is not available for payment. Please try again or contact support.");
      return;
    }

    const selectedPlan = planDetails[planKey];
    if (!selectedPlan || !selectedPlan.planCode) {
        setVerificationState('error');
        setVerificationMessage("Invalid subscription plan selected or plan code is missing.");
        return;
    }

    if (typeof PaystackPop === 'undefined' || !PaystackPop) {
        setVerificationState('error');
        setVerificationMessage("Payment service failed to load. Please check your internet connection or try again later.");
        return;
    }

    setProcessingPlan(planKey);
    setVerificationState('idle');
    setVerificationMessage(null);
    // Store the selected plan in case of a redirect
    sessionStorage.setItem('pendingPlanUpgrade', planKey);

    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: user.email,
      plan: selectedPlan.planCode,
      ref: `VANTUTOR-SUB-${user.uid}-${Date.now()}`,
      async callback(response: { reference: string, status: string }) {
        setProcessingPlan(null);
        setIsVerifyingFromRedirect(true); // Also show overlay for popup flow for consistency
        await runVerification(response.reference);
      },
      onClose() {
        setProcessingPlan(null);
        sessionStorage.removeItem('pendingPlanUpgrade');
      },
    });
    handler.openIframe();
  };
  
  const isDuringProcess = !!processingPlan || verificationState === 'verifying';

  return (
    <div className="flex-1 flex flex-col h-full w-full">
      {isVerifyingFromRedirect && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex flex-col items-center justify-center z-50">
          <div className="w-12 h-12 border-4 border-t-lime-500 border-white rounded-full animate-spin"></div>
          <p className="mt-4 text-white text-lg">Verifying your payment, please wait...</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
              Choose a plan to unlock more features and accelerate your learning journey with VANTUTOR.
          </p>
          {verificationMessage && verificationState !== 'verifying' && (
            <div className={`text-center p-3 rounded-lg mb-6 border flex items-center justify-center ${
                verificationState === 'success' ? 'bg-green-100 border-green-300 text-green-700' :
                verificationState === 'error' ? 'bg-red-100 border-red-300 text-red-700' :
                'bg-blue-100 border-blue-300 text-blue-700'
            }`}>
                {verificationMessage}
            </div>
           )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(Object.keys(planDetails) as UserPlan[]).map(planKey => (
                  <PlanCard
                      key={planKey}
                      planKey={planKey}
                      plan={planDetails[planKey]}
                      currentPlan={userProfile.plan}
                      onSelectPlan={handleUpgrade}
                      isProcessing={processingPlan === planKey || isVerifyingFromRedirect}
                  />
              ))}
          </div>
      </div>
    </div>
  );
};
