import { useEffect } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { db } from '../firebase';
import { ref as dbRef, onValue } from 'firebase/database';
import { Capacitor } from '@capacitor/core';

export function useOTAUpdater() {
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        import('@capacitor/app').then(({ App }) => {
            // Vital: Notify Capgo that the app successfully started
            CapacitorUpdater.notifyAppReady();

            const checkAndUpdate = async (data: any) => {
                if (!data || !data.version || !data.downloadUrl) return;

                try {
                    const currentOtaVersion = localStorage.getItem('current_ota_version');
                    if (data.version !== currentOtaVersion) {
                        console.log('New OTA Update found. Downloading in background:', data.version);
                        
                        const versionInfo = await CapacitorUpdater.download({
                            url: data.downloadUrl,
                            version: data.version,
                        });

                        localStorage.setItem('current_ota_version', data.version);
                        await CapacitorUpdater.set({ id: versionInfo.id });
                        console.log('OTA Update downloaded and ready for next launch.');
                    }
                } catch (error) {
                    console.error("OTA Update Background Error:", error);
                    localStorage.removeItem('current_ota_version');
                }
            };

            const otaRef = dbRef(db, 'app_updates/ota_latest');
            
            // Listen for real-time changes
            const unsubscribe = onValue(otaRef, (snapshot) => checkAndUpdate(snapshot.val()));

            // Also check every time the person enters the app
            const stateListener = App.addListener('appStateChange', async (state) => {
                if (state.isActive) {
                    import('firebase/database').then(({ get }) => {
                        get(otaRef).then(snapshot => checkAndUpdate(snapshot.val()));
                    });
                }
            });

            return () => {
                unsubscribe();
                stateListener.then(listener => listener.remove());
            };
        });
    }, []);
}
