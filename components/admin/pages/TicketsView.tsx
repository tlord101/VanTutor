import React, { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import { ref as dbRef, onValue, update, remove } from 'firebase/database';
import { Mail, Clock, CheckCircle, Trash2, MailOpen, User } from 'lucide-react';
import { useToast } from '../../../hooks/useToast';

interface Ticket {
    id: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    status: 'unread' | 'read' | 'resolved';
    createdAt: number;
}

export const TicketsView: React.FC = () => {
    const { addToast } = useToast();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

    useEffect(() => {
        const ticketsRef = dbRef(db, 'contact_tickets');
        const unsubscribe = onValue(ticketsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const parsed: Ticket[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                })).sort((a, b) => b.createdAt - a.createdAt);
                setTickets(parsed);
            } else {
                setTickets([]);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const updateTicketStatus = async (id: string, status: Ticket['status']) => {
        try {
            await update(dbRef(db, `contact_tickets/${id}`), { status });
            addToast(`Ticket marked as ${status}`, 'success');
            if (selectedTicket && selectedTicket.id === id) {
                setSelectedTicket({ ...selectedTicket, status });
            }
        } catch (error: any) {
            addToast('Failed to update ticket: ' + error.message, 'error');
        }
    };

    const deleteTicket = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this ticket?")) return;
        try {
            await remove(dbRef(db, `contact_tickets/${id}`));
            addToast('Ticket deleted', 'success');
            if (selectedTicket && selectedTicket.id === id) {
                setSelectedTicket(null);
            }
        } catch (error: any) {
            addToast('Failed to delete ticket: ' + error.message, 'error');
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500 dark:text-gray-400 font-bold animate-pulse">Loading tickets...</div>;
    }

    const unreadCount = tickets.filter(t => t.status === 'unread').length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-6">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <Mail className="w-6 h-6 text-indigo-500" />
                        Support Tickets
                    </h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-gray-400 mt-1">
                        Manage user inquiries from the Contact Us page.
                    </p>
                </div>
                {unreadCount > 0 && (
                    <div className="bg-red-100 text-red-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        {unreadCount} Unread Ticket{unreadCount !== 1 ? 's' : ''}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Tickets List */}
                <div className="lg:col-span-1 bg-white dark:bg-black rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 dark:bg-black">
                        <h3 className="font-bold text-slate-800 text-sm">Recent Tickets</h3>
                    </div>
                    <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                        {tickets.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 dark:text-gray-400 text-sm">No tickets found.</div>
                        ) : (
                            tickets.map(ticket => (
                                <button 
                                    key={ticket.id}
                                    onClick={() => setSelectedTicket(ticket)}
                                    className={`w-full text-left p-4 hover:bg-slate-50 dark:bg-black transition ${selectedTicket?.id === ticket.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'border-l-4 border-transparent'} ${ticket.status === 'unread' ? 'font-bold' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-sm text-slate-900 dark:text-white truncate pr-2">{ticket.name}</span>
                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                            {new Date(ticket.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-600 truncate mb-2">{ticket.subject}</div>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[10px] px-2 py-1 rounded-md uppercase tracking-wider font-bold
                                            ${ticket.status === 'unread' ? 'bg-red-100 text-red-600' : 
                                              ticket.status === 'resolved' ? 'bg-green-100 text-green-600' : 
                                              'bg-slate-100 text-slate-600'}
                                        `}>
                                            {ticket.status}
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Ticket Details */}
                <div className="lg:col-span-2">
                    {selectedTicket ? (
                        <div className="bg-white dark:bg-black rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden h-full flex flex-col">
                            <div className="p-6 border-b border-slate-100 bg-slate-50 dark:bg-black flex justify-between items-start">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{selectedTicket.subject}</h3>
                                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-gray-400">
                                        <span className="flex items-center gap-1"><User className="w-4 h-4" /> {selectedTicket.name}</span>
                                        <a href={`mailto:${selectedTicket.email}`} className="flex items-center gap-1 hover:text-indigo-600 transition"><Mail className="w-4 h-4" /> {selectedTicket.email}</a>
                                        <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(selectedTicket.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedTicket.status === 'unread' && (
                                        <button onClick={() => updateTicketStatus(selectedTicket.id, 'read')} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition tooltip-trigger" title="Mark as Read">
                                            <MailOpen className="w-5 h-5" />
                                        </button>
                                    )}
                                    {selectedTicket.status !== 'resolved' && (
                                        <button onClick={() => updateTicketStatus(selectedTicket.id, 'resolved')} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition tooltip-trigger" title="Mark as Resolved">
                                            <CheckCircle className="w-5 h-5" />
                                        </button>
                                    )}
                                    <button onClick={() => deleteTicket(selectedTicket.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition tooltip-trigger" title="Delete Ticket">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-6 flex-1 bg-white dark:bg-black overflow-y-auto">
                                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                                    {selectedTicket.message}
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-black border-t border-slate-100 text-right">
                                <a href={`mailto:${selectedTicket.email}?subject=Re: ${selectedTicket.subject}`} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold transition shadow-md shadow-indigo-200">
                                    <Mail className="w-4 h-4" />
                                    Reply via Email
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50 dark:bg-black/50 rounded-3xl border border-dashed border-slate-200 dark:border-white/10 h-full flex flex-col items-center justify-center text-slate-400 p-8">
                            <Mail className="w-12 h-12 mb-4 text-slate-300" />
                            <p className="font-medium">Select a ticket from the list to view details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
