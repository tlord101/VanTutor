import React, { useEffect, useState } from 'react';
import { isNative } from '../../utils/capacitorUtils';

export const PaymentSuccessWeb: React.FC = () => {
    const [secondsLeft, setSecondsLeft] = useState(5);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        // Countdown timer
        const timer = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    attemptDeepLink();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const attemptDeepLink = () => {
        try {
            // Attempt to open the app via custom URL scheme or Android App Links
            window.location.href = 'avelut://payment-success';
            
            // Fallback: If it doesn't open within 2 seconds, show a fallback message
            setTimeout(() => {
                setHasError(true);
            }, 2000);
        } catch (err) {
            setHasError(true);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#1A1A1A] flex flex-col items-center justify-center p-4">
            <div className="bg-white dark:bg-[#202124] p-8 md:p-12 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-200 dark:border-slate-800">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                
                <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Payment Successful!</h1>
                <p className="text-slate-600 dark:text-slate-400 mb-8">
                    Your account has been updated successfully.
                </p>

                {secondsLeft > 0 ? (
                    <div className="animate-pulse text-sm font-semibold text-slate-500">
                        Redirecting back to app in {secondsLeft} seconds...
                    </div>
                ) : (
                    <div className="space-y-4">
                        <button 
                            onClick={attemptDeepLink}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all"
                        >
                            Open AVELUT App
                        </button>
                        
                        {hasError && (
                            <p className="text-xs text-slate-500 mt-4">
                                If the app doesn't open automatically, you can safely close this window and return to the app. Your purchase is complete.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
