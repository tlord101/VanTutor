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
        <section className="py-24 px-6 relative max-w-7xl mx-auto">
            <div className="bg-slate-900 rounded-[40px] p-8 md:p-16 relative overflow-hidden shadow-2xl flex flex-col md:flex-row items-center justify-between gap-12 border border-slate-800">
                
                {/* Decorative Background Elements */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-500/20 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none translate-y-1/2 -translate-x-1/3" />

                <div className="flex-1 relative z-10 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-brand-400 text-xs font-bold uppercase tracking-wider mb-6 shadow-sm">
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Native Android App</span>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4">
                        Take your tutor everywhere.
                    </h2>
                    <p className="text-lg text-slate-300 font-medium mb-8 max-w-xl mx-auto md:mx-0 leading-relaxed">
                        Experience lightning-fast native performance, offline access, and instant camera scanning. 
                        Currently in exclusive early access and not yet available on the Play Store.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
                        <button 
                            onClick={handleDownload}
                            disabled={!downloadUrl}
                            className={`flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-lg transition ${downloadUrl ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/25 hover:-translate-y-0.5' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                        >
                            <Download className="w-5 h-5" />
                            {downloadUrl ? `Download APK${versionName ? ` (v${versionName})` : ''}` : 'App Coming Soon'}
                        </button>
                        <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Verified Safe & Secure</span>
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-auto relative z-10 flex justify-center perspective-[1000px]">
                    {/* 3D Phone Mockup Representation */}
                    <div className="relative w-[280px] h-[580px] bg-slate-950 rounded-[50px] border-[10px] border-slate-800 shadow-2xl flex items-center justify-center overflow-hidden transform rotate-y-[-15deg] rotate-x-[5deg]">
                        <div className="absolute top-0 w-36 h-7 bg-slate-800 rounded-b-3xl z-20" /> {/* Dynamic Island / Notch */}
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-900 to-slate-900 opacity-90" />
                        
                        {/* App UI Wireframe */}
                        <div className="absolute inset-0 flex flex-col p-6 pt-16 gap-4 z-10">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                                    <img src="/logo.png" alt="Avelut" className="w-6 h-6 object-contain" />
                                </div>
                                <div className="w-10 h-10 bg-slate-800 rounded-full" />
                            </div>
                            
                            {/* Chat bubbles */}
                            <div className="self-end bg-brand-500 text-white text-xs font-medium p-3 rounded-2xl rounded-tr-sm w-3/4 shadow-sm">
                                Explain the central dogma of molecular biology simply.
                            </div>
                            <div className="self-start bg-slate-800 text-slate-200 text-xs font-medium p-3 rounded-2xl rounded-tl-sm w-[85%] shadow-sm leading-relaxed mt-2">
                                Sure! The central dogma explains how DNA is used to make proteins. First, DNA is copied into RNA (transcription), and then RNA is read to build proteins (translation).
                            </div>
                            
                            {/* Input box */}
                            <div className="absolute bottom-6 left-6 right-6 bg-slate-800 rounded-full h-12 border border-slate-700 flex items-center px-4">
                                <div className="h-4 w-1/2 bg-slate-700 rounded-full" />
                            </div>
                        </div>

                        {/* Glass reflection */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
                    </div>
                </div>

            </div>
        </section>
    );
};
