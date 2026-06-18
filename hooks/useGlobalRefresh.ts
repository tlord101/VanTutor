import { useEffect, useRef } from 'react';
import { ref as dbRef, onValue } from 'firebase/database';
import { db } from '../firebase';

const LOCAL_REFRESH_KEY = 'avelut_last_refreshed_timestamp';

export const useGlobalRefresh = () => {
    const initializedRef = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Ensure we only attach the listener once
        if (initializedRef.current) return;
        initializedRef.current = true;

        const refreshSignalRef = dbRef(db, 'system_signals/force_refresh_timestamp');
        
        const unsubscribe = onValue(refreshSignalRef, async (snapshot) => {
            const remoteTimestamp = snapshot.val();
            
            if (remoteTimestamp && typeof remoteTimestamp === 'number') {
                const localTimestampStr = localStorage.getItem(LOCAL_REFRESH_KEY);
                const localTimestamp = localTimestampStr ? parseInt(localTimestampStr, 10) : 0;

                // If the remote timestamp is newer than our local one, it's time to refresh
                if (remoteTimestamp > localTimestamp) {
                    console.log(`Global refresh signal detected (Remote: ${remoteTimestamp}, Local: ${localTimestamp}). Clearing caches and reloading...`);
                    
                    try {
                        // 1. Clear all Cache API caches (used by PWA)
                        if ('caches' in window) {
                            const cacheKeys = await caches.keys();
                            await Promise.all(cacheKeys.map(key => caches.delete(key)));
                            console.log('Cleared Cache API caches.');
                        }

                        // 2. Unregister all service workers
                        if ('serviceWorker' in navigator) {
                            const registrations = await navigator.serviceWorker.getRegistrations();
                            for (let registration of registrations) {
                                await registration.unregister();
                            }
                            console.log('Unregistered service workers.');
                        }
                    } catch (error) {
                        console.error('Error while clearing caches/service workers:', error);
                    }

                    // 3. Update the local timestamp so we don't refresh loop
                    localStorage.setItem(LOCAL_REFRESH_KEY, remoteTimestamp.toString());

                    // 4. Hard reload the page
                    window.location.reload();
                }
            }
        });

        return () => {
            unsubscribe();
            initializedRef.current = false;
        };
    }, []);
};
