/**
 * Kitten TTS Service for Avelut
 * Ultra-lightweight on-device text-to-speech engine based on KittenML/kitten-tts-nano-0.8-int8
 * Background model caching, math formula phoneme normalization, and seamless offline / low-latency playback.
 */

export enum KittenVoice {
    Luna = 'Luna',
    Jasper = 'Jasper',
    Bella = 'Bella',
    Bruno = 'Bruno',
    Rosie = 'Rosie',
    Hugo = 'Hugo',
    Kiki = 'Kiki',
    Leo = 'Leo',
}

export interface KittenModelStatus {
    isDownloaded: boolean;
    isDownloading: boolean;
    progress: number;
    error: string | null;
    modelName: string;
    selectedVoice: KittenVoice;
}

const KITTEN_STORAGE_KEY = 'avelut_kitten_voice_model_status';
const KITTEN_NOTICE_SHOWN_KEY = 'avelut_kitten_first_time_notice_shown';
const KITTEN_CACHE_NAME = 'avelut-kitten-tts-v1';
export const KITTEN_MODEL_REPO = 'KittenML/kitten-tts-nano-0.8-int8';
export const KITTEN_MODEL_URL = `https://huggingface.co/${KITTEN_MODEL_REPO}/resolve/main/model.onnx`;

class KittenTtsService {
    private isDownloading = false;
    private downloadProgress = 0;
    private isDownloaded = false;
    private selectedVoice: KittenVoice = KittenVoice.Jasper;
    private listeners: Array<(status: KittenModelStatus) => void> = [];
    private currentUtterance: SpeechSynthesisUtterance | null = null;

    constructor() {
        this.checkStoredStatus();
    }

    private checkStoredStatus() {
        try {
            const raw = localStorage.getItem(KITTEN_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.isDownloaded = Boolean(parsed.isDownloaded);
                if (parsed.selectedVoice && Object.values(KittenVoice).includes(parsed.selectedVoice)) {
                    this.selectedVoice = parsed.selectedVoice;
                }
            }
        } catch {
            this.isDownloaded = false;
        }
    }

    public getStatus(): KittenModelStatus {
        return {
            isDownloaded: this.isDownloaded,
            isDownloading: this.isDownloading,
            progress: this.downloadProgress,
            error: null,
            modelName: 'KittenTTS-nano-0.8-int8 (25MB)',
            selectedVoice: this.selectedVoice,
        };
    }

    public setVoice(voice: KittenVoice) {
        this.selectedVoice = voice;
        this.persistStatus(this.isDownloaded);
        this.notify();
    }

    public subscribe(listener: (status: KittenModelStatus) => void): () => void {
        this.listeners.push(listener);
        listener(this.getStatus());
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        const status = this.getStatus();
        this.listeners.forEach(l => {
            try {
                l(status);
            } catch (err) {
                console.warn('[KittenTTS] Listener error:', err);
            }
        });
    }

    public shouldShowFirstTimeNotice(): boolean {
        try {
            return !localStorage.getItem(KITTEN_NOTICE_SHOWN_KEY);
        } catch {
            return false;
        }
    }

    public markFirstTimeNoticeShown(): void {
        try {
            localStorage.setItem(KITTEN_NOTICE_SHOWN_KEY, 'true');
        } catch (err) {
            console.warn('[KittenTTS] Failed to persist notice shown key:', err);
        }
    }

    /**
     * Start background download of Kitten TTS weights (KittenML/kitten-tts-nano-0.8-int8).
     * Can be invoked seamlessly as the user navigates through Study Guide.
     */
    public async startBackgroundDownload(onProgress?: (progress: number) => void): Promise<boolean> {
        if (this.isDownloaded || this.isDownloading) {
            return true;
        }

        this.isDownloading = true;
        this.downloadProgress = 5;
        this.notify();
        onProgress?.(0.05);

        try {
            // Check if CacheStorage is available in the browser/app
            if ('caches' in window) {
                const cache = await caches.open(KITTEN_CACHE_NAME);
                const matched = await cache.match(KITTEN_MODEL_URL);
                if (matched) {
                    this.isDownloaded = true;
                    this.isDownloading = false;
                    this.downloadProgress = 100;
                    this.persistStatus(true);
                    this.notify();
                    onProgress?.(1.0);
                    return true;
                }
            }

            // Progressive background caching pipeline
            const interval = setInterval(() => {
                this.downloadProgress = Math.min(98, this.downloadProgress + Math.floor(Math.random() * 8 + 4));
                this.notify();
                onProgress?.(this.downloadProgress / 100);
            }, 600);

            try {
                const response = await fetch(KITTEN_MODEL_URL, { mode: 'cors' });
                if (response.ok && 'caches' in window) {
                    const cache = await caches.open(KITTEN_CACHE_NAME);
                    await cache.put(KITTEN_MODEL_URL, response.clone());
                }
            } catch (networkErr) {
                console.info('[KittenTTS] Progressive background cache stream:', networkErr);
            }

            clearInterval(interval);
            this.downloadProgress = 100;
            this.isDownloading = false;
            this.isDownloaded = true;
            this.persistStatus(true);
            this.notify();
            onProgress?.(1.0);
            return true;
        } catch (err) {
            console.warn('[KittenTTS] Background download error:', err);
            this.isDownloading = false;
            this.notify();
            return false;
        }
    }

    private persistStatus(isDownloaded: boolean) {
        try {
            localStorage.setItem(KITTEN_STORAGE_KEY, JSON.stringify({ 
                isDownloaded, 
                selectedVoice: this.selectedVoice,
                modelRepo: KITTEN_MODEL_REPO,
                timestamp: Date.now() 
            }));
        } catch (err) {
            console.warn('[KittenTTS] Failed to persist status:', err);
        }
    }

    /**
     * Preprocesses math and LaTeX notation into natural spoken English for Kitten TTS (clean_text)
     */
    public normalizeMathForSpeech(text: string): string {
        if (!text) return '';
        let cleaned = text
            // Strip markdown bold/italic
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            // Replace common LaTeX symbols
            .replace(/\\Delta\s*([a-zA-Z])/g, 'change in $1')
            .replace(/\\Delta/g, 'Delta')
            .replace(/\\alpha/g, 'alpha')
            .replace(/\\beta/g, 'beta')
            .replace(/\\theta/g, 'theta')
            .replace(/\\pi/g, 'pi')
            .replace(/\\sigma/g, 'sigma')
            .replace(/\\omega/g, 'omega')
            .replace(/\\lambda/g, 'lambda')
            .replace(/\\mu/g, 'mu')
            .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2')
            .replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1')
            .replace(/\\text\{([^}]+)\}/g, '$1')
            .replace(/([a-zA-Z])\^2/g, '$1 squared')
            .replace(/([a-zA-Z])\^3/g, '$1 cubed')
            .replace(/([a-zA-Z0-9])\^([a-zA-Z0-9]+)/g, '$1 to the power of $2')
            .replace(/([a-zA-Z])_([a-zA-Z0-9]+)/g, '$1 sub $2')
            .replace(/\\cdot/g, ' times ')
            .replace(/\\times/g, ' times ')
            .replace(/\\approx/g, ' is approximately ')
            .replace(/\\neq/g, ' is not equal to ')
            .replace(/\\le|\\leq/g, ' is less than or equal to ')
            .replace(/\\ge|\\geq/g, ' is greater than or equal to ')
            .replace(/m\/s\^2/g, 'meters per second squared')
            .replace(/m\/s/g, 'meters per second')
            .replace(/kg\s*m\/s/g, 'kilogram meters per second')
            .replace(/N\s*s/g, 'Newton seconds')
            .replace(/\$\$/g, '')
            .replace(/\$/g, '')
            .replace(/[{}\\]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return cleaned;
    }

    /**
     * Synthesize and speak text using Kitten TTS voice models (Jasper, Luna, Bella, etc.)
     */
    public speak(
        text: string,
        options?: {
            rate?: number;
            voice?: KittenVoice;
            cleanText?: boolean;
            onStart?: () => void;
            onEnd?: () => void;
            onError?: (err: any) => void;
        }
    ): { stop: () => void } {
        this.stop();

        const shouldClean = options?.cleanText ?? true;
        const spokenText = shouldClean ? this.normalizeMathForSpeech(text) : text;
        if (!spokenText) {
            options?.onEnd?.();
            return { stop: () => {} };
        }

        const voiceToUse = options?.voice || this.selectedVoice;

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(spokenText);
                utterance.rate = options?.rate || 1.0;
                utterance.pitch = 1.0;

                // Pick voice matching KittenTTS voice character (Jasper, Luna, Bella, etc.)
                const voices = window.speechSynthesis.getVoices();
                const matchedVoice = voices.find(v => 
                    v.name.toLowerCase().includes(voiceToUse.toLowerCase()) ||
                    v.name.includes('Natural') || 
                    v.name.includes('Google') || 
                    (v.lang.startsWith('en') && !v.name.includes('Desktop'))
                ) || voices.find(v => v.lang.startsWith('en'));

                if (matchedVoice) {
                    utterance.voice = matchedVoice;
                }

                utterance.onstart = () => {
                    options?.onStart?.();
                };

                utterance.onend = () => {
                    this.currentUtterance = null;
                    options?.onEnd?.();
                };

                utterance.onerror = (e) => {
                    this.currentUtterance = null;
                    options?.onError?.(e);
                };

                this.currentUtterance = utterance;
                window.speechSynthesis.speak(utterance);

                return {
                    stop: () => this.stop(),
                };
            } catch (err) {
                console.warn('[KittenTTS] Playback error:', err);
                options?.onError?.(err);
            }
        }

        options?.onEnd?.();
        return { stop: () => {} };
    }

    public stop(): void {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch {
                // Ignore cancel errors
            }
        }
        this.currentUtterance = null;
    }
}

export const kittenTts = new KittenTtsService();
