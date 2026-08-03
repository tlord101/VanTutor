import React, { useEffect, useState } from 'react';
import { db, auth } from '../../../firebase';
import { ref as dbRef, get, set } from 'firebase/database';
import { GoogleGenAI, Type } from '@google/genai';
import { useToast } from '../../../hooks/useToast';
import { useAppSettings } from '../../../hooks/useAppSettings';
import { RefreshCw, Save, Smartphone, Sparkles } from 'lucide-react';

const PLAYSTORE_UPDATE_PATH = 'app_updates/playstore/latest';
const PLAYSTORE_PACKAGE_ID = 'com.avelut.app';

interface PlayStoreUpdateConfig {
    versionCode: number;
    versionName?: string;
    title?: string;
    message?: string;
    mandatory?: boolean;
    packageId?: string;
    updatedAt?: number;
    updatedBy?: string;
}

export const AppVersionUpdateView: React.FC = () => {
    const { addToast } = useToast();
    const { settings: appSettings } = useAppSettings();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentConfig, setCurrentConfig] = useState<PlayStoreUpdateConfig | null>(null);

    const [versionCode, setVersionCode] = useState('');
    const [versionName, setVersionName] = useState('');
    const [title, setTitle] = useState('App Update Available');
    const [message, setMessage] = useState('A new version of AVELUT is available. Update now for the latest fixes and features.');
    const [mandatory, setMandatory] = useState(false);
    const ai = appSettings.gemini_api_key ? new GoogleGenAI({ apiKey: appSettings.gemini_api_key }) : null;

    const loadConfig = async () => {
        setIsLoading(true);
        try {
            const snapshot = await get(dbRef(db, PLAYSTORE_UPDATE_PATH));
            if (!snapshot.exists()) {
                setCurrentConfig(null);
                return;
            }

            const data = snapshot.val() as PlayStoreUpdateConfig;
            setCurrentConfig(data);
            setVersionCode(data.versionCode ? String(data.versionCode) : '');
            setVersionName(data.versionName || '');
            setTitle(data.title || 'App Update Available');
            setMessage(data.message || 'A new version of AVELUT is available. Update now for the latest fixes and features.');
            setMandatory(Boolean(data.mandatory));
        } catch (error: any) {
            console.error('Failed to load Play Store update config:', error);
            addToast(error?.message || 'Failed to load update config.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleGenerateCopy = async () => {
        if (!ai) {
            addToast('Gemini API key is not configured in App Settings.', 'error');
            return;
        }

        if (!versionCode.trim()) {
            addToast('Set version code first, then generate update copy.', 'error');
            return;
        }

        const parsedVersionCode = parseInt(versionCode.trim(), 10);
        if (Number.isNaN(parsedVersionCode) || parsedVersionCode <= 0) {
            addToast('Version code must be a valid positive number.', 'error');
            return;
        }

        setIsGenerating(true);
        try {
            const prompt = `You are writing in-app update prompt copy for AVELUT.
Return concise JSON for an Android update modal.

Inputs:
- version_code: ${parsedVersionCode}
- current_version_name_input: ${versionName.trim() || 'not provided'}
- mandatory_update: ${mandatory ? 'yes' : 'no'}

Rules:
- Keep title under 8 words.
- Keep message under 180 characters.
- Message must be clear, reassuring, and action-oriented.
- Include a version_name suggestion (semver-like, e.g. 4.18.0).

Return only JSON with keys: title, message, version_name.`;

            const response = await ai.models.generateContent({
                model: appSettings.primary_gemini_model,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            message: { type: Type.STRING },
                            version_name: { type: Type.STRING },
                        },
                        required: ['title', 'message', 'version_name'],
                    },
                },
            });

            const responseText = (response as any).text || '';
            if (!responseText) {
                throw new Error('AI returned empty update copy.');
            }

            const data = JSON.parse(responseText);
            const generatedTitle = (data.title || '').toString().trim();
            const generatedMessage = (data.message || '').toString().trim();
            const generatedVersionName = (data.version_name || '').toString().trim();

            if (!generatedTitle || !generatedMessage) {
                throw new Error('AI response did not contain valid title and message.');
            }

            setTitle(generatedTitle);
            setMessage(generatedMessage);
            if (generatedVersionName) {
                setVersionName(generatedVersionName);
            }
            addToast('Update copy generated successfully.', 'success');
        } catch (error: any) {
            console.error('Failed to generate update copy:', error);
            addToast(error?.message || 'Failed to generate update copy.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        const parsedVersionCode = parseInt(versionCode.trim(), 10);
        if (Number.isNaN(parsedVersionCode) || parsedVersionCode <= 0) {
            addToast('Version code must be a valid positive number.', 'error');
            return;
        }

        if (!title.trim() || !message.trim()) {
            addToast('Please provide both update title and message.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const payload: PlayStoreUpdateConfig = {
                versionCode: parsedVersionCode,
                versionName: versionName.trim(),
                title: title.trim(),
                message: message.trim(),
                mandatory,
                packageId: PLAYSTORE_PACKAGE_ID,
                updatedAt: Date.now(),
                updatedBy: auth.currentUser?.email || 'admin',
            };

            await set(dbRef(db, PLAYSTORE_UPDATE_PATH), payload);
            setCurrentConfig(payload);
            addToast('Play Store update settings saved.', 'success');
        } catch (error: any) {
            console.error('Failed to save update config:', error);
            addToast(error?.message || 'Failed to save update config.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h3 className="font-black text-2xl dark:text-white flex items-center gap-2">
                            <Smartphone className="w-6 h-6 text-sky-600" />
                            Play Store Update Control
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                            Set the minimum version code in Firebase. The app checks this every time it opens.
                        </p>
                    </div>
                    <button
                        onClick={() => void loadConfig()}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                <form onSubmit={handleSave} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Version Code</label>
                            <input
                                type="number"
                                min={1}
                                value={versionCode}
                                onChange={(e) => setVersionCode(e.target.value)}
                                placeholder="e.g. 106"
                                className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-sky-500 bg-white"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">If this is higher than the device version code, users will get the update prompt.</p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Version Name (Optional)</label>
                            <input
                                type="text"
                                value={versionName}
                                onChange={(e) => setVersionName(e.target.value)}
                                placeholder="e.g. 4.18.0"
                                className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-sky-500 bg-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between gap-3">
                            <span>Prompt Title</span>
                            <button
                                type="button"
                                onClick={() => void handleGenerateCopy()}
                                disabled={isGenerating || isSaving || isLoading || !ai}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-black uppercase tracking-wider hover:bg-indigo-100 transition disabled:opacity-50"
                                title={!ai ? 'Configure Gemini API key in App Settings first' : 'Generate update title/message with AI'}
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                {isGenerating ? 'Generating...' : 'AI Generate'}
                            </button>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-sky-500 bg-white"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Prompt Message</label>
                        <textarea
                            rows={3}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-sky-500 bg-white resize-none"
                        />
                    </div>

                    <label className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
                        <input
                            type="checkbox"
                            checked={mandatory}
                            onChange={(e) => setMandatory(e.target.checked)}
                            className="mt-0.5 w-4 h-4"
                        />
                        <span className="text-sm text-amber-900 font-semibold">
                            Force update (hide Skip button)
                        </span>
                    </label>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Play Store Target</p>
                        <p className="text-sm font-semibold text-slate-700 mt-1">com.avelut.app</p>
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving || isLoading}
                        className="w-full py-3.5 rounded-xl bg-sky-600 text-white font-black uppercase tracking-widest text-xs hover:bg-sky-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving...' : 'Save Update Version'}
                    </button>
                </form>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h4 className="font-black text-sm uppercase tracking-widest text-slate-500 mb-2">Current Live Config</h4>
                {currentConfig ? (
                    <div className="space-y-1 text-sm text-slate-700">
                        <p><strong>Version code:</strong> {currentConfig.versionCode}</p>
                        <p><strong>Version name:</strong> {currentConfig.versionName || 'Not set'}</p>
                        <p><strong>Mandatory:</strong> {currentConfig.mandatory ? 'Yes' : 'No'}</p>
                        <p><strong>Updated by:</strong> {currentConfig.updatedBy || 'Unknown'}</p>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">No Play Store update config found yet.</p>
                )}
            </div>
        </div>
    );
};
