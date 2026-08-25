import React, { useState } from 'react';
import { Globe, Building2, X, CheckCircle2, ArrowRight, Layers, Loader2 } from 'lucide-react';

export interface ScopeSelectionModalProps {
    isOpen: boolean;
    title?: string;
    description?: string;
    courseCode?: string;
    departmentName?: string;
    linkedDeptsCount?: number;
    isProcessing?: boolean;
    onSelectScope: (isGlobalSync: boolean) => Promise<void> | void;
    onClose: () => void;
}

export const ScopeSelectionModal: React.FC<ScopeSelectionModalProps> = ({
    isOpen,
    title = 'Select Action Scope',
    description = 'Choose whether to apply changes globally across all offering departments or isolate them locally.',
    courseCode,
    departmentName,
    linkedDeptsCount = 1,
    isProcessing = false,
    onSelectScope,
    onClose,
}) => {
    const [selectedScope, setSelectedScope] = useState<'global' | 'local'>('global');

    if (!isOpen) return null;

    const handleConfirm = async () => {
        await onSelectScope(selectedScope === 'global');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-500 border border-amber-200 dark:border-amber-800/40 flex items-center justify-center shrink-0">
                            <Layers className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-500/20">
                                    {courseCode || 'Course Scope'}
                                </span>
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight mt-1">
                                {title}
                            </h3>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isProcessing}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {description}
                </p>

                {/* Scope Selection Options */}
                <div className="space-y-3">
                    {/* Option 1: Global Sync */}
                    <div
                        onClick={() => !isProcessing && setSelectedScope('global')}
                        className={`group relative p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                            selectedScope === 'global'
                                ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-md'
                                : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                    >
                        <div className={`p-2.5 rounded-xl transition-colors ${
                            selectedScope === 'global'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-amber-500'
                        }`}>
                            <Globe className="w-5 h-5" />
                        </div>

                        <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                                    Global Sync
                                </h4>
                                {selectedScope === 'global' && (
                                    <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0" />
                                )}
                            </div>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Apply to ALL departments offering this course ({linkedDeptsCount} department{linkedDeptsCount !== 1 ? 's' : ''}).
                            </p>
                        </div>
                    </div>

                    {/* Option 2: Local Override */}
                    <div
                        onClick={() => !isProcessing && setSelectedScope('local')}
                        className={`group relative p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-4 ${
                            selectedScope === 'local'
                                ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-md'
                                : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                    >
                        <div className={`p-2.5 rounded-xl transition-colors ${
                            selectedScope === 'local'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-amber-500'
                        }`}>
                            <Building2 className="w-5 h-5" />
                        </div>

                        <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                                    Local Override
                                </h4>
                                {selectedScope === 'local' && (
                                    <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0" />
                                )}
                            </div>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Apply ONLY to the current department{departmentName ? ` (${departmentName})` : ''}.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isProcessing}
                        className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Applying...</span>
                            </>
                        ) : (
                            <>
                                <span>Confirm Scope</span>
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
