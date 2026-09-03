import React, { useState, useEffect } from 'react';
import type { UserProfile } from '../types';
import { supabaseAuthService } from '../services/supabaseAuthService';
import { useToast } from '../hooks/useToast';
import { ConfirmationModal } from './ConfirmationModal';
import { isNative } from '../utils/capacitorUtils';
import { useTheme } from '../contexts/ThemeContext';
import { VerificationBadge } from './VerificationBadge';
import { Avatar } from './Avatar';

interface SettingsProps {
  user: any | null;
  userProfile: UserProfile;
  onLogout: () => void;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  onDeleteAccount: () => Promise<{ success: boolean; error?: string }>;
  onNavigate: (route: string) => void;
}

const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({
  checked,
  onChange,
  disabled,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    disabled={disabled}
    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none disabled:opacity-50 ${
      checked ? 'bg-black' : 'bg-neutral-300'
    }`}
  >
    <span
      className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform shadow-sm ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const LinkRow: React.FC<{ label: string; hint?: string; onClick: () => void; danger?: boolean }> = ({
  label,
  hint,
  onClick,
  danger,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left rounded-xl transition-colors hover:bg-neutral-50 ${
      danger ? 'text-red-600' : 'text-black'
    }`}
  >
    <div className="min-w-0">
      <span className="font-semibold text-sm block">{label}</span>
      {hint && <span className="text-xs text-neutral-500 font-medium">{hint}</span>}
    </div>
    <svg className="w-4 h-4 text-neutral-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

export const SettingsScreen: React.FC<SettingsProps> = ({
  user,
  userProfile,
  onLogout,
  onProfileUpdate,
  onDeleteAccount,
  onNavigate,
}) => {
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
      if (!res.success) throw new Error(res.error || 'Failed to send password reset email');
      addToast('Password reset email sent! Check your inbox.', 'success');
    } catch (error: any) {
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
    <div className="p-4 sm:p-6 space-y-5 animate-in fade-in duration-300 max-w-2xl mx-auto bg-white min-h-full">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-black tracking-tight">Settings</h2>
        <p className="text-sm text-neutral-500 font-medium mt-1">Account, billing, and preferences</p>
      </div>

      {/* Balance card */}
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <div className="flex items-start gap-3 mb-4">
          <Avatar display_name={userProfile.display_name} photo_url={userProfile.photo_url} className="w-12 h-12" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-black flex items-center gap-1.5 truncate">
              {userProfile.display_name}
              <VerificationBadge status={userProfile.subscription_status} />
            </p>
            <p className="text-xs text-neutral-500 font-medium truncate">{user?.email || userProfile.email}</p>
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
              Credits balance
            </span>
            <span className="text-3xl font-black text-black tracking-tight">
              {userProfile.ai_credits_balance ?? 0}
            </span>
          </div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-neutral-200 text-neutral-700 capitalize">
            {userProfile.subscription_status || 'Free'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('billing')}
          className="mt-4 w-full py-2.5 rounded-xl bg-[#0066FF] text-white text-sm font-semibold hover:bg-[#0052cc] transition-colors"
        >
          Manage billing
        </button>
      </div>

      {/* Navigation links */}
      <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100 overflow-hidden">
        <LinkRow label="Profile" hint="Name, photo, academic info" onClick={() => onNavigate('user_profile')} />
        <LinkRow label="Billing & plans" hint="Credits, subscriptions, payments" onClick={() => onNavigate('billing')} />
        <LinkRow label="Help" hint="Guides and support" onClick={() => onNavigate('help')} />
        <LinkRow label="Feedback" hint="Tell us what to improve" onClick={() => onNavigate('feedback')} />
        <LinkRow label="History" hint="Past activity" onClick={() => onNavigate('history')} />
      </div>

      {/* Preferences */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-4">
        <h3 className="text-sm font-bold text-black px-1">Preferences</h3>
        <div className="flex justify-between items-center gap-4 px-1">
          <div>
            <span className="text-sm font-semibold text-black block">Dark mode</span>
            <p className="text-xs text-neutral-500">Toggle light / dark appearance</p>
          </div>
          <Switch checked={mode === 'dark'} onChange={(c) => setMode(c ? 'dark' : 'light')} />
        </div>
        <div className="flex justify-between items-center gap-4 px-1">
          <div>
            <span className="text-sm font-semibold text-black block">Push notifications</span>
            <p className="text-xs text-neutral-500">Reminders and message alerts</p>
          </div>
          <Switch
            checked={isNotificationSwitchOn}
            onChange={handleNotificationToggle}
            disabled={isNotificationSaving}
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pt-1">
          <div>
            <span className="text-sm font-semibold text-black block">Password</span>
            <p className="text-xs text-neutral-500">Send a reset link to your email</p>
          </div>
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={isResetEmailSending}
            className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-black text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isResetEmailSending ? 'Sending…' : 'Send reset link'}
          </button>
        </div>
      </div>

      {/* Legal */}
      <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100 overflow-hidden">
        <a href="/t&c" className="flex justify-between items-center px-4 py-3.5 text-sm font-semibold text-black hover:bg-neutral-50">
          Terms &amp; Conditions
          <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </a>
        <a
          href="https://www.avelut.xyz/policy"
          className="flex justify-between items-center px-4 py-3.5 text-sm font-semibold text-black hover:bg-neutral-50"
        >
          Privacy Policy
          <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-black text-sm font-semibold transition-colors"
        >
          Log out
        </button>
        <button
          type="button"
          onClick={() => setIsDeleteModalOpen(true)}
          className="w-full py-3 rounded-xl bg-white border border-red-200 hover:bg-red-50 text-red-600 text-sm font-semibold transition-colors"
        >
          Delete account
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
