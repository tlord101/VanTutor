import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { ref as dbRef, onValue, update, remove } from 'firebase/database';
import type { Feedback } from '../../../types';
import { useToast } from '../../../hooks/useToast';
import { MessageSquare, CheckCircle, Trash2, Clock } from 'lucide-react';

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
                // Sort by timestamp descending
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
            case 'bug': return 'text-red-600 bg-red-100';
            case 'complaint': return 'text-orange-600 bg-orange-100';
            default: return 'text-blue-600 bg-blue-100';
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500">Loading feedback...</div>;
    }

    return (
        <div className="p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black  dark:text-white">User Feedback</h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Suggestions, bug reports, and complaints from users.</p>
                </div>
            </div>

            {feedbacks.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
                    <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold  dark:text-white">No Feedback Yet</h3>
                    <p className="text-slate-500 text-sm mt-1">When users submit feedback, it will appear here.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {feedbacks.map((item) => (
                        <div key={item.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getTypeColor(item.type)}`}>
                                        {item.type}
                                    </span>
                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(item.timestamp).toLocaleString()}
                                    </span>
                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                                        User: {item.uid.slice(0, 8)}...
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${item.status === 'resolved' ? 'bg-green-100 text-green-700' : item.status === 'reviewed' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {item.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            
                            <p className="text-slate-700 font-medium whitespace-pre-wrap text-sm mb-6">{item.content}</p>
                            
                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                {item.status !== 'reviewed' && item.status !== 'resolved' && (
                                    <button onClick={() => handleMarkStatus(item.id, 'reviewed')} className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                                        Mark Reviewed
                                    </button>
                                )}
                                {item.status !== 'resolved' && (
                                    <button onClick={() => handleMarkStatus(item.id, 'resolved')} className="px-3 py-1.5 text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors flex items-center gap-1">
                                        <CheckCircle className="w-4 h-4" /> Resolve
                                    </button>
                                )}
                                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
