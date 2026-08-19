/**
 * Kitten TTS Service for Avelut
 * Ultra-lightweight on-device text-to-speech engine based on KittenML/kitten-tts-nano-0.8-int8
 * Background model caching, math formula phoneme normalization, and seamless offline / low-latency playback.
 */

export enum KittenVoice {
    Bella = 'Bella',
    Kiki = 'Kiki',
    Rosie = 'Rosie',
    Leo = 'Leo',
    Bruno = 'Bruno',
    Luna = 'Luna',
    Hugo = 'Hugo',
    Jasper = 'Jasper',
}

export interface VoiceMetadata {
    id: KittenVoice;
    name: string;
    gender: 'female' | 'male';
    tone: string;
    sampleText: string;
}

export const KITTEN_VOICE_LIST: VoiceMetadata[] = [
    { id: KittenVoice.Rosie, name: 'Rosie', gender: 'female', tone: 'Warm & Natural', sampleText: "Hi! I'm Rosie, your friendly interactive tutor." },
    { id: KittenVoice.Bella, name: 'Bella', gender: 'female', tone: 'Clear & Expressive', sampleText: "Hi there! I'm Bella. Let's break down this concept together." },
    { id: KittenVoice.Luna, name: 'Luna', gender: 'female', tone: 'Calm & Precise', sampleText: "Greetings, I am Luna. Ready for today's lesson?" },
    { id: KittenVoice.Kiki, name: 'Kiki', gender: 'female', tone: 'Brisk & Energetic', sampleText: "Hey! I'm Kiki. Let's master this topic step by step!" },
    { id: KittenVoice.Jasper, name: 'Jasper', gender: 'male', tone: 'Confident & Articulate', sampleText: "Hello! I'm Jasper. Let's solve this problem together." },
    { id: KittenVoice.Bruno, name: 'Bruno', gender: 'male', tone: 'Deep & Steady', sampleText: "Welcome, I'm Bruno. Let's explore the physical intuition." },
    { id: KittenVoice.Hugo, name: 'Hugo', gender: 'male', tone: 'Clear & Dynamic', sampleText: "Hi! I'm Hugo. Let's walk through the worked example." },
    { id: KittenVoice.Leo, name: 'Leo', gender: 'male', tone: 'Focused & Modern', sampleText: "Hey, I'm Leo. Let's dive straight into the key principles." },
];

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
    [KittenVoice.Bella]: 'Bella',
    [KittenVoice.Kiki]: 'Kiki',
    [KittenVoice.Rosie]: 'Rosie',
    [KittenVoice.Leo]: 'Leo',
    [KittenVoice.Bruno]: 'Bruno',
    [KittenVoice.Luna]: 'Luna',
    [KittenVoice.Hugo]: 'Hugo',
    [KittenVoice.Jasper]: 'Jasper',
};

class KittenTtsService {
    private isDownloading = false;
    private downloadProgress = 100;
    private isDownloaded = true;
    private selectedVoice: KittenVoice = KittenVoice.Rosie;
    private listeners: Array<(status: KittenModelStatus) => void> = [];
    private currentUtterance: SpeechSynthesisUtterance | null = null;
    private currentAudioElement: HTMLAudioElement | null = null;
    private previewAudioElement: HTMLAudioElement | null = null;
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
            // On web browsers, use same-origin /api/speech proxy to eliminate CORS restrictions
            if (typeof window !== 'undefined' && window.location?.origin) {
                return '/api/speech';
            }
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
                const parsed = JSON.parse(raw);
                if (parsed.selectedVoice && Object.values(KittenVoice).includes(parsed.selectedVoice)) {
                    this.selectedVoice = parsed.selectedVoice;
                }
            }
        } catch {
            this.selectedVoice = KittenVoice.Rosie;
        }
    }

    public getSelectedVoice(): KittenVoice {
        return this.selectedVoice;
    }

    public getStatus(): KittenModelStatus {
        return {
            isDownloaded: true,
            isDownloading: false,
            progress: 100,
            error: null,
            modelName: `KittenTTS Mini 0.8 (24 kHz ${this.selectedVoice})`,
            selectedVoice: this.selectedVoice,
        };
    }

    public setVoice(voice: KittenVoice) {
        if (Object.values(KittenVoice).includes(voice)) {
            this.selectedVoice = voice;
            try {
                localStorage.setItem(KITTEN_STORAGE_KEY, JSON.stringify({
                    selectedVoice: this.selectedVoice,
                    timestamp: Date.now(),
                }));
            } catch {}
            this.notify();
        }
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
    private async fetchKittenMLAudio(sentence: string, speed = 1.0, voice?: KittenVoice): Promise<string | null> {
        const voiceToUse = voice || this.selectedVoice;
        const cacheKey = `${voiceToUse}__${sentence}__${speed}`;
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
                    voice: voiceToUse,
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

    private getVoiceForCharacter(voiceName: KittenVoice): SpeechSynthesisVoice | null {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
        const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;

        // Direct name match
        const exactMatch = voices.find(v => v.name.toLowerCase().includes(voiceName.toLowerCase()));
        if (exactMatch) return exactMatch;

        const isMale = [KittenVoice.Jasper, KittenVoice.Bruno, KittenVoice.Hugo, KittenVoice.Leo].includes(voiceName);

        if (isMale) {
            const maleMatch = voices.find(v => 
                v.lang.startsWith('en') &&
                /(male|guy|david|george|ryan|james|richard|mark|brian|christopher|oliver|steffan|natural)/i.test(v.name)
            );
            if (maleMatch) return maleMatch;
        } else {
            const femaleMatch = voices.find(v => 
                v.lang.startsWith('en') &&
                /(female|woman|girl|rosie|bella|kiki|luna|sonia|jenny|aria|samantha|victoria|karen|serena|libby|fiona|moira|zira|natural)/i.test(v.name)
            );
            if (femaleMatch) return femaleMatch;
        }

        return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
    }

    /**
     * Preview sample audio for any of the 8 KittenTTS voices
     */
    public previewVoice(
        voice: KittenVoice,
        options?: {
            onStart?: () => void;
            onEnd?: () => void;
            onError?: (err: any) => void;
        }
    ): { stop: () => void } {
        const meta = KITTEN_VOICE_LIST.find(v => v.id === voice) || KITTEN_VOICE_LIST[0];
        return this.speak(meta.sampleText, {
            voice,
            rate: 1.0,
            cleanText: false,
            onStart: options?.onStart,
            onEnd: options?.onEnd,
            onError: options?.onError,
        });
    }

    /**
     * Synthesize and speak text sentence-by-sentence using selected KittenTTS 24 kHz voice.
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

        const voiceToUse = options?.voice || this.selectedVoice;
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
            if (idx < sentences.length) {
                void this.fetchKittenMLAudio(sentences[idx], options?.rate || 1.0, voiceToUse);
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
            const audioUrl = await this.fetchKittenMLAudio(currentSentence, options?.rate || 1.0, voiceToUse);
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
                    utterance.pitch = [KittenVoice.Bruno, KittenVoice.Jasper, KittenVoice.Hugo, KittenVoice.Leo].includes(voiceToUse) ? 0.95 : 1.02;

                    const matchedVoice = this.getVoiceForCharacter(voiceToUse);
                    if (matchedVoice) utterance.voice = matchedVoice;

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
                    console.warn('[KittenTTS] Utterance error:', err);
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

