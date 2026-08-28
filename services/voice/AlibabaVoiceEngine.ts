/**
 * AlibabaVoiceEngine.ts — Alibaba Cloud DashScope (CosyVoice / Qwen-TTS) Engine for Avelut
 *
 * Provides high-speed cloud speech synthesis using Alibaba Cloud DashScope API
 * with multi-tier local caching and Web Audio playback.
 */

import { readCachedJson, writeCachedJson } from '../../utils/cache';

export interface AlibabaAudioResponsePayload {
  audio: string; // base64-encoded audio
  content_type: string;
  duration?: number;
}

export interface AlibabaSpeechOptions {
  voice?: string;        // e.g. 'longxiaochun', 'longwan', 'longhua', 'cosyvoice-v1'
  model?: string;        // e.g. 'cosyvoice-v1', 'speech-synthesis'
  language?: string;
  speed?: number;        // e.g. 1.0 - 2.0
  apiKey?: string;
  cacheKey?: string;
  isPrivate?: boolean;
  onStart?: () => void;
  onReady?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

export interface AlibabaAudioPlayer {
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isPlaying: () => boolean;
  seek: (time: number) => void;
}

class AlibabaVoiceEngine {
  private audioCtx: AudioContext | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private activeSessionId = 0;
  private memoryCache = new Map<string, AlibabaAudioResponsePayload>();
  private inFlightCache = new Map<string, Promise<AlibabaAudioResponsePayload | null>>();

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Fetch audio from Alibaba DashScope with multi-tier caching
   */
  public async fetchAlibabaSpeech(
    text: string,
    options: AlibabaSpeechOptions = {}
  ): Promise<AlibabaAudioResponsePayload | null> {
    if (!text || !text.trim()) return null;

    const cacheKey = options.cacheKey ? `avelut_alibaba_tts_${options.cacheKey}` : null;

    // 1. In-memory cache
    if (cacheKey && this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    // 2. Persistent local storage
    if (cacheKey) {
      const cached = readCachedJson<AlibabaAudioResponsePayload | null>(cacheKey, null);
      if (cached?.audio) {
        this.memoryCache.set(cacheKey, cached);
        return cached;
      }
    }

    // 3. Single-flight in-progress deduplication
    if (cacheKey) {
      const existing = this.inFlightCache.get(cacheKey);
      if (existing) return existing;
      const p = this.fetchAlibabaSpeechImpl(text, options, cacheKey);
      this.inFlightCache.set(cacheKey, p);
      void p.finally(() => this.inFlightCache.delete(cacheKey));
      return p;
    }

    return this.fetchAlibabaSpeechImpl(text, options, null);
  }

  private async fetchAlibabaSpeechImpl(
    text: string,
    options: AlibabaSpeechOptions,
    cacheKey: string | null
  ): Promise<AlibabaAudioResponsePayload | null> {
    try {
      const apiKey = options.apiKey?.trim();
      const model = options.model || 'cosyvoice-v1';
      const voice = options.voice || 'longxiaochun';

      // Call DashScope TTS endpoint or fallback proxy
      const isNative = typeof window !== 'undefined' && (
        (window as any).Capacitor?.isNativePlatform?.() ||
        window.location.protocol === 'file:'
      );

      const endpoint = isNative
        ? 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/generation'
        : '/api/alibaba-speech';

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
          model,
          input: {
            text: text.trim(),
          },
          parameters: {
            voice,
            format: 'mp3',
            sample_rate: 24000,
            rate: options.speed || 1.0,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Alibaba TTS HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let base64Audio = '';

      if (contentType.includes('application/json')) {
        const json = await response.json();
        base64Audio = json.output?.audio || json.audio || '';
      } else {
        // Direct audio buffer
        const arrayBuffer = await response.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64Audio = window.btoa(binary);
      }

      if (!base64Audio) {
        throw new Error('Alibaba TTS returned empty audio payload');
      }

      const result: AlibabaAudioResponsePayload = {
        audio: base64Audio,
        content_type: 'audio/mp3',
      };

      if (cacheKey) {
        this.memoryCache.set(cacheKey, result);
        try {
          writeCachedJson(cacheKey, result);
        } catch {}
      }

      return result;
    } catch (err) {
      console.warn('[AlibabaVoiceEngine] TTS fetch error:', err);
      return null;
    }
  }

  /**
   * Synthesize and stream or play audio
   */
  public playSpeech(
    text: string,
    options: AlibabaSpeechOptions = {}
  ): AlibabaAudioPlayer {
    const sessionId = ++this.activeSessionId;
    this.stopAudio();

    let isPlayingState = false;
    let audioEl: HTMLAudioElement | null = null;

    const player: AlibabaAudioPlayer = {
      pause: () => {
        if (audioEl) audioEl.pause();
      },
      resume: () => {
        if (audioEl) audioEl.play().catch(() => {});
      },
      stop: () => {
        if (sessionId === this.activeSessionId) {
          this.stopAudio();
        }
      },
      isPlaying: () => isPlayingState,
      seek: (time: number) => {
        if (audioEl && Number.isFinite(time)) {
          audioEl.currentTime = Math.max(0, time);
        }
      },
    };

    void (async () => {
      try {
        const payload = await this.fetchAlibabaSpeech(text, options);
        if (sessionId !== this.activeSessionId) return;

        if (!payload?.audio) {
          options.onError?.(new Error('Failed to generate Alibaba TTS audio'));
          return;
        }

        options.onReady?.();

        const audioSrc = payload.audio.startsWith('data:')
          ? payload.audio
          : `data:${payload.content_type || 'audio/mp3'};base64,${payload.audio}`;

        audioEl = new Audio(audioSrc);
        this.currentAudioElement = audioEl;

        audioEl.onplay = () => {
          isPlayingState = true;
          options.onStart?.();
        };

        audioEl.onended = () => {
          isPlayingState = false;
          options.onEnd?.();
        };

        audioEl.onerror = (e) => {
          isPlayingState = false;
          options.onError?.(new Error(`Alibaba Audio playback error: ${e}`));
        };

        await audioEl.play();
      } catch (err: any) {
        if (sessionId === this.activeSessionId) {
          options.onError?.(err);
        }
      }
    })();

    return player;
  }

  public stopAudio(): void {
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.src = '';
      } catch {}
      this.currentAudioElement = null;
    }
  }
}

export const alibabaVoiceEngine = new AlibabaVoiceEngine();
export const alibabaTts = alibabaVoiceEngine;
