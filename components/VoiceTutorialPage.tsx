import React, { useState, useEffect, useRef, useCallback } from 'react';
import { readCachedJson } from '../utils/cache';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import type { UserProfile, Course, Topic } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Volume2, VolumeX, Mic, MicOff, RotateCcw, ArrowLeft, Bookmark, CheckCircle2 } from 'lucide-react';

interface VoiceTutorialSessionData {
    course: Course;
    topic?: Topic | null;
    syllabusContext?: string;
}

interface BlackboardStep {
    stepNumber: number;
    title: string;
    boardContent: string;
    spokenExplanation: string;
    suggestions: [string, string, string];
}

interface VoiceTutorialPageProps {
    userProfile: UserProfile;
    onNavigate?: (tab: string) => void;
}

export const VoiceTutorialPage: React.FC<VoiceTutorialPageProps> = ({ userProfile, onNavigate }) => {
    const { appSettings } = useAppSettings();
    const { addToast } = useToast();

    // Session Data
    const [sessionData, setSessionData] = useState<VoiceTutorialSessionData | null>(null);
    const [currentStep, setCurrentStep] = useState<BlackboardStep | null>(null);
    const [stepHistory, setStepHistory] = useState<BlackboardStep[]>([]);
    const [isLoadingStep, setIsLoadingStep] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    // Audio & Mic States
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isMicListening, setIsMicListening] = useState(false);
    const [speechRate, setSpeechRate] = useState<number>(1.0);
    const [spokenTextBuffer, setSpokenTextBuffer] = useState('');

    const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const recognitionRef = useRef<any>(null);
    const stepCountRef = useRef(1);

    // Load Session from Cache on Mount
    useEffect(() => {
        const stored = readCachedJson<VoiceTutorialSessionData | null>('avelut_active_voice_tutorial', null);
        if (stored && stored.course) {
            setSessionData(stored);
        } else {
            // Default fallback course if accessed directly
            setSessionData({
                course: {
                    course_id: 'general_tutorial',
                    course_name: 'Academic Tutorial',
                    level: userProfile.level || 'University',
                    topics: []
                },
                topic: {
                    topic_id: 'core_principles',
                    topic_name: 'Core Principles & Overview',
                    topic_context: 'General academic tutoring'
                }
            });
        }
    }, [userProfile.level]);

    // Speech Synthesis helper
    const speakText = useCallback((text: string) => {
        if (!('speechSynthesis' in window) || isMuted) return;

        window.speechSynthesis.cancel();
        setIsSpeaking(false);

        if (!text) return;

        // Clean out raw LaTeX delimiters for phonetic speech
        const cleanSpoken = text
            .replace(/\$\$([\s\S]*?)\$\$/g, ' formula on the board ')
            .replace(/\$([^\$]+)\$/g, '$1')
            .replace(/[#*`_~]/g, '')
            .trim();

        const utterance = new SpeechSynthesisUtterance(cleanSpoken);
        utterance.rate = speechRate;
        utterance.pitch = 1.0;

        // Prefer natural English voices
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => (v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('David')))) || voices.find(v => v.lang.startsWith('en'));
        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            // After speaking finishes, automatically activate mic listening if available
            startMicListening();
        };
        utterance.onerror = () => setIsSpeaking(false);

        speechUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, [isMuted, speechRate]);

    // Stop Speech on unmount
    useEffect(() => {
        return () => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) {}
            }
        };
    }, []);

    // Generate Step from AI
    const fetchNextStep = useCallback(async (userReply?: string) => {
        if (!sessionData) return;

        setIsLoadingStep(true);
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setIsSaved(false);

        const aiClient = createAvelutAI(appSettings);
        if (!aiClient) {
            addToast('AI service is not configured.', 'error');
            setIsLoadingStep(false);
            return;
        }

        const courseName = sessionData.course.course_name;
        const topicName = sessionData.topic?.topic_name || 'Fundamental Concepts';
        const currentStepNum = stepCountRef.current;

        const systemPrompt = `You are AVELUT Voice Tutor, an expert, encouraging academic tutor.
Course: "${courseName}"
Topic: "${topicName}"
Current Step Number: ${currentStepNum}
Student Reply/Action: "${userReply || 'Begin lesson from Step 1'}"

CRITICAL RULES:
1. "boardContent": Write ONLY the minimal blackboard text in concise bullet points or LaTeX formulas ($$...$$). Keep it short (max 2-3 lines). NO long sentences or chat greetings on the blackboard.
2. "spokenExplanation": Write the friendly, conversational, step-by-step spoken explanation that will be read aloud to the student. End with an engaging question asking for their thought or checking understanding.
3. "suggestions": Exactly 3 short, realistic clickable student reply options (1: Direct answer / hypothesis, 2: Alternative answer / calculation, 3: "Can you explain this step again?").

Output valid JSON ONLY with this exact schema:
{
  "stepNumber": ${currentStepNum},
  "title": "Step ${currentStepNum}: [Short 2-4 word Title]",
  "boardContent": "[Minimal LaTeX equation $$...$$ or 1-2 bullet summary rules]",
  "spokenExplanation": "[Friendly spoken tutor explanation ending with a question]",
  "suggestions": ["Option 1", "Option 2", "Option 3"]
}`;

        try {
            const result = await aiClient.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    temperature: 0.7,
                }
            });

            const text = getResponseText(result);
            if (!text) throw new Error('Empty response from Voice Tutor.');

            const parsed: BlackboardStep = JSON.parse(text);
            
            // Instantly clear old board and display new step
            setCurrentStep(parsed);
            setStepHistory(prev => [...prev, parsed]);
            stepCountRef.current += 1;

            // Trigger voice explanation
            speakText(parsed.spokenExplanation);
        } catch (err: any) {
            console.error('Voice Tutor Error:', err);
            addToast('Failed to load next step. Please try again.', 'error');
        } finally {
            setIsLoadingStep(false);
        }
    }, [sessionData, appSettings, addToast, speakText]);

    // Initial step trigger
    useEffect(() => {
        if (sessionData && !currentStep && !isLoadingStep) {
            void fetchNextStep();
        }
    }, [sessionData, currentStep, isLoadingStep, fetchNextStep]);

    // Microphone Listener Setup
    const startMicListening = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
        }

        try {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                setIsMicListening(true);
                setSpokenTextBuffer('');
            };

            recognition.onresult = (event: any) => {
                const transcript = Array.from(event.results)
                    .map((result: any) => result[0].transcript)
                    .join('');
                setSpokenTextBuffer(transcript);
            };

            recognition.onend = () => {
                setIsMicListening(false);
                if (spokenTextBuffer.trim().length > 2) {
                    void fetchNextStep(spokenTextBuffer.trim());
                    setSpokenTextBuffer('');
                }
            };

            recognition.onerror = () => {
                setIsMicListening(false);
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch (e) {
            setIsMicListening(false);
        }
    }, [spokenTextBuffer, fetchNextStep]);

    const toggleMic = () => {
        if (isMicListening) {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) {}
            }
            setIsMicListening(false);
        } else {
            startMicListening();
        }
    };

    const toggleMute = () => {
        if (!isMuted) {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setIsSpeaking(false);
            setIsMuted(true);
        } else {
            setIsMuted(false);
            if (currentStep) {
                speakText(currentStep.spokenExplanation);
            }
        }
    };

    const handleSpeedChange = () => {
        const speeds = [1.0, 1.25, 1.5];
        const nextIdx = (speeds.indexOf(speechRate) + 1) % speeds.length;
        const newRate = speeds[nextIdx];
        setSpeechRate(newRate);
        addToast(`Voice speed set to ${newRate}x`, 'info');
    };

    const handleSaveFormula = () => {
        setIsSaved(true);
        addToast('Saved to your Formula Cheat-sheet!', 'success');
    };

    return (
        <div className="flex flex-col flex-1 h-full w-full bg-slate-950 text-slate-100 overflow-hidden select-none">
            {/* Top Dedicated Header */}
            <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md z-30">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onNavigate ? onNavigate('study_guide') : window.history.back()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold active:scale-95 cursor-pointer"
                        title="Back to Study Guide"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Back to Study Guide</span>
                    </button>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black tracking-widest uppercase text-emerald-400">Voice Tutorial</span>
                        <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-[180px] sm:max-w-md">
                            {sessionData?.course.course_name || 'Academic Course'}
                        </h2>
                    </div>
                </div>

                {/* Voice Status Chip */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-xs font-medium text-slate-300">
                        <span className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                        <span className="hidden sm:inline">{isSpeaking ? 'Tutor Speaking...' : 'Listening / Ready'}</span>
                    </div>

                    <button
                        onClick={handleSpeedChange}
                        className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-300 transition-colors"
                        title="Change voice speed"
                    >
                        {speechRate}x
                    </button>
                </div>
            </header>

            {/* Main Blackboard Canvas Area */}
            <main className="flex-1 flex flex-col justify-between p-4 sm:p-8 max-w-4xl w-full mx-auto overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {/* Topic context tag */}
                <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
                    <span className="font-semibold text-slate-300 truncate">
                        📖 {sessionData?.topic?.topic_name || 'Core Lesson'}
                    </span>
                    {currentStep && (
                        <span className="font-mono text-emerald-400 font-bold">
                            Step {currentStep.stepNumber}
                        </span>
                    )}
                </div>

                {/* Blackboard Card */}
                <div className="relative flex-1 flex flex-col justify-center blackboard-canvas border-2 border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden min-h-[220px] sm:min-h-[280px]">
                    {/* Bookmark to Formula sheet button */}
                    <button
                        onClick={handleSaveFormula}
                        className={`absolute top-4 right-4 p-2 rounded-xl border transition-all cursor-pointer ${
                            isSaved 
                                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' 
                                : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-amber-300 hover:border-slate-700'
                        }`}
                        title="Save active formula to cheat-sheet"
                    >
                        {isSaved ? <CheckCircle2 className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                    </button>

                    {isLoadingStep ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-12">
                            <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                            <p className="text-sm font-handwriting text-slate-400 tracking-wide">Wiping board and writing next step...</p>
                        </div>
                    ) : currentStep ? (
                        <div className="space-y-4 animate-fade-in">
                            <h3 className="text-lg sm:text-xl font-bold font-handwriting text-emerald-400 border-b border-slate-800 pb-2">
                                {currentStep.title}
                            </h3>
                            
                            <div className="font-handwriting text-2xl sm:text-3xl text-emerald-50 leading-relaxed tracking-wide">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkMath]}
                                    rehypePlugins={[rehypeKatex]}
                                    components={{
                                        p: ({node, ...props}) => <p className="my-2" {...props} />,
                                        ul: ({node, ...props}) => <ul className="space-y-2 my-3 list-disc list-inside" {...props} />,
                                        li: ({node, ...props}) => <li className="text-slate-200" {...props} />,
                                        code: ({node, inline, children, ...props}: any) => (
                                            <span className="font-mono text-emerald-300 text-xl">{children}</span>
                                        ),
                                    }}
                                >
                                    {currentStep.boardContent}
                                </ReactMarkdown>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Spoken Text Hint or Spoken Transcription */}
                <div className="my-4 min-h-[44px] flex items-center justify-center text-center px-4">
                    {isMicListening && spokenTextBuffer ? (
                        <p className="text-sm font-medium text-emerald-300 animate-pulse">
                            🎙️ "{spokenTextBuffer}..."
                        </p>
                    ) : currentStep && isSpeaking ? (
                        <p className="text-xs sm:text-sm text-slate-300 font-medium italic line-clamp-2">
                            🔊 "{currentStep.spokenExplanation}"
                        </p>
                    ) : (
                        <p className="text-xs text-slate-500 font-medium">
                            Tap a suggestion below or speak your response
                        </p>
                    )}
                </div>

                {/* 3 Clickable Suggestion Options */}
                {currentStep && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
                        {currentStep.suggestions.map((suggestion, index) => (
                            <button
                                key={index}
                                onClick={() => void fetchNextStep(suggestion)}
                                disabled={isLoadingStep}
                                className="px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 active:border-emerald-500 text-slate-200 hover:text-white rounded-2xl text-xs sm:text-sm font-medium text-left transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-2"
                            >
                                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400 shrink-0">
                                    {index + 1}
                                </span>
                                <span className="truncate">{suggestion}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Bottom Voice & Mic Controls Bar */}
                <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3 shadow-lg">
                    {/* Replay audio */}
                    <button
                        onClick={() => currentStep && speakText(currentStep.spokenExplanation)}
                        disabled={isLoadingStep}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        title="Replay explanation"
                    >
                        <RotateCcw className="w-4 h-4" />
                        <span className="hidden sm:inline">Replay</span>
                    </button>

                    {/* Main Mic Button */}
                    <button
                        onClick={toggleMic}
                        disabled={isLoadingStep}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md active:scale-95 ${
                            isMicListening
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        }`}
                    >
                        {isMicListening ? <Mic className="w-4 h-4 text-white" /> : <MicOff className="w-4 h-4 text-slate-400" />}
                        <span>{isMicListening ? 'Mic Active (Listening)' : 'Tap to Speak'}</span>
                    </button>

                    {/* Mute toggle */}
                    <button
                        onClick={toggleMute}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        title={isMuted ? 'Unmute tutor' : 'Mute tutor'}
                    >
                        {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                        <span className="hidden sm:inline">{isMuted ? 'Unmuted' : 'Mute'}</span>
                    </button>
                </div>
            </main>
        </div>
    );
};
