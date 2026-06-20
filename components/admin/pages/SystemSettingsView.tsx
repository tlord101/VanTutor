import React, { useState, useEffect } from 'react';
import { Settings, Mail, Key, Shield, HardDrive, Database, ToggleLeft, ToggleRight, Server } from 'lucide-react';
import { db } from '../../../firebase';
import { ref as dbRef, get, set } from 'firebase/database';
import { useToast } from '../../../hooks/useToast';
import type { AppSettings, EmailConfig } from '../../../types';

export const SystemSettingsView: React.FC = () => {
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState<'general' | 'keys' | 'email'>('general');
    
    // States
    const [appSettings, setAppSettings] = useState<Partial<AppSettings>>({});
    const [emailConfig, setEmailConfig] = useState<Partial<EmailConfig>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const [appSnap, emailSnap] = await Promise.all([
                    get(dbRef(db, 'app_settings')),
                    get(dbRef(db, 'email_config'))
                ]);
                if (appSnap.exists()) setAppSettings(appSnap.val());
                if (emailSnap.exists()) setEmailConfig(emailSnap.val());
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setIsLoading(false);
            }
        };
        void fetchSettings();
    }, []);

    const handleSaveApp = async () => {
        setIsSaving(true);
        try {
            await set(dbRef(db, 'app_settings'), appSettings);
            addToast("App settings saved successfully", "success");
        } catch (error: any) {
            addToast("Failed to save app settings: " + error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveEmail = async () => {
        setIsSaving(true);
        try {
            await set(dbRef(db, 'email_config'), emailConfig);
            addToast("Email configuration saved successfully", "success");
        } catch (error: any) {
            addToast("Failed to save email config: " + error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestEmail = async () => {
        addToast("Testing email configuration... (Simulated)", "info");
        // Implementing actual test endpoint call here if it exists.
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500 font-bold animate-pulse">Loading system settings...</div>;
    }

    return (
        <div className="space-y-8">
            <div className="flex gap-4 border-b border-slate-200">
                <button 
                    onClick={() => setActiveTab('general')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'general' ? 'border-indigo-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Settings className="w-4 h-4" />
                    General Platform
                </button>
                <button 
                    onClick={() => setActiveTab('keys')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'keys' ? 'border-indigo-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Key className="w-4 h-4" />
                    API & Secrets
                </button>
                <button 
                    onClick={() => setActiveTab('email')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'email' ? 'border-indigo-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    <Mail className="w-4 h-4" />
                    SMTP Configuration
                </button>
            </div>

            {activeTab === 'general' && (
                <div className="max-w-4xl bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-8">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 mb-1">Platform Preferences</h3>
                        <p className="text-sm text-slate-500">Manage global limits and feature toggles.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">AI Model Limit (RPM)</label>
                            <input 
                                type="number" 
                                value={appSettings.custom_user_limit_rpm || 0} 
                                onChange={e => setAppSettings({...appSettings, custom_user_limit_rpm: Number(e.target.value)})}
                                className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">AI Model Limit (TPM)</label>
                            <input 
                                type="number" 
                                value={appSettings.custom_user_limit_tpm || 0} 
                                onChange={e => setAppSettings({...appSettings, custom_user_limit_tpm: Number(e.target.value)})}
                                className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 space-y-4">
                        <label className="flex items-center justify-between p-4 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition">
                            <div className="flex items-center gap-3">
                                <HardDrive className="w-5 h-5 text-indigo-500" />
                                <div>
                                    <p className="font-bold text-slate-900">Upload Center Enabled</p>
                                    <p className="text-xs text-slate-500">Allow users to upload files.</p>
                                </div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={appSettings.upload_center_uploads_enabled || false}
                                onChange={e => setAppSettings({...appSettings, upload_center_uploads_enabled: e.target.checked})}
                                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                        </label>

                        <label className="flex items-center justify-between p-4 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition">
                            <div className="flex items-center gap-3">
                                <Shield className="w-5 h-5 text-amber-500" />
                                <div>
                                    <p className="font-bold text-slate-900">Maintenance Mode (Coming Soon)</p>
                                    <p className="text-xs text-slate-500">Locks the app for non-admins.</p>
                                </div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={appSettings.coming_soon_enabled || false}
                                onChange={e => setAppSettings({...appSettings, coming_soon_enabled: e.target.checked})}
                                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                        </label>
                    </div>

                    <div className="pt-6 border-t border-slate-100 flex justify-end">
                        <button onClick={handleSaveApp} disabled={isSaving} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50">
                            {isSaving ? 'Saving...' : 'Save General Settings'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'keys' && (
                <div className="max-w-4xl bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-8">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 mb-1">API Keys & Secrets</h3>
                        <p className="text-sm text-slate-500">Manage third-party integrations.</p>
                    </div>

                    <div className="space-y-6">
                        {/* Gemini */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 border border-slate-100">
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                <Database className="w-4 h-4 text-blue-500" /> Gemini AI
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" placeholder="Primary Model (e.g. gemini-1.5-pro)" value={appSettings.primary_gemini_model || ''} onChange={e => setAppSettings({...appSettings, primary_gemini_model: e.target.value})} className="p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500" />
                                <input type="password" placeholder="Gemini API Key" value={appSettings.gemini_api_key || ''} onChange={e => setAppSettings({...appSettings, gemini_api_key: e.target.value})} className="p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500" />
                            </div>
                        </div>

                        {/* Paystack */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 border border-slate-100">
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                <Database className="w-4 h-4 text-teal-500" /> Paystack
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" placeholder="Public Key" value={appSettings.paystack_public_key || ''} onChange={e => setAppSettings({...appSettings, paystack_public_key: e.target.value})} className="p-3 border border-slate-200 rounded-xl outline-none focus:border-teal-500" />
                                <input type="password" placeholder="Secret Key" value={appSettings.paystack_secret_key || ''} onChange={e => setAppSettings({...appSettings, paystack_secret_key: e.target.value})} className="p-3 border border-slate-200 rounded-xl outline-none focus:border-teal-500" />
                            </div>
                        </div>

                        {/* Pinecone */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 border border-slate-100">
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                <Database className="w-4 h-4 text-purple-500" /> Pinecone Vector DB
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" placeholder="Index Name" value={appSettings.pinecone_index_name || ''} onChange={e => setAppSettings({...appSettings, pinecone_index_name: e.target.value})} className="p-3 border border-slate-200 rounded-xl outline-none focus:border-purple-500" />
                                <input type="password" placeholder="Pinecone API Key" value={appSettings.pinecone_api_key || ''} onChange={e => setAppSettings({...appSettings, pinecone_api_key: e.target.value})} className="p-3 border border-slate-200 rounded-xl outline-none focus:border-purple-500" />
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 flex justify-end">
                        <button onClick={handleSaveApp} disabled={isSaving} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50">
                            {isSaving ? 'Saving...' : 'Save Keys'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'email' && (
                <div className="max-w-4xl bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-8">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 mb-1">SMTP Configuration</h3>
                        <p className="text-sm text-slate-500">Configure outbound email server for systemic broadcasts.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <input type="text" placeholder="SMTP Host (e.g. smtp.gmail.com)" value={emailConfig.host || ''} onChange={e => setEmailConfig({...emailConfig, host: e.target.value})} className="p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all" />
                        <input type="number" placeholder="SMTP Port (e.g. 465)" value={emailConfig.port || ''} onChange={e => setEmailConfig({...emailConfig, port: Number(e.target.value)})} className="p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all" />
                        <input type="text" placeholder="Username / Email" value={emailConfig.user || ''} onChange={e => setEmailConfig({...emailConfig, user: e.target.value})} className="p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all" />
                        <input type="password" placeholder="App Password" value={emailConfig.pass || ''} onChange={e => setEmailConfig({...emailConfig, pass: e.target.value})} className="p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all" />
                        <input type="text" placeholder="Sender Name (e.g. Avelut Support)" value={emailConfig.from_name || ''} onChange={e => setEmailConfig({...emailConfig, from_name: e.target.value})} className="p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all" />
                        <input type="email" placeholder="Sender Email" value={emailConfig.from_email || ''} onChange={e => setEmailConfig({...emailConfig, from_email: e.target.value})} className="p-4 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all" />
                    </div>

                    <label className="flex items-center gap-3">
                        <input type="checkbox" checked={emailConfig.secure || false} onChange={e => setEmailConfig({...emailConfig, secure: e.target.checked})} className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm font-bold text-slate-700">Use Secure Connection (SSL/TLS for Port 465)</span>
                    </label>

                    <div className="pt-6 border-t border-slate-100 flex gap-4 justify-end">
                        <button onClick={handleTestEmail} disabled={isSaving} className="px-6 py-4 bg-slate-100 text-slate-700 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition disabled:opacity-50">
                            Test SMTP
                        </button>
                        <button onClick={handleSaveEmail} disabled={isSaving} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50">
                            {isSaving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
