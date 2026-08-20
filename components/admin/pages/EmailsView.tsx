import React, { useState, useEffect } from 'react';
import { db, auth } from '../../../firebase';
import { ref as dbRef, push, set, get, query, limitToLast } from 'firebase/database';
import { useToast } from '../../../hooks/useToast';
import type { UserProfile } from '../../../types';

interface EmailsViewProps {
    allUsersList: UserProfile[];
    refreshSentEmails?: () => void;
}

export const EmailsView: React.FC<EmailsViewProps> = ({ 
    allUsersList,
    refreshSentEmails
}) => {
    const { addToast } = useToast();
    const [recipientMode, setRecipientMode] = useState<'all' | 'single'>('all');
    const [selectedRecipientId, setSelectedRecipientId] = useState('');
    const [playstoreEmails, setPlaystoreEmails] = useState<{email: string, timestamp: number}[]>([]);
    const [isLoadingEmails, setIsLoadingEmails] = useState(false);

    useEffect(() => {
        const fetchPlaystoreEmails = async () => {
            setIsLoadingEmails(true);
            try {
                const snap = await get(query(dbRef(db, 'playstore_early_access_emails'), limitToLast(1000)));
                if (snap.exists()) {
                    const data = snap.val();
                    const emailsList = Object.values(data).map((item: any) => ({
                        email: item.email,
                        timestamp: item.timestamp
                    })).sort((a: any, b: any) => b.timestamp - a.timestamp);
                    setPlaystoreEmails(emailsList);
                }
            } catch (err) {
                console.error("Error fetching playstore emails:", err);
                addToast('Failed to load Play Store early access emails.', 'error');
                setPlaystoreEmails([]);
            } finally {
                setIsLoadingEmails(false);
            }
        };
        fetchPlaystoreEmails();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const downloadPlaystoreEmails = () => {
        if (playstoreEmails.length === 0) return;

        const escapeCsvCell = (cell: string) => {
            const safe = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
            return `"${safe.replace(/"/g, '""')}"`;
        };

        const header = 'Email,Timestamp';
        const rows = playstoreEmails.map(({ email, timestamp }) => {
            const ts = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : '';
            return `${escapeCsvCell(email)},${escapeCsvCell(ts)}`;
        });

        const blob = new Blob([`${header}\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'playstore_early_access_emails.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const getTargetUsersList = () => {
        if (recipientMode === 'all') {
            return allUsersList;
        }
        return allUsersList.filter(user => user.uid === selectedRecipientId);
    };

    const generateEmailHtml = (subject: string, bodyText: string) => {
        const formattedBody = bodyText.replace(/\n/g, '<br />');
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #1e293b;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid #334155;
        }
        .header {
            background-color: #0f172a;
            padding: 32px 24px;
            text-align: center;
            border-bottom: 1px solid #334155;
        }
        .logo {
            font-size: 28px;
            font-weight: 900;
            color: #f8fafc;
            letter-spacing: 2px;
            margin: 0;
            text-transform: uppercase;
        }
        .logo-span {
            color: #f59e0b;
        }
        .content {
            padding: 40px 32px;
            color: #cbd5e1;
            font-size: 16px;
            line-height: 1.6;
        }
        .subject-title {
            font-size: 20px;
            font-weight: 700;
            color: #f8fafc;
            margin-top: 0;
            margin-bottom: 24px;
        }
        .footer {
            background-color: #0f172a;
            padding: 24px;
            text-align: center;
            color: #94a3b8;
            font-size: 13px;
            border-top: 1px solid #334155;
        }
        .button {
            display: inline-block;
            background-color: #f59e0b;
            color: #0f172a !important;
            font-weight: 700;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            margin-top: 24px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo">AVELUT<span class="logo-span">.</span></h1>
        </div>
        <div class="content">
            <h2 class="subject-title">${subject}</h2>
            <div>
                ${formattedBody}
            </div>
            <a href="https://avelut.xyz" class="button">Visit Avelut</a>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Avelut. All rights reserved.</p>
            <p>You received this email because you are registered on the Avelut platform.</p>
        </div>
    </div>
</body>
</html>
        `.trim();
    };

    const handleSendEmail = async () => {
        const subject = emailSubject.trim();
        const body = emailBody.trim();
        if (!subject || !body) {
            addToast("Please enter both email subject and body", "error");
            return;
        }

        const targetUsers = getTargetUsersList();
        if (targetUsers.length === 0) {
            addToast("Please select a valid recipient", "error");
            return;
        }

        const emailList = Array.from(new Set(targetUsers.map(user => user.email?.trim()).filter(Boolean) as string[]));
        if (emailList.length === 0) {
            addToast("No email address found for selected recipient(s)", "error");
            return;
        }

        setIsSendingEmail(true);
        try {
            const queueRef = push(dbRef(db, 'email_queue'));
            const queueId = queueRef.key;
            if (!queueId) {
                throw new Error("Failed to generate queue ID");
            }

            const adminEmail = auth.currentUser?.email || 'admin';
            const htmlContent = generateEmailHtml(subject, body);

            await set(dbRef(db, `email_queue/${queueId}`), {
                subject,
                body,
                html: htmlContent,
                recipients: emailList,
                status: 'pending',
                timestamp: Date.now(),
                sent_by: adminEmail
            });

            const logId = push(dbRef(db, 'sent_emails')).key;
            if (logId) {
                const targetLabel = recipientMode === 'all'
                    ? 'All Users'
                    : allUsersList.find(u => u.uid === selectedRecipientId)?.display_name || selectedRecipientId;
                await set(dbRef(db, `sent_emails/${logId}`), {
                    subject,
                    body,
                    recipient: targetLabel,
                    recipients_count: emailList.length,
                    timestamp: Date.now(),
                    sent_by: adminEmail
                });
            }

            setEmailSubject('');
            setEmailBody('');
            addToast(`Email queued for delivery to ${emailList.length} recipient${emailList.length !== 1 ? 's' : ''} via SMTP.`, "success");
            if (refreshSentEmails) refreshSentEmails();
        } catch (error: any) {
            console.error("Error queueing email broadcast:", error);
            addToast(error?.message || "Could not queue email broadcast.", "error");
        } finally {
            setIsSendingEmail(false);
        }
    };

    return (
        <div className="space-y-8 text-slate-900 dark:text-slate-100 max-w-4xl">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-8">
                <div>
                    <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                        <i className="bi bi-envelope-fill text-amber-500"></i>
                        <span>SMTP Emails</span>
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Send beautifully formatted HTML emails via your configured SMTP server.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">Recipient Selection</h4>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setRecipientMode('all')}
                                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                                    recipientMode === 'all'
                                        ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black'
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                <i className="bi bi-people-fill"></i>
                                <span>All Users</span>
                            </button>
                            <button
                                onClick={() => setRecipientMode('single')}
                                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                                    recipientMode === 'single'
                                        ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black'
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                <i className="bi bi-person-check-fill"></i>
                                <span>Single User</span>
                            </button>
                        </div>

                        {recipientMode === 'single' && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Select User</label>
                                <select
                                    value={selectedRecipientId}
                                    onChange={(e) => setSelectedRecipientId(e.target.value)}
                                    className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-amber-500 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
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
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">Email Content</h4>
                        
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Subject</label>
                            <input
                                type="text"
                                placeholder="e.g. Avelut Mid-term Update"
                                value={emailSubject}
                                onChange={(e) => setEmailSubject(e.target.value)}
                                className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Body</label>
                            <textarea
                                rows={6}
                                placeholder="Type your email body here... It will be beautifully formatted inside the Avelut template."
                                value={emailBody}
                                onChange={(e) => setEmailBody(e.target.value)}
                                className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm resize-none"
                            />
                        </div>

                        <button
                            onClick={handleSendEmail}
                            disabled={isSendingEmail || !emailSubject.trim() || !emailBody.trim()}
                            className="w-full py-4 bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 rounded-xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                        >
                            <i className="bi bi-send-fill text-sm"></i>
                            <span>{isSendingEmail ? 'Queueing...' : 'Send HTML Email'}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                            <i className="bi bi-phone-fill text-amber-500"></i>
                            <span>Play Store Early Access Emails</span>
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Emails collected from the landing page Play Store modal.</p>
                    </div>
                    <button onClick={downloadPlaystoreEmails} disabled={playstoreEmails.length === 0} className="px-6 py-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-amber-500/20 transition disabled:opacity-50 border border-amber-500/30 cursor-pointer">
                        <i className="bi bi-download"></i>
                        <span>Download CSV ({playstoreEmails.length})</span>
                    </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold text-[10px]">
                            <tr>
                                <th className="p-4">Email</th>
                                <th className="p-4">Date Collected</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoadingEmails ? (
                                <tr><td colSpan={2} className="p-8 text-center text-slate-500">Loading...</td></tr>
                            ) : playstoreEmails.length === 0 ? (
                                <tr><td colSpan={2} className="p-8 text-center text-slate-500">No emails collected yet.</td></tr>
                            ) : (
                                playstoreEmails.slice(0, 10).map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className="p-4 font-medium text-slate-700 dark:text-slate-300">{item.email}</td>
                                        <td className="p-4 text-slate-500 dark:text-slate-400">{new Date(item.timestamp).toLocaleString()}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    {playstoreEmails.length > 10 && (
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800">
                            Showing latest 10 emails. Download CSV to see all {playstoreEmails.length} emails.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
