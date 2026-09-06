import { db, onValue, ref as dbRef, remove, update } from '@/lib/backend';
import React, { useState, useEffect } from 'react';
import type { Feedback } from '../../../types';
import { useToast } from '../../../hooks/useToast';

export const FeedbackView: React.FC = () => {
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { addToast } = useToast();

    useEffect(() => {
        const feedbackRef = dbRef(db, 'feedback');
        const unsubscribe = onValue(feedbackRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const parsedFeedbacks: Feedback[] = Object.values(data);
                parsedFeedbacks.sort((a, b) => b.timestamp - a.timestamp);
                setFeedbacks(parsedFeedbacks);
            } else {
                setFeedbacks([]);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching feedback:", error);
            addToast("Failed to load feedback.", "error");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [addToast]);

    const handleMarkStatus = async (id: string, status: 'reviewed' | 'resolved') => {
        try {
            await update(dbRef(db, `feedback/${id}`), { status });
            addToast(`Feedback marked as ${status}`, "success");
        } catch (error) {
            console.error("Error updating feedback status:", error);
            addToast("Failed to update status", "error");
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this feedback?")) return;
        try {
            await remove(dbRef(db, `feedback/${id}`));
            addToast("Feedback deleted", "success");
        } catch (error) {
            console.error("Error deleting feedback:", error);
            addToast("Failed to delete feedback", "error");
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'bug': return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40';
            case 'complaint': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40';
            default: return 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700';
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500 font-bold">Loading feedback...</div>;
    }

    return (
        <div className="space-y-6 text-slate-900 dark:text-slate-100">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <i className="bi bi-chat-square-quote-fill text-amber-500"></i>
                        <span>User Feedback</span>
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Suggestions, bug reports, and complaints from users.</p>
                </div>
            </div>

            {feedbacks.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <i className="bi bi-chat-square-quote text-5xl text-slate-300 dark:text-slate-700 mx-auto mb-3 block"></i>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Feedback Yet</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">When users submit feedback, it will appear here.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {feedbacks.map((item) => (
                        <div key={item.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getTypeColor(item.type)}`}>
                                        {item.type}
                                    </span>
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                                        <i className="bi bi-clock text-[10px]"></i>
                                        <span>{new Date(item.timestamp).toLocaleString()}</span>
                                    </span>
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                                        User: {item.uid.slice(0, 8)}...
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${item.status === 'resolved' ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : item.status === 'reviewed' ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                                        {item.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            
                            <p className="text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap text-sm mb-6">{item.content}</p>
                            
                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                                {item.status !== 'reviewed' && item.status !== 'resolved' && (
                                    <button onClick={() => handleMarkStatus(item.id, 'reviewed')} className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer">
                                        Mark Reviewed
                                    </button>
                                )}
                                {item.status !== 'resolved' && (
                                    <button onClick={() => handleMarkStatus(item.id, 'resolved')} className="px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer">
                                        <i className="bi bi-check-circle-fill"></i> Resolve
                                    </button>
                                )}
                                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer">
                                    <i className="bi bi-trash text-base"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
