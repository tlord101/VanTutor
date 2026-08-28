import React from 'react';
import { Mail, RefreshCw, CheckCircle2, ShieldCheck, Server } from 'lucide-react';

interface SettingsProps {
  onBack: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const SettingsPage: React.FC<SettingsProps> = ({ onBack, onSync, isSyncing }) => {
  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-darkBorder">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-darkTextPrimary">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-darkTextSecondary">
            Manage your email receiving domain and Resend configuration
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-darkBorder hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        >
          Back to Inbox
        </button>
      </div>

      <div className="space-y-4">
        <div className="p-5 rounded-2xl border border-gray-200 dark:border-darkBorder bg-white dark:bg-darkSurface space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-darkTextPrimary">
                Email Account & Domain
              </h2>
              <p className="text-xs text-gray-500 dark:text-darkTextSecondary">
                Resend Inbound Email Infrastructure
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-darkBg border border-gray-100 dark:border-darkBorder">
              <span className="text-xs text-gray-400 dark:text-darkTextSecondary block mb-1">
                Managed Domain
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-darkTextPrimary">
                avelut.xyz
              </span>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-darkBg border border-gray-100 dark:border-darkBorder">
              <span className="text-xs text-gray-400 dark:text-darkTextSecondary block mb-1">
                Provider Status
              </span>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Connected (Resend)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-gray-200 dark:border-darkBorder bg-white dark:bg-darkSurface space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-darkTextPrimary">
                  Webhook Signature Verification
                </h2>
                <p className="text-xs text-gray-500 dark:text-darkTextSecondary">
                  Svix HMAC validation active on /api/webhooks/resend
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              Active
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-gray-200 dark:border-darkBorder bg-white dark:bg-darkSurface space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-darkTextPrimary">
                  Resend API Synchronization
                </h2>
                <p className="text-xs text-gray-500 dark:text-darkTextSecondary">
                  Import existing emails directly from Resend into local PostgreSQL database
                </p>
              </div>
            </div>

            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
