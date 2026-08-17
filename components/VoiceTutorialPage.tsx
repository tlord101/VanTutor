import React, { useState, useEffect, useRef, useCallback } from 'react';
import { readCachedJson, writeCachedJson, readCachedJsonAsync } from '../utils/cache';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { GoogleGenAI } from '@google/genai';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import type { UserProfile, Course, Topic } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// ─── Constants ─────────────────────────────────────────────────────────────
const TUTOR_VOICE = 'Charon';
const MAX_BOARD_LINES = 5;
const LINE_STREAM_MS = 360; // ms between each board line appearing

// ─── Types ─────────────────────────────────────────────────────────────────
type TeachingPhase = 'introduction' | 'key_terms' | 'example' | 'practice';

interface VoiceTutorialSessionData {
    course: Course;
    topic?: Topic | null;
    syllabusContext?: string;
}

interface FormulaVariable {
    symbol: string;
    meaning: string;
}

interface ConceptUnit {
    phase: TeachingPhase;
    concept: string;
    boardLines: string[];                // max 5 lines for the board
    variables?: FormulaVariable[];       // formula variable breakdowns
    spokenExplanation: string;
    suggestions: [string, string, string];
}

interface TutorialProgress {
    sessionData: VoiceTutorialSessionData;
    conceptHistory: ConceptUnit[];
    conceptIndex: number;
    phase: TeachingPhase;
}

interface VoiceTutorialPageProps {
    userProfile?: UserProfile | null;
    appSettings?: any;
    onNavigate?: (tab: string) => void;
}

// ─── Phase cycle helper ─────────────────────────────────────────────────────
/**
 * Determines the next teaching phase.
 * Cycle: introduction → key_terms → example → key_terms → example → ... (every 3 concepts → practice)
 */
function getNextPhase(current: TeachingPhase, conceptIndex: number): TeachingPhase {
    if (current === 'introduction') return 'key_terms';
    if (current === 'key_terms') return 'example';
    if (current === 'example') {
        // Every 3rd example → insert a practice check-in
        return conceptIndex > 0 && conceptIndex % 3 === 0 ? 'practice' : 'key_terms';
    }
    if (current === 'practice') return 'key_terms';
    return 'key_terms';
}

// ─── Component ──────────────────────────────────────────────────────────────
export const VoiceTutorialPage: React.FC<VoiceTutorialPageProps> = ({
    userProfile,
    appSettings: propAppSettings,
    onNavigate,
}) => {
    const { settings: hookAppSettings } = useAppSettings();
    const appSettings = propAppSettings || hookAppSettings;
    const { addToast } = useToast();

    // ── Session & Teaching State ──────────────────────────────────────────
    const [sessionData, setSessionData] = useState<VoiceTutorialSessionData | null>(null);
    const [currentUnit, setCurrentUnit] = useState<ConceptUnit | null>(null);
    const [conceptHistory, setConceptHistory] = useState<ConceptUnit[]>([]);
    const [phase, setPhase] = useState<TeachingPhase>('introduction');
    const [isLoading, setIsLoading] = useState(false);
    const [isNavigatingBack, setIsNavigatingBack] = useState(false);

    // ── Board Streaming State ─────────────────────────────────────────────
    const [visibleBoardLines, setVisibleBoardLines] = useState<string[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);

    // ── Audio & Mic State ─────────────────────────────────────────────────
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isTtsLoading, setIsTtsLoading] = useState(false);
    const [isMicListening, setIsMicListening] = useState(false);
    const [spokenTextBuffer, setSpokenTextBuffer] = useState('');
    const [speechRate, setSpeechRate] = useState(1.0);

    // ── Refs ──────────────────────────────────────────────────────────────
    const audioContextRef = useRef<AudioContext | null>(null);
    const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const recognitionRef = useRef<any>(null);
    const spokenTextRef = useRef('');
    const conceptIndexRef = useRef(0);
    const phaseRef = useRef<TeachingPhase>('introduction');
    const streamTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const sessionKeyRef = useRef('');

    // ─── Compute progress cache key ──────────────────────────────────────
    useEffect(() => {
        const uid = userProfile?.uid || 'anon';
        const cid = sessionData?.course?.course_id || 'general';
        const tid = sessionData?.topic?.topic_id || 'core';
        sessionKeyRef.current = `vt_progress_${uid}_${cid}_${tid}`;
    }, [userProfile, sessionData]);

    // ─── Save progress ────────────────────────────────────────────────────
    const saveProgress = useCallback((history: ConceptUnit[], idx: number, p: TeachingPhase) => {
        if (!sessionData || !sessionKeyRef.current) return;
        const progress: TutorialProgress = {
            sessionData,
            conceptHistory: history,
            conceptIndex: idx,
            phase: p,
        };
        writeCachedJson(sessionKeyRef.current, progress, userProfile?.uid || 'anon');
        // Also keep the session data key updated
        writeCachedJson('avelut_active_voice_tutorial', sessionData, userProfile?.uid || 'anon');
    }, [sessionData, userProfile]);

    // ─── Load session on mount ────────────────────────────────────────────
    useEffect(() => {
        const stored = readCachedJson<VoiceTutorialSessionData | null>('avelut_active_voice_tutorial', null);
        if (stored?.course) {
            setSessionData(stored);
        } else {
            const fallback: VoiceTutorialSessionData = {
                course: {
                    course_id: 'general_tutorial',
                    course_name: 'Academic Tutorial',
                    level: userProfile?.level || 'University',
                    topics: [],
                },
                topic: {
                    topic_id: 'core_principles',
                    topic_name: 'Core Principles & Overview',
                    topic_context: 'General academic tutoring',
                },
            };
            setSessionData(fallback);
        }
    }, [userProfile?.level]);

    // ─── Load saved progress after sessionData is set ────────────────────
    useEffect(() => {
        if (!sessionData) return;
        const uid = userProfile?.uid || 'anon';
        const cid = sessionData.course?.course_id || 'general';
        const tid = sessionData.topic?.topic_id || 'core';
        const key = `vt_progress_${uid}_${cid}_${tid}`;
        sessionKeyRef.current = key;

        const saved = readCachedJson<TutorialProgress | null>(key, null);
        if (saved?.conceptHistory?.length) {
            setConceptHistory(saved.conceptHistory);
            conceptIndexRef.current = saved.conceptIndex || 0;
            phaseRef.current = saved.phase || 'introduction';
            setPhase(saved.phase || 'introduction');
            // Resume from last unit
            const last = saved.conceptHistory[saved.conceptHistory.length - 1];
            if (last) {
                setCurrentUnit(last);
                streamBoardLines(buildAllBoardLines(last));
            }
        }
        // If no saved progress, initial fetch will be triggered by the effect below
    }, [sessionData]);

    // ─── Unmount: stop everything ─────────────────────────────────────────
    useEffect(() => {
        return () => {
            stopAudio();
            clearStreamTimers();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (_) {}
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Board line builder ───────────────────────────────────────────────
    /**
     * Builds the full ordered list of board lines for a ConceptUnit.
     * Formula variables get listed as "symbol  →  meaning" lines.
     */
    const buildAllBoardLines = (unit: ConceptUnit): string[] => {
        const lines: string[] = [...(unit.boardLines || [])];
        if (unit.variables?.length) {
            // Inject variable lines right after any formula line
            unit.variables.forEach(v => {
                lines.push(`  ${v.symbol}  →  ${v.meaning}`);
            });
        }
        return lines;
    };

    // ─── Board streaming ──────────────────────────────────────────────────
    const clearStreamTimers = useCallback(() => {
        streamTimersRef.current.forEach(t => clearTimeout(t));
        streamTimersRef.current = [];
    }, []);

    const streamBoardLines = useCallback((lines: string[]) => {
        clearStreamTimers();
        setVisibleBoardLines([]);
        setIsStreaming(true);

        let displayed: string[] = [];
        let lineIdx = 0;

        const showNext = () => {
            if (lineIdx >= lines.length) {
                setIsStreaming(false);
                return;
            }
            if (displayed.length >= MAX_BOARD_LINES) {
                // Board is full → wipe and continue
                displayed = [];
                setVisibleBoardLines([]);
            }
            displayed.push(lines[lineIdx]);
            setVisibleBoardLines([...displayed]);
            lineIdx++;
            const t = setTimeout(showNext, LINE_STREAM_MS);
            streamTimersRef.current.push(t);
        };

        showNext();
    }, [clearStreamTimers]);

    // ─── Web Audio helpers ────────────────────────────────────────────────
    const getAudioContext = useCallback((): AudioContext => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return audioContextRef.current;
    }, []);

    const stopAudio = useCallback(() => {
        if (currentAudioSourceRef.current) {
            try { currentAudioSourceRef.current.stop(); } catch (_) {}
            currentAudioSourceRef.current = null;
        }
        setIsSpeaking(false);
    }, []);

    const pcmBase64ToAudioBuffer = useCallback(async (base64: string, ctx: AudioContext): Promise<AudioBuffer> => {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const samples = bytes.length / 2;
        const buf = ctx.createBuffer(1, samples, 24000);
        const ch = buf.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < samples; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
        return buf;
    }, []);

    const browserFallbackSpeak = useCallback((text: string, onEnd?: () => void) => {
        if (!('speechSynthesis' in window)) { onEnd?.(); return; }
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = speechRate;
        const voices = window.speechSynthesis.getVoices();
        const v = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
        if (v) utt.voice = v;
        utt.onstart = () => setIsSpeaking(true);
        utt.onend = () => { setIsSpeaking(false); onEnd?.(); };
        utt.onerror = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utt);
    }, [speechRate]);

    /**
     * Calls Gemini TTS (Charon voice) and plays via Web Audio API.
     */
    const speakText = useCallback(async (text: string, onEnd?: () => void) => {
        if (isMuted || !text) { onEnd?.(); return; }
        stopAudio();
        setIsTtsLoading(true);

        const clean = text
            .replace(/\$\$([\s\S]*?)\$\$/g, ' [formula on the board] ')
            .replace(/\$([^\$]+)\$/g, '$1')
            .replace(/[#*`_~]/g, '')
            .trim();

        const usePersonal = !!(userProfile?.use_personal_token && userProfile?.personal_api_key?.trim());
        const apiKey = usePersonal
            ? userProfile!.personal_api_key!.trim()
            : (appSettings?.gemini_api_key?.trim() || '');

        if (!apiKey) {
            setIsTtsLoading(false);
            browserFallbackSpeak(clean, onEnd);
            return;
        }

        try {
            const ttsClient = new GoogleGenAI({ apiKey });
            const response = await ttsClient.models.generateContent({
                model: 'gemini-2.5-flash-preview-tts',
                contents: [{ role: 'user', parts: [{ text: clean }] }],
                config: {
                    responseModalities: ['AUDIO'] as any,
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: TUTOR_VOICE } }
                    }
                }
            });

            const inlineData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (!inlineData?.data) throw new Error('No audio data');

            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();

            const audioBuf = await pcmBase64ToAudioBuffer(inlineData.data, ctx);
            const src = ctx.createBufferSource();
            src.buffer = audioBuf;
            src.playbackRate.value = speechRate;
            src.connect(ctx.destination);
            src.onended = () => {
                setIsSpeaking(false);
                currentAudioSourceRef.current = null;
                onEnd?.();
            };
            currentAudioSourceRef.current = src;
            setIsTtsLoading(false);
            setIsSpeaking(true);
            src.start(0);
        } catch (err) {
            console.warn('[TTS] Gemini TTS error, falling back:', err);
            setIsTtsLoading(false);
            browserFallbackSpeak(clean, onEnd);
        }
    }, [isMuted, speechRate, userProfile, appSettings, stopAudio, getAudioContext, pcmBase64ToAudioBuffer, browserFallbackSpeak]);

    // ─── Fetch next concept from AI ───────────────────────────────────────
    const fetchNextConcept = useCallback(async (studentReply?: string) => {
        if (!sessionData) return;

        setIsLoading(true);
        stopAudio();
        clearStreamTimers();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();

        const aiClient = createAvelutAI(appSettings, userProfile || null);
        if (!aiClient) {
            addToast('AI service is not configured.', 'error');
            setIsLoading(false);
            return;
        }

        const courseName = sessionData.course.course_name;
        const topicName = sessionData.topic?.topic_name || 'Fundamental Concepts';
        const currentPhase = phaseRef.current;
        const idx = conceptIndexRef.current;
        const history = conceptHistory.map(u => `[${u.phase}] ${u.concept}`).join(' → ');
        const nextPhase = getNextPhase(currentPhase, idx);

        const phaseInstructions: Record<TeachingPhase, string> = {
            introduction: `Introduce yourself as the AVELUT tutor and introduce the topic "${topicName}" in a warm, engaging way. Mention what the student will learn today. Keep boardLines to 2-3 key points about what the topic covers.`,
            key_terms: `Teach ONE specific key term, concept, or idea from "${topicName}". 
- If it involves a formula: list ONLY the formula on boardLines[0], then list each variable as "Symbol: meaning" on subsequent lines. Do NOT explain the formula in boardLines — save that for spokenExplanation.
- If it is a concept (no formula): write 2-4 bullet points of the key idea in plain English on boardLines.
- In spokenExplanation: explain clearly what this concept means, why it matters, and give a real-world analogy if possible. End with a question to check understanding.`,
            example: `Work through a concrete example question related to the last concept taught: "${conceptHistory.length > 0 ? conceptHistory[conceptHistory.length - 1].concept : topicName}".
- boardLines: write the example problem statement on line 1, then the working/solution steps on subsequent lines (max 5 lines).
- spokenExplanation: walk through the solution step by step, explaining your reasoning at each step. End by asking if they followed.`,
            practice: `Give the student ONE practice question to attempt on their own, related to what was just taught.
- boardLines: write only the problem/question statement (1-2 lines max).
- spokenExplanation: introduce the question, give a helpful hint without giving the answer, and encourage them to try. Tell them to speak their answer or choose a suggestion.`,
        };

        const systemPrompt = `You are AVELUT Tutor — a warm, expert, real classroom teacher.

COURSE: "${courseName}"
TOPIC: "${topicName}"
CURRENT TEACHING PHASE: ${nextPhase}
CONCEPTS COVERED SO FAR: ${history || 'None yet (this is the beginning)'}
STUDENT REPLY: "${studentReply || 'Begin the lesson'}"

YOUR TASK FOR THIS PHASE:
${phaseInstructions[nextPhase]}

STRICT RULES:
1. boardLines: array of strings. Max 5 lines. Short and punchy like a real blackboard. You MAY use LaTeX ($$...$$  for block formulas, $...$ for inline math within a line). For plain concept lines, write clear plain English.
2. variables: ONLY include if there is a formula being taught. List each variable's symbol and plain-English meaning.
3. spokenExplanation: Conversational, warm, spoken English only. NO LaTeX symbols. 2–4 sentences max. Always end with a question.
4. suggestions: Exactly 3 realistic student responses. Last suggestion should always be "Can you explain that again?"
5. concept: a short 2-5 word name for what you are teaching this turn.
6. Do NOT re-teach concepts already listed in CONCEPTS COVERED SO FAR.

OUTPUT VALID JSON ONLY — NO explanation, NO markdown fences:
{
  "phase": "${nextPhase}",
  "concept": "[2-5 word concept name]",
  "boardLines": ["line 1", "line 2", "..."],
  "variables": [{"symbol": "x", "meaning": "plain meaning"}],
  "spokenExplanation": "[Friendly spoken explanation ending with a question]",
  "suggestions": ["Option A", "Option B", "Can you explain that again?"]
}`;

        try {
            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
                config: { responseMimeType: 'application/json', temperature: 0.65 }
            });

            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty AI response');

            const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
            const unit: ConceptUnit = JSON.parse(cleanJson);

            // Update phase tracking
            phaseRef.current = unit.phase;
            setPhase(unit.phase);
            conceptIndexRef.current = idx + 1;

            // Update state
            const newHistory = [...conceptHistory, unit];
            setCurrentUnit(unit);
            setConceptHistory(newHistory);

            // Stream board lines
            streamBoardLines(buildAllBoardLines(unit));

            // Save progress
            saveProgress(newHistory, conceptIndexRef.current, unit.phase);

            // Speak with Charon, then auto-activate mic
            await speakText(unit.spokenExplanation, () => startMicListening());
        } catch (err: any) {
            console.error('[VoiceTutor] Error:', err);
            addToast('Failed to get next lesson. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionData, appSettings, userProfile, conceptHistory, addToast, speakText, stopAudio, clearStreamTimers, streamBoardLines, saveProgress]);

    // ─── Initial fetch when session is loaded with no saved progress ──────
    useEffect(() => {
        if (sessionData && conceptHistory.length === 0 && !currentUnit && !isLoading) {
            void fetchNextConcept();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionData]);

    // ─── Mic ─────────────────────────────────────────────────────────────
    const startMicListening = useCallback(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (_) {} }
        try {
            const rec = new SR();
            rec.continuous = false;
            rec.interimResults = true;
            rec.lang = 'en-US';
            rec.onstart = () => { setIsMicListening(true); setSpokenTextBuffer(''); spokenTextRef.current = ''; };
            rec.onresult = (e: any) => {
                const t = Array.from(e.results).map((r: any) => r[0].transcript).join('');
                setSpokenTextBuffer(t);
                spokenTextRef.current = t;
            };
            rec.onend = () => {
                setIsMicListening(false);
                const final = spokenTextRef.current.trim();
                spokenTextRef.current = '';
                setSpokenTextBuffer('');
                if (final.length > 2) void fetchNextConcept(final);
            };
            rec.onerror = () => setIsMicListening(false);
            recognitionRef.current = rec;
            rec.start();
        } catch (_) { setIsMicListening(false); }
    }, [fetchNextConcept]);

    const toggleMic = () => {
        if (isMicListening) {
            if (recognitionRef.current) try { recognitionRef.current.stop(); } catch (_) {}
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
            if (currentUnit) void speakText(currentUnit.spokenExplanation);
        }
    };

    const handleSpeedChange = () => {
        const speeds = [1.0, 1.25, 1.5];
        const next = speeds[(speeds.indexOf(speechRate) + 1) % speeds.length];
        setSpeechRate(next);
        addToast(`Speed: ${next}x`, 'info');
    };

    // ─── Graceful navigation back ─────────────────────────────────────────
    const handleGoBack = useCallback(async () => {
        setIsNavigatingBack(true);
        stopAudio();
        clearStreamTimers();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (_) {} }

        // Save before leaving
        if (conceptHistory.length > 0) {
            saveProgress(conceptHistory, conceptIndexRef.current, phaseRef.current);
        }

        await new Promise(r => setTimeout(r, 120)); // small flush delay
        if (onNavigate) onNavigate('study_guide');
        else window.history.back();
    }, [stopAudio, clearStreamTimers, conceptHistory, saveProgress, onNavigate]);

    // ─── Phase label ──────────────────────────────────────────────────────
    const phaseLabel: Record<TeachingPhase, string> = {
        introduction: '📖 Introduction',
        key_terms: '💡 Key Concept',
        example: '✏️ Worked Example',
        practice: '🎯 Practice',
    };

    // ─── Render ───────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col flex-1 h-full w-full bg-[#FAF7F2] text-[#2C241D] overflow-hidden select-none">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#E5DACD] bg-[#F4ECE2]/95 backdrop-blur-md z-30 shadow-xs">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleGoBack}
                        disabled={isNavigatingBack}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-[#4A3E31] text-xs font-bold active:scale-95 cursor-pointer shadow-xs disabled:opacity-60 transition-all"
                        title="Save & return to Study Guide"
                    >
                        <i className="bi bi-arrow-left text-sm"></i>
                        <span className="hidden sm:inline">{isNavigatingBack ? 'Saving...' : 'Study Guide'}</span>
                    </button>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black tracking-widest uppercase text-[#8B5A2B]">
                            {phaseLabel[phase]}
                        </span>
                        <h2 className="text-sm sm:text-base font-bold text-[#2C241D] truncate max-w-[170px] sm:max-w-md">
                            {sessionData?.course.course_name || 'Academic Course'}
                        </h2>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    {/* TTS status pill */}
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FFFDFB] border border-[#D9CCBC] rounded-full text-xs font-semibold text-[#4A3E31] shadow-xs">
                        {isTtsLoading
                            ? <span className="w-2 h-2 rounded-full bg-[#D4A373] animate-pulse" />
                            : <span className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-[#8B5A2B] animate-pulse' : 'bg-[#C2B2A3]'}`} />
                        }
                        <span className="hidden sm:inline text-[11px]">
                            {isTtsLoading ? 'Generating...' : isSpeaking ? 'Speaking...' : 'Charon · Ready'}
                        </span>
                    </div>

                    {/* Speed */}
                    <button
                        onClick={handleSpeedChange}
                        className="px-2.5 py-1 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-xs font-mono font-bold text-[#4A3E31] cursor-pointer shadow-xs transition-colors"
                    >
                        {speechRate}x
                    </button>
                </div>
            </header>

            {/* ── Main ───────────────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col p-3 sm:p-6 max-w-4xl w-full mx-auto overflow-y-auto gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                {/* Topic & concept tag */}
                <div className="flex items-center justify-between text-xs text-[#6B5E51]">
                    <span className="font-semibold text-[#3D3328] flex items-center gap-1.5 truncate">
                        <i className="bi bi-journal-bookmark text-sm text-[#8B5A2B]"></i>
                        {sessionData?.topic?.topic_name || 'Core Lesson'}
                    </span>
                    {currentUnit && (
                        <span className="font-semibold text-[#8B5A2B] px-2 py-0.5 rounded-lg bg-[#EFE5D8] border border-[#DFD1C0] shrink-0 ml-2 truncate max-w-[160px]">
                            {currentUnit.concept}
                        </span>
                    )}
                </div>

                {/* ── Blackboard ─────────────────────────────────────────── */}
                <div className="relative flex-1 min-h-[200px] sm:min-h-[260px] flex flex-col justify-start milk-canvas border-2 border-[#E5D7C5] rounded-3xl p-5 sm:p-8 shadow-md overflow-hidden">

                    {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#FAF7F2]/80 rounded-3xl z-10">
                            <div className="w-8 h-8 border-2 border-[#C2B2A3] border-t-[#8B5A2B] rounded-full animate-spin" />
                            <p className="text-sm font-handwriting text-[#7A6B5C] tracking-wide">
                                {phase === 'introduction' ? 'Opening class...' : 'Preparing next concept...'}
                            </p>
                        </div>
                    )}

                    {/* Board lines — streamed in one at a time, all rendered with KaTeX */}
                    {!isLoading && visibleBoardLines.length > 0 ? (
                        <div className="space-y-2.5">
                            {visibleBoardLines.map((line, i) => {
                                const isVariableLine = line.includes('→');
                                const isBlockFormula = line.trim().startsWith('$$');
                                return (
                                    <div
                                        key={`${i}-${line.slice(0, 20)}`}
                                        className="flex items-start gap-2 animate-fade-in"
                                    >
                                        {/* Bullet dot — skip for block formulas and variable lines */}
                                        {!isVariableLine && !isBlockFormula && (
                                            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#8B5A2B] shrink-0 opacity-70" />
                                        )}

                                        {isVariableLine ? (
                                            // Variable breakdown: "F → Force in Newtons" — mono font
                                            <div className="font-mono text-base sm:text-lg text-[#5A4020] leading-snug pl-4 w-full">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                    rehypePlugins={[rehypeKatex]}
                                                    components={{
                                                        p: ({ node, ...props }) => <span {...props} />,
                                                    }}
                                                >{line.trim()}</ReactMarkdown>
                                            </div>
                                        ) : isBlockFormula ? (
                                            // Block formula — large centered KaTeX
                                            <div className="w-full text-center text-[#221B14] py-1 overflow-x-auto">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                    rehypePlugins={[rehypeKatex]}
                                                >{line}</ReactMarkdown>
                                            </div>
                                        ) : (
                                            // Regular line — handwriting font, with inline math support
                                            <div className="font-handwriting text-xl sm:text-2xl text-[#2A1F14] leading-snug tracking-wide w-full">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                    rehypePlugins={[rehypeKatex]}
                                                    components={{
                                                        p: ({ node, ...props }) => <span {...props} />,
                                                    }}
                                                >{line}</ReactMarkdown>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {/* Streaming cursor */}
                            {isStreaming && (
                                <span className="inline-block w-3 h-5 bg-[#8B5A2B] opacity-70 rounded-sm animate-pulse ml-1" />
                            )}
                        </div>
                    ) : !isLoading ? (
                        <div className="flex items-center justify-center h-full opacity-40">
                            <i className="bi bi-easel text-4xl text-[#8B5A2B]"></i>
                        </div>
                    ) : null}
                </div>

                {/* ── Spoken hint / transcript ───────────────────────────── */}
                <div className="min-h-[40px] flex items-center justify-center text-center px-2">
                    {isMicListening && spokenTextBuffer ? (
                        <p className="text-sm font-medium text-[#8B5A2B] animate-pulse flex items-center gap-2">
                            <i className="bi bi-mic-fill"></i>
                            <span>"{spokenTextBuffer}..."</span>
                        </p>
                    ) : isTtsLoading ? (
                        <p className="text-xs text-[#7A6B5C] flex items-center gap-2">
                            <i className="bi bi-stars text-sm text-[#8B5A2B] animate-pulse"></i>
                            Generating Charon voice...
                        </p>
                    ) : isSpeaking && currentUnit ? (
                        <p className="text-xs sm:text-sm text-[#4A3E31] italic line-clamp-2 flex items-center gap-2">
                            <i className="bi bi-volume-up text-sm text-[#8B5A2B]"></i>
                            <span>"{currentUnit.spokenExplanation}"</span>
                        </p>
                    ) : (
                        <p className="text-xs text-[#7A6B5C]">
                            {isMicListening ? 'Listening...' : 'Tap a suggestion or speak your answer'}
                        </p>
                    )}
                </div>

                {/* ── Suggestions ────────────────────────────────────────── */}
                {currentUnit && !isLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {currentUnit.suggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => void fetchNextConcept(s)}
                                disabled={isLoading || isTtsLoading}
                                className="px-4 py-3 bg-[#FFFDFB] hover:bg-[#F5EDE3] border-2 border-[#E5DACD] hover:border-[#D5C3AE] active:border-[#8B5A2B] text-[#2C241D] rounded-2xl text-xs sm:text-sm font-semibold text-left transition-all active:scale-[0.98] shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-2.5"
                            >
                                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-[#EFE5D8] border border-[#DFD1C0] text-[10px] font-bold text-[#8B5A2B] shrink-0">
                                    {i + 1}
                                </span>
                                <span className="truncate">{s}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Bottom Controls ────────────────────────────────────── */}
                <div className="flex items-center justify-between bg-[#F4ECE2] border border-[#E5DACD] rounded-2xl px-5 py-2.5 shadow-sm mt-auto shrink-0">
                    {/* Replay */}
                    <button
                        onClick={() => currentUnit && void speakText(currentUnit.spokenExplanation)}
                        disabled={isLoading || isTtsLoading || isSpeaking}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#5A4D3E] hover:text-[#2C241D] cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-[#EBE0D2] disabled:opacity-40 transition-colors"
                        title="Replay"
                    >
                        <i className="bi bi-arrow-counterclockwise text-sm"></i>
                        <span className="hidden sm:inline">Replay</span>
                    </button>

                    {/* Mic */}
                    <button
                        onClick={toggleMic}
                        disabled={isLoading || isTtsLoading || isSpeaking}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-40 ${
                            isMicListening
                                ? 'bg-[#8B5A2B] text-white animate-pulse shadow-md'
                                : 'bg-[#FFFDFB] hover:bg-[#EDE1D1] text-[#3D3328] border-2 border-[#D9CCBC]'
                        }`}
                    >
                        <i className={`bi ${isMicListening ? 'bi-mic-fill' : 'bi-mic'} text-sm`}></i>
                        <span>{isMicListening ? 'Listening...' : 'Speak'}</span>
                    </button>

                    {/* Mute */}
                    <button
                        onClick={toggleMute}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#5A4D3E] hover:text-[#2C241D] cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-[#EBE0D2] transition-colors"
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        <i className={`bi ${isMuted ? 'bi-volume-mute-fill text-red-600' : 'bi-volume-up'} text-sm`}></i>
                        <span className="hidden sm:inline">{isMuted ? 'Unmute' : 'Mute'}</span>
                    </button>
                </div>
            </main>
        </div>
    );
};

export default VoiceTutorialPage;
