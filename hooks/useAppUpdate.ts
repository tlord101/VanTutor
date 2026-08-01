import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update';

export function useAppUpdate() {
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

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

        checkAndPromptForUpdate();
    }, []);
}
