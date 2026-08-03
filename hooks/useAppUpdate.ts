import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { db } from '../firebase';
import { get, ref as dbRef } from 'firebase/database';

const PLAYSTORE_UPDATE_PATH = 'app_updates/playstore/latest';
const PLAYSTORE_PACKAGE_ID = 'com.avelut.app';

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

const getCurrentAppVersionCode = async (): Promise<number> => {
    try {
        const info = await CapacitorApp.getInfo();
        return parseVersionCode((info as any).versionCode || info.version);
    } catch {
        return 0;
    }
};

export function useAppUpdate(): UseAppUpdateResult {
    const hasStartedRef = useRef(false);
    const [updatePrompt, setUpdatePrompt] = useState<UpdatePromptState>(defaultPromptState);

    const evaluateUpdate = useCallback(async () => {
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
            return;
        }

        try {
            const [serverSnapshot, currentVersionCode] = await Promise.all([
                get(dbRef(db, PLAYSTORE_UPDATE_PATH)),
                getCurrentAppVersionCode(),
            ]);

            if (!serverSnapshot.exists()) {
                setUpdatePrompt(defaultPromptState);
                return;
            }

            const serverData = serverSnapshot.val() || {};
            const targetVersionCode = parseVersionCode(serverData.versionCode);
            if (!targetVersionCode || targetVersionCode <= currentVersionCode) {
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

        void evaluateUpdate();

        const stateListener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
                void evaluateUpdate();
            }
        });

        return () => {
            stateListener.then(listener => listener.remove()).catch(() => {});
        };
    }, [evaluateUpdate]);

    const dismissUpdatePrompt = useCallback(() => {
        setUpdatePrompt(prev => ({ ...prev, visible: false }));
    }, []);

    const openUpdateInStore = useCallback(async () => {
        const playStoreUrl = `https://play.google.com/store/apps/details?id=${PLAYSTORE_PACKAGE_ID}`;
        try {
            await Browser.open({ url: playStoreUrl });
        } catch {
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
