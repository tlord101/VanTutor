import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const LOCAL_REFRESH_KEY = 'avelut_last_refreshed_timestamp';

export const useGlobalRefresh = () => {
    const initializedRef = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !isSupabaseConfigured) return;

        // Ensure we only attach the listener once
        if (initializedRef.current) return;
        initializedRef.current = true;

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
        const channel = supabase
            .channel('public:system_signals')
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

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);
};
