import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, Smartphone, Info, Loader2 } from 'lucide-react';
import { db, storage } from '../../firebase';
import { ref, set, get, onValue } from 'firebase/database';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useToast } from '../../hooks/useToast';

export const AdminUpdates: React.FC = () => {
    const [versionCode, setVersionCode] = useState<string>('');
    const [versionName, setVersionName] = useState<string>('');
    const [releaseNotes, setReleaseNotes] = useState<string>('');
    const [isMandatory, setIsMandatory] = useState<boolean>(true);
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentUpdate, setCurrentUpdate] = useState<any>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { addToast } = useToast();

    useEffect(() => {
        const updatesRef = ref(db, 'app_updates/latest');
        const unsubscribe = onValue(updatesRef, (snapshot) => {
            if (snapshot.exists()) {
                setCurrentUpdate(snapshot.val());
            }
        });
        return () => unsubscribe();
    }, []);

    const handlePublish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!versionCode || !versionName || !releaseNotes) {
            addToast('Please fill out all fields', 'error');
            return;
        }

        const vCodeNum = parseInt(versionCode, 10);
        if (isNaN(vCodeNum)) {
            addToast('Version Code must be a number', 'error');
            return;
        }

        try {
            setIsUploading(true);
            let downloadUrl = currentUpdate?.downloadUrl || '';

            if (file) {
                if (currentUpdate && currentUpdate.versionName) {
                    try {
                        const oldApkRef = storageRef(storage, `app_updates/avelut-${currentUpdate.versionName}.apk`);
                        await deleteObject(oldApkRef);
                    } catch (deleteError) {
                        console.warn('Could not delete previous APK, it may not exist:', deleteError);
                    }
                }

                const apkRef = storageRef(storage, `app_updates/avelut-${versionName}.apk`);
                const uploadTask = uploadBytesResumable(apkRef, file);

                await new Promise<void>((resolve, reject) => {
                    uploadTask.on(
                        'state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(progress);
                        },
                        (error) => {
                            reject(error);
                        },
                        async () => {
                            downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                            resolve();
                        }
                    );
                });
            }

            if (!downloadUrl) {
                addToast('No APK file attached and no existing download URL found.', 'error');
                setIsUploading(false);
                return;
            }

            await set(ref(db, 'app_updates/latest'), {
                versionCode: vCodeNum,
                versionName,
                releaseNotes,
                downloadUrl,
                isMandatory,
                publishedAt: Date.now()
            });

            addToast('Update published successfully!', 'success');
            setFile(null);
            setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error: any) {
            console.error('Failed to publish update:', error);
            addToast('Failed to publish: ' + error.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">App Updates</h1>
                <p className="text-slate-500 dark:text-gray-400 font-medium mt-2 max-w-2xl">Publish new versions of the AVELUT app directly to your users. When you upload a new version here with a higher Version Code, users will be prompted to update.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Section */}
                <div className="lg:col-span-2 bg-white dark:bg-black rounded-[32px] p-8 border border-slate-200 dark:border-white/10 shadow-sm">
                    <h2 className="text-xl font-black mb-6 text-slate-800">Publish New Release</h2>
                    
                    <form onSubmit={handlePublish} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-2">Version Code (Number)</label>
                                <input 
                                    type="number" 
                                    value={versionCode}
                                    onChange={(e) => setVersionCode(e.target.value)}
                                    placeholder="e.g. 64"
                                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                                />
                                <p className="text-[10px] text-slate-400 mt-1.5 font-semibold">Must be exactly +1 from the previous release.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-2">Version Name</label>
                                <input 
                                    type="text" 
                                    value={versionName}
                                    onChange={(e) => setVersionName(e.target.value)}
                                    placeholder="e.g. 4.17.0"
                                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                                />
                                <p className="text-[10px] text-slate-400 mt-1.5 font-semibold">The user-facing version name.</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-2">Release Notes</label>
                            <textarea 
                                value={releaseNotes}
                                onChange={(e) => setReleaseNotes(e.target.value)}
                                placeholder="What's new in this version?"
                                rows={4}
                                className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-2">APK File</label>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition ${file ? 'border-sky-400 bg-sky-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50 dark:bg-black hover:bg-slate-100'}`}
                            >
                                <input 
                                    type="file" 
                                    accept=".apk"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                />
                                <UploadCloud className={`w-10 h-10 mb-3 ${file ? 'text-sky-500' : 'text-slate-400'}`} />
                                <p className="text-sm font-bold text-slate-700">{file ? file.name : 'Click to select APK file'}</p>
                                <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'Upload your app-debug.apk file here'}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl">
                            <input 
                                type="checkbox" 
                                id="mandatory"
                                checked={isMandatory}
                                onChange={(e) => setIsMandatory(e.target.checked)}
                                className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500/20"
                            />
                            <label htmlFor="mandatory" className="text-sm font-bold text-amber-900 cursor-pointer">
                                Force Update (Mandatory)
                                <p className="text-xs text-amber-700/70 mt-0.5 font-medium">If checked, users cannot skip the update.</p>
                            </label>
                        </div>

                        <button 
                            type="submit"
                            disabled={isUploading}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-900/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Uploading... {Math.round(uploadProgress)}%
                                </>
                            ) : (
                                'Publish Update'
                            )}
                        </button>
                    </form>
                </div>

                {/* Current Live Version Section */}
                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-sky-500 to-indigo-600 rounded-[32px] p-8 text-white shadow-xl shadow-sky-500/20">
                        <div className="flex items-center gap-3 mb-6 opacity-80">
                            <Smartphone className="w-5 h-5" />
                            <h3 className="text-sm font-bold uppercase tracking-wider">Live in Production</h3>
                        </div>
                        
                        {currentUpdate ? (
                            <div>
                                <div className="flex items-baseline gap-2 mb-2">
                                    <span className="text-4xl font-black tracking-tight">v{currentUpdate.versionName}</span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 bg-white dark:bg-black/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md mb-6">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Code: {currentUpdate.versionCode}
                                </div>
                                
                                <div className="bg-black/10 rounded-2xl p-4 backdrop-blur-sm">
                                    <p className="text-xs font-bold uppercase tracking-widest text-sky-200 mb-2">Release Notes</p>
                                    <p className="text-sm font-medium leading-relaxed opacity-90">{currentUpdate.releaseNotes}</p>
                                </div>

                                <div className="mt-4 flex items-center gap-2 text-xs font-bold">
                                    <div className={`w-2 h-2 rounded-full ${currentUpdate.isMandatory ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)]' : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'}`} />
                                    {currentUpdate.isMandatory ? 'MANDATORY UPDATE' : 'OPTIONAL UPDATE'}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p className="font-bold">No updates published yet</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-sky-50 border border-sky-100 rounded-2xl p-5 flex gap-3">
                        <Info className="w-5 h-5 text-sky-600 shrink-0" />
                        <p className="text-xs font-semibold text-sky-800 leading-relaxed">
                            <strong className="block text-sky-900 mb-1">How this works:</strong>
                            When you publish a new version here, the client app will detect the higher Version Code on launch and automatically present the "Upgrade Now" screen. The APK will be downloaded seamlessly in the background and opened via the Android package installer.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
