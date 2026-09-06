import { db, get, ref as dbRef } from '@/lib/backend';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update';

const PLAYSTORE_UPDATE_PATH = 'app_updates/playstore/latest';
const PLAYSTORE_PACKAGE_ID = 'com.avelut.app';
const UPDATE_POLL_INTERVAL_MS = 60_000;
const UPDATE_PROMPT_COOLDOWN_MS = 2 * 60_000;

type UpdatePromptState = {
    visible: boolean;
    title: string;
    message: string;
    mandatory: boolean;
    targetVersionCode: number;
    targetVersionName?: string;
};

type UseAppUpdateResult = {
    updatePrompt: UpdatePromptState;
    dismissUpdatePrompt: () => void;
    openUpdateInStore: () => Promise<void>;
};

const defaultPromptState: UpdatePromptState = {
    visible: false,
    title: 'App Update Available',
    message: 'A new version of AVELUT is available. Update now for the latest fixes and features.',
    mandatory: false,
    targetVersionCode: 0,
    targetVersionName: '',
};

const parseVersionCode = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
    const parsed = parseInt((value || '').toString(), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
};

export function useAppUpdate(): UseAppUpdateResult {
    const hasStartedRef = useRef(false);
    const skipUntilRef = useRef(0);
    const [updatePrompt, setUpdatePrompt] = useState<UpdatePromptState>(defaultPromptState);

    const evaluateUpdate = useCallback(async () => {
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
            return;
        }

        if (Date.now() < skipUntilRef.current) {
            return;
        }

        try {
            const [serverSnapshot, updateInfo] = await Promise.all([
                get(dbRef(db, PLAYSTORE_UPDATE_PATH)),
                AppUpdate.getAppUpdateInfo(),
            ]);

            if (updateInfo.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) {
                setUpdatePrompt(defaultPromptState);
                return;
            }

            const serverData = serverSnapshot.val() || {};
            const targetVersionCode = parseVersionCode(updateInfo.availableVersionCode || serverData.versionCode);
            if (!targetVersionCode) {
                setUpdatePrompt(defaultPromptState);
                return;
            }

            setUpdatePrompt({
                visible: true,
                title: (serverData.title || defaultPromptState.title).toString(),
                message: (serverData.message || defaultPromptState.message).toString(),
                mandatory: Boolean(serverData.mandatory),
                targetVersionCode,
                targetVersionName: (serverData.versionName || '').toString(),
            });
        } catch (error) {
            console.error('Firestore app update check failed:', error);
        }
    }, []);

    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
            return;
        }

        void evaluateUpdate();

        let pollTimer: ReturnType<typeof setInterval> | undefined;

        const startPolling = () => {
            if (pollTimer) return;
            pollTimer = setInterval(() => {
                void evaluateUpdate();
            }, UPDATE_POLL_INTERVAL_MS);
        };

        const stopPolling = () => {
            if (!pollTimer) return;
            clearInterval(pollTimer);
            pollTimer = undefined;
        };

        startPolling();

        const stateListener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
                void evaluateUpdate();
                startPolling();
            } else {
                stopPolling();
            }
        });

        return () => {
            stopPolling();
            stateListener.then(listener => listener.remove()).catch(() => {});
        };
    }, [evaluateUpdate]);

    const dismissUpdatePrompt = useCallback(() => {
        skipUntilRef.current = Date.now() + UPDATE_PROMPT_COOLDOWN_MS;
        setUpdatePrompt(prev => ({ ...prev, visible: false }));
    }, []);

    const openUpdateInStore = useCallback(async () => {
        try {
            await AppUpdate.openAppStore({ androidPackageName: PLAYSTORE_PACKAGE_ID });
        } catch {
            const playStoreUrl = `https://play.google.com/store/apps/details?id=${PLAYSTORE_PACKAGE_ID}`;
            if (typeof window !== 'undefined') {
                window.open(playStoreUrl, '_blank', 'noopener,noreferrer');
            }
        }
    }, []);

    return {
        updatePrompt,
        dismissUpdatePrompt,
        openUpdateInStore,
    };
}
