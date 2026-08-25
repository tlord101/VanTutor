import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

interface ConfirmDeleteModalProps {
    isOpen: boolean;
    title: string;
    description: string;
    itemName: string;
    warningDetails?: string[];
    isDeleting?: boolean;
    onConfirm: () => Promise<void> | void;
    onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
    isOpen,
    title,
    description,
    itemName,
    warningDetails = [],
    isDeleting = false,
    onConfirm,
    onClose,
}) => {
    const [typedName, setTypedName] = useState('');
    const [shakeInput, setShakeInput] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTypedName('');
            setShakeInput(false);
            setErrorMsg('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isMatch = typedName.trim().toLowerCase() === itemName.trim().toLowerCase();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isMatch) {
            setShakeInput(true);
            setErrorMsg(`Please type "${itemName}" exactly as shown to confirm.`);
            setTimeout(() => setShakeInput(false), 500);
            return;
        }
        setErrorMsg('');
        await onConfirm();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 border border-rose-200 dark:border-rose-800/40 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-2">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight">{title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
                </div>

                {warningDetails.length > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 space-y-2">
                        <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                            Cascading Impact:
                        </p>
                        <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 space-y-1">
                            {warningDetails.map((detail, idx) => (
                                <li key={idx}>{detail}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Type <span className="text-rose-600 dark:text-rose-400 font-mono font-black select-all">"{itemName}"</span> to confirm:
                        </label>
                        <input
                            type="text"
                            value={typedName}
                            onChange={(e) => {
                                setTypedName(e.target.value);
                                setErrorMsg('');
                            }}
                            placeholder={itemName}
                            className={`w-full px-4 py-3 rounded-2xl border text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none transition-all ${
                                shakeInput ? 'animate-bounce border-rose-500 ring-4 ring-rose-100 dark:ring-rose-950' : 'border-slate-200 dark:border-slate-700 focus:border-rose-500 focus:ring-4 focus:ring-rose-100 dark:focus:ring-rose-950/40'
                            }`}
                        />
                        {errorMsg && <p className="text-xs font-bold text-rose-500 animate-in fade-in">{errorMsg}</p>}
                    </div>

                    <div className="flex items-center gap-3 pt-2 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isDeleting}
                            className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!isMatch || isDeleting}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Deleting...</span>
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-4 h-4" />
                                    <span>Delete Permanently</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
