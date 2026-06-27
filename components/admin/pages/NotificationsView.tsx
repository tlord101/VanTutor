import React, { useState } from 'react';
import { db, auth } from '../../../firebase';
import { ref as dbRef, push, update, set } from 'firebase/database';
import { GoogleGenAI, Type } from '@google/genai';
import { Send, Sparkles, Bell, Users, UserCheck } from 'lucide-react';
import { useToast } from '../../../hooks/useToast';
import type { UserProfile } from '../../../types';

interface NotificationsViewProps {
    allUsersList: UserProfile[];
    geminiApiKey?: string;
    geminiModel?: string;
    refreshSentNotifications?: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ 
    allUsersList, 
    geminiApiKey,
    geminiModel,
    refreshSentNotifications 
}) => {
    const { addToast } = useToast();
    const [recipientMode, setRecipientMode] = useState<'all' | 'single'>('all');
    const [selectedRecipientId, setSelectedRecipientId] = useState('');
    const [announcementTitle, setAnnouncementTitle] = useState('');
    const [announcementMessage, setAnnouncementMessage] = useState('');
    const [notificationType, setNotificationType] = useState<'study_update' | 'exam_reminder' | 'welcome'>('study_update');
    const [isSendingPush, setIsSendingPush] = useState(false);

    const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

    const getTargetUsers = () => {
        if (recipientMode === 'all') {
            return allUsersList;
        }
        return allUsersList.filter(user => user.uid === selectedRecipientId);
    };

    const handleSendPushNotification = async () => {
        const title = announcementTitle.trim();
        const message = announcementMessage.trim();
        if (!title || !message) {
            addToast("Please enter both title and message", "error");
            return;
        }

        const targetUsers = getTargetUsers();
        if (targetUsers.length === 0) {
            addToast("Please select a valid recipient", "error");
            return;
        }

        setIsSendingPush(true);
        try {
            const updates: Record<string, any> = {};
            const skippedUsers: string[] = [];
            targetUsers.forEach(user => {
                const notificationId = push(dbRef(db, `notifications/${user.uid}`)).key;
                if (!notificationId) {
                    skippedUsers.push(user.display_name || user.uid);
                    return;
                }
                updates[`notifications/${user.uid}/${notificationId}`] = {
                    type: notificationType,
                    title,
                    message,
                    is_read: false,
                    timestamp: Date.now(),
                };
            });

            if (Object.keys(updates).length === 0) {
                addToast("Could not prepare notifications", "error");
                return;
            }

            await update(dbRef(db), updates);
            setAnnouncementTitle('');
            setAnnouncementMessage('');
            
            const logId = push(dbRef(db, 'sent_notifications')).key;
            if (logId) {
                const targetLabel = recipientMode === 'all' 
                    ? 'All Users' 
                    : allUsersList.find(u => u.uid === selectedRecipientId)?.display_name || selectedRecipientId;
                await set(dbRef(db, `sent_notifications/${logId}`), {
                    title,
                    message,
                    type: notificationType,
                    recipient: targetLabel,
                    timestamp: Date.now(),
                    sent_by: auth.currentUser?.email || 'admin'
                });
                if (refreshSentNotifications) refreshSentNotifications();
            }

            const successfulSends = targetUsers.length - skippedUsers.length;
            if (skippedUsers.length > 0) {
                addToast(`Push sent to ${successfulSends} user(s). Skipped some due to ID generation failures.`, "info");
            } else {
                addToast(`Push notification sent to ${successfulSends} user${successfulSends !== 1 ? 's' : ''}.`, "success");
            }
        } catch (error: any) {
            console.error("Error sending push notifications:", error);
            addToast(error?.message || "Failed to send push notification", "error");
        } finally {
            setIsSendingPush(false);
        }
    };

    const handleSuggestAnnouncement = async () => {
        if (!ai || !geminiModel) {
            addToast("AI features are unavailable because the Gemini API key or model is not configured in App Controls.", "error");
            return;
        }
        setIsSendingPush(true);
        try {
            const prompt = `Create a short notification title (max 8 words) and a concise notification message (max 200 characters) for a ${notificationType.replace('_', ' ')} to students. Return only a JSON object with keys "title" and "message".`;

            const response = await ai.models.generateContent({
                model: geminiModel,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            message: { type: Type.STRING }
                        },
                        required: ['title', 'message']
                    }
                }
            });

            const responseText = (response as any).text || '';
            if (!responseText) throw new Error('AI returned an empty suggestion.');
            const data = JSON.parse(responseText);
            setAnnouncementTitle((data.title || '').toString());
            setAnnouncementMessage((data.message || '').toString());
            addToast('Suggested announcement generated.', 'success');
        } catch (error: any) {
            console.error('Error generating suggestion:', error);
            addToast(error?.message || 'Failed to generate suggestion', 'error');
        } finally {
            setIsSendingPush(false);
        }
    };

    return (
        <div className="max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8">
            <div>
                <h3 className="font-black text-xl text-slate-900 mb-1 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-indigo-500" />
                    Push Notifications
                </h3>
                <p className="text-sm text-slate-500">Send direct push notifications to user devices.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 text-sm">Recipient Selection</h4>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setRecipientMode('all')}
                            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-all ${
                                recipientMode === 'all'
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <Users className="w-4 h-4" /> All Users
                        </button>
                        <button
                            onClick={() => setRecipientMode('single')}
                            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-all ${
                                recipientMode === 'single'
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <UserCheck className="w-4 h-4" /> Single User
                        </button>
                    </div>

                    {recipientMode === 'single' && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select User</label>
                            <select
                                value={selectedRecipientId}
                                onChange={(e) => setSelectedRecipientId(e.target.value)}
                                className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm bg-white"
                            >
                                <option value="" disabled>Select a user...</option>
                                {allUsersList.map(user => (
                                    <option key={user.uid} value={user.uid}>
                                        {user.display_name || 'Unnamed'} ({user.email || 'No email'})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 text-sm">Notification Content</h4>
                    
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notification Type</label>
                        <select
                            value={notificationType}
                            onChange={(e) => setNotificationType(e.target.value as any)}
                            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm bg-white"
                        >
                            <option value="study_update">Study Update</option>
                            <option value="exam_reminder">Exam Reminder</option>
                            <option value="welcome">General Welcome / Info</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                            Title
                            <button onClick={handleSuggestAnnouncement} disabled={isSendingPush || !ai} className="text-indigo-600 flex items-center gap-1 hover:text-indigo-700 disabled:opacity-50">
                                <Sparkles className="w-3 h-3" /> Auto-suggest
                            </button>
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Server Maintenance"
                            value={announcementTitle}
                            onChange={(e) => setAnnouncementTitle(e.target.value)}
                            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Message</label>
                        <textarea
                            rows={3}
                            placeholder="Enter notification content..."
                            value={announcementMessage}
                            onChange={(e) => setAnnouncementMessage(e.target.value)}
                            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-sm resize-none"
                        />
                    </div>

                    <button
                        onClick={handleSendPushNotification}
                        disabled={isSendingPush || !announcementTitle.trim() || !announcementMessage.trim()}
                        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition disabled:opacity-50"
                    >
                        <Send className="w-5 h-5" />
                        {isSendingPush ? 'Sending...' : 'Send Push Notification'}
                    </button>
                </div>
            </div>
        </div>
    );
};
