import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, CheckCircle, Mail, ArrowRight, Play } from 'lucide-react';
import { db } from '../../firebase';
import { ref, push, serverTimestamp } from 'firebase/database';
import { useAppSettings } from '../../hooks/useAppSettings';

interface PlaystoreModalProps {
  onClose: () => void;
}

export const PlaystoreEarlyAccessModal: React.FC<PlaystoreModalProps> = ({ onClose }) => {
  const { settings } = useAppSettings();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const collectEmails = settings.playstore_modal_collect_emails ?? true;
  const playstoreLink = 'https://play.google.com/store/apps/details?id=com.avelut.app';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectEmails) {
        window.open(playstoreLink, '_blank');
        onClose();
        return;
    }

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid Google Play email.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const emailsRef = ref(db, 'playstore_early_access_emails');
      await push(emailsRef, {
        email: email.trim(),
        timestamp: serverTimestamp(),
      });
      setIsSubmitted(true);
    } catch (err: any) {
      setError('Failed to submit email. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlaystoreRedirect = () => {
      window.open(playstoreLink, '_blank');
      onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md bg-white/90 backdrop-blur-xl border border-white/40 shadow-2xl rounded-3xl overflow-hidden p-8 flex flex-col items-center text-center"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100/50 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 bg-gradient-to-br from-brand-400 to-sky-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-brand-500/20">
          <Smartphone className="w-8 h-8 text-white" />
        </div>

        <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
          Avelut on Android
        </h2>
        
        {collectEmails ? (
            <>
                <p className="text-slate-600 text-sm mb-8 leading-relaxed">
                We're currently in Early Access! Enter the email associated with your Google Play account to get an exclusive invite to install the app.
                </p>

                {isSubmitted ? (
                <div className="w-full flex flex-col items-center">
                    <motion.div 
                        initial={{ scale: 0 }} animate={{ scale: 1 }} 
                        className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4"
                    >
                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                    </motion.div>
                    <p className="text-emerald-700 font-bold mb-6">You're on the list!</p>
                    <button
                        onClick={handlePlaystoreRedirect}
                        className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold transition flex items-center justify-center gap-2 group"
                    >
                        Open Google Play
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
                ) : (
                <form onSubmit={handleSubmit} className="w-full space-y-4">
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Your Google Play email"
                            className="w-full pl-12 pr-4 py-4 bg-white/50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all font-medium text-slate-800"
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm text-left px-2">{error}</p>}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-4 px-6 bg-gradient-to-r from-brand-600 to-sky-600 hover:from-brand-500 hover:to-sky-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Securing Spot...' : 'Get Early Access'}
                        {!isSubmitting && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                    </button>
                </form>
                )}
            </>
        ) : (
            <>
                <p className="text-slate-600 text-sm mb-8 leading-relaxed">
                Take Avelut on the go! Our official Android app is now available on the Google Play Store. Download it today for the best mobile experience.
                </p>
                <button
                    onClick={handlePlaystoreRedirect}
                    className="w-full py-4 px-6 bg-gradient-to-r from-brand-600 to-sky-600 hover:from-brand-500 hover:to-sky-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 group"
                >
                    <Play className="w-5 h-5 fill-current" />
                    Get it on Google Play
                </button>
            </>
        )}
      </motion.div>
    </div>
  );
};
