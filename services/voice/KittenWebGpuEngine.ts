/**
 * KittenCloudTtsEngine (formerly KittenWebGpuEngine)
 * Official KittenML Cloud API Client for Avelut
 *
 * Implements board-by-board audio generation, background pre-fetching,
 * streaming engine for live voice Q&A, and in-memory caching.
 * Endpoint: https://api.kittenml.com/v1/audio/speech
 */

export interface WebGpuVoiceOptions {
    voice?: string;
    speed?: number;
    cleanText?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
}

const DEFAULT_KITTENML_API_KEY = 'sk_kitten_live_52b60a21556ae99d_Q2vLVOhqKuXnRM4nK-LmX8EMJvDQmftKK9Dj32ZP1KI';

export class KittenCloudTtsEngine {
    private currentAudioElement: HTMLAudioElement | null = null;
    private activeSessionId = 0;
    private audioCache = new Map<string, string>(); // Cache key -> Blob URL
    private activeAbortController: AbortController | null = null;

    public getKittenApiKey(): string {
        // 1. Vite import.meta.env (VITE_KITTENML_API_KEY or KITTENML_API_KEY)
        try {
            const k = (import.meta as any)?.env?.VITE_KITTENML_API_KEY;
            if (k && typeof k === 'string' && k.trim() && !k.startsWith('your_')) return k.trim();
        } catch {}

        try {
            const k = (import.meta as any)?.env?.KITTENML_API_KEY;
            if (k && typeof k === 'string' && k.trim() && !k.startsWith('your_')) return k.trim();
        } catch {}

        // 2. Node/process env
        try {
            const pKey = (process as any)?.env?.VITE_KITTENML_API_KEY || (process as any)?.env?.KITTENML_API_KEY;
            if (pKey && typeof pKey === 'string' && pKey.trim() && !pKey.startsWith('your_')) return pKey.trim();
        } catch {}

        // 3. LocalStorage keys
        try {
            const lsKey = localStorage.getItem('VITE_KITTENML_API_KEY') || localStorage.getItem('avelut_kittenml_api_key');
            if (lsKey && typeof lsKey === 'string' && lsKey.trim() && !lsKey.startsWith('your_')) return lsKey.trim();
        } catch {}

        // 4. LocalStorage App Settings
        try {
            const cached = localStorage.getItem('avelut_app_settings');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.kittenml_api_key && typeof parsed.kittenml_api_key === 'string' && parsed.kittenml_api_key.trim() && !parsed.kittenml_api_key.startsWith('your_')) {
                    return parsed.kittenml_api_key.trim();
                }
            }
        } catch {}

        // 5. Default Fallback Live Key
        return DEFAULT_KITTENML_API_KEY;
    }

    public async initialize(): Promise<boolean> {
        return true;
    }

    public isReady(): boolean {
        return true;
    }

    public stop(): void {
        this.activeSessionId++;
        if (this.activeAbortController) {
            try {
                this.activeAbortController.abort();
            } catch {}
            this.activeAbortController = null;
        }
        if (this.currentAudioElement) {
            try {
                this.currentAudioElement.pause();
                this.currentAudioElement.currentTime = 0;
            } catch {}
            this.currentAudioElement = null;
        }
    }

    /**
     * Pre-fetches audio for the next board in the background to ensure instantaneous board flips.
     */
    public async prefetchAudio(text: string, voice = 'Bella', speed = 1.1): Promise<void> {
        if (!text || !text.trim()) return;
        const normalized = this.normalizeMathForSpeech(text).trim();
        const cacheKey = `${voice}_${speed}_${normalized}`;
        if (this.audioCache.has(cacheKey)) return;

        try {
            void this.generateAudioBlobUrl(normalized, voice, speed);
        } catch {}
    }

    /**
     * Synthesizes audio for a board text via the Official KittenML Cloud API.
     */
    public async generateAudioBlobUrl(
        text: string, 
        voice = 'Bella', 
        speed = 1.1,
        signal?: AbortSignal
    ): Promise<string | null> {
        if (!text || !text.trim()) return null;
        const normalized = this.normalizeMathForSpeech(text).trim();
        const cacheKey = `${voice}_${speed}_${normalized}`;

        if (this.audioCache.has(cacheKey)) {
            return this.audioCache.get(cacheKey)!;
        }

        const apiKey = this.getKittenApiKey();

        // 1. Try local/Vercel serverless proxy endpoint to prevent browser CORS blocks
        const endpoints = ['/api/speech', 'https://www.avelut.xyz/api/speech'];

        for (const endpoint of endpoints) {
            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                };
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: 'kitten-tts-mini-0.8',
                        voice: voice || 'Bella',
                        input: normalized,
                        response_format: 'mp3',
                        speed: speed || 1.1,
                    }),
                    signal,
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    console.warn(`[KittenTTS API] Endpoint ${endpoint} returned (${response.status}):`, errText);
                    continue; // Try next endpoint fallback
                }

                const arrayBuffer = await response.arrayBuffer();
                if (!arrayBuffer || arrayBuffer.byteLength === 0) continue;

                const blob = new Blob([arrayBuffer], { type: 'audio/mp3' });
                const url = URL.createObjectURL(blob);
                this.audioCache.set(cacheKey, url);
                return url;
            } catch (err: any) {
                if (err?.name === 'AbortError') {
                    return null;
                }
                // Try next endpoint fallback
            }
        }

        console.error('[KittenTTS API] All speech generation endpoints failed.');
        return null;
    }

    /**
     * Normalizes LaTeX math, Greek letters, and formulas into spoken phonemes.
     */
    public normalizeMathForSpeech(text: string): string {
        if (!text) return '';
        return text
            .replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ')
            .replace(/\$([^\$]+)\$/g, ' $1 ')
            .replace(/\\text\{([^\}]+)\}/g, '$1')
            .replace(/\\frac\{([^\}]+)\}\{([^\}]+)\}/g, '$1 over $2')
            .replace(/\\sqrt\{([^\}]+)\}/g, 'square root of $1')
            .replace(/v_f/g, 'v final')
            .replace(/v_i/g, 'v initial')
            .replace(/F_\{net\}|F_net/g, 'net force')
            .replace(/\\theta/g, 'theta')
            .replace(/\\Delta/g, 'delta ')
            .replace(/\\alpha/g, 'alpha')
            .replace(/\\beta/g, 'beta')
            .replace(/\\pi/g, 'pi')
            .replace(/\^2/g, ' squared')
            .replace(/\^3/g, ' cubed')
            .replace(/m\/s\^2|\\text\{m\/s\}\^2/g, 'meters per second squared')
            .replace(/m\/s|\\text\{m\/s\}/g, 'meters per second')
            .replace(/kg/g, 'kilograms')
            .replace(/=/g, ' equals ')
            .replace(/\+/g, ' plus ')
            .replace(/-/g, ' minus ')
            .replace(/\*/g, ' times ')
            .replace(/#/g, '')
            .replace(/\*\*/g, '')
            .replace(/\[\/?(diagram|visual|table|highlight)\]/gi, '')
            .replace(/`{1,3}[^`]*`{1,3}/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Splits text into coherent sentences for low-latency streamed speech during live student Q&A.
     */
    public splitIntoSentences(text: string): string[] {
        if (!text) return [];
        return text
            .split(/(?<=[.!?])\s+|\n+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    /**
     * Streams speech for live interactions / questions with zero crackling and instant first-sentence playback.
     */
    public streamSpeech(
        text: string,
        options?: WebGpuVoiceOptions
    ): { stop: () => void } {
        this.stop();

        const spokenText = options?.cleanText !== false ? this.normalizeMathForSpeech(text) : text;
        if (!spokenText) {
            options?.onEnd?.();
            return { stop: () => {} };
        }

        const sessionId = ++this.activeSessionId;
        const sentences = this.splitIntoSentences(spokenText);
        let isStopped = false;
        let hasFiredStart = false;

        const abortController = new AbortController();
        this.activeAbortController = abortController;

        const stop = () => {
            isStopped = true;
            abortController.abort();
            if (this.activeSessionId === sessionId) {
                this.activeSessionId++;
            }
            if (this.currentAudioElement) {
                try {
                    this.currentAudioElement.pause();
                    this.currentAudioElement.currentTime = 0;
                } catch {}
                this.currentAudioElement = null;
            }
        };

        const playIndex = async (index: number) => {
            if (isStopped || this.activeSessionId !== sessionId) return;

            if (index >= sentences.length) {
                options?.onEnd?.();
                return;
            }

            const sentence = sentences[index];
            const voice = options?.voice || 'Bella';
            const speed = options?.speed || 1.1;

            // Pipeline pre-fetch: trigger next sentence stream ahead of time
            if (index + 1 < sentences.length) {
                void this.generateAudioBlobUrl(sentences[index + 1], voice, speed, abortController.signal);
            }

            const audioUrl = await this.generateAudioBlobUrl(sentence, voice, speed, abortController.signal);

            if (isStopped || this.activeSessionId !== sessionId) return;

            if (audioUrl) {
                const audio = new Audio(audioUrl);
                audio.playbackRate = speed;
                this.currentAudioElement = audio;

                audio.onplay = () => {
                    if (isStopped || this.activeSessionId !== sessionId) return;
                    if (!hasFiredStart) {
                        hasFiredStart = true;
                        options?.onStart?.();
                    }
                };

                audio.onended = () => {
                    if (isStopped || this.activeSessionId !== sessionId) return;
                    this.currentAudioElement = null;
                    void playIndex(index + 1);
                };

                audio.onerror = () => {
                    if (isStopped || this.activeSessionId !== sessionId) return;
                    this.currentAudioElement = null;
                    void playIndex(index + 1);
                };

                try {
                    await audio.play();
                } catch (err) {
                    console.warn('[KittenTTS] Stream sentence play exception:', err);
                    options?.onError?.(err);
                    void playIndex(index + 1);
                }
            } else {
                if (index === 0) {
                    options?.onError?.(new Error('Audio stream generation failed'));
                }
                void playIndex(index + 1);
            }
        };

        void playIndex(0);

        return { stop };
    }

    /**
     * Synthesizes and plays a single cohesive board audio block.
     */
    public speak(
        text: string,
        options?: WebGpuVoiceOptions
    ): { stop: () => void } {
        this.stop();

        const spokenText = options?.cleanText !== false ? this.normalizeMathForSpeech(text) : text;
        if (!spokenText) {
            options?.onEnd?.();
            return { stop: () => {} };
        }

        const sessionId = ++this.activeSessionId;
        let isStopped = false;
        let hasFiredStart = false;

        const abortController = new AbortController();
        this.activeAbortController = abortController;

        const stop = () => {
            isStopped = true;
            abortController.abort();
            if (this.activeSessionId === sessionId) {
                this.activeSessionId++;
            }
            if (this.currentAudioElement) {
                try {
                    this.currentAudioElement.pause();
                    this.currentAudioElement.currentTime = 0;
                } catch {}
                this.currentAudioElement = null;
            }
        };

        const executeBoardAudio = async () => {
            const voice = options?.voice || 'Bella';
            const speed = options?.speed || 1.1;

            const audioUrl = await this.generateAudioBlobUrl(spokenText, voice, speed, abortController.signal);

            if (isStopped || this.activeSessionId !== sessionId) return;

            if (audioUrl) {
                const audio = new Audio(audioUrl);
                audio.playbackRate = speed;
                this.currentAudioElement = audio;

                audio.onplay = () => {
                    if (isStopped || this.activeSessionId !== sessionId) return;
                    if (!hasFiredStart) {
                        hasFiredStart = true;
                        options?.onStart?.();
                    }
                };

                audio.onended = () => {
                    if (isStopped || this.activeSessionId !== sessionId) return;
                    this.currentAudioElement = null;
                    options?.onEnd?.();
                };

                audio.onerror = (err) => {
                    if (isStopped || this.activeSessionId !== sessionId) return;
                    this.currentAudioElement = null;
                    options?.onError?.(err);
                };

                try {
                    await audio.play();
                } catch (playErr) {
                    console.warn('[KittenTTS] Audio play exception:', playErr);
                    this.currentAudioElement = null;
                    options?.onError?.(playErr);
                }
            } else {
                options?.onError?.(new Error('Audio generation failed'));
            }
        };

        void executeBoardAudio();

        return { stop };
    }
}

// Backward-compatible aliases
export const KittenWebGpuEngine = KittenCloudTtsEngine;
export const kittenWebGpu = new KittenCloudTtsEngine();
export const kittenCloudTts = kittenWebGpu;
