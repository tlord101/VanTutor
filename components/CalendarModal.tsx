import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { ref as dbRef, get, set } from 'firebase/database';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { Type } from '@google/genai';
import { useToast } from '../hooks/useToast';
import { getFeatureModel } from '../utils/usage';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { useAppSettings } from '../hooks/useAppSettings';
import type { UserProfile } from '../types';

interface CalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
    userProfile: UserProfile;
}

interface StudySession {
    id: string;
    day: string;
    time: string;
    subject: string;
    topic: string;
    activity: string;
    complete: boolean;
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const CalendarModal: React.FC<CalendarModalProps> = ({ isOpen, onClose, userProfile }) => {
    const { addToast } = useToast();
    const { attemptApiCall } = useApiLimiter();
    const { settings: appSettings } = useAppSettings();
    const geminiModel = getFeatureModel('chat_interaction', appSettings);
    const ai = useMemo(() => createAvelutAI(appSettings, userProfile), [appSettings, userProfile]);

    const [timetable, setTimetable] = useState<StudySession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [textInput, setTextInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Upload options menu popover
    const [showUploadMenu, setShowUploadMenu] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedFileBase64, setUploadedFileBase64] = useState('');
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const fetchTimetable = async () => {
            setIsLoading(true);
            try {
                const timetableRef = dbRef(db, `users/${userProfile.uid}/timetable`);
                const snap = await get(timetableRef);
                if (snap.exists()) {
                    setTimetable(snap.val() || []);
                } else {
                    setTimetable([]);
                }
            } catch (err) {
                console.error("Failed to fetch study timetable:", err);
            } finally {
                setIsLoading(false);
            }
        };
        void fetchTimetable();
    }, [isOpen, userProfile.uid]);

    // Handle clicks outside upload popup to dismiss
    useEffect(() => {
        if (!showUploadMenu) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
                setShowUploadMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showUploadMenu]);

    const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(new Error(`Failed to read file: ${reader.error?.message || 'Unknown error'}`));
        reader.readAsDataURL(file);
    });

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        try {
            setUploadedFile(file);
            const b64 = await fileToBase64(file);
            setUploadedFileBase64(b64);
            addToast(`File "${file.name}" attached.`, 'success');
        } catch (err: any) {
            addToast('Failed to load file: ' + err.message, 'error');
        }
        setShowUploadMenu(false);
    };

    const handleGenerateTimetable = async () => {
        if (!textInput.trim() && !uploadedFile) {
            addToast('Please enter some study goals or upload a syllabus first.', 'info');
            return;
        }

        setIsGenerating(true);
        try {
            if (!ai) throw new Error('AI client is not configured.');
            
            let fileDataPart: any = null;
            if (uploadedFile && uploadedFileBase64) {
                fileDataPart = {
                    inlineData: {
                        mimeType: uploadedFile.type,
                        data: uploadedFileBase64
                    }
                };
            }

            const prompt = `You are AVELUT AI Study Scheduler.
Analyze the user's study goals, text context, and/or uploaded syllabus/timetable file to generate a highly efficient, balanced weekly study timetable.
Generate exactly 5 to 10 study sessions distributed across the week.
For each session, provide:
- day: The day of the week (e.g. "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
- time: A specific time range (e.g. "09:00 AM - 11:00 AM" or "04:00 PM - 06:00 PM")
- subject: The course or subject name (e.g. "PHILOSOPHY LOGIC")
- topic: The specific topic to study (e.g. "Deductive Logic and Class Relations")
- activity: The specific learning activity (e.g. "Read study guide, solve 10 quiz questions, and write a summary")

User's study goals:
${textInput}

Return valid JSON as an object with key "sessions" which is an array of objects. Do not write any markdown or text explanations.`;

            const parts: any[] = [{ text: prompt }];
            if (fileDataPart) parts.push(fileDataPart);

            const result = await attemptApiCall(async () => {
                const response = await ai.models.generateContent({
                    model: geminiModel,
                    contents: [{ role: 'user', parts }],
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                sessions: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            day: { type: Type.STRING },
                                            time: { type: Type.STRING },
                                            subject: { type: Type.STRING },
                                            topic: { type: Type.STRING },
                                            activity: { type: Type.STRING }
                                        },
                                        required: ['day', 'time', 'subject', 'topic', 'activity']
                                    }
                                }
                            },
                            required: ['sessions']
                        }
                    }
                });

                const text = getResponseText(response);
                if (!text) throw new Error('AI returned an empty timetable.');
                return JSON.parse(text);
            });

            if (result.success && result.data && Array.isArray(result.data.sessions)) {
                const sessionsWithMeta = result.data.sessions.map((s: any, idx: number) => ({
                    id: `session_${Date.now()}_${idx}`,
                    ...s,
                    complete: false
                }));

                await set(dbRef(db, `users/${userProfile.uid}/timetable`), sessionsWithMeta);
                setTimetable(sessionsWithMeta);
                setTextInput('');
                setUploadedFile(null);
                setUploadedFileBase64('');
                addToast('Study timetable generated successfully!', 'success');
            } else {
                throw new Error(result.message || 'Generation failed');
            }
        } catch (err: any) {
            console.error('Failed to generate study schedule:', err);
            addToast('Timetable generation failed: ' + err.message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const toggleSessionComplete = async (sessionId: string) => {
        const updated = timetable.map(s => {
            if (s.id === sessionId) {
                const nextStatus = !s.complete;
                if (nextStatus) {
                    addToast('Great job! Keep up the studying!', 'success');
                }
                return { ...s, complete: nextStatus };
            }
            return s;
        });
        setTimetable(updated);
        try {
            await set(dbRef(db, `users/${userProfile.uid}/timetable`), updated);
        } catch (err) {
            console.error("Failed to update session complete status:", err);
        }
    };

    const handleDeleteTimetable = async () => {
        const confirmed = window.confirm("Are you sure you want to delete your current study timetable?");
        if (!confirmed) return;
        try {
            await set(dbRef(db, `users/${userProfile.uid}/timetable`), null);
            setTimetable([]);
            addToast('Study timetable deleted.', 'info');
        } catch (err) {
            console.error("Failed to delete timetable:", err);
        }
    };

    if (!isOpen) return null;

    const groupedSessions = DAYS_OF_WEEK.map(day => ({
        day,
        sessions: timetable.filter(s => s.day.toLowerCase() === day.toLowerCase())
    })).filter(group => group.sessions.length > 0);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            {/* Hidden Inputs */}
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".pdf,.doc,.docx,.txt" />
            <input type="file" ref={imageInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />

            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] animate-scale-in">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <i className="bi bi-calendar3 text-amber-500"></i>
                            <span>Study Timetable</span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Organize your syllabus and build an interactive AI-powered study schedule.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold transition cursor-pointer"
                    >
                        <i className="bi bi-x-lg text-sm"></i>
                    </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-6 min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {/* Left: AI Generator Panel */}
                    <div className="w-full lg:w-[350px] shrink-0 space-y-4">
                        <div className="bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2.5">Generate Study Timetable</h3>
                            
                            {/* Input Text Area with Attachment button inside */}
                            <div className="relative border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs focus-within:ring-2 focus-within:ring-amber-400 focus-within:border-amber-400 transition-all">
                                <textarea
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    placeholder="Describe your learning goals, target exam dates, or describe your schedule..."
                                    className="w-full min-h-[120px] bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 p-4 outline-none border-none resize-none focus:ring-0"
                                />

                                {/* Selected File Indicator */}
                                {uploadedFile && (
                                    <div className="mx-4 mb-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-800 dark:text-slate-200 font-medium animate-fade-in">
                                        <span className="truncate max-w-[200px] flex items-center gap-1.5">
                                            <i className="bi bi-file-earmark-text text-amber-500"></i>
                                            {uploadedFile.name}
                                        </span>
                                        <button onClick={() => { setUploadedFile(null); setUploadedFileBase64(''); }} className="text-rose-500 font-bold hover:text-rose-600 ml-2 cursor-pointer">
                                            <i className="bi bi-x-lg text-xs"></i>
                                        </button>
                                    </div>
                                )}

                                {/* Attachments button inside the textbox container */}
                                <div className="flex justify-between items-center p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 rounded-b-2xl">
                                    <div className="relative" ref={uploadMenuRef}>
                                        <button
                                            type="button"
                                            onClick={() => setShowUploadMenu(!showUploadMenu)}
                                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 shadow-2xs transition cursor-pointer"
                                            title="Attach Course File or Syllabus"
                                        >
                                            <i className="bi bi-paperclip text-base"></i>
                                        </button>

                                        {/* Upload Options Menu */}
                                        {showUploadMenu && (
                                            <div className="absolute left-0 bottom-11 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 z-50 animate-scale-in">
                                                <button
                                                    type="button"
                                                    onClick={() => { imageInputRef.current?.click(); }}
                                                    className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-amber-500 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-amber-500 dark:hover:text-slate-950 rounded-xl transition flex items-center gap-2 cursor-pointer"
                                                >
                                                    <i className="bi bi-image"></i>
                                                    <span>Upload Image</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { fileInputRef.current?.click(); }}
                                                    className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-amber-500 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-amber-500 dark:hover:text-slate-950 rounded-xl transition flex items-center gap-2 cursor-pointer"
                                                >
                                                    <i className="bi bi-file-earmark-pdf"></i>
                                                    <span>Upload Document</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleGenerateTimetable}
                                        disabled={isGenerating}
                                        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-xs disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer"
                                    >
                                        {isGenerating ? (
                                            <>
                                                <i className="bi bi-arrow-repeat animate-spin text-sm"></i>
                                                <span>Scheduling...</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-magic text-sm"></i>
                                                <span>Generate</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {timetable.length > 0 && (
                            <button
                                onClick={handleDeleteTimetable}
                                className="w-full border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 font-bold text-xs uppercase tracking-wider py-3.5 rounded-2xl transition shadow-2xs text-center cursor-pointer"
                            >
                                Clear Current Schedule
                            </button>
                        )}
                    </div>

                    {/* Right: Timetable Schedule Grid Viewer */}
                    <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 flex flex-col max-h-full">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Weekly Study Calendar</h3>
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-full shadow-2xs">
                                {timetable.length} Sessions scheduled
                            </span>
                        </div>

                        {isLoading ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                                <i className="bi bi-arrow-repeat animate-spin text-3xl text-amber-500 mb-3"></i>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest animate-pulse">Loading Weekly timetable...</p>
                            </div>
                        ) : timetable.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-2xl text-amber-500 mb-3 shadow-2xs">
                                    <i className="bi bi-calendar-x"></i>
                                </div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">No Study Timetable Found</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                                    Describe your target topics or upload a course syllabus outline inside the scheduler to create a neat weekly schedule.
                                </p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-5 pr-1 min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {groupedSessions.map(group => (
                                    <div key={group.day} className="space-y-2">
                                        <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">{group.day}</h4>
                                        <div className="grid gap-2.5">
                                            {group.sessions.map(session => (
                                                <div
                                                    key={session.id}
                                                    onClick={() => void toggleSessionComplete(session.id)}
                                                    className={`flex items-start justify-between p-4 bg-white dark:bg-slate-900 border rounded-2xl shadow-2xs transition cursor-pointer select-none ${
                                                        session.complete ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 opacity-70' : 'border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-400/50'
                                                    }`}
                                                >
                                                    <div className="min-w-0 flex-1 pr-3">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums flex items-center gap-1">
                                                                <i className="bi bi-clock text-[10px]"></i>
                                                                {session.time}
                                                            </span>
                                                            <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-2 py-0.5 rounded-lg">
                                                                {session.subject}
                                                            </span>
                                                        </div>
                                                        <h5 className={`font-bold text-xs text-slate-900 dark:text-white ${session.complete ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                                                            {session.topic}
                                                        </h5>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed mt-1">
                                                            {session.activity}
                                                        </p>
                                                    </div>

                                                    <div className="shrink-0 flex items-center justify-center mt-1">
                                                        <div className={`w-5 h-5 rounded-full border-2 transition flex items-center justify-center ${
                                                            session.complete ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-700'
                                                        }`}>
                                                            {session.complete && (
                                                                <i className="bi bi-check text-xs font-bold"></i>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
