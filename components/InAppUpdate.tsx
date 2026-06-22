import React, { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { Capacitor } from '@capacitor/core';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { Loader2 } from 'lucide-react';

export const InAppUpdate: React.FC = () => {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isReadyToInstall, setIsReadyToInstall] = useState(false);
    const [localApkUri, setLocalApkUri] = useState<string | null>(null);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const checkUpdate = async () => {
            try {
                const info = await CapacitorApp.getInfo();
                const currentVersionCode = parseInt(info.build || '0', 10);

                const updatesRef = ref(db, 'app_updates/latest');
                onValue(updatesRef, (snapshot) => {
                    if (snapshot.exists()) {
                        const latest = snapshot.val();
                        if (latest.versionCode > currentVersionCode) {
                            setUpdateInfo(latest);
                            setUpdateAvailable(true);
                        }
                    }
                });
            } catch (error) {
                console.error('Failed to check app version:', error);
            }
        };

        checkUpdate();
    }, []);

    const handleDownload = async () => {
        if (!updateInfo?.downloadUrl) return;

        try {
            setIsDownloading(true);
            const fileName = `update-${updateInfo.versionCode}.apk`;

            // Listen to progress globally
            const progressListener = await Filesystem.addListener('progress', (progress) => {
                if (progress.url === updateInfo.downloadUrl) {
                    setDownloadProgress((progress.bytes / progress.contentLength) * 100);
                }
            });

            // Download using capacitor/filesystem
            const downloadResult = await Filesystem.downloadFile({
                url: updateInfo.downloadUrl,
                path: fileName,
                directory: Directory.ExternalStorage, // Need accessible storage for Android Package Installer
                progress: true,
            });

            await progressListener.remove();

            setLocalApkUri(downloadResult.path);
            setIsReadyToInstall(true);
        } catch (error) {
            console.error('Failed to download update:', error);
            setIsDownloading(false);
        }
    };

    const handleInstall = async () => {
        if (!localApkUri) return;
        try {
            await FileOpener.openFile({
                path: localApkUri,
                mimeType: 'application/vnd.android.package-archive',
            });
        } catch (error) {
            console.error('Failed to open APK:', error);
        }
    };

    if (!updateAvailable || !updateInfo) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-between font-sans selection:bg-sky-200 animate-fade-in pb-8">
            <div className="w-full flex-1 flex flex-col items-center max-w-md mx-auto relative px-6">
                
                {/* 3D Illustration Area */}
                <div className="w-full relative mt-12 mb-8 flex justify-center items-center">
                    <img 
                        src="/images/app_update_graphic.png" 
                        alt="App Update Graphic" 
                        className="w-[280px] h-auto object-contain drop-shadow-2xl"
                    />
                </div>

                {/* Text Content */}
                <div className="text-center w-full mb-auto mt-4 px-2">
                    <h1 className="text-[26px] font-black text-slate-900 tracking-tight leading-tight mb-3">
                        We have an app update for you
                    </h1>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                        We've made the app even better! Update now to enjoy a more seamless experience.
                    </p>

                    <div className="mt-8 mb-4">
                        <p className="text-xs font-bold text-slate-900 mb-2 tracking-wide">
                            What's new in v{updateInfo.versionName}
                        </p>
                        <p className="text-xs font-medium text-slate-500 leading-relaxed">
                            {updateInfo.releaseNotes}
                        </p>
                    </div>
                </div>

                {/* Progress & Actions */}
                <div className="w-full mt-6 px-4">
                    {isDownloading ? (
                        <div className="w-full space-y-3 bg-sky-50 rounded-2xl p-5 border border-sky-100">
                            <div className="flex justify-between text-xs font-bold text-sky-900">
                                <span>{isReadyToInstall ? 'Download Complete' : 'Downloading Update...'}</span>
                                <span>{Math.round(downloadProgress)}%</span>
                            </div>
                            <div className="w-full h-2 bg-sky-200 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-sky-500 transition-all duration-300 ease-out rounded-full"
                                    style={{ width: `${downloadProgress}%` }}
                                />
                            </div>
                            {isReadyToInstall && (
                                <button
                                    onClick={handleInstall}
                                    className="w-full mt-4 py-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm tracking-wide shadow-lg shadow-sky-500/30 transition-all"
                                >
                                    Install Update Now
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex w-full gap-4">
                            {!updateInfo.isMandatory && (
                                <button 
                                    onClick={() => setUpdateAvailable(false)}
                                    className="flex-1 py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-sky-600 font-bold text-sm tracking-wide transition-all"
                                >
                                    Skip
                                </button>
                            )}
                            <button
                                onClick={handleDownload}
                                className="flex-[2] py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm tracking-wide shadow-xl shadow-blue-600/20 transition-all"
                            >
                                Upgrade Now
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
