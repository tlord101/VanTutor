import { useState, useEffect, useCallback } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { db } from '../firebase';
import { ref as dbRef, onValue, get } from 'firebase/database';
import { Capacitor } from '@capacitor/core';

export type OTAUpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready';

interface OTAState {
    status: OTAUpdateStatus;
    newVersion: string | null;
    downloadProgress: number;
}

// Global shared state across all hook subscribers
let globalState: OTAState = {
    status: 'idle',
    newVersion: null,
    downloadProgress: 0,
};

const listeners = new Set<(state: OTAState) => void>();

function setGlobalState(updater: Partial<OTAState> | ((prev: OTAState) => Partial<OTAState>)) {
    const next = typeof updater === 'function' ? updater(globalState) : updater;
    globalState = { ...globalState, ...next };
    listeners.forEach(l => l(globalState));
}

let isInitialized = false;

function initOTAEngine() {
    if (isInitialized) return;
    isInitialized = true;

    if (!Capacitor.isNativePlatform()) return;

    import('@capacitor/app').then(({ App }) => {
        // Notify Capgo that the app successfully booted
        CapacitorUpdater.notifyAppReady().catch(e => console.warn('[OTA] notifyAppReady err:', e));

        const checkAndUpdate = async (data: any) => {
            if (!data || !data.version || !data.downloadUrl) return;

            try {
                const currentOtaVersion = localStorage.getItem('current_ota_version');
                if (data.version !== currentOtaVersion) {
                    console.log('[OTA] New update found. Starting background download:', data.version);
                    setGlobalState({ status: 'downloading', newVersion: data.version, downloadProgress: 0 });

                    const versionInfo = await CapacitorUpdater.download({
                        url: data.downloadUrl,
                        version: data.version,
                    });

                    localStorage.setItem('current_ota_version', data.version);
                    await CapacitorUpdater.set({ id: versionInfo.id });

                    console.log('[OTA] Update downloaded & ready. User can restart to apply.');
                    setGlobalState({ status: 'ready', newVersion: data.version, downloadProgress: 100 });
                }
            } catch (error) {
                console.error('[OTA] Update error:', error);
                setGlobalState({ status: 'idle', newVersion: null, downloadProgress: 0 });
            }
        };

        const otaRef = dbRef(db, 'app_updates/ota_latest');

        // Listen for real-time Firebase DB changes
        onValue(otaRef, (snapshot) => checkAndUpdate(snapshot.val()));

        // Also check whenever app enters foreground
        App.addListener('appStateChange', async (state) => {
            if (state.isActive) {
                get(otaRef).then(snapshot => checkAndUpdate(snapshot.val())).catch(() => {});
            }
        });
    }).catch(e => console.warn('[OTA] Init error:', e));
}

export function useOTAUpdater() {
    const [state, setState] = useState<OTAState>(globalState);

    useEffect(() => {
        initOTAEngine();
        listeners.add(setState);
        return () => {
            listeners.delete(setState);
        };
    }, []);

    const restartToUpdate = useCallback(async () => {
        try {
            if (Capacitor.isNativePlatform()) {
                await CapacitorUpdater.reload();
            } else {
                window.location.reload();
            }
        } catch (e) {
            console.warn('[OTA] Reload error, falling back to window.location.reload():', e);
            window.location.reload();
        }
    }, []);

    return {
        updateStatus: state.status,
        newVersion: state.newVersion,
        downloadProgress: state.downloadProgress,
        restartToUpdate,
    };
}
