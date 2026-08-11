import { useState, useEffect, useCallback } from 'react';
import { cloudSyncEngine, CloudSyncStatus } from '../services/cloudSyncService';

export interface SyncState {
  status: CloudSyncStatus;
  pendingCount: number;
  isOnline: boolean;
  triggerSync: () => Promise<void>;
}

export function useSyncStatus(): SyncState {
  const [status, setStatus] = useState<CloudSyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(() => cloudSyncEngine.isOnline());

  useEffect(() => {
    const unsubscribe = cloudSyncEngine.subscribe((newStatus, count) => {
      setStatus(newStatus);
      setPendingCount(count);
      setIsOnline(cloudSyncEngine.isOnline());
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  const triggerSync = useCallback(async () => {
    await cloudSyncEngine.triggerSync();
  }, []);

  return {
    status,
    pendingCount,
    isOnline,
    triggerSync
  };
}
