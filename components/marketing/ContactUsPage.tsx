import React, { useState, useEffect } from 'react';
import { ref as dbRef, get, push, set } from 'firebase/database';
import { db } from '../../firebase';
import { SEOHead } from '../SEOHead';
import { ArrowLeft, Mail, Phone, MapPin, Send, Loader2 } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

export const ContactUsPage: React.FC = () => {
    const { addToast } = useToast();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Support credentials from admin settings
    const [supportEmail, setSupportEmail] = useState('support@avelut.xyz');
    const [supportPhone, setSupportPhone] = useState('+1 (555) 123-4567');
    const [supportAddress, setSupportAddress] = useState('San Francisco, CA');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const settingsRef = dbRef(db, 'app_settings/global');
                const snapshot = await get(settingsRef);
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    if (data.support_email) setSupportEmail(data.support_email);
                    if (data.support_phone) setSupportPhone(data.support_phone);
                    if (data.support_address) setSupportAddress(data.support_address);
                }
            } catch (e) {
                console.error("Failed to load support settings:", e);
            }
        };
        fetchSettings();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!name || !email || !subject || !message) {
            addToast('Please fill in all fields', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const ticketsRef = dbRef(db, 'support_tickets');
            const newTicketRef = push(ticketsRef);
            await set(newTicketRef, {
                name,
                email,
                subject,
                message,
                status: 'open',
                timestamp: Date.now()
            });

            addToast('Your message has been sent successfully! We will get back to you soon.', 'success');
            
            // Clear form
            setName('');
            setEmail('');
            setSubject('');
            setMessage('');
        } catch (error: any) {
            console.error("Error submitting ticket:", error);
            addToast(`Failed to send message: ${error.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-black font-sans selection:bg-brand-500 selection:text-white">
            <SEOHead 
                title="Contact Us"
                description="Get in touch with the Avelut team. We're here to help you succeed."
                url="https://avelut.xyz/contact"
            />
            
            <div className="max-w-6xl mx-auto px-6 py-12 md:py-20">
                <button 
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }}
                    className="flex items-center gap-2 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white transition mb-12 font-semibold"
                >
                    <ArrowLeft className="w-5 h-5" /> Back to Home
                </button>

                <div className="text-center max-w-3xl mx-auto space-y-6 mb-16">
                    <h1 className="text-5xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight">Contact Us</h1>
                    <p className="text-xl text-slate-600 leading-relaxed">
                        Have a question, feedback, or need support? Our team is always ready to help you out.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    {/* Contact Info */}
                    <div className="space-y-8 lg:col-span-1">
                        <div className="bg-white dark:bg-black rounded-[24px] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Get in Touch</h3>
                            
                            <div className="space-y-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Email</p>
                                        <a href={`mailto:${supportEmail}`} className="text-lg font-medium text-slate-900 dark:text-white hover:text-brand-600 transition">{supportEmail}</a>
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                                        <Phone className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Phone</p>
                                        <p className="text-lg font-medium text-slate-900 dark:text-white">{supportPhone}</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Office</p>
                                        <p className="text-lg font-medium text-slate-900 dark:text-white">{supportAddress}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className="lg:col-span-2">
                        <div className="bg-white dark:bg-black rounded-[32px] p-8 md:p-12 shadow-xl shadow-slate-200/50 border border-slate-100">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Your Name</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Email Address</label>
                                        <input 
                                            type="email" 
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                            placeholder="john@example.com"
                                        />
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Subject</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                        placeholder="How can we help?"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Message</label>
                                    <textarea 
                                        required
                                        rows={6}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition resize-none"
                                        placeholder="Type your message here..."
                                    />
                                </div>

                                <button 
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl py-5 flex items-center justify-center gap-2 transition disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <>
                                            Send Message <Send className="w-5 h-5" />
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
