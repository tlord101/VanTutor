import React, { useState, useEffect } from 'react';
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

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const selectedPlan = searchParams.get('plan');
        
        if (selectedPlan) {
            // Give a slight delay to allow rendering, then scroll to the selected plan on mobile
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
        <div className="min-h-screen bg-white text-slate-900 font-sans pb-24 overflow-x-hidden">
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
                    <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-black">
                        Price List Side for Different Subscription Plan
                    </h1>
                </div>

                <div className="border-t border-dashed border-slate-300 w-full mb-8"></div>

                <div className="max-w-md mx-auto mb-12">
                    <input 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter email address for receipt"
                        className="bg-white border-2 border-slate-200 text-slate-900 text-center font-medium text-base rounded-full focus:ring-[#009EE2] focus:border-[#009EE2] block w-full py-4 px-6 shadow-sm outline-none"
                    />
                </div>

                {/* Plans Section */}
                <section>
                    <div className="flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-8 max-w-5xl mx-auto pt-8">
                        
                        {/* Free / Basic Plan Wrapper */}
                        <div id="plan-free" className="w-full max-w-[320px]">
                            <PricingCard 
                                plan="Basic"
                                displayPrice="Free"
                                color="#02BFA6"
                                isCurrentPlan={!userProfile?.subscription_status || userProfile.subscription_status === 'free' || userProfile.subscription_status === 'none'}
                                features={[
                                    "This slide is 100% editable.",
                                    "This slide is 100% editable.",
                                    "This slide is 100% editable."
                                ]}
                                onPurchase={() => handlePurchasePlan('free')}
                                disabled={true}
                                buttonIcon={<ClipboardIcon />}
                            />
                        </div>

                        {/* Student / Standard Plan Wrapper */}
                        <div id="plan-basic" className="w-full max-w-[320px]">
                            <PricingCard 
                                plan="Standard"
                                displayPrice={`$${(tiers?.basic?.price_ngn / 1000)?.toFixed(2) || '13.99'}`}
                                color="#009EE2"
                                isCurrentPlan={userProfile?.subscription_status === 'basic'}
                                features={[
                                    "This slide is 100% editable.",
                                    "This slide is 100% editable.",
                                    "This slide is 100% editable."
                                ]}
                                onPurchase={() => handlePurchasePlan('basic')}
                                disabled={isProcessing || !email}
                                buttonIcon={<HandshakeIcon />}
                            />
                        </div>

                        {/* Premium Plan Wrapper */}
                        <div id="plan-premium" className="w-full max-w-[320px]">
                            <PricingCard 
                                plan="Premium"
                                displayPrice={`$${(tiers?.premium?.price_ngn / 1000)?.toFixed(2) || '23.99'}`}
                                color="#2B4C65"
                                isCurrentPlan={userProfile?.subscription_status === 'premium' || userProfile?.subscription_status === 'pro'}
                                features={[
                                    "This slide is 100% editable.",
                                    "This slide is 100% editable.",
                                    "This slide is 100% editable."
                                ]}
                                onPurchase={() => handlePurchasePlan('premium')}
                                disabled={isProcessing || !email}
                                buttonIcon={<MoneyBagIcon />}
                            />
                        </div>

                    </div>
                </section>

                <div className="border-b border-dashed border-slate-300 w-full mt-20 mb-8"></div>

                <div className="text-center text-sm text-slate-400 font-medium italic mt-4">
                    This slide is 100% editable. Adapt it to your needs and capture your audience's attention.
                </div>

            </main>
        </div>
    );
};

// --- Custom Components ---

interface PricingCardProps {
    plan: string;
    displayPrice: string;
    color: string;
    isCurrentPlan?: boolean;
    features: string[];
    onPurchase: () => void;
    disabled: boolean;
    buttonIcon: React.ReactNode;
}

const PricingCard: React.FC<PricingCardProps> = ({ 
    plan, 
    displayPrice, 
    color, 
    isCurrentPlan,
    features, 
    onPurchase, 
    disabled, 
    buttonIcon 
}) => {
    return (
        <div className="relative w-full mx-auto min-h-[460px] pb-12">
            {/* The colored background shape (folder-like) */}
            <div 
                className="absolute top-0 bottom-8 left-0 right-[-10px] sm:right-[-15px]" 
                style={{ 
                    backgroundColor: color,
                    borderTopLeftRadius: '2.5rem',
                    borderTopRightRadius: '2.5rem',
                    borderBottomLeftRadius: '1.5rem',
                    borderBottomRightRadius: '10rem'
                }} 
            />
            
            {/* The white inner card */}
            <div className="absolute top-2 left-4 right-0 bottom-24 bg-white rounded-t-[2.2rem] rounded-b-[2.2rem] flex flex-col p-6 shadow-[0px_10px_30px_rgba(0,0,0,0.08)]">
                <div className="text-center mt-6 mb-8">
                    <span className="text-[2.5rem] leading-none font-bold" style={{ color }}>{displayPrice}</span>
                </div>
                
                <div className="border-t border-dashed border-slate-300 w-[80%] mx-auto mb-4"></div>
                
                <ul className="space-y-4 flex-1 px-4 text-[13px] text-slate-500 font-medium text-center">
                    {features.map((feature, i) => (
                        <li key={i} className="flex flex-col items-center">
                            <span className="flex items-center justify-center gap-1">
                                <svg className="w-3 h-3 shrink-0" style={{ color: '#4b5563' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                {feature}
                            </span>
                            {i < features.length - 1 && (
                                <div className="border-b border-dashed border-slate-300 w-full mt-4"></div>
                            )}
                        </li>
                    ))}
                </ul>

                <div className="border-b border-dashed border-slate-300 w-[80%] mx-auto mt-4 mb-8"></div>

                {/* Floating circular button OR Current Plan label */}
                {isCurrentPlan ? (
                    <div 
                        className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center justify-center text-white font-bold shadow-xl border-4 border-white"
                        style={{ backgroundColor: color }}
                    >
                        Current Plan
                    </div>
                ) : (
                    <button 
                        onClick={onPurchase}
                        disabled={disabled}
                        className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                        style={{ backgroundColor: color }}
                    >
                        {buttonIcon}
                    </button>
                )}
            </div>

            {/* Bottom-left Plan Label */}
            <div className="absolute bottom-16 left-0 bg-white px-6 py-2.5 font-bold text-[15px] rounded-r-sm shadow-md z-10" style={{ color }}>
                {plan}
            </div>
        </div>
    );
}

// --- Icons ---

const ClipboardIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
        <path d="M9 14h6"></path>
        <path d="M9 18h6"></path>
        <path d="M9 10h.01"></path>
    </svg>
);

const HandshakeIcon = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 12l-3-3"></path>
        <path d="M14 14l-4-4"></path>
        <path d="M16 16l-5-5"></path>
        <path d="M15 15l-3-3"></path>
        <path d="M14 14l-2-2"></path>
        <path d="M13 13l-1-1"></path>
        <path d="M22 12A10 10 0 0 1 12 22 10 10 0 0 1 2 12 10 10 0 0 1 12 2 10 10 0 0 1 22 12z"></path>
        <path d="M11 11l-2-2"></path>
        <path d="M9 9l-1-1"></path>
        <path d="M10 10l-1-1"></path>
    </svg>
);

const MoneyBagIcon = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 21h8a4 4 0 0 0 4-4V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a4 4 0 0 0 4 4z"></path>
        <path d="M12 11v6"></path>
        <path d="M12 11a3 3 0 0 0 0-6 3 3 0 0 0 0 6z"></path>
        <path d="M10 14h4"></path>
    </svg>
);
