import React, { useState, useEffect } from 'react';
import { avelutVoice, VoiceEngineStatus } from '../services/voice/AvelutVoiceEngine';
import { ModelDownloadProgress } from '../services/voice/ModelManager';

interface AvelutVoiceDownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onReady?: () => void;
}

export const AvelutVoiceDownloadModal: React.FC<AvelutVoiceDownloadModalProps> = ({
    isOpen,
    onClose,
    onReady,
}) => {
    const [status, setStatus] = useState<VoiceEngineStatus>(() => avelutVoice.getStatus());
    const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);

    useEffect(() => {
        const unsubscribe = avelutVoice.subscribe((s) => {
            setStatus(s);
            if (s.downloadProgress) {
                setDownloadProgress(s.downloadProgress);
            }
            if (s.state === 'READY' && onReady) {
                onReady();
            }
        });
        return () => unsubscribe();
    }, [onReady]);

    if (!isOpen && status.state === 'READY') return null;
    if (!isOpen) return null;

    const handleStartDownload = async () => {
        await avelutVoice.download((progress) => {
            setDownloadProgress(progress);
        });
    };

    const isDownloading = status.state === 'DOWNLOADING';
    const isInitializing = status.state === 'INITIALIZING';
    const isReady = status.state === 'READY';
    const isError = status.state === 'ERROR';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
            <div className="bg-[#181C20] border-2 border-[#373E47] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center text-white relative">
                
                {/* Close Button (only if not actively downloading) */}
                {!isDownloading && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Close"
                    >
                        <i className="bi bi-x-lg text-sm"></i>
                    </button>
                )}

                {/* Animated Icon Header */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-5 text-amber-400 text-3xl sm:text-4xl shadow-inner relative">
                    <i className={`bi ${isReady ? 'bi-check-circle-fill text-emerald-400' : isError ? 'bi-exclamation-triangle-fill text-rose-400' : 'bi-mic-fill animate-pulse'}`}></i>
                    {isDownloading && (
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                        </span>
                    )}
                </div>

                {/* Subtitle / Header */}
                <span className="text-[11px] font-mono font-bold tracking-widest text-amber-400 uppercase mb-1">
                    Avelut StudyGuide
                </span>
                
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-2">
                    {isReady
                        ? 'Avelut Voice Ready'
                        : isDownloading
                        ? 'Downloading Avelut Voice...'
                        : isInitializing
                        ? 'Almost Ready...'
                        : isError
                        ? 'Download Failed'
                        : 'Download Avelut Voice'}
                </h3>

                {/* Description / Content Body */}
                {!isDownloading && !isInitializing && !isReady && !isError && (
                    <>
                        <p className="text-xs sm:text-sm text-slate-300 mb-5 leading-relaxed">
                            Download the Avelut Voice Engine to enable natural, real-time AI voice tutoring directly on your device.
                        </p>

                        <div className="w-full bg-[#22272E] border border-[#373E47] rounded-2xl p-3.5 mb-6 text-left flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs text-slate-300">
                                <span className="flex items-center gap-2">
                                    <i className="bi bi-hdd-network text-amber-400"></i>
                                    Model & Size:
                                </span>
                                <span className="font-mono font-bold text-white">KittenTTS Micro (~41 MB)</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-300">
                                <span className="flex items-center gap-2">
                                    <i className="bi bi-shield-check text-emerald-400"></i>
                                    Storage:
                                </span>
                                <span className="text-slate-300 font-medium">Permanent local cache on device</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-300">
                                <span className="flex items-center gap-2">
                                    <i className="bi bi-lightning-charge text-sky-400"></i>
                                    Voice Profile:
                                </span>
                                <span className="font-bold text-sky-300">Bella (1.2x Speed)</span>
                            </div>
                        </div>

                        <button
                            onClick={handleStartDownload}
                            className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-sm transition-all shadow-lg hover:shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <i className="bi bi-download text-base font-bold"></i>
                            Download Voice Model (41 MB)
                        </button>
                    </>
                )}

                {/* Real-Time Download Progress Screen */}
                {(isDownloading || isInitializing) && (
                    <div className="w-full flex flex-col items-center gap-4 my-3">
                        <div className="w-full bg-[#22272E] rounded-full h-3.5 overflow-hidden border border-[#373E47] p-0.5 shadow-inner">
                            <div
                                className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${downloadProgress?.percentage || 5}%` }}
                            />
                        </div>

                        <div className="w-full flex items-center justify-between font-mono text-xs text-slate-300">
                            <span className="font-bold text-white">
                                {downloadProgress?.percentage || 0}%
                            </span>
                            <span>
                                {downloadProgress?.loadedMB || 0} MB / {downloadProgress?.totalMB || 41} MB
                            </span>
                        </div>

                        <span className="text-xs text-slate-400 animate-pulse">
                            {isInitializing ? 'Optimizing KittenTTS Micro for your device...' : 'Downloading KittenTTS Micro model into local cache...'}
                        </span>
                    </div>
                )}

                {/* Ready Screen */}
                {isReady && (
                    <div className="w-full flex flex-col items-center gap-4 my-2">
                        <p className="text-xs sm:text-sm text-emerald-300 font-medium">
                            ✓ Voice Engine Ready! Natural tutoring audio is now enabled.
                        </p>
                        <button
                            onClick={onClose}
                            className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-sm transition-all shadow-lg cursor-pointer"
                        >
                            Start Tutoring
                        </button>
                    </div>
                )}

                {/* Error Screen */}
                {isError && (
                    <div className="w-full flex flex-col items-center gap-4 my-2">
                        <p className="text-xs text-rose-300">
                            {status.error || "Couldn't download Avelut Voice. Please check your internet connection."}
                        </p>
                        <button
                            onClick={handleStartDownload}
                            className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-sm transition-all shadow-lg cursor-pointer"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
