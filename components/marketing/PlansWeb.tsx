import React, { useState } from 'react';
import { DEFAULT_USAGE_SETTINGS } from '../../utils/appSettings';
import type { AppSettings, UserProfile } from '../../types';
import { triggerPaystackPurchase } from '../../utils/usage';
import { useToast } from '../../hooks/useToast';

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

    const handlePurchasePlan = async (planKey: string) => {
        const searchParams = new URLSearchParams(window.location.search);
        const targetUid = userProfile?.uid || searchParams.get('uid');
        const emailFromParam = searchParams.get('email');
        const finalEmail = email || emailFromParam || userProfile?.email;

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
                    addToast('Payment successful! Your plan will be updated shortly.', 'success');
                    setIsProcessing(false);
                },
                onCancel: () => {
                    addToast('Payment was cancelled.', 'info');
                    setIsProcessing(false);
                },
                onError: (err) => {
                    console.error("Paystack error", err);
                    addToast('Payment failed to initialize.', 'error');
                    setIsProcessing(false);
                }
            });
        } catch (err) {
            console.error(err);
            addToast("Failed to initialize payment", "error");
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans pb-24">
            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo_icon.png" alt="AVELUT" className="w-8 h-8 object-contain" />
                        <span className="text-xl font-bold tracking-tight text-slate-800">AVELUT <span className="font-light text-slate-500">Premium</span></span>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
                
                {/* Hero Section */}
                <div className="text-center max-w-2xl mx-auto space-y-4">
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                        Choose the right plan for your studies
                    </h1>
                    <p className="text-lg text-slate-600">
                        Get more out of AVELUT with AI credits and premium features. Securely processed by Paystack.
                    </p>
                </div>

                <div className="max-w-md mx-auto mb-8">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 text-center">Email Address for Receipt</label>
                    <input 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        className="bg-white border border-slate-200 text-slate-900 text-base rounded-xl focus:ring-blue-500 focus:border-blue-500 block w-full p-3 shadow-sm"
                    />
                </div>

                {/* Plans Section */}
                <section>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Free Plan (Display Only) */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 flex flex-col">
                            <h3 className="text-xl font-bold mb-2">{tiers?.free?.display_name || 'Free Plan'}</h3>
                            <div className="text-3xl font-black mb-6">₦0 <span className="text-sm font-normal text-slate-500">/ forever</span></div>
                            <ul className="space-y-4 mb-8 flex-1">
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-slate-600 text-sm">Basic AI assistance</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-slate-600 text-sm">Pay-as-you-go credits</span>
                                </li>
                            </ul>
                            <button disabled className="w-full py-3 px-4 rounded-xl font-bold bg-slate-100 text-slate-500 cursor-not-allowed">
                                Current Plan
                            </button>
                        </div>

                        {/* Basic/Student Plan */}
                        <div className="bg-white rounded-3xl p-8 border border-blue-200 shadow-xl shadow-blue-900/5 relative flex flex-col">
                            <h3 className="text-xl font-bold text-blue-700 mb-2">{tiers?.basic?.display_name || 'Student Plan'}</h3>
                            <div className="text-3xl font-black mb-6">₦{tiers?.basic?.price_ngn?.toLocaleString() || '1,000'} <span className="text-sm font-normal text-slate-500">/ month</span></div>
                            <ul className="space-y-4 mb-8 flex-1">
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-slate-600 text-sm">{tiers?.basic?.daily_free_limit || 20} Free Daily Interactions</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-slate-600 text-sm">Enhanced visual solving capabilities</span>
                                </li>
                            </ul>
                            <button 
                                onClick={() => handlePurchasePlan('basic')}
                                disabled={isProcessing || !email}
                                className="w-full py-3 px-4 rounded-xl font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                            >
                                Upgrade to Student
                            </button>
                        </div>

                        {/* Premium/Pro Plan */}
                        <div className="bg-gradient-to-b from-indigo-600 to-blue-700 rounded-3xl p-8 text-white shadow-2xl shadow-indigo-600/20 relative flex flex-col transform md:-translate-y-4">
                            <div className="absolute top-0 right-0 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-black px-3 py-1 rounded-bl-xl rounded-tr-3xl uppercase tracking-wider">
                                Recommended
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-indigo-100">{tiers?.premium?.display_name || 'Premium Plan'}</h3>
                            <div className="text-3xl font-black mb-6">₦{tiers?.premium?.price_ngn?.toLocaleString() || '2,500'} <span className="text-sm font-normal text-indigo-200">/ month</span></div>
                            <ul className="space-y-4 mb-8 flex-1">
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-indigo-200 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-indigo-50 text-sm">{tiers?.premium?.daily_free_limit || 'Unlimited'} Daily Interactions</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-indigo-200 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-indigo-50 text-sm">Priority AI Processing</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-indigo-200 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-indigo-50 text-sm">Access to advanced models (GPT-4o, Claude 3.5 Sonnet)</span>
                                </li>
                            </ul>
                            <button 
                                onClick={() => handlePurchasePlan('premium')}
                                disabled={isProcessing || !email}
                                className="w-full py-3 px-4 rounded-xl font-bold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors shadow-lg disabled:opacity-50"
                            >
                                Get Premium
                            </button>
                        </div>
                    </div>
                </section>

            </main>
        </div>
    );
};
