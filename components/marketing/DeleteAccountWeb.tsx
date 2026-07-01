import React, { useState } from 'react';
import { db } from '../../firebase';
import { ref as dbRef, push, set, serverTimestamp } from 'firebase/database';
import { SEOHead } from '../SEOHead';
import { useToast } from '../../hooks/useToast';

export const DeleteAccountWeb: React.FC = () => {
    const [email, setEmail] = useState('');
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const { addToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !email.includes('@')) {
            addToast('Please enter a valid email address.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const requestsRef = dbRef(db, 'deletion_requests');
            const newReqRef = push(requestsRef);
            await set(newReqRef, {
                email: email.trim(),
                reason: reason.trim(),
                status: 'pending',
                timestamp: serverTimestamp()
            });
            setIsSubmitted(true);
            addToast('Account deletion request submitted.', 'success');
        } catch (error) {
            console.error('Failed to submit request:', error);
            addToast('Failed to submit request. Please try again later.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-black font-sans text-slate-900 dark:text-white flex flex-col">
            <SEOHead 
                title="Delete Account | AVELUT" 
                description="Request to delete your AVELUT account and associated data."
            />
            
            <header className="bg-white dark:bg-black border-b border-slate-200 dark:border-white/10 p-4 sm:p-6 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <a href="/" className="flex items-center gap-2 sm:gap-3 transition-transform hover:scale-[1.02] active:scale-95">
                        <img src="/logo_icon.png" alt="AVELUT Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow-sm" />
                        <span className="font-black text-xl sm:text-2xl tracking-tighter text-slate-900 dark:text-white">AVELUT</span>
                    </a>
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm">
                    <h1 className="text-2xl sm:text-3xl font-black mb-2 tracking-tight text-center">Delete Account</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 text-center font-medium">
                        Submit a request to permanently delete your account and all associated data.
                    </p>

                    {isSubmitted ? (
                        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-2xl p-6 text-center animate-fade-in">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-green-900 dark:text-green-400 mb-2">Request Received</h3>
                            <p className="text-sm text-green-800 dark:text-green-500/80 font-medium">
                                We will process your account deletion request within 7-14 business days. You will receive an email confirmation once completed.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="email" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                                    Account Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    className="w-full px-4 py-3.5 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all placeholder:text-slate-400"
                                />
                            </div>

                            <div>
                                <label htmlFor="reason" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                                    Reason for deletion (Optional)
                                </label>
                                <textarea
                                    id="reason"
                                    rows={3}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Why are you leaving us?"
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all placeholder:text-slate-400 resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-4 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white rounded-xl font-bold tracking-wide transition-all shadow-sm shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                            >
                                {isSubmitting ? 'Submitting...' : 'Request Deletion'}
                            </button>
                            
                            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-4">
                                Note: This action is irreversible. All your study progress, credits, and chat history will be permanently erased.
                            </p>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
};
