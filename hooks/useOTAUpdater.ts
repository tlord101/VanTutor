import { useEffect } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { db } from '../firebase';
import { ref as dbRef, onValue } from 'firebase/database';
import { Capacitor } from '@capacitor/core';

export function useOTAUpdater() {
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
                    console.log('New OTA Update found. Downloading in background:', data.version);

                    // Download the update silently
                    const versionInfo = await CapacitorUpdater.download({
                        url: data.downloadUrl,
                        version: data.version,
                    });

                    // Update local storage so we don't try to download it again
                    localStorage.setItem('current_ota_version', data.version);

                    // Apply the update to Capgo (so it loads silently on next launch)
                    await CapacitorUpdater.set({ id: versionInfo.id });
                    console.log('OTA Update downloaded and ready for next launch.');
                }
            } catch (error) {
                console.error("OTA Update Background Error:", error);
                // Revert local storage if it failed so it tries again next launch
                localStorage.removeItem('current_ota_version');
            }
        });

        return () => unsubscribe();
    }, []);
}
