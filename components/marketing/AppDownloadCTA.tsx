import { db, onValue, ref } from '@/lib/backend';
import React, { useEffect, useState } from 'react';

export const AppDownloadCTA: React.FC = () => {
    const [downloadUrl, setDownloadUrl] = useState<string>('');
    const [versionName, setVersionName] = useState<string>('');

    useEffect(() => {
        const updatesRef = ref(db, 'app_updates/latest');
        const unsubscribe = onValue(updatesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.downloadUrl) {
                    setDownloadUrl(data.downloadUrl);
                }
                if (data.versionName) {
                    setVersionName(data.versionName);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    const handleDownload = () => {
        if (!downloadUrl) return;
        window.open(downloadUrl, '_blank');
    };

    return (
        <section className="py-24 px-6 relative max-w-5xl mx-auto">
            <div className="bg-slate-900 rounded-[40px] p-12 md:p-20 relative overflow-hidden shadow-2xl flex flex-col items-center justify-center gap-8 border border-slate-800 text-center">

                <div className="relative z-10 flex flex-col items-center">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-amber-400 text-xs font-bold uppercase tracking-wider mb-6 shadow-sm">
                        <i className="bi bi-phone text-sm"></i>
                        <span>Native Android App</span>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-6">
                        Take your tutor everywhere.
                    </h2>
                    <p className="text-lg text-slate-300 font-medium mb-10 max-w-xl mx-auto leading-relaxed">
                        Experience lightning-fast native performance, offline access, and instant camera scanning. 
                        Currently in exclusive early access and not yet available on the Play Store.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-5 justify-center">
                        <button 
                            onClick={handleDownload}
                            disabled={!downloadUrl}
                            className={`flex items-center justify-center gap-3 px-10 py-5 rounded-2xl font-bold text-lg transition ${downloadUrl ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 hover:-translate-y-0.5 cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                        >
                            <i className="bi bi-download text-xl font-bold"></i>
                            {downloadUrl ? `Download APK${versionName ? ` (v${versionName})` : ''}` : 'App Coming Soon'}
                        </button>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm font-medium mt-6">
                        <i className="bi bi-shield-check text-emerald-400 text-base"></i>
                        <span>Verified Safe & Secure directly from Avelut</span>
                    </div>
                </div>
            </div>
        </section>
    );
};
