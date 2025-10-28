import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, collection, addDoc, query, orderBy, serverTimestamp, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
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
    const [fileData, setFileData] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState(false); // AI response loading
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
    
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
    const [modalState, setModalState] = useState({ isOpen: false, onConfirm: () => {}, title: '', message: '' });

    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const { attemptApiCall } = useApiLimiter(userProfile.plan);

    const generateTitle = async (firstMessage: string): Promise<string> => {
        try {
            const prompt = `Generate a very short, concise title (3-5 words) for a conversation that starts with this user message: "${firstMessage}".`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            return response.text.replace(/"/g, ''); // Clean up quotes
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
        });
        return () => unsubscribe();
    }, [userProfile.uid, activeConversationId]);
    
    // Auto-scroll and suggestion generation
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.sender === 'bot' && !isLoading && lastMessage.text.trim().endsWith('?')) {
            generateSuggestions(lastMessage.text);
        } else if (lastMessage?.sender === 'user' || isLoading) {
            setSuggestions([]);
        }
    }, [messages, isLoading]);

    const generateSuggestions = async (tutorMessage: string) => { /* ... identical to previous implementation ... */ };
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { /* ... identical to previous implementation ... */ };
    
    const handleNewChat = () => {
        setActiveConversationId(null);
        setInput('');
        setFile(null);
        setFileData(null);
        setError(null);
        setSuggestions([]);
    };

    const handleSend = async (messageText?: string) => {
        const textToSend = messageText || input;
        if (!textToSend.trim() || isLoading) return;
        
        let currentConversationId = activeConversationId;
        const tempInput = textToSend;
        const tempFile = file;
        const tempFileData = fileData;
        const userMessageText = tempFile ? `${textToSend}\n\n[Attached file: ${tempFile.name}]` : textToSend;
        const userMessage: Omit<Message, 'id'> = { text: userMessageText, sender: 'user', timestamp: Date.now() };

        setInput('');
        setFile(null);
        setFileData(null);
        setIsLoading(true);
        setError(null);
        setSuggestions([]);

        try {
            // If it's a new chat, create the conversation document first
            if (!currentConversationId) {
                const newTitle = await generateTitle(tempInput);
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
            
            // Add message and call AI
            const messagesRef = collection(db, 'users', userProfile.uid, 'chatConversations', currentConversationId, 'messages');
            await addDoc(messagesRef, { ...userMessage, timestamp: serverTimestamp() });
            const conversationRef = doc(db, 'users', userProfile.uid, 'chatConversations', currentConversationId);
            await updateDoc(conversationRef, { lastUpdatedAt: Date.now() });

            const result = await attemptApiCall(async () => {
                const history = messages.map(m => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
                const systemInstruction = `You are VANTUTOR, a friendly AI tutor. Your responses should be short, conversational, and interactive. Always end your message with a question. Use Markdown and LaTeX for clarity.`;
                const prompt = `Conversation History:\n${history}\n\nTask: Continue the conversation.\nStudent: "${tempInput}"`;
                const parts: any[] = [{ text: prompt }];
                if (tempFile && tempFileData) { /* ... add image part ... */ }

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

    const confirmDelete = (id: string) => {
        setModalState({
            isOpen: true,
            title: 'Delete Conversation',
            message: 'Are you sure you want to permanently delete this chat? This action cannot be undone.',
            onConfirm: () => handleDeleteConversation(id)
        });
    };

    const confirmClearAll = () => {
        setModalState({
            isOpen: true,
            title: 'Delete All Chats',
            message: 'Are you sure you want to delete your entire chat history? This is irreversible.',
            onConfirm: handleClearAllHistory
        });
    };

    const handleDeleteConversation = async (id: string) => {
        setIsDeleting(true);
        try {
            const messagesRef = collection(db, 'users', userProfile.uid, 'chatConversations', id, 'messages');
            const messagesSnapshot = await getDocs(messagesRef);
            const batch = writeBatch(db);
            messagesSnapshot.forEach(doc => batch.delete(doc.ref));
            const conversationRef = doc(db, 'users', userProfile.uid, 'chatConversations', id);
            batch.delete(conversationRef);
            await batch.commit();

            if (activeConversationId === id) {
                handleNewChat();
            }
        } catch (error) {
            console.error("Error deleting conversation: ", error);
            setError("Failed to delete conversation.");
        } finally {
            setIsDeleting(false);
            setModalState({ ...modalState, isOpen: false });
        }
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
        } catch (error) {
            console.error("Error clearing all history: ", error);
            setError("Failed to clear history.");
        } finally {
            setIsDeleting(false);
            setModalState({ ...modalState, isOpen: false });
        }
    };

    const WelcomeScreen = () => (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-white">
            <ChatBubbleIcon className="w-16 h-16 text-gray-300 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">Welcome to Chat</h2>
            <p className="text-gray-600 mt-2 max-w-sm">
                Start a new conversation or select one from your history to pick up where you left off.
            </p>
        </div>
    );
    
    const ChatInterface = () => (
      <>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {messages.map((message) => (
                <div key={message.id} className={`flex items-start gap-3 ${message.sender === 'user' ? 'justify-end' : ''}`}>
                    {message.sender === 'bot' && <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0"></div>}
                    <div className={`max-w-[80%] sm:max-w-lg p-3 px-4 rounded-2xl ${message.sender === 'user' ? 'bg-lime-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                        <div className="text-sm">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />, a: ({node, ...props}) => <a className="text-lime-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props} /> }}>
                                {message.text}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            ))}
            {isLoading && <div className="flex items-start gap-3"><div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0"></div><div className="max-w-lg p-3 px-4 rounded-2xl bg-gray-200 text-gray-800"><div className="flex items-center space-x-2"><div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div></div></div></div>}
            <div ref={messagesEndRef} />
        </div>
        <div className="flex-shrink-0 p-4 sm:p-6 border-t border-gray-200 bg-white/80 backdrop-blur-lg">
            {suggestions.length > 0 && <div className="flex flex-wrap items-center gap-2 mb-3 justify-end">{suggestions.map((s, i) => <button key={i} onClick={() => handleSend(s)} disabled={isLoading} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors disabled:opacity-50">{s}</button>)}</div>}
            {error && <p className="text-red-600 text-sm mb-2 text-center">{error}</p>}
            <div className="relative"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Ask anything..." className="w-full bg-white border border-gray-300 rounded-full py-3 pl-12 pr-14 text-gray-900 focus:ring-2 focus:ring-lime-500 focus:outline-none resize-none" rows={1} style={{ fieldSizing: 'content' }} disabled={isLoading} /><div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center"><label className="cursor-pointer text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50"><PaperclipIcon className="w-5 h-5" /><input type="file" className="hidden" onChange={handleFileChange} disabled={isLoading} /></label></div><div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center"><button onClick={() => handleSend()} disabled={isLoading || !input.trim()} className="bg-lime-600 rounded-full p-2 text-white hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><SendIcon className="w-5 h-5" /></button></div></div>
            {file && <div className="text-xs text-gray-600 mt-2 flex items-center gap-2 bg-gray-200 px-2 py-1 rounded-md w-fit"><FileIcon /><span className="truncate">{file.name}</span><button onClick={() => { setFile(null); setFileData(null); }} className="text-red-500 hover:text-red-400 ml-auto">&times;</button></div>}
        </div>
      </>
    );

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
            <div className="flex-1 flex h-full w-full overflow-hidden">
                <ChatHistoryPanel
                    conversations={conversations}
                    activeConversationId={activeConversationId}
                    onSelectConversation={(id) => setActiveConversationId(id)}
                    onNewChat={handleNewChat}
                    onDeleteConversation={confirmDelete}
                    onClearAll={confirmClearAll}
                    isDeleting={isDeleting}
                    isMobilePanelOpen={isMobilePanelOpen}
                    onCloseMobilePanel={() => setIsMobilePanelOpen(false)}
                />
                <div className="flex-1 flex flex-col bg-white">
                    {isHistoryLoading ? (
                        <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-t-lime-500 border-gray-300 rounded-full animate-spin"></div></div>
                    ) : (activeConversationId || !messages.length) && !activeConversationId ? ( // Logic to show chat interface for new chats
                        <ChatInterface />
                    ) : activeConversationId ? (
                        <ChatInterface />
                    ) : (
                        <WelcomeScreen />
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
