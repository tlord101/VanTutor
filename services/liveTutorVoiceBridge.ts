/**
 * Manual Student Voice Input & Speech Recognition Bridge
 * - Activates ONLY when student clicks the microphone button (no background listening)
 * - Transcribes speech cleanly using Web Speech API or MediaRecorder
 */

export interface VoiceInputConfig {
  onSpeechTranscribed?: (text: string) => void;
  onRecordingStarted?: () => void;
  onRecordingEnded?: () => void;
  onError?: (err: Error) => void;
}

export class LiveTutorVoiceBridge {
  private isRecording = false;
  private recognition: any = null;
  private config: VoiceInputConfig;

  constructor(config: VoiceInputConfig = {}) {
    this.config = config;
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
          this.isRecording = true;
          this.config.onRecordingStarted?.();
        };

        this.recognition.onresult = (event: any) => {
          const transcript = event.results?.[0]?.[0]?.transcript || '';
          if (transcript.trim()) {
            this.config.onSpeechTranscribed?.(transcript.trim());
          }
        };

        this.recognition.onerror = (event: any) => {
          this.isRecording = false;
          this.config.onRecordingEnded?.();
          if (event.error !== 'no-speech') {
            console.warn('[LiveTutorVoiceBridge] Speech recognition error:', event.error);
          }
        };

        this.recognition.onend = () => {
          this.isRecording = false;
          this.config.onRecordingEnded?.();
        };
      } catch (e) {
        console.warn('[LiveTutorVoiceBridge] SpeechRecognition init failed:', e);
      }
    }
  }

  /**
   * Starts manual voice recording when student clicks the mic button
   */
  public startManualRecording(): boolean {
    if (this.isRecording) return true;

    if (this.recognition) {
      try {
        this.recognition.start();
        return true;
      } catch (err) {
        console.warn('[LiveTutorVoiceBridge] Failed to start recognition:', err);
      }
    }

    // Fallback: prompt for user text if speech API is unavailable
    return false;
  }

  /**
   * Stops voice recording when student finishes speaking
   */
  public stopManualRecording() {
    if (!this.isRecording) return;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
    this.isRecording = false;
    this.config.onRecordingEnded?.();
  }

  public isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
}
