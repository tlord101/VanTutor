

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type, Modality, LiveServerMessage, Blob as GenAIBlob } from '@google/genai';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, collection, addDoc, query, orderBy, serverTimestamp, getDocs, writeBatch, updateDoc, getDoc } from 'firebase/firestore';
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


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const mockCourses = [
  { id: 'math_algebra_1', name: 'Math - Algebra 1' },
  { id: 'science_biology', name: 'Science - Biology' },
  { id: 'history_us', name: 'History - U.S. History' },
];
const getCourseNameById = (id: string) => mockCourses.find(c => c.id === id)?.name || 'their course';

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
const MicrophoneIcon: React.FC<{ className?: string, isMuted: boolean }> = ({ className, isMuted }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        {isMuted ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5 6L6.75 12m0 0L3 15.75m-3.75-3.75L6.75 12m0 0h.75m-1.5 6H5.25A2.25 2.25 0 0 1 3 15.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
        ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        )}
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
             <div className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center p-8 bg-black text-white">
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

    // This covers 'idle', 'connecting', 'active'
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black justify-center items-center p-8 overflow-hidden">
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
                    <MicrophoneIcon className="w-8 h-8" isMuted={isMuted} />
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
}
const TextChat: React.FC<TextChatProps> = ({ userProfile }) => {
    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    
    const [input, setInput] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
    const [modalState, setModalState] = useState({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const { attemptApiCall } = useApiLimiter();
    const { addToast } = useToast();

    const generateTitle = useCallback(async (firstMessage: string, imageProvided: boolean): Promise<string> => {
        try {
            const prompt = `
            Analyze the following user's first message in a conversation. The user is studying "${getCourseNameById(userProfile.courseId)}".
            
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
        } catch (error) {
            console.error("Failed to generate title with enhanced prompt:", error);
            // Fallback to a simpler generation if the structured one fails
            try {
                const simplePrompt = `Generate a very short, concise title (3-5 words) for a conversation that starts with: "${firstMessage}".`;
                const simpleResponse = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: simplePrompt });
                return simpleResponse.text.replace(/"/g, '').replace(/\.$/, '').trim() || "New Chat";
            } catch (simpleError) {
                 console.error("Failed to generate title with simple prompt:", simpleError);
                 return "New Chat";
            }
        }
    }, [userProfile.courseId]);

    // Effect to fetch the list of conversations
    useEffect(() => {
        setIsHistoryLoading(true);
        const conversationsRef = collection(db, 'users', userProfile.uid, 'chatConversations');
        const q = query(conversationsRef, orderBy('lastUpdatedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedConversations: ChatConversation[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                fetchedConversations.push({
                    id: doc.id,
                    ...data
                } as ChatConversation);
            });
            setConversations(fetchedConversations);
            setIsHistoryLoading(false);
        }, (err) => {
            console.error("Error fetching chat history:", err);
            addToast('Could not load chat history.', 'error');
            setIsHistoryLoading(false);
        });
        return () => unsubscribe();
    }, [userProfile.uid, addToast]);

    // Effect to fetch messages for the active conversation
    useEffect(() => {
        if (!activeConversationId) {
            setMessages([]);
            return;
        }
        const messagesRef = collection(db, 'users', userProfile.uid, 'chatConversations', activeConversationId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMessages: Message[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                fetchedMessages.push({
                    id: doc.id,
                    ...data,
                    timestamp: data.timestamp?.toMillis() || Date.now()
                } as Message);
            });
            setMessages(fetchedMessages);
        }, (err) => {
            console.error("Error fetching messages for conversation:", err);
            addToast('Could not load messages for this conversation.', 'error');
        });
        return () => unsubscribe();
    }, [userProfile.uid, activeConversationId, addToast]);
    
    // Auto-scroll effect
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (selectedFile.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setImagePreviewUrl(reader.result as string);
                };
                reader.readAsDataURL(selectedFile);
            } else {
                setImagePreviewUrl(null); // Not an image, no preview
            }
            setFile(selectedFile);
        }
    };
    
    const handleNewChat = () => {
        setActiveConversationId(null);
        setInput('');
        setFile(null);
        setImagePreviewUrl(null);
    };

    const handleSend = async (messageText?: string) => {
        const textToSend = messageText || input;
        if ((!textToSend.trim() && !file) || isLoading) return;
        
        let currentConversationId = activeConversationId;
        const tempInput = textToSend;
        const tempFile = file;
        const tempImagePreview = imagePreviewUrl;
        
        const userMessage: Omit<Message, 'id'> = { 
            text: tempInput, 
            sender: 'user', 
            timestamp: Date.now(),
        };

        if (tempImagePreview) {
            userMessage.image = tempImagePreview;
        }

        setInput('');
        setFile(null);
        setImagePreviewUrl(null);
        setIsLoading(true);

        try {
            if (!currentConversationId) {
                const firstMessageContent = tempInput || `Image: ${tempFile?.name}`;
                const newTitle = await generateTitle(firstMessageContent, !!tempFile);
                const newConversationRef = doc(collection(db, 'users', userProfile.uid, 'chatConversations'));
                const now = Date.now();
                const newConversationData: Omit<ChatConversation, 'id'> = {
                    title: newTitle,
                    createdAt: now,
                    lastUpdatedAt: now,
                };
                await setDoc(newConversationRef, newConversationData);
                currentConversationId = newConversationRef.id;
                setActiveConversationId(currentConversationId);
            }
            
            const messagesRef = collection(db, 'users', userProfile.uid, 'chatConversations', currentConversationId, 'messages');
            await addDoc(messagesRef, { ...userMessage, timestamp: serverTimestamp() });
            const conversationRef = doc(db, 'users', userProfile.uid, 'chatConversations', currentConversationId);
            await updateDoc(conversationRef, { lastUpdatedAt: Date.now() });

            const result = await attemptApiCall(async () => {
                const history = messages.map(m => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
                const systemInstruction = `You are VANTUTOR, a friendly AI tutor. Your responses should be helpful, clear, and engaging. Use Markdown and LaTeX for clarity.`;
                const prompt = `Conversation History:\n${history}\n\nTask: Continue the conversation.\nStudent: "${tempInput}"`;
                
                const parts: any[] = [{ text: prompt }];
                if (tempFile && tempImagePreview) {
                    const base64Data = tempImagePreview.split(',')[1];
                    if(base64Data) {
                       parts.unshift({ inlineData: { data: base64Data, mimeType: tempFile.type } });
                    }
                }

                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts }, config: { systemInstruction }});
                const botMessage: Omit<Message, 'id'> = { text: response.text, sender: 'bot', timestamp: Date.now() };
                await addDoc(messagesRef, { ...botMessage, timestamp: serverTimestamp() });
            });

            if (!result.success) addToast(result.message, 'error');
        } catch (err) {
            console.error('Error sending message:', err);
            addToast('Sorry, something went wrong sending your message.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteConversation = async (id: string) => {
        setIsDeleting(true);
        try {
            const batch = writeBatch(db);
            const messagesRef = collection(db, 'users', userProfile.uid, 'chatConversations', id, 'messages');
            const messagesSnapshot = await getDocs(messagesRef);
            messagesSnapshot.forEach(doc => batch.delete(doc.ref));
            const conversationRef = doc(db, 'users', userProfile.uid, 'chatConversations', id);
            batch.delete(conversationRef);
            await batch.commit();

            if (activeConversationId === id) {
                handleNewChat();
            }
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
        setModalState({
            isOpen: true,
            title: 'Delete Conversation',
            message: `Are you sure you want to permanently delete "${conversationTitle}"? This cannot be undone.`,
            onConfirm: () => handleDeleteConversation(id),
        });
    };

    const handleClearAllHistory = async () => {
        setIsDeleting(true);
        try {
            const batch = writeBatch(db);
            for (const convo of conversations) {
                const messagesRef = collection(db, 'users', userProfile.uid, 'chatConversations', convo.id, 'messages');
                const messagesSnapshot = await getDocs(messagesRef);
                messagesSnapshot.forEach(doc => batch.delete(doc.ref));
                const conversationRef = doc(db, 'users', userProfile.uid, 'chatConversations', convo.id);
                batch.delete(conversationRef);
            }
            await batch.commit();
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
        setModalState({
            isOpen: true,
            title: 'Clear All History',
            message: 'Are you sure you want to delete all chat conversations? This is permanent.',
            onConfirm: handleClearAllHistory,
        });
    };
    
    const handleRenameConversation = async (id: string, newTitle: string) => {
        if (!newTitle.trim()) return;
        const conversationRef = doc(db, 'users', userProfile.uid, 'chatConversations', id);
        try {
            await updateDoc(conversationRef, { title: newTitle.trim() });
        } catch (error) {
            console.error("Error renaming conversation:", error);
            addToast('Failed to rename conversation.', 'error');
        }
    };
    
    const WelcomeScreen = () => {
        const starters = [
            { title: "Explain a concept", prompt: "Explain the concept of photosynthesis like I'm 12 years old." },
            { title: "Summarize this", prompt: "Summarize the main points of the following article for me: [paste article here]" },
            { title: "Draft an email", prompt: "Help me draft a professional email to my professor asking for an extension on my paper." },
            { title: "Brainstorm ideas", prompt: "Let's brainstorm some ideas for my science fair project on renewable energy." },
        ];
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex items-center justify-center mb-4">
                   <LogoIcon className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-gray-800">How can I help you today?</h2>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
                    {starters.map((starter, index) => (
                        <button key={index} onClick={() => { setInput(starter.prompt); }}
                            className="text-left p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all group">
                            <p className="font-semibold text-gray-800 flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-lime-500" />
                                {starter.title}
                            </p>
                            <p className="text-sm text-gray-500 mt-1 truncate group-hover:text-gray-700">
                                {starter.prompt}
                            </p>
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="md:hidden flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                <button onClick={() => setIsMobilePanelOpen(true)} className="text-gray-600 hover:text-gray-900">
                    <ListIcon />
                </button>
                <h2 className="font-bold text-gray-800 truncate">
                    {activeConversationId ? conversations.find(c => c.id === activeConversationId)?.title : "New Chat"}
                </h2>
                <div className="w-6"></div>
            </div>
            <div className="flex-1 flex h-full w-full overflow-hidden relative">
                <ChatHistoryPanel
                    conversations={conversations}
                    activeConversationId={activeConversationId}
                    onSelectConversation={(id) => setActiveConversationId(id)}
                    onNewChat={handleNewChat}
                    onDeleteConversation={confirmDelete}
                    onClearAll={confirmClearAll}
                    onRenameConversation={handleRenameConversation}
                    isDeleting={isDeleting}
                    isMobilePanelOpen={isMobilePanelOpen}
                    onCloseMobilePanel={() => setIsMobilePanelOpen(false)}
                />
                <div className="flex-1 flex flex-col bg-white">
                    {isHistoryLoading ? (
                        <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-t-lime-500 border-gray-300 rounded-full animate-spin"></div></div>
                    ) : (
                      <>
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 chat-bg-pattern min-h-0">
                            {activeConversationId ? (
                                <>
                                    {messages.map((message) => (
                                        <div key={message.id} className={`flex items-end gap-3 w-full animate-fade-in-up ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            {message.sender === 'bot' && 
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0 self-start">
                                                   <GraduationCapIcon className="w-full h-full p-1.5 text-white" />
                                                </div>
                                            }
                                            <div className={`max-w-[85%] sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl p-3 px-4 rounded-2xl break-words ${message.sender === 'user' ? 'bg-lime-500 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'}`}>
                                                {message.image && <img src={message.image} alt="User attachment" className="rounded-lg mb-2 max-h-48" />}
                                                <div className="text-sm prose max-w-none">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />, a: ({node, ...props}) => <a className="text-lime-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props} /> }}>
                                                        {message.text}
                                                    </ReactMarkdown>
                                                </div>
                                            </div>
                                            {message.sender === 'user' && 
                                               <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-bold flex-shrink-0 items-center justify-center flex self-start">
                                                   {userProfile.displayName.charAt(0).toUpperCase()}
                                               </div>
                                            }
                                        </div>
                                    ))}
                                    {isLoading && 
                                        <div className="flex items-start gap-3 animate-fade-in-up">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0">
                                               <GraduationCapIcon className="w-full h-full p-1.5 text-white" />
                                            </div>
                                            <div className="max-w-lg p-3 px-4 rounded-2xl bg-white border border-gray-200 rounded-bl-none">
                                                <div className="flex items-center space-x-2">
                                                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                                                </div>
                                            </div>
                                        </div>
                                    }
                                    <div ref={messagesEndRef} />
                                </>
                            ) : (
                                <WelcomeScreen />
                            )}
                        </div>
                        <div className="flex-shrink-0 p-4 sm:p-6 border-t border-gray-200 bg-white/80 backdrop-blur-lg">
                            {imagePreviewUrl && 
                                <div className="relative w-24 h-24 mb-2 p-1 border border-gray-300 rounded-lg">
                                    <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover rounded" />
                                    <button onClick={() => { setFile(null); setImagePreviewUrl(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm">&times;</button>
                                </div>
                            }
                            <div className="relative">
                                <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask anything..." className="w-full bg-white border border-gray-300 rounded-2xl py-3 pl-12 pr-14 text-gray-900 focus:ring-2 focus:ring-lime-500 focus:outline-none resize-none" rows={1} style={{ fieldSizing: 'content' }} disabled={isLoading} />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                                    <label className="cursor-pointer text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50">
                                        <PaperclipIcon className="w-5 h-5" />
                                        <input type="file" className="hidden" onChange={handleFileChange} disabled={isLoading} accept="image/*" />
                                    </label>
                                </div>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                                    <button onClick={() => handleSend()} disabled={isLoading || (!input.trim() && !file)} className="bg-lime-600 rounded-full p-2 text-white hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                        <SendIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                      </>
                    )}
                </div>
            </div>
            <ConfirmationModal
                isOpen={modalState.isOpen}
                title={modalState.title}
                message={modalState.message}
                onConfirm={modalState.onConfirm}
                onCancel={() => setModalState({ ...modalState, isOpen: false })}
                confirmText="Delete"
                isConfirming={isDeleting}
            />
        </>
    );
};

// --- MAIN CHAT CONTAINER COMPONENT ---
interface ChatProps {
    userProfile: UserProfile;
}
export const Chat: React.FC<ChatProps> = ({ userProfile }) => {
    const [chatMode, setChatMode] = useState<'text' | 'live'>('text');

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex-shrink-0 p-2 border-b border-gray-200 bg-white/80 backdrop-blur-sm flex justify-center sticky top-0 z-10">
                <div className="bg-gray-200 p-1 rounded-full flex items-center">
                    <button
                        onClick={() => setChatMode('text')}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${chatMode === 'text' ? 'bg-white text-gray-800 shadow' : 'text-gray-500'}`}
                        aria-pressed={chatMode === 'text'}
                    >
                        Text Chat
                    </button>
                    <button
                        onClick={() => setChatMode('live')}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${chatMode === 'live' ? 'bg-white text-gray-800 shadow' : 'text-gray-500'}`}
                        aria-pressed={chatMode === 'live'}
                    >
                        Live Chat
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {chatMode === 'text' && <TextChat userProfile={userProfile} />}
                {chatMode === 'live' && <LiveConversation userProfile={userProfile} onEndSession={() => setChatMode('text')} />}
            </div>
        </div>
    );
};