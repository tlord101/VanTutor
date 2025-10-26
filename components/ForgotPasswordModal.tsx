import React, { useState } from 'react';
import { auth } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setMessage(null);
    setError(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('A password reset link has been sent to your email address.');
      setEmail('');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setError('Could not find an account with that email address.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      console.error('Password reset failed:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl w-full max-w-md relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors text-2xl"
          aria-label="Close"
        >
          &times;
        </button>
        <h2 className="text-2xl font-bold text-white text-center mb-2">Reset Password</h2>
        <p className="text-gray-400 text-center mb-6">
          Enter your email and we'll send you a link to reset your password.
        </p>
        
        {message ? (
          <div className="text-center">
            <p className="text-green-400 bg-green-500/10 p-3 rounded-lg mb-4">{message}</p>
            <button
              onClick={onClose}
              className="w-full bg-white/10 text-white font-bold py-3 px-4 rounded-lg hover:bg-white/20 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendResetLink}>
            <div className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white focus:ring-2 focus:ring-lime-500 focus:outline-none"
                />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
            <div className="mt-6">
              <button
                type="submit"
                disabled={isSending}
                className="w-full bg-gradient-to-r from-lime-500 to-teal-500 text-white font-bold py-3 px-4 rounded-lg hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isSending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                    <span>Sending...</span>
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};