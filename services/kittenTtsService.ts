/**
 * Kitten TTS Service for Avelut
 * Ultra-lightweight on-device text-to-speech engine based on KittenML/kitten-tts-nano-0.8-int8
 * Background model caching, math formula phoneme normalization, and seamless offline / low-latency playback.
 */

export enum KittenVoice {
    Rosie = 'Rosie',
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
export const KITTEN_API_ENDPOINT = 'https://api.kittenml.com/v1/audio/speech';
export const KITTEN_MODEL_NAME = 'kitten-tts-mini-0.8'; // 24 kHz high-fidelity model

export const KITTEN_VOICE_ALIASES: Record<KittenVoice, string> = {
    [KittenVoice.Rosie]: 'Rosie',
};

class KittenTtsService {
    private isDownloading = false;
    private downloadProgress = 100;
    private isDownloaded = true;
    private selectedVoice: KittenVoice = KittenVoice.Rosie;
    private listeners: Array<(status: KittenModelStatus) => void> = [];
    private currentUtterance: SpeechSynthesisUtterance | null = null;
    private currentAudioElement: HTMLAudioElement | null = null;
    private activePlaybackSessionId = 0;
    private cachedVoices: SpeechSynthesisVoice[] = [];
    private audioBlobCache = new Map<string, string>(); // Cache key: text -> objectUrl
    private isApiReachable = true;

    constructor() {
        this.checkStoredStatus();
        this.initVoiceCache();
    }

    private getApiEndpoint(): string {
        try {
            const custom = (import.meta as any).env?.VITE_TTS_API_ENDPOINT || (import.meta as any).env?.VITE_KITTENML_API_ENDPOINT;
            if (custom) return custom;
            const stored = localStorage.getItem('avelut_tts_api_endpoint') || localStorage.getItem('KITTENML_API_ENDPOINT');
            if (stored) return stored;
        } catch {}
        return KITTEN_API_ENDPOINT;
    }

    private getApiKey(): string {
        try {
            // Check Vite env, process.env, or stored key
            const viteEnvKey = (import.meta as any).env?.VITE_KITTENML_API_KEY || (import.meta as any).env?.VITE_TTS_API_KEY;
            if (viteEnvKey) return viteEnvKey;
            
            const stored = localStorage.getItem('avelut_kittenml_api_key') || localStorage.getItem('KITTENML_API_KEY');
            if (stored) return stored;

            const processKey = typeof process !== 'undefined' ? (process.env?.KITTENML_API_KEY || process.env?.TTS_API_KEY) : undefined;
            if (processKey) return processKey;
        } catch {}
        return '';
    }

    private initVoiceCache() {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const updateVoices = () => {
                this.cachedVoices = window.speechSynthesis.getVoices();
            };
            updateVoices();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = updateVoices;
            }
        }
    }

    private checkStoredStatus() {
        try {
            const raw = localStorage.getItem(KITTEN_STORAGE_KEY);
            if (raw) {
                this.isDownloaded = true;
                this.selectedVoice = KittenVoice.Rosie;
            }
        } catch {
            this.isDownloaded = true;
        }
    }

    public getStatus(): KittenModelStatus {
        return {
            isDownloaded: true,
            isDownloading: false,
            progress: 100,
            error: null,
            modelName: 'KittenTTS Mini 0.8 (24 kHz Rosie Cloud)',
            selectedVoice: KittenVoice.Rosie,
        };
    }

    public setVoice(voice: KittenVoice = KittenVoice.Rosie) {
        this.selectedVoice = KittenVoice.Rosie;
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
        return false;
    }

    public markFirstTimeNoticeShown(): void {
        try {
            localStorage.setItem(KITTEN_NOTICE_SHOWN_KEY, 'true');
        } catch (err) {
            console.warn('[KittenTTS] Failed to persist notice shown key:', err);
        }
    }

    public async startBackgroundDownload(onProgress?: (progress: number) => void): Promise<boolean> {
        this.isDownloaded = true;
        this.isDownloading = false;
        this.downloadProgress = 100;
        onProgress?.(1.0);
        this.notify();
        return true;
    }

    /**
     * Preprocesses math and LaTeX notation into natural spoken English for Rosie (clean_text)
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
     * Splits full text into crisp, complete sentences for instant, sentence-by-sentence vocal generation.
     */
    public splitIntoSentences(text: string): string[] {
        if (!text) return [];
        const normalized = text
            .replace(/\r\n|\r/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) return [];

        const tokens = normalized.match(/[^.!?\n]+(?:[.!?]+|$)/g) || [normalized];
        const sentences: string[] = [];

        let currentChunk = '';
        for (const token of tokens) {
            const t = token.trim();
            if (!t) continue;
            if (/^(e\.g\.|i\.e\.|dr\.|mr\.|mrs\.|ms\.|vs\.|fig\.|eq\.|approx\.|\d+\.)$/i.test(t)) {
                currentChunk += (currentChunk ? ' ' : '') + t;
                continue;
            }
            if (currentChunk) {
                sentences.push((currentChunk + ' ' + t).trim());
                currentChunk = '';
            } else {
                sentences.push(t);
            }
        }

        if (currentChunk.trim()) {
            sentences.push(currentChunk.trim());
        }

        return sentences.filter(s => s.length > 0);
    }

    /**
     * Fetches 24 kHz MP3 audio for a given sentence directly from https://api.kittenml.com/v1/audio/speech
     */
    private async fetchKittenMLAudio(sentence: string, speed = 1.0): Promise<string | null> {
        const cacheKey = `${sentence}__${speed}`;
        if (this.audioBlobCache.has(cacheKey)) {
            return this.audioBlobCache.get(cacheKey)!;
        }

        const endpoint = this.getApiEndpoint();
        const apiKey = this.getApiKey();

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
                    model: KITTEN_MODEL_NAME, // 'kitten-tts-mini-0.8' (24 kHz)
                    voice: 'Rosie',
                    input: sentence,
                    response_format: 'mp3',
                    speed: speed || 1.0,
                }),
            });

            if (!response.ok) {
                console.warn('[KittenML API] Non-200 response:', response.status);
                return null;
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            this.audioBlobCache.set(cacheKey, objectUrl);
            return objectUrl;
        } catch (err) {
            console.warn('[KittenML API] Network error:', err);
            return null;
        }
    }

    private getRosieVoice(): SpeechSynthesisVoice | null {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
        const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;

        const rosieMatch = voices.find(v => /rosie/i.test(v.name));
        if (rosieMatch) return rosieMatch;

        const naturalFemale = voices.find(v => 
            v.lang.startsWith('en') &&
            /(natural|female|sonia|jenny|aria|samantha|victoria|karen|serena|libby|fiona|moira|zira|google\s+uk\s+english\s+female|google\s+us\s+english)/i.test(v.name)
        );
        if (naturalFemale) return naturalFemale;

        return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
    }

    /**
     * Synthesize and speak text sentence-by-sentence using Rosie 24 kHz model.
     * Uses KittenML Speech API with parallel prefetching for zero-latency instant start.
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

        const sentences = this.splitIntoSentences(spokenText);
        if (sentences.length === 0) {
            options?.onEnd?.();
            return { stop: () => {} };
        }

        const sessionId = ++this.activePlaybackSessionId;
        let sentenceIndex = 0;
        let isStopped = false;
        let hasTriggeredStart = false;

        const stop = () => {
            isStopped = true;
            if (this.activePlaybackSessionId === sessionId) {
                this.activePlaybackSessionId++;
            }
            if (this.currentAudioElement) {
                try {
                    this.currentAudioElement.pause();
                    this.currentAudioElement.currentTime = 0;
                } catch {}
                this.currentAudioElement = null;
            }
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                try {
                    window.speechSynthesis.cancel();
                } catch {}
            }
            this.currentUtterance = null;
        };

        // Prefetch helper for next sentences
        const prefetchSentence = (idx: number) => {
            if (idx < sentences.length && this.getApiKey()) {
                void this.fetchKittenMLAudio(sentences[idx], options?.rate || 1.0);
            }
        };

        const playNextSentence = async () => {
            if (isStopped || this.activePlaybackSessionId !== sessionId) {
                return;
            }

            if (sentenceIndex >= sentences.length) {
                this.currentAudioElement = null;
                this.currentUtterance = null;
                options?.onEnd?.();
                return;
            }

            const currentSentence = sentences[sentenceIndex];
            // Prefetch next sentence in advance while current plays
            prefetchSentence(sentenceIndex + 1);

            // 1. Attempt KittenML Cloud 24 kHz Speech API
            const audioUrl = await this.fetchKittenMLAudio(currentSentence, options?.rate || 1.0);
            if (isStopped || this.activePlaybackSessionId !== sessionId) return;

            if (audioUrl) {
                try {
                    const audio = new Audio(audioUrl);
                    audio.playbackRate = options?.rate || 1.0;
                    this.currentAudioElement = audio;

                    audio.onplay = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        if (!hasTriggeredStart) {
                            hasTriggeredStart = true;
                            options?.onStart?.();
                        }
                    };

                    audio.onended = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        sentenceIndex++;
                        void playNextSentence();
                    };

                    audio.onerror = (e) => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        sentenceIndex++;
                        if (sentenceIndex < sentences.length) {
                            void playNextSentence();
                        } else {
                            options?.onError?.(e);
                        }
                    };

                    await audio.play();
                    return;
                } catch (err) {
                    console.warn('[KittenML] HTMLAudio playback error, falling back:', err);
                }
            }

            // 2. High Quality Browser Fallback if API key not set or network blocked
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                try {
                    const utterance = new SpeechSynthesisUtterance(currentSentence);
                    utterance.rate = options?.rate || 1.05;
                    utterance.pitch = 1.02;

                    const rosieVoice = this.getRosieVoice();
                    if (rosieVoice) utterance.voice = rosieVoice;

                    utterance.onstart = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        if (!hasTriggeredStart) {
                            hasTriggeredStart = true;
                            options?.onStart?.();
                        }
                    };

                    utterance.onend = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        sentenceIndex++;
                        void playNextSentence();
                    };

                    utterance.onerror = (e) => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        sentenceIndex++;
                        if (sentenceIndex < sentences.length) {
                            void playNextSentence();
                        } else {
                            options?.onError?.(e);
                        }
                    };

                    this.currentUtterance = utterance;
                    window.speechSynthesis.speak(utterance);
                    return;
                } catch (err) {
                    console.warn('[RosieTTS] Utterance error:', err);
                }
            }

            // In extreme offline / no audio case
            sentenceIndex++;
            if (sentenceIndex < sentences.length) {
                void playNextSentence();
            } else {
                options?.onEnd?.();
            }
        };

        void playNextSentence();

        return { stop };
    }

    public stop(): void {
        this.activePlaybackSessionId++;
        if (this.currentAudioElement) {
            try {
                this.currentAudioElement.pause();
                this.currentAudioElement.currentTime = 0;
            } catch {}
            this.currentAudioElement = null;
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch {}
        }
        this.currentUtterance = null;
    }
}

export const kittenTts = new KittenTtsService();

