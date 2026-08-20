/**
 * Kitten TTS Service for Avelut
 * Ultra-lightweight on-device text-to-speech engine based on KittenTTS from kitten-tts-js
 * Background model caching, math formula phoneme normalization, and zero browser-default speechSynthesis dependency.
 */

import { KittenTTS, KittenVoice } from 'kitten-tts-js';

export { KittenVoice };

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
    private currentAudioElement: HTMLAudioElement | null = null;
    private activePlaybackSessionId = 0;
    private ttsInstance: KittenTTS | null = null;
    private ttsInitPromise: Promise<KittenTTS> | null = null;

    constructor() {
        this.selectedVoice = KittenVoice.Bella;
    }

    private async getTTS(): Promise<KittenTTS> {
        if (this.ttsInstance) return this.ttsInstance;
        if (!this.ttsInitPromise) {
            this.ttsInitPromise = KittenTTS.create();
        }
        this.ttsInstance = await this.ttsInitPromise;
        return this.ttsInstance;
    }

    public getSelectedVoice(): KittenVoice {
        return KittenVoice.Bella;
    }

    public getStatus(): KittenModelStatus {
        return {
            isDownloaded: this.isDownloaded,
            isDownloading: this.isDownloading,
            progress: this.downloadProgress,
            error: null,
            modelName: 'KittenTTS Nano (Bella)',
            selectedVoice: KittenVoice.Bella,
        };
    }

    public setVoice(voice: KittenVoice) {
        if (Object.values(KittenVoice).includes(voice)) {
            this.selectedVoice = KittenVoice.Bella; // Enforce Bella voice exclusively
            try {
                localStorage.setItem(KITTEN_STORAGE_KEY, JSON.stringify({
                    selectedVoice: KittenVoice.Bella,
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
        this.isDownloading = true;
        this.notify();
        try {
            await this.getTTS();
            this.isDownloaded = true;
            this.isDownloading = false;
            this.downloadProgress = 100;
        } catch (err) {
            console.error('[KittenTTS] Download failed:', err);
            this.isDownloading = false;
        }
        this.notify();
    }

    public async startBackgroundDownload(onProgress?: (progress: number) => void): Promise<void> {
        this.isDownloading = true;
        this.notify();
        try {
            await this.getTTS();
            this.isDownloaded = true;
            this.isDownloading = false;
            this.downloadProgress = 100;
            if (onProgress) onProgress(100);
        } catch (err) {
            console.error('[KittenTTS] Background download failed:', err);
            this.isDownloading = false;
        }
        this.notify();
    }

    public isReady(): boolean {
        return !!this.ttsInstance;
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
     * Synthesize and speak text on-device using KittenTTS with Bella model voice.
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

        const sessionId = ++this.activePlaybackSessionId;

        const stop = () => {
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
        };

        (async () => {
            try {
                const tts = await this.getTTS();
                if (this.activePlaybackSessionId !== sessionId) return;

                const audioBuffer = await tts.generate(spokenText, {
                    voice: KittenVoice.Bella, // Enforce Bella model voice exclusively
                    speed: options?.rate || 1.0,
                });

                if (this.activePlaybackSessionId !== sessionId) return;

                const blob = audioBuffer.toBlob();
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                this.currentAudioElement = audio;

                audio.onplay = () => {
                    if (this.activePlaybackSessionId === sessionId) {
                        options?.onStart?.();
                    }
                };

                audio.onended = () => {
                    if (this.activePlaybackSessionId === sessionId) {
                        this.currentAudioElement = null;
                        options?.onEnd?.();
                    }
                    URL.revokeObjectURL(audioUrl);
                };

                audio.onerror = (e) => {
                    if (this.activePlaybackSessionId === sessionId) {
                        this.currentAudioElement = null;
                        options?.onError?.(e);
                    }
                    URL.revokeObjectURL(audioUrl);
                };

                await audio.play();
            } catch (err) {
                console.error('[KittenTTS] Synthesis error:', err);
                if (this.activePlaybackSessionId === sessionId) {
                    options?.onError?.(err);
                }
            }
        })();

        return { stop };
    }

    public previewVoice(
        _voice: KittenVoice,
        options?: {
            sampleText?: string;
            onStart?: () => void;
            onEnd?: () => void;
            onError?: (err: any) => void;
        }
    ): { stop: () => void } {
        const text = options?.sampleText || "Hi there! I'm Bella. Let's break down this concept together.";
        return this.speak(text, {
            voice: KittenVoice.Bella,
            onStart: options?.onStart,
            onEnd: options?.onEnd,
            onError: options?.onError,
        });
    }
}

export const kittenTts = new KittenTtsService();
export { avelutVoice, AvelutVoiceEngine } from './voice/AvelutVoiceEngine';
export { modelManager } from './voice/ModelManager';
