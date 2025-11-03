import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import { supabase } from '../supabase';
import type { UserProfile, Message, Subject, Topic, UserProgress } from '../types';
import { SendIcon } from './icons/SendIcon';
import { PaperclipIcon } from './icons/PaperclipIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { GraduationCapIcon } from './icons/GraduationCapIcon';
import { useToast } from '../hooks/useToast';
import { SparklesIcon } from './icons/SparklesIcon';

declare var __app_id: string;
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// --- INLINE ICONS ---
const CheckCircleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const ArrowLeftIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
);
const FileIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);
const SearchIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

// --- HELPER & MOCK DATA ---
const mockCourses = [
  { id: 'math_algebra_1', name: 'Math - Algebra 1' },
  { id: 'science_biology', name: 'Science - Biology' },
  { id: 'history_us', name: 'History - U.S. History' },
];
const getCourseNameById = (id: string) => mockCourses.find(c => c.id === id)?.name || 'your course';

const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
};

// --- SKELETON LOADER ---
const StudyGuideSkeleton: React.FC = () => (
    <div className="space-y-4 animate-pulse p-4 sm:p-6 md:p-8">
        {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white p-4 rounded-xl border border-gray-200">
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                <div className="mt-4 space-y-3">
                    <div className="h-8 bg-gray-300 rounded w-full"></div>
                    <div className="h-8 bg-gray-300 rounded w-full"></div>
                </div>
            </div>
        ))}
    </div>
);

// --- LEARNING INTERFACE COMPONENT ---
interface LearningInterfaceProps {
    userProfile: UserProfile;
    topic: Topic & { subjectName: string };
    isCompleted: boolean;
    onClose: () => void;
    onMarkComplete: (topicId: string) => Promise<void>;
}

const LearningInterface: React.FC<LearningInterfaceProps> = ({ userProfile, topic, isCompleted, onClose, onMarkComplete }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [fileData, setFileData] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isIllustrating, setIsIllustrating] = useState(false);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const { attemptApiCall } = useApiLimiter();
    const { addToast } = useToast();

    const systemInstruction = `You are VANTUTOR, an expert AI educator. Your primary goal is to provide a comprehensive and complete understanding of the given topic for a student at their specified level.

Your Method:
1. First, mentally outline all key concepts needed to fully master the topic.
2. Begin teaching, but do NOT present the entire outline at once.
3. Break the lesson into very small, bite-sized chunks. Each message you send must be short and focus on a single, simple idea.
4. After explaining a small concept, you MUST end your message with a simple question to check for understanding before proceeding. This is crucial.
5. NEVER deliver long lectures. Keep it interactive and conversational.

Use simple language, analogies, and Markdown for clarity. For mathematical formulas and symbols, use LaTeX syntax (e.g., $...$ for inline and $$...$$ for block). Be patient and encouraging.`;

    const initiateAutoTeach = async () => {
        const prompt = `
Context:
Course: ${getCourseNameById(userProfile.course_id)}
Subject: ${topic.subjectName}
Topic: ${topic.topic_name}
User Level: ${userProfile.level}

Task:
Please start teaching me about "${topic.topic_name}". Give me a simple and clear introduction to the topic.
`;
        const result = await attemptApiCall(async () => {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: prompt }] },
                config: { systemInstruction }
            });
            const botResponseText = response.text;

            const { data: savedMessage, error } = await supabase
              .from('study_guide_messages')
              .insert({
                  user_id: userProfile.uid,
                  topic_id: topic.topic_id,
                  sender: 'bot',
                  text: botResponseText,
              })
              .select()
              .single();

            if (error || !savedMessage) throw error || new Error("Failed to save initial message.");
            
            const botMessage: Message = { 
                id: savedMessage.id, 
                text: botResponseText, 
                sender: 'bot', 
                timestamp: new Date(savedMessage.timestamp).getTime() 
            };
            setMessages([botMessage]);
        });

        if (!result.success) {
            addToast(result.message || 'Sorry, I had trouble starting the lesson.', 'error');
            onClose();
        }
    };

    useEffect(() => {
        const fetchAndInitMessages = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('study_guide_messages')
                    .select('*')
                    .eq('user_id', userProfile.uid)
                    .eq('topic_id', topic.topic_id)
                    .order('timestamp', { ascending: true });

                // If there's an error fetching history or if there's no history, start a new lesson.
                if (error || !data || data.length === 0) {
                    if (error) {
                        console.warn("Could not fetch lesson history, starting a new session.", error);
                    }
                    await initiateAutoTeach();
                } else {
                    // History found, so load it.
                    const fetchedMessages: Message[] = data.map(msg => ({
                        id: msg.id,
                        text: msg.text,
                        sender: msg.sender as 'user' | 'bot',
                        timestamp: new Date(msg.timestamp).getTime(),
                        image_url: msg.image_url,
                    }));
                    setMessages(fetchedMessages);
                }
            } catch (err) {
                // This catch block will now mainly catch errors from initiateAutoTeach
                console.error("Error initializing lesson:", err);
                addToast("Could not start the lesson. Please try again.", "error");
                onClose(); 
            } finally {
                setIsLoading(false);
            }
        };

        fetchAndInitMessages();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile.uid, topic.topic_id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading, isIllustrating]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            const reader = new FileReader();
            reader.onloadend = () => setFileData(reader.result as string);
            reader.readAsDataURL(selectedFile);
        }
    };
    
    const handleSend = async (messageText?: string) => {
        const textToSend = messageText || input;
        if ((!textToSend.trim() && !file) || isLoading || isIllustrating) return;
        
        const tempInput = textToSend;
        const tempFile = file;
        const tempFileData = fileData;

        setInput('');
        setFile(null);
        setFileData(null);
        setIsLoading(true);

        try {
            let imageUrl: string | undefined;

            if (tempFile) {
                const filePath = `${userProfile.uid}/study-guide-uploads/${topic.topic_id}/${Date.now()}-${tempFile.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('chat-media')
                    .upload(filePath, tempFile);

                if (uploadError) throw uploadError;
                
                const { data } = supabase.storage
                    .from('chat-media')
                    .getPublicUrl(filePath);

                imageUrl = data.publicUrl;
            }

            // Save user message to DB
            const { data: savedUserMessage, error: saveUserError } = await supabase
                .from('study_guide_messages')
                .insert({
                    user_id: userProfile.uid,
                    topic_id: topic.topic_id,
                    sender: 'user',
                    text: tempInput || '',
                    image_url: imageUrl,
                })
                .select()
                .single();
            
            if (saveUserError || !savedUserMessage) throw saveUserError || new Error("Failed to save user message.");
            
            // Create message for local state
            const newUserMessage: Message = {
                id: savedUserMessage.id,
                text: savedUserMessage.text || undefined,
                sender: 'user',
                timestamp: new Date(savedUserMessage.timestamp).getTime(),
                image_url: savedUserMessage.image_url,
            };
            
            const updatedMessages = [...messages, newUserMessage];
            setMessages(updatedMessages);

            const result = await attemptApiCall(async () => {
                const history = updatedMessages.map(m => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text || ''}`).join('\n');
                
                const prompt = `
Context:
Course: ${getCourseNameById(userProfile.course_id)}
Subject: ${topic.subjectName}
Topic: ${topic.topic_name}
User Level: ${userProfile.level}

Conversation History:
${history}

Task:
Continue teaching this topic based on the student's latest message. If an image is provided, analyze it in your response.
Student: "${tempInput}"
`;
                const parts: any[] = [{ text: prompt }];
                if (tempFile && tempFileData) {
                    const base64Data = tempFileData.split(',')[1];
                    if (base64Data) {
                        parts.push({ inlineData: { data: base64Data, mimeType: tempFile.type } });
                    }
                }

                const response = await ai.models.generateContent({ 
                    model: 'gemini-2.5-flash', 
                    contents: { parts },
                    config: { systemInstruction } 
                });
                const botResponseText = response.text;
                
                const { data: savedBotMessage, error: saveBotError } = await supabase
                    .from('study_guide_messages')
                    .insert({
                        user_id: userProfile.uid,
                        topic_id: topic.topic_id,
                        sender: 'bot',
                        text: botResponseText,
                    })
                    .select()
                    .single();
                
                if (saveBotError || !savedBotMessage) throw saveBotError || new Error("Failed to save bot response.");

                const botMessage: Message = { 
                    id: savedBotMessage.id, 
                    text: botResponseText, 
                    sender: 'bot', 
                    timestamp: new Date(savedBotMessage.timestamp).getTime()
                };
                setMessages(prev => [...prev, botMessage]);
            });

            if (!result.success) {
                addToast(result.message, 'error');
            }
        } catch (err) {
            console.error('Error in chat:', err);
            addToast('Sorry, something went wrong. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateIllustration = async (promptText: string) => {
        if (!promptText) {
            addToast("Not enough context to create an image.", "info");
            return;
        }

        setIsIllustrating(true);
        addToast("Creating a realistic image for you...", "info");

        const result = await attemptApiCall(async () => {
            const prompt = `Create a realistic, high-quality photograph representing the following educational concept for a student. The image should look like a real-life photo. Concept: "${promptText}"`;
            
            let response;
            const maxRetries = 2;
            for (let i = 0; i <= maxRetries; i++) {
                try {
                    response = await ai.models.generateImages({
                        model: 'imagen-4.0-generate-001',
                        prompt: prompt,
                        config: {
                          numberOfImages: 1,
                          outputMimeType: 'image/jpeg',
                          aspectRatio: '1:1',
                        },
                    });
                    break; 
                } catch (error) {
                    console.error(`Image generation attempt ${i + 1} failed:`, error);
                    if (i === maxRetries) {
                        throw error;
                    }
                    await new Promise(res => setTimeout(res, 1000 * (i + 1))); 
                }
            }

            if (!response) {
                throw new Error("API call failed to return a response after retries.");
            }
    
            if (response.generatedImages?.[0]?.image?.imageBytes) {
                const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                const mimeType = 'image/jpeg';

                const imageBlob = base64ToBlob(base64ImageBytes, mimeType);
                const filePath = `${userProfile.uid}/study-guide-illustrations/${topic.topic_id}/${Date.now()}.jpeg`;

                const { error: uploadError } = await supabase.storage
                    .from('chat-media')
                    .upload(filePath, imageBlob);
                
                if (uploadError) {
                    throw new Error(`Storage upload failed: ${uploadError.message}`);
                }

                const { data } = supabase.storage
                    .from('chat-media')
                    .getPublicUrl(filePath);

                const publicUrl = data.publicUrl;
    
                const { data: savedMessage, error: saveError } = await supabase
                    .from('study_guide_messages')
                    .insert({
                        user_id: userProfile.uid,
                        topic_id: topic.topic_id,
                        sender: 'bot',
                        text: 'Here is a visualization to help you understand:',
                        image_url: publicUrl,
                    })
                    .select()
                    .single();

                if (saveError || !savedMessage) throw saveError || new Error("Failed to save illustration message.");
                
                const botMessage: Message = {
                    id: savedMessage.id,
                    text: savedMessage.text,
                    sender: 'bot',
                    timestamp: new Date(savedMessage.timestamp).getTime(),
                    image_url: publicUrl
                };
                setMessages(prev => [...prev, botMessage]);
    
            } else {
                throw new Error("No image data received from the API.");
            }
        });

        if (!result.success) {
            addToast(result.message || "Failed to generate image after multiple attempts.", "error");
        }
        setIsIllustrating(false);
    };
    
    const lastBotMessageIndex = messages.map(m => m.sender).lastIndexOf('bot');

    return (
        <div className="flex flex-col h-full w-full bg-gray-50 md:rounded-xl border border-gray-200 overflow-hidden">
            {/* Sticky Header */}
            <header className="flex-shrink-0 flex items-center justify-between p-4 bg-white/80 backdrop-blur-lg border-b border-gray-200 z-10">
                <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors p-1 rounded-full"><ArrowLeftIcon /></button>
                <h2 className="text-lg font-bold text-gray-800 truncate mx-4 flex-1 text-center">{topic.topic_name}</h2>
                <div className="w-8 h-8"></div> {/* Spacer for balance */}
            </header>

            {/* Scrollable Message Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {messages.map((message, index) => {
                    const showIllustrateButton = index === lastBotMessageIndex && !!message.text && !isLoading && !isIllustrating;

                    return (
                        <div key={message.id} className={`flex items-start gap-3 w-full animate-fade-in-up ${message.sender === 'user' ? 'justify-end items-end' : 'justify-start'}`}>
                            {message.sender === 'bot' && 
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0 self-start">
                                   <GraduationCapIcon className="w-full h-full p-1.5 text-white" />
                                </div>
                            }
                            
                            <div className="flex flex-col max-w-[85%] sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl" style={{ alignItems: message.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div className={`p-3 px-4 rounded-2xl break-words ${message.sender === 'user' ? 'bg-lime-500 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'}`}>
                                    {message.image_url && (
                                        <div className="mb-2">
                                            <img src={message.image_url} alt="Generated illustration" className="rounded-lg w-full" />
                                        </div>
                                    )}
                                    {message.sender === 'user' ? (
                                        <p className="text-sm whitespace-pre-wrap user-select-text">{message.text}</p>
                                    ) : (
                                        message.text &&
                                        <div className="text-sm prose max-w-none user-select-text">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                rehypePlugins={[rehypeKatex]}
                                                components={{
                                                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                                    strong: ({node, ...props}) => <strong className="font-bold text-gray-900" {...props} />,
                                                    em: ({node, ...props}) => <em className="italic" {...props} />,
                                                    ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1 my-2" {...props} />,
                                                    ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1 my-2" {...props} />,
                                                    li: ({node, ...props}) => <li className="text-gray-700" {...props} />,
                                                    a: ({node, ...props}) => <a className="text-lime-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                                }}
                                            >
                                                {message.text}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                                {showIllustrateButton && (
                                    <button
                                        onClick={() => handleGenerateIllustration(message.text!)}
                                        disabled={isLoading || isIllustrating}
                                        className="mt-2 flex items-center gap-1.5 text-sm text-gray-600 hover:text-lime-700 font-medium transition-colors disabled:opacity-50"
                                    >
                                        <SparklesIcon className="w-4 h-4" />
                                        <span>Visualize</span>
                                    </button>
                                )}
                            </div>

                            {message.sender === 'user' && 
                               <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-bold flex-shrink-0 items-center justify-center flex self-start">
                                   {userProfile.display_name.charAt(0).toUpperCase()}
                               </div>
                            }
                        </div>
                    )
                })}
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
                 {isIllustrating &&
                    <div className="flex items-start gap-3 animate-fade-in-up">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0">
                           <GraduationCapIcon className="w-full h-full p-1.5 text-white" />
                        </div>
                        <div className="max-w-lg p-3 px-4 rounded-2xl bg-white border border-gray-200 rounded-bl-none">
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                                <SparklesIcon className="w-4 h-4 text-lime-500 animate-pulse" />
                                <span>Creating visualization...</span>
                            </div>
                        </div>
                    </div>
                }
                <div ref={messagesEndRef} />
            </div>
            
            {/* Fixed Input Area */}
            <footer className="flex-shrink-0 p-4 sm:p-6 border-t border-gray-200 bg-white/80 backdrop-blur-lg">
                <div className="relative flex items-center">
                    <textarea 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} 
                        placeholder="Ask a question..." 
                        className="w-full bg-white border border-gray-300 rounded-full py-3 pl-12 pr-14 text-gray-900 focus:ring-2 focus:ring-lime-500 focus:outline-none resize-none" 
                        rows={1}
                        style={{ fieldSizing: 'content' }}
                        disabled={isLoading || isIllustrating} 
                    />
                    <label className="absolute left-4 cursor-pointer text-gray-500 hover:text-gray-900 transition-colors">
                        <PaperclipIcon className="w-5 h-5" />
                        <input type="file" className="hidden" onChange={handleFileChange} disabled={isLoading || isIllustrating} accept="image/*" />
                    </label>
                    <button 
                        onClick={() => handleSend()} 
                        disabled={isLoading || isIllustrating || (!input.trim() && !file)} 
                        className="absolute right-3 bg-lime-600 rounded-full p-2 text-white hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                </div>
                {file && <div className="text-xs text-gray-600 mt-2 flex items-center gap-2 bg-gray-200 p-1 px-2 rounded-md w-fit"><FileIcon /><span>{file.name}</span><button onClick={() => { setFile(null); setFileData(null); }} className="text-red-500 hover:text-red-400">&times;</button></div>}
                
                {!isCompleted && <button onClick={() => onMarkComplete(topic.topic_id)} disabled={isIllustrating || isLoading} className="mt-4 w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50">Mark as Complete (+2 XP)</button>}
            </footer>
        </div>
    );
};

// --- TOPIC & SUBJECT COMPONENTS ---
const TopicCard: React.FC<{ topic: Topic, isCompleted: boolean, onSelect: () => void }> = ({ topic, isCompleted, onSelect }) => (
    <button onClick={onSelect} className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-white/10 transition-colors">
        <span className="text-white">{topic.topic_name}</span>
        {isCompleted && <CheckCircleIcon className="w-5 h-5 text-white" />}
    </button>
);

const SubjectAccordion: React.FC<{ subject: Subject, userProgress: UserProgress, onSelectTopic: (topic: Topic, subjectName: string) => void }> = ({ subject, userProgress, onSelectTopic }) => {
    const [isOpen, setIsOpen] = useState(false); // Default to closed
    const completedCount = subject.topics.filter(t => userProgress[t.topic_id]?.is_complete).length;
    const totalCount = subject.topics.length;
    const isSubjectComplete = completedCount === totalCount;

    return (
        <div className="bg-gradient-to-br from-lime-500 to-teal-500 p-4 rounded-xl shadow-lg">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center">
                <div className="text-left">
                    <h3 className="text-lg font-bold text-white">{subject.subject_name}</h3>
                    <p className="text-sm text-lime-100">{completedCount} / {totalCount} topics completed</p>
                </div>
                <div className="flex items-center gap-4 text-white">
                    {isSubjectComplete && <span className="text-xs font-bold text-teal-800 bg-white px-2 py-1 rounded-full">Complete</span>}
                    <ChevronDownIcon className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isOpen ? 'max-h-screen mt-4 pt-4 border-t border-white/30' : 'max-h-0'}`}>
                {totalCount > 0 ? (
                    <div className="space-y-1">
                        {subject.topics.map(topic => (
                            <TopicCard key={topic.topic_id} topic={topic} isCompleted={userProgress[topic.topic_id]?.is_complete || false} onSelect={() => onSelectTopic(topic, subject.subject_name)} />
                        ))}
                    </div>
                ) : (
                    <p className="text-lime-100 text-sm p-3">No topics available for this subject yet.</p>
                )}
            </div>
        </div>
    );
};


// --- MAIN STUDY GUIDE COMPONENT ---
interface StudyGuideProps {
    userProfile: UserProfile;
    onXPEarned: (xp: number) => void;
}

export const StudyGuide: React.FC<StudyGuideProps> = ({ userProfile, onXPEarned }) => {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [userProgress, setUserProgress] = useState<UserProgress>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTopic, setSelectedTopic] = useState<(Topic & { subjectName: string }) | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { addToast } = useToast();
    
    useEffect(() => {
        setIsLoading(true);
        const fetchCourseData = async () => {
            try {
                const { data: courseData, error } = await supabase
                    .from('courses_data')
                    .select('subject_list')
                    .eq('id', userProfile.course_id)
                    .single();
                
                if (error) throw error;
                
                if (courseData) {
                    const allSubjects = courseData.subject_list || [];
                    const subjectsForLevel = allSubjects.filter((subject: Subject) => subject.level === userProfile.level);
                    setSubjects(subjectsForLevel);
                } else {
                     console.error("Course document not found!");
                    addToast("Could not load study guide. Course data is missing.", "error");
                }
            } catch (err: any) {
                console.error("Error fetching course data:", err);
                addToast("An error occurred while loading the study guide.", "error");
            }
        };
        fetchCourseData();

        const progressChannel = supabase
            .channel(`user-progress-${userProfile.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_progress', filter: `user_id=eq.${userProfile.uid}` }, payload => {
                fetchUserProgress();
            })
            .subscribe();

        const fetchUserProgress = async () => {
             const { data, error } = await supabase
                .from('user_progress')
                .select('*')
                .eq('user_id', userProfile.uid);

            if (error) {
                console.error("Error fetching user progress:", error);
                addToast("Failed to load your progress.", "error");
            } else {
                 const progressData: UserProgress = {};
                 data.forEach(item => {
                     progressData[item.topic_id] = { is_complete: item.is_complete, xp_earned: item.xp_earned };
                 });
                 setUserProgress(progressData);
            }
            setIsLoading(false);
        };
        
        fetchUserProgress();

        return () => {
            supabase.removeChannel(progressChannel);
        };
    }, [userProfile.course_id, userProfile.uid, userProfile.level, addToast]);

    const handleMarkComplete = async (topicId: string) => {
        if (userProgress[topicId]?.is_complete) return;

        try {
            const { error: progressError } = await supabase
                .from('user_progress')
                .upsert({ user_id: userProfile.uid, topic_id: topicId, is_complete: true, xp_earned: 2 });

            if (progressError) throw progressError;
            
            if (selectedTopic && selectedTopic.topic_id === topicId) {
                const { error: notificationError } = await supabase.from('notifications').insert({
                    user_id: userProfile.uid,
                    type: 'study_update',
                    title: 'Topic Complete!',
                    message: `Great job on finishing "${selectedTopic.topic_name}". You earned 2 XP!`,
                    is_read: false,
                });
                if (notificationError) console.error("Failed to create notification:", notificationError);
            }

            onXPEarned(2);
            addToast("Topic marked as complete! +2 XP", "success");
        } catch (error) {
            console.error("Failed to mark topic as complete:", error);
            addToast("Could not save your progress.", "error");
        }
    };

    const handleSelectTopic = async (topic: Topic, subjectName: string) => {
        const isNewTopic = !userProgress[topic.topic_id];

        if (isNewTopic) {
            try {
                await supabase.from('notifications').insert({
                    user_id: userProfile.uid,
                    type: 'study_update',
                    title: 'New Topic Started!',
                    message: `You've begun learning about "${topic.topic_name}". Keep up the great work!`,
                    is_read: false,
                });
            } catch (error) {
                console.error("Failed to create 'new topic' notification:", error);
            }
        }
        
        setSelectedTopic({ ...topic, subjectName });
    };

    const filteredSubjects = subjects
        .map(subject => ({
            ...subject,
            topics: subject.topics.filter(topic =>
                topic.topic_name.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }))
        .filter(subject => subject.topics.length > 0);

    const firstSemesterSubjects = filteredSubjects.filter(s => !s.semester || s.semester === 'first');
    const secondSemesterSubjects = filteredSubjects.filter(s => s.semester === 'second');

    if (selectedTopic) {
        return (
            <LearningInterface 
                userProfile={userProfile} 
                topic={selectedTopic}
                isCompleted={userProgress[selectedTopic.topic_id]?.is_complete || false}
                onClose={() => setSelectedTopic(null)} 
                onMarkComplete={handleMarkComplete}
            />
        );
    }

    return (
        <div className="flex-1 flex flex-col w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
             <div className="flex-shrink-0 p-4 sm:p-6 md:px-8 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search topics..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-100 border border-gray-300 rounded-full py-2.5 pl-10 pr-4 text-gray-900 focus:ring-2 focus:ring-lime-500 focus:outline-none"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <SearchIcon />
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                {isLoading && <StudyGuideSkeleton />}

                {!isLoading && (firstSemesterSubjects.length > 0 || secondSemesterSubjects.length > 0) ? (
                    <div className="space-y-8">
                        {firstSemesterSubjects.length > 0 && (
                            <section>
                                <h2 className="flex items-center gap-3 text-lg font-bold text-lime-800 bg-lime-100 px-4 py-2 rounded-lg border border-lime-200 mb-4">
                                    <GraduationCapIcon className="w-6 h-6" />
                                    <span>First Semester</span>
                                </h2>
                                <div className="space-y-4">
                                    {firstSemesterSubjects.map(subject => (
                                        <SubjectAccordion key={subject.subject_id} subject={subject} userProgress={userProgress} onSelectTopic={handleSelectTopic} />
                                    ))}
                                </div>
                            </section>
                        )}
                        {secondSemesterSubjects.length > 0 && (
                            <section>
                                <h2 className="flex items-center gap-3 text-lg font-bold text-lime-800 bg-lime-100 px-4 py-2 rounded-lg border border-lime-200 mb-4">
                                    <GraduationCapIcon className="w-6 h-6" />
                                    <span>Second Semester</span>
                                </h2>
                                <div className="space-y-4">
                                    {secondSemesterSubjects.map(subject => (
                                        <SubjectAccordion key={subject.subject_id} subject={subject} userProgress={userProgress} onSelectTopic={handleSelectTopic} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                ) : null}

                 {!isLoading && filteredSubjects.length === 0 && (
                    <div className="text-center text-gray-500 py-10">
                        <p className="font-semibold">No topics found for '{userProfile.level}' level.</p>
                        <p className="text-sm">Try adjusting your search term or changing your level in Settings.</p>
                    </div>
                 )}
            </div>
        </div>
    );
};