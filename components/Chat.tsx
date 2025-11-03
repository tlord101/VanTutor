import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type, Modality, LiveServerMessage, Blob as GenAIBlob } from '@google/genai';
import { supabase } from '../supabase';
import type { UserProfile, Message, ChatConversation } from '../types';
import { SendIcon } from './icons/SendIcon';
import { PaperclipIcon } from './icons/PaperclipIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { ConfirmationModal } from './ConfirmationModal';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';
import { ListIcon } from './icons/ListIcon';
import { LogoIcon } from './icons/LogoIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { GraduationCapIcon } from './icons/GraduationCapIcon';
import { useToast } from '../hooks/useToast';
import { Avatar } from './Avatar';


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const mockCourses = [
  { id: 'math_algebra_1', name: 'Math - Algebra 1' },
  { id: 'science_biology', name: 'Science - Biology' },
  { id: 'history_us', name: 'History - U.S. History' },
];
const getCourseNameById = (id: string) => mockCourses.find(c => c.id === id)?.name || 'their course';

const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
};

// --- INLINE ICONS ---
const FileIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);
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
    onEndSession: () => void;
}
const LiveConversation: React.FC<LiveConversationProps> = ({ userProfile, onEndSession }) => {
    const [sessionState, setSessionState] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
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
        if (!sessionPromise.current && !streamRef.current) return;
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
        inputAudioContext.current?.close().catch(console.error);
        outputAudioContext.current?.close().catch(console.error);

        sessionPromise.current = null;
        streamRef.current = null;
        scriptProcessorRef.current = null;
        inputAudioContext.current = null;
        outputAudioContext.current = null;
        
        if (!isCleanup) setSessionState('idle');
    }, []);

    const handleCloseButtonClick = () => {
        onEndSession();
    };
    
    const handleStartSession = useCallback(async () => {
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
                    if (sessionPromise.current) { // Prevent state change on intentional close
                        handleEndSession(true);
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
    }, [handleStartSession, handleEndSession]);

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
                    <button onClick={handleCloseButtonClick} className="bg-gray-700 text-white font-bold py-2 px-6 rounded-full hover:bg-gray-600 transition-colors">
                        Close
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
                    onClick={handleCloseButtonClick}
                    className="w-16 h-16 bg-gray-800/70 backdrop-blur-sm rounded-full text-white flex items-center justify-center transition-colors hover:bg-gray-700 active:bg-gray-600"
                    aria-label="End session"
                >
                    <XIcon className="w-8 h-8" />
                </button>
            </div>
        </div>
    );
};

// --- TEXT CHAT COMPONENT ---
interface TextChatProps {
    userProfile: UserProfile;
    initiationData?: { image: string; tutorialText: string } | null;
    onInitiationComplete?: () => void;
}

const TextChat: React.FC<TextChatProps> = ({ userProfile, initiationData, onInitiationComplete }) => {
    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    
    const [input, setInput] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
    const [modalState, setModalState] = useState({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<number | null>(null);
    const recordingStartRef = useRef<number>(0);

    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const messagesRef = useRef(messages);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const { attemptApiCall } = useApiLimiter();
    const { addToast } = useToast();

    const generateTitle = useCallback(async (firstMessage: string, imageProvided: boolean): Promise<string> => {
        try {
            const prompt = `
            Analyze the following user's first message in a conversation. The user is studying "${getCourseNameById(userProfile.course_id)}".
            
            User's first message: "${firstMessage}"
            ${imageProvided ? "The user also provided an image with this message." : ""}
    
            Based on this, generate a very short, concise, and descriptive title for the chat conversation (3-5 words max). The title should capture the main topic or question.
            
            Return the response as a JSON object with a single key "title".
            `;
    
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: {
                                type: Type.STRING,
                                description: "A short, concise title (3-5 words) for the conversation."
                            }
                        },
                        required: ['title']
                    }
                }
            });
    
            const responseData = JSON.parse(response.text);
            if (responseData.title) {
                return responseData.title;
            }
            return "New Chat"; // Fallback
        } catch (error: any) {
            console.error("Failed to generate title with enhanced prompt:", error.message || error);
            try {
                const simplePrompt = `Generate a very short, concise title (3-5 words) for a conversation that starts with: "${firstMessage}".`;
                const simpleResponse = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: simplePrompt });
                return simpleResponse.text.replace(/"/g, '').replace(/\.$/, '').trim() || "New Chat";
            } catch (simpleError: any) {
                 console.error("Failed to generate title with simple prompt:", simpleError.message || simpleError);
                 return "New Chat";
            }
        }
    }, [userProfile.course_id]);

    const fetchConversations = useCallback(async () => {
        const { data, error } = await supabase.from('chat_conversations').select('*').eq('user_id', userProfile.uid).order('last_updated_at', { ascending: false });
        if (error) {
            console.error("Error fetching chat history:", error);
            addToast('Could not load chat history.', 'error');
        } else {
            setConversations(data as ChatConversation[]);
        }
        setIsHistoryLoading(false);
    }, [userProfile.uid, addToast]);

    useEffect(() => {
        setIsHistoryLoading(true);
        fetchConversations();
        const channel = supabase.channel(`public:chat_conversations:user_id=eq.${userProfile.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations', filter: `user_id=eq.${userProfile.uid}` }, () => {
                fetchConversations();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userProfile.uid, fetchConversations]);

    const fetchMessages = useCallback(async (conversationId: string) => {
        const { data, error } = await supabase.from('chat_messages').select('*').eq('conversation_id', conversationId).order('timestamp', { ascending: true });
        if (error) {
            console.error("Error fetching messages:", error);
            addToast('Could not load messages for this conversation.', 'error');
        } else {
            setMessages(data as Message[]);
        }
    }, [addToast]);

    useEffect(() => {
        if (!activeConversationId) {
            setMessages([]);
            return;
        }

        fetchMessages(activeConversationId);
        const channel = supabase.channel(`public:chat_messages:conversation_id=eq.${activeConversationId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${activeConversationId}` }, () => {
                fetchMessages(activeConversationId);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConversationId, fetchMessages]);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);
    
    const handleNewChat = () => {
        setActiveConversationId(null);
        setInput('');
    };

    const handleSendAudio = async (audioBlob: Blob, duration: number) => {
        setIsLoading(true);
        let currentConversationId = activeConversationId;
        try {
            if (!currentConversationId) {
                const newTitle = await generateTitle("Voice message", false);
                const now = Date.now();
                const newConversationData: Omit<ChatConversation, 'id'> = { 
                    user_id: userProfile.uid,
                    title: newTitle, 
                    created_at: now, 
                    last_updated_at: now 
                };
                const { data, error } = await supabase.from('chat_conversations').insert(newConversationData).select().single();
                if (error || !data) throw error || new Error("Failed to create conversation");
                currentConversationId = data.id;
                setActiveConversationId(currentConversationId);
            }
            
            const filePath = `chat-media/${userProfile.uid}/${currentConversationId}/${Date.now()}.webm`;
            const { error: uploadError } = await supabase.storage.from('chat-media').upload(filePath, audioBlob);
            if (uploadError) throw uploadError;
            
            const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
            const audioUrl = data.publicUrl;

            await supabase.from('chat_messages').insert({ conversation_id: currentConversationId, sender: 'user', audio_url: audioUrl, audio_duration: duration });
            await supabase.from('chat_conversations').update({ last_updated_at: Date.now() }).eq('id', currentConversationId);
            
            // TODO: Implement AI response to audio if needed
        } catch (error) {
            console.error("Error sending audio:", error);
            addToast("Failed to send voice note.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const duration = Math.round((Date.now() - recordingStartRef.current) / 1000);
                handleSendAudio(audioBlob, duration);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            recordingStartRef.current = Date.now();
            recordingIntervalRef.current = window.setInterval(() => {
                setRecordingSeconds(prev => prev + 1);
            }, 1000);
        } catch (error) {
            console.error("Error starting recording:", error);
            addToast("Could not access microphone. Please check permissions.", "error");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if(recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
            setRecordingSeconds(0);
        }
    };

    const handleSend = async (messageText?: string) => {
        const textToSend = messageText || input;
        if (!textToSend.trim() || isLoading || isRecording) return;
    
        const tempUserMessage: Message = {
            id: `temp-user-${Date.now()}`,
            text: textToSend,
            sender: 'user',
            timestamp: Date.now(),
        };
        
        // Optimistic update for immediate feedback
        setMessages(prev => [...prev, tempUserMessage]);
        setInput('');
        setIsLoading(true);
    
        try {
            let currentConversationId = activeConversationId;
            if (!currentConversationId) {
                const newTitle = await generateTitle(textToSend, false);
                const now = Date.now();
                const { data, error } = await supabase.from('chat_conversations').insert({ user_id: userProfile.uid, title: newTitle, created_at: now, last_updated_at: now }).select().single();
                if (error || !data) throw error;
                currentConversationId = data.id;
                setActiveConversationId(currentConversationId);
            }
    
            // Save user message (the subscription will update the UI from temp to real)
            const { error: saveUserError } = await supabase.from('chat_messages').insert({
                text: textToSend, sender: 'user', conversation_id: currentConversationId,
            });
            if (saveUserError) throw saveUserError;
            
            await supabase.from('chat_conversations').update({ last_updated_at: Date.now() }).eq('id', currentConversationId);
            
            // Get AI response
            const result = await attemptApiCall(async () => {
                const history = [...messagesRef.current] // Use ref to get the latest messages, including the optimistic one
                    .map(m => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text || ''}`).join('\n');
                const systemInstruction = `You are VANTUTOR, a friendly AI tutor. Your responses should be helpful, clear, and engaging. Use Markdown and LaTeX for clarity.`;
                const prompt = `Conversation History:\n${history}\n\nTask: Continue the conversation based on the student's last message.`;
                
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: prompt }] }, config: { systemInstruction } });
                const botResponseText = response.text;
    
                // Save bot message (subscription will update UI)
                const { error: saveBotError } = await supabase.from('chat_messages').insert({
                    text: botResponseText, sender: 'bot', conversation_id: currentConversationId
                });
                if (saveBotError) throw saveBotError;
            });
    
            if (!result.success) {
                addToast(result.message, 'error');
                // Remove the temp message if AI call fails, so user knows it didn't fully process
                setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
                setInput(textToSend); // Restore input
            }
    
        } catch (err: any) {
            console.error('Error sending message:', err.message || err);
            addToast(err.message || 'Sorry, something went wrong sending your message.', 'error');
            // Revert optimistic update on any failure
            setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
            setInput(textToSend);
        } finally {
            setIsLoading(false);
        }
    };


    const handleDeleteConversation = async (id: string) => {
        setIsDeleting(true);
        try {
            const { error } = await supabase.from('chat_conversations').delete().eq('id', id);
            if (error) throw error;
            
            // Note: Messages are deleted by cascade in the DB.
            // We should also clean up storage.
            const { data: files, error: listError } = await supabase.storage.from('chat-media').list(`${userProfile.uid}/${id}`);
            if (files && files.length > 0) {
                const filePaths = files.map(f => `${userProfile.uid}/${id}/${f.name}`);
                await supabase.storage.from('chat-media').remove(filePaths);
            }

            if (activeConversationId === id) handleNewChat();
            addToast('Conversation deleted.', 'success');
        } catch (error) {
            console.error("Error deleting conversation:", error);
            addToast('Failed to delete conversation.', 'error');
        } finally {
            setIsDeleting(false);
            setModalState({ isOpen: false, onConfirm: () => {}, title: '', message: '' });
        }
    };

    const confirmDelete = (id: string) => {
        const conversationTitle = conversations.find(c => c.id === id)?.title || "this conversation";
        setModalState({ isOpen: true, title: 'Delete Conversation', message: `Are you sure you want to permanently delete "${conversationTitle}"? This cannot be undone.`, onConfirm: () => handleDeleteConversation(id) });
    };

    const handleClearAllHistory = async () => {
        setIsDeleting(true);
        try {
            for (const convo of conversations) {
                await handleDeleteConversation(convo.id);
            }
            handleNewChat();
            addToast('All chat history cleared.', 'success');
        } catch (error) {
            console.error("Error clearing all history:", error);
            addToast('Failed to clear chat history.', 'error');
        } finally {
            setIsDeleting(false);
            setModalState({ isOpen: false, onConfirm: () => {}, title: '', message: '' });
        }
    };

    const confirmClearAll = () => {
        if (conversations.length === 0) return;
        setModalState({ isOpen: true, title: 'Clear All History', message: 'Are you sure you want to delete all chat conversations? This is permanent.', onConfirm: handleClearAllHistory });
    };
    
    const handleRenameConversation = async (id: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        try {
            const { error } = await supabase.from('chat_conversations').update({ title: newTitle.trim() }).eq('id', id);
            if(error) throw error;
        } catch (error) {
            console.error("Error renaming conversation:", error);
            addToast('Failed to rename conversation.', 'error');
        }
    };
    
    const createNewConversationFromData = useCallback(async (data: { image: string; tutorialText: string }) => {
        if (!onInitiationComplete) return;

        setIsLoading(true);
        try {
            const newTitle = await generateTitle("Follow-up on visual problem", true);
            const now = Date.now();
            const { data: convoData, error: convoError } = await supabase.from('chat_conversations').insert({ user_id: userProfile.uid, title: newTitle, created_at: now, last_updated_at: now }).select().single();
            if (convoError || !convoData) throw convoError || new Error("Conversation creation failed");
            const newConversationId = convoData.id;

            const base64Data = data.image.split(',')[1];
            if (!base64Data) throw new Error("Invalid image data");
            const imageBlob = base64ToBlob(base64Data, 'image/jpeg');
            const filePath = `chat-media/${userProfile.uid}/${newConversationId}/${Date.now()}.jpeg`;
            const { error: uploadError } = await supabase.storage.from('chat-media').upload(filePath, imageBlob);
            if (uploadError) throw uploadError;
            const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
            const imageUrl = urlData.publicUrl;

            const { error: messagesError } = await supabase.from('chat_messages').insert([
                { conversation_id: newConversationId, sender: 'user', text: 'Here is the problem I was working on.', image_url: imageUrl },
                { conversation_id: newConversationId, sender: 'bot', text: data.tutorialText }
            ]);
            if (messagesError) throw messagesError;
            
            await supabase.from('chat_conversations').update({ last_updated_at: Date.now() }).eq('id', newConversationId);

            setActiveConversationId(newConversationId);
            onInitiationComplete();
        } catch (error) {
            console.error("Failed to create chat from tutorial:", error);
            addToast("Could not continue the conversation. Please try again.", "error");
            onInitiationComplete();
        } finally {
            setIsLoading(false);
        }
    }, [userProfile, generateTitle, addToast, onInitiationComplete]);

    useEffect(() => {
        if (initiationData) {
            createNewConversationFromData(initiationData);
        }
    }, [initiationData, createNewConversationFromData]);
    
    const WelcomeScreen = ({ userProfile }: { userProfile: UserProfile }) => (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in-up">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex items-center justify-center mb-6 shadow-lg"><LogoIcon className="w-14 h-14 text-white" /></div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-gray-800 tracking-tight">Hello, <span className="bg-gradient-to-r from-lime-500 to-teal-500 text-transparent bg-clip-text">{userProfile.display_name}!</span></h2>
            <p className="mt-4 text-lg text-gray-600 max-w-md">How can I help you start your learning journey today?</p>
        </div>
    );

    return (
        <>
            <div className="md:hidden flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                <button onClick={() => setIsMobilePanelOpen(true)} className="text-gray-600 hover:text-gray-900"><ListIcon /></button>
                <h2 className="font-bold text-gray-800 truncate">{activeConversationId ? conversations.find(c => c.id === activeConversationId)?.title : "New Chat"}</h2>
                <div className="w-6"></div>
            </div>
            <div className="flex-1 flex w-full overflow-hidden relative">
                <ChatHistoryPanel conversations={conversations} activeConversationId={activeConversationId} onSelectConversation={(id) => setActiveConversationId(id)} onNewChat={handleNewChat} onDeleteConversation={confirmDelete} onClearAll={confirmClearAll} onRenameConversation={handleRenameConversation} isDeleting={isDeleting} isMobilePanelOpen={isMobilePanelOpen} onCloseMobilePanel={() => setIsMobilePanelOpen(false)} />
                <div className="flex-1 flex flex-col bg-white relative">
                    {isHistoryLoading ? (
                        <div className="flex items-center justify-center h-full"><svg className="w-12 h-12 loader-logo" viewBox="0 0 52 42" fill="none" xmlns="http://www.w3.org/2000/svg"><path className="loader-path-1" d="M4.33331 17.5L26 4.375L47.6666 17.5L26 30.625L4.33331 17.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path className="loader-path-2" d="M41.5 21V29.75C41.5 30.825 40.85 32.55 39.4166 33.25L27.75 39.375C26.6666 39.9 25.3333 39.9 24.25 39.375L12.5833 33.25C11.15 32.55 10.5 30.825 10.5 29.75V21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path className="loader-path-3" d="M47.6667 17.5V26.25" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                    ) : (
                      <>
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 chat-bg-pattern min-h-0 pb-28 sm:pb-32">
                            {activeConversationId ? (
                                <>
                                    {messages.map((message) => (
                                        <div key={message.id} className={`flex items-end gap-3 w-full animate-fade-in-up ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            {message.sender === 'bot' && <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0 self-start"><GraduationCapIcon className="w-full h-full p-1.5 text-white" /></div>}
                                            <div className={`max-w-[85%] sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl p-3 px-4 rounded-2xl break-words ${message.sender === 'user' ? 'bg-lime-500 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'}`}>
                                                {message.image_url && <img src={message.image_url} alt="User attachment" className="rounded-lg mb-2 max-h-48" />}
                                                {message.audioUrl && <audio src={message.audioUrl} controls className="w-full max-w-xs h-10" />}
                                                {message.text && <div className="text-sm prose max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />, a: ({node, ...props}) => <a className="text-lime-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props} /> }}>{message.text}</ReactMarkdown></div>}
                                            </div>
                                            {message.sender === 'user' && <Avatar display_name={userProfile.display_name} photo_url={userProfile.photo_url} className="w-8 h-8 self-start" />}
                                        </div>
                                    ))}
                                    {isLoading && <div className="flex items-start gap-3 animate-fade-in-up"><div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0"><GraduationCapIcon className="w-full h-full p-1.5 text-white" /></div><div className="max-w-lg p-3 px-4 rounded-2xl bg-white border border-gray-200 rounded-bl-none"><div className="flex items-center space-x-2"><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div></div></div></div>}
                                    <div ref={messagesEndRef} />
                                </>
                            ) : (
                                <WelcomeScreen userProfile={userProfile} />
                            )}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
                            <div className="pointer-events-auto">
                                <div className="relative flex items-center bg-white border border-gray-300 rounded-full shadow-lg py-1 pr-1.5">
                                    {isRecording ? (<div className="flex-1 flex items-center justify-center h-9 px-4 text-sm"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></span>Recording... {new Date(recordingSeconds * 1000).toISOString().substr(14, 5)}</div>
                                    ) : (<textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask anything..." className="flex-1 w-full bg-transparent border-0 focus:ring-0 resize-none py-2 px-4 text-gray-900 placeholder-gray-500" rows={1} style={{ fieldSizing: 'content' }} disabled={isLoading} />)}
                                    
                                    {!input.trim() ? (
                                        <button onMouseDown={handleStartRecording} onMouseUp={handleStopRecording} onTouchStart={handleStartRecording} onTouchEnd={handleStopRecording} disabled={isLoading} className={`rounded-full p-2.5 transition-colors text-white ${isRecording ? 'bg-red-500' : 'bg-lime-500 hover:bg-lime-600'} disabled:opacity-50`} aria-label={isRecording ? 'Stop recording' : 'Start recording'}><GeneralMicrophoneIcon className="w-5 h-5" /></button>
                                    ) : (
                                        <button onClick={() => handleSend()} disabled={isLoading || !input.trim()} className="bg-lime-500 rounded-full p-2.5 text-white hover:bg-lime-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Send message"><SendIcon className="w-5 h-5" /></button>
                                    )}
                                </div>
                            </div>
                        </div>
                      </>
                    )}
                </div>
            </div>
            <ConfirmationModal isOpen={modalState.isOpen} title={modalState.title} message={modalState.message} onConfirm={modalState.onConfirm} onCancel={() => setModalState({ ...modalState, isOpen: false })} confirmText="Delete" isConfirming={isDeleting} />
        </>
    );
};

// --- MAIN CHAT CONTAINER COMPONENT ---
interface ChatProps {
    userProfile: UserProfile;
    initiationData?: { image: string; tutorialText: string } | null;
    onInitiationComplete?: () => void;
}
export const Chat: React.FC<ChatProps> = ({ userProfile, initiationData, onInitiationComplete }) => {
    const [chatMode, setChatMode] = useState<'text' | 'live'>('text');

    return (
        <div className="flex-1 flex flex-col w-full h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex-shrink-0 p-2 border-b border-gray-200 bg-white/80 backdrop-blur-sm flex justify-center sticky top-0 z-10">
                <div className="bg-gray-200 p-1 rounded-full flex items-center">
                    <button onClick={() => setChatMode('text')} className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${chatMode === 'text' ? 'bg-white text-gray-800 shadow' : 'text-gray-500'}`} aria-pressed={chatMode === 'text'}>Text Chat</button>
                    <button onClick={() => setChatMode('live')} className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${chatMode === 'live' ? 'bg-white text-gray-800 shadow' : 'text-gray-500'}`} aria-pressed={chatMode === 'live'}>Live Chat</button>
                </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
                {chatMode === 'text' && <TextChat userProfile={userProfile} initiationData={initiationData} onInitiationComplete={onInitiationComplete} />}
                {chatMode === 'live' && <LiveConversation userProfile={userProfile} onEndSession={() => setChatMode('text')} />}
            </div>
        </div>
    );
};