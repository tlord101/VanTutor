
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, collection, addDoc, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore';
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
    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const hasInitiatedAutoTeach = useRef(false);
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
        setIsLoading(true);
        
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
            addToast(result.message || 'Sorry, I had trouble starting the lesson. You can still ask a question to begin.', 'error');
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
        }, err => {
            console.error("Error fetching conversation:", err);
            addToast("Failed to load conversation history.", "error");
        });

        return () => unsubscribe();
    }, [userProfile.uid, topic.topicId]);

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
                addToast(result.message, 'error');
            }
        } catch (err) {
            console.error('Error in chat:', err);
            addToast('Sorry, something went wrong. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-gray-50 md:rounded-xl border border-gray-200 overflow-hidden">
            {/* Sticky Header */}
            <header className="flex-shrink-0 flex items-center justify-between p-4 bg-white/80 backdrop-blur-lg border-b border-gray-200 z-10">
                <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors p-1 rounded-full"><ArrowLeftIcon /></button>
                <h2 className="text-lg font-bold text-gray-800 truncate mx-4 flex-1 text-center">{topic.topicName}</h2>
                <div className="w-8 h-8"></div> {/* Spacer for balance */}
            </header>

            {/* Scrollable Message Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {messages.map((message) => (
                    <div key={message.id} className={`flex items-end gap-3 w-full animate-fade-in-up ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {message.sender === 'bot' && 
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-lime-400 to-teal-500 flex-shrink-0 self-start">
                               <GraduationCapIcon className="w-full h-full p-1.5 text-white" />
                            </div>
                        }
                        <div className={`max-w-[85%] sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl p-3 px-4 rounded-2xl break-words ${message.sender === 'user' ? 'bg-lime-500 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'}`}>
                            {message.sender === 'user' ? (
                                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                            ) : (
                                <div className="text-sm prose max-w-none">
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
                        disabled={isLoading} 
                    />
                    <label className="absolute left-4 cursor-pointer text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50">
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
                {file && <div className="text-xs text-gray-600 mt-2 flex items-center gap-2 bg-gray-200 p-1 px-2 rounded-md w-fit"><FileIcon /><span>{file.name}</span><button onClick={() => { setFile(null); setFileData(null); }} className="text-red-500 hover:text-red-400">&times;</button></div>}
                
                {!isCompleted && <button onClick={() => onMarkComplete(topic.topicId)} className="mt-4 w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition-colors">Mark as Complete (+2 XP)</button>}
            </footer>
        </div>
    );
};

// --- TOPIC & SUBJECT COMPONENTS ---
const TopicCard: React.FC<{ topic: Topic, isCompleted: boolean, onSelect: () => void }> = ({ topic, isCompleted, onSelect }) => (
    <button onClick={onSelect} className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
        <span className="text-gray-700">{topic.topicName}</span>
        {isCompleted && <CheckCircleIcon className="w-5 h-5 text-lime-500" />}
    </button>
);

const SubjectAccordion: React.FC<{ subject: Subject, userProgress: UserProgress, onSelectTopic: (topic: Topic, subjectName: string) => void }> = ({ subject, userProgress, onSelectTopic }) => {
    const [isOpen, setIsOpen] = useState(true); // Default to open
    const completedCount = subject.topics.filter(t => userProgress[t.topicId]?.isComplete).length;
    const totalCount = subject.topics.length;
    const isSubjectComplete = completedCount === totalCount;

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center">
                <div className="text-left">
                    <h3 className="text-lg font-bold text-gray-800">{subject.subjectName}</h3>
                    <p className="text-sm text-gray-500">{completedCount} / {totalCount} topics completed</p>
                </div>
                <div className="flex items-center gap-4">
                    {isSubjectComplete && <span className="text-xs font-bold text-lime-600 bg-lime-100 px-2 py-1 rounded-full">Complete</span>}
                    <ChevronDownIcon className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isOpen ? 'max-h-screen mt-4 pt-4 border-t border-gray-200' : 'max-h-0'}`}>
                {totalCount > 0 ? (
                    <div className="space-y-1">
                        {subject.topics.map(topic => (
                            <TopicCard key={topic.topicId} topic={topic} isCompleted={userProgress[topic.topicId]?.isComplete || false} onSelect={() => onSelectTopic(topic, subject.subjectName)} />
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm p-3">No topics available for this subject yet.</p>
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
        const courseDocRef = doc(db, 'artifacts', __app_id, 'public', 'data', 'courses', userProfile.courseId);
        const unsubscribeCourse = onSnapshot(courseDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const allSubjects = docSnap.data().subjectList || [];
                const subjectsForLevel = allSubjects.filter((subject: Subject) => subject.level === userProfile.level);
                setSubjects(subjectsForLevel);
            } else {
                console.error("Course document not found!");
                addToast("Could not load study guide. Course data is missing.", "error");
            }
        }, err => {
            console.error("Error fetching course data:", err);
            addToast("An error occurred while loading the study guide.", "error");
        });

        const progressColRef = collection(db, 'users', userProfile.uid, 'progress');
        const unsubscribeProgress = onSnapshot(progressColRef, (snapshot) => {
            const progressData: UserProgress = {};
            snapshot.forEach(doc => {
                progressData[doc.id] = doc.data() as { isComplete: boolean; xpEarned: number; };
            });
            setUserProgress(progressData);
            setIsLoading(false);
        }, err => {
            console.error("Error fetching user progress:", err);
            addToast("Failed to load your progress.", "error");
            setIsLoading(false);
        });

        return () => {
            unsubscribeCourse();
            unsubscribeProgress();
        };
    }, [userProfile.courseId, userProfile.uid, userProfile.level, addToast]);

    const handleMarkComplete = async (topicId: string) => {
        if (userProgress[topicId]?.isComplete) return;

        try {
            const batch = writeBatch(db);
            const progressDocRef = doc(db, 'users', userProfile.uid, 'progress', topicId);
            batch.set(progressDocRef, { isComplete: true, xpEarned: 2 });
            
            if (selectedTopic && selectedTopic.topicId === topicId) {
                const notificationRef = doc(collection(db, 'users', userProfile.uid, 'notifications'));
                const notificationData = {
                    type: 'study_update' as const,
                    title: 'Topic Complete!',
                    message: `Great job on finishing "${selectedTopic.topicName}". You earned 2 XP!`,
                    timestamp: serverTimestamp(),
                    isRead: false,
                };
                batch.set(notificationRef, notificationData);
            }

            await batch.commit();

            onXPEarned(2);
            addToast("Topic marked as complete! +2 XP", "success");
        } catch (error) {
            console.error("Failed to mark topic as complete:", error);
            addToast("Could not save your progress.", "error");
        }
    };

    const handleSelectTopic = async (topic: Topic, subjectName: string) => {
        const isNewTopic = !userProgress[topic.topicId];

        if (isNewTopic) {
            try {
                const notificationsRef = collection(db, 'users', userProfile.uid, 'notifications');
                await addDoc(notificationsRef, {
                    type: 'study_update' as const,
                    title: 'New Topic Started!',
                    message: `You've begun learning about "${topic.topicName}". Keep up the great work!`,
                    timestamp: serverTimestamp(),
                    isRead: false,
                });
            } catch (error) {
                console.error("Failed to create 'new topic' notification:", error);
                // Non-critical, so we don't show a toast to the user
            }
        }
        
        setSelectedTopic({ ...topic, subjectName });
    };

    const filteredSubjects = subjects
        .map(subject => ({
            ...subject,
            topics: subject.topics.filter(topic =>
                topic.topicName.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }))
        .filter(subject => subject.topics.length > 0);

    if (selectedTopic) {
        return (
            <LearningInterface 
                userProfile={userProfile} 
                topic={selectedTopic}
                isCompleted={userProgress[selectedTopic.topicId]?.isComplete || false}
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
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-4">
                {isLoading && <StudyGuideSkeleton />}
                {!isLoading && filteredSubjects.length > 0 && (
                    filteredSubjects.map(subject => (
                        <SubjectAccordion key={subject.subjectId} subject={subject} userProgress={userProgress} onSelectTopic={handleSelectTopic} />
                    ))
                )}
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
