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
    private selectedVoice: KittenVoice = KittenVoice.Bella;
    private listeners: Array<(status: KittenModelStatus) => void> = [];
    private currentUtterance: SpeechSynthesisUtterance | null = null;
    private currentAudioElement: HTMLAudioElement | null = null;
    private previewAudioElement: HTMLAudioElement | null = null;
    private activePlaybackSessionId = 0;
    private cachedVoices: SpeechSynthesisVoice[] = [];
    private audioBlobCache = new Map<string, string>(); // Cache key: text -> objectUrl
    private isApiReachable = true;
    private rateLimitUntil = 0;

    constructor() {
        this.selectedVoice = KittenVoice.Bella;
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

    public getSelectedVoice(): KittenVoice {
        return KittenVoice.Bella;
    }

    public getStatus(): KittenModelStatus {
        return {
            isDownloaded: true,
            isDownloading: false,
            progress: 100,
            error: null,
            modelName: 'KittenTTS Mini 0.8 (Bella)',
            selectedVoice: KittenVoice.Bella,
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
            try { l(status); } catch {}
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

    public async downloadModel(): Promise<void> {
        this.isDownloaded = true;
        this.isDownloading = false;
        this.downloadProgress = 100;
        this.notify();
    }

    public isReady(): boolean {
        return true;
    }

    public stop() {
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

    /**
     * Cleans up mathematical symbols, LaTeX commands, and notation into natural spoken English.
     */
    private normalizeMathForSpeech(text: string): string {
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
     * Splits full text into natural sentence chunks for background streaming synthesis.
     */
    private splitIntoSentences(text: string): string[] {
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
     * Fetches 24 kHz MP3 audio for the whole board text directly from the KittenML API with automatic retries.
     */
    private async fetchKittenMLAudio(text: string, speed = 1.0, voice?: KittenVoice, retries = 1): Promise<string | null> {
        // If recently rate-limited (429) or unauthorized, gracefully bypass to natural speech synthesis
        if (this.rateLimitUntil > Date.now()) {
            return null;
        }

        const voiceToUse = voice || this.selectedVoice;
        const cacheKey = `${voiceToUse}__${text}__${speed}`;
        if (this.audioBlobCache.has(cacheKey)) {
            return this.audioBlobCache.get(cacheKey)!;
        }

        const endpoint = this.getApiEndpoint();
        const apiKey = this.getApiKey();

        for (let attempt = 0; attempt <= retries; attempt++) {
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
                        input: text,
                        response_format: 'mp3',
                        speed: speed || 1.0,
                    }),
                });

                if (!response.ok) {
                    if (response.status === 429) {
                        this.rateLimitUntil = Date.now() + 60000;
                        console.warn(`[KittenML API] Rate limited (429), engaging natural speech synthesis fallback for 60s`);
                        return null;
                    }
                    if (response.status === 401 || response.status === 403) {
                        this.rateLimitUntil = Date.now() + 300000;
                        console.warn(`[KittenML API] Unauthorized (${response.status}), engaging natural speech synthesis fallback`);
                        return null;
                    }
                    console.warn(`[KittenML API] Attempt ${attempt + 1} returned status ${response.status}`);
                    if (attempt < retries) {
                        await new Promise(r => setTimeout(r, 400));
                        continue;
                    }
                    return null;
                }

                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                this.audioBlobCache.set(cacheKey, objectUrl);
                return objectUrl;
            } catch (err) {
                console.warn(`[KittenML API] Network error on attempt ${attempt + 1}:`, err);
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 400));
                    continue;
                }
                return null;
            }
        }
        return null;
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
     * Synthesize and speak text sentence-by-sentence in background pipeline using selected KittenTTS 24 kHz voice.
     * Starts immediately upon synthesizing sentence 0 while pre-fetching subsequent sentences in background.
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
        const sessionId = ++this.activePlaybackSessionId;
        let isStopped = false;
        let hasFiredStart = false;

        const sentences = this.splitIntoSentences(spokenText);
        if (sentences.length === 0) {
            options?.onEnd?.();
            return { stop: () => {} };
        }

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

        // Cache of audio promises for sentences
        const audioPromises = new Map<number, Promise<string | null>>();
        const prefetchSentenceAudio = (index: number) => {
            if (index >= sentences.length || audioPromises.has(index)) return;
            const sent = sentences[index];
            const p = this.fetchKittenMLAudio(sent, options?.rate || 1.0, voiceToUse, 1);
            audioPromises.set(index, p);
        };

        // Immediately start prefetching sentence 0 and sentence 1
        prefetchSentenceAudio(0);
        if (sentences.length > 1) {
            prefetchSentenceAudio(1);
        }

        const playSentenceIndex = async (index: number) => {
            if (isStopped || this.activePlaybackSessionId !== sessionId) return;

            if (index >= sentences.length) {
                this.currentAudioElement = null;
                options?.onEnd?.();
                return;
            }

            // Prefetch upcoming sentences
            prefetchSentenceAudio(index + 1);
            prefetchSentenceAudio(index + 2);

            const sentenceText = sentences[index];
            const audioUrl = await (audioPromises.get(index) || this.fetchKittenMLAudio(sentenceText, options?.rate || 1.0, voiceToUse, 1));

            if (isStopped || this.activePlaybackSessionId !== sessionId) return;

            if (audioUrl) {
                try {
                    const audio = new Audio(audioUrl);
                    this.currentAudioElement = audio;

                    audio.onplay = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        if (!hasFiredStart) {
                            hasFiredStart = true;
                            options?.onStart?.();
                        }
                    };

                    audio.onended = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        void playSentenceIndex(index + 1);
                    };

                    audio.onerror = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        playFallbackSentence(index);
                    };

                    await audio.play();
                    return;
                } catch (err) {
                    console.warn('[KittenTTS] Sentence play error, fallback:', err);
                }
            }

            // Fallback for this single sentence
            playFallbackSentence(index);
        };

        const playFallbackSentence = (index: number) => {
            if (isStopped || this.activePlaybackSessionId !== sessionId) return;

            if (index >= sentences.length) {
                this.currentUtterance = null;
                options?.onEnd?.();
                return;
            }

            const sentenceText = sentences[index];

            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                try {
                    const utterance = new SpeechSynthesisUtterance(sentenceText);
                    utterance.rate = 1.0;
                    utterance.pitch = [KittenVoice.Bruno, KittenVoice.Jasper, KittenVoice.Hugo, KittenVoice.Leo].includes(voiceToUse) ? 0.95 : 1.02;

                    const matchedVoice = this.getVoiceForCharacter(voiceToUse);
                    if (matchedVoice) utterance.voice = matchedVoice;

                    utterance.onstart = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        if (!hasFiredStart) {
                            hasFiredStart = true;
                            options?.onStart?.();
                        }
                    };

                    utterance.onend = () => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        this.currentUtterance = null;
                        void playSentenceIndex(index + 1);
                    };

                    utterance.onerror = (e) => {
                        if (isStopped || this.activePlaybackSessionId !== sessionId) return;
                        this.currentUtterance = null;
                        void playSentenceIndex(index + 1);
                    };

                    this.currentUtterance = utterance;
                    window.speechSynthesis.speak(utterance);
                    return;
                } catch (err) {
                    console.warn('[KittenTTS] Fallback utterance error:', err);
                }
            }

            void playSentenceIndex(index + 1);
        };

        void playSentenceIndex(0);

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
export { avelutVoice, AvelutVoiceEngine } from './voice/AvelutVoiceEngine';
export { modelManager } from './voice/ModelManager';


