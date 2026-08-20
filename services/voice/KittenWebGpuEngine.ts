/**
 * KittenWebGpuEngine.ts — On-Device & Official KittenML Cloud API TTS Engine
 *
 * Supports high-speed Cloud API synthesis via https://api.kittenml.com/v1/audio/speech
 * with automatic natural paragraph chunking and pipelined pre-fetching,
 * plus local on-device WebGPU/WASM inference fallback.
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

    private async loadOrtScript(): Promise<any> {
        if (typeof window === 'undefined') return null;
        if (window.ort) return window.ort;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.webgpu.min.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => {
                if (window.ort) {
                    const isIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
                    window.ort.env.wasm.numThreads = isIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
                    window.ort.env.wasm.simd = true;
                    window.ort.env.wasm.proxy = false;
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
                    graphOptimizationLevel: 'basic',
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
        return !!this.session || !!this.getKittenApiKey();
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
        return tokens.length > 0 ? tokens : [0];
    }

    private getVoiceStyleEmbedding(voiceName: string): Float32Array {
        const emb = new Float32Array(256);
        const name = (voiceName || 'Bella').toLowerCase();
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i);
            hash |= 0;
        }

        for (let i = 0; i < 256; i++) {
            emb[i] = Math.sin((hash + 1) * (i + 1) * 0.1) * 0.12;
        }
        return emb;
    }

    /**
     * Synthesizes audio for text and returns a playable Audio Blob URL.
     * Uses the Official KittenML Cloud API if configured, falling back to on-device WebGPU.
     */
    public async generateAudioBlobUrl(text: string, voice = 'Bella', speed = 1.1): Promise<string | null> {
        if (!text || !text.trim()) return null;
        const normalized = text.trim();
        const cacheKey = `${voice}_${speed}_${normalized}`;

        if (this.audioCache.has(cacheKey)) {
            return this.audioCache.get(cacheKey)!;
        }

        // 1. First priority: Official KittenML Cloud API
        const apiKey = this.getKittenApiKey();
        if (apiKey) {
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

                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const blob = new Blob([arrayBuffer], { type: 'audio/mp3' });
                    const url = URL.createObjectURL(blob);
                    this.audioCache.set(cacheKey, url);
                    return url;
                } else {
                    console.warn('[KittenTTS API] Cloud API responded with status:', response.status, await response.text());
                }
            } catch (apiErr) {
                console.warn('[KittenTTS API] Cloud API fetch failed, trying local fallback:', apiErr);
            }
        }

        // 2. Fallback: On-Device WebGPU / WASM Inference
        try {
            await this.initialize();
            if (!this.session || !window.ort) return null;

            const inputNames: string[] = this.session.inputNames || [];
            const outputNames: string[] = this.session.outputNames || [];

            const tokens = this.tokenize(normalized);
            const tokenArray = BigInt64Array.from(tokens.map(t => BigInt(t)));
            const inputIdsTensor = new window.ort.Tensor('int64', tokenArray, [1, tokens.length]);
            const maskTensor = new window.ort.Tensor('int64', new BigInt64Array(tokens.length).fill(1n), [1, tokens.length]);
            const speedTensor = new window.ort.Tensor('float32', new Float32Array([speed]), [1]);
            
            const styleData = this.getVoiceStyleEmbedding(voice);
            const styleTensor = new window.ort.Tensor('float32', styleData, [1, 256]);
            const sidTensor = new window.ort.Tensor('int64', new BigInt64Array([0n]), [1]);

            const feeds: Record<string, any> = {};

            if (inputNames.length > 0) {
                for (const name of inputNames) {
                    const lower = name.toLowerCase();
                    if (lower.includes('mask')) {
                        feeds[name] = maskTensor;
                    } else if (lower.includes('speed') || lower.includes('scale') || lower.includes('rate') || lower.includes('length')) {
                        feeds[name] = speedTensor;
                    } else if (lower.includes('style') || lower.includes('embed') || lower.includes('voice') || lower.includes('speaker')) {
                        feeds[name] = lower === 'speaker_id' || lower === 'sid' ? sidTensor : styleTensor;
                    } else {
                        feeds[name] = inputIdsTensor;
                    }
                }
            } else {
                feeds['input_ids'] = inputIdsTensor;
                feeds['style'] = styleTensor;
                feeds['speed'] = speedTensor;
            }

            const results = await this.session.run(feeds);
            let outputTensor = results.audio || results.waveform || results.output || results.output_0 || results.logits;
            if (!outputTensor && outputNames.length > 0) {
                outputTensor = results[outputNames[0]];
            }
            if (!outputTensor) {
                outputTensor = Object.values(results)[0];
            }

            if (outputTensor && outputTensor.data) {
                const pcm = outputTensor.data instanceof Float32Array 
                    ? outputTensor.data 
                    : new Float32Array(outputTensor.data);
                
                const blob = pcmToWavBlob(pcm, 24000);
                const url = URL.createObjectURL(blob);
                this.audioCache.set(cacheKey, url);
                return url;
            }
        } catch (err) {
            console.warn('[KittenWebGpuEngine] On-device synthesis error:', err);
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

        // Queue-based audio playback loop with parallel next-chunk pre-fetching
        const playChunk = async (index: number) => {
            if (isStopped || this.activeSessionId !== sessionId) return;

            if (index >= chunks.length) {
                options?.onEnd?.();
                return;
            }

            const chunk = chunks[index];
            const voice = options?.voice || 'Bella';
            const speed = options?.speed || 1.1;

            // Pipeline pre-fetch: trigger synthesis for the NEXT chunk ahead of time
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

export const kittenWebGpu = new KittenWebGpuEngine();
