import React, { useState, useEffect, useRef, useCallback } from 'react';
import { readCachedJson, writeCachedJson } from '../utils/cache';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import type { UserProfile, Course, Topic } from '../types';
import {
    getStudentCognitiveProfile,
    recordSessionCompletion,
    StudentCognitiveProfile,
} from '../services/tutorMemoryService';
import {
    saveLocalVoiceTutorialProgress,
    getLocalVoiceTutorialProgress,
} from '../services/voiceTutorialStorageService';
import { formatLatexMath } from '../utils/latexFormatter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// @ts-ignore: KaTeX stylesheet
import 'katex/dist/katex.min.css';
import { LimitExceededModal } from './LimitExceededModal';
import { grokTts, grokVoiceEngine } from '../services/voice/GrokVoiceEngine';
import { sanitizeAndValidateSvg, SVG_REALISTIC_ILLUSTRATION_SYSTEM_PROMPT } from '../services/svgIllustrationEngine';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_BOARD_LINES = 6;

// ── Types ────────────────────────────────────────────────────────────────────
export interface VoiceTutorialSessionData {
    course: Course;
    topic?: Topic | null;
    syllabusContext?: string;
    image?: string | null;
    customPrompt?: string | null;
    source?: string;
}

export interface PrecompiledBoard {
    boardId: string;
    conceptIdx: number;
    conceptName: string;
    phaseTitle: string;
    boardLines: string[];
    spokenExplanation: string;
    diagramSvg?: string | null;
    tableMarkdown?: string | null;
    diagramCaption?: string | null;
}

export interface SinglePassTopicLesson {
    topicName: string;
    courseName?: string;
    overview: string;
    boards: PrecompiledBoard[];
    overallSummary: string;
}

export interface VoiceTutorialPageProps {
    userProfile?:  UserProfile | null;
    appSettings?:  any;
    onNavigate?:   (tab: string) => void;
    initialSessionData?: VoiceTutorialSessionData | null;
    onBack?:       () => void;
    setCustomHeaderConfig?: (config: any) => void;
}

const readImageAsDataUrl = async (input: File | Blob | string): Promise<{ dataUrl: string; mimeType: string }> => {
    if (typeof input === 'string') {
        if (input.startsWith('data:')) {
            const mimeType = input.split(';')[0].split(':')[1] || 'image/jpeg';
            return { dataUrl: input, mimeType };
        }
        if (input.startsWith('blob:') || input.startsWith('http://') || input.startsWith('https://')) {
            try {
                const response = await fetch(input);
                const blob = await response.blob();
                return readImageAsDataUrl(blob);
            } catch (err) {
                console.warn('Failed to fetch image blob/url:', err);
            }
        }
        return { dataUrl: input, mimeType: 'image/jpeg' };
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                const mimeType = (input as any).type || 'image/jpeg';
                resolve({ dataUrl: reader.result, mimeType });
            } else {
                reject(new Error('Failed to read image as data URL'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(input);
    });
};

/**
 * Robust JSON parser capable of handling LaTeX backslashes, unclosed quotes, and markdown code blocks.
 */
export function robustParseJson<T = any>(raw: string): T {
    if (!raw || typeof raw !== 'string') {
        throw new Error('Empty JSON input');
    }
    let cleaned = raw.replace(/^```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();
    
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(cleaned) as T;
    } catch (_) {}

    try {
        let inString = false;
        let isEscaped = false;
        let out = '';
        for (let i = 0; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (inString) {
                if (isEscaped) {
                    if (ch === '"' || ch === '\\' || ch === '/' || ch === 'b' || ch === 'f' || ch === 'n' || ch === 'r' || ch === 't' || ch === 'u') {
                        out += '\\' + ch;
                    } else {
                        out += '\\\\' + ch;
                    }
                    isEscaped = false;
                } else if (ch === '\\') {
                    isEscaped = true;
                } else if (ch === '"') {
                    inString = false;
                    out += ch;
                } else {
                    out += ch;
                }
            } else {
                if (ch === '"') {
                    inString = true;
                    out += ch;
                } else {
                    out += ch;
                }
            }
        }
        return JSON.parse(out.replace(/,\s*([\}\]])/g, '$1')) as T;
    } catch (_) {}

    return {
        topicName: 'Academic Tutorial',
        overview: 'Interactive Multi-Disciplinary Lesson',
        boards: [
            {
                boardId: 'b_0',
                conceptIdx: 0,
                conceptName: 'Core Overview',
                phaseTitle: 'Intuition & Key Concepts',
                boardLines: ['**Academic Topic Overview**', 'Interactive Voice Lesson'],
                spokenExplanation: 'Welcome to this interactive tutorial. Let us explore the core concepts step by step.',
            }
        ],
        overallSummary: 'Topic completed.',
    } as any as T;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const VoiceTutorialPage: React.FC<VoiceTutorialPageProps> = ({
    userProfile,
    appSettings: propAppSettings,
    onNavigate,
    initialSessionData,
    onBack,
    setCustomHeaderConfig,
}) => {
    const { settings: hookAppSettings } = useAppSettings();
    const appSettings = propAppSettings || hookAppSettings;
    const { addToast } = useToast();

    // ── Session & Lesson State ──────────────────────────────────────────
    const [sessionData, setSessionData] = useState<VoiceTutorialSessionData | null>(initialSessionData || null);
    const [lessonPlan, setLessonPlan] = useState<SinglePassTopicLesson | null>(null);
    const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
    const [lessonGenStep, setLessonGenStep] = useState('');
    const [boardIndex, setBoardIndex] = useState(0);
    const [isDone, setIsDone] = useState(false);

    // ── Board Content & Animation State ─────────────────────────────────
    const [visibleBoardLines, setVisibleBoardLines] = useState<string[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [activeWritingIndex, setActiveWritingIndex] = useState<number>(-1);
    const [activeDiagramSvg, setActiveDiagramSvg] = useState<string | null>(null);
    const [activeTableMarkdown, setActiveTableMarkdown] = useState<string | null>(null);
    const [diagramKey, setDiagramKey] = useState(0);
    const [isDiagramZoomed, setIsDiagramZoomed] = useState(false);

    // ── Audio & Voice State (Altair) ────────────────────────────────────
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isTtsLoading, setIsTtsLoading] = useState(false);
    const [activeSpokenWord, setActiveSpokenWord] = useState<string>('');

    // ── Live Interruptible Q&A State ────────────────────────────────────
    const [isMicListening, setIsMicListening] = useState(false);
    const [micDisplay, setMicDisplay] = useState('');
    const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);
    const [qaQuestion, setQaQuestion] = useState<string | null>(null);
    const [qaAnswer, setQaAnswer] = useState<string | null>(null);
    const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string } | null>(null);
    const [showScannedImageModal, setShowScannedImageModal] = useState(false);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [limitModalData, setLimitModalData] = useState<{ cost: number; balance: number }>({ cost: 1, balance: 0 });
    const [isNavigatingBack, setIsNavigatingBack] = useState(false);

    // ── Refs ────────────────────────────────────────────────────────────
    const boardScrollRef            = useRef<HTMLDivElement | null>(null);
    const fileInputRef              = useRef<HTMLInputElement | null>(null);
    const isActiveRef               = useRef(true);
    const hasStartedRef             = useRef(false);
    const boardIndexRef             = useRef(0);
    const isSpeakingRef             = useRef(false);
    const currentAudioRef           = useRef<any>(null);
    const playSessionIdRef          = useRef(0);
    const streamTimersRef           = useRef<ReturnType<typeof setTimeout>[]>([]);
    const recognitionRef            = useRef<any>(null);
    const spokenTextRef             = useRef('');
    const pendingBoardLinesRef      = useRef<string[]>([]);
    const pendingVisualsRef         = useRef<{ svg: string | null; table: string | null; caption: string | null }>({ svg: null, table: null, caption: null });

    // ── Auto-Scroll Board Content Smoothly to Bottom ────────────────────
    const scrollToBottom = useCallback(() => {
        if (boardScrollRef.current) {
            boardScrollRef.current.scrollTo({
                top: boardScrollRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [visibleBoardLines, isStreaming, activeSpokenWord, activeDiagramSvg, activeTableMarkdown, scrollToBottom]);

    const clearAllStreamTimers = useCallback(() => {
        streamTimersRef.current.forEach(t => clearTimeout(t));
        streamTimersRef.current = [];
    }, []);

    const stopAudioImmediate = useCallback(() => {
        playSessionIdRef.current++;
        if (currentAudioRef.current) {
            try {
                if (typeof currentAudioRef.current.stop === 'function') {
                    currentAudioRef.current.stop();
                } else if (typeof currentAudioRef.current.pause === 'function') {
                    currentAudioRef.current.pause();
                }
            } catch (_) {}
            currentAudioRef.current = null;
        }
        if (typeof grokVoiceEngine.stopAudio === 'function') {
            grokVoiceEngine.stopAudio();
        } else if (typeof (grokVoiceEngine as any).stopAll === 'function') {
            (grokVoiceEngine as any).stopAll();
        }
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setIsTtsLoading(false);
        setActiveSpokenWord('');
    }, []);

    // ── Speech Text Sanitizer (Preserves Grok Speech Tags) ───────────────
    const cleanSpokenTextForTTS = (rawText: string): string => {
        return rawText
            .replace(/\$\$([\s\S]*?)\$\$/g, ' ')
            .replace(/\$([^\$]+)\$/g, (m, math) => {
                return math
                    .replace(/\\text\{([^\}]+)\}/g, '$1')
                    .replace(/\\frac\{([^\}]+)\}\{([^\}]+)\}/g, '$1 over $2')
                    .replace(/\\sqrt\{([^\}]+)\}/g, 'square root of $1')
                    .replace(/v_f/g, 'v final')
                    .replace(/v_i/g, 'v initial')
                    .replace(/F_\{net\}|F_net/g, 'net force')
                    .replace(/\\theta/g, 'theta')
                    .replace(/\^2/g, ' squared')
                    .replace(/\^3/g, ' cubed')
                    .replace(/m\/s\^2|\\text\{m\/s\}\^2/g, 'meters per second squared')
                    .replace(/m\/s|\\text\{m\/s\}/g, 'meters per second')
                    .replace(/kg/g, 'kilograms')
                    .replace(/=/g, ' equals ')
                    .replace(/\+/g, ' plus ')
                    .replace(/-/g, ' minus ')
                    .replace(/\*/g, ' times ')
                    .replace(/\\rightarrow/g, ' leads to ')
                    .replace(/\\Delta/g, 'change in ');
            })
            .replace(/[#`_~]/g, '')
            .replace(/\*\*(.*?)\*\*/g, '<emphasis>$1</emphasis>')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // ── Synchronized Progressive Board Reveal (Accurate Voice Pacing) ────
    const revealLinesProgressively = useCallback((lines: string[], spokenText?: string) => {
        clearAllStreamTimers();
        if (!lines || lines.length === 0) {
            setVisibleBoardLines([]);
            setIsStreaming(false);
            setActiveWritingIndex(-1);
            return;
        }

        setIsStreaming(true);
        const words = spokenText ? spokenText.split(/\s+/).filter(Boolean) : [];
        const wordCount = Math.max(words.length, 20);

        // Pacing at 520ms per word gives natural speech duration and prevents text racing ahead of voice
        const totalEstMs = Math.max(3500, wordCount * 520);
        const lineCount = lines.length;
        const lineIntervalMs = Math.max(2400, Math.min(6000, Math.floor(totalEstMs / Math.max(lineCount, 1))));

        // Lead delay of 280ms before Line 0 writes
        const initTimer = setTimeout(() => {
            if (!isActiveRef.current) return;
            setVisibleBoardLines([lines[0]]);
            setActiveWritingIndex(0);
            scrollToBottom();
        }, 280);
        streamTimersRef.current.push(initTimer);

        for (let i = 1; i < lineCount; i++) {
            const timer = setTimeout(() => {
                if (!isActiveRef.current) return;
                setVisibleBoardLines(lines.slice(0, i + 1));
                setActiveWritingIndex(i);
                scrollToBottom();
            }, 280 + i * lineIntervalMs);
            streamTimersRef.current.push(timer);
        }

        const finishTimer = setTimeout(() => {
            if (!isActiveRef.current) return;
            setVisibleBoardLines(lines.slice(0, MAX_BOARD_LINES));
            setIsStreaming(false);
            setActiveWritingIndex(-1);
            setActiveSpokenWord('');
            scrollToBottom();
        }, 280 + lineCount * lineIntervalMs);
        streamTimersRef.current.push(finishTimer);
    }, [clearAllStreamTimers, scrollToBottom]);

    // ── Speak Board Audio & Live Timestamp Sync ──────────────────────────
    const speakBoardAudio = useCallback(async (
        text: string,
        lines: string[],
        cacheKey: string,
        onEnd?: () => void
    ): Promise<void> => {
        if (!isActiveRef.current || !text) {
            onEnd?.();
            return;
        }

        stopAudioImmediate();
        clearAllStreamTimers();
        setIsPaused(false);

        if (isMuted) {
            setIsTtsLoading(false);
            setIsSpeaking(false);
            revealLinesProgressively(lines, text);

            if (pendingVisualsRef.current.svg) {
                setActiveDiagramSvg(pendingVisualsRef.current.svg);
                setActiveTableMarkdown(null);
                setDiagramKey(k => k + 1);
            } else if (pendingVisualsRef.current.table) {
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(pendingVisualsRef.current.table);
                setDiagramKey(k => k + 1);
            }
            onEnd?.();
            return;
        }

        setIsTtsLoading(true);
        setIsSpeaking(false);
        setVisibleBoardLines([]);
        setActiveWritingIndex(-1);
        setActiveDiagramSvg(null);
        setActiveTableMarkdown(null);

        const sessionId = ++playSessionIdRef.current;
        const cleanedText = cleanSpokenTextForTTS(text);

        if (!cleanedText) {
            setIsTtsLoading(false);
            revealLinesProgressively(lines, text);
            onEnd?.();
            return;
        }

        const player = grokTts.playSpeech(cleanedText, {
            voice: 'altair',
            withTimestamps: true,
            cacheKey,
            onStart: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(true);
                isSpeakingRef.current = true;
                setIsTtsLoading(false);

                revealLinesProgressively(lines, cleanedText);

                if (pendingVisualsRef.current.svg) {
                    setActiveDiagramSvg(pendingVisualsRef.current.svg);
                    setActiveTableMarkdown(null);
                    setDiagramKey(k => k + 1);
                } else if (pendingVisualsRef.current.table) {
                    setActiveDiagramSvg(null);
                    setActiveTableMarkdown(pendingVisualsRef.current.table);
                    setDiagramKey(k => k + 1);
                }
            },
            onTimeUpdate: (curTime, charIndex, currentWord) => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setActiveSpokenWord(currentWord);
            },
            onEnd: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setIsPaused(false);
                setIsTtsLoading(false);
                currentAudioRef.current = null;

                setVisibleBoardLines(lines);
                setIsStreaming(false);
                setActiveWritingIndex(-1);
                setActiveSpokenWord('');

                onEnd?.();
            },
            onError: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setIsPaused(false);
                setIsTtsLoading(false);
                currentAudioRef.current = null;
                revealLinesProgressively(lines, cleanedText);
                if (pendingVisualsRef.current.svg) {
                    setActiveDiagramSvg(pendingVisualsRef.current.svg);
                } else if (pendingVisualsRef.current.table) {
                    setActiveTableMarkdown(pendingVisualsRef.current.table);
                }
                onEnd?.();
            },
        });

        currentAudioRef.current = player as any;
    }, [isMuted, clearAllStreamTimers, revealLinesProgressively, stopAudioImmediate]);

    // ── Single-Pass Complete Topic Lesson Generator (1 Gemini Call!) ──────
    const generateCompleteTopicLesson = useCallback(async (
        session: VoiceTutorialSessionData,
        studentMem?: StudentCognitiveProfile | null
    ): Promise<SinglePassTopicLesson | null> => {
        setIsGeneratingLesson(true);
        setLessonGenStep('Pre-compiling Full Topic Lesson...');

        const aiClient = createAvelutAI(appSettings, userProfile || null);
        if (!aiClient) {
            setIsGeneratingLesson(false);
            addToast('AI service unavailable. Check your internet connection or API settings.', 'error');
            return null;
        }

        const topicName = session.topic?.topic_name || session.course.course_name || 'Academic Subject';
        const courseContext = session.syllabusContext ? `SYLLABUS CONTEXT:\n${session.syllabusContext}\n` : '';
        const customPromptCtx = session.customPrompt ? `SPECIFIC FOCUS INSTRUCTIONS:\n${session.customPrompt}\n` : '';

        const isNotebookSource = Boolean(
            session.syllabusContext?.toLowerCase().includes('notebook') || 
            session.syllabusContext?.toLowerCase().includes('chapter') ||
            session.course?.course_id?.startsWith('nb_')
        );

        const prompt = `You are AVELUT Master Academic Voice & Visual Tutor.
Generate a DEEP, EXPLICIT, CRYSTAL-CLEAR VIDEO-STYLE PRE-COMPILED LESSON for "${topicName}" in a single structured JSON response.

${courseContext}${customPromptCtx}
${SVG_REALISTIC_ILLUSTRATION_SYSTEM_PROMPT}

TEACHING METHODOLOGY & EXPLICIT 10-TO-15 BOARD STRUCTURE:
Break down the topic into an explicit, highly accessible sequence of 10 to 15 bite-sized boards.
EVERY SINGLE BOARD MUST COVER ONLY ONE FOCUSED STEP OR CONCEPT (as simple and clear as possible).
ALL WORKED EXAMPLES MUST SPAN AT LEAST 3 DEDICATED CONSECUTIVE BOARDS:
  - Example Board A: Problem Setup, Real-World Context & Given Quantities
  - Example Board B: Step-by-Step Mathematical/Mechanistic Substitution
  - Example Board C: Final Evaluation, Calculation Result & Intuitive Verification

MANDATORY 10-15 BOARD SEQUENCE TEMPLATE:
- Board 1: "Real-World Intuition & Analogy" — Relatable scenario, physical meaning / everyday intuition, [DIAGRAM] or [TABLE].
- Board 2: "Foundational Definition & Core Meaning" — Clear definition without jargon, core terminology, [TABLE].
- Board 3: "Governing Law / Fundamental Principle" — The core equation/law/mechanism ($...$), conditions of validity, [DIAGRAM].
- Board 4: "Variable Anatomy & Dimensional Analysis" — Breakdown of each variable, symbols, units, and physical significance, [TABLE].
- Board 5: "Worked Example — Setup & Given Quantities" — Concrete problem scenario, listing what is given and what is required, [DIAGRAM].
- Board 6: "Worked Example — Step 1: Formulation & Substitution" — Choosing the governing equation, substituting values step-by-step.
- Board 7: "Worked Example — Step 2: Calculation & Interpretation" — Arithmetic/algebraic solution, final answer with units, intuitive sanity check.
- Board 8: "Deep-Dive Mechanism / Conceptual Proof" — Why this works under the hood, visual mechanism, [DIAGRAM].
- Board 9: "Comparative Classification / Taxonomy" — Key distinctions, subtypes, or structural relationships, [TABLE].
- Board 10: "Classic Student Trap & Misconception" — Common error students make in exams, why it is false, and how to avoid it.
- Board 11: "Subtle Nuance & Edge Case" — Boundary conditions, when the rule changes, critical exception.
- Board 12: "Real-World Engineering / Scientific Application" — How professionals/industry apply this concept today, [DIAGRAM].
- Board 13: "Golden Rule & Master Memory Anchor" — Memorable 1-line rule, invariant principle to remember forever.

${isNotebookSource ? `NOTEBOOK TUTOR PERSONA (MANDATORY):
In your spoken explanations, personalize the teaching by naturally referring directly to the student's notebook and textbook material (e.g., "Looking at this chapter of your notes...", "From this part of your note...", "As outlined in this chapter...", "In your notes right here...").` : ''}

CRITICAL RULES:
1. UNIVERSAL DOMAIN ADAPTATION: If the topic is qualitative (e.g. Constitutional Law, Biology, History, Philosophy, Literature), teach mechanisms, doctrines, and case comparisons with explicit steps and 3-board case studies.
2. SHORT BOARD LINES (1-3 lines max): Keep board text ultra-clean, legible, and uncluttered.
3. EXPRESSIVE GROK SPEECH TAGS: In spokenExplanation, naturally incorporate [pause], <emphasis>key terms</emphasis>, <slow>core rules</slow>, [chuckle], or [sigh].
4. ALWAYS PROVIDE A VISUAL (MANDATORY): Include a complete realistic SVG string (diagramSvg) OR a structured markdown table (tableMarkdown) for every board.
5. Place [DIAGRAM] or [TABLE] tag inside boardLines array where the visual best fits.

OUTPUT VALID JSON ONLY:
{
  "topicName": "${topicName}",
  "overview": "2-sentence engaging topic overview",
  "boards": [
    {
      "boardId": "board_1",
      "conceptIdx": 0,
      "conceptName": "Concept Name",
      "phaseTitle": "Phase Title",
      "boardLines": ["Line 1 with LaTeX ($...$)", "[DIAGRAM]", "Line 2"],
      "spokenExplanation": "Conversational narration with [pause] and <emphasis>tags</emphasis>",
      "diagramSvg": "Complete SVG string (viewBox=\\"0 0 800 480\\") or null",
      "tableMarkdown": "Markdown table or null",
      "diagramCaption": "Caption string or null"
    }
  ],
  "overallSummary": "Comprehensive summary of topic mastery."
}`;

        try {
            const parts: any[] = [];
            if (session.image) {
                try {
                    const { dataUrl, mimeType } = await readImageAsDataUrl(session.image);
                    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
                    if (base64Data) {
                        parts.push({ inlineData: { data: base64Data, mimeType: mimeType || 'image/jpeg' } });
                    }
                } catch (imgErr) {
                    console.warn('[LessonGen] Failed to format image for AI:', imgErr);
                }
            }
            parts.push({ text: prompt });

            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts }],
                config: { responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 8192 },
            });
            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty lesson response');
            const lesson: SinglePassTopicLesson = robustParseJson<SinglePassTopicLesson>(raw);
            setIsGeneratingLesson(false);
            return lesson;
        } catch (err) {
            console.error('[LessonGen] failed:', err);
            addToast('Failed to pre-compile lesson. Please try again.', 'error');
            setIsGeneratingLesson(false);
            return null;
        }
    }, [appSettings, userProfile, addToast]);

    // ── Present Precompiled Board Unit ──────────────────────────────────
    const presentBoard = useCallback(async (
        lesson: SinglePassTopicLesson,
        targetIndex: number
    ) => {
        if (!isActiveRef.current || !lesson || !lesson.boards || lesson.boards.length === 0) return;

        if (targetIndex >= lesson.boards.length) {
            setIsDone(true);
            const uid = userProfile?.uid || 'anon';
            const cid = sessionData?.course?.course_id || 'general';
            const tid = sessionData?.topic?.topic_id || 'core';
            void recordSessionCompletion(uid, cid, tid, 100);
            void saveLocalVoiceTutorialProgress(uid, cid, tid, 0, 'completed', true, lesson);
            return;
        }

        const board = lesson.boards[targetIndex];
        setBoardIndex(targetIndex);
        boardIndexRef.current = targetIndex;

        const uid = userProfile?.uid || 'anon';
        const cid = sessionData?.course?.course_id || 'general';
        const tid = sessionData?.topic?.topic_id || 'core';
        void saveLocalVoiceTutorialProgress(uid, cid, tid, targetIndex, board.phaseTitle, false, lesson);

        // Sanitize visual attachments
        const svg = sanitizeAndValidateSvg(board.diagramSvg);
        const table = (board.tableMarkdown && board.tableMarkdown.trim().includes('|')) ? board.tableMarkdown : null;

        pendingVisualsRef.current = {
            svg,
            table,
            caption: board.diagramCaption || board.phaseTitle,
        };
        pendingBoardLinesRef.current = board.boardLines.slice(0, MAX_BOARD_LINES);

        // Pre-fetch next board's audio in background
        const nextIdx = targetIndex + 1;
        if (nextIdx < lesson.boards.length) {
            const nextBoard = lesson.boards[nextIdx];
            const nextCacheKey = `avelut_grok_${cid}_${tid}_${nextIdx}`;
            grokVoiceEngine.prefetchSpeech(cleanSpokenTextForTTS(nextBoard.spokenExplanation), nextCacheKey);
        }

        // On board audio completion: Auto-clean board and advance smoothly (YouTube Video Style)
        const onBoardAudioEnd = () => {
            if (!isActiveRef.current) return;
            setTimeout(() => {
                if (!isActiveRef.current) return;
                // Auto-advance to next board
                const nextBoardIdx = boardIndexRef.current + 1;
                void presentBoard(lesson, nextBoardIdx);
            }, 1200);
        };

        const currentCacheKey = `avelut_grok_${cid}_${tid}_${targetIndex}`;
        await speakBoardAudio(board.spokenExplanation, board.boardLines, currentCacheKey, onBoardAudioEnd);

    }, [speakBoardAudio, sessionData, userProfile]);

    // ── Session Bootstrap & SQLite Restore ──────────────────────────────
    const bootstrapSession = useCallback(async () => {
        if (!sessionData) return;

        const uid = userProfile?.uid || 'anon';
        const cid = sessionData.course?.course_id || 'general';
        const tid = sessionData.topic?.topic_id || 'core';
        const lessonCacheKey = `avelut_topic_lesson_${cid}_${tid}`;

        const studentMem = await getStudentCognitiveProfile(uid);
        const cachedLesson = readCachedJson<SinglePassTopicLesson | null>(lessonCacheKey, null);
        const sqliteRecord = await getLocalVoiceTutorialProgress(uid, cid, tid);
        
        let lesson: SinglePassTopicLesson | null = cachedLesson || (sqliteRecord?.blueprint ? (sqliteRecord.blueprint as SinglePassTopicLesson) : null);

        if (!lesson || !lesson.boards || lesson.boards.length === 0) {
            const rawLesson = await generateCompleteTopicLesson(sessionData, studentMem);
            if (!rawLesson || !isActiveRef.current) return;
            lesson = rawLesson;
            writeCachedJson(lessonCacheKey, lesson);
            await saveLocalVoiceTutorialProgress(uid, cid, tid, 0, 'start', false, lesson);
        }

        if (!isActiveRef.current || !lesson) return;
        setIsDone(false);
        setLessonPlan(lesson);

        let startBoardIndex = sqliteRecord?.conceptIdx ?? 0;
        if (sqliteRecord?.isCompleted || startBoardIndex >= lesson.boards.length) {
            startBoardIndex = 0;
        }

        await presentBoard(lesson, startBoardIndex);
    }, [sessionData, userProfile, generateCompleteTopicLesson, presentBoard]);

    // ── Start on mount & Hide bottom nav on mobile ──────────────────────
    useEffect(() => {
        isActiveRef.current = true;
        setCustomHeaderConfig?.({ hideBottomNav: true });
        if (!hasStartedRef.current && sessionData) {
            hasStartedRef.current = true;
            void bootstrapSession();
        }
        return () => {
            isActiveRef.current = false;
            setCustomHeaderConfig?.(null);
            stopAudioImmediate();
            clearAllStreamTimers();
        };
    }, [bootstrapSession, sessionData, stopAudioImmediate, clearAllStreamTimers, setCustomHeaderConfig]);

    // ── Live Interruptible Q&A Handler ──────────────────────────────────
    const handleStudentInterruptionQuestion = useCallback(async (
        questionText: string,
        imageAttachment?: { base64: string; mimeType: string } | null
    ) => {
        if (!questionText.trim() && !imageAttachment) return;
        if (!lessonPlan || isGeneratingLesson) return;

        // 1. Immediately pause current board audio
        stopAudioImmediate();
        clearAllStreamTimers();
        setIsAnsweringQuestion(true);
        setQaQuestion(questionText);
        setQaAnswer(null);

        const currentBoard = lessonPlan.boards[boardIndexRef.current] || lessonPlan.boards[0];
        const topicName = lessonPlan.topicName || sessionData?.topic?.topic_name || 'Topic';

        const aiClient = createAvelutAI(appSettings, userProfile || null);
        if (!aiClient) {
            setIsAnsweringQuestion(false);
            addToast('Could not reach AI to answer question.', 'error');
            return;
        }

        const qaPrompt = `You are AVELUT Master Academic Voice Tutor.
The student is watching a voice tutorial on "${topicName}".
Current Board: "${currentBoard.phaseTitle}" (${currentBoard.conceptName}).
Board lines visible on screen: ${currentBoard.boardLines.join(' | ')}.
The student paused the video lesson to ask: "${questionText}".

Provide a direct, crystal-clear, encouraging 2-3 sentence answer explaining their question.
At the end of your explanation, say: "Now, let us continue our lesson."

OUTPUT PLAIN TEXT (NO MARKDOWN CODE BLOCKS):`;

        try {
            const parts: any[] = [];
            if (imageAttachment) {
                const base64Data = imageAttachment.base64.includes(',') ? imageAttachment.base64.split(',')[1] : imageAttachment.base64;
                parts.push({ inlineData: { data: base64Data, mimeType: imageAttachment.mimeType || 'image/jpeg' } });
            }
            parts.push({ text: qaPrompt });

            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts }],
                config: { temperature: 0.3, maxOutputTokens: 300 },
            });

            const answerText = getResponseText(result) || "I see what you mean. Let's make sure that's clear, and now let's continue our lesson.";
            setQaAnswer(answerText);

            // Speak answer to student
            const cleanedAnswer = cleanSpokenTextForTTS(answerText);
            await grokTts.playSpeech(cleanedAnswer, {
                voice: 'altair',
                withTimestamps: true,
                onEnd: () => {
                    if (!isActiveRef.current) return;
                    setTimeout(() => {
                        if (!isActiveRef.current) return;
                        setIsAnsweringQuestion(false);
                        setQaQuestion(null);
                        setQaAnswer(null);
                        setAttachedImage(null);

                        // Resume current board
                        void presentBoard(lessonPlan, boardIndexRef.current);
                    }, 1000);
                },
            });
        } catch (err) {
            console.warn('[QA Interruption] failed:', err);
            setIsAnsweringQuestion(false);
            setQaQuestion(null);
            setQaAnswer(null);
            void presentBoard(lessonPlan, boardIndexRef.current);
        }
    }, [lessonPlan, isGeneratingLesson, sessionData, appSettings, userProfile, addToast, stopAudioImmediate, clearAllStreamTimers, presentBoard]);

    // ── Microphone Controller ───────────────────────────────────────────
    const stopMicImmediate = useCallback(() => {
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (_) {}
            recognitionRef.current = null;
        }
        setIsMicListening(false);
        setMicDisplay('');
        spokenTextRef.current = '';
    }, []);

    const toggleMic = useCallback(() => {
        if (isMicListening) {
            stopMicImmediate();
            return;
        }

        // Pause audio immediately
        stopAudioImmediate();

        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            addToast('Speech recognition not supported on this browser. Type your question below.', 'info');
            return;
        }

        try {
            const rec = new SR();
            rec.continuous = false;
            rec.interimResults = true;
            rec.lang = 'en-US';
            let speechTimeout: ReturnType<typeof setTimeout> | null = null;
            let hasSubmitted = false;

            rec.onstart = () => {
                if (isActiveRef.current) {
                    setIsMicListening(true);
                    setMicDisplay('');
                    spokenTextRef.current = '';
                }
            };

            const submitSpeech = (text: string) => {
                if (hasSubmitted) return;
                hasSubmitted = true;
                if (speechTimeout) clearTimeout(speechTimeout);
                stopMicImmediate();
                const final = text.trim();
                if (final.length > 1) {
                    addToast(`Asking: "${final}"`, 'info');
                    void handleStudentInterruptionQuestion(final, attachedImage);
                }
            };

            rec.onresult = (e: any) => {
                const resultsArr = Array.from(e.results);
                const t = resultsArr.map((r: any) => r[0].transcript).join(' ').trim();
                spokenTextRef.current = t;
                if (isActiveRef.current) setMicDisplay(t);

                if (speechTimeout) clearTimeout(speechTimeout);
                if (t.length > 1) {
                    speechTimeout = setTimeout(() => {
                        submitSpeech(spokenTextRef.current);
                    }, 1400);
                }
            };

            rec.onend = () => {
                if (!isActiveRef.current) return;
                if (!hasSubmitted && spokenTextRef.current.trim().length > 1) {
                    submitSpeech(spokenTextRef.current);
                } else {
                    stopMicImmediate();
                }
            };

            rec.onerror = () => { stopMicImmediate(); };
            recognitionRef.current = rec;
            rec.start();
        } catch (_) {
            stopMicImmediate();
        }
    }, [isMicListening, stopMicImmediate, stopAudioImmediate, addToast, attachedImage, handleStudentInterruptionQuestion]);

    // ── Navigation & Control Actions ────────────────────────────────────
    const togglePauseAI = useCallback(() => {
        if (!lessonPlan) return;
        if (isSpeaking) {
            stopAudioImmediate();
            setIsPaused(true);
        } else {
            setIsPaused(false);
            void presentBoard(lessonPlan, boardIndexRef.current);
        }
    }, [isSpeaking, lessonPlan, presentBoard, stopAudioImmediate]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
        if (!isMuted) {
            stopAudioImmediate();
        }
    }, [isMuted, stopAudioImmediate]);

    const handleRestartBoard = useCallback(() => {
        if (!lessonPlan) return;
        stopAudioImmediate();
        clearAllStreamTimers();
        void presentBoard(lessonPlan, boardIndexRef.current);
    }, [lessonPlan, presentBoard, stopAudioImmediate, clearAllStreamTimers]);

    const handleAdvanceNextBoard = useCallback(() => {
        if (!lessonPlan) return;
        stopAudioImmediate();
        clearAllStreamTimers();
        void presentBoard(lessonPlan, boardIndexRef.current + 1);
    }, [lessonPlan, presentBoard, stopAudioImmediate, clearAllStreamTimers]);

    const handlePreviousBoard = useCallback(() => {
        if (!lessonPlan) return;
        stopAudioImmediate();
        clearAllStreamTimers();
        const prevIdx = Math.max(0, boardIndexRef.current - 1);
        void presentBoard(lessonPlan, prevIdx);
    }, [lessonPlan, presentBoard, stopAudioImmediate, clearAllStreamTimers]);

    const handleGoBack = useCallback(async () => {
        setIsNavigatingBack(true);
        isActiveRef.current = false;
        stopAudioImmediate();
        clearAllStreamTimers();
        if (onBack) {
            onBack();
        } else if (onNavigate) {
            onNavigate('study_guide');
        }
    }, [onBack, onNavigate, stopAudioImmediate, clearAllStreamTimers]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const { dataUrl, mimeType } = await readImageAsDataUrl(file);
            setAttachedImage({ base64: dataUrl, mimeType });
            addToast('Work photo attached. Tap mic to ask your question!', 'info');
        } catch (_) {
            addToast('Failed to attach image.', 'error');
        }
    };

    // ── Custom Header Integration ───────────────────────────────────────
    useEffect(() => {
        if (setCustomHeaderConfig) {
            const currentBoard = lessonPlan?.boards?.[boardIndex];
            const totalBoards = lessonPlan?.boards?.length || 1;
            const topicName = lessonPlan?.topicName || sessionData?.topic?.topic_name || 'Interactive Tutorial';

            setCustomHeaderConfig({
                leftAction: (
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 max-w-[calc(100vw-110px)] sm:max-w-none">
                        <button
                            onClick={handleGoBack}
                            disabled={isNavigatingBack}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E3E9F1] bg-white hover:bg-slate-50 text-[#0F172A] text-xs sm:text-sm font-bold active:scale-95 cursor-pointer transition-all shrink-0 shadow-2xs"
                        >
                            <i className="bi bi-arrow-left text-sm font-bold text-[#0066FF]"></i>
                            <span className="whitespace-nowrap">Study Guide</span>
                        </button>
                        <div className="min-w-0 flex flex-col justify-center">
                            <span className="text-xs sm:text-sm font-bold text-[#0F172A] truncate max-w-[120px] sm:max-w-[280px] md:max-w-[400px]">
                                {topicName}
                            </span>
                            {currentBoard && (
                                <span className="text-[10px] text-[#0066FF] font-mono font-bold truncate max-w-[120px] sm:max-w-[280px]">
                                    Board {boardIndex + 1}/{totalBoards}: {currentBoard.phaseTitle}
                                </span>
                            )}
                        </div>
                    </div>
                ),
                rightActions: (
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        {sessionData?.image && (
                            <button
                                onClick={() => setShowScannedImageModal(true)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0066FF] text-xs font-bold transition-all cursor-pointer shadow-xs"
                                title="View original problem scan"
                            >
                                <i className="bi bi-image text-xs"></i>
                                <span className="hidden sm:inline">Scan</span>
                            </button>
                        )}
                        <button
                            onClick={toggleMute}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E3E9F1] bg-white hover:bg-slate-50 text-xs font-bold text-[#0F172A] cursor-pointer transition-colors active:scale-95 shadow-xs"
                            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                        >
                            <i className={`bi ${isMuted ? 'bi-volume-mute-fill text-rose-500' : 'bi-volume-up-fill text-[#0066FF]'} text-sm`}></i>
                            <span className="text-[11px] hidden md:inline">{isMuted ? 'Muted' : 'Altair'}</span>
                        </button>
                    </div>
                ),
                className: 'bg-[#F6F6F3]/95 border-b border-[#E3E9F1] backdrop-blur-md'
            });
        }

        return () => {
            if (setCustomHeaderConfig) {
                setCustomHeaderConfig(null);
            }
        };
    }, [setCustomHeaderConfig, sessionData, lessonPlan, boardIndex, isMuted, isNavigatingBack, handleGoBack, toggleMute]);

    // ── Visual Elements ─────────────────────────────────────────────────
    const renderInlineDiagram = () => {
        if (!activeDiagramSvg) return null;
        return (
            <div
                className="w-full my-2 flex items-center justify-center bg-[#F8FAFC] p-3 sm:p-4 rounded-2xl border border-[#E3E9F1] shadow-xs animate-fade-in transition-all cursor-pointer hover:border-blue-300"
                onClick={() => setIsDiagramZoomed(true)}
            >
                <div
                    key={`svg-${diagramKey}`}
                    className="w-full max-h-[220px] sm:max-h-[260px] flex items-center justify-center py-0.5 overflow-visible [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[220px] sm:[&>svg]:max-h-[260px]"
                    dangerouslySetInnerHTML={{ __html: activeDiagramSvg }}
                />
            </div>
        );
    };

    const renderInlineTable = () => {
        if (!activeTableMarkdown) return null;
        return (
            <div className="w-full my-2.5 overflow-x-auto p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#E3E9F1] text-xs sm:text-sm font-mono text-[#0F172A] shadow-xs animate-fade-in">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formatLatexMath(activeTableMarkdown)}
                </ReactMarkdown>
            </div>
        );
    };

    const hasExplicitDiagramTag = visibleBoardLines.some(l => /\[(diagram|visual|image)\]/i.test(l));
    const hasExplicitTableTag = visibleBoardLines.some(l => /\[table\]/i.test(l));

    const totalBoards = lessonPlan?.boards?.length || 1;
    const progressPercent = Math.min(100, Math.round(((boardIndex + 1) / totalBoards) * 100));
    const currentBoard = lessonPlan?.boards?.[boardIndex];

    // ── Render ──────────────────────────────────────────────────────────
    return (
        <div className="flex-1 w-full h-full flex flex-col bg-[#F6F6F3] text-[#0F172A] overflow-hidden select-none relative">

            {/* ── Progress Bar ────────────────────────────────────────── */}
            {lessonPlan && !isGeneratingLesson && (
                <div className="h-1.5 bg-[#E3E9F1] shrink-0">
                    <div
                        className="h-full bg-[#0066FF] rounded-r-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            )}

            {/* ── Single-Pass Generation Screen ───────────────────────── */}
            {isGeneratingLesson && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 text-center animate-fade-in my-auto">
                    <div className="w-20 h-20 rounded-3xl bg-white border-2 border-blue-200 flex items-center justify-center shadow-lg shadow-blue-500/10">
                        <i className="bi bi-mortarboard-fill text-3xl text-[#0066FF]"></i>
                    </div>

                    <div className="space-y-2 max-w-md">
                        <span className="text-xs font-mono font-bold tracking-widest uppercase text-[#0066FF]">
                            Avelut Single-Pass Engine
                        </span>
                        <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
                            {lessonGenStep || 'Pre-compiling Full Topic Lesson...'}
                        </h2>
                        <p className="text-xs sm:text-sm text-[#64748B]">
                            Preparing all lesson boards, diagrams, worked applications, and Grok Altair voice synthesis upfront.
                        </p>
                    </div>

                    <div className="w-full max-w-xs bg-[#E3E9F1] rounded-full h-2 overflow-hidden shadow-inner">
                        <div className="bg-[#0066FF] h-full rounded-full w-full animate-pulse transition-all" />
                    </div>
                </div>
            )}

            {/* ── Completion Screen ───────────────────────────────────── */}
            {isDone && !isGeneratingLesson && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center pb-24 md:pb-6 max-w-xl mx-auto animate-fade-in my-auto">
                    <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0066FF]">
                        <i className="bi bi-mortarboard-fill text-3xl"></i>
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-[#0F172A]">Topic Mastered!</h3>
                        <p className="text-xs font-semibold text-[#0066FF] mt-1 uppercase tracking-wider">{sessionData?.topic?.topic_name}</p>
                    </div>
                    <p className="text-sm text-[#64748B] max-w-md leading-relaxed">{lessonPlan?.overallSummary}</p>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
                        <button
                            onClick={() => presentBoard(lessonPlan!, 0)}
                            className="w-full sm:flex-1 py-3.5 px-6 bg-white hover:bg-slate-50 border border-[#E3E9F1] text-[#0F172A] rounded-2xl font-bold text-sm shadow-xs transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <i className="bi bi-arrow-counterclockwise"></i>
                            <span>Re-play Tutorial</span>
                        </button>
                        <button
                            onClick={handleGoBack}
                            className="w-full sm:w-auto px-6 py-3.5 bg-[#0066FF] hover:bg-blue-700 text-white rounded-2xl font-bold text-sm shadow-xs transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <i className="bi bi-journal-check"></i>
                            <span>Study Guide</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Main Fullscreen Teaching Canvas ─────────────────────── */}
            {!isGeneratingLesson && !isDone && (
                <main className="flex-1 flex flex-col px-2 sm:px-4 pt-1.5 pb-2 w-full h-full gap-2 min-h-0 overflow-hidden">

                    {/* ── Elevated Pure White Academic Board ── */}
                    <div
                        ref={boardScrollRef}
                        className="relative flex-1 min-h-0 flex flex-col justify-start bg-white border-2 border-[#E3E9F1] rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-lg overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-[#CBD5E1] [&::-webkit-scrollbar-thumb]:rounded-full text-[#0F172A]"
                    >
                        {/* ── Live Q&A Realtime Audio Waveform Overlay (No text on board) ── */}
                        {isAnsweringQuestion && (
                            <div className="sticky top-0 z-30 mb-4 p-4 sm:p-5 rounded-2xl bg-[#002D62] text-white border-2 border-[#0066FF] shadow-xl animate-fade-in">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 text-xs font-bold text-blue-200 uppercase tracking-wider">
                                        <i className="bi bi-broadcast text-[#0066FF] animate-pulse text-sm"></i>
                                        <span>Altair Explaining Your Question</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                        <span className="text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-wider">Live Voice</span>
                                    </div>
                                </div>

                                <p className="text-xs sm:text-sm font-medium text-blue-100 mb-3 italic">
                                    "{qaQuestion}"
                                </p>

                                {/* Realtime Audio Waveform Animation Bars */}
                                <div className="flex items-center justify-center gap-2 py-3.5 px-4 bg-black/30 rounded-xl border border-white/10 shadow-inner">
                                    <div className="flex items-center gap-1.5 h-8">
                                        <span className="w-1.5 bg-[#0066FF] rounded-full animate-[bounce_0.8s_ease-in-out_infinite] h-3 shadow-[0_0_8px_#0066FF]" />
                                        <span className="w-1.5 bg-blue-400 rounded-full animate-[bounce_0.6s_ease-in-out_infinite_0.15s] h-6 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                                        <span className="w-1.5 bg-white rounded-full animate-[bounce_0.75s_ease-in-out_infinite_0.3s] h-8 shadow-[0_0_10px_white]" />
                                        <span className="w-1.5 bg-blue-300 rounded-full animate-[bounce_0.5s_ease-in-out_infinite_0.1s] h-7 shadow-[0_0_8px_rgba(147,197,253,0.8)]" />
                                        <span className="w-1.5 bg-[#0066FF] rounded-full animate-[bounce_0.7s_ease-in-out_infinite_0.25s] h-5 shadow-[0_0_8px_#0066FF]" />
                                        <span className="w-1.5 bg-blue-400 rounded-full animate-[bounce_0.9s_ease-in-out_infinite_0.05s] h-4 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                                    </div>
                                    <span className="text-xs font-semibold text-white ml-2 tracking-wide">
                                        {qaAnswer ? 'Speaking answer aloud...' : 'Preparing spoken explanation...'}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col h-full gap-3.5">
                            {/* ── Fixed Board Topic Header ── */}
                            <div className="w-full border-b border-[#E3E9F1] pb-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1.5 shrink-0">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-mono tracking-widest uppercase text-[#0066FF] font-bold">
                                        {currentBoard?.conceptName || 'Lesson Unit'}
                                    </span>
                                    <h2 className="font-bold text-xl sm:text-2xl text-[#0F172A] tracking-tight truncate">
                                        {currentBoard?.phaseTitle || lessonPlan?.topicName}
                                    </h2>
                                </div>
                                <span className="text-[11px] font-mono font-bold text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-full border border-[#E3E9F1] shrink-0">
                                    Board {boardIndex + 1} of {totalBoards}
                                </span>
                            </div>

                            {/* ── Waiting for voice synthesizer ── */}
                            {visibleBoardLines.length === 0 && !isDone && (
                                <div className="flex-1 flex flex-col items-start justify-start pt-6 sm:pt-8 px-2 animate-fade-in">
                                    <div className="flex items-center gap-3 font-mono text-sm sm:text-base tracking-wide">
                                        <span className="inline-block w-3 h-5 sm:w-3.5 sm:h-6 bg-[#0066FF] rounded-xs animate-blink" />
                                        <span className="text-xs text-[#64748B] font-mono italic">
                                            {isTtsLoading ? 'Altair Voice Synthesizer active...' : 'Loading board...'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* ── Board Content Lines ── */}
                            {visibleBoardLines.length > 0 && (
                                <div className="flex-1 w-full space-y-3.5 pb-2">
                                    {visibleBoardLines.map((line, idx) => {
                                        const trimmed = line.trim();
                                        const isExplicitDiagram = /\[(diagram|visual|image)\]/i.test(trimmed);
                                        const isExplicitTable = /\[table\]/i.test(trimmed);

                                        if (isExplicitDiagram) {
                                            return (
                                                <div key={`inline-diag-${idx}`}>
                                                    {renderInlineDiagram()}
                                                </div>
                                            );
                                        }

                                        if (isExplicitTable) {
                                            return (
                                                <div key={`inline-table-${idx}`}>
                                                    {renderInlineTable()}
                                                </div>
                                            );
                                        }

                                        const isVarLine       = trimmed.includes('→') || trimmed.includes('leads to');
                                        const isBlockFormula  = trimmed.startsWith('$$');
                                        const stepMatch       = trimmed.match(/^\*\*(.*?)\*\*\s*:\s*(.*)$/);
                                        const isWritingActive = (idx === activeWritingIndex || (idx === visibleBoardLines.length - 1 && isStreaming)) && isStreaming;

                                        const shouldAutoInsertDiagram = !hasExplicitDiagramTag && activeDiagramSvg && (
                                            idx === 0 || (visibleBoardLines.length === 1 && idx === 0)
                                        );

                                        const shouldAutoInsertTable = !hasExplicitTableTag && activeTableMarkdown && (
                                            isBlockFormula || idx === 1
                                        );

                                        return (
                                            <React.Fragment key={`${idx}-${line.slice(0, 15)}`}>
                                                <div className="flex items-start gap-2.5 animate-fade-in w-full">
                                                    {stepMatch ? (
                                                        <div className="w-full flex flex-col gap-1 my-0.5">
                                                            <span className="font-bold text-xs text-[#0066FF] tracking-wide font-mono bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md w-fit">
                                                                {stepMatch[1]}
                                                            </span>
                                                            <div className="text-base sm:text-lg text-[#0F172A] leading-relaxed overflow-x-auto pl-1 font-medium">
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                                    rehypePlugins={[rehypeKatex]}
                                                                    components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                                >{formatLatexMath(stepMatch[2])}</ReactMarkdown>
                                                                {isWritingActive && (
                                                                    <span className="inline-block w-2 h-4 sm:w-2.5 sm:h-5 ml-1.5 bg-[#0066FF] rounded-xs animate-blink align-middle" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : isBlockFormula ? (
                                                        <div className="w-full text-center text-[#0F172A] py-2.5 overflow-x-auto bg-[#F8FAFC] rounded-2xl border border-[#E3E9F1] px-4 my-1 shadow-xs">
                                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                {formatLatexMath(line)}
                                                            </ReactMarkdown>
                                                        </div>
                                                    ) : isVarLine ? (
                                                        <div className="font-mono text-xs sm:text-sm text-[#002D62] leading-snug pl-2 w-full">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                                rehypePlugins={[rehypeKatex]}
                                                                components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                            >{formatLatexMath(line.trim())}</ReactMarkdown>
                                                            {isWritingActive && (
                                                                <span className="inline-block w-2 h-4 sm:w-2.5 sm:h-5 ml-1.5 bg-[#0066FF] rounded-xs animate-blink align-middle" />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-base sm:text-lg text-[#0F172A] leading-relaxed tracking-tight w-full font-medium">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                                rehypePlugins={[rehypeKatex]}
                                                                components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                            >{formatLatexMath(line)}</ReactMarkdown>
                                                            {isWritingActive && (
                                                                <span className="inline-block w-2 h-4 sm:w-2.5 sm:h-5 ml-1.5 bg-[#0066FF] rounded-xs animate-blink align-middle" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {shouldAutoInsertDiagram && renderInlineDiagram()}
                                                {shouldAutoInsertTable && renderInlineTable()}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {isMicListening && micDisplay && (
                        <div className="shrink-0 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-[#0F172A] animate-pulse px-3.5 py-1 bg-white rounded-full w-fit mx-auto border border-[#E3E9F1] shadow-xs">
                            <i className="bi bi-mic-fill text-red-500"></i>
                            <span>"{micDisplay}..."</span>
                        </div>
                    )}

                    {/* ── Floating White Bottom Control Bar ── */}
                    <div className="shrink-0 flex flex-col gap-2 bg-white/95 border border-[#E3E9F1] rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 shadow-xl backdrop-blur-md w-full mb-1 sm:mb-2 max-w-xl mx-auto">
                        
                        {attachedImage && (
                            <div className="flex items-center justify-between gap-2 p-2 px-3.5 bg-[#F8FAFC] border border-[#E3E9F1] rounded-2xl w-full animate-fade-in shadow-xs">
                                <div className="flex items-center gap-2.5">
                                    <img src={attachedImage.base64} alt="Attached work" className="w-10 h-10 object-cover rounded-xl border border-[#CBD5E1]" />
                                    <div>
                                        <p className="text-xs font-bold text-[#0F172A]">Photo Attached</p>
                                        <p className="text-[10px] text-[#64748B]">Tap mic to ask your question</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => handleStudentInterruptionQuestion('Please inspect my handwritten problem in this attached photo.', attachedImage)}
                                        className="px-3 py-1.5 bg-[#0066FF] hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                                    >
                                        Ask
                                    </button>
                                    <button
                                        onClick={() => setAttachedImage(null)}
                                        className="w-7 h-7 rounded-xl bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center text-xs text-[#0F172A] cursor-pointer"
                                    >
                                        <i className="bi bi-x-lg text-xs"></i>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Centered Video-Style Controls ── */}
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handlePreviousBoard}
                                    disabled={isGeneratingLesson || boardIndex === 0}
                                    title="Previous board"
                                    className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#F1F5F9] hover:bg-[#E3E9F1] border border-[#E3E9F1] text-[#0F172A] disabled:opacity-40 transition-all active:scale-95 cursor-pointer shadow-2xs"
                                >
                                    <i className="bi bi-chevron-left text-base"></i>
                                </button>
                                <button
                                    onClick={handleRestartBoard}
                                    disabled={isGeneratingLesson || isTtsLoading}
                                    title="Replay current board"
                                    className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#F1F5F9] hover:bg-[#E3E9F1] border border-[#E3E9F1] text-[#0F172A] transition-all active:scale-95 cursor-pointer shadow-2xs"
                                >
                                    <i className="bi bi-arrow-counterclockwise text-base"></i>
                                </button>
                            </div>

                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <button
                                    onClick={togglePauseAI}
                                    disabled={isTtsLoading || !lessonPlan}
                                    title={isSpeaking ? "Pause speech" : "Resume speech"}
                                    className={`flex items-center justify-center w-11 h-11 rounded-2xl border transition-all cursor-pointer shadow-xs active:scale-95 ${
                                        isSpeaking ? 'bg-blue-50 border-blue-200 text-[#0066FF]' : 'bg-[#F1F5F9] border-[#E3E9F1] text-[#64748B]'
                                    }`}
                                >
                                    <i className={`bi ${isSpeaking ? 'bi-pause-fill text-lg' : 'bi-play-fill text-xl'}`}></i>
                                </button>

                                {/* Center Mic Button (Interrupts and asks Question) */}
                                <button
                                    onClick={toggleMic}
                                    disabled={isGeneratingLesson || !lessonPlan}
                                    title={isMicListening ? "Listening... Click to send" : "Tap mic to pause video and ask a question"}
                                    className={`flex items-center justify-center w-14 h-14 rounded-2xl font-bold transition-all cursor-pointer shadow-lg active:scale-95 ${
                                        isMicListening 
                                            ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-500/30' 
                                            : 'bg-[#0066FF] hover:bg-blue-700 text-white shadow-blue-500/20 ring-2 ring-blue-400/30'
                                    }`}
                                >
                                    <i className={`bi ${isMicListening ? 'bi-mic-fill' : 'bi-mic'} text-2xl`}></i>
                                </button>

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    type="button"
                                    title="Snap or upload picture of your work"
                                    className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#F1F5F9] hover:bg-[#E3E9F1] border border-[#E3E9F1] text-[#0F172A] transition-all cursor-pointer shadow-2xs active:scale-95"
                                >
                                    <i className="bi bi-camera text-lg"></i>
                                </button>
                            </div>

                            <button
                                onClick={handleAdvanceNextBoard}
                                disabled={isGeneratingLesson || isTtsLoading}
                                title="Next board"
                                className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#F1F5F9] hover:bg-[#E3E9F1] border border-[#E3E9F1] text-[#0F172A] transition-all active:scale-95 cursor-pointer shadow-2xs"
                            >
                                <i className="bi bi-chevron-right text-base"></i>
                            </button>

                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                accept="image/*"
                                className="hidden"
                            />
                        </div>
                    </div>
                </main>
            )}

            {/* ── Diagram Zoom Modal ──────────────────────────────────── */}
            {isDiagramZoomed && activeDiagramSvg && (
                <div
                    onClick={() => setIsDiagramZoomed(false)}
                    className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 cursor-pointer animate-fade-in"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white border-2 border-[#E3E9F1] rounded-3xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl flex flex-col gap-4 relative cursor-default text-[#0F172A] max-h-[92vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between border-b border-[#E3E9F1] pb-3">
                            <div className="flex items-center gap-2">
                                <i className="bi bi-diagram-3-fill text-[#0066FF] text-lg"></i>
                                <h3 className="font-bold text-base text-[#0F172A]">Detailed Academic Visual</h3>
                            </div>
                            <button
                                onClick={() => setIsDiagramZoomed(false)}
                                className="w-8 h-8 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] flex items-center justify-center cursor-pointer transition-colors"
                            >
                                <i className="bi bi-x-lg text-xs"></i>
                            </button>
                        </div>
                        <div
                            className="w-full flex items-center justify-center p-4 sm:p-6 bg-[#F8FAFC] rounded-2xl border border-[#E3E9F1] overflow-auto [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[65vh]"
                            dangerouslySetInnerHTML={{ __html: activeDiagramSvg }}
                        />
                    </div>
                </div>
            )}

            {/* ── Scanned Problem Image Modal ──────────────────────────── */}
            {showScannedImageModal && sessionData?.image && (
                <div
                    onClick={() => setShowScannedImageModal(false)}
                    className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer animate-fade-in"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white border border-[#E3E9F1] rounded-3xl p-5 max-w-2xl w-full max-h-[88vh] shadow-2xl flex flex-col gap-3 relative cursor-default text-[#0F172A]"
                    >
                        <div className="flex items-center justify-between border-b border-[#E3E9F1] pb-3">
                            <h3 className="font-bold text-sm text-[#0F172A] flex items-center gap-2">
                                <i className="bi bi-image text-[#0066FF]"></i>
                                <span>Original Scanned Problem</span>
                            </h3>
                            <button
                                onClick={() => setShowScannedImageModal(false)}
                                className="w-8 h-8 rounded-full bg-[#F1F5F9] text-[#0F172A] flex items-center justify-center cursor-pointer hover:bg-[#E2E8F0]"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto flex items-center justify-center bg-black/5 rounded-2xl p-2 max-h-[62vh]">
                            <img src={sessionData.image} alt="Scanned problem" className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-md" />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Limit Exceeded Modal ─────────────────────────────────── */}
            <LimitExceededModal
                isOpen={showLimitModal}
                onClose={() => setShowLimitModal(false)}
                cost={limitModalData.cost}
                balance={limitModalData.balance}
                onNavigate={onNavigate}
            />
        </div>
    );
};

export default VoiceTutorialPage;
