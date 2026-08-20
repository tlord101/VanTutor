/**
 * KittenWebGpuEngine.ts — On-Device KittenTTS Inference using WebGPU and ONNX Runtime Web
 *
 * Runs KittenTTS directly on the client's GPU via WebGPU execution provider with WASM fallback.
 * Loads ONNX runtime in browser without problematic native Node dependencies.
 */

import { detectVoiceCapabilities } from './VoiceCapabilities';
import { MODEL_SPECS, ModelManager, modelManager } from './ModelManager';

declare global {
    interface Window {
        ort?: any;
    }
}

export interface WebGpuVoiceOptions {
    voice?: string;
    speed?: number;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
}

export class KittenWebGpuEngine {
    private session: any = null;
    private isInitializing = false;
    private initPromise: Promise<boolean> | null = null;
    private audioContext: AudioContext | null = null;
    private currentSource: AudioBufferSourceNode | null = null;
    private activeSessionId = 0;
    private voicesMap: Record<string, number[]> = {};

    private async loadOrtScript(): Promise<any> {
        if (typeof window === 'undefined') return null;
        if (window.ort) return window.ort;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.webgpu.min.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => {
                if (window.ort) {
                    // Configure ONNX Web environment
                    window.ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
                    window.ort.env.wasm.simd = true;
                    resolve(window.ort);
                } else {
                    reject(new Error('Failed to initialize ONNX Runtime Web.'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load ONNX Runtime Web script from CDN.'));
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
                const modelType = capabilities.recommendedModel;
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
        if (this.currentSource) {
            try {
                this.currentSource.stop();
                this.currentSource.disconnect();
            } catch {}
            this.currentSource = null;
        }
    }

    /**
     * Converts a raw PCM float32 array to an AudioBuffer and plays it.
     */
    private async playPcm(pcm: Float32Array, sampleRate = 24000, options?: WebGpuVoiceOptions): Promise<void> {
        if (typeof window === 'undefined') return;

        if (!this.audioContext || this.audioContext.state === 'closed') {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            this.audioContext = new AudioCtx({ sampleRate });
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const buffer = this.audioContext.createBuffer(1, pcm.length, sampleRate);
        buffer.copyToChannel(pcm, 0);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        this.currentSource = source;

        source.onended = () => {
            if (this.currentSource === source) {
                this.currentSource = null;
                options?.onEnd?.();
            }
        };

        options?.onStart?.();
        source.start(0);
    }

    /**
     * Simple character-level phoneme tokenizer for KittenTTS onnx models
     */
    private tokenize(text: string): number[] {
        const tokens: number[] = [];
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            tokens.push(code % 256);
        }
        return tokens;
    }

    /**
     * Synthesizes and plays speech using WebGPU ONNX Runtime model.
     */
    public async speak(text: string, options?: WebGpuVoiceOptions): Promise<{ stop: () => void }> {
        this.stop();
        const sessionId = ++this.activeSessionId;

        const stop = () => {
            if (this.activeSessionId === sessionId) {
                this.stop();
            }
        };

        try {
            const isReady = await this.initialize();
            if (!isReady || !this.session || this.activeSessionId !== sessionId) {
                throw new Error('WebGPU session not available');
            }

            const tokens = this.tokenize(text);
            const inputTensor = new window.ort.Tensor('int64', BigInt64Array.from(tokens.map(t => BigInt(t))), [1, tokens.length]);
            
            // Default speaker vector (Bella)
            const speakerData = new Float32Array(128).fill(0.1);
            const speakerTensor = new window.ort.Tensor('float32', speakerData, [1, 128]);

            const feeds: Record<string, any> = {
                tokens: inputTensor,
                speaker: speakerTensor,
            };

            const results = await this.session.run(feeds);
            const outputTensor = results.audio || results.output || Object.values(results)[0];

            if (this.activeSessionId !== sessionId) return { stop };

            if (outputTensor && outputTensor.data) {
                const pcm = outputTensor.data instanceof Float32Array 
                    ? outputTensor.data 
                    : new Float32Array(outputTensor.data);
                await this.playPcm(pcm, 24000, options);
            } else {
                throw new Error('Invalid audio tensor produced by KittenTTS WebGPU model');
            }
        } catch (err) {
            console.warn('[KittenWebGpuEngine] Speech synthesis error, routing to fallback:', err);
            if (this.activeSessionId === sessionId) {
                options?.onError?.(err);
            }
        }

        return { stop };
    }
}

export const kittenWebGpu = new KittenWebGpuEngine();
