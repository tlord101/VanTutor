import React, { useState, useEffect } from 'react';
import type { UserProfile } from '../types';
import { auth, type FirebaseUser } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '../hooks/useToast';
import { ConfirmationModal } from './ConfirmationModal';
import { isNative } from '../utils/capacitorUtils';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, MessageSquare } from 'lucide-react';

interface SettingsProps {
  user: FirebaseUser | null;
  userProfile: UserProfile;
  onLogout: () => void;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  onDeleteAccount: () => Promise<{ success: boolean; error?: string }>;
  onNavigate: (route: string) => void;
}

const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    disabled={disabled}
    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
      checked ? 'bg-blue-600' : 'bg-slate-200'
    }`}
  >
    <span
      className={`inline-block w-4 h-4 transform bg-white dark:bg-[#121A2F] rounded-full transition-transform duration-200 ease-in-out shadow-sm ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export const SettingsScreen: React.FC<SettingsProps> = ({ user, userProfile, onLogout, onProfileUpdate, onDeleteAccount, onNavigate }) => {
  const { mode, setMode } = useTheme();
  const [isNotificationSwitchOn, setIsNotificationSwitchOn] = useState(userProfile.notifications_enabled);
  const [isNotificationSaving, setIsNotificationSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResetEmailSending, setIsResetEmailSending] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    setIsNotificationSwitchOn(userProfile.notifications_enabled);
  }, [userProfile.notifications_enabled]);

  const handleNotificationToggle = async (enabled: boolean) => {
    setIsNotificationSaving(true);
    
    if (isNative()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        if (enabled) {
          const permResult = await PushNotifications.requestPermissions();
          if (permResult.receive === 'granted') {
            await PushNotifications.register();
            await onProfileUpdate({ notifications_enabled: true });
            setIsNotificationSwitchOn(true);
            addToast('Push notifications enabled!', 'success');
          } else {
            addToast('Permission denied for push notifications.', 'error');
          }
        } else {
          await onProfileUpdate({ notifications_enabled: false });
          setIsNotificationSwitchOn(false);
          addToast('Push notifications disabled from AVELUT.', 'info');
        }
      } catch (err) {
        console.error(err);
        addToast('Failed to update notification settings.', 'error');
      } finally {
        setIsNotificationSaving(false);
      }
      return;
    }

    addToast('Push notifications are only supported in the native mobile app.', 'info');
    setIsNotificationSaving(false);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      addToast('No email address found for this account.', 'error');
      return;
    }
    setIsResetEmailSending(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      addToast('Password reset email sent! Check your inbox.', 'success');
    } catch (error: any) {
      console.error(error);
      addToast(error.message || 'Failed to send password reset email.', 'error');
    } finally {
      setIsResetEmailSending(false);
    }
  };

  const confirmDeletion = async () => {
    setIsDeleting(true);
    const result = await onDeleteAccount();
    if (!result.success) {
        addToast(result.error || 'Failed to delete account.', 'error');
        setIsDeleting(false);
        setIsDeleteModalOpen(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Account Settings</h2>
        <p className="text-sm text-slate-500 dark:text-[#A0ABC0] font-medium mt-1">Manage your security, notifications, and preferences.</p>
      </div>

      <div className="bg-white dark:bg-[#121A2F] p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Security</h3>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-slate-800 font-bold block mb-1">Change Password</span>
              <p className="text-xs text-slate-500 dark:text-[#A0ABC0] font-medium">We will send a secure link to your email to reset your password.</p>
            </div>
            <button
                onClick={handlePasswordReset}
                disabled={isResetEmailSending}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold rounded-xl transition-all shadow-sm shrink-0 disabled:opacity-50"
            >
                {isResetEmailSending ? 'Sending...' : 'Send Reset Link'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#121A2F] dark:bg-card p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-white/10 dark:border-border shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Appearance</h3>
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4">
              <div>
                  <span className="text-slate-800 dark:text-slate-200 font-bold block mb-1">Dark Mode</span>
                  <p className="text-xs text-slate-500 dark:text-[#A0ABC0] dark:text-slate-400 font-medium">
                      Toggle between light and dark mode.
                  </p>
              </div>
              <Switch 
                  checked={mode === 'dark'} 
                  onChange={(checked) => setMode(checked ? 'dark' : 'light')}
              />
          </div>

        </div>
      </div>

      <div className="bg-white dark:bg-[#121A2F] dark:bg-card p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-white/10 dark:border-border shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Notifications</h3>
        <div className="flex justify-between items-center gap-4">
            <div>
                <span className="text-slate-800 font-bold block mb-1">Push Notifications</span>
                 <p className="text-xs text-slate-500 dark:text-[#A0ABC0] font-medium">
                    Get reminders, progress updates, and message alerts.
                </p>
            </div>
            <Switch 
                checked={isNotificationSwitchOn} 
                onChange={handleNotificationToggle}
                disabled={isNotificationSaving}
            />
        </div>
      </div>

      <div className="bg-white dark:bg-[#121A2F] p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Legal & Support</h3>
         <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
           <a
              href="/t&c"
              className="flex justify-between items-center w-full text-left p-4 bg-slate-50 dark:bg-[#0A101F] text-slate-800 font-bold hover:bg-slate-100 transition-colors"
            >
              <span>Terms & Conditions</span>
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </a>
            <a
              href="/policy"
              className="flex justify-between items-center w-full text-left p-4 bg-slate-50 dark:bg-[#0A101F] text-slate-800 font-bold hover:bg-slate-100 transition-colors"
            >
              <span>Privacy Policy</span>
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </a>
         </div>
      </div>

      <div className="bg-red-50 p-6 sm:p-8 rounded-2xl border border-red-100 shadow-sm">
        <h3 className="text-lg font-bold text-red-900 mb-2">Danger Zone</h3>
        <p className="text-sm text-red-700/80 font-medium mb-6">Once you delete your account, there is no going back. Please be certain.</p>
        <button
          onClick={() => setIsDeleteModalOpen(true)}
          className="px-6 py-2.5 bg-white dark:bg-[#121A2F] border border-red-200 hover:border-red-300 text-red-600 text-sm font-bold rounded-xl transition-all shadow-sm"
        >
          Delete Account
        </button>
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Delete Account"
        message="Are you sure? This will permanently delete your account, all chat history, credits, and subscriptions."
        onConfirm={confirmDeletion}
        onCancel={() => setIsDeleteModalOpen(false)}
        confirmText="Yes, delete my account"
        isConfirming={isDeleting}
      />
    </div>
  );
};
