import { ParsedLessonScript } from '../utils/lessonScriptParser';

export interface OfflineTutorialPackage {
  id: string;
  topicId: string;
  topicTitle: string;
  courseId?: string;
  downloadedAt: number;
  sizeBytes: number;
  script: ParsedLessonScript;
  audioDataUrl?: string; // High-compression Base64 audio or local filesystem URI
}

const DB_NAME = 'AvelutOfflineTutorialsDB';
const STORE_NAME = 'tutorials';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Saves a completed tutorial vector script (<2MB) for offline learning.
 */
export const saveTutorialOffline = async (pkg: OfflineTutorialPackage): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(pkg);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Retrieves all offline tutorials saved on the device.
 */
export const getOfflineTutorials = async (): Promise<OfflineTutorialPackage[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Deletes an offline tutorial from the device.
 */
export const deleteOfflineTutorial = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
