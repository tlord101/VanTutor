import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, collection, addDoc, query, orderBy, serverTimestamp, getDocs } from 'firebase/firestore';
import type { UserProfile, Message, Subject, Topic, UserProgress } from '../types';
import { SendIcon } from './icons/SendIcon';
import { PaperclipIcon } from './icons/PaperclipIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { LockIcon } from './icons/LockIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiLimiter } from '../hooks/useApiLimiter';

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

// --- SKELETON LOADER ---
const StudyGuideSkeleton: React.FC = () => (
    <div className="space-y-4 animate-pulse p-4 sm:p-6 md:p-8">
        {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/5 p-4 rounded-xl">
                <div className="h-6 bg-gray-600 rounded w-1/3"></div>
                <div className="mt-4 space-y-3">
                    <div className="h-8 bg-gray-700 rounded w-full"></div>
                    <div className="h-8 bg-gray-700 rounded w-full"></div>
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
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const hasInitiatedAutoTeach = useRef(false);
    const { attemptApiCall } = useApiLimiter(userProfile.plan);

    const systemInstruction = `You are VANTUTOR, an expert AI educator. Your primary goal is to provide a comprehensive and complete understanding of the given topic for a student at their specified level.

Your Method:
1. First, mentally outline all key concepts needed to fully master the topic.
2. Begin teaching, but do NOT present the entire outline at once.
3. Break the lesson into very small, bite-sized chunks. Each message you send must be short and focus on a single, simple idea.
4. After explaining a small concept, you MUST end your message with a simple question to check for understanding before proceeding. This is crucial.
5. NEVER deliver long lectures. Keep it interactive and conversational.

Use simple language, analogies, and Markdown for clarity. Be patient and encouraging.`;

    // FIX: Moved all component logic (functions, useEffects) inside the component scope.
    const generateSuggestions = async (tutorMessage: string) => {
        if (isGeneratingSuggestions) return;
        setIsGeneratingSuggestions(true);
        setSuggestions([]);
        try {
            const prompt = `Based on this tutor's last message: "${tutorMessage}", generate three distinct, extremely concise replies for a student. The student's level is "${userProfile.level}". The replies should be things a student would say to continue the conversation. Each reply MUST be a single short sentence, a phrase, or even a single word (e.g., "Why?", "Tell me more", "Okay"). Return a JSON object with a single key "suggestions" containing an array of these 3 short strings.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            suggestions: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: "An array of three distinct, extremely concise suggested replies for the student (single sentence, phrase, or one word)."
                            }
                        },
                        required: ['suggestions']
                    }
                }
            });
            const responseData = JSON.parse(response.text);
            if (responseData.suggestions && Array.isArray(responseData.suggestions)) {
                setSuggestions(responseData.suggestions.slice(0, 3));
            }
        } catch (error) {
            console.error("Failed to generate suggestions:", error);
        } finally {
            setIsGeneratingSuggestions(false);
        }
    };
    
    const initiateAutoTeach = async () => {
        setIsLoading(true);
        setError(null);
        
        const conversationRef = collection(db, 'users', userProfile.uid, 'conversations', topic.topicId, 'messages');
            
        const prompt = `
Context:
Course: ${getCourseNameById(userProfile.courseId)}
Subject: ${topic.subjectName}
Topic: ${topic.topicName}
User Level: ${userProfile.level}

Task:
Please start teaching me about "${topic.topicName}". Give me a simple and clear introduction to the topic.
`;
        const result = await attemptApiCall(async () => {
            const parts: any[] = [{ text: prompt }];
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts },
                config: { systemInstruction }
            });
            const botResponseText = response.text;
            
            const botMessage: Omit<Message, 'id'> = { text: botResponseText, sender: 'bot', timestamp: Date.now() };
            await addDoc(conversationRef, { ...botMessage, timestamp: serverTimestamp() });
        });

        if (!result.success) {
            setError(result.message || 'Sorry, I had trouble starting the lesson. You can still ask a question to begin.');
        }
        setIsLoading(false);
    };

    useEffect(() => {
        const conversationRef = collection(db, 'users', userProfile.uid, 'conversations', topic.topicId, 'messages');
        const q = query(conversationRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (snapshot.empty && !hasInitiatedAutoTeach.current) {
                hasInitiatedAutoTeach.current = true;
                initiateAutoTeach();
            }

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
    }, [userProfile.uid, topic.topicId]);

    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.sender === 'bot' && !isLoading && lastMessage.text.trim().endsWith('?')) {
            generateSuggestions(lastMessage.text);
        } else if (lastMessage?.sender === 'user' || isLoading) {
            setSuggestions([]);
        }
    }, [messages, isLoading]);

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
    
    const handleSend = async (messageText?: string) => {
        const textToSend = messageText || input;
        if (!textToSend.trim() || isLoading) return;
        
        const userMessageText = file ? `${textToSend}\n\n[Attached file: ${file.name}]` : textToSend;
        const userMessage: Omit<Message, 'id'> = { text: userMessageText, sender: 'user', timestamp: Date.now() };
        
        const tempInput = textToSend;
        const tempFile = file;
        const tempFileData = fileData;

        setInput('');
        setFile(null);
        setFileData(null);
        setIsLoading(true);
        setError(null);
        setSuggestions([]);

        try {
            const conversationRef = collection(db, 'users', userProfile.uid, 'conversations', topic.topicId, 'messages');
            await addDoc(conversationRef, { ...userMessage, timestamp: serverTimestamp() });

            const result = await attemptApiCall(async () => {
                 const history = messages.map(m => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
                const prompt = `
Context:
Course: ${getCourseNameById(userProfile.courseId)}
Subject: ${topic.subjectName}
Topic: ${topic.topicName}
User Level: ${userProfile.level}

Conversation History:
${history}

Task:
Continue teaching this topic based on the student's latest message.
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
                
                const botMessage: Omit<Message, 'id'> = { text: botResponseText, sender: 'bot', timestamp: Date.now() };
                await addDoc(conversationRef, { ...botMessage, timestamp: serverTimestamp() });
            });

            if (!result.success) {
                setError(result.message);
            }
        } catch (err) {
            console.error('Error in chat:', err);
            setError('Sorry, something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-black/20 md:rounded-xl border border-white/10 overflow-hidden">
            {/* Sticky Header */}
            <header className="flex-shrink-0 flex items-center justify-between p-4 bg-white/5 backdrop-blur-lg border-b border-white/10 z-10">
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full"><ArrowLeftIcon /></button>
                <h2 className="text-lg font-bold text-white truncate mx-4 flex-1 text-center">{topic.topicName}</h2>
                <div className="w-8 h-8"></div> {/* Spacer for balance */}
            </header>

            {/* Scrollable Message Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {messages.map((message) => (
                    <div key={message.id} className={`flex items-start gap-3 animate-fade-in ${message.sender === 'user' ? 'justify-end' : ''}`}>
                        {message.sender === 'bot' && <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0"></div>}
                        <div className={`max-w-[80%] sm:max-w-lg p-3 px-4 rounded-2xl ${message.sender === 'user' ? 'bg-lime-900/70 text-white' : 'bg-white/5 text-gray-300'}`}>
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
                {isLoading && <div className="flex items-start gap-3 animate-fade-in"><div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0"></div><div className="max-w-lg p-3 px-4 rounded-2xl bg-white/5 text-gray-300"><div className="flex items-center space-x-2"><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div></div></div></div>}
                <div ref={messagesEndRef} />
            </div>
            
            {/* Fixed Input Area */}
            <footer className="flex-shrink-0 p-4 sm:p-6 border-t border-white/10 bg-gray-900/30 backdrop-blur-lg">
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-3 justify-end">
                      {suggestions.map((suggestion, index) => (
                          <button
                              key={index}
                              onClick={() => handleSend(suggestion)}
                              disabled={isLoading}
                              className="px-3 py-1.5 text-sm bg-white/10 text-gray-300 rounded-full hover:bg-white/20 transition-colors disabled:opacity-50"
                          >
                              {suggestion}
                          </button>
                      ))}
                  </div>
                )}
                {error && <p className="text-red-400 text-sm mb-2 text-center">{error}</p>}
                
                <div className="relative flex items-center">
                    <textarea 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} 
                        placeholder="Ask a question..." 
                        className="w-full bg-black/30 border border-white/10 rounded-full py-3 pl-12 pr-14 text-white focus:ring-2 focus:ring-lime-500 focus:outline-none resize-none" 
                        rows={1}
                        style={{ fieldSizing: 'content' }}
                        disabled={isLoading} 
                    />
                    <label className="absolute left-4 cursor-pointer text-gray-400 hover:text-white transition-colors disabled:opacity-50">
                        <PaperclipIcon className="w-5 h-5" />
                        <input type="file" className="hidden" onChange={handleFileChange} disabled={isLoading} />
                    </label>
                    <button 
                        onClick={() => handleSend()} 
                        disabled={isLoading || !input.trim()} 
                        className="absolute right-3 bg-lime-600 rounded-full p-2 text-white hover:bg-lime-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                </div>
                {file && <div className="text-xs text-gray-400 mt-2 flex items-center gap-2 bg-black/30 p-1 px-2 rounded-md w-fit"><FileIcon /><span>{file.name}</span><button onClick={() => { setFile(null); setFileData(null); }} className="text-red-400 hover:text-red-300">&times;</button></div>}
                
                {!isCompleted && <button onClick={() => onMarkComplete(topic.topicId)} className="mt-4 w-full bg-white/10 text-white font-bold py-3 px-4 rounded-lg hover:bg-white/20 transition-colors">Mark as Complete (+2 XP)</button>}
            </footer>
        </div>
    );
};

// --- TOPIC & SUBJECT COMPONENTS ---
const TopicCard: React.FC<{ topic: Topic, isCompleted: boolean, onSelect: () => void, isLocked: boolean }> = ({ topic, isCompleted, onSelect, isLocked }) => (
    <button onClick={onSelect} disabled={isLocked} className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        <span className={isLocked ? "text-gray-500" : "text-gray-300"}>{topic.topicName}</span>
        {isLocked ? <LockIcon className="w-4 h-4 text-gray-500" /> : isCompleted && <CheckCircleIcon className="w-5 h-5 text-lime-500" />}
    </button>
);

const SubjectAccordion: React.FC<{ subject: Subject, userProgress: UserProgress, onTopicSelect: (topic: Topic) => void, isLocked: boolean, isStarterLocked: boolean, isInitiallyOpen: boolean }> = ({ subject, userProgress, onTopicSelect, isLocked, isStarterLocked, isInitiallyOpen }) => {
    const [isOpen, setIsOpen] = useState(isInitiallyOpen);

    const totalTopics = subject.topics?.length || 0;
    const completedTopics = totalTopics > 0 ? subject.topics.filter(topic => userProgress[topic.topicId]?.isComplete).length : 0;
    const progressPercentage = totalTopics > 0 ? (completedTopics / totalTopics) * 100 : 0;

    return (
        <div className="bg-gradient-to-br from-white/[.07] to-white/0 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isLocked}
                className="w-full text-left p-4 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-expanded={isOpen}
                aria-controls={`subject-content-${subject.subjectId}`}
            >
                <div className="flex justify-between items-center">
                    <h3 className={`text-lg font-semibold ${isLocked ? 'text-gray-500' : 'text-white'}`}>{subject.subjectName}</h3>
                    {isLocked ? 
                        <LockIcon className="w-5 h-5 text-gray-500" /> : 
                        <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    }
                </div>
                {!isLocked && (
                    <div className="mt-3 flex items-center gap-3">
                        <div
                            className="flex-1 bg-black/30 rounded-full h-2 overflow-hidden"
                            role="progressbar"
                            aria-valuenow={progressPercentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuetext={`${completedTopics} of ${totalTopics} topics completed`}
                            aria-label={`${subject.subjectName} progress`}
                        >
                            <div
                                className="bg-gradient-to-r from-teal-500 to-lime-500 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                        <span className="text-sm font-medium text-gray-400 w-24 text-right tabular-nums" aria-hidden="true">
                            {completedTopics}/{totalTopics} ({Math.round(progressPercentage)}%)
                        </span>
                    </div>
                )}
            </button>
            <div
                id={`subject-content-${subject.subjectId}`}
                className={`transition-all duration-300 ease-in-out overflow-y-auto ${isOpen ? 'max-h-96' : 'max-h-0'} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
            >
                <div className="px-4 pb-2">
                    {subject.topics.map((topic, index) => (
                        <TopicCard
                            key={topic.topicId}
                            topic={topic}
                            isCompleted={!!userProgress[topic.topicId]?.isComplete}
                            onSelect={() => onTopicSelect(topic)}
                            isLocked={isStarterLocked && index > 0}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};


// --- MAIN STUDY GUIDE PAGE COMPONENT ---
interface StudyGuideProps {
  userProfile: UserProfile;
  onStudyXPEarned: (xp: number) => void;
}

export const StudyGuide: React.FC<StudyGuideProps> = ({ userProfile, onStudyXPEarned }) => {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [userProgress, setUserProgress] = useState<UserProgress>({});
    const [selectedTopic, setSelectedTopic] = useState<(Topic & { subjectName: string }) | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setIsLoading(true);
        const courseDocRef = doc(db, `artifacts/${__app_id}/public/data/courses`, userProfile.courseId);
        const unsubscribeCourse = onSnapshot(courseDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setSubjects(docSnap.data().subjectList || []);
            } else {
                setError("Could not find study materials for your course.");
            }
            setIsLoading(false);
        }, (err) => {
            console.error("Error fetching course data:", err);
            setError("Failed to load study guide. Please try again later.");
            setIsLoading(false);
        });

        const progressColRef = collection(db, 'users', userProfile.uid, 'progress');
        const unsubscribeProgress = onSnapshot(progressColRef, (snapshot) => {
            const progressData: UserProgress = {};
            snapshot.forEach(doc => {
                progressData[doc.id] = doc.data() as { isComplete: boolean; xpEarned: number; };
            });
            setUserProgress(progressData);
        });

        return () => {
            unsubscribeCourse();
            unsubscribeProgress();
        };
    }, [userProfile.uid, userProfile.courseId]);
    
    const handleMarkComplete = async (topicId: string) => {
        if (userProgress[topicId]?.isComplete) return;

        try {
            const progressDocRef = doc(db, 'users', userProfile.uid, 'progress', topicId);
            await setDoc(progressDocRef, { isComplete: true, xpEarned: 2 });
            await onStudyXPEarned(2);
        } catch (err) {
            console.error("Failed to mark topic as complete:", err);
        }
    };
    
    const filteredSubjects = searchQuery.trim() === ''
      ? subjects
      : subjects.map(subject => {
            const lowerCaseQuery = searchQuery.toLowerCase();
            const subjectNameMatch = subject.subjectName.toLowerCase().includes(lowerCaseQuery);
            const matchingTopics = subject.topics?.filter(topic =>
                topic.topicName.toLowerCase().includes(lowerCaseQuery)
            ) || [];

            if (subjectNameMatch) {
                return subject;
            }
            if (matchingTopics.length > 0) {
                return { ...subject, topics: matchingTopics };
            }
            return null;
        }).filter((subject): subject is Subject => subject !== null);


    if (selectedTopic) {
        return <LearningInterface 
            userProfile={userProfile} 
            topic={selectedTopic} 
            isCompleted={!!userProgress[selectedTopic.topicId]?.isComplete}
            onClose={() => setSelectedTopic(null)} 
            onMarkComplete={handleMarkComplete} 
        />;
    }

    return (
        <div className="flex-1 flex flex-col h-full w-full">
            {isLoading && <StudyGuideSkeleton />}
            {error && <p className="text-center text-red-400 p-4 sm:p-6 md:p-8">{error}</p>}
            {!isLoading && !error && (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 md:pt-8 pb-4">
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <SearchIcon className="text-gray-500" />
                            </span>
                            <input
                                type="text"
                                placeholder="Search for a topic..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-full py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-lime-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:px-6 md:px-8 sm:pt-0 sm:pb-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                         {filteredSubjects.length > 0 ? (
                            filteredSubjects.map((subject) => {
                                const isFreePlan = userProfile.plan === 'free';
                                const isStarterPlan = userProfile.plan === 'starter';
                                
                                const originalSubjectIndex = subjects.findIndex(s => s.subjectId === subject.subjectId);

                                const isSubjectLocked = (isFreePlan && originalSubjectIndex > 0) || (isStarterPlan && originalSubjectIndex > 4);
                                const isTopicLockedForFreePlan = isFreePlan && originalSubjectIndex === 0;

                                return (
                                    <SubjectAccordion 
                                        key={subject.subjectId + searchQuery} 
                                        subject={subject} 
                                        userProgress={userProgress} 
                                        onTopicSelect={(topic) => setSelectedTopic({ ...topic, subjectName: subject.subjectName })} 
                                        isLocked={isSubjectLocked}
                                        isStarterLocked={isTopicLockedForFreePlan}
                                        isInitiallyOpen={searchQuery.length > 0}
                                    />
                                );
                            })
                        ) : (
                             <div className="text-center text-gray-400 py-16">
                                <h3 className="text-lg font-semibold">No results found</h3>
                                <p>Try adjusting your search query for '{searchQuery}'.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};