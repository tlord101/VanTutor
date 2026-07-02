import React, { useState } from 'react';
import { DEFAULT_USAGE_SETTINGS } from '../../utils/appSettings';
import type { AppSettings, UserProfile } from '../../types';
import { triggerPaystackPurchase } from '../../utils/usage';
import { useToast } from '../../hooks/useToast';

interface RefillCreditsWebProps {
    appSettings: AppSettings;
    userProfile?: UserProfile;
}

export const RefillCreditsWeb: React.FC<RefillCreditsWebProps> = ({ appSettings, userProfile }) => {
    const [customAmount, setCustomAmount] = useState<string>('');
    const [email, setEmail] = useState<string>(userProfile?.email || '');
    const [isProcessing, setIsProcessing] = useState(false);
    const { addToast } = useToast();

    const quickAmounts = [500, 1000, 5000];

    const handlePurchaseCredits = async (amount: number) => {
        const searchParams = new URLSearchParams(window.location.search);
        const targetUid = userProfile?.uid || searchParams.get('uid');
        const emailFromParam = searchParams.get('email');
        const finalEmail = email || emailFromParam || userProfile?.email;

        if (!targetUid) {
            alert("Please log in to purchase credits.");
            return;
        }
        if (amount < 100) {
            alert("Minimum amount is ₦100");
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
            await triggerPaystackPurchase({
                publicKey: appSettings.paystack_public_key,
                email: finalEmail.trim(),
                amount: amount,
                userId: targetUid,
                purchaseType: 'additional_credits',
                addToast,
                onSuccess: async (reference) => {
                    addToast('Payment successful! Credits will be added shortly.', 'success');
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
                        <span className="text-xl font-bold tracking-tight text-slate-800">AVELUT <span className="font-light text-slate-500">Credits</span></span>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
                
                {/* Hero Section */}
                <div className="text-center max-w-2xl mx-auto space-y-4">
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                        Refill your AI Credits
                    </h1>
                    <p className="text-lg text-slate-600">
                        Purchase credits on-demand to continue using AVELUT's powerful visual solver and AI tutor. Securely processed by Paystack.
                    </p>
                </div>

                {/* Credit Refill Section */}
                <section className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-slate-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <svg className="w-48 h-48 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.7c.09 1.28 1.07 1.84 2.25 1.84 1.47 0 2.23-.74 2.23-1.6 0-1.14-.99-1.48-2.68-1.96-1.85-.53-3.49-1.39-3.49-3.41 0-1.63 1.21-2.9 3.01-3.32V4h2.67v1.91c1.51.32 2.72 1.34 2.92 3.02h-1.7c-.16-1.04-1.06-1.6-2.12-1.6-1.32 0-2.1.67-2.1 1.5 0 1.05.91 1.4 2.56 1.88 2.06.6 3.61 1.5 3.61 3.51 0 1.94-1.36 2.99-3.05 3.37z"/></svg>
                    </div>
                    
                    <div className="relative z-10 max-w-xl">
                        <h2 className="text-2xl font-bold mb-6">Payment Details</h2>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
                                <input 
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    className="bg-slate-50 border border-slate-200 text-slate-900 text-base rounded-xl focus:ring-blue-500 focus:border-blue-500 block w-full p-3"
                                />
                                <p className="text-xs text-slate-500 mt-1">Required for your Paystack receipt.</p>
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <label className="block text-sm font-semibold text-slate-700 mb-3">Quick Select</label>
                                <div className="flex flex-wrap gap-3">
                                    {quickAmounts.map(amt => (
                                        <button
                                            key={amt}
                                            onClick={() => setCustomAmount(amt.toString())}
                                            className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all ${customAmount === amt.toString() ? 'bg-blue-50 border-blue-600 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-slate-50'}`}
                                        >
                                            ₦{amt.toLocaleString()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-3">Custom Amount (₦)</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="number"
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        placeholder="Enter amount (min 100)"
                                        className="flex-1 max-w-[200px] bg-slate-50 border border-slate-200 text-slate-900 text-lg rounded-xl focus:ring-blue-500 focus:border-blue-500 block w-full p-3"
                                    />
                                    <button
                                        disabled={isProcessing || !customAmount || parseInt(customAmount) < 100 || !email}
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
            </main>
        </div>
    );
};
