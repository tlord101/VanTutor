import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Blob as GenAIBlob } from '@google/genai';
import type { UserProfile } from '../types';
import { useToast } from '../hooks/useToast';


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });


// --- INLINE ICONS ---
const ErrorIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
     <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
     </svg>
);
const GeneralMicrophoneIcon: React.FC<{ className?: string, isMuted?: boolean }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
);
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);


// --- AUDIO HELPER FUNCTIONS ---
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
function createBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// --- LIVE CONVERSATION COMPONENT ---
interface LiveConversationProps {
    userProfile: UserProfile;
}
const LiveConversation: React.FC<LiveConversationProps> = ({ userProfile }) => {
    const [sessionState, setSessionState] = useState<'idle' | 'connecting' | 'active' | 'error' | 'ended'>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [isBotSpeaking, setIsBotSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const { addToast } = useToast();
    
    const sessionPromise = useRef<Promise<any> | null>(null);
    const inputAudioContext = useRef<AudioContext | null>(null);
    const outputAudioContext = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const outputSources = useRef(new Set<AudioBufferSourceNode>());
    const nextStartTime = useRef(0);
    const isMutedRef = useRef(isMuted);
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
    
    const handleEndSession = useCallback(async (isCleanup: boolean = false) => {
        if (!sessionPromise.current && !streamRef.current && !inputAudioContext.current) return;
        if (!isCleanup) setStatusMessage('Ending session...');

        if (sessionPromise.current) {
            try {
                const session = await sessionPromise.current;
                session.close();
            } catch (e) {
                console.error("Error closing session", e);
            }
        }
        streamRef.current?.getTracks().forEach(track => track.stop());
        scriptProcessorRef.current?.disconnect();
        if (inputAudioContext.current?.state !== 'closed') inputAudioContext.current?.close().catch(console.error);
        if (outputAudioContext.current?.state !== 'closed') outputAudioContext.current?.close().catch(console.error);

        sessionPromise.current = null;
        streamRef.current = null;
        scriptProcessorRef.current = null;
        inputAudioContext.current = null;
        outputAudioContext.current = null;
        
        if (!isCleanup) {
            setStatusMessage('');
            setSessionState('ended');
        }
    }, []);

    const handleStartSession = useCallback(async () => {
        // Clean up any previous session before starting a new one
        await handleEndSession(true);
        setSessionState('connecting');
        setStatusMessage('Requesting microphone access...');

        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            setStatusMessage('Connecting to VANTUTOR...');

            inputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

            sessionPromise.current = ai.live.connect({
              model: 'gemini-2.5-flash-native-audio-preview-09-2025',
              callbacks: {
                onopen: () => {
                    setStatusMessage('Listening...');
                    setSessionState('active');
                    const source = inputAudioContext.current!.createMediaStreamSource(streamRef.current!);
                    const scriptProcessor = inputAudioContext.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;
                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        if (!isMutedRef.current) {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromise.current?.then((session) => {
                              session.sendRealtimeInput({ media: pcmBlob });
                            });
                        }
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio && outputAudioContext.current) {
                        setIsBotSpeaking(true);
                        nextStartTime.current = Math.max(nextStartTime.current, outputAudioContext.current.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext.current, 24000, 1);
                        const source = outputAudioContext.current.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputAudioContext.current.destination);
                        source.addEventListener('ended', () => { 
                            outputSources.current.delete(source);
                            if (outputSources.current.size === 0) {
                                setIsBotSpeaking(false);
                            }
                        });
                        source.start(nextStartTime.current);
                        nextStartTime.current += audioBuffer.duration;
                        outputSources.current.add(source);
                    }
                    if (message.serverContent?.interrupted) {
                        for (const source of outputSources.current.values()) {
                            source.stop();
                            outputSources.current.delete(source);
                        }
                        setIsBotSpeaking(false);
                        nextStartTime.current = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Session error:', e);
                    setStatusMessage('Session error. Please try again.');
                    addToast('Live session encountered an error.', 'error');
                    setSessionState('error');
                    handleEndSession(true);
                },
                onclose: (e: CloseEvent) => {
                    if (sessionPromise.current) {
                        handleEndSession(true);
                        setSessionState('ended');
                    }
                },
              },
              config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: 'You are VANTUTOR, a friendly and helpful AI tutor. Keep your responses concise and conversational.',
              },
            });
        } catch (err) {
            console.error('Failed to start session:', err);
            const errorMsg = 'Failed to access microphone. Please check permissions and try again.';
            setStatusMessage(errorMsg);
            addToast(errorMsg, 'error');
            setSessionState('error');
        }
    }, [addToast, handleEndSession]);
    
    useEffect(() => {
        handleStartSession();
        return () => { handleEndSession(true); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (sessionState === 'error') {
        return (
             <div className="relative w-full h-full flex flex-col items-center justify-center text-center p-8 bg-black text-white">
                <ErrorIcon className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-xl font-semibold">Session Error</h3>
                <p className="text-gray-300 mt-2 max-w-sm">{statusMessage}</p>
                <div className="flex gap-4 mt-6">
                    <button onClick={handleStartSession} className="bg-lime-600 text-white font-bold py-2 px-6 rounded-full hover:bg-lime-700 transition-colors">
                        Retry
                    </button>
                </div>
            </div>
        )
    }

    if (sessionState === 'ended') {
        return (
            <div className="relative w-full h-full flex flex-col items-center justify-center text-center p-8 bg-black text-white">
                <GeneralMicrophoneIcon className="w-12 h-12 text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold">Session Ended</h3>
                <p className="text-gray-300 mt-2 max-w-sm">Would you like to start a new voice chat?</p>
                <div className="flex gap-4 mt-6">
                    <button onClick={handleStartSession} className="bg-lime-600 text-white font-bold py-2 px-6 rounded-full hover:bg-lime-700 transition-colors">
                        Start New Session
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="relative w-full h-full flex flex-col bg-black justify-center items-center p-8 overflow-hidden">
            <div 
                className={`moon-sphere relative w-64 h-64 md:w-80 md:h-80 rounded-full transition-all duration-700 ${
                    sessionState === 'active' && isBotSpeaking ? 'animate-[moon-speaking-pulse_2.5s_ease-in-out_infinite]' : 
                    'animate-[moon-listening-pulse_3s_ease-in-out_infinite]'
                }`}
            >
                <div className="absolute inset-0 rounded-full" style={{backdropFilter: 'blur(10px)'}}></div>
                {(sessionState === 'idle' || sessionState === 'connecting') && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
                        <div className="w-12 h-12 border-4 border-t-white/80 border-white/20 rounded-full animate-spin"></div>
                    </div>
                )}
            </div>

            <p className="absolute top-8 text-white bg-black/50 px-3 py-1 text-sm rounded-full pointer-events-none">
                {sessionState === 'active' 
                    ? (isBotSpeaking ? 'VANTUTOR is speaking...' : 'Listening...')
                    : statusMessage || 'Connecting...'}
            </p>

            <div className="absolute bottom-8 left-8 right-8 flex justify-between items-center">
                <button
                    onClick={() => setIsMuted(prev => !prev)}
                    className="w-16 h-16 bg-gray-800/70 backdrop-blur-sm rounded-full text-white flex items-center justify-center transition-colors hover:bg-gray-700 active:bg-gray-600 disabled:opacity-50"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    disabled={sessionState !== 'active'}
                >
                    <GeneralMicrophoneIcon className="w-8 h-8" isMuted={isMuted} />
                </button>
                <button
                    onClick={() => handleEndSession(false)}
                    className="w-16 h-16 bg-gray-800/70 backdrop-blur-sm rounded-full text-white flex items-center justify-center transition-colors hover:bg-gray-700 active:bg-gray-600"
                    aria-label="End session"
                >
                    <XIcon className="w-8 h-8" />
                </button>
            </div>
        </div>
    );
};


// --- MAIN CHAT CONTAINER COMPONENT ---
interface ChatProps {
    userProfile: UserProfile;
}
export const Chat: React.FC<ChatProps> = ({ userProfile }) => {
    return (
        <div className="flex-1 flex flex-col w-full h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
             <div className="flex-1 min-h-0 flex flex-col">
                <LiveConversation userProfile={userProfile} />
            </div>
        </div>
    );
};