import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

const LOCAL_REFRESH_KEY = 'avelut_last_refreshed_timestamp';
let isGlobalRefreshInitialized = false;
let globalRefreshChannel: RealtimeChannel | null = null;

export const useGlobalRefresh = () => {
    useEffect(() => {
        if (typeof window === 'undefined' || !isSupabaseConfigured || isGlobalRefreshInitialized) return;
        isGlobalRefreshInitialized = true;

        const handleRefreshSignal = async (remoteTimestamp: number) => {
            if (!remoteTimestamp || typeof remoteTimestamp !== 'number') return;
            const localTimestampStr = localStorage.getItem(LOCAL_REFRESH_KEY);
            const localTimestamp = localTimestampStr ? parseInt(localTimestampStr, 10) : 0;

            if (remoteTimestamp > localTimestamp) {
                console.log(`[Supabase] Global refresh signal detected (Remote: ${remoteTimestamp}, Local: ${localTimestamp}). Reloading...`);
                try {
                    if ('caches' in window) {
                        const cacheKeys = await caches.keys();
                        await Promise.all(cacheKeys.map(key => caches.delete(key)));
                    }
                    if ('serviceWorker' in navigator) {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        for (let registration of registrations) {
                            await registration.unregister();
                        }
                    }
                } catch (error) {
                    console.error('Error clearing caches/service workers:', error);
                }

                localStorage.setItem(LOCAL_REFRESH_KEY, remoteTimestamp.toString());
                window.location.reload();
            }
        };

        // Realtime listener for force_refresh key in app_settings table
        try {
            globalRefreshChannel = supabase
                .channel(`public:system_signals_singleton_${Date.now()}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'app_settings',
                        filter: 'key=eq.force_refresh_timestamp',
                    },
                    (payload: any) => {
                        const ts = payload.new?.value_json?.timestamp || payload.new?.value_json;
                        if (typeof ts === 'number') {
                            void handleRefreshSignal(ts);
                        }
                    }
                )
                .subscribe();
        } catch (err) {
            console.warn('[GlobalRefresh] Channel subscribe error:', err);
        }
    }, []);
};
