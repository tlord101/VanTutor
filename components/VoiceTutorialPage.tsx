import React, { useState, useEffect, useRef, useCallback } from 'react';
import { readCachedJson } from '../utils/cache';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { GoogleGenAI } from '@google/genai';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import type { UserProfile, Course, Topic } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Available natural Gemini TTS voices
const GEMINI_TTS_VOICES = ['Charon', 'Puck', 'Kore', 'Fenrir', 'Aoede', 'Orbit', 'Zephyr', 'Leda'];
const DEFAULT_VOICE = 'Charon'; // Deep, natural tutor voice

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
    userProfile?: UserProfile | null;
    appSettings?: any;
    onNavigate?: (tab: string) => void;
}

export const VoiceTutorialPage: React.FC<VoiceTutorialPageProps> = ({ userProfile, appSettings: propAppSettings, onNavigate }) => {
    const { settings: hookAppSettings } = useAppSettings();
    const appSettings = propAppSettings || hookAppSettings;
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
    const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE);
    const [isTtsLoading, setIsTtsLoading] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const recognitionRef = useRef<any>(null);
    const spokenTextRef = useRef(''); // tracks live transcript to avoid stale closure in onend
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
                    level: userProfile?.level || 'University',
                    topics: []
                },
                topic: {
                    topic_id: 'core_principles',
                    topic_name: 'Core Principles & Overview',
                    topic_context: 'General academic tutoring'
                }
            });
        }
    }, [userProfile?.level]);

    // ─── Gemini TTS Audio Engine ─────────────────────────────────────────────

    const getAudioContext = useCallback((): AudioContext => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return audioContextRef.current;
    }, []);

    const stopAudio = useCallback(() => {
        if (currentAudioSourceRef.current) {
            try { currentAudioSourceRef.current.stop(); } catch (e) {}
            currentAudioSourceRef.current = null;
        }
        setIsSpeaking(false);
    }, []);

    // Stop audio on unmount
    useEffect(() => {
        return () => {
            stopAudio();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) {}
            }
        };
    }, [stopAudio]);

    /**
     * Converts raw 16-bit PCM (24kHz, mono) base64 data to a Web Audio AudioBuffer.
     * Gemini TTS outputs 24kHz mono PCM16.
     */
    const pcmBase64ToAudioBuffer = useCallback(async (base64: string, ctx: AudioContext): Promise<AudioBuffer> => {
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const samples = bytes.length / 2;
        const buffer = ctx.createBuffer(1, samples, 24000);
        const channelData = buffer.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < samples; i++) {
            channelData[i] = view.getInt16(i * 2, true) / 32768.0;
        }
        return buffer;
    }, []);

    /**
     * Browser SpeechSynthesis fallback when Gemini TTS is unavailable.
     */
    const browserFallbackSpeak = useCallback((text: string, onEndCallback?: () => void) => {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google'))) || voices.find(v => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => { setIsSpeaking(false); if (onEndCallback) onEndCallback(); };
        utterance.onerror = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
    }, [speechRate]);

    /**
     * Calls Gemini TTS API and plays audio via Web Audio API.
     * Falls back to browser TTS on error or missing API key.
     */
    const speakText = useCallback(async (text: string, onEndCallback?: () => void) => {
        if (isMuted || !text) return;
        stopAudio();
        setIsTtsLoading(true);

        const cleanText = text
            .replace(/\$\$([\s\S]*?)\$\$/g, ' formula on the board ')
            .replace(/\$([^\$]+)\$/g, '$1')
            .replace(/[#*`_~]/g, '')
            .trim();

        // Resolve API key the same way as the rest of the app
        const usePersonalToken = !!(userProfile?.use_personal_token && userProfile?.personal_api_key?.trim());
        const apiKey = usePersonalToken
            ? userProfile!.personal_api_key!.trim()
            : (appSettings?.gemini_api_key?.trim() || '');

        if (!apiKey) {
            setIsTtsLoading(false);
            browserFallbackSpeak(cleanText, onEndCallback);
            return;
        }

        try {
            const ttsClient = new GoogleGenAI({ apiKey });
            const response = await ttsClient.models.generateContent({
                model: 'gemini-2.5-flash-preview-tts',
                contents: [{ role: 'user', parts: [{ text: cleanText }] }],
                config: {
                    responseModalities: ['AUDIO'] as any,
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: selectedVoice }
                        }
                    }
                }
            });

            const inlineData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (!inlineData?.data) throw new Error('No audio data in Gemini TTS response');

            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();

            const audioBuffer = await pcmBase64ToAudioBuffer(inlineData.data, ctx);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = speechRate;
            source.connect(ctx.destination);
            source.onended = () => {
                setIsSpeaking(false);
                currentAudioSourceRef.current = null;
                if (onEndCallback) onEndCallback();
            };
            currentAudioSourceRef.current = source;
            setIsTtsLoading(false);
            setIsSpeaking(true);
            source.start(0);
        } catch (err: any) {
            console.warn('Gemini TTS failed, falling back to browser TTS:', err);
            setIsTtsLoading(false);
            browserFallbackSpeak(cleanText, onEndCallback);
        }
    }, [isMuted, speechRate, selectedVoice, userProfile, appSettings, stopAudio, getAudioContext, pcmBase64ToAudioBuffer, browserFallbackSpeak]);

    // ─── AI Step Generation ───────────────────────────────────────────────────

    const fetchNextStep = useCallback(async (userReply?: string) => {
        if (!sessionData) return;

        setIsLoadingStep(true);
        stopAudio();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setIsSaved(false);

        const aiClient = createAvelutAI(appSettings, userProfile || null);
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
                model: appSettings?.primary_gemini_model || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    temperature: 0.7,
                }
            });

            const text = getResponseText(result);
            if (!text) throw new Error('Empty response from Voice Tutor.');

            const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed: BlackboardStep = JSON.parse(cleanJson);

            setCurrentStep(parsed);
            setStepHistory(prev => [...prev, parsed]);
            stepCountRef.current += 1;

            // Speak with Gemini TTS; auto-start mic after it finishes
            await speakText(parsed.spokenExplanation, () => startMicListening());
        } catch (err: any) {
            console.error('Voice Tutor Error:', err);
            addToast('Failed to load next step. Please try again.', 'error');
        } finally {
            setIsLoadingStep(false);
        }
    }, [sessionData, appSettings, userProfile, addToast, speakText, stopAudio]);

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
                spokenTextRef.current = '';
            };

            recognition.onresult = (event: any) => {
                const transcript = Array.from(event.results)
                    .map((result: any) => result[0].transcript)
                    .join('');
                setSpokenTextBuffer(transcript);
                spokenTextRef.current = transcript; // keep ref in sync with live transcript
            };

            recognition.onend = () => {
                setIsMicListening(false);
                const finalText = spokenTextRef.current;
                spokenTextRef.current = '';
                setSpokenTextBuffer('');
                if (finalText.trim().length > 2) {
                    void fetchNextStep(finalText.trim());
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
    }, [fetchNextStep]);

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
            stopAudio();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setIsMuted(true);
        } else {
            setIsMuted(false);
            if (currentStep) void speakText(currentStep.spokenExplanation);
        }
    };

    const handleSpeedChange = () => {
        const speeds = [1.0, 1.25, 1.5];
        const nextIdx = (speeds.indexOf(speechRate) + 1) % speeds.length;
        setSpeechRate(speeds[nextIdx]);
        addToast(`Voice speed set to ${speeds[nextIdx]}x`, 'info');
    };

    const handleVoiceChange = () => {
        const nextIdx = (GEMINI_TTS_VOICES.indexOf(selectedVoice) + 1) % GEMINI_TTS_VOICES.length;
        setSelectedVoice(GEMINI_TTS_VOICES[nextIdx]);
        addToast(`Voice: ${GEMINI_TTS_VOICES[nextIdx]}`, 'info');
    };

    const handleSaveFormula = () => {
        setIsSaved(true);
        addToast('Saved to your Formula Cheat-sheet!', 'success');
    };

    return (
        <div className="flex flex-col flex-1 h-full w-full bg-[#FAF7F2] text-[#2C241D] overflow-hidden select-none">
            {/* Top Dedicated Milk Header */}
            <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[#E5DACD] bg-[#F4ECE2]/95 backdrop-blur-md z-30 shadow-xs">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onNavigate ? onNavigate('study_guide') : window.history.back()}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-[#4A3E31] hover:text-[#2C241D] transition-all text-xs font-bold active:scale-95 cursor-pointer shadow-xs"
                        title="Back to Study Guide"
                    >
                        <i className="bi bi-arrow-left text-sm"></i>
                        <span className="hidden sm:inline">Back to Study Guide</span>
                    </button>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black tracking-widest uppercase text-[#8B5A2B]">Voice Tutorial</span>
                        <h2 className="text-sm sm:text-base font-bold text-[#2C241D] truncate max-w-[180px] sm:max-w-md">
                            {sessionData?.course.course_name || 'Academic Course'}
                        </h2>
                    </div>
                </div>

                {/* Voice Status & Controls */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FFFDFB] border border-[#D9CCBC] rounded-full text-xs font-semibold text-[#4A3E31] shadow-xs">
                        {isTtsLoading
                            ? <span className="w-2 h-2 rounded-full bg-[#D4A373] animate-pulse" />
                            : <span className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-[#8B5A2B] animate-pulse' : 'bg-[#C2B2A3]'}`} />
                        }
                        <span className="hidden sm:inline">
                            {isTtsLoading ? 'Generating voice...' : isSpeaking ? 'Tutor Speaking...' : 'Ready'}
                        </span>
                    </div>

                    <button
                        onClick={handleVoiceChange}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-xs font-bold text-[#4A3E31] transition-colors cursor-pointer shadow-xs"
                        title="Switch Gemini AI voice"
                    >
                        <i className="bi bi-person-voice text-xs"></i>
                        <span className="hidden sm:inline">{selectedVoice}</span>
                    </button>

                    <button
                        onClick={handleSpeedChange}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-xs font-mono font-bold text-[#4A3E31] transition-colors cursor-pointer shadow-xs"
                        title="Change voice speed"
                    >
                        <i className="bi bi-speedometer2 text-xs"></i>
                        <span>{speechRate}x</span>
                    </button>
                </div>
            </header>

            {/* Main Milk Blackboard Canvas Area */}
            <main className="flex-1 flex flex-col justify-between p-4 sm:p-8 max-w-4xl w-full mx-auto overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {/* Topic context tag */}
                <div className="flex items-center justify-between mb-3 text-xs text-[#6B5E51]">
                    <span className="font-semibold text-[#3D3328] truncate flex items-center gap-1.5">
                        <i className="bi bi-journal-bookmark text-sm text-[#8B5A2B]"></i>
                        <span>{sessionData?.topic?.topic_name || 'Core Lesson'}</span>
                    </span>
                    {currentStep && (
                        <span className="font-mono text-[#8B5A2B] font-bold px-2 py-0.5 rounded-lg bg-[#EFE5D8] border border-[#DFD1C0]">
                            Step {currentStep.stepNumber}
                        </span>
                    )}
                </div>

                {/* Milk Blackboard Card */}
                <div className="relative flex-1 flex flex-col justify-center milk-canvas border-2 border-[#E5D7C5] rounded-3xl p-6 sm:p-10 shadow-md overflow-hidden min-h-[220px] sm:min-h-[280px]">
                    {/* Bookmark to Formula sheet button */}
                    <button
                        onClick={handleSaveFormula}
                        className={`absolute top-4 right-4 p-2.5 rounded-xl border transition-all cursor-pointer shadow-xs ${
                            isSaved 
                                ? 'border-[#D4A373] bg-[#FAF0E6] text-[#A0522D]' 
                                : 'border-[#E0D2C0] bg-[#FFFDFB] text-[#7A6B5C] hover:text-[#8B5A2B] hover:border-[#D0C0AC]'
                        }`}
                        title="Save active formula to cheat-sheet"
                    >
                        {isSaved ? <i className="bi bi-bookmark-check-fill text-base"></i> : <i className="bi bi-bookmark text-base"></i>}
                    </button>

                    {isLoadingStep ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-12">
                            <div className="w-8 h-8 border-2 border-[#C2B2A3] border-t-[#8B5A2B] rounded-full animate-spin" />
                            <p className="text-base font-handwriting text-[#7A6B5C] tracking-wide">Wiping board and writing next step...</p>
                        </div>
                    ) : currentStep ? (
                        <div className="space-y-4 animate-fade-in">
                            <h3 className="text-xl sm:text-2xl font-bold font-handwriting text-[#8B4513] border-b border-[#E8DCCF] pb-2">
                                {currentStep.title}
                            </h3>
                            
                            <div className="font-handwriting text-2xl sm:text-3xl text-[#221B14] leading-relaxed tracking-wide">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkMath]}
                                    rehypePlugins={[rehypeKatex]}
                                    components={{
                                        p: ({node, ...props}) => <p className="my-2" {...props} />,
                                        ul: ({node, ...props}) => <ul className="space-y-2 my-3 list-disc list-inside text-[#2A221A]" {...props} />,
                                        li: ({node, ...props}) => <li className="text-[#2A221A]" {...props} />,
                                        code: ({node, inline, children, ...props}: any) => (
                                            <span className="font-mono text-[#8B4513] bg-[#F4EDE4] px-1.5 py-0.5 rounded text-xl border border-[#E5DACD]">{children}</span>
                                        ),
                                    }}
                                >
                                    {currentStep.boardContent}
                                </ReactMarkdown>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Spoken Text Hint or Transcription */}
                <div className="my-4 min-h-[44px] flex items-center justify-center text-center px-4">
                    {isMicListening && spokenTextBuffer ? (
                        <p className="text-sm font-medium text-[#8B5A2B] animate-pulse flex items-center gap-2">
                            <i className="bi bi-mic-fill"></i>
                            <span>"{spokenTextBuffer}..."</span>
                        </p>
                    ) : isTtsLoading ? (
                        <p className="text-xs text-[#7A6B5C] font-medium flex items-center gap-2">
                            <i className="bi bi-stars text-sm text-[#8B5A2B] animate-pulse"></i>
                            Generating natural voice with Gemini AI...
                        </p>
                    ) : currentStep && isSpeaking ? (
                        <p className="text-xs sm:text-sm text-[#4A3E31] font-medium italic line-clamp-2 flex items-center gap-2">
                            <i className="bi bi-volume-up text-sm text-[#8B5A2B]"></i>
                            <span>"{currentStep.spokenExplanation}"</span>
                        </p>
                    ) : (
                        <p className="text-xs text-[#7A6B5C] font-medium">
                            Tap a suggestion below or speak your response
                        </p>
                    )}
                </div>

                {/* 3 Clickable Milk Suggestion Options */}
                {currentStep && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
                        {currentStep.suggestions.map((suggestion, index) => (
                            <button
                                key={index}
                                onClick={() => void fetchNextStep(suggestion)}
                                disabled={isLoadingStep || isTtsLoading}
                                className="px-4 py-3 bg-[#FFFDFB] hover:bg-[#F5EDE3] border-2 border-[#E5DACD] hover:border-[#D5C3AE] active:border-[#8B5A2B] text-[#2C241D] rounded-2xl text-xs sm:text-sm font-semibold text-left transition-all active:scale-[0.98] shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-2.5"
                            >
                                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-[#EFE5D8] border border-[#DFD1C0] text-[10px] font-bold text-[#8B5A2B] shrink-0">
                                    {index + 1}
                                </span>
                                <span className="truncate">{suggestion}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Bottom Voice & Mic Controls Bar */}
                <div className="flex items-center justify-between bg-[#F4ECE2] border border-[#E5DACD] rounded-2xl px-5 py-3 shadow-sm">
                    {/* Replay */}
                    <button
                        onClick={() => currentStep && void speakText(currentStep.spokenExplanation)}
                        disabled={isLoadingStep || isTtsLoading}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#5A4D3E] hover:text-[#2C241D] transition-colors cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-[#EBE0D2] disabled:opacity-50"
                        title="Replay explanation"
                    >
                        <i className="bi bi-arrow-counterclockwise text-sm"></i>
                        <span className="hidden sm:inline">Replay</span>
                    </button>

                    {/* Main Mic Button */}
                    <button
                        onClick={toggleMic}
                        disabled={isLoadingStep || isTtsLoading || isSpeaking}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 ${
                            isMicListening
                                ? 'bg-[#8B5A2B] text-white animate-pulse shadow-md'
                                : 'bg-[#FFFDFB] hover:bg-[#EDE1D1] text-[#3D3328] border-2 border-[#D9CCBC]'
                        }`}
                    >
                        {isMicListening ? <i className="bi bi-mic-fill text-sm"></i> : <i className="bi bi-mic text-sm"></i>}
                        <span>{isMicListening ? 'Listening...' : 'Tap to Speak'}</span>
                    </button>

                    {/* Mute */}
                    <button
                        onClick={toggleMute}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#5A4D3E] hover:text-[#2C241D] transition-colors cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-[#EBE0D2]"
                        title={isMuted ? 'Unmute tutor' : 'Mute tutor'}
                    >
                        {isMuted ? <i className="bi bi-volume-mute-fill text-sm text-red-600"></i> : <i className="bi bi-volume-up text-sm"></i>}
                        <span className="hidden sm:inline">{isMuted ? 'Unmute' : 'Mute'}</span>
                    </button>
                </div>
            </main>
        </div>
    );
};

export default VoiceTutorialPage;
