/**
 * UnifiedVoiceRouter.ts — Central Voice Routing Architecture for Avelut
 *
 * Directs speech synthesis requests to the appropriate engine based on dynamic admin configuration:
 * - Grok AI (xAI Altair TTS - currently active default)
 * - Alibaba Cloud (DashScope CosyVoice / Qwen-TTS)
 * - KittenML / Local KittenTTS
 * - Browser Fallback
 */

import { grokVoiceEngine, type GrokSpeechOptions, type GrokAudioPlayer, type GrokTtsResponsePayload } from './GrokVoiceEngine';
import { alibabaVoiceEngine, type AlibabaSpeechOptions, type AlibabaAudioPlayer, type AlibabaAudioResponsePayload } from './AlibabaVoiceEngine';
import { kittenTts, KittenVoice } from '../kittenTtsService';
import type { AppSettings, VoiceProvider } from '../../types';

export interface UnifiedSpeechOptions {
  provider?: VoiceProvider;
  context?: 'study_guide' | 'notebook' | 'general';
  appSettings?: AppSettings | null;
  voice?: string;
  language?: string;
  speed?: number;
  withTimestamps?: boolean;
  cacheKey?: string;
  isPrivate?: boolean;
  onStart?: () => void;
  onReady?: () => void;
  onTimeUpdate?: (currentTime: number, charIndex: number, spokenWord: string) => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

export interface UnifiedAudioPlayer {
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isPlaying: () => boolean;
  seek?: (time: number) => void;
}

class UnifiedVoiceRouter {
  /**
   * Resolves the active voice provider based on context and app settings
   */
  public resolveProvider(options?: UnifiedSpeechOptions): VoiceProvider {
    if (options?.provider) return options.provider;

    const settings = options?.appSettings;
    if (options?.context === 'study_guide') {
      return settings?.studyguide_voice_provider || settings?.active_voice_provider || 'grok';
    }
    if (options?.context === 'notebook') {
      return settings?.notebook_voice_provider || settings?.active_voice_provider || 'grok';
    }

    return settings?.active_voice_provider || 'grok';
  }

  /**
   * Plays speech using the resolved active provider
   */
  public playSpeech(
    text: string,
    options: UnifiedSpeechOptions = {}
  ): UnifiedAudioPlayer {
    const provider = this.resolveProvider(options);

    if (provider === 'alibaba') {
      return alibabaVoiceEngine.playSpeech(text, {
        voice: options.voice || options.appSettings?.alibaba_voice_name || 'longxiaochun',
        model: options.appSettings?.alibaba_voice_model || 'cosyvoice-v1',
        speed: options.speed,
        apiKey: options.appSettings?.alibaba_api_key,
        cacheKey: options.cacheKey,
        isPrivate: options.isPrivate,
        onStart: options.onStart,
        onReady: options.onReady,
        onEnd: options.onEnd,
        onError: options.onError,
      });
    }

    if (provider === 'kitten') {
      const kittenPlayer = kittenTts.speak(text, {
        voice: (options.voice as KittenVoice) || KittenVoice.Bella,
        rate: options.speed || 1.2,
        onStart: options.onStart,
        onEnd: options.onEnd,
        onError: options.onError,
      });
      return {
        pause: () => kittenTts.stop(),
        resume: () => {},
        stop: () => kittenPlayer.stop(),
        isPlaying: () => true,
      };
    }

    // Default: Grok (xAI Altair TTS)
    return grokVoiceEngine.playSpeech(text, {
      voice: options.voice || options.appSettings?.grok_voice_id || 'altair',
      language: options.language,
      withTimestamps: options.withTimestamps !== false,
      cacheKey: options.cacheKey,
      isPrivate: options.isPrivate,
      source: options.context,
      onStart: options.onStart,
      onReady: options.onReady,
      onTimeUpdate: options.onTimeUpdate,
      onEnd: options.onEnd,
      onError: options.onError,
    });
  }

  /**
   * Prefetches speech audio for low-latency playback transitions
   */
  public prefetchSpeech(
    text: string,
    cacheKey: string,
    options: UnifiedSpeechOptions = {}
  ): void {
    const provider = this.resolveProvider(options);

    if (provider === 'alibaba') {
      void alibabaVoiceEngine.fetchAlibabaSpeech(text, {
        voice: options.voice || options.appSettings?.alibaba_voice_name || 'longxiaochun',
        model: options.appSettings?.alibaba_voice_model || 'cosyvoice-v1',
        apiKey: options.appSettings?.alibaba_api_key,
        cacheKey,
        isPrivate: options.isPrivate,
      });
      return;
    }

    if (provider === 'grok') {
      grokVoiceEngine.prefetchSpeech(text, cacheKey, {
        voice: options.voice || options.appSettings?.grok_voice_id || 'altair',
        language: options.language,
        withTimestamps: options.withTimestamps !== false,
        cacheKey,
        isPrivate: options.isPrivate,
      });
    }
  }

  /**
   * Fetch raw speech payload (audio + timestamps)
   */
  public async fetchSpeech(
    text: string,
    options: UnifiedSpeechOptions = {}
  ): Promise<GrokTtsResponsePayload | AlibabaAudioResponsePayload | null> {
    const provider = this.resolveProvider(options);

    if (provider === 'alibaba') {
      return await alibabaVoiceEngine.fetchAlibabaSpeech(text, {
        voice: options.voice || options.appSettings?.alibaba_voice_name || 'longxiaochun',
        model: options.appSettings?.alibaba_voice_model || 'cosyvoice-v1',
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
