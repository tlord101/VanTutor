import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update';

export function useAppUpdate() {
    const hasCheckedRef = useRef(false);

    useEffect(() => {
        // React StrictMode intentionally double-invokes effects in dev; guard to avoid duplicate update prompts.
        if (hasCheckedRef.current) return;
        hasCheckedRef.current = true;

        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

        const checkAndPromptForUpdate = async () => {
            try {
                const result = await AppUpdate.getAppUpdateInfo();
                if (result.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE) {
                    await AppUpdate.performImmediateUpdate();
                }
            } catch (error) {
                console.error("Native App Update Error:", error);
            }
        };

        void checkAndPromptForUpdate();
    }, []);
}
