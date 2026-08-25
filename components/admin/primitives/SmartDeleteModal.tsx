import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Unlink, X, Loader2, ShieldAlert } from 'lucide-react';

export interface SmartDeleteModalProps {
    isOpen: boolean;
    targetType: 'course' | 'department' | 'college' | 'school';
    targetItem: {
        id: string;
        name: string;
        code?: string;
        linkedDepartments?: string[];
        childDepts?: any[];
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
    const [typedCode, setTypedCode] = useState('');
    const [shakeInput, setShakeInput] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const linkedCount = targetItem.linkedDepartments?.length || 1;
    const isMultiDepartmentCourse = targetType === 'course' && linkedCount > 1;

    const confirmationCode = (targetItem.code || targetItem.name || targetItem.id).trim();

    useEffect(() => {
        if (isOpen) {
            setTypedCode('');
            setShakeInput(false);
            setErrorMsg('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isCodeMatch = typedCode.trim().toUpperCase() === confirmationCode.toUpperCase();

    const handleUnlink = async () => {
        await onConfirmDelete({ action: 'unlink', targetItem });
    };

    const handleHardDelete = async (e: React.FormEvent) => {
        e.preventDefault();

        // If it requires typed confirmation code
        if (!isCodeMatch) {
            setShakeInput(true);
            setErrorMsg(`Please type "${confirmationCode}" exactly as shown to confirm.`);
            setTimeout(() => setShakeInput(false), 500);
            return;
        }

        setErrorMsg('');
        await onConfirmDelete({ action: 'hard_delete', targetItem });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                        isMultiDepartmentCourse
                            ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-500 border-amber-200 dark:border-amber-800/40'
                            : 'bg-rose-50 dark:bg-rose-950/50 text-rose-500 border-rose-200 dark:border-rose-800/40'
                    }`}>
                        {isMultiDepartmentCourse ? <Unlink className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
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
                        Delete "{targetItem.name}"?
                    </h3>

                    {isMultiDepartmentCourse ? (
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            This course is cross-listed across <strong className="text-amber-500">{linkedCount} departments</strong>. Unlinking will remove it from the current department roster without destroying global data for other departments.
                        </p>
                    ) : (
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            This action is <strong className="text-rose-500">permanent and irreversible</strong>. It will delete this {targetType} and clean up orphaned child assets.
                        </p>
                    )}
                </div>

                {/* Multi-Department Unlink Option */}
                {isMultiDepartmentCourse ? (
                    <div className="space-y-4 pt-2">
                        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 space-y-2">
                            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                                <Unlink className="w-4 h-4 text-amber-500" />
                                Recommended Action:
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Unlinking will safely remove this course from <strong className="font-bold">{currentDeptId}</strong> while leaving syllabus topics and materials intact for the remaining {linkedCount - 1} department(s).
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isDeleting}
                                className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleUnlink}
                                disabled={isDeleting}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Unlinking...</span>
                                    </>
                                ) : (
                                    <>
                                        <Unlink className="w-4 h-4" />
                                        <span>Unlink from Current Department</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Global Hard Delete Form */
                    <form onSubmit={handleHardDelete} className="space-y-4">
                        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 space-y-2">
                            <p className="text-xs font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-rose-500" />
                                Hard Delete Safeguard:
                            </p>
                            <p className="text-xs text-rose-700 dark:text-rose-400">
                                This is the sole remaining reference. Hard deleting will permanently purge all child entities, syllabus topics, and Cloud Storage files.
                            </p>
                        </div>

                        <div className="space-y-2">
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

                        <div className="flex items-center gap-3 pt-2 justify-end">
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
                                disabled={!isCodeMatch || isDeleting}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Deleting...</span>
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4" />
                                        <span>Global Hard Delete</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
