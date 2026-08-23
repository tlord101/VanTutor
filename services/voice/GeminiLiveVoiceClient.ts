/**
 * ==============================================================================
 * GEMINI MULTIMODAL LIVE TWO-WAY VOICE CLIENT (WebSocket / BidiGenerateContent)
 * Model: models/gemini-3.1-flash-live-preview (Fast, high-fidelity native audio streaming)
 * Protocol: Stateful WebSocket (WSS) 16kHz PCM Input -> 24kHz PCM Output
 * Features: AudioWorklet low-latency processing, real-time interruption, natural cadence,
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
  voiceName?: 'Zephyr' | 'Aoede' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';
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
  private workletNode: AudioWorkletNode | null = null;
  private legacyProcessorNode: ScriptProcessorNode | null = null;
  private inputBufferAccumulator: number[] = [];
  private readonly BUFFER_SAMPLE_SIZE = 2048; // ~128ms at 16kHz

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
    const path = '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
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
    const courses = meta.enrolledCourses?.length ? meta.enrolledCourses.join(', ') : 'Academic Curriculum';
    const context = meta.courseContext ? `Current study context: ${meta.courseContext}` : '';

    let modelName = this.options.model || 'models/gemini-3.1-flash-live-preview';
    if (!modelName.startsWith('models/')) {
      modelName = `models/${modelName}`;
    }

    const voiceName = this.options.voiceName || 'Zephyr';

    const systemPrompt = `You are AVELUT AI, an intelligent, empathetic, voice-first personal academic tutor and study partner.
You are having an interactive, real-time spoken voice conversation with ${studentName}.
- Student Department/Major: ${department}
- Institution: ${institution}
- Academic Level: ${level}
- Enrolled Courses: ${courses}
${context}

VOICE & INTERACTION GUIDELINES:
1. Speak in a natural, friendly, conversational tone with clean cadence and clear explanations.
2. Keep your spoken responses concise, punchy, and conversational (2-3 sentences max).
3. Be ready to be interrupted naturally whenever ${studentName} speaks.
4. When ${studentName} speaks or asks questions, immediately respond warmly with voice.`;

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

    // Fallback trigger after setup in case setupComplete event is implicit
    setTimeout(() => {
      if (this.isConnected && !this.isModelSpeaking) {
        this.triggerInitialGreeting();
      }
    }, 600);
  }

  /**
   * Triggers the AI to speak first out loud immediately upon starting conversation.
   */
  private triggerInitialGreeting(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const meta = this.options.userMetadata || {};
    const studentName = meta.displayName || 'Student';

    const greetingTriggerMsg = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: `[Instruction]: Please start the conversation immediately by speaking out loud. Warmly greet ${studentName} in a friendly, conversational tone (1-2 sentences), introduce yourself as Avelut AI tutor, and ask what academic subject or question we should explore today.`
              }
            ]
          }
        ],
        turnComplete: true
      }
    };

    try {
      this.ws.send(JSON.stringify(greetingTriggerMsg));
    } catch (err) {
      console.warn('[GeminiLive] Error triggering initial greeting:', err);
    }
  }

  /**
   * Handles incoming server messages (PCM 24kHz audio, live text, interruptions).
   */
  private handleServerMessage(data: any): void {
    // 0. Setup Complete acknowledgment -> trigger AI to talk first
    if (data.setupComplete) {
      this.triggerInitialGreeting();
      return;
    }

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
        if (part.inlineData?.data && (part.inlineData?.mimeType?.includes('audio') || part.inlineData?.mimeType?.includes('pcm'))) {
          const base64Audio = part.inlineData.data;
          this.playAudioChunk(base64Audio);
        }
      }
    }

    // 3. Output Transcription from Gemini Live
    if (data.serverContent?.outputTranscription?.text) {
      this.options.onTextChunk?.(data.serverContent.outputTranscription.text);
    }

    // 4. Turn Complete signal
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
   * Smoothly downsamples Float32Array audio from device hardware sample rate (e.g. 48kHz / 44.1kHz)
   * to 16kHz 16-bit PCM for the Gemini Live API.
   */
  private downsampleTo16k(inputBuffer: Float32Array, inputSampleRate: number): Int16Array {
    if (!inputBuffer || inputBuffer.length === 0) return new Int16Array(0);

    if (inputSampleRate === 16000) {
      const pcm16 = new Int16Array(inputBuffer.length);
      for (let i = 0; i < inputBuffer.length; i++) {
        const s = Math.max(-1, Math.min(1, inputBuffer[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return pcm16;
    }

    const sampleRateRatio = inputSampleRate / 16000;
    const newLength = Math.round(inputBuffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < inputBuffer.length; i++) {
        accum += inputBuffer[i];
        count++;
      }
      const avg = count > 0 ? accum / count : 0;
      const s = Math.max(-1, Math.min(1, avg));
      result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7fff;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  /**
   * Processes a Float32Array channel chunk from microphone, converts to 16kHz PCM 16-bit,
   * computes audio levels for UI animation, and streams to WebSocket in stable buffered frames.
   */
  private processAudioInputChunk(inputChannel: Float32Array): void {
    if (this.isMuted || !this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onInputAudioLevel?.(0);
      return;
    }

    // Calculate audio RMS level for visual pulsation
    let sumSquares = 0;
    for (let i = 0; i < inputChannel.length; i++) {
      sumSquares += inputChannel[i] * inputChannel[i];
    }
    const rms = Math.sqrt(sumSquares / inputChannel.length);
    const normalizedLevel = Math.min(1, rms * 5.5);
    this.options.onInputAudioLevel?.(normalizedLevel);

    // If the model is speaking out loud, ignore low-level acoustic speaker bleed to avoid self-interruptions
    if (this.isModelSpeaking && rms < 0.035) {
      return;
    }

    for (let i = 0; i < inputChannel.length; i++) {
      this.inputBufferAccumulator.push(inputChannel[i]);
    }

    // Only send when we have accumulated a full 2048-sample audio chunk (~128ms frame)
    while (this.inputBufferAccumulator.length >= this.BUFFER_SAMPLE_SIZE) {
      const rawChunk = new Float32Array(this.inputBufferAccumulator.splice(0, this.BUFFER_SAMPLE_SIZE));
      
      // Resample from hardware sample rate (e.g. 48kHz or 44.1kHz) to exact 16kHz 16-bit Linear PCM
      const actualSampleRate = this.inputAudioCtx?.sampleRate || 16000;
      const pcm16 = this.downsampleTo16k(rawChunk, actualSampleRate);

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

      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(realtimeMsg));
        }
      } catch (err) {
        console.warn('[GeminiLive] Error sending audio chunk:', err);
      }
    }
  }

  /**
   * Starts capturing microphone audio using AudioWorkletNode (with ScriptProcessor fallback).
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

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      this.micSourceNode = source;

      // Silent gain node to pull audio through the Web Audio graph without playing mic audio out of device speakers
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;
      muteGain.connect(ctx.destination);

      // Try modern AudioWorkletNode first
      let workletLoaded = false;
      if (ctx.audioWorklet) {
        try {
          const workletCode = `
            class PCMRecorderProcessor extends AudioWorkletProcessor {
              process(inputs, outputs, parameters) {
                const input = inputs[0];
                if (input && input.length > 0) {
                  const channel = input[0];
                  if (channel && channel.length > 0) {
                    this.port.postMessage(channel);
                  }
                }
                return true;
              }
            }
            registerProcessor('pcm-recorder-processor', PCMRecorderProcessor);
          `;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);

          const workletNode = new AudioWorkletNode(ctx, 'pcm-recorder-processor');
          this.workletNode = workletNode;

          workletNode.port.onmessage = (e) => {
            const channelData = e.data;
            if (channelData instanceof Float32Array) {
              this.processAudioInputChunk(channelData);
            }
          };

          source.connect(workletNode);
          workletNode.connect(muteGain);
          workletLoaded = true;
        } catch (workletErr) {
          console.warn('[GeminiLive] AudioWorklet initialization fallback:', workletErr);
        }
      }

      // Fallback to ScriptProcessorNode if AudioWorklet unavailable
      if (!workletLoaded) {
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        this.legacyProcessorNode = processor;

        processor.onaudioprocess = (e) => {
          const inputChannel = e.inputBuffer.getChannelData(0);
          this.processAudioInputChunk(inputChannel);
        };

        source.connect(processor);
        processor.connect(muteGain);
      }
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
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      let ctx: AudioContext;
      try {
        ctx = new AudioCtx({ sampleRate: 24000 });
      } catch (rateErr) {
        // Some browsers (e.g. iOS Safari) reject an explicit sampleRate.
        console.warn('[GeminiLive] 24kHz AudioContext failed, falling back to default:', rateErr);
        ctx = new AudioCtx();
      }
      this.outputAudioCtx = ctx;
      this.nextPlayTime = this.outputAudioCtx.currentTime;
    } catch (err) {
      console.warn('[GeminiLive] Output audio init failed:', err);
      this.outputAudioCtx = null;
    }
  }

  /**
   * Decodes and plays a 24kHz raw PCM chunk from Gemini Live.
   */
  private playAudioChunk(base64Audio: string): void {
    if (!this.outputAudioCtx) {
      this.initOutputAudio();
    }
    if (!this.outputAudioCtx) return;

    if (this.outputAudioCtx.state === 'suspended') {
      void this.outputAudioCtx.resume().catch(() => {});
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

      const rms = Math.sqrt(sumSquares / numSamples);
      const normalizedLevel = Math.min(1, rms * 4.5);
      this.options.onOutputAudioLevel?.(normalizedLevel);

      const audioBuffer = this.outputAudioCtx.createBuffer(1, numSamples, 24000);
      const channelData = audioBuffer.getChannelData(0);
      channelData.set(float32);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioCtx.destination);

      const currentTime = this.outputAudioCtx.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.activeAudioSources.push(source);

      this.setModelSpeaking(true);

      source.onended = () => {
        const idx = this.activeAudioSources.indexOf(source);
        if (idx > -1) {
          this.activeAudioSources.splice(idx, 1);
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

  /**
   * Stops microphone audio streaming.
   */
  private stopMicrophoneCapture(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }
    if (this.legacyProcessorNode) {
      try {
        this.legacyProcessorNode.disconnect();
      } catch {}
      this.legacyProcessorNode = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch {}
      this.micSourceNode = null;
    }
    if (this.inputAudioCtx) {
      try {
        void this.inputAudioCtx.close();
      } catch {}
      this.inputAudioCtx = null;
    }
    this.inputBufferAccumulator = [];
  }

  /**
   * Disconnects the live session cleanly.
   */
  public disconnect(): void {
    this.isConnected = false;
    this.stopAudioPlayback();
    this.stopMicrophoneCapture();

    if (this.outputAudioCtx) {
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
