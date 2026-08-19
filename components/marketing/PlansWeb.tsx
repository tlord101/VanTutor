import React, { useState, useEffect } from 'react';
import { DEFAULT_USAGE_SETTINGS } from '../../utils/appSettings';
import type { AppSettings, UserProfile } from '../../types';
import { triggerPaystackPurchase } from '../../utils/usage';
import { useToast } from '../../hooks/useToast';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

import { db } from '../../firebase';
import { ref as dbRef, update } from 'firebase/database';
import { saveLocalCredits } from '../../services/creditsStorageService';

interface PlansWebProps {
    appSettings: AppSettings;
    userProfile?: UserProfile;
}

export const PlansWeb: React.FC<PlansWebProps> = ({ appSettings, userProfile }) => {
    const [email, setEmail] = useState<string>(userProfile?.email || '');
    const [isProcessing, setIsProcessing] = useState(false);
    const { addToast } = useToast();

    const usageSettings = appSettings?.usage_settings || DEFAULT_USAGE_SETTINGS;
    const tiers = usageSettings?.tiers || (usageSettings as any)?.plans || DEFAULT_USAGE_SETTINGS.tiers;

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const selectedPlan = searchParams.get('plan');
        
        if (selectedPlan) {
            setTimeout(() => {
                const el = document.getElementById(`plan-${selectedPlan}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
        }
    }, []);

    const handlePurchasePlan = async (planKey: string) => {
        const searchParams = new URLSearchParams(window.location.search);
        const targetUid = userProfile?.uid || searchParams.get('uid');
        const emailFromParam = searchParams.get('email');
        const finalEmail = email || emailFromParam || userProfile?.email;

        if (planKey === 'free') return; // Cannot buy free plan

        if (!targetUid) {
            alert("Please log in to purchase a plan.");
            return;
        }
        if (!finalEmail || !finalEmail.includes('@')) {
            alert("Please enter a valid email address to receive your receipt.");
            return;
        }
        if (!appSettings.paystack_public_key) {
            alert("Payment gateway is not configured yet.");
            return;
        }

        setIsProcessing(true);
        try {
            const effectivePlanKey = planKey === 'pro' ? 'premium' : planKey;
            const activePlan = tiers[effectivePlanKey];
            const amount = activePlan.price_ngn;

            await triggerPaystackPurchase({
                publicKey: appSettings.paystack_public_key,
                email: finalEmail.trim(),
                amount: amount,
                userId: targetUid,
                purchaseType: 'subscription',
                addToast,
                onSuccess: async (reference) => {
                    try {
                        // Immediate real-time database credit update
                        const userRef = dbRef(db, `users/${targetUid}`);
                        await update(userRef, {
                            subscription_status: effectivePlanKey,
                            ai_credits_balance: activePlan.credit_allocation,
                            subscription_updated_at: Date.now(),
                        });
                        saveLocalCredits(targetUid, activePlan.credit_allocation, effectivePlanKey).catch(console.warn);

                        // Call verification function
                        try {
                            const verifyTx = httpsCallable(functions, 'verifyPaystackTransaction');
                            await verifyTx({
                                reference,
                                purchaseType: 'subscription',
                                planKey: effectivePlanKey
                            });
                        } catch (fnErr) {
                            console.warn('[PlansWeb] Cloud verification notice:', fnErr);
                        }

                        addToast('Payment successful! Your plan and credits have been updated.', 'success');
                        setTimeout(() => {
                            window.location.href = '/payment-success';
                        }, 800);
                    } finally {
                        setIsProcessing(false);
                    }
                },
                onCancel: () => {
                    addToast('Payment was cancelled.', 'info');
                    setIsProcessing(false);
                },
                onError: (err) => {
                    console.error("Paystack error", err);
                    addToast((err as any)?.message || 'Payment failed to initialize.', 'error');
                    setIsProcessing(false);
                }
            });
        } catch (err) {
            console.error(err);
            addToast("Failed to initialize payment", "error");
            setIsProcessing(false);
        }
    };

    const getFeatures = (tier: any) => {
        if (!tier) return [];
        return [
            { text: `${tier.credit_allocation} AI credits allocation`, included: true },
            { text: tier.max_saved_courses === -1 ? 'Unlimited saved courses' : `Up to ${tier.max_saved_courses} saved courses`, included: true },
            { text: tier.description?.split('.')[0] || 'Standard study tools', included: true },
            { text: 'Unlimited study time', included: tier.tier_id === 'premium' },
            { text: 'Verification badge', included: tier.has_verification_badge }
        ];
    };

    return (
        <div className="min-h-screen bg-[#f8fafc]  dark:text-white font-sans pb-24 overflow-x-hidden">
            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo_icon.png" alt="AVELUT" className="w-8 h-8 object-contain" />
                        <span className="text-xl font-bold tracking-tight  dark:text-white">AVELUT <span className="font-light text-slate-500">Premium</span></span>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
                
                {/* Hero Section */}
                <div className="text-center max-w-2xl mx-auto space-y-4">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-widest text-slate-700 uppercase">
                        Pricing Table Design
                    </h1>
                </div>

                <div className="max-w-md mx-auto mb-12">
                    <input 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter email address for receipt"
                        className="bg-white border border-slate-200  dark:text-white text-center font-medium text-base rounded-full focus:ring-[#009EE2] focus:border-[#009EE2] block w-full py-3 px-6 shadow-sm outline-none"
                    />
                </div>

                {/* Plans Section */}
                <section>
                    <div className="flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-8 max-w-5xl mx-auto pt-4">
                        
                        {/* Basic Plan Wrapper */}
                        <div id="plan-free" className="w-full max-w-[300px]">
                            <PricingCard 
                                plan="BASIC"
                                displayPrice="Free"
                                theme={{
                                    tab: '#2dd4bf', // Teal 400
                                    glow: '#2dd4bf',
                                    buttonBg: '#ccfbf1', // Teal 50
                                    buttonText: '#0f766e' // Teal 700
                                }}
                                isCurrentPlan={!userProfile?.subscription_status || userProfile.subscription_status === 'free' || userProfile.subscription_status === 'none'}
                                features={getFeatures(tiers?.free)}
                                onPurchase={() => handlePurchasePlan('free')}
                                disabled={true}
                            />
                        </div>

                        {/* Business Plan Wrapper */}
                        <div id="plan-basic" className="w-full max-w-[300px]">
                            <PricingCard 
                                plan="BUSINESS"
                                displayPrice={`$${(tiers?.basic?.price_ngn / 1000)?.toFixed(2) || '1.00'}`}
                                theme={{
                                    tab: '#818cf8', // Indigo 400
                                    glow: '#6366f1',
                                    buttonBg: '#e0e7ff', // Indigo 100
                                    buttonText: '#4338ca' // Indigo 700
                                }}
                                isCurrentPlan={userProfile?.subscription_status === 'basic'}
                                features={getFeatures(tiers?.basic)}
                                onPurchase={() => handlePurchasePlan('basic')}
                                disabled={isProcessing || !email}
                            />
                        </div>

                        {/* Premium Plan Wrapper */}
                        <div id="plan-premium" className="w-full max-w-[300px]">
                            <PricingCard 
                                plan="PREMIUM"
                                displayPrice={`$${(tiers?.premium?.price_ngn / 1000)?.toFixed(2) || '3.00'}`}
                                theme={{
                                    tab: '#c084fc', // Purple 400
                                    glow: '#a855f7',
                                    buttonBg: '#f3e8ff', // Purple 100
                                    buttonText: '#7e22ce' // Purple 700
                                }}
                                isCurrentPlan={userProfile?.subscription_status === 'premium' || userProfile?.subscription_status === 'pro'}
                                features={getFeatures(tiers?.premium)}
                                onPurchase={() => handlePurchasePlan('premium')}
                                disabled={isProcessing || !email}
                            />
                        </div>

                    </div>
                </section>
            </main>
        </div>
    );
};

// --- Custom Components ---

interface PricingFeature {
    text: string;
    included: boolean;
}

interface PricingCardTheme {
    tab: string;
    glow: string;
    buttonBg: string;
    buttonText: string;
}

interface PricingCardProps {
    plan: string;
    displayPrice: string;
    theme: PricingCardTheme;
    isCurrentPlan?: boolean;
    features: PricingFeature[];
    onPurchase: () => void;
    disabled: boolean;
    buttonText?: string;
}

const PricingCard: React.FC<PricingCardProps> = ({ 
    plan, 
    displayPrice, 
    theme, 
    isCurrentPlan,
    features, 
    onPurchase, 
    disabled, 
    buttonText 
}) => {
    return (
        <div className="relative w-full mx-auto pt-6 pb-4">
            {/* The Tab at the top */}
            <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 px-8 py-2.5 rounded-t-2xl text-white font-bold text-xs tracking-wider shadow-sm z-10" 
                style={{ backgroundColor: theme.tab, minWidth: '140px', textAlign: 'center' }}
            >
                {plan}
            </div>
            
            {/* The white inner card */}
            <div className="relative bg-white rounded-3xl px-6 pb-8 pt-12 shadow-lg flex flex-col items-center overflow-hidden">
                
                {/* The Glow Effect */}
                <div 
                    className="absolute -top-16 left-1/2 -translate-x-1/2 w-[160%] h-48 rounded-[100%] blur-[30px] opacity-90 pointer-events-none"
                    style={{ backgroundColor: theme.glow }}
                ></div>

                {/* Price */}
                <div className="relative z-10 text-center mb-10 mt-2">
                    <div className="text-4xl font-extrabold text-white mb-1 drop-shadow-md">{displayPrice}</div>
                    {displayPrice !== 'Free' && <div className="text-white/90 text-[11px] font-semibold uppercase tracking-wider">per month</div>}
                    {displayPrice === 'Free' && <div className="text-white/90 text-[11px] font-semibold uppercase tracking-wider">forever</div>}
                </div>
                
                {/* Features */}
                <ul className="space-y-4 w-full mb-10 relative z-10 px-2">
                    {features.map((feature, i) => (
                        <li key={i} className="flex items-start text-[13px] font-medium leading-relaxed">
                            {feature.included ? (
                                <svg className="w-4 h-4 mt-0.5 mr-3 shrink-0" style={{ color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                            ) : (
                                <svg className="w-4 h-4 mt-0.5 mr-3 shrink-0" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                            )}
                            <span className={feature.included ? 'text-slate-600' : 'text-slate-400'}>{feature.text}</span>
                        </li>
                    ))}
                </ul>

                {/* Button */}
                <button 
                    onClick={onPurchase}
                    disabled={disabled}
                    className="relative z-10 w-[80%] py-3 rounded-full font-bold transition-all text-sm tracking-wide disabled:opacity-50 hover:opacity-90 active:scale-95"
                    style={{ 
                        backgroundColor: isCurrentPlan ? '#f1f5f9' : theme.buttonBg,
                        color: isCurrentPlan ? '#94a3b8' : theme.buttonText 
                    }}
                >
                    {isCurrentPlan ? 'Current Plan' : (buttonText || 'Get Started')}
                </button>
            </div>
        </div>
    );
}
