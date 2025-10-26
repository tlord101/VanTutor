import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, collection, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import type { UserProfile, Message } from '../types';
import { SendIcon } from './icons/SendIcon';
import { PaperclipIcon } from './icons/PaperclipIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiLimiter } from '../hooks/useApiLimiter';

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
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [fileData, setFileData] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const { attemptApiCall } = useApiLimiter(userProfile.plan);

    // This is the conversation ID for the general chat.
    const conversationId = 'general_chat';

    useEffect(() => {
        const conversationRef = collection(db, 'users', userProfile.uid, 'conversations', conversationId, 'messages');
        const q = query(conversationRef, orderBy('timestamp', 'asc'));

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
        }, err => console.error("Error fetching conversation:", err));

        return () => unsubscribe();
    }, [userProfile.uid]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            const reader = new FileReader();
            reader.onloadend = () => setFileData(reader.result as string);
            reader.readAsDataURL(selectedFile);
        }
    };
    
    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        
        const userMessageText = file ? `${input}\n\n[Attached file: ${file.name}]` : input;
        const userMessage: Omit<Message, 'id'> = { text: userMessageText, sender: 'user', timestamp: Date.now() };

        const tempInput = input;
        const tempFile = file;
        const tempFileData = fileData;
        
        setInput('');
        setFile(null);
        setFileData(null);
        setIsLoading(true);
        setError(null);

        try {
            const conversationRef = collection(db, 'users', userProfile.uid, 'conversations', conversationId, 'messages');
            await addDoc(conversationRef, { ...userMessage, timestamp: serverTimestamp() });

            const result = await attemptApiCall(async () => {
                const history = messages.map(m => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
                
                const systemInstruction = `You are VANTUTOR, a friendly and knowledgeable AI tutor. Your primary goal is to be conversational and interactive. Keep your responses VERY short and break down information into small, digestible chunks. NEVER provide long explanations. Always end your message with a question to check for understanding or to encourage the student to ask the next question. Use Markdown for formatting (lists, bold, etc.) to keep the text engaging and clear.`;
                const prompt = `
    Conversation History:
    ${history}

    Task:
    Continue the conversation based on the student's latest message.
    Student: "${tempInput}"
    `;

                const parts: any[] = [{ text: prompt }];
                if (tempFile && tempFileData) {
                    const base64Data = tempFileData.split(',')[1];
                    if(base64Data) {
                        parts.push({ inlineData: { data: base64Data, mimeType: tempFile.type } });
                    }
                }

                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts }, config: { systemInstruction }});
                const botResponseText = response.text;
                
                const botMessage: Omit<Message, 'id'> = { text: botResponseText, sender: 'bot', timestamp: Date.now() };
                await addDoc(conversationRef, { ...botMessage, timestamp: serverTimestamp() });
            });

            if (!result.success) {
                setError(result.message);
            }

        } catch (err) {
            console.error('Error sending message:', err);
            setError('Sorry, something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full">
            <div className="flex-1 overflow-y-auto pr-2 sm:pr-4 space-y-4 bg-black/20 p-4 sm:p-6 rounded-xl border border-white/10">
                {messages.map((message) => (
                    <div key={message.id} className={`flex items-start gap-3 ${message.sender === 'user' ? 'justify-end' : ''}`}>
                        {message.sender === 'bot' && <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0"></div>}
                        <div className={`max-w-[80%] sm:max-w-lg p-3 rounded-lg ${message.sender === 'user' ? 'bg-lime-600 text-white' : 'bg-white/10 text-gray-300'}`}>
                            {message.sender === 'user' ? (
                                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                            ) : (
                                <div className="text-sm">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                            strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                                            em: ({node, ...props}) => <em className="italic" {...props} />,
                                            ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1 my-2" {...props} />,
                                            ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1 my-2" {...props} />,
                                            li: ({node, ...props}) => <li className="text-gray-300" {...props} />,
                                            a: ({node, ...props}) => <a className="text-lime-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                        }}
                                    >
                                        {message.text}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0"></div>
                        <div className="max-w-lg p-3 rounded-lg bg-white/10 text-gray-300">
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="mt-6">
                {error && <p className="text-red-400 text-sm mb-2 text-center">{error}</p>}
                <div className="relative">
                    <textarea 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} 
                        placeholder="Ask anything..." 
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-4 pr-28 text-white focus:ring-2 focus:ring-lime-500 focus:outline-none resize-none" 
                        rows={1} 
                        disabled={isLoading} 
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <label className="cursor-pointer text-gray-400 hover:text-white transition-colors disabled:opacity-50">
                            <PaperclipIcon className="w-5 h-5" />
                            <input type="file" className="hidden" onChange={handleFileChange} disabled={isLoading} />
                        </label>
                        <button 
                            onClick={handleSend} 
                            disabled={isLoading || !input.trim()} 
                            className="bg-lime-600 rounded-md p-2 text-white hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <SendIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                 {file && (
                    <div className="text-xs text-gray-400 mt-2 flex items-center gap-2 bg-white/5 px-2 py-1 rounded-md">
                        <FileIcon />
                        <span className="truncate">{file.name}</span>
                        <button onClick={() => { setFile(null); setFileData(null); }} className="text-red-400 hover:text-red-300 ml-auto">&times;</button>
                    </div>
                 )}
            </div>
        </div>
    );
};