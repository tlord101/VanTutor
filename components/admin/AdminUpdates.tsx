import React, { useState, useRef, useEffect } from 'react';
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
        <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8 animate-fade-in text-slate-900 dark:text-slate-100">
            <div>
                <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                    <i className="bi bi-phone-fill text-amber-500"></i>
                    <span>App Updates</span>
                </h1>
                <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 max-w-2xl">Publish new versions of the AVELUT app directly to your users. When you upload a new version here with a higher Version Code, users will be prompted to update.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Section */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[32px] p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h2 className="text-xl font-black mb-6 flex items-center gap-2">
                        <i className="bi bi-cloud-arrow-up-fill text-amber-500"></i>
                        <span>Publish New Release</span>
                    </h2>
                    
                    <form onSubmit={handlePublish} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Version Code (Number)</label>
                                <input 
                                    type="number" 
                                    value={versionCode}
                                    onChange={(e) => setVersionCode(e.target.value)}
                                    placeholder="e.g. 64"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
                                />
                                <p className="text-[10px] text-slate-400 mt-1.5 font-semibold">Must be exactly +1 from the previous release.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Version Name</label>
                                <input 
                                    type="text" 
                                    value={versionName}
                                    onChange={(e) => setVersionName(e.target.value)}
                                    placeholder="e.g. 4.17.0"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
                                />
                                <p className="text-[10px] text-slate-400 mt-1.5 font-semibold">The user-facing version name.</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Release Notes</label>
                            <textarea 
                                value={releaseNotes}
                                onChange={(e) => setReleaseNotes(e.target.value)}
                                placeholder="What's new in this version?"
                                rows={4}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">APK File</label>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition ${file ? 'border-amber-400 bg-amber-50/20' : 'border-slate-300 dark:border-slate-700 hover:border-amber-400 bg-slate-50 dark:bg-slate-800/50'}`}
                            >
                                <input 
                                    type="file" 
                                    accept=".apk"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                />
                                <i className={`bi bi-cloud-arrow-up text-4xl mb-2 ${file ? 'text-amber-500' : 'text-slate-400'}`}></i>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{file ? file.name : 'Click to select APK file'}</p>
                                <p className="text-xs text-slate-500 mt-1">{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'Upload your app-debug.apk file here'}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4 rounded-xl">
                            <input 
                                type="checkbox" 
                                id="mandatory"
                                checked={isMandatory}
                                onChange={(e) => setIsMandatory(e.target.checked)}
                                className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                            />
                            <label htmlFor="mandatory" className="text-sm font-bold text-amber-950 dark:text-amber-200 cursor-pointer">
                                Force Update (Mandatory)
                                <p className="text-xs text-amber-800/70 dark:text-amber-400/70 mt-0.5 font-medium">If checked, users cannot skip the update.</p>
                            </label>
                        </div>

                        <button 
                            type="submit"
                            disabled={isUploading}
                            className="w-full bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold py-4 rounded-xl shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {isUploading ? (
                                <>
                                    <i className="bi bi-arrow-repeat animate-spin text-lg"></i>
                                    <span>Uploading... {Math.round(uploadProgress)}%</span>
                                </>
                            ) : (
                                <span>Publish Update</span>
                            )}
                        </button>
                    </form>
                </div>

                {/* Current Live Version Section */}
                <div className="space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 sm:p-8 text-white shadow-xl">
                        <div className="flex items-center gap-3 mb-6 opacity-80">
                            <i className="bi bi-phone-fill text-amber-400 text-lg"></i>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Live in Production</h3>
                        </div>
                        
                        {currentUpdate ? (
                            <div>
                                <div className="flex items-baseline gap-2 mb-2">
                                    <span className="text-4xl font-black tracking-tight text-white">v{currentUpdate.versionName}</span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 bg-slate-800 text-amber-400 border border-slate-700 px-3 py-1 rounded-full text-xs font-bold mb-6">
                                    <i className="bi bi-check2-circle text-xs"></i>
                                    <span>Code: {currentUpdate.versionCode}</span>
                                </div>
                                
                                <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700">
                                    <p className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">Release Notes</p>
                                    <p className="text-sm font-medium leading-relaxed opacity-90 text-slate-300">{currentUpdate.releaseNotes}</p>
                                </div>

                                <div className="mt-4 flex items-center gap-2 text-xs font-bold">
                                    <div className={`w-2 h-2 rounded-full ${currentUpdate.isMandatory ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                    <span className="text-slate-300">{currentUpdate.isMandatory ? 'MANDATORY UPDATE' : 'OPTIONAL UPDATE'}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <i className="bi bi-exclamation-circle text-4xl mb-3 opacity-50 block"></i>
                                <p className="font-bold">No updates published yet</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex gap-3">
                        <i className="bi bi-info-circle text-amber-500 text-lg shrink-0"></i>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="block text-slate-900 dark:text-white mb-1">How this works:</strong>
                            When you publish a new version here, the client app will detect the higher Version Code on launch and automatically present the "Upgrade Now" screen. The APK will be downloaded seamlessly in the background and opened via the Android package installer.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
