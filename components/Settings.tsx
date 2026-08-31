import React, { useState, useEffect } from 'react';
import type { UserProfile } from '../types';
import { supabaseAuthService } from '../services/supabaseAuthService';
import { useToast } from '../hooks/useToast';
import { ConfirmationModal } from './ConfirmationModal';
import { isNative } from '../utils/capacitorUtils';
import { useTheme } from '../contexts/ThemeContext';

interface SettingsProps {
  user: any | null;
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
    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed ${
      checked ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
    }`}
  >
    <span
      className={`inline-block w-4 h-4 transform bg-white dark:bg-slate-900 rounded-full transition-transform duration-200 ease-in-out shadow-sm ${
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
      const res = await supabaseAuthService.sendPasswordReset(user.email);
      if (!res.success) {
        throw new Error(res.error || 'Failed to send password reset email');
      }
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
        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
          <i className="bi bi-gear-fill text-amber-500"></i>
          <span>Account Settings</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">Manage your security, notifications, and preferences.</p>
      </div>

      {/* Security */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
          <i className="bi bi-shield-lock text-amber-500"></i>
          <span>Security</span>
        </h3>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-slate-900 dark:text-slate-100 font-bold block mb-1">Change Password</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">We will send a secure link to your email to reset your password.</p>
            </div>
            <button
                onClick={handlePasswordReset}
                disabled={isResetEmailSending}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold rounded-xl transition-all shadow-sm shrink-0 disabled:opacity-50 cursor-pointer"
            >
                {isResetEmailSending ? 'Sending...' : 'Send Reset Link'}
            </button>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
          <i className="bi bi-moon-stars text-amber-500"></i>
          <span>Appearance</span>
        </h3>
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4">
              <div>
                  <span className="text-slate-900 dark:text-slate-100 font-bold block mb-1">Dark Mode</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
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

      {/* Notifications */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
          <i className="bi bi-bell text-amber-500"></i>
          <span>Notifications</span>
        </h3>
        <div className="flex justify-between items-center gap-4">
            <div>
                <span className="text-slate-900 dark:text-slate-100 font-bold block mb-1">Push Notifications</span>
                 <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
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

      {/* Legal & Support */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
          <i className="bi bi-file-earmark-text text-amber-500"></i>
          <span>Legal & Support</span>
        </h3>
         <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
           <a
              href="/t&c"
              className="flex justify-between items-center w-full text-left p-4 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Terms & Conditions</span>
              <i className="bi bi-chevron-right text-slate-400 text-sm"></i>
            </a>
            <a
              href="https://www.avelut.xyz/policy"
              className="flex justify-between items-center w-full text-left p-4 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Privacy Policy</span>
              <i className="bi bi-chevron-right text-slate-400 text-sm"></i>
            </a>
         </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-rose-50 dark:bg-rose-950/20 p-6 sm:p-8 rounded-2xl border border-rose-200 dark:border-rose-900/40 shadow-sm">
        <h3 className="text-lg font-bold text-rose-900 dark:text-rose-300 mb-2 flex items-center gap-2">
          <i className="bi bi-exclamation-triangle-fill text-rose-500"></i>
          <span>Danger Zone</span>
        </h3>
        <p className="text-sm text-rose-700/80 dark:text-rose-400/80 font-medium mb-6">Once you delete your account, there is no going back. Please be certain.</p>
        <button
          onClick={() => setIsDeleteModalOpen(true)}
          className="px-6 py-2.5 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/60 hover:border-rose-400 text-rose-600 dark:text-rose-400 text-sm font-bold rounded-xl transition-all shadow-sm cursor-pointer"
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
