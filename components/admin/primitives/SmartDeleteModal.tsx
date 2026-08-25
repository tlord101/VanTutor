import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Unlink, Globe, Building2, CheckCircle2, X, Loader2, ShieldAlert } from 'lucide-react';

export interface SmartDeleteModalProps {
    isOpen: boolean;
    targetType: 'course' | 'department' | 'college' | 'school';
    targetItem: {
        id: string;
        name: string;
        code?: string;
        linkedDepartments?: string[];
        count?: number;
    };
    currentDeptId?: string;
    isDeleting?: boolean;
    onConfirmDelete: (options: { action: 'unlink' | 'hard_delete'; targetItem: any }) => Promise<void> | void;
    onClose: () => void;
}

export const SmartDeleteModal: React.FC<SmartDeleteModalProps> = ({
    isOpen,
    targetType,
    targetItem,
    currentDeptId,
    isDeleting = false,
    onConfirmDelete,
    onClose,
}) => {
    const [selectedAction, setSelectedAction] = useState<'unlink' | 'hard_delete'>('unlink');
    const [typedCode, setTypedCode] = useState('');
    const [shakeInput, setShakeInput] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const isCourseDelete = targetType === 'course';
    const courseCount = targetItem.count || 1;
    const confirmationCode = (targetItem.code || targetItem.name || targetItem.id).trim();

    useEffect(() => {
        if (isOpen) {
            setSelectedAction('unlink');
            setTypedCode('');
            setShakeInput(false);
            setErrorMsg('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isCodeMatch = typedCode.trim().toUpperCase() === confirmationCode.toUpperCase();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Require typing confirmation if global hard delete is selected or for non-course hierarchy entities
        if ((selectedAction === 'hard_delete' || !isCourseDelete) && !isCodeMatch) {
            setShakeInput(true);
            setErrorMsg(`Please type "${confirmationCode}" exactly as shown to confirm deletion.`);
            setTimeout(() => setShakeInput(false), 500);
            return;
        }

        setErrorMsg('');
        await onConfirmDelete({ action: selectedAction, targetItem });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-500 border border-rose-200 dark:border-rose-800/40 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isDeleting}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Title & Description */}
                <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Smart Deletion Engine ({targetType})
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                        {courseCount > 1
                            ? `Delete ${courseCount} Selected Courses?`
                            : `Delete "${targetItem.name}"?`}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        Select whether to delete from all offering departments or remove only from the current department.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Course Scope Selection Cards */}
                    {isCourseDelete ? (
                        <div className="space-y-3">
                            {/* Action Option A: Local Delete / Unlink */}
                            <div
                                onClick={() => !isDeleting && setSelectedAction('unlink')}
                                className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                                    selectedAction === 'unlink'
                                        ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-md'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                }`}
                            >
                                <div className={`p-2 rounded-xl transition-colors ${
                                    selectedAction === 'unlink' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}>
                                    <Building2 className="w-4 h-4" />
                                </div>
                                <div className="flex-1 space-y-0.5">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                                            Remove from Current Department Only
                                        </h4>
                                        {selectedAction === 'unlink' && <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />}
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Unlinks {courseCount > 1 ? `these ${courseCount} courses` : 'this course'} from {currentDeptId || 'current department'}. Data remains intact for other departments.
                                    </p>
                                </div>
                            </div>

                            {/* Action Option B: Global Hard Delete */}
                            <div
                                onClick={() => !isDeleting && setSelectedAction('hard_delete')}
                                className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                                    selectedAction === 'hard_delete'
                                        ? 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/20 shadow-md'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-rose-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                }`}
                            >
                                <div className={`p-2 rounded-xl transition-colors ${
                                    selectedAction === 'hard_delete' ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}>
                                    <Globe className="w-4 h-4" />
                                </div>
                                <div className="flex-1 space-y-0.5">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-black text-xs sm:text-sm text-rose-600 dark:text-rose-400">
                                            Delete Globally from ALL Departments
                                        </h4>
                                        {selectedAction === 'hard_delete' && <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />}
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Permanently deletes {courseCount > 1 ? `these ${courseCount} courses` : 'this course'} across EVERY department offering it and purges global master entries.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 space-y-2">
                            <p className="text-xs font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-rose-500" />
                                Recursive Deletion:
                            </p>
                            <p className="text-xs text-rose-700 dark:text-rose-400">
                                Deleting this {targetType} will recursively remove nested child entities and clean up any orphaned courses.
                            </p>
                        </div>
                    )}

                    {/* Typed Confirmation for Global Delete or non-course entities */}
                    {(selectedAction === 'hard_delete' || !isCourseDelete) && (
                        <div className="space-y-2 pt-1 animate-in fade-in">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                Type <span className="text-rose-600 dark:text-rose-400 font-mono font-black select-all">"{confirmationCode}"</span> to confirm:
                            </label>
                            <input
                                type="text"
                                value={typedCode}
                                onChange={(e) => {
                                    setTypedCode(e.target.value);
                                    setErrorMsg('');
                                }}
                                placeholder={confirmationCode}
                                className={`w-full px-4 py-3 rounded-2xl border text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none transition-all uppercase font-semibold ${
                                    shakeInput
                                        ? 'animate-bounce border-rose-500 ring-4 ring-rose-100 dark:ring-rose-950'
                                        : 'border-slate-200 dark:border-slate-700 focus:border-rose-500 focus:ring-4 focus:ring-rose-100 dark:focus:ring-rose-950/40'
                                }`}
                            />
                            {errorMsg && <p className="text-xs font-bold text-rose-500 animate-in fade-in">{errorMsg}</p>}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2 justify-end border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isDeleting}
                            className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isDeleting || ((selectedAction === 'hard_delete' || !isCourseDelete) && !isCodeMatch)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
                                selectedAction === 'hard_delete' || !isCourseDelete
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20'
                            }`}
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Processing Deletion...</span>
                                </>
                            ) : selectedAction === 'hard_delete' || !isCourseDelete ? (
                                <>
                                    <Trash2 className="w-4 h-4" />
                                    <span>Delete {isCourseDelete ? 'Globally' : targetType}</span>
                                </>
                            ) : (
                                <>
                                    <Unlink className="w-4 h-4" />
                                    <span>Remove from Department</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
