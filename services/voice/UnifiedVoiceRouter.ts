import { grokVoiceEngine, type GrokSpeechOptions, type GrokAudioPlayer, type GrokTtsResponsePayload } from './GrokVoiceEngine';
import { alibabaVoiceEngine, type AlibabaSpeechOptions, type AlibabaAudioPlayer, type AlibabaAudioResponsePayload } from './AlibabaVoiceEngine';
import { kittenTts } from '../kittenTtsService';
import type { AppSettings } from '../../types';

export type UnifiedVoiceProvider = 'grok' | 'alibaba' | 'kitten';

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

export type UnifiedAudioPlayer = GrokAudioPlayer | AlibabaAudioPlayer;

/**
 * Unified Voice Router
 * Intelligently routes text-to-speech synthesis requests across:
 * 1. Alibaba Cloud DashScope TTS (CosyVoice / Qwen TTS Flash)
 * 2. Grok Voice Engine (xAI Speech)
 * 3. KittenTTS (Local fast fallback)
 */
export class UnifiedVoiceRouter {
  /**
   * Determine the active voice provider from AppSettings or caller options
   */
  public resolveProvider(options: UnifiedSpeechOptions = {}): UnifiedVoiceProvider {
    if (options.provider) return options.provider;

    const providerSetting = options.appSettings?.voice_provider || 'alibaba';
    if (providerSetting === 'grok') return 'grok';
    if (providerSetting === 'kitten') return 'kitten';
    return 'alibaba';
  }

  /**
   * Universal play speech across configured engine
   */
  public playSpeech(
    text: string,
    options: UnifiedSpeechOptions = {}
  ): UnifiedAudioPlayer {
    const provider = this.resolveProvider(options);

    if (provider === 'alibaba') {
      return alibabaVoiceEngine.playSpeech(text, {
        voice: options.voice || options.appSettings?.alibaba_voice_id || 'Jennifer',
        speed: options.speed,
        pitch: options.pitch,
        cacheKey: options.cacheKey,
        isPrivate: options.isPrivate,
        appSettings: options.appSettings,
        apiKey: options.appSettings?.alibaba_api_key,
        onStart: options.onStart,
        onReady: options.onReady,
        onEnd: options.onEnd,
        onError: (err) => {
          console.warn('[UnifiedVoiceRouter] Alibaba TTS error, attempting Grok fallback:', err);
          // Auto fallback to Grok if Alibaba fails
          grokVoiceEngine.playSpeech(text, {
            voice: 'altair',
            onStart: options.onStart,
            onReady: options.onReady,
            onEnd: options.onEnd,
            onError: options.onError,
          });
        },
      });
    }

    return grokVoiceEngine.playSpeech(text, {
      voice: options.voice || options.appSettings?.grok_voice_id || 'altair',
      language: options.language,
      withTimestamps: options.withTimestamps !== false,
      cacheKey: options.cacheKey,
      isPrivate: options.isPrivate,
      onStart: options.onStart,
      onReady: options.onReady,
      onEnd: options.onEnd,
      onError: (err) => {
        console.warn('[UnifiedVoiceRouter] Grok TTS error, attempting Alibaba fallback:', err);
        alibabaVoiceEngine.playSpeech(text, {
          voice: 'Jennifer',
          appSettings: options.appSettings,
          onStart: options.onStart,
          onReady: options.onReady,
          onEnd: options.onEnd,
          onError: options.onError,
        });
      },
    });
  }

  /**
   * Pre-fetches speech payload for zero-latency audio playback
   */
  public prefetchSpeech(
    text: string,
    options: UnifiedSpeechOptions = {}
  ): void {
    const provider = this.resolveProvider(options);

    if (provider === 'alibaba') {
      void alibabaVoiceEngine.fetchAlibabaSpeech(text, {
        appSettings: options.appSettings,
        apiKey: options.appSettings?.alibaba_api_key,
        cacheKey: options.cacheKey,
        isPrivate: options.isPrivate,
      });
      return;
    }

    void grokVoiceEngine.prefetchSpeech(text, {
      voice: options.voice || options.appSettings?.grok_voice_id || 'altair',
      language: options.language,
      withTimestamps: options.withTimestamps !== false,
      cacheKey: options.cacheKey,
      isPrivate: options.isPrivate,
    });
  }

  /**
   * Fetches raw audio payload
   */
  public async fetchSpeech(
    text: string,
    options: UnifiedSpeechOptions = {}
  ): Promise<GrokTtsResponsePayload | AlibabaAudioResponsePayload | null> {
    const provider = this.resolveProvider(options);

    if (provider === 'alibaba') {
      return await alibabaVoiceEngine.fetchAlibabaSpeech(text, {
        appSettings: options.appSettings,
        apiKey: options.appSettings?.alibaba_api_key,
        cacheKey: options.cacheKey,
        isPrivate: options.isPrivate,
      });
    }

    return await grokVoiceEngine.fetchGrokSpeech(text, {
      voice: options.voice || options.appSettings?.grok_voice_id || 'altair',
      language: options.language,
      withTimestamps: options.withTimestamps !== false,
      cacheKey: options.cacheKey,
      isPrivate: options.isPrivate,
    });
  }

  /**
   * Universal audio stop across all engines
   */
  public stopAudio(): void {
    grokVoiceEngine.stopAudio();
    alibabaVoiceEngine.stopAudio();
    kittenTts.stop();
  }

  public stopAll(): void {
    this.stopAudio();
  }
}

export const unifiedVoiceRouter = new UnifiedVoiceRouter();
export const unifiedTts = unifiedVoiceRouter;
