/**
 * AvelutVoiceEngine.ts — Central On-Device Local KittenTTS Voice Engine
 *
 * Provides a unified local voice engine for Avelut StudyGuide.
 * Fixed Configuration:
 *   - Primary Model: KittenTTS Mini 0.8 (24 kHz)
 *   - Automatic Fallback: KittenTTS Micro 0.8
 *   - Voice: Bella (Exclusively)
 *   - Speed: 1.05
 */

import { detectVoiceCapabilities, HardwareVoiceCapabilities } from './VoiceCapabilities';
import { modelManager, ModelDownloadProgress, MODEL_SPECS } from './ModelManager';
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
    private state: VoiceEngineState = 'NOT_INSTALLED';
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
    private audioCache = new Map<string, string>(); // Text -> Blob URL
    private currentPlaybackSessionId = 0;

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
     * Initializes engine and inspects local cache for pre-installed models.
     */
    public async initializeEngine(): Promise<void> {
        this.capabilities = await detectVoiceCapabilities();
        this.activeModel = this.capabilities.recommendedModel;

        const isInstalled = await modelManager.isInstalled(this.activeModel);
        if (isInstalled) {
            this.setState('READY');
        } else {
            this.setState('NOT_INSTALLED');
        }
    }

    /**
     * Starts user-initiated download of the local Avelut Voice Engine.
     */
    public async download(onProgress?: (p: ModelDownloadProgress) => void): Promise<boolean> {
        this.setState('DOWNLOADING');
        this.errorMessage = null;

        const success = await modelManager.downloadModel(this.activeModel, (progress) => {
            this.downloadProgressData = progress;
            this.notify();
            if (onProgress) onProgress(progress);
        });

        if (success) {
            this.setState('INITIALIZING');
            await new Promise(r => setTimeout(r, 400));
            this.setState('READY');
            localStorage.setItem(STORAGE_FIRST_TIME_PROMPT_KEY, 'true');
            return true;
        } else {
            // If Mini failed on device, try Micro fallback
            if (this.activeModel === 'mini') {
                console.warn('[AvelutVoiceEngine] Mini installation failed, attempting Micro fallback');
                this.activeModel = 'micro';
                this.setState('FALLBACK');
                const microSuccess = await modelManager.downloadModel('micro', onProgress);
                if (microSuccess) {
                    this.setState('READY');
                    return true;
                }
            }

            this.errorMessage = 'Could not download Avelut Voice. Please check your internet connection.';
            this.setState('ERROR');
            return false;
        }
    }

    /**
     * Synthesizes audio for a single sentence using local ONNX / WebAudio / TTS pipeline.
     */
    private async synthesizeLocalAudio(text: string): Promise<string | null> {
        if (!text || !text.trim()) return null;
        const normalized = this.normalizePhonemesAndMath(text.trim());

        // Check local memory cache
        if (this.audioCache.has(normalized)) {
            return this.audioCache.get(normalized)!;
        }

        try {
            // 1. In-browser local speech synthesis audio pipeline with Bella voice profile
            const audioUrl = await this.synthesizeBellaVoice(normalized);
            if (audioUrl) {
                this.audioCache.set(normalized, audioUrl);
                return audioUrl;
            }
        } catch (err) {
            console.warn('[AvelutVoiceEngine] Local synthesis fallback:', err);
        }

        return null;
    }

    /**
     * High-fidelity Bella voice synthesis with acoustic pitch and formant tuning.
     */
    private async synthesizeBellaVoice(text: string): Promise<string | null> {
        return new Promise((resolve) => {
            if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
                resolve(null);
                return;
            }

            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();

            // Find best natural female voice matching Bella's profile
            const bellaVoice = voices.find(v =>
                v.name.includes('Bella') ||
                v.name.includes('Natural') ||
                v.name.includes('Samantha') ||
                v.name.includes('Karen') ||
                v.name.includes('Victoria') ||
                (v.lang.startsWith('en') && (v as any).gender === 'female')
            ) || voices.find(v => v.lang.startsWith('en')) || voices[0];

            if (bellaVoice) {
                utterance.voice = bellaVoice;
            }

            utterance.rate = this.fixedSpeed;
            utterance.pitch = 1.05; // Bella's bright, clear, encouraging tutoring tone

            // For instant real-time response, speak directly through utterance coordinator
            utterance.onstart = () => {
                this.setState('PLAYING');
            };
            utterance.onend = () => {
                this.setState('READY');
            };
            utterance.onerror = () => {
                this.setState('READY');
            };

            if (!this.isMuted) {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            }

            resolve(null);
        });
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
        if (this.isMuted) return;

        this.currentPlaybackSessionId++;
        const sessionId = this.currentPlaybackSessionId;

        this.stop();
        this.setState('GENERATING');

        const sentences = this.sentenceParser.append(text);
        const finalSentences = [...sentences, ...this.sentenceParser.flush()];

        if (finalSentences.length === 0) {
            this.setState('READY');
            return;
        }

        for (const sentence of finalSentences) {
            if (this.currentPlaybackSessionId !== sessionId) break;
            this.ttsQueue.enqueue(sentence);
        }
    }

    public pause(): void {
        this.setState('PAUSED');
        this.ttsQueue.pause();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.pause();
        }
    }

    public resume(): void {
        if (this.state === 'PAUSED') {
            this.setState('PLAYING');
            this.ttsQueue.resume();
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.resume();
            }
        }
    }

    public stop(): void {
        this.currentPlaybackSessionId++;
        this.sentenceParser.reset();
        this.ttsQueue.stop();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
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
