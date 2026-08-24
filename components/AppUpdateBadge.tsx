import React from 'react';
import { useOTAUpdater } from '../hooks/useOTAUpdater';

export const AppUpdateBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { updateStatus, restartToUpdate } = useOTAUpdater();

    if (updateStatus === 'idle') {
        return null;
    }

    if (updateStatus === 'downloading' || updateStatus === 'checking') {
        return (
            <div
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1C2128] text-slate-200 border border-[#30363D] text-xs font-semibold shadow-sm animate-fade-in ${className}`}
                title="Downloading update bundle in background..."
            >
                <div className="relative flex items-center justify-center w-4 h-4">
                    <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-blue-400 rounded-full animate-spin" />
                </div>
                <span>Installing Update</span>
            </div>
        );
    }

    if (updateStatus === 'ready') {
        return (
            <button
                onClick={restartToUpdate}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0070F3] hover:bg-[#0060DF] active:scale-95 text-white text-xs font-bold shadow-md shadow-blue-500/30 cursor-pointer animate-pulse transition-all ${className}`}
                title="Update ready! Tap to close the app completely."
            >
                <i className="bi bi-power text-sm leading-none" aria-hidden="true" />
                <span>Close App</span>
            </button>
        );
    }

    return null;
};
export default AppUpdateBadge;
