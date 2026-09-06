import { db, onValue, ref, set } from '@/lib/backend';
import React, { useState, useEffect } from 'react';
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
                    ref: 'main',
                    inputs: inputs
                })
            });

            if (response.ok || response.status === 204) {
                addToast(`${actionName} triggered successfully. Check below for progress in a few seconds.`, 'success');
                setTimeout(fetchWorkflowRuns, 5000);
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
                <i className="bi bi-arrow-repeat animate-spin text-2xl text-amber-500"></i>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8 text-slate-900 dark:text-slate-100">
            <div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                    <i className="bi bi-github text-amber-500"></i> 
                    <span>CI/CD & GitHub Integration</span>
                </h1>
                <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 max-w-2xl">
                    Connect your GitHub repository to trigger Capgo OTA updates and generate Android APKs/AABs directly from this admin panel.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Settings Form */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h2 className="text-xl font-black mb-6 text-slate-900 dark:text-white flex items-center gap-2">
                            <i className="bi bi-key-fill text-amber-500"></i>
                            <span>Connection Settings</span>
                        </h2>
                        
                        <form onSubmit={handleSaveSettings} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">GitHub PAT (Token)</label>
                                <input 
                                    type="password" 
                                    value={settings.pat}
                                    onChange={(e) => setSettings({...settings, pat: e.target.value})}
                                    placeholder="ghp_..."
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
                                />
                                <p className="text-[10px] text-slate-400 mt-1 font-semibold">Requires 'repo' scope.</p>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Repository Owner</label>
                                <input 
                                    type="text" 
                                    value={settings.owner}
                                    onChange={(e) => setSettings({...settings, owner: e.target.value})}
                                    placeholder="e.g. acme-corp"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Repository Name</label>
                                <input 
                                    type="text" 
                                    value={settings.repo}
                                    onChange={(e) => setSettings({...settings, repo: e.target.value})}
                                    placeholder="e.g. my-app"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
                                />
                            </div>

                            <button 
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold py-3.5 rounded-xl shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {isSaving ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-check-lg"></i>}
                                <span>Save Settings</span>
                            </button>
                        </form>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex gap-3 text-amber-800 dark:text-amber-300">
                        <i className="bi bi-shield-exclamation text-amber-500 text-lg shrink-0"></i>
                        <div className="text-xs font-semibold leading-relaxed">
                            <strong className="block mb-1">Security Notice</strong>
                            Your GitHub token is stored in the Realtime Database. Ensure admin-only rules protect this path.
                        </div>
                    </div>
                </div>

                {/* Actions and Status */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Action Triggers */}
                    <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h2 className="text-xl font-black mb-6 text-slate-900 dark:text-white flex items-center gap-2">
                            <i className="bi bi-play-circle-fill text-amber-500"></i>
                            <span>Trigger Workflows</span>
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* OTA Update */}
                            <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-amber-500/40 transition">
                                <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-4">
                                    <i className="bi bi-cloud-arrow-up-fill text-xl"></i>
                                </div>
                                <h3 className="font-bold text-slate-900 dark:text-white mb-1">Push OTA Update</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-5">Builds web assets and syncs to Capgo.</p>
                                <button 
                                    onClick={() => triggerWorkflow('ota-update.yml', {}, 'OTA Update')}
                                    disabled={!!isTriggering || !settings.pat}
                                    className="w-full py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-amber-500 hover:text-amber-500 font-bold rounded-xl text-sm transition disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer"
                                >
                                    {isTriggering === 'OTA Update' ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-play-fill"></i>}
                                    <span>Trigger OTA</span>
                                </button>
                            </div>

                            {/* Build APK */}
                            <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-amber-500/40 transition">
                                <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-4">
                                    <i className="bi bi-phone-fill text-xl"></i>
                                </div>
                                <h3 className="font-bold text-slate-900 dark:text-white mb-1">Build Android APK</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-5">Generates debug/release APK for testing.</p>
                                <button 
                                    onClick={() => triggerWorkflow('build-android.yml', { build_type: 'apk' }, 'APK Build')}
                                    disabled={!!isTriggering || !settings.pat}
                                    className="w-full py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-amber-500 hover:text-amber-500 font-bold rounded-xl text-sm transition disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer"
                                >
                                    {isTriggering === 'APK Build' ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-play-fill"></i>}
                                    <span>Trigger APK</span>
                                </button>
                            </div>
                            
                            {/* Build AAB */}
                            <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-amber-500/40 transition md:col-span-2">
                                <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-4">
                                    <i className="bi bi-code-slash text-xl"></i>
                                </div>
                                <h3 className="font-bold text-slate-900 dark:text-white mb-1">Build Android AAB</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-5">Generates an App Bundle for Play Store distribution.</p>
                                <button 
                                    onClick={() => triggerWorkflow('build-android.yml', { build_type: 'aab' }, 'AAB Build')}
                                    disabled={!!isTriggering || !settings.pat}
                                    className="max-w-[200px] w-full mx-auto py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-amber-500 hover:text-amber-500 font-bold rounded-xl text-sm transition disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer"
                                >
                                    {isTriggering === 'AAB Build' ? <i className="bi bi-arrow-repeat animate-spin"></i> : <i className="bi bi-play-fill"></i>}
                                    <span>Trigger AAB</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Recent Workflow Runs */}
                    <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <i className="bi bi-activity text-amber-500"></i>
                                <span>Recent Action Runs</span>
                            </h2>
                            <button onClick={fetchWorkflowRuns} disabled={isLoadingRuns || !settings.pat} className="text-xs font-bold text-slate-500 hover:text-amber-500 disabled:opacity-50 cursor-pointer">
                                Refresh
                            </button>
                        </div>

                        {isLoadingRuns ? (
                            <div className="flex justify-center py-8"><i className="bi bi-arrow-repeat animate-spin text-2xl text-slate-400"></i></div>
                        ) : workflowRuns.length > 0 ? (
                            <div className="space-y-3">
                                {workflowRuns.map((run) => (
                                    <div key={run.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 transition">
                                        <div className="flex items-center gap-3">
                                            {run.status === 'completed' ? (
                                                run.conclusion === 'success' ? <i className="bi bi-check-circle-fill text-emerald-500 text-lg"></i> : <i className="bi bi-x-circle-fill text-rose-500 text-lg"></i>
                                            ) : (
                                                <i className="bi bi-arrow-repeat animate-spin text-amber-500 text-lg"></i>
                                            )}
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">{run.name}</p>
                                                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{run.status} • {run.conclusion || 'running'}</p>
                                            </div>
                                        </div>
                                        <a href={run.html_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-lg">
                                            View logs
                                        </a>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                                <i className="bi bi-github text-4xl text-slate-300 dark:text-slate-700 mx-auto mb-2 block"></i>
                                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No recent workflow runs found.</p>
                                <p className="text-xs text-slate-400 mt-1">Make sure your workflows are configured correctly.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
