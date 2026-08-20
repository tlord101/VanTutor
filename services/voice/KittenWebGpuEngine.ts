/**
 * KittenCloudTtsEngine (formerly KittenWebGpuEngine)
 * Official KittenML Cloud API Client for Avelut
 *
 * Exclusively uses the high-performance Official KittenML Cloud API:
 * Endpoint: https://api.kittenml.com/v1/audio/speech
 * Format: mp3 stream
 * Features: Smart paragraph batching, in-memory audio caching, and pipelined pre-fetching.
 * Zero WebGPU / WASM / ONNX runtime dependencies.
 */

export interface WebGpuVoiceOptions {
    voice?: string;
    speed?: number;
    cleanText?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
}

export class KittenCloudTtsEngine {
    private currentAudioElement: HTMLAudioElement | null = null;
    private activeSessionId = 0;
    private audioCache = new Map<string, string>(); // Cache key -> Blob URL

    private getKittenApiKey(): string | null {
        try {
            const cached = localStorage.getItem('avelut_app_settings');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.kittenml_api_key && typeof parsed.kittenml_api_key === 'string' && parsed.kittenml_api_key.trim()) {
                    return parsed.kittenml_api_key.trim();
                }
            }
        } catch {}

        try {
            const envKey = (import.meta as any)?.env?.VITE_KITTENML_API_KEY;
            if (envKey && typeof envKey === 'string' && envKey.trim()) {
                return envKey.trim();
            }
        } catch {}

        return null;
    }

    public async initialize(): Promise<boolean> {
        return true;
    }

    public isReady(): boolean {
        return true;
    }

    public stop(): void {
        this.activeSessionId++;
        if (this.currentAudioElement) {
            try {
                this.currentAudioElement.pause();
                this.currentAudioElement.currentTime = 0;
            } catch {}
            this.currentAudioElement = null;
        }
    }

    /**
     * Synthesizes audio for text via the Official KittenML Cloud API.
     */
    public async generateAudioBlobUrl(text: string, voice = 'Bella', speed = 1.1): Promise<string | null> {
        if (!text || !text.trim()) return null;
        const normalized = text.trim();
        const cacheKey = `${voice}_${speed}_${normalized}`;

        if (this.audioCache.has(cacheKey)) {
            return this.audioCache.get(cacheKey)!;
        }

        const apiKey = this.getKittenApiKey();
        if (!apiKey) {
            console.warn('[KittenTTS API] No KittenML API Key found in App Settings or environment.');
            return null;
        }

        try {
            const response = await fetch('https://api.kittenml.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'kitten-tts-mini-0.8',
                    voice: voice || 'Bella',
                    input: normalized,
                    response_format: 'mp3',
                    speed: speed || 1.1,
                }),
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                console.error(`[KittenTTS API] Error (${response.status}):`, errText);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'audio/mp3' });
            const url = URL.createObjectURL(blob);
            this.audioCache.set(cacheKey, url);
            return url;
        } catch (err) {
            console.error('[KittenTTS API] Network/Generation error:', err);
            return null;
        }
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
     * Combines sentences into optimized natural chunks to minimize API request overhead.
     */
    public splitIntoChunks(text: string): string[] {
        if (!text) return [];
        const rawSentences = text
            .split(/(?<=[.!?])\s+|\n+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (rawSentences.length <= 1) return rawSentences;

        const chunks: string[] = [];
        let currentChunk = '';

        for (const sentence of rawSentences) {
            if (!currentChunk) {
                currentChunk = sentence;
            } else if ((currentChunk.length + sentence.length) < 220) {
                currentChunk += ' ' + sentence;
            } else {
                chunks.push(currentChunk);
                currentChunk = sentence;
            }
        }
        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * Synthesizes and plays speech with background pipelined pre-fetching.
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
        const chunks = this.splitIntoChunks(spokenText);
        let isStopped = false;
        let hasFiredStart = false;

        const stop = () => {
            isStopped = true;
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

        // Audio playback loop with pipelined next-chunk pre-fetching
        const playChunk = async (index: number) => {
            if (isStopped || this.activeSessionId !== sessionId) return;

            if (index >= chunks.length) {
                options?.onEnd?.();
                return;
            }

            const chunk = chunks[index];
            const voice = options?.voice || 'Bella';
            const speed = options?.speed || 1.1;

            // Pipeline pre-fetch: pre-request NEXT chunk while current chunk is loading/playing
            if (index + 1 < chunks.length) {
                void this.generateAudioBlobUrl(chunks[index + 1], voice, speed);
            }

            const audioUrl = await this.generateAudioBlobUrl(chunk, voice, speed);

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
                    void playChunk(index + 1);
                };

                audio.onerror = () => {
                    if (isStopped || this.activeSessionId !== sessionId) return;
                    this.currentAudioElement = null;
                    void playChunk(index + 1);
                };

                try {
                    await audio.play();
                } catch {
                    if (!hasFiredStart) {
                        hasFiredStart = true;
                        options?.onStart?.();
                    }
                    void playChunk(index + 1);
                }
            } else {
                if (!hasFiredStart && index === 0) {
                    hasFiredStart = true;
                    options?.onError?.(new Error('Audio generation failed'));
                }
                void playChunk(index + 1);
            }
        };

        void playChunk(0);

        return { stop };
    }
}

// Backward-compatible aliases
export const KittenWebGpuEngine = KittenCloudTtsEngine;
export const kittenWebGpu = new KittenCloudTtsEngine();
export const kittenCloudTts = kittenWebGpu;
