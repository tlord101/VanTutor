import React, { useState, useEffect } from 'react';
import { Globe as Github, Cloud, ShieldAlert, Key, Play, AlertCircle, Loader2, CheckCircle2, Save, Smartphone, Code } from 'lucide-react';
import { db } from '../../../firebase';
import { ref, set, onValue } from 'firebase/database';
import { useToast } from '../../../hooks/useToast';

interface GithubSettings {
    pat: string;
    owner: string;
    repo: string;
}

export const GitHubIntegrationView: React.FC = () => {
    const [settings, setSettings] = useState<GithubSettings>({ pat: '', owner: '', repo: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    
    // GitHub API State
    const [workflowRuns, setWorkflowRuns] = useState<any[]>([]);
    const [isLoadingRuns, setIsLoadingRuns] = useState(false);
    const [isTriggering, setIsTriggering] = useState<string | null>(null);

    const { addToast } = useToast();

    useEffect(() => {
        const settingsRef = ref(db, 'system_settings/github_integration');
        const unsubscribe = onValue(settingsRef, (snapshot) => {
            if (snapshot.exists()) {
                setSettings(snapshot.val());
            }
            setIsLoaded(true);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (settings.pat && settings.owner && settings.repo) {
            fetchWorkflowRuns();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings.pat, settings.owner, settings.repo]);

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await set(ref(db, 'system_settings/github_integration'), settings);
            addToast('GitHub settings saved successfully', 'success');
            fetchWorkflowRuns();
        } catch (error: any) {
            console.error('Failed to save settings:', error);
            addToast('Failed to save settings: ' + error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const fetchWorkflowRuns = async () => {
        if (!settings.pat || !settings.owner || !settings.repo) return;
        setIsLoadingRuns(true);
        try {
            const response = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}/actions/runs?per_page=5`, {
                headers: {
                    'Authorization': `token ${settings.pat}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (response.ok) {
                const data = await response.json();
                setWorkflowRuns(data.workflow_runs || []);
            } else {
                console.warn('Failed to fetch runs', response.status);
            }
        } catch (error) {
            console.error('Error fetching workflow runs', error);
        } finally {
            setIsLoadingRuns(false);
        }
    };

    const triggerWorkflow = async (workflowId: string, inputs: any = {}, actionName: string) => {
        if (!settings.pat || !settings.owner || !settings.repo) {
            addToast('Please save GitHub settings first.', 'error');
            return;
        }

        setIsTriggering(actionName);
        try {
            const response = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}/actions/workflows/${workflowId}/dispatches`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${settings.pat}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ref: 'main', // Assuming main branch
                    inputs: inputs
                })
            });

            if (response.ok || response.status === 204) {
                addToast(`${actionName} triggered successfully. Check below for progress in a few seconds.`, 'success');
                setTimeout(fetchWorkflowRuns, 5000); // Fetch after a short delay
            } else {
                const errText = await response.text();
                addToast(`Failed to trigger ${actionName}. Make sure the workflow exists on the main branch.`, 'error');
                console.error(errText);
            }
        } catch (error: any) {
            console.error('Error triggering workflow:', error);
            addToast(`Error: ${error.message}`, 'error');
        } finally {
            setIsTriggering(null);
        }
    };

    if (!isLoaded) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-lime-500" />
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-black dark:text-white tracking-tight flex items-center gap-3">
                    <Github className="w-8 h-8" /> 
                    CI/CD & GitHub Integration
                </h1>
                <p className="text-slate-500 font-medium mt-2 max-w-2xl">
                    Connect your GitHub repository to trigger Capgo OTA updates and generate Android APKs/AABs directly from this admin panel.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Settings Form */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm">
                        <h2 className="text-xl font-black mb-6 dark:text-white flex items-center gap-2">
                            <Key className="w-5 h-5 text-slate-400" />
                            Connection Settings
                        </h2>
                        
                        <form onSubmit={handleSaveSettings} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">GitHub PAT (Token)</label>
                                <input 
                                    type="password" 
                                    value={settings.pat}
                                    onChange={(e) => setSettings({...settings, pat: e.target.value})}
                                    placeholder="ghp_..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 transition"
                                />
                                <p className="text-[10px] text-slate-400 mt-1 font-semibold">Requires 'repo' scope.</p>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Repository Owner</label>
                                <input 
                                    type="text" 
                                    value={settings.owner}
                                    onChange={(e) => setSettings({...settings, owner: e.target.value})}
                                    placeholder="e.g. acme-corp"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 transition"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Repository Name</label>
                                <input 
                                    type="text" 
                                    value={settings.repo}
                                    onChange={(e) => setSettings({...settings, repo: e.target.value})}
                                    placeholder="e.g. my-app"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 transition"
                                />
                            </div>

                            <button 
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-slate-900/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Save Settings
                            </button>
                        </form>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                        <div className="text-xs font-semibold text-amber-900 leading-relaxed">
                            <strong className="block mb-1">Security Warning</strong>
                            Your GitHub token is saved in the Firebase Realtime Database. Ensure your database rules restrict the `system_settings` path to Admins only.
                        </div>
                    </div>
                </div>

                {/* Actions and Status */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Action Triggers */}
                    <div className="bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm">
                        <h2 className="text-xl font-black mb-6 dark:text-white flex items-center gap-2">
                            <Play className="w-5 h-5 text-slate-400" />
                            Trigger Workflows
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* OTA Update */}
                            <div className="border border-slate-100 bg-slate-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-lime-200 transition">
                                <div className="w-12 h-12 bg-lime-100 text-lime-600 rounded-full flex items-center justify-center mb-4">
                                    <Cloud className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-slate-900 mb-1">Push OTA Update</h3>
                                <p className="text-xs text-slate-500 font-medium mb-5">Builds web assets and syncs to Capgo.</p>
                                <button 
                                    onClick={() => triggerWorkflow('ota-update.yml', {}, 'OTA Update')}
                                    disabled={!!isTriggering || !settings.pat}
                                    className="w-full py-2.5 bg-white border border-slate-200 hover:border-lime-500 hover:text-lime-600 font-bold rounded-xl text-sm transition disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {isTriggering === 'OTA Update' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Trigger OTA'}
                                </button>
                            </div>

                            {/* Build APK */}
                            <div className="border border-slate-100 bg-slate-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-sky-200 transition">
                                <div className="w-12 h-12 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center mb-4">
                                    <Smartphone className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-slate-900 mb-1">Build Android APK</h3>
                                <p className="text-xs text-slate-500 font-medium mb-5">Generates debug/release APK for testing.</p>
                                <button 
                                    onClick={() => triggerWorkflow('build-android.yml', { build_type: 'apk' }, 'APK Build')}
                                    disabled={!!isTriggering || !settings.pat}
                                    className="w-full py-2.5 bg-white border border-slate-200 hover:border-sky-500 hover:text-sky-600 font-bold rounded-xl text-sm transition disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {isTriggering === 'APK Build' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Trigger APK'}
                                </button>
                            </div>
                            
                            {/* Build AAB */}
                            <div className="border border-slate-100 bg-slate-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-indigo-200 transition md:col-span-2">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                                    <Code className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-slate-900 mb-1">Build Android AAB</h3>
                                <p className="text-xs text-slate-500 font-medium mb-5">Generates an App Bundle for Play Store distribution.</p>
                                <button 
                                    onClick={() => triggerWorkflow('build-android.yml', { build_type: 'aab' }, 'AAB Build')}
                                    disabled={!!isTriggering || !settings.pat}
                                    className="max-w-[200px] w-full mx-auto py-2.5 bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 font-bold rounded-xl text-sm transition disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {isTriggering === 'AAB Build' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Trigger AAB'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Recent Workflow Runs */}
                    <div className="bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-black dark:text-white flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-slate-400" />
                                Recent Action Runs
                            </h2>
                            <button onClick={fetchWorkflowRuns} disabled={isLoadingRuns || !settings.pat} className="text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-50">
                                Refresh
                            </button>
                        </div>

                        {isLoadingRuns ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                        ) : workflowRuns.length > 0 ? (
                            <div className="space-y-3">
                                {workflowRuns.map((run) => (
                                    <div key={run.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white transition">
                                        <div className="flex items-center gap-3">
                                            {run.status === 'completed' ? (
                                                run.conclusion === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />
                                            ) : (
                                                <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                                            )}
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{run.name}</p>
                                                <p className="text-[10px] font-semibold text-slate-500 uppercase">{run.status} • {run.conclusion || 'running'}</p>
                                            </div>
                                        </div>
                                        <a href={run.html_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-lime-600 hover:text-lime-700 bg-lime-50 px-3 py-1.5 rounded-lg">
                                            View logs
                                        </a>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <Github className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm font-bold text-slate-500">No recent workflow runs found.</p>
                                <p className="text-xs text-slate-400 mt-1">Make sure your workflows are configured correctly.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
