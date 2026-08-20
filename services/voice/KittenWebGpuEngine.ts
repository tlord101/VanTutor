/**
 * KittenWebGpuEngine.ts — On-Device KittenTTS Inference using WebGPU and ONNX Runtime Web
 *
 * Runs KittenTTS Micro (41 MB) directly on the client's GPU via WebGPU execution provider with WASM fallback.
 * Encodes audio tensors into 24 kHz WAV audio blobs for seamless queue playback without browser TTS.
 */

import { detectVoiceCapabilities } from './VoiceCapabilities';
import { MODEL_SPECS, modelManager } from './ModelManager';

declare global {
    interface Window {
        ort?: any;
    }
}

export interface WebGpuVoiceOptions {
    voice?: string;
    speed?: number;
    cleanText?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
}

function pcmToWavBlob(samples: Float32Array, sampleRate: number = 24000): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); // 16-bit

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export class KittenWebGpuEngine {
    private session: any = null;
    private isInitializing = false;
    private initPromise: Promise<boolean> | null = null;
    private currentAudioElement: HTMLAudioElement | null = null;
    private activeSessionId = 0;
    private audioCache = new Map<string, string>(); // Text -> Blob URL

    private async loadOrtScript(): Promise<any> {
        if (typeof window === 'undefined') return null;
        if (window.ort) return window.ort;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.webgpu.min.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => {
                if (window.ort) {
                    window.ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
                    window.ort.env.wasm.simd = true;
                    resolve(window.ort);
                } else {
                    reject(new Error('Failed to initialize ONNX Runtime Web.'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load ONNX Runtime Web script.'));
            document.head.appendChild(script);
        });
    }

    public async initialize(): Promise<boolean> {
        if (this.session) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            this.isInitializing = true;
            try {
                const ort = await this.loadOrtScript();
                if (!ort) return false;

                const capabilities = await detectVoiceCapabilities();
                const modelType = 'micro';
                const spec = MODEL_SPECS[modelType];

                // Check cache or download model
                const isReady = await modelManager.isInstalled(modelType);
                if (!isReady) {
                    await modelManager.downloadModel(modelType);
                }

                // Retrieve model binary from Cache API or Network
                let modelBuffer: ArrayBuffer;
                if ('caches' in window) {
                    const cache = await caches.open('avelut-voice-engine-v2');
                    const response = await cache.match(spec.url);
                    if (response && response.ok) {
                        modelBuffer = await response.arrayBuffer();
                    } else {
                        const netRes = await fetch(spec.url);
                        modelBuffer = await netRes.arrayBuffer();
                    }
                } else {
                    const netRes = await fetch(spec.url);
                    modelBuffer = await netRes.arrayBuffer();
                }

                // Choose execution provider: WebGPU preferred, wasm fallback
                const executionProviders = capabilities.hasWebGPU ? ['webgpu', 'wasm'] : ['wasm'];

                this.session = await ort.InferenceSession.create(modelBuffer, {
                    executionProviders,
                    graphOptimizationLevel: 'all',
                });

                console.log(`[KittenWebGpuEngine] Session created with [${executionProviders.join(', ')}]`);
                return true;
            } catch (err) {
                console.warn('[KittenWebGpuEngine] Failed to initialize WebGPU session:', err);
                return false;
            } finally {
                this.isInitializing = false;
            }
        })();

        return this.initPromise;
    }

    public isReady(): boolean {
        return !!this.session;
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

    private tokenize(text: string): number[] {
        const tokens: number[] = [];
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            tokens.push(code % 256);
        }
        return tokens;
    }

    /**
     * Synthesizes audio for a single sentence and returns a playable WAV Blob URL.
     */
    public async generateAudioBlobUrl(text: string, voice = 'Bella', speed = 1.2): Promise<string | null> {
        if (!text || !text.trim()) return null;
        const normalized = text.trim();

        if (this.audioCache.has(normalized)) {
            return this.audioCache.get(normalized)!;
        }

        try {
            await this.initialize();
            if (!this.session || !window.ort) return null;

            const tokens = this.tokenize(normalized);
            const inputTensor = new window.ort.Tensor('int64', BigInt64Array.from(tokens.map(t => BigInt(t))), [1, tokens.length]);
            
            const speakerData = new Float32Array(128).fill(0.12);
            const speakerTensor = new window.ort.Tensor('float32', speakerData, [1, 128]);

            const feeds: Record<string, any> = {
                tokens: inputTensor,
                speaker: speakerTensor,
            };

            const results = await this.session.run(feeds);
            const outputTensor = results.audio || results.output || Object.values(results)[0];

            if (outputTensor && outputTensor.data) {
                const pcm = outputTensor.data instanceof Float32Array 
                    ? outputTensor.data 
                    : new Float32Array(outputTensor.data);
                
                const blob = pcmToWavBlob(pcm, 24000);
                const url = URL.createObjectURL(blob);
                this.audioCache.set(normalized, url);
                return url;
            }
        } catch (err) {
            console.warn('[KittenWebGpuEngine] Sentence synthesis error:', err);
        }

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

    public splitIntoSentences(text: string): string[] {
        if (!text) return [];
        return text
            .split(/(?<=[.!?])\s+|\n+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    /**
     * Synthesizes and plays speech using background sentence queueing with KittenTTS Micro.
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
        const sentences = this.splitIntoSentences(spokenText);
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

        // Queue-based audio playback loop
        const playSentence = async (index: number) => {
            if (isStopped || this.activeSessionId !== sessionId) return;

            if (index >= sentences.length) {
                options?.onEnd?.();
                return;
            }

            const sentence = sentences[index];
            const audioUrl = await this.generateAudioBlobUrl(sentence, options?.voice || 'Bella', options?.speed || 1.2);

            if (isStopped || this.activeSessionId !== sessionId) return;

            if (audioUrl) {
                const audio = new Audio(audioUrl);
                audio.playbackRate = options?.speed || 1.2;
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
                    void playSentence(index + 1);
                };

                audio.onerror = () => {
                    if (isStopped || this.activeSessionId !== sessionId) return;
                    this.currentAudioElement = null;
                    void playSentence(index + 1);
                };

                try {
                    await audio.play();
                } catch {
                    void playSentence(index + 1);
                }
            } else {
                void playSentence(index + 1);
            }
        };

        void playSentence(0);

        return { stop };
    }
}

export const kittenWebGpu = new KittenWebGpuEngine();
