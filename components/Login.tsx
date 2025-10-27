import React, { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { LogoIcon } from './icons/LogoIcon';
import { GoogleIcon } from './icons/GoogleIcon';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginProps {
    onSwitchToSignUp: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToSignUp }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsGoogleSubmitting(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // On successful sign-in, onAuthStateChanged will trigger in App.tsx
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Failed to sign in with Google. Please try again.');
        console.error('Google sign in failed:', err);
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // On successful login, onAuthStateChanged in App.tsx will handle the state change.
    } catch (err: any) {
      let errorMessage = 'An unexpected error occurred. Please try again.';
      if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Incorrect email or password. Please try again.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      }
      console.error('Login failed:', err);
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-black p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="flex justify-center items-center mb-6">
                <LogoIcon className="w-12 h-12 text-lime-400" />
                <h1 className="text-3xl font-bold bg-gradient-to-b from-lime-300 to-lime-500 text-transparent bg-clip-text tracking-wider ml-3">
                    VANTUTOR
                </h1>
            </div>
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wider">Welcome Back</h2>
              <p className="text-gray-400 mt-2">Log in to continue your learning.</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white focus:ring-2 focus:ring-lime-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                      Password
                    </label>
                    <button
                        type="button"
                        onClick={() => setIsForgotPasswordOpen(true)}
                        className="text-sm font-medium text-lime-400 hover:text-lime-300 hover:underline focus:outline-none"
                    >
                        Forgot Password?
                    </button>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white focus:ring-2 focus:ring-lime-500 focus:outline-none"
                  />
                </div>
              </div>
              
              <div className="mt-8">
                <button
                  type="submit"
                  disabled={isSubmitting || isGoogleSubmitting}
                  className="w-full bg-gradient-to-r from-lime-500 to-teal-500 text-white font-bold py-3 px-4 rounded-lg hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                      <span>Logging In...</span>
                    </>
                  ) : (
                    'Log In'
                  )}
                </button>
              </div>
            </form>

            <div className="relative flex py-5 items-center">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink mx-4 text-gray-400 text-xs uppercase">Or continue with</span>
                <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button
                onClick={handleGoogleSignIn}
                disabled={isSubmitting || isGoogleSubmitting}
                className="w-full bg-white/10 border border-white/20 text-white font-semibold py-3 px-4 rounded-lg hover:bg-white/20 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
                {isGoogleSubmitting ? (
                    <>
                        <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                        <span>Signing In...</span>
                    </>
                ) : (
                    <>
                        <GoogleIcon className="w-5 h-5 mr-3" />
                        Sign In with Google
                    </>
                )}
            </button>

            {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}

            <p className="text-center text-sm text-gray-400 mt-6">
              Don't have an account?{' '}
              <button onClick={onSwitchToSignUp} className="font-medium text-lime-400 hover:text-lime-300">
                Sign Up
              </button>
            </p>

          </div>
        </div>
      </div>
      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
      />
    </>
  );
};