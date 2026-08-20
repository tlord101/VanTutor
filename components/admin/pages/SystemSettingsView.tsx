import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { ref as dbRef, get, set } from 'firebase/database';
import { useToast } from '../../../hooks/useToast';
import type { AppSettings, EmailConfig, UsageSettings, TierConfig } from '../../../types';

export const SystemSettingsView: React.FC = () => {
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState<'general' | 'plans' | 'keys' | 'email'>('general');
    
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
                if (appSnap.exists()) {
                    const data = appSnap.val();
                    if (!data.usage_settings) {
                        data.usage_settings = {
                            tiers: {
                                free: { tier_id: 'free', display_name: 'Free', description: '', price_ngn: 0, credit_allocation: 0, max_saved_courses: 0, has_verification_badge: false, badge_color: 'none' },
                                basic: { tier_id: 'basic', display_name: 'Basic', description: '', price_ngn: 0, credit_allocation: 0, max_saved_courses: 0, has_verification_badge: false, badge_color: 'none' },
                                premium: { tier_id: 'premium', display_name: 'Premium', description: '', price_ngn: 0, credit_allocation: 0, max_saved_courses: 0, has_verification_badge: false, badge_color: 'none' }
                            },
                            feature_costs: { visual_solve: 0, chat_interaction: 0, flashcard_generation: 0, ai_quiz_generation: 0, study_guide_lesson: 0, study_guide_extraction: 0 },
                            feature_models: {},
                            additional_prices: { visual_messages_price: 0, visual_messages_count: 0, studyguide_course_price: 0, studyguide_request_price: 0 }
                        };
                    } else {
                        data.usage_settings.tiers = data.usage_settings.tiers || {};
                        data.usage_settings.feature_costs = data.usage_settings.feature_costs || {};
                        data.usage_settings.feature_models = data.usage_settings.feature_models || {};
                        data.usage_settings.additional_prices = data.usage_settings.additional_prices || {};
                    }
                    setAppSettings(data);
                }
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
    };

    const updateUsageSetting = (category: keyof UsageSettings, key: string, value: any, subCategory?: string) => {
        setAppSettings(prev => {
            const newSettings = { ...prev };
            newSettings.usage_settings = { ...(newSettings.usage_settings as UsageSettings) };
            if (subCategory) {
                (newSettings.usage_settings[category] as any) = { ...(newSettings.usage_settings[category] as any) };
                (newSettings.usage_settings[category] as any)[subCategory] = { ...(newSettings.usage_settings[category] as any)[subCategory], [key]: value };
            } else {
                (newSettings.usage_settings[category] as any) = { ...(newSettings.usage_settings[category] as any), [key]: value };
            }
            return newSettings;
        });
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500 font-bold animate-pulse">Loading system settings...</div>;
    }

    const renderTierForm = (tierId: 'free' | 'basic' | 'premium', title: string) => {
        const tier = appSettings.usage_settings?.tiers?.[tierId] || {} as TierConfig;
        return (
            <div className="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 mb-6">
                <h4 className="font-bold text-slate-900 dark:text-white capitalize flex items-center gap-2">
                    <i className="bi bi-layers text-amber-500"></i> {title} Plan
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Display Name</label>
                        <input type="text" value={tier.display_name || ''} onChange={e => updateUsageSetting('tiers', 'display_name', e.target.value, tierId)} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Price (NGN)</label>
                        <input type="number" value={tier.price_ngn || 0} onChange={e => updateUsageSetting('tiers', 'price_ngn', Number(e.target.value), tierId)} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Description</label>
                        <input type="text" value={tier.description || ''} onChange={e => updateUsageSetting('tiers', 'description', e.target.value, tierId)} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Credit Allocation</label>
                        <input type="number" value={tier.credit_allocation || 0} onChange={e => updateUsageSetting('tiers', 'credit_allocation', Number(e.target.value), tierId)} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Max Saved Courses</label>
                        <input type="number" value={tier.max_saved_courses || 0} onChange={e => updateUsageSetting('tiers', 'max_saved_courses', Number(e.target.value), tierId)} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Badge Color</label>
                        <select value={tier.badge_color || 'none'} onChange={e => updateUsageSetting('tiers', 'badge_color', e.target.value, tierId)} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm">
                            <option value="none">None</option>
                            <option value="blue">Blue</option>
                            <option value="purple">Purple</option>
                            <option value="gold">Gold</option>
                        </select>
                    </div>
                    <div className="space-y-1 flex items-center pt-5">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={tier.has_verification_badge || false} onChange={e => updateUsageSetting('tiers', 'has_verification_badge', e.target.checked, tierId)} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer" />
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Has Verification Badge</span>
                        </label>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8 text-slate-900 dark:text-slate-100">
            <div className="flex flex-wrap gap-4 border-b border-slate-200 dark:border-slate-800">
                <button 
                    onClick={() => setActiveTab('general')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${activeTab === 'general' ? 'border-amber-500 text-slate-900 dark:text-white font-black' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <i className="bi bi-gear-fill"></i>
                    <span>General Platform</span>
                </button>
                <button 
                    onClick={() => setActiveTab('plans')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${activeTab === 'plans' ? 'border-amber-500 text-slate-900 dark:text-white font-black' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <i className="bi bi-credit-card-fill"></i>
                    <span>Usage & Plans</span>
                </button>
                <button 
                    onClick={() => setActiveTab('keys')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${activeTab === 'keys' ? 'border-amber-500 text-slate-900 dark:text-white font-black' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <i className="bi bi-key-fill"></i>
                    <span>API & Secrets</span>
                </button>
                <button 
                    onClick={() => setActiveTab('email')}
                    className={`pb-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${activeTab === 'email' ? 'border-amber-500 text-slate-900 dark:text-white font-black' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <i className="bi bi-envelope-fill"></i>
                    <span>SMTP Configuration</span>
                </button>
            </div>

            {activeTab === 'general' && (
                <div className="max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-8">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1">Platform Preferences</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Manage global limits and feature toggles.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">AI Model Limit (RPM)</label>
                            <input 
                                type="number" 
                                value={appSettings.custom_user_limit_rpm || 0} 
                                onChange={e => setAppSettings({...appSettings, custom_user_limit_rpm: Number(e.target.value)})}
                                className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">AI Model Limit (TPM)</label>
                            <input 
                                type="number" 
                                value={appSettings.custom_user_limit_tpm || 0} 
                                onChange={e => setAppSettings({...appSettings, custom_user_limit_tpm: Number(e.target.value)})}
                                className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                        <label className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-hdd-fill text-amber-500 text-lg"></i>
                                <div>
                                    <p className="font-bold text-slate-900 dark:text-white">Upload Center Enabled</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Allow users to upload files.</p>
                                </div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={appSettings.upload_center_uploads_enabled || false}
                                onChange={e => setAppSettings({...appSettings, upload_center_uploads_enabled: e.target.checked})}
                                className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                            />
                        </label>

                        <label className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-shield-fill-exclamation text-amber-500 text-lg"></i>
                                <div>
                                    <p className="font-bold text-slate-900 dark:text-white">Maintenance Mode (Coming Soon)</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Locks the app for non-admins.</p>
                                </div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={appSettings.coming_soon_enabled || false}
                                onChange={e => setAppSettings({...appSettings, coming_soon_enabled: e.target.checked})}
                                className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                            />
                        </label>

                        <label className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-phone-fill text-emerald-500 text-lg"></i>
                                <div>
                                    <p className="font-bold text-slate-900 dark:text-white">Play Store Early Access Modal</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Show popup prompting users to download Android App.</p>
                                </div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={appSettings.show_playstore_modal ?? true}
                                onChange={e => setAppSettings({...appSettings, show_playstore_modal: e.target.checked})}
                                className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                            />
                        </label>

                        <label className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                            <div className="flex items-center gap-3">
                                <i className="bi bi-envelope-fill text-blue-500 text-lg"></i>
                                <div>
                                    <p className="font-bold text-slate-900 dark:text-white">Collect Emails in Play Store Modal</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Require email before redirecting (Disable for direct link).</p>
                                </div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={appSettings.playstore_modal_collect_emails ?? true}
                                onChange={e => setAppSettings({...appSettings, playstore_modal_collect_emails: e.target.checked})}
                                className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                            />
                        </label>
                    </div>

                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-6">
                        <div>
                            <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1">Support Contact Credentials</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Displayed on the Contact Us page.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Support Email</label>
                                <input 
                                    type="email" 
                                    value={appSettings.support_email || ''} 
                                    onChange={e => setAppSettings({...appSettings, support_email: e.target.value})}
                                    className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                    placeholder="support@avelut.xyz"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Support Phone</label>
                                <input 
                                    type="text" 
                                    value={appSettings.support_phone || ''} 
                                    onChange={e => setAppSettings({...appSettings, support_phone: e.target.value})}
                                    className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                    placeholder="+1 (555) 123-4567"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Support Office</label>
                                <input 
                                    type="text" 
                                    value={appSettings.support_address || ''} 
                                    onChange={e => setAppSettings({...appSettings, support_address: e.target.value})}
                                    className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                    placeholder="San Francisco, CA"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                        <button onClick={handleSaveApp} disabled={isSaving} className="px-8 py-4 bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs transition shadow-sm disabled:opacity-50 cursor-pointer">
                            {isSaving ? 'Saving...' : 'Save General Settings'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'plans' && (
                <div className="max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-8">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1">Subscriptions & Usage Settings</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Configure plans, pricing, and AI feature costs.</p>
                    </div>

                    <div className="space-y-8">
                        <div>
                            <h4 className="font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Subscription Tiers</h4>
                            {renderTierForm('free', 'Free')}
                            {renderTierForm('basic', 'Basic')}
                            {renderTierForm('premium', 'Premium')}
                        </div>

                        <div>
                            <h4 className="font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Feature Costs (Credits)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {Object.keys(appSettings.usage_settings?.feature_costs || {}).map((key) => (
                                    <div key={key} className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</label>
                                        <input type="number" value={(appSettings.usage_settings?.feature_costs as any)[key] || 0} onChange={e => updateUsageSetting('feature_costs', key, Number(e.target.value))} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Feature AI Models</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {Object.keys(appSettings.usage_settings?.feature_costs || {}).concat('title_generation').map((key) => (
                                    <div key={key} className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')} Model</label>
                                        <input type="text" placeholder="e.g. gemini-3.1-flash-lite" value={(appSettings.usage_settings?.feature_models as any)?.[key] || ''} onChange={e => updateUsageSetting('feature_models', key, e.target.value)} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Top-up & Additional Pricing</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {Object.keys(appSettings.usage_settings?.additional_prices || {}).map((key) => (
                                    <div key={key} className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</label>
                                        <input type="number" value={(appSettings.usage_settings?.additional_prices as any)[key] || 0} onChange={e => updateUsageSetting('additional_prices', key, Number(e.target.value))} className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                        <button onClick={handleSaveApp} disabled={isSaving} className="px-8 py-4 bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs transition shadow-sm disabled:opacity-50 cursor-pointer">
                            {isSaving ? 'Saving...' : 'Save Plans & Usage'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'keys' && (
                <div className="max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-8">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1">API Keys & Secrets</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Manage third-party integrations.</p>
                    </div>

                    <div className="space-y-6">
                        {/* Avelut AI */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <i className="bi bi-cpu-fill text-amber-500"></i> Avelut AI
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" placeholder="Global Primary Model (e.g. gemini-3.1-flash-lite)" value={appSettings.primary_gemini_model || ''} onChange={e => setAppSettings({...appSettings, primary_gemini_model: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                                <input type="password" placeholder="Avelut AI API Key" value={appSettings.gemini_api_key || ''} onChange={e => setAppSettings({...appSettings, gemini_api_key: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                                <input type="text" placeholder="Visual Solver Model (e.g. gemini-3.1-flash-lite)" value={appSettings.usage_settings?.feature_models?.visual_solve || ''} onChange={e => setAppSettings({...appSettings, usage_settings: { ...appSettings.usage_settings, feature_models: { ...appSettings.usage_settings?.feature_models, visual_solve: e.target.value } } as any})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm md:col-span-2" />
                            </div>
                        </div>

                        {/* Google/Firebase Auth */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <i className="bi bi-google text-rose-500"></i> Google Auth & Identity
                            </h4>
                            <div className="grid grid-cols-1 gap-4">
                                <input type="text" placeholder="Google Client ID" value={appSettings.google_client_id || ''} onChange={e => setAppSettings({...appSettings, google_client_id: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                                <input type="password" placeholder="Google API Key" value={appSettings.google_api_key || ''} onChange={e => setAppSettings({...appSettings, google_api_key: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                            </div>
                        </div>

                        {/* YouTube */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <i className="bi bi-youtube text-rose-600"></i> YouTube
                            </h4>
                            <div className="grid grid-cols-1 gap-4">
                                <input type="password" placeholder="YouTube API Key" value={appSettings.youtube_api_key || ''} onChange={e => setAppSettings({...appSettings, youtube_api_key: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                            </div>
                        </div>

                        {/* Paystack */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <i className="bi bi-credit-card text-emerald-500"></i> Paystack
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" placeholder="Public Key" value={appSettings.paystack_public_key || ''} onChange={e => setAppSettings({...appSettings, paystack_public_key: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                            </div>
                        </div>

                        {/* RevenueCat */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <i className="bi bi-phone-fill text-amber-500"></i> RevenueCat (Android IAP)
                            </h4>
                            <div className="grid grid-cols-1 gap-4">
                                <input type="text" placeholder="RevenueCat Android API Key" value={appSettings.revenuecat_api_key_android || ''} onChange={e => setAppSettings({...appSettings, revenuecat_api_key_android: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                            </div>
                        </div>

                        {/* Pinecone */}
                        <div className="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <i className="bi bi-database-fill text-amber-500"></i> Pinecone Vector DB
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input type="text" placeholder="Index Name" value={appSettings.pinecone_index_name || ''} onChange={e => setAppSettings({...appSettings, pinecone_index_name: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                                <input type="password" placeholder="Pinecone API Key" value={appSettings.pinecone_api_key || ''} onChange={e => setAppSettings({...appSettings, pinecone_api_key: e.target.value})} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none focus:border-amber-500 text-sm" />
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                        <button onClick={handleSaveApp} disabled={isSaving} className="px-8 py-4 bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs transition shadow-sm disabled:opacity-50 cursor-pointer">
                            {isSaving ? 'Saving...' : 'Save Keys'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'email' && (
                <div className="max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-8">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1">SMTP Configuration</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Configure outbound email server for systemic broadcasts.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <input type="text" placeholder="SMTP Host (e.g. smtp.gmail.com)" value={emailConfig.host || ''} onChange={e => setEmailConfig({...emailConfig, host: e.target.value})} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-amber-500 transition-all text-sm" />
                        <input type="number" placeholder="SMTP Port (e.g. 465)" value={emailConfig.port || ''} onChange={e => setEmailConfig({...emailConfig, port: Number(e.target.value)})} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-amber-500 transition-all text-sm" />
                        <input type="text" placeholder="Username / Email" value={emailConfig.user || ''} onChange={e => setEmailConfig({...emailConfig, user: e.target.value})} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-amber-500 transition-all text-sm" />
                        <input type="password" placeholder="App Password" value={emailConfig.pass || ''} onChange={e => setEmailConfig({...emailConfig, pass: e.target.value})} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-amber-500 transition-all text-sm" />
                        <input type="text" placeholder="Sender Name (e.g. Avelut Support)" value={emailConfig.from_name || ''} onChange={e => setEmailConfig({...emailConfig, from_name: e.target.value})} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-amber-500 transition-all text-sm" />
                        <input type="email" placeholder="Sender Email" value={emailConfig.from_email || ''} onChange={e => setEmailConfig({...emailConfig, from_email: e.target.value})} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-amber-500 transition-all text-sm" />
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={emailConfig.secure || false} onChange={e => setEmailConfig({...emailConfig, secure: e.target.checked})} className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500" />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Use Secure Connection (SSL/TLS for Port 465)</span>
                    </label>

                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex gap-4 justify-end">
                        <button onClick={handleTestEmail} disabled={isSaving} className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50 cursor-pointer">
                            Test SMTP
                        </button>
                        <button onClick={handleSaveEmail} disabled={isSaving} className="px-8 py-4 bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs transition shadow-sm disabled:opacity-50 cursor-pointer">
                            {isSaving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
