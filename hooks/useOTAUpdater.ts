import { useState, useEffect } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { db } from '../firebase';
import { ref as dbRef, onValue } from 'firebase/database';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

interface OTAUpdateStatus {
    isDownloading: boolean;
    progress: number;
    error: string | null;
}

export function useOTAUpdater() {
    const [status, setStatus] = useState<OTAUpdateStatus>({
        isDownloading: false,
        progress: 0,
        error: null,
    });

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        // Vital: Notify Capgo that the app successfully started
        // Without this, the next restart will rollback to the previous version
        CapacitorUpdater.notifyAppReady();

        const otaRef = dbRef(db, 'app_updates/ota_latest');
        const unsubscribe = onValue(otaRef, async (snapshot) => {
            const data = snapshot.val();
            if (!data || !data.version || !data.downloadUrl) return;

            try {
                // Check current OTA version applied
                const currentOtaVersion = localStorage.getItem('current_ota_version');

                // If the version in Firebase is different from the one we have applied, it's a new update!
                if (data.version !== currentOtaVersion) {
                    console.log('New OTA Update found:', data.version);
                    
                    setStatus({ isDownloading: true, progress: 0, error: null });

                    // Add progress listener
                    CapacitorUpdater.addListener('download', (info: any) => {
                        setStatus(prev => ({ ...prev, progress: Math.round(info.percent) }));
                    });

                    // Download the update
                    const versionInfo = await CapacitorUpdater.download({
                        url: data.downloadUrl,
                        version: data.version,
                    });

                    // Update local storage so we don't try to download it again
                    localStorage.setItem('current_ota_version', data.version);

                    setStatus({ isDownloading: true, progress: 100, error: null });

                    // Small delay so user sees 100%
                    setTimeout(async () => {
                        window.alert('A new update has been installed! The app will now clear its caches and close. Please reopen the app manually to enjoy the latest features.');
                        
                        // We must save the current_ota_version so we don't redownload, but clear everything else
                        const currentVersion = localStorage.getItem('current_ota_version');
                        
                        // Erase caches
                        localStorage.clear();
                        sessionStorage.clear();
                        
                        if (currentVersion) {
                            localStorage.setItem('current_ota_version', currentVersion);
                        }

                        // Apply the update to Capgo (so it loads on next launch)
                        await CapacitorUpdater.set({ id: versionInfo.id });
                        
                        // Force close the app
                        await App.exitApp();
                    }, 500);
                }
            } catch (error) {
                console.error("OTA Update Error:", error);
                setStatus(prev => ({ ...prev, isDownloading: false, error: "Failed to download update." }));
                // Revert local storage if it failed so it tries again next launch
                localStorage.removeItem('current_ota_version');
            }
        });

        return () => {
            unsubscribe();
            CapacitorUpdater.removeAllListeners();
        };
    }, []);

    return status;
}
