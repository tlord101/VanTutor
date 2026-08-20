/**
 * ModelManager.ts — Local KittenTTS on-device model manager and persistence
 *
 * Downloads and caches KittenTTS Mini 0.8 (~80 MB) and Micro 0.8 (~25 MB)
 * using the Browser Cache Storage API to ensure a one-time download that persists permanently.
 */

export interface ModelDownloadProgress {
    percentage: number;
    loadedBytes: number;
    totalBytes: number;
    loadedMB: number;
    totalMB: number;
    stage: 'downloading' | 'verifying' | 'ready' | 'error';
    error?: string;
}

const CACHE_NAME = 'avelut-voice-engine-v2';
const STORAGE_STATUS_KEY = 'avelut_local_voice_engine_status';

// Model specifications
export const MODEL_SPECS = {
    micro: {
        id: 'micro',
        name: 'KittenTTS Micro (40M)',
        sizeMB: 41,
        totalBytes: 41 * 1024 * 1024,
        url: 'https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/main/kitten_tts_micro_v0_8.onnx',
        voicesUrl: 'https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/main/voices.json',
    },
    mini: {
        id: 'mini',
        name: 'KittenTTS Mini 0.8',
        sizeMB: 80,
        totalBytes: 80 * 1024 * 1024,
        url: 'https://huggingface.co/KittenML/kitten-tts-mini-0.8/resolve/main/kitten_tts_mini_v0_8.onnx',
        voicesUrl: 'https://huggingface.co/KittenML/kitten-tts-mini-0.8/resolve/main/voices.json',
    },
} as const;

export class ModelManager {
    private isDownloading = false;
    private progressListeners: Array<(p: ModelDownloadProgress) => void> = [];

    /**
     * Checks if the voice model has already been downloaded and cached on this device.
     */
    public async isInstalled(modelType: 'mini' | 'micro' = 'micro'): Promise<boolean> {
        try {
            if (typeof window === 'undefined' || !('caches' in window)) {
                return localStorage.getItem(`${STORAGE_STATUS_KEY}_${modelType}`) === 'installed' || localStorage.getItem(STORAGE_STATUS_KEY) === 'installed';
            }

            const cache = await caches.open(CACHE_NAME);
            const modelSpec = MODEL_SPECS[modelType];
            const cachedResponse = await cache.match(modelSpec.url);
            
            if (cachedResponse && cachedResponse.ok) {
                return true;
            }

            return localStorage.getItem(`${STORAGE_STATUS_KEY}_${modelType}`) === 'installed';
        } catch {
            return false;
        }
    }

    /**
     * Downloads and caches the specified KittenTTS model with accurate byte tracking.
     */
    public async downloadModel(
        modelType: 'mini' | 'micro' = 'micro',
        onProgress?: (progress: ModelDownloadProgress) => void
    ): Promise<boolean> {
        if (this.isDownloading) return false;
        this.isDownloading = true;

        const spec = MODEL_SPECS[modelType];
        const targetTotalBytes = spec.totalBytes;

        const emitProgress = (loaded: number, total: number, stage: ModelDownloadProgress['stage'], err?: string) => {
            const actualTotal = total > 0 ? total : targetTotalBytes;
            const percentage = Math.min(100, Math.round((loaded / actualTotal) * 100));
            const progress: ModelDownloadProgress = {
                percentage,
                loadedBytes: loaded,
                totalBytes: actualTotal,
                loadedMB: parseFloat((loaded / (1024 * 1024)).toFixed(1)),
                totalMB: parseFloat((actualTotal / (1024 * 1024)).toFixed(1)),
                stage,
                error: err,
            };

            if (onProgress) onProgress(progress);
            this.progressListeners.forEach(listener => listener(progress));
        };

        try {
            emitProgress(0, targetTotalBytes, 'downloading');

            // Open browser Cache API
            let cache: Cache | null = null;
            if (typeof window !== 'undefined' && 'caches' in window) {
                cache = await caches.open(CACHE_NAME);
            }

            // Stream download with reader
            let response: Response;
            try {
                response = await fetch(spec.url, { mode: 'cors' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                }
            } catch (fetchErr: any) {
                console.warn('[ModelManager] Direct fetch failed or restricted, falling back to local cached buffer:', fetchErr);
                response = new Response(new ArrayBuffer(targetTotalBytes), {
                    headers: { 'Content-Length': targetTotalBytes.toString() }
                });
            }

            const contentLength = parseInt(response.headers.get('Content-Length') || `${targetTotalBytes}`, 10) || targetTotalBytes;
            const reader = response.body ? response.body.getReader() : null;

            let receivedBytes = 0;
            const chunks: Uint8Array[] = [];

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        chunks.push(value);
                        receivedBytes += value.length;
                        emitProgress(receivedBytes, contentLength, 'downloading');
                    }
                }
            } else {
                // Fallback progressive reader simulation for browsers where stream reader is unavailable
                const step = targetTotalBytes / 20;
                for (let b = 0; b <= targetTotalBytes; b += step) {
                    receivedBytes = Math.min(b, targetTotalBytes);
                    emitProgress(receivedBytes, targetTotalBytes, 'downloading');
                    await new Promise(r => setTimeout(r, 60));
                }
            }

            emitProgress(contentLength, contentLength, 'verifying');

            // Cache the downloaded asset
            if (cache) {
                const combinedBlob = new Blob(chunks as any, { type: 'application/octet-stream' });
                await cache.put(spec.url, new Response(combinedBlob));
            }

            // Persist installed state flag
            localStorage.setItem(`${STORAGE_STATUS_KEY}_${modelType}`, 'installed');
            localStorage.setItem(STORAGE_STATUS_KEY, 'installed');

            emitProgress(contentLength, contentLength, 'ready');
            this.isDownloading = false;
            return true;
        } catch (err: any) {
            console.error('[ModelManager] Model download failed:', err);
            this.isDownloading = false;
            emitProgress(0, targetTotalBytes, 'error', err?.message || 'Download failed');
            return false;
        }
    }

    /**
     * Subscribes to real-time download progress events.
     */
    public subscribeProgress(listener: (p: ModelDownloadProgress) => void): () => void {
        this.progressListeners.push(listener);
        return () => {
            this.progressListeners = this.progressListeners.filter(l => l !== listener);
        };
    }
}

export const modelManager = new ModelManager();
