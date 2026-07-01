import React, { useState } from 'react';
import { DEFAULT_USAGE_SETTINGS } from '../../utils/appSettings';
import type { AppSettings, UserProfile } from '../../types';

interface BillingWebProps {
    appSettings: AppSettings;
    userProfile?: UserProfile;
}

export const BillingWeb: React.FC<BillingWebProps> = ({ appSettings, userProfile }) => {
    const [customAmount, setCustomAmount] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    const usageSettings = appSettings?.usage_settings || DEFAULT_USAGE_SETTINGS;
    const tiers = usageSettings?.tiers || (usageSettings as any)?.plans || DEFAULT_USAGE_SETTINGS.tiers;

    const quickAmounts = [500, 1000, 5000];

    const handlePurchaseCredits = async (amount: number) => {
        if (!userProfile?.uid) {
            alert("Please log in to purchase credits.");
            return;
        }
        if (amount < 100) {
            alert("Minimum amount is ₦100");
            return;
        }

        setIsProcessing(true);
        try {
            // Call Firebase function
            // Temporary placeholder until Firebase Function is integrated
            console.log("Purchasing credits:", amount);
            alert(`Proceeding to Paystack for ₦${amount}... (Firebase function placeholder)`);
        } catch (err) {
            console.error(err);
            alert("Failed to initialize payment");
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePurchasePlan = async (planKey: string) => {
        if (!userProfile?.uid) {
            alert("Please log in to purchase a plan.");
            return;
        }
        
        setIsProcessing(true);
        try {
            const effectivePlanKey = planKey === 'pro' ? 'premium' : planKey;
            const activePlan = tiers[effectivePlanKey];
            const amount = activePlan.price_ngn;

            console.log("Purchasing plan:", planKey, "Amount:", amount);
            alert(`Proceeding to Paystack for ${activePlan.display_name} (₦${amount})... (Firebase function placeholder)`);
        } catch (err) {
            console.error(err);
            alert("Failed to initialize payment");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#1A1A1A] text-slate-900 dark:text-slate-100 font-sans pb-24">
            {/* Header */}
            <header className="bg-white dark:bg-[#202124] shadow-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo_icon.png" alt="AVELUT" className="w-8 h-8 object-contain" />
                        <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">AVELUT <span className="font-light text-slate-500">Billing</span></span>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
                
                {/* Hero Section */}
                <div className="text-center max-w-2xl mx-auto space-y-4">
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                        Choose the right plan for your studies
                    </h1>
                    <p className="text-lg text-slate-600 dark:text-slate-400">
                        Get more out of AVELUT with AI credits and premium features. Securely processed by Paystack.
                    </p>
                </div>

                {/* Credit Refill Section */}
                <section className="bg-white dark:bg-[#202124] rounded-3xl p-8 sm:p-12 shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <svg className="w-48 h-48 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.7c.09 1.28 1.07 1.84 2.25 1.84 1.47 0 2.23-.74 2.23-1.6 0-1.14-.99-1.48-2.68-1.96-1.85-.53-3.49-1.39-3.49-3.41 0-1.63 1.21-2.9 3.01-3.32V4h2.67v1.91c1.51.32 2.72 1.34 2.92 3.02h-1.7c-.16-1.04-1.06-1.6-2.12-1.6-1.32 0-2.1.67-2.1 1.5 0 1.05.91 1.4 2.56 1.88 2.06.6 3.61 1.5 3.61 3.51 0 1.94-1.36 2.99-3.05 3.37z"/></svg>
                    </div>
                    
                    <div className="relative z-10 max-w-xl">
                        <h2 className="text-2xl font-bold mb-2">Refill AI Credits</h2>
                        <p className="text-slate-600 dark:text-slate-400 mb-8">Purchase credits on-demand to continue using AVELUT's powerful visual solver and AI tutor.</p>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Quick Select</label>
                                <div className="flex flex-wrap gap-3">
                                    {quickAmounts.map(amt => (
                                        <button
                                            key={amt}
                                            onClick={() => setCustomAmount(amt.toString())}
                                            className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all ${customAmount === amt.toString() ? 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-300' : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:bg-[#303134] dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500'}`}
                                        >
                                            ₦{amt.toLocaleString()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Custom Amount (₦)</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="number"
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        placeholder="Enter amount (min 100)"
                                        className="flex-1 max-w-[200px] bg-slate-50 border border-slate-200 text-slate-900 text-lg rounded-xl focus:ring-blue-500 focus:border-blue-500 block w-full p-3 dark:bg-[#303134] dark:border-slate-700 dark:placeholder-slate-500 dark:text-white"
                                    />
                                    <button
                                        disabled={isProcessing || !customAmount || parseInt(customAmount) < 100}
                                        onClick={() => handlePurchaseCredits(parseInt(customAmount))}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20"
                                    >
                                        {isProcessing ? 'Processing...' : 'Buy Credits'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Plans Section */}
                <section>
                    <h2 className="text-3xl font-bold text-center mb-10">Premium Plans</h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Free Plan (Display Only) */}
                        <div className="bg-white dark:bg-[#202124] rounded-3xl p-8 border border-slate-200 dark:border-slate-800 flex flex-col">
                            <h3 className="text-xl font-bold mb-2">{tiers?.free?.display_name || 'Free Plan'}</h3>
                            <div className="text-3xl font-black mb-6">₦0 <span className="text-sm font-normal text-slate-500">/ forever</span></div>
                            <ul className="space-y-4 mb-8 flex-1">
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-slate-600 dark:text-slate-400 text-sm">Basic AI assistance</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-slate-600 dark:text-slate-400 text-sm">Pay-as-you-go credits</span>
                                </li>
                            </ul>
                            <button disabled className="w-full py-3 px-4 rounded-xl font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed">
                                Current Plan
                            </button>
                        </div>

                        {/* Basic/Student Plan */}
                        <div className="bg-white dark:bg-[#202124] rounded-3xl p-8 border border-blue-200 dark:border-blue-900 shadow-xl shadow-blue-900/5 relative flex flex-col">
                            <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400 mb-2">{tiers?.basic?.display_name || 'Student Plan'}</h3>
                            <div className="text-3xl font-black mb-6">₦{tiers?.basic?.price_ngn?.toLocaleString() || '1,000'} <span className="text-sm font-normal text-slate-500">/ month</span></div>
                            <ul className="space-y-4 mb-8 flex-1">
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-slate-600 dark:text-slate-400 text-sm">{tiers?.basic?.daily_free_limit || 20} Free Daily Interactions</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span className="text-slate-600 dark:text-slate-400 text-sm">Enhanced visual solving capabilities</span>
                                </li>
                            </ul>
                            <button 
                                onClick={() => handlePurchasePlan('basic')}
                                disabled={isProcessing}
                                className="w-full py-3 px-4 rounded-xl font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors"
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
                                disabled={isProcessing}
                                className="w-full py-3 px-4 rounded-xl font-bold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors shadow-lg"
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
