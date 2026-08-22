/**
 * GrokVoiceEngine.ts — High-Fidelity Grok AI (xAI) Text-to-Speech Engine for Avelut
 *
 * Exclusively uses the 'altair' voice with speech tag support,
 * character-level timestamp synchronization, and ultra-fast playback.
 */

import { readCachedJson, writeCachedJson } from '../../utils/cache';

export interface GrokAudioTimestamps {
  graph_chars: string[];
  graph_times: [number, number][]; // [start, end] in seconds
}

export interface GrokTtsResponsePayload {
  audio: string; // base64-encoded audio
  content_type: string;
  duration: number;
  audio_timestamps?: GrokAudioTimestamps;
}

export interface GrokSpeechOptions {
  voice?: string; // Default: 'altair'
  language?: string;
  withTimestamps?: boolean;
  cacheKey?: string;
  onStart?: () => void;
  onTimeUpdate?: (currentTime: number, charIndex: number, spokenWord: string) => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

export interface GrokAudioPlayer {
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isPlaying: () => boolean;
}

class GrokVoiceEngine {
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private activeSessionId = 0;
  private prefetchCache = new Map<string, Promise<GrokTtsResponsePayload | null>>();

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
   * Fetch audio + timestamps from Avelut /api/speech proxy
   */
  public async fetchGrokSpeech(
    text: string,
    options: { voice?: string; language?: string; withTimestamps?: boolean; cacheKey?: string } = {}
  ): Promise<GrokTtsResponsePayload | null> {
    if (!text || !text.trim()) return null;

    const cacheKey = options.cacheKey ? `avelut_grok_tts_${options.cacheKey}` : null;
    if (cacheKey) {
      const cached = readCachedJson<GrokTtsResponsePayload | null>(cacheKey, null);
      if (cached?.audio) {
        return cached;
      }
    }

    try {
      const endpoint = typeof window !== 'undefined' && window.location.origin.includes('localhost')
        ? '/api/speech'
        : 'https://www.avelut.xyz/api/speech';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: options.voice || 'altair',
          language: options.language || 'en',
          with_timestamps: options.withTimestamps !== false,
        }),
      });

      if (!res.ok) {
        // Fallback to local /api/speech relative path if absolute domain fails
        if (!endpoint.startsWith('/api')) {
          const fallbackRes = await fetch('/api/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: text.trim(),
              voice_id: options.voice || 'altair',
              language: options.language || 'en',
              with_timestamps: options.withTimestamps !== false,
            }),
          });
          if (fallbackRes.ok) {
            const data: GrokTtsResponsePayload = await fallbackRes.json();
            if (cacheKey && data.audio) writeCachedJson(cacheKey, data);
            return data;
          }
        }
        throw new Error(`Grok TTS Proxy responded with HTTP ${res.status}`);
      }

      const payload: GrokTtsResponsePayload = await res.json();
      if (cacheKey && payload.audio) {
        writeCachedJson(cacheKey, payload);
      }
      return payload;
    } catch (err: any) {
      console.warn('Grok TTS fetch error:', err);
      return null;
    }
  }

  /**
   * Pre-fetches the audio for an upcoming board or concept in the background
   */
  public prefetchSpeech(text: string, cacheKey?: string): void {
    if (!text || !text.trim()) return;
    const key = cacheKey || text.slice(0, 40);
    if (!this.prefetchCache.has(key)) {
      const p = this.fetchGrokSpeech(text, { voice: 'altair', cacheKey });
      this.prefetchCache.set(key, p);
    }
  }

  /**
   * Play speech with exact character/word level timestamp syncing
   */
  public playSpeech(text: string, options: GrokSpeechOptions = {}): GrokAudioPlayer {
    const sessionId = ++this.activeSessionId;
    let isStopped = false;
    let audioEl: HTMLAudioElement | null = null;
    let animFrameId: number | null = null;

    const stopAll = () => {
      isStopped = true;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (audioEl) {
        audioEl.pause();
        audioEl.src = '';
        audioEl.remove();
        audioEl = null;
      }
      if (this.currentSource) {
        try { this.currentSource.stop(); } catch (_) {}
        this.currentSource = null;
      }
    };

    // Execute TTS synthesis and playback
    (async () => {
      try {
        const payload = await this.fetchGrokSpeech(text, {
          voice: options.voice || 'altair',
          language: options.language || 'en',
          withTimestamps: true,
          cacheKey: options.cacheKey,
        });

        if (isStopped || this.activeSessionId !== sessionId || !payload?.audio) {
          if (!payload?.audio && !isStopped) {
            options.onError?.(new Error('Failed to retrieve Grok audio'));
          }
          return;
        }

        // Convert base64 to Blob URL for clean HTML5 Audio streaming
        const byteCharacters = atob(payload.audio);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: payload.content_type || 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(blob);

        audioEl = new Audio(blobUrl);
        this.currentAudioElement = audioEl;

        const timestamps = payload.audio_timestamps;
        const graphChars = timestamps?.graph_chars || [];
        const graphTimes = timestamps?.graph_times || [];

        const trackTimestamps = () => {
          if (isStopped || !audioEl || audioEl.paused) return;

          const curTime = audioEl.currentTime;

          // Find corresponding character index from Grok's graph_times
          if (graphTimes.length > 0 && options.onTimeUpdate) {
            let activeIdx = -1;
            for (let i = 0; i < graphTimes.length; i++) {
              const [start, end] = graphTimes[i];
              if (curTime >= start && curTime <= end + 0.05) {
                activeIdx = i;
                break;
              }
              if (curTime < start) {
                activeIdx = Math.max(0, i - 1);
                break;
              }
            }
            if (activeIdx === -1 && curTime >= (graphTimes[graphTimes.length - 1]?.[1] || 0)) {
              activeIdx = graphTimes.length - 1;
            }

            if (activeIdx !== -1) {
              const spokenUpTo = graphChars.slice(0, activeIdx + 1).join('');
              const words = spokenUpTo.trim().split(/\s+/);
              const currentWord = words[words.length - 1] || '';
              options.onTimeUpdate(curTime, activeIdx, currentWord);
            }
          }

          animFrameId = requestAnimationFrame(trackTimestamps);
        };

        audioEl.onplay = () => {
          if (isStopped || this.activeSessionId !== sessionId) return;
          options.onStart?.();
          trackTimestamps();
        };

        audioEl.onended = () => {
          if (animFrameId) cancelAnimationFrame(animFrameId);
          URL.revokeObjectURL(blobUrl);
          if (!isStopped && this.activeSessionId === sessionId) {
            options.onEnd?.();
          }
        };

        audioEl.onerror = (e) => {
          if (animFrameId) cancelAnimationFrame(animFrameId);
          URL.revokeObjectURL(blobUrl);
          if (!isStopped && this.activeSessionId === sessionId) {
            options.onError?.(new Error('Audio playback error'));
          }
        };

        await audioEl.play();
      } catch (err: any) {
        if (!isStopped && this.activeSessionId === sessionId) {
          options.onError?.(err);
        }
      }
    })();

    return {
      pause: () => {
        if (audioEl) audioEl.pause();
        if (animFrameId) cancelAnimationFrame(animFrameId);
      },
      resume: () => {
        if (audioEl) audioEl.play().catch(() => {});
      },
      stop: stopAll,
      isPlaying: () => !!audioEl && !audioEl.paused && !audioEl.ended,
    };
  }

  public stopAll(): void {
    this.activeSessionId++;
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.src = '';
      this.currentAudioElement = null;
    }
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch (_) {}
      this.currentSource = null;
    }
  }
}

export const grokVoiceEngine = new GrokVoiceEngine();
export const grokTts = grokVoiceEngine;
