import React, { useState } from 'react';
import { Sparkles, ArrowRight, Check, X, Layers, AlertCircle, Loader2 } from 'lucide-react';

export interface SuggestedMerge {
    id: string;
    targetTopicName: string;
    originalTopics: string[];
    estimatedHours?: string;
}

export interface MergeReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    suggestedMerges: SuggestedMerge[];
    onConfirmMerges: (selectedMerges: SuggestedMerge[]) => void;
    isProcessing?: boolean;
}

export const MergeReviewModal: React.FC<MergeReviewModalProps> = ({
    isOpen,
    onClose,
    suggestedMerges,
    onConfirmMerges,
    isProcessing = false,
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        new Set(suggestedMerges.map((m) => m.id))
    );

    if (!isOpen) return null;

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleConfirm = () => {
        const approved = suggestedMerges.filter((m) => selectedIds.has(m.id));
        onConfirmMerges(approved);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 max-h-[90vh] flex flex-col justify-between animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-500 border border-amber-200 dark:border-amber-800/40 flex items-center justify-center shrink-0">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-500/20">
                                AI Topic Deduplication
                            </span>
                            <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight mt-1">
                                Review Topic Merges
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

                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Gemini AI identified redundant and overlapping syllabus topics. Select which merges to approve:
                </p>

                {/* Merges List */}
                {suggestedMerges.length === 0 ? (
                    <div className="py-12 text-center text-xs font-bold text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                        <AlertCircle className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                        <p>No redundant or overlapping topics detected!</p>
                        <p className="text-[11px] text-slate-400">Your syllabus structure is clean.</p>
                    </div>
                ) : (
                    <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar max-h-96">
                        {suggestedMerges.map((merge) => {
                            const isSelected = selectedIds.has(merge.id);

                            return (
                                <div
                                    key={merge.id}
                                    onClick={() => !isProcessing && toggleSelection(merge.id)}
                                    className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer space-y-3 ${
                                        isSelected
                                            ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/20'
                                            : 'border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                                                isSelected ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-300 dark:border-slate-700'
                                            }`}>
                                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                                                Combine {merge.originalTopics.length} Topics
                                            </span>
                                        </div>

                                        {merge.estimatedHours && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                                                {merge.estimatedHours}
                                            </span>
                                        )}
                                    </div>

                                    {/* Merged Transformation Box */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black uppercase text-slate-400">Original Topics:</span>
                                            <ul className="space-y-0.5">
                                                {merge.originalTopics.map((orig, oIdx) => (
                                                    <li key={oIdx} className="text-xs font-medium text-slate-600 dark:text-slate-400 line-through">
                                                        • {orig}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="space-y-1 sm:border-l sm:border-slate-100 dark:sm:border-slate-800 sm:pl-3">
                                            <span className="text-[9px] font-black uppercase text-amber-500">Merged Unified Topic:</span>
                                            <p className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                                <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                <span>{merge.targetTopicName}</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
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
                        disabled={isProcessing || selectedIds.size === 0}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 disabled:opacity-40"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Processing...</span>
                            </>
                        ) : (
                            <>
                                <span>Proceed to Scope Check ({selectedIds.size})</span>
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
