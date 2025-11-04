import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Chat as GeminiChat, LiveServerMessage, Modality, Blob as GenAI_Blob } from '@google/genai';
import { supabase } from '../supabase';
import type { UserProfile, Message, ChatConversation } from '../types';
import { useToast } from '../hooks/useToast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';
import { SendIcon } from './icons/SendIcon';
import { ConfirmationModal } from './ConfirmationModal';
import { ListIcon } from './icons/ListIcon';
import { Avatar } from './Avatar';

// @ts-ignore
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- INLINE ICONS ---
const TextIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
    </svg>
);
const VoiceIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
);


// --- TEXT CHAT COMPONENT ---
const TextChat: React.FC<{
    userProfile: UserProfile;
    conversations: ChatConversation[];
    activeConversationId: string | null;
    setActiveConversationId: (id: string | null) => void;
    isHistoryLoading: boolean;
    handleDeleteConversation: (id: string) => void;
    handleRenameConversation: (id: string, newTitle: string) => void;
    handleClearAll: () => void;
    handleNewChat: () => void;
    isDeleting: boolean;
}> = ({
    userProfile, conversations, activeConversationId, setActiveConversationId, isHistoryLoading,
    handleDeleteConversation, handleRenameConversation, handleClearAll, handleNewChat, isDeleting
}) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
    const geminiChat = useRef<GeminiChat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    useEffect(() => {
        if (!activeConversationId) {
            setMessages([]);
            geminiChat.current = null;
            return;
        }

        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('conversation_id', activeConversationId)
                .order('timestamp', { ascending: true });
            
            if (error) {
                addToast('Could not load messages.', 'error');
            } else {
                setMessages(data as Message[]);
                const history = data.map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text || '' }]
                }));
                geminiChat.current = ai.chats.create({ model: 'gemini-2.5-pro', history });
            }
        };
        fetchMessages();

        const channel = supabase
            .channel(`public:chat_messages:conversation_id=eq.${activeConversationId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${activeConversationId}`},
                (payload) => {
                    setMessages(prev => {
                        if (prev.some(m => m.id === payload.new.id)) return prev;
                        return [...prev, payload.new as Message]
                    });
                }
            ).subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [activeConversationId, addToast]);

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;
        const currentInput = input;
        setInput('');
        setIsLoading(true);
    
        try {
            let currentConvoId = activeConversationId;
    
            // If it's a new chat, create it before sending the message
            if (!currentConvoId) {
                const now = Date.now();
                const { data: convoData, error: convoError } = await supabase.from('chat_conversations').insert({ user_id: userProfile.uid, title: 'New Chat', created_at: now, last_updated_at: now }).select().single();
                if (convoError || !convoData) throw convoError;
                currentConvoId = (convoData as ChatConversation).id;
                setActiveConversationId(currentConvoId); // This will setup subscription and fetch (0 messages)
                
                // Don't wait for title generation
                ai.models.generateContent({ model: 'gemini-2.5-pro', contents: `Generate a very short, concise title (4 words max) for the following user query: "${currentInput}"` })
                    .then(titleResult => supabase.from('chat_conversations').update({ title: titleResult.text.replace(/"/g, '') }).eq('id', currentConvoId!).then());
            }
            
            // Insert user message and get it back with its real ID.
            const { data: userMessage, error: insertError } = await supabase.from('chat_messages')
                .insert({ conversation_id: currentConvoId, text: currentInput, sender: 'user' })
                .select()
                .single();
    
            if (insertError) throw insertError;
            
            // Update state with the real message. The subscription will ignore it because the ID will match.
            setMessages(prev => [...prev, userMessage as Message]);
    
            // Now handle the bot response.
            if (!geminiChat.current) {
                const history = [...messages, userMessage as Message].map(msg => ({ role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text || '' }] }));
                geminiChat.current = ai.chats.create({ model: 'gemini-2.5-pro', history });
            }
            
            const stream = await geminiChat.current.sendMessageStream({ message: currentInput });
            const tempBotMessageId = `temp-bot-${Date.now()}`;
            setMessages(prev => [...prev, { id: tempBotMessageId, conversation_id: currentConvoId!, text: '', sender: 'bot', timestamp: Date.now() }]);
            
            let fullText = '';
            for await (const chunk of stream) {
                fullText += chunk.text;
                setMessages(prev => prev.map(m => m.id === tempBotMessageId ? {...m, text: fullText} : m));
            }
            
            const { data: botMessage, error: botInsertError } = await supabase.from('chat_messages').insert({ conversation_id: currentConvoId, text: fullText, sender: 'bot' }).select().single();
            if (botInsertError) throw botInsertError;
    
            // Replace temp bot message with the real one.
            setMessages(prev => prev.map(m => m.id === tempBotMessageId ? (botMessage as Message) : m));
            
            await supabase.from('chat_conversations').update({ last_updated_at: Date.now() }).eq('id', currentConvoId);
    
        } catch (error) {
            console.error("Error sending message:", error);
            addToast("Failed to send message.", "error");
            setInput(currentInput); // Restore input on error
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="flex-1 flex w-full h-full overflow-hidden">
            <ChatHistoryPanel conversations={conversations} activeConversationId={activeConversationId} onSelectConversation={setActiveConversationId} onNewChat={handleNewChat} onDeleteConversation={handleDeleteConversation} onRenameConversation={handleRenameConversation} onClearAll={handleClearAll} isDeleting={isDeleting} isMobilePanelOpen={isMobilePanelOpen} onCloseMobilePanel={() => setIsMobilePanelOpen(false)} />
            <div className="flex-1 flex flex-col bg-white">
                 <div className="flex-1 flex flex-col min-h-0">
                    {!activeConversationId && !isHistoryLoading && (
                        <div className="flex flex-col items-center justify-center h-full text-center p-4">
                            <ChatBubbleIcon className="w-16 h-16 text-gray-300" />
                            <h2 className="text-xl font-bold mt-4 text-gray-800">AI Tutor Chat</h2>
                            <p className="text-gray-500">Start a new chat or select one from your history.</p>
                            <button onClick={() => setIsMobilePanelOpen(true)} className="md:hidden mt-4 flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-gray-700 font-semibold"><ListIcon className="w-5 h-5" /> View History</button>
                        </div>
                    )}
                    {activeConversationId && (
                         <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {messages.map((message, index) => (
                                <div key={message.id || `msg-${index}`} className={`flex items-start gap-3 w-full animate-fade-in-up ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {message.sender === 'bot' && <Avatar display_name="AI" className="w-8 h-8 flex-shrink-0" />}
                                    <div className={`p-3 px-4 rounded-2xl max-w-[85%] sm:max-w-xl break-words prose ${message.sender === 'user' ? 'bg-lime-500 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text || ''}</ReactMarkdown>
                                    </div>
                                    {message.sender === 'user' && <Avatar display_name={userProfile.display_name} photo_url={userProfile.photo_url} className="w-8 h-8 flex-shrink-0" />}
                                </div>
                            ))}
                            {isLoading && (<div className="flex items-start gap-3 w-full animate-fade-in-up justify-start"><Avatar display_name="AI" className="w-8 h-8 flex-shrink-0" /><div className="p-3 px-4 rounded-2xl bg-gray-100"><div className="flex items-center space-x-2"><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div></div></div></div>)}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                    <div className="p-4 border-t border-gray-200 bg-white/80 backdrop-blur-lg">
                        <div className="relative flex items-center">
                            <button onClick={() => setIsMobilePanelOpen(true)} className="md:hidden mr-2 p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ListIcon /></button>
                            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} placeholder="Ask me anything..." className="w-full bg-gray-100 border border-gray-200 rounded-full py-3 pl-5 pr-14 text-gray-900 focus:ring-2 focus:ring-lime-500 focus:outline-none resize-none" rows={1} style={{ fieldSizing: 'content' }} disabled={isLoading} />
                            <button onClick={handleSendMessage} disabled={isLoading || !input.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 bg-lime-600 rounded-full p-2.5 text-white hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><SendIcon className="w-5 h-5" /></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- VOICE ASSISTANT COMPONENT ---
// Helper audio functions
function encode(bytes: Uint8Array) { let binary = ''; const len = bytes.byteLength; for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); } return btoa(binary); }
function decode(base64: string) { const binaryString = atob(base64); const len = binaryString.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); } return bytes; }
async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> { const dataInt16 = new Int16Array(data.buffer); const frameCount = dataInt16.length / numChannels; const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate); for (let channel = 0; channel < numChannels; channel++) { const channelData = buffer.getChannelData(channel); for (let i = 0; i < frameCount; i++) { channelData[i] = dataInt16[i * numChannels + channel] / 32768.0; } } return buffer; }
function createBlob(data: Float32Array): GenAI_Blob { const l = data.length; const int16 = new Int16Array(l); for (let i = 0; i < l; i++) { int16[i] = data[i] * 32768; } return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' }; }

type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';
interface Transcript { id: number; sender: 'user' | 'bot'; text: string; }

const VoiceAssistant: React.FC = () => {
    const [status, setStatus] = useState<VoiceStatus>('idle');
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const sessionPromise = useRef<Promise<any> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const { addToast } = useToast();
    const transcriptContainerRef = useRef<HTMLDivElement>(null);
    let nextStartTime = 0;
    
    const cleanup = () => {
        if(sessionPromise.current) {
            sessionPromise.current.then(session => session.close());
            sessionPromise.current = null;
        }
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setStatus('idle');
    };

    useEffect(() => {
        return cleanup;
    }, []);

    useEffect(() => {
        transcriptContainerRef.current?.scrollTo(0, transcriptContainerRef.current.scrollHeight);
    }, [transcripts]);

    const startSession = async () => {
        setStatus('connecting');
        let currentInputTranscription = '';
        let currentOutputTranscription = '';

        try {
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            sessionPromise.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: async () => {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        streamRef.current = stream;
                        setStatus('listening');
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromise.current?.then((session) => { session.sendRealtimeInput({ media: pcmBlob }); });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.outputTranscription) { currentOutputTranscription += message.serverContent.outputTranscription.text; } 
                        else if (message.serverContent?.inputTranscription) { currentInputTranscription += message.serverContent.inputTranscription.text; }
                        
                        if (message.serverContent?.turnComplete) {
                            if(currentInputTranscription.trim()) setTranscripts(prev => [...prev, { id: Date.now(), sender: 'user', text: currentInputTranscription }]);
                            if(currentOutputTranscription.trim()) setTranscripts(prev => [...prev, { id: Date.now()+1, sender: 'bot', text: currentOutputTranscription }]);
                            currentInputTranscription = ''; currentOutputTranscription = '';
                        }
                        
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                        if (base64Audio) {
                            setStatus('speaking');
                            nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                            const source = outputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContext.destination);
                            source.start(nextStartTime);
                            nextStartTime += audioBuffer.duration;
                            source.onended = () => {
                                if (outputAudioContext.currentTime >= nextStartTime - 0.1) { setStatus('listening'); }
                            };
                        }
                    },
                    onerror: (e: ErrorEvent) => { setStatus('error'); console.error('Live session error:', e); addToast('A connection error occurred.', 'error'); cleanup(); },
                    onclose: (e: CloseEvent) => { cleanup(); },
                },
                config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {} },
            });
        } catch(e) {
            setStatus('error');
            console.error("Failed to start session:", e);
            addToast("Could not start voice session. Check microphone permissions.", "error");
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-white">
            <div ref={transcriptContainerRef} className="w-full max-w-2xl h-40 overflow-y-auto mb-4 text-center space-y-2">
                {transcripts.map(t => <p key={t.id} className={`${t.sender === 'user' ? 'text-gray-800 font-semibold' : 'text-gray-600'}`}>{t.text}</p>)}
            </div>
            <div className="relative w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center">
                <div className={`w-full h-full rounded-full moon-sphere transition-all duration-300
                    ${status === 'listening' ? 'animate-[moon-listening-pulse_2s_infinite]' : ''}
                    ${status === 'speaking' ? 'animate-[moon-speaking-pulse_1.5s_infinite]' : ''}`}
                ></div>
                <div className="absolute text-center text-white font-semibold">
                    {status === 'idle' && "Tap to Start"}
                    {status === 'connecting' && "Connecting..."}
                    {status === 'listening' && "Listening..."}
                    {status === 'speaking' && "Speaking..."}
                    {status === 'error' && "Error"}
                </div>
            </div>
            <div className="mt-8">
                {status === 'idle' || status === 'error' ?
                    <button onClick={startSession} className="px-6 py-3 bg-lime-600 text-white font-bold rounded-full hover:bg-lime-700 transition-colors">Start Conversation</button>
                    :
                    <button onClick={cleanup} className="px-6 py-3 bg-red-600 text-white font-bold rounded-full hover:bg-red-700 transition-colors">End Conversation</button>
                }
            </div>
        </div>
    );
};


// --- MAIN CHAT COMPONENT ---
interface ChatProps {
    userProfile: UserProfile;
}

export const Chat: React.FC<ChatProps> = ({ userProfile }) => {
    const [mode, setMode] = useState<'text' | 'voice'>('text');
    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
    const { addToast } = useToast();

    // Fetch and subscribe to conversation list (for text chat)
    useEffect(() => {
        if (mode !== 'text') return;
        setIsHistoryLoading(true);
        const fetchConversations = async () => {
            const { data, error } = await supabase.from('chat_conversations').select('*').eq('user_id', userProfile.uid).order('last_updated_at', { ascending: false });
            if (error) { addToast('Could not load chat history.', 'error'); console.error(error); } 
            else { setConversations(data as ChatConversation[]); }
            setIsHistoryLoading(false);
        };
        fetchConversations();
        const channel = supabase.channel(`public:chat_conversations:user_id=eq.${userProfile.uid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations', filter: `user_id=eq.${userProfile.uid}` },
                (payload) => {
                    const sortConvos = (convos: ChatConversation[]) => convos.sort((a,b) => b.last_updated_at - a.last_updated_at);
                    if (payload.eventType === 'INSERT') { setConversations(prev => sortConvos([payload.new as ChatConversation, ...prev])); }
                    else if (payload.eventType === 'UPDATE') { setConversations(prev => sortConvos(prev.map(c => c.id === payload.new.id ? payload.new as ChatConversation : c))); }
                    else if (payload.eventType === 'DELETE') { setConversations(prev => prev.filter(c => c.id !== (payload.old as any).id)); }
                }
        ).subscribe();
        return () => { supabase.removeChannel(channel); }
    }, [userProfile.uid, addToast, mode]);

    const handleNewChat = () => setActiveConversationId(null);
    const onRenameConversation = async (id: string, newTitle: string) => await supabase.from('chat_conversations').update({ title: newTitle }).eq('id', id);
    const handleDeleteConversation = async (id: string) => {
        setModalState({ isOpen: true, title: 'Delete Chat?', message: 'This will permanently delete this conversation.', confirmText: 'Delete',
            onConfirm: async () => {
                setIsDeleting(true);
                setModalState(s => ({ ...s, isOpen: false }));
                if (activeConversationId === id) handleNewChat();
                await supabase.from('chat_conversations').delete().eq('id', id);
                addToast('Conversation deleted.', 'success');
                setIsDeleting(false);
            }
        });
    };
    const onClearAll = () => {
        setModalState({ isOpen: true, title: 'Delete All Chats?', message: 'This will permanently delete all your chat conversations.', confirmText: 'Delete All',
            onConfirm: async () => {
                setIsDeleting(true);
                setModalState(s => ({...s, isOpen: false}));
                handleNewChat();
                await supabase.from('chat_conversations').delete().eq('user_id', userProfile.uid);
                addToast('All conversations deleted.', 'success');
                setIsDeleting(false);
            }
        });
    };

    return (
        <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-white rounded-xl border border-gray-200">
            <ConfirmationModal {...modalState} onCancel={() => setModalState(s => ({...s, isOpen: false}))} isConfirming={isDeleting} />
            <div className="flex-shrink-0 p-3 border-b border-gray-200 flex justify-center">
                <div className="bg-gray-100 p-1 rounded-full flex w-fit">
                    <button onClick={() => setMode('text')} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${mode === 'text' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}><TextIcon className="w-5 h-5"/> Text Tutor</button>
                    <button onClick={() => setMode('voice')} className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${mode === 'voice' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}><VoiceIcon className="w-5 h-5"/> Voice Assistant</button>
                </div>
            </div>
            {mode === 'text' ? (
                <TextChat 
                    userProfile={userProfile}
                    conversations={conversations}
                    activeConversationId={activeConversationId}
                    setActiveConversationId={setActiveConversationId}
                    isHistoryLoading={isHistoryLoading}
                    handleDeleteConversation={handleDeleteConversation}
                    handleRenameConversation={onRenameConversation}
                    handleClearAll={onClearAll}
                    handleNewChat={handleNewChat}
                    isDeleting={isDeleting}
                />
            ) : (
                <VoiceAssistant />
            )}
        </div>
    );
};