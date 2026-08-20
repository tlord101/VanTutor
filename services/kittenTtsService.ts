/**
 * Kitten TTS Service for Avelut
 * Ultra-lightweight on-device text-to-speech engine running KittenTTS Micro (41 MB)
 * Background sentence audio generation queue with zero browser speech synthesis fallback.
 */

import { kittenWebGpu } from './voice/KittenWebGpuEngine';
import { modelManager, ModelDownloadProgress } from './voice/ModelManager';

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
    { id: KittenVoice.Bella, name: 'Bella', gender: 'female', tone: 'Clear & Expressive', sampleText: "Hi there! I'm Bella. Let's break down this concept together." },
    { id: KittenVoice.Rosie, name: 'Rosie', gender: 'female', tone: 'Warm & Natural', sampleText: "Hi! I'm Rosie, your friendly interactive tutor." },
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
    private selectedVoice: KittenVoice = KittenVoice.Bella;
    private listeners: Array<(status: KittenModelStatus) => void> = [];
    private isDownloading = false;
    private downloadProgress = 100;

    constructor() {
        this.selectedVoice = KittenVoice.Bella;
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
            modelName: 'KittenTTS Mini 0.8 (Official Cloud API)',
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
            try { l(status); } catch {}
        });
    }

    public async downloadModel(): Promise<boolean> {
        this.notify();
        return true;
    }

    public async startBackgroundDownload(onProgress?: (progress: number) => void): Promise<void> {
        if (onProgress) onProgress(100);
    }

    public isReady(): boolean {
        return kittenWebGpu.isReady();
    }

    public stop(): void {
        kittenWebGpu.stop();
    }

    /**
     * Synthesizes and speaks text using background-queued KittenTTS Micro on-device engine.
     * ZERO browser speechSynthesis fallback.
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
        return kittenWebGpu.speak(text, {
            voice: options?.voice || this.selectedVoice,
            speed: options?.rate || 1.2,
            cleanText: options?.cleanText ?? true,
            onStart: options?.onStart,
            onEnd: options?.onEnd,
            onError: options?.onError,
        });
    }

    public previewVoice(
        voice: KittenVoice,
        options?: {
            sampleText?: string;
            onStart?: () => void;
            onEnd?: () => void;
            onError?: (err: any) => void;
        }
    ): { stop: () => void } {
        const meta = KITTEN_VOICE_LIST.find(v => v.id === voice) || KITTEN_VOICE_LIST[0];
        const text = options?.sampleText || meta.sampleText;
        return this.speak(text, {
            voice,
            rate: 1.2,
            onStart: options?.onStart,
            onEnd: options?.onEnd,
            onError: options?.onError,
        });
    }
}

export const kittenTts = new KittenTtsService();
export { avelutVoice, AvelutVoiceEngine } from './voice/AvelutVoiceEngine';
export { modelManager } from './voice/ModelManager';
export { kittenWebGpu, KittenWebGpuEngine } from './voice/KittenWebGpuEngine';
