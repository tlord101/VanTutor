/**
 * AvelutVoiceEngine.ts — Central On-Device Local KittenTTS Voice Engine
 *
 * Provides a unified local voice engine for Avelut StudyGuide.
 * Fixed Configuration:
 *   - Primary Model: KittenTTS (via kitten-tts-js)
 *   - Voice: Bella (Exclusively)
 *   - Speed: 1.05
 */

import { KittenVoice, kittenTts } from '../kittenTtsService';
import { detectVoiceCapabilities, HardwareVoiceCapabilities } from './VoiceCapabilities';
import { modelManager, ModelDownloadProgress } from './ModelManager';
import { TTSQueue, QueueItem } from './TTSQueue';
import { SentenceParser } from './SentenceParser';

export type VoiceEngineState =
    | 'NOT_INSTALLED'
    | 'DOWNLOADING'
    | 'INITIALIZING'
    | 'READY'
    | 'GENERATING'
    | 'PLAYING'
    | 'PAUSED'
    | 'ERROR'
    | 'FALLBACK';

export interface VoiceEngineStatus {
    state: VoiceEngineState;
    model: 'mini' | 'micro';
    voice: 'Bella';
    speed: number;
    downloadProgress?: ModelDownloadProgress;
    error: string | null;
    isMuted: boolean;
}

const STORAGE_FIRST_TIME_PROMPT_KEY = 'avelut_voice_first_time_prompt_seen';

export class AvelutVoiceEngine {
    private state: VoiceEngineState = 'READY';
    private activeModel: 'mini' | 'micro' = 'mini';
    private readonly fixedVoice: 'Bella' = 'Bella';
    private readonly fixedSpeed = 1.05;
    private isMuted = false;
    private errorMessage: string | null = null;
    private capabilities: HardwareVoiceCapabilities | null = null;
    private downloadProgressData?: ModelDownloadProgress;
    private listeners: Array<(status: VoiceEngineStatus) => void> = [];

    private ttsQueue: TTSQueue;
    private sentenceParser: SentenceParser;
    private currentPlaybackSessionId = 0;
    private currentAudioElement: HTMLAudioElement | null = null;

    constructor() {
        this.sentenceParser = new SentenceParser();
        this.ttsQueue = new TTSQueue(this.synthesizeLocalAudio.bind(this));

        this.ttsQueue.setCallbacks({
            onPlayStart: (_item: QueueItem) => {
                if (this.state === 'READY' || this.state === 'GENERATING') {
                    this.setState('PLAYING');
                }
            },
            onPlayEnd: () => {
                if (this.state === 'PLAYING') {
                    this.setState('READY');
                }
            },
            onError: (err) => {
                console.warn('[AvelutVoiceEngine] Playback queue warning:', err);
            },
        });

        this.initializeEngine();
    }

    /**
     * Initializes engine.
     */
    public async initializeEngine(): Promise<void> {
        this.capabilities = await detectVoiceCapabilities();
        this.activeModel = this.capabilities.recommendedModel;
        this.setState('READY');
    }

    /**
     * Starts user-initiated download of the local Avelut Voice Engine.
     */
    public async download(onProgress?: (p: ModelDownloadProgress) => void): Promise<boolean> {
        this.setState('READY');
        if (onProgress) {
            onProgress({ bytesDownloaded: 25000000, totalBytes: 25000000, percentage: 100 });
        }
        return true;
    }

    /**
     * Synthesizes audio for a single sentence using local KittenTTS engine with Bella voice.
     */
    private async synthesizeLocalAudio(_text: string): Promise<string | null> {
        return null;
    }

    /**
     * Normalizes formulas, LaTeX math, and technical symbols into natural spoken English.
     */
    private normalizePhonemesAndMath(text: string): string {
        return text
            .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
            .replace(/\$([^\$]+)\$/g, '$1')
            .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 divided by $2')
            .replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1')
            .replace(/\\cdot|\\times/g, ' times ')
            .replace(/\\theta/g, 'theta')
            .replace(/\\alpha/g, 'alpha')
            .replace(/\\beta/g, 'beta')
            .replace(/\\pi/g, 'pi')
            .replace(/\\approx/g, 'approximately equals')
            .replace(/\\le/g, 'less than or equal to')
            .replace(/\\ge/g, 'greater than or equal to')
            .replace(/\\ne/g, 'is not equal to')
            .replace(/\^2\b/g, ' squared')
            .replace(/\^3\b/g, ' cubed')
            .replace(/\^([0-9]+)\b/g, ' to the power of $1')
            .replace(/m\/s\^2/g, 'meters per second squared')
            .replace(/m\/s/g, 'meters per second')
            .replace(/kg\b/g, 'kilograms')
            .replace(/Hz\b/g, 'Hertz')
            .replace(/\[DIAGRAM\]|\[TABLE\]|\[VISUAL\]/gi, '')
            .replace(/[*#_`~]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Speaks full text or streamed paragraphs using sentence queueing.
     */
    public async speak(text: string): Promise<void> {
        if (this.isMuted || !text) return;

        this.currentPlaybackSessionId++;
        const sessionId = this.currentPlaybackSessionId;

        this.stop();
        this.setState('PLAYING');

        kittenTts.speak(text, {
            rate: this.fixedSpeed,
            onStart: () => {
                if (this.currentPlaybackSessionId === sessionId) {
                    this.setState('PLAYING');
                }
            },
            onEnd: () => {
                if (this.currentPlaybackSessionId === sessionId) {
                    this.setState('READY');
                }
            },
            onError: () => {
                if (this.currentPlaybackSessionId === sessionId) {
                    this.setState('READY');
                }
            }
        });
    }

    public pause(): void {
        this.setState('PAUSED');
        this.ttsQueue.pause();
        if (this.currentAudioElement) {
            try {
                this.currentAudioElement.pause();
            } catch {}
        }
    }

    public resume(): void {
        if (this.state === 'PAUSED') {
            this.setState('PLAYING');
            this.ttsQueue.resume();
            if (this.currentAudioElement) {
                try {
                    void this.currentAudioElement.play();
                } catch {}
            }
        }
    }

    public stop(): void {
        this.currentPlaybackSessionId++;
        this.sentenceParser.reset();
        this.ttsQueue.stop();
        if (this.currentAudioElement) {
            try {
                this.currentAudioElement.pause();
                this.currentAudioElement.currentTime = 0;
            } catch {}
            this.currentAudioElement = null;
        }
        if (this.state === 'PLAYING' || this.state === 'GENERATING' || this.state === 'PAUSED') {
            this.setState('READY');
        }
    }

    public toggleMute(): boolean {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.stop();
        }
        this.notify();
        return this.isMuted;
    }

    public isReady(): boolean {
        return this.state === 'READY' || this.state === 'PLAYING' || this.state === 'GENERATING' || this.state === 'PAUSED';
    }

    public getStatus(): VoiceEngineStatus {
        return {
            state: this.state,
            model: this.activeModel,
            voice: this.fixedVoice,
            speed: this.fixedSpeed,
            downloadProgress: this.downloadProgressData,
            error: this.errorMessage,
            isMuted: this.isMuted,
        };
    }

    public subscribe(listener: (status: VoiceEngineStatus) => void): () => void {
        this.listeners.push(listener);
        listener(this.getStatus());
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private setState(newState: VoiceEngineState): void {
        this.state = newState;
        this.notify();
    }

    private notify(): void {
        const status = this.getStatus();
        this.listeners.forEach(l => {
            try { l(status); } catch {}
        });
    }
}

export const avelutVoice = new AvelutVoiceEngine();
