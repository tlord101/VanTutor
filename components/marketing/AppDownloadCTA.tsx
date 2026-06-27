import React, { useEffect, useState } from 'react';
import { Smartphone, Download, ShieldCheck } from 'lucide-react';
import { db } from '../../firebase';
import { ref, onValue } from 'firebase/database';

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
                
                {/* Decorative Background Elements */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-500/20 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none translate-y-1/2 -translate-x-1/3" />

                <div className="relative z-10 flex flex-col items-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-brand-400 text-xs font-bold uppercase tracking-wider mb-6 shadow-sm">
                        <Smartphone className="w-3.5 h-3.5" />
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
                            className={`flex items-center justify-center gap-3 px-10 py-5 rounded-2xl font-bold text-lg transition ${downloadUrl ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/25 hover:-translate-y-1' : 'bg-slate-800 text-slate-500 dark:text-gray-400 cursor-not-allowed'}`}
                        >
                            <Download className="w-6 h-6" />
                            {downloadUrl ? `Download APK${versionName ? ` (v${versionName})` : ''}` : 'App Coming Soon'}
                        </button>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm font-medium mt-6">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Verified Safe & Secure directly from Avelut</span>
                    </div>
                </div>
            </div>
        </section>
    );
};
