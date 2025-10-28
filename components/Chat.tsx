
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
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


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const FileIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

interface ChatProps {
    userProfile: UserProfile;
}

export const Chat: React.FC<ChatProps> = ({ userProfile }) => {
    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    
    const [input, setInput] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState(false); // AI response loading
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [error, setError] = useState<string | null>(null);
    
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
    const [modalState, setModalState] = useState({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const { attemptApiCall } = useApiLimiter(userProfile.plan);

    const generateTitle = async (firstMessage: string): Promise<string> => {
        try {
            const prompt = `Generate a very short, concise title (3-5 words) for a conversation that starts with this user message: "${firstMessage}".`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            return response.text.replace(/"/g, '').replace(/\.$/, ''); // Clean up quotes and trailing periods
        } catch (error) {
            console.error("Failed to generate title:", error);
            return "New Chat";
        }
    };

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
            setIsHistoryLoading(false);
        });
        return () => unsubscribe();
    }, [userProfile.uid]);

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
        });
        return () => unsubscribe();
    }, [userProfile.uid, activeConversationId]);
    
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
        setError(null);
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
        setError(null);

        try {
            if (!currentConversationId) {
                const firstMessageContent = tempInput || `Image: ${tempFile?.name}`;
                const newTitle = await generateTitle(firstMessageContent);
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

            if (!result.success) setError(result.message);
        } catch (err) {
            console.error('Error sending message:', err);
            setError('Sorry, something went wrong.');
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
        } catch (error) {
            console.error("Error deleting conversation:", error);
            // Handle error feedback to user
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
            // Firestore batch writes are limited, for large histories, this would need chunking.
            // For this app's scale, a single batch is likely okay.
            for (const convo of conversations) {
                const messagesRef = collection(db, 'users', userProfile.uid, 'chatConversations', convo.id, 'messages');
                const messagesSnapshot = await getDocs(messagesRef);
                messagesSnapshot.forEach(doc => batch.delete(doc.ref));
                const conversationRef = doc(db, 'users', userProfile.uid, 'chatConversations', convo.id);
                batch.delete(conversationRef);
            }
            await batch.commit();
            handleNewChat();
        } catch (error) {
            console.error("Error clearing all history:", error);
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
        <div className="flex flex-col h-full w-full">
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
                            {error && <p className="text-red-600 text-sm mb-2 text-center">{error}</p>}
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
        </div>
    );
};
