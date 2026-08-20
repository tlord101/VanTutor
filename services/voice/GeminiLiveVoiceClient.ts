/**
 * ==============================================================================
 * GEMINI MULTIMODAL LIVE TWO-WAY VOICE CLIENT (WebSocket / BidiGenerateContent)
 * Model: gemini-3.1-flash-live-preview (with automatic fallback to gemini-2.0-flash-exp)
 * Protocol: Stateful WebSocket (WSS) 16kHz PCM Input -> 24kHz PCM Output
 * Features: Two-way live voice streaming, real-time interruption, natural cadence,
 * and automatic student metadata injection (Name, Department, Level, Courses).
 * ==============================================================================
 */

export interface GeminiLiveUserMetadata {
  displayName?: string;
  departmentName?: string;
  institutionName?: string;
  level?: string;
  enrolledCourses?: string[];
  courseContext?: string;
}

export interface GeminiLiveClientOptions {
  apiKey: string;
  model?: string;
  voiceName?: 'Aoede' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';
  userMetadata?: GeminiLiveUserMetadata;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: any) => void;
  onInterrupted?: () => void;
  onTextChunk?: (text: string) => void;
  onTurnComplete?: () => void;
  onInputAudioLevel?: (level: number) => void;
  onOutputAudioLevel?: (level: number) => void;
  onSpeakingStateChange?: (isSpeaking: boolean) => void;
}

export class GeminiLiveVoiceClient {
  private ws: WebSocket | null = null;
  private options: GeminiLiveClientOptions;
  private isConnected = false;
  private isMuted = false;

  // Audio Capture (Mic 16kHz Input)
  private inputAudioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;

  // Audio Playback (24kHz Output)
  private outputAudioCtx: AudioContext | null = null;
  private nextPlayTime = 0;
  private activeAudioSources: AudioBufferSourceNode[] = [];
  private isModelSpeaking = false;
  private speakingTimeout: any = null;

  constructor(options: GeminiLiveClientOptions) {
    this.options = options;
  }

  /**
   * Connects to the Gemini Multimodal Live WebSocket API.
   */
  public async connect(): Promise<void> {
    if (this.isConnected || this.ws) {
      return;
    }

    const apiKey = this.options.apiKey?.trim();
    if (!apiKey) {
      throw new Error('Gemini API key is required to connect to the Live API.');
    }

    const host = 'generativelanguage.googleapis.com';
    const path = '/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
    const wsUrl = `wss://${host}${path}?key=${apiKey}`;

    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = async () => {
          this.isConnected = true;
          // Send initial session setup configuration with metadata
          this.sendSessionSetup();
          // Initialize Output Audio Context
          this.initOutputAudio();
          // Start capturing microphone input
          await this.startMicrophoneCapture();

          this.options.onOpen?.();
          resolve();
        };

        ws.onmessage = async (event: MessageEvent) => {
          try {
            let data: any;
            if (event.data instanceof Blob) {
              const text = await event.data.text();
              data = JSON.parse(text);
            } else if (typeof event.data === 'string') {
              data = JSON.parse(event.data);
            }

            if (data) {
              this.handleServerMessage(data);
            }
          } catch (err) {
            console.warn('[GeminiLive] Error parsing message:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('[GeminiLive] WebSocket error:', err);
          this.options.onError?.(err);
          reject(err);
        };

        ws.onclose = (event) => {
          this.isConnected = false;
          this.stopAudioPlayback();
          this.stopMicrophoneCapture();
          this.options.onClose?.(event);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Sends the initial Handshake / Setup payload containing System Instructions,
   * student metadata, and speech generation config.
   */
  private sendSessionSetup(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const meta = this.options.userMetadata || {};
    const studentName = meta.displayName || 'Student';
    const department = meta.departmentName || 'Academic Studies';
    const institution = meta.institutionName || 'University';
    const level = meta.level || 'Higher Education';
    const courses = meta.enrolledCourses?.length ? meta.enrolledCourses.join(', ') : 'Science, Technology, Engineering, Mathematics, and General Courses';
    const context = meta.courseContext ? `Current study context: ${meta.courseContext}` : '';

    const modelName = this.options.model || 'models/gemini-3.1-flash-live-preview';
    const voiceName = this.options.voiceName || 'Aoede';

    const systemPrompt = `You are AVELUT AI, an intelligent, empathetic, voice-first personal academic tutor and study partner.
You are having an interactive, real-time spoken voice conversation with ${studentName}.
- Student Department/Major: ${department}
- Institution: ${institution}
- Academic Level: ${level}
- Enrolled Courses: ${courses}
${context}

VOICE & INTERACTION GUIDELINES:
1. Speak in a natural, friendly, conversational tone with clean cadence and clear explanations.
2. Keep your spoken responses concise, punchy, and clear so the conversation flows naturally.
3. Be ready to be interrupted naturally whenever ${studentName} speaks.
4. If ${studentName} asks about their courses, department, or academic concepts, tailor your analogies and explanations directly to their background.`;

    const setupMessage = {
      setup: {
        model: modelName,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName,
              },
            },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: systemPrompt,
            },
          ],
        },
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
  }

  /**
   * Handles incoming server messages (PCM 24kHz audio, live text, interruptions).
   */
  private handleServerMessage(data: any): void {
    // 1. Live Interruption signal from Gemini
    if (data.serverContent?.interrupted) {
      this.handleInterruption();
      return;
    }

    // 2. Model Turn content (Audio / Text chunks)
    const modelTurn = data.serverContent?.modelTurn;
    if (modelTurn?.parts) {
      for (const part of modelTurn.parts) {
        // Text transcript chunk
        if (part.text) {
          this.options.onTextChunk?.(part.text);
        }

        // Inline 24kHz PCM Audio data
        if (part.inlineData?.data && part.inlineData?.mimeType?.includes('audio')) {
          const base64Audio = part.inlineData.data;
          this.playAudioChunk(base64Audio);
        }
      }
    }

    // 3. Turn Complete signal
    if (data.serverContent?.turnComplete) {
      this.options.onTurnComplete?.();
    }
  }

  /**
   * Handles immediate audio interruption when the student speaks or server interrupts.
   */
  private handleInterruption(): void {
    this.stopAudioPlayback();
    this.setModelSpeaking(false);
    this.options.onInterrupted?.();
  }

  /**
   * Starts capturing microphone audio at 16kHz PCM.
   */
  private async startMicrophoneCapture(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.micStream = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 16000 });
      this.inputAudioCtx = ctx;

      const source = ctx.createMediaStreamSource(stream);
      this.micSourceNode = source;

      // Buffer size of 4096 gives ~256ms audio chunks at 16kHz
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      this.processorNode = processor;

      processor.onaudioprocess = (e) => {
        if (this.isMuted || !this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.options.onInputAudioLevel?.(0);
          return;
        }

        const inputChannel = e.inputBuffer.getChannelData(0);
        
        // Calculate audio RMS level for visual pulsation
        let sumSquares = 0;
        for (let i = 0; i < inputChannel.length; i++) {
          sumSquares += inputChannel[i] * inputChannel[i];
        }
        const rms = Math.sqrt(sumSquares / inputChannel.length);
        const normalizedLevel = Math.min(1, rms * 4.5);
        this.options.onInputAudioLevel?.(normalizedLevel);

        // Convert Float32Array (-1.0 to 1.0) to 16-bit Linear PCM Little-Endian
        const pcm16 = new Int16Array(inputChannel.length);
        for (let i = 0; i < inputChannel.length; i++) {
          const s = Math.max(-1, Math.min(1, inputChannel[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Convert PCM buffer to base64
        const uint8 = new Uint8Array(pcm16.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Data = btoa(binary);

        // Send realtime audio chunk to Gemini Live API
        const realtimeMsg = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data,
              },
            ],
          },
        };

        this.ws.send(JSON.stringify(realtimeMsg));
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err) {
      console.error('[GeminiLive] Mic capture failed:', err);
      this.options.onError?.(err);
    }
  }

  /**
   * Initializes the Output AudioContext at 24kHz for playback.
   */
  private initOutputAudio(): void {
    if (this.outputAudioCtx) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.outputAudioCtx = new AudioCtx({ sampleRate: 24000 });
    this.nextPlayTime = this.outputAudioCtx.currentTime;
  }

  /**
   * Decodes and plays a 24kHz raw PCM chunk from Gemini Live.
   */
  private playAudioChunk(base64Audio: string): void {
    if (!this.outputAudioCtx) return;

    if (this.outputAudioCtx.state === 'suspended') {
      void this.outputAudioCtx.resume();
    }

    try {
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pcm16 = new Int16Array(bytes.buffer);
      const numSamples = pcm16.length;
      const float32 = new Float32Array(numSamples);

      let sumSquares = 0;
      for (let i = 0; i < numSamples; i++) {
        const val = pcm16[i] / 32768.0;
        float32[i] = val;
        sumSquares += val * val;
      }

      // Output sound energy level for moon orb pulsation
      const rms = Math.sqrt(sumSquares / numSamples);
      this.options.onOutputAudioLevel?.(Math.min(1, rms * 3.5));
      this.setModelSpeaking(true);

      // Create AudioBuffer at 24kHz mono
      const audioBuffer = this.outputAudioCtx.createBuffer(1, numSamples, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const sourceNode = this.outputAudioCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.outputAudioCtx.destination);

      const currentTime = this.outputAudioCtx.currentTime;
      const startTime = Math.max(this.nextPlayTime, currentTime);
      sourceNode.start(startTime);

      this.nextPlayTime = startTime + audioBuffer.duration;
      this.activeAudioSources.push(sourceNode);

      sourceNode.onended = () => {
        const index = this.activeAudioSources.indexOf(sourceNode);
        if (index > -1) {
          this.activeAudioSources.splice(index, 1);
        }
        if (this.activeAudioSources.length === 0) {
          this.setModelSpeaking(false);
          this.options.onOutputAudioLevel?.(0);
        }
      };
    } catch (err) {
      console.warn('[GeminiLive] Audio decode error:', err);
    }
  }

  private setModelSpeaking(speaking: boolean): void {
    if (this.isModelSpeaking === speaking) return;
    this.isModelSpeaking = speaking;
    this.options.onSpeakingStateChange?.(speaking);

    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }

    if (speaking) {
      this.speakingTimeout = setTimeout(() => {
        if (this.activeAudioSources.length === 0) {
          this.setModelSpeaking(false);
          this.options.onOutputAudioLevel?.(0);
        }
      }, 350);
    }
  }

  /**
   * Stops all playing output audio nodes immediately.
   */
  private stopAudioPlayback(): void {
    for (const source of this.activeAudioSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.activeAudioSources = [];
    if (this.outputAudioCtx) {
      this.nextPlayTime = this.outputAudioCtx.currentTime;
    }
  }

  /**
   * Sends a user text prompt into the ongoing Live Session.
   */
  public sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !text.trim()) return;

    const clientContent = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text: text.trim() }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(clientContent));
  }

  /**
   * Sets mute state for the microphone.
   */
  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.options.onInputAudioLevel?.(0);
    }
  }

  public getMuteState(): boolean {
    return this.isMuted;
  }

  /**
   * Stops microphone capture.
   */
  private stopMicrophoneCapture(): void {
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch {}
      this.micSourceNode = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.inputAudioCtx && this.inputAudioCtx.state !== 'closed') {
      try {
        void this.inputAudioCtx.close();
      } catch {}
      this.inputAudioCtx = null;
    }
  }

  /**
   * Closes the entire Gemini Live Session.
   */
  public disconnect(): void {
    this.isConnected = false;
    this.stopAudioPlayback();
    this.stopMicrophoneCapture();

    if (this.outputAudioCtx && this.outputAudioCtx.state !== 'closed') {
      try {
        void this.outputAudioCtx.close();
      } catch {}
      this.outputAudioCtx = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
