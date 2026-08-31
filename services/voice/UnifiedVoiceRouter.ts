import { grokVoiceEngine, type GrokSpeechOptions, type GrokAudioPlayer, type GrokTtsResponsePayload } from './GrokVoiceEngine';
import { kittenTts } from '../kittenTtsService';
import type { AppSettings } from '../../types';

export type UnifiedVoiceProvider = 'grok' | 'kitten';

export interface UnifiedSpeechOptions {
  provider?: UnifiedVoiceProvider;
  voice?: string;
  speed?: number;
  pitch?: number;
  language?: string;
  withTimestamps?: boolean;
  cacheKey?: string;
  isPrivate?: boolean;
  appSettings?: AppSettings;
  onStart?: () => void;
  onReady?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

export type UnifiedAudioPlayer = GrokAudioPlayer;

/**
 * Unified Voice Router
 * Strictly routes text-to-speech synthesis requests through GROK VOICE ENGINE (xAI Speech)
 */
export class UnifiedVoiceRouter {
  public resolveProvider(_options: UnifiedSpeechOptions = {}): UnifiedVoiceProvider {
    return 'grok';
  }

  /**
   * Play speech using Grok Voice Engine exclusively
   */
  public playSpeech(
    text: string,
    options: UnifiedSpeechOptions = {}
  ): UnifiedAudioPlayer {
    const rawVoice = options.voice || options.appSettings?.grok_voice_id || 'altair';
    // Map any legacy names (like 'Jennifer', 'Cheyenne', etc.) to valid Grok voices
    const grokVoice = this.normalizeGrokVoice(rawVoice);

    return grokVoiceEngine.playSpeech(text, {
      voice: grokVoice,
      language: options.language,
      withTimestamps: options.withTimestamps !== false,
      cacheKey: options.cacheKey,
      isPrivate: options.isPrivate,
      onStart: options.onStart,
      onReady: options.onReady,
      onEnd: options.onEnd,
      onError: (err) => {
        console.warn('[UnifiedVoiceRouter] Grok TTS playback error:', err);
        options.onError?.(err);
      },
    });
  }

  /**
   * Normalizes any voice name to standard Grok / xAI voices
   */
  public normalizeGrokVoice(voiceName?: string): string {
    if (!voiceName) return 'altair';
    const lower = voiceName.toLowerCase().trim();
    const validGrokVoices = ['altair', 'nova', 'echo', 'shimmer', 'onyx', 'fable', 'alloy'];
    if (validGrokVoices.includes(lower)) {
      return lower;
    }
    // Female mappings -> 'nova' or 'shimmer'
    if (lower.includes('jennifer') || lower.includes('female') || lower.includes('emma') || lower.includes('sarah')) {
      return 'nova';
    }
    // Male mappings -> 'altair' or 'echo'
    return 'altair';
  }

  /**
   * Pre-fetches speech payload using Grok Voice Engine
   */
  public prefetchSpeech(
    text: string,
    options: UnifiedSpeechOptions = {}
  ): void {
    void grokVoiceEngine.prefetchSpeech(text, options.cacheKey, {
      isPrivate: options.isPrivate,
    });
  }

  /**
   * Fetches raw audio payload via Grok Voice Engine
   */
  public async fetchSpeech(
    text: string,
    options: UnifiedSpeechOptions = {}
  ): Promise<GrokTtsResponsePayload | null> {
    const grokVoice = this.normalizeGrokVoice(options.voice || options.appSettings?.grok_voice_id || 'altair');
    return await grokVoiceEngine.fetchGrokSpeech(text, {
      voice: grokVoice,
      language: options.language,
      withTimestamps: options.withTimestamps !== false,
      cacheKey: options.cacheKey,
      isPrivate: options.isPrivate,
    });
  }

  /**
   * Universal audio stop
   */
  public stopAudio(): void {
    grokVoiceEngine.stopAudio();
    kittenTts.stop();
  }

  public stopAll(): void {
    this.stopAudio();
  }
}

export const unifiedVoiceRouter = new UnifiedVoiceRouter();
export const unifiedTts = unifiedVoiceRouter;
