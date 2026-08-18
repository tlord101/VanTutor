import React, { useState, useEffect, useRef, useCallback } from 'react';
import { readCachedJson, writeCachedJson } from '../utils/cache';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { GoogleGenAI } from '@google/genai';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import type { UserProfile, Course, Topic } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// ── Constants ────────────────────────────────────────────────────────────────
const TUTOR_VOICE = 'Charon';
const MAX_BOARD_LINES = 5;
const LINE_STREAM_MS = 340;

// ── Sub-step ordering ────────────────────────────────────────────────────────
type SubStep = 'definition' | 'formula' | 'intuition' | 'example_1' | 'example_2' | 'pitfalls' | 'summary';
const SUB_STEP_ORDER: SubStep[] = ['definition', 'formula', 'intuition', 'example_1', 'example_2', 'pitfalls', 'summary'];

const SUB_STEP_LABEL: Record<SubStep, string> = {
    definition:  '📌 Definition',
    formula:     '📐 Formula',
    intuition:   '💡 Intuition',
    example_1:   '✏️ Worked Example',
    example_2:   '🔥 Challenge Problem',
    pitfalls:    '⚠️ Common Pitfalls',
    summary:     '✅ Summary',
};

// ── Types ────────────────────────────────────────────────────────────────────
interface VoiceTutorialSessionData {
    course: Course;
    topic?: Topic | null;
}

interface BlueprintVariable { symbol: string; meaning: string; unit?: string; }
interface BlueprintExample  { problem: string; solution: string[]; answer: string; }

interface BlueprintConcept {
    conceptName:    string;
    keyDefinition:  string;
    formula:        string | null;
    variables:      BlueprintVariable[];
    intuitionNote:  string;
    example1:       BlueprintExample;
    example2:       BlueprintExample;
    commonPitfalls: string[];
    summaryPoints:  string[];
    diagramSvg?:    string | null;
    tableMarkdown?: string | null;
    diagramCaption?: string;
}

interface LessonBlueprint {
    overview:       string;
    concepts:       BlueprintConcept[];
    overallSummary: string;
}

interface TutorialProgress { conceptIdx: number; subStep: SubStep; }

interface UnitPresentationResponse {
    boardLines: string[];
    spokenExplanation: string;
    diagramSvg?: string | null;
    tableMarkdown?: string | null;
    diagramCaption?: string;
}

interface VoiceTutorialPageProps {
    userProfile?:  UserProfile | null;
    appSettings?:  any;
    onNavigate?:   (tab: string) => void;
}

// ── Pure helpers & Visual Diagram Generators ─────────────────────────────────

/**
 * Sanitizes and normalizes an SVG string for rendering on the board.
 */
function sanitizeSvg(rawSvg: string | null | undefined): string | null {
    if (!rawSvg || typeof rawSvg !== 'string') return null;
    let cleaned = rawSvg.trim();
    // Strip markdown code fences if model returned them
    cleaned = cleaned.replace(/^```(?:xml|svg|html)?\s*/i, '').replace(/```$/i, '').trim();

    // Extract <svg ... </svg> if wrapped with additional text
    const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
    if (match) {
        cleaned = match[0];
    } else if (!cleaned.startsWith('<svg')) {
        return null;
    }

    // Ensure responsive attributes and proper viewBox
    if (!cleaned.includes('viewBox')) {
        cleaned = cleaned.replace(/<svg/i, '<svg viewBox="0 0 400 220"');
    }
    if (!cleaned.includes('xmlns=')) {
        cleaned = cleaned.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    return cleaned;
}

/**
 * Generate procedural fallback diagrams and tables for academic concepts when offline or AI doesn't provide one.
 */
function getFallbackVisual(concept: BlueprintConcept, step: SubStep): { diagramSvg: string | null; tableMarkdown: string | null; caption?: string } {
    const textContext = `${concept.conceptName} ${concept.keyDefinition} ${concept.formula || ''} ${concept.intuitionNote}`.toLowerCase();

    // 1. Markdown Table for formulas and variables
    if (step === 'formula' && concept.variables && concept.variables.length > 0) {
        const rows = concept.variables.map(v => `| \`${v.symbol}\` | ${v.meaning} | ${v.unit || 'SI unit'} |`).join('\n');
        const tableMarkdown = `| Symbol | Variable / Property | Unit |\n| :--- | :--- | :--- |\n${rows}`;
        return { diagramSvg: null, tableMarkdown, caption: `${concept.conceptName} — Variables Reference` };
    }

    // 2. Physics / Mechanics / Force Diagram (Free-body diagram)
    if (textContext.includes('force') || textContext.includes('newton') || textContext.includes('friction') || textContext.includes('motion') || textContext.includes('mass') || textContext.includes('accel')) {
        const svg = `<svg viewBox="0 0 380 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8B4513" />
    </marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2B6CB0" />
    </marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#C53030" />
    </marker>
  </defs>
  <!-- Surface -->
  <line x1="30" y1="140" x2="350" y2="140" stroke="#7A6B5C" stroke-width="2.5" stroke-dasharray="6,4" />
  <!-- Ground hashes -->
  <line x1="50" y1="140" x2="40" y2="152" stroke="#A09080" stroke-width="1.5" />
  <line x1="100" y1="140" x2="90" y2="152" stroke="#A09080" stroke-width="1.5" />
  <line x1="150" y1="140" x2="140" y2="152" stroke="#A09080" stroke-width="1.5" />
  <line x1="200" y1="140" x2="190" y2="152" stroke="#A09080" stroke-width="1.5" />
  <line x1="250" y1="140" x2="240" y2="152" stroke="#A09080" stroke-width="1.5" />
  <line x1="300" y1="140" x2="290" y2="152" stroke="#A09080" stroke-width="1.5" />
  <!-- Mass Box -->
  <rect x="140" y="80" width="100" height="60" rx="6" fill="#F4ECE2" stroke="#5A3E22" stroke-width="2.5" />
  <text x="190" y="115" font-family="sans-serif" font-size="16" font-weight="bold" fill="#3D2817" text-anchor="middle">m</text>
  <!-- Normal Force (Up) -->
  <line x1="190" y1="80" x2="190" y2="25" stroke="#2B6CB0" stroke-width="2.5" marker-end="url(#arrow-blue)" />
  <text x="202" y="35" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2B6CB0">N (Normal)</text>
  <!-- Gravity (Down) -->
  <line x1="190" y1="140" x2="190" y2="195" stroke="#C53030" stroke-width="2.5" marker-end="url(#arrow-red)" />
  <text x="202" y="190" font-family="sans-serif" font-size="13" font-weight="bold" fill="#C53030">W = mg</text>
  <!-- Applied Force (Right) -->
  <line x1="240" y1="110" x2="330" y2="110" stroke="#8B4513" stroke-width="2.5" marker-end="url(#arrow)" />
  <text x="285" y="100" font-family="sans-serif" font-size="13" font-weight="bold" fill="#8B4513">F_applied</text>
  <!-- Friction (Left) -->
  <line x1="140" y1="130" x2="70" y2="130" stroke="#8B4513" stroke-width="2" marker-end="url(#arrow)" />
  <text x="105" y="122" font-family="sans-serif" font-size="12" font-weight="bold" fill="#8B4513">f_friction</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Free-Body Force Diagram' };
    }

    // 3. Geometry / Trigonometry (Right-angled triangle)
    if (textContext.includes('triangle') || textContext.includes('trigonometry') || textContext.includes('pythagor') || textContext.includes('angle') || textContext.includes('sine') || textContext.includes('cosine')) {
        const svg = `<svg viewBox="0 0 380 200" xmlns="http://www.w3.org/2000/svg">
  <!-- Triangle -->
  <polygon points="60,160 300,160 300,40" fill="#F4ECE2" stroke="#8B4513" stroke-width="2.5" stroke-linejoin="round" />
  <!-- Right Angle Square -->
  <polyline points="280,160 280,140 300,140" fill="none" stroke="#8B4513" stroke-width="1.8" />
  <!-- Angle theta arc -->
  <path d="M 110,160 A 50,50 0 0,0 95,140" fill="none" stroke="#2B6CB0" stroke-width="2" />
  <text x="115" y="152" font-family="sans-serif" font-size="15" font-weight="bold" fill="#2B6CB0">θ</text>
  <!-- Side Labels -->
  <text x="180" y="182" font-family="sans-serif" font-size="14" font-weight="bold" fill="#5A3E22" text-anchor="middle">Adjacent (b)</text>
  <text x="320" y="105" font-family="sans-serif" font-size="14" font-weight="bold" fill="#5A3E22">Opposite (a)</text>
  <text x="150" y="85" font-family="sans-serif" font-size="14" font-weight="bold" fill="#C53030" text-anchor="middle">Hypotenuse (c)</text>
  <!-- Formula -->
  <text x="60" y="30" font-family="monospace" font-size="13" font-weight="bold" fill="#8B4513">a² + b² = c²  |  sin θ = a/c</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Right-Angled Triangle & Trigonometric Relations' };
    }

    // 4. Mathematics / Calculus / Function Graph
    if (textContext.includes('graph') || textContext.includes('calculus') || textContext.includes('slope') || textContext.includes('derivative') || textContext.includes('curve') || textContext.includes('function')) {
        const svg = `<svg viewBox="0 0 380 200" xmlns="http://www.w3.org/2000/svg">
  <!-- Grid -->
  <line x1="50" y1="170" x2="350" y2="170" stroke="#7A6B5C" stroke-width="2" />
  <line x1="50" y1="170" x2="50" y2="20" stroke="#7A6B5C" stroke-width="2" />
  <!-- Arrows -->
  <polygon points="355,170 345,165 345,175" fill="#7A6B5C" />
  <polygon points="50,15 45,25 55,25" fill="#7A6B5C" />
  <text x="350" y="190" font-family="sans-serif" font-size="12" font-weight="bold" fill="#7A6B5C">x</text>
  <text x="30" y="25" font-family="sans-serif" font-size="12" font-weight="bold" fill="#7A6B5C">y</text>
  <!-- Parabola / Curve -->
  <path d="M 60,160 Q 180,150 240,70 T 330,30" fill="none" stroke="#2B6CB0" stroke-width="3" stroke-linecap="round" />
  <!-- Tangent line -->
  <line x1="160" y1="120" x2="300" y2="40" stroke="#C53030" stroke-width="2" stroke-dasharray="4,3" />
  <circle cx="230" cy="80" r="4" fill="#C53030" />
  <text x="240" y="75" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C53030">Slope = dy/dx</text>
  <text x="180" y="188" font-family="monospace" font-size="12" font-weight="bold" fill="#2B6CB0">f(x) curve</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Function Curve & Tangent Slope' };
    }

    // 5. General concept overview table fallback
    if (step === 'summary') {
        const tableMarkdown = `| Key Concept | Summary Takeaway |\n| :--- | :--- |\n| **Core Idea** | ${concept.keyDefinition.slice(0, 70)}... |\n| **Application** | ${concept.summaryPoints[0] || 'Key principle'} |\n| **Beware** | ${concept.commonPitfalls[0] || 'Common pitfall'} |`;
        return { diagramSvg: null, tableMarkdown, caption: `${concept.conceptName} — Summary Matrix` };
    }

    return { diagramSvg: null, tableMarkdown: null };
}

function getBoardLines(concept: BlueprintConcept, step: SubStep): string[] {
    switch (step) {
        case 'definition': {
            const defLines: string[] = [concept.conceptName];
            const sentences = concept.keyDefinition.match(/[^.!?]+[.!?]*/g) || [concept.keyDefinition];
            sentences.slice(0, 3).forEach(s => defLines.push(s.trim()));
            return defLines.slice(0, MAX_BOARD_LINES);
        }
        case 'formula': {
            if (!concept.formula) return [];
            const fl: string[] = [concept.formula];
            (concept.variables || []).forEach(v => fl.push(`  ${v.symbol}  →  ${v.meaning}`));
            return fl.slice(0, MAX_BOARD_LINES);
        }
        case 'intuition':
            return ['Intuition', concept.intuitionNote].slice(0, MAX_BOARD_LINES);
        case 'example_1':
            return [`Example: ${concept.example1.problem}`, ...concept.example1.solution.slice(0, 4)].slice(0, MAX_BOARD_LINES);
        case 'example_2':
            return [`Challenge: ${concept.example2.problem}`, ...concept.example2.solution.slice(0, 4)].slice(0, MAX_BOARD_LINES);
        case 'pitfalls':
            return ['Common Pitfalls', ...(concept.commonPitfalls || []).slice(0, 4)].slice(0, MAX_BOARD_LINES);
        case 'summary':
            return [`${concept.conceptName} — Summary`, ...(concept.summaryPoints || []).slice(0, 4)].slice(0, MAX_BOARD_LINES);
        default:
            return [];
    }
}

function getSpokenText(concept: BlueprintConcept, step: SubStep): string {
    const varSpeak = (concept.variables || [])
        .map(v => `${v.symbol} stands for ${v.meaning}`)
        .join('. ');

    switch (step) {
        case 'definition':
            return `Let us talk about ${concept.conceptName}. ${concept.keyDefinition} Does that definition make sense to you so far?`;
        case 'formula':
            return `Look at the board. Here is the key equation for ${concept.conceptName}. ${varSpeak ? `Where ${varSpeak}.` : ''} Take a moment to look at how these variables relate. What do you notice?`;
        case 'intuition':
            return `Here is the physical intuition behind this. ${concept.intuitionNote} Can you think of a real-world situation where you have experienced something like this?`;
        case 'example_1':
            return `Let me walk you through a standard example. The problem is: ${concept.example1.problem}. ${concept.example1.solution.join('. Then, ')}. Our final answer is ${concept.example1.answer}. Did you follow each step?`;
        case 'example_2':
            return `Now let us try a more challenging version. ${concept.example2.problem}. ${concept.example2.solution.join('. Next, ')}. The answer is ${concept.example2.answer}. Notice how this builds on what we just did. Can you see what changed?`;
        case 'pitfalls':
            return `Before we move on, let me highlight the most common mistakes students make here. ${(concept.commonPitfalls || []).join('. Also watch out for: ')}. Have you made any of these before?`;
        case 'summary':
            return `Excellent! Let us lock in what we just learned about ${concept.conceptName}. ${(concept.summaryPoints || []).join('. Also remember: ')}. Are you ready to move on to the next concept?`;
        default:
            return '';
    }
}

interface SuggestionPill {
    type: 'answer' | 'question' | 'explore';
    label: string;
    text: string;
}

function getSuggestions(step: SubStep): [SuggestionPill, SuggestionPill, SuggestionPill] {
    const map: Record<SubStep, [SuggestionPill, SuggestionPill, SuggestionPill]> = {
        definition: [
            { type: 'answer',   label: 'Answer',  text: "I understand, let's continue" },
            { type: 'question', label: 'Ask',     text: "Can you explain that again?" },
            { type: 'explore',  label: 'Explore', text: "Where is this applied in real life?" },
        ],
        formula: [
            { type: 'answer',   label: 'Answer',  text: "I understand the formula" },
            { type: 'question', label: 'Ask',     text: "Why are these variables related this way?" },
            { type: 'explore',  label: 'Explore', text: "Show units & dimensional analysis" },
        ],
        intuition: [
            { type: 'answer',   label: 'Answer',  text: "The physical intuition makes sense" },
            { type: 'question', label: 'Ask',     text: "Can you give another analogy?" },
            { type: 'explore',  label: 'Explore', text: "What happens in extreme cases?" },
        ],
        example_1: [
            { type: 'answer',   label: 'Answer',  text: "I followed the worked steps" },
            { type: 'question', label: 'Ask',     text: "Why did we take that calculation step?" },
            { type: 'explore',  label: 'Explore', text: "Give me a harder variation" },
        ],
        example_2: [
            { type: 'answer',   label: 'Answer',  text: "I understand this challenge solution" },
            { type: 'question', label: 'Ask',     text: "What if the initial values were different?" },
            { type: 'explore',  label: 'Explore', text: "How does this connect to exams?" },
        ],
        pitfalls: [
            { type: 'answer',   label: 'Answer',  text: "Understood, I will watch out" },
            { type: 'question', label: 'Ask',     text: "Why is this mistake commonly made?" },
            { type: 'explore',  label: 'Explore', text: "Show an example of this mistake" },
        ],
        summary: [
            { type: 'answer',   label: 'Answer',  text: "Ready for the next concept!" },
            { type: 'question', label: 'Ask',     text: "Could you recap the main rule?" },
            { type: 'explore',  label: 'Explore', text: "Test me with a quick practice question" },
        ],
    };
    return map[step];
}

function nextSubStep(
    cIdx: number,
    sStep: SubStep,
    blueprint: LessonBlueprint
): { conceptIdx: number; subStep: SubStep; done: boolean } {
    const currentStepIdx = SUB_STEP_ORDER.indexOf(sStep);
    let nextIdx = currentStepIdx + 1;

    // Advance within current concept, skipping formula if none
    while (nextIdx < SUB_STEP_ORDER.length) {
        const candidate = SUB_STEP_ORDER[nextIdx];
        const concept = blueprint.concepts[cIdx];
        if (candidate === 'formula' && !concept?.formula) {
            nextIdx++;
        } else {
            break;
        }
    }

    if (nextIdx < SUB_STEP_ORDER.length) {
        return { conceptIdx: cIdx, subStep: SUB_STEP_ORDER[nextIdx], done: false };
    }

    // Move to next concept
    const nextConceptIdx = cIdx + 1;
    if (nextConceptIdx >= blueprint.concepts.length) {
        return { conceptIdx: cIdx, subStep: 'summary', done: true };
    }
    return { conceptIdx: nextConceptIdx, subStep: 'definition', done: false };
}

// ── Component ─────────────────────────────────────────────────────────────────
export const VoiceTutorialPage: React.FC<VoiceTutorialPageProps> = ({
    userProfile,
    appSettings: propAppSettings,
    onNavigate,
}) => {
    const { settings: hookAppSettings } = useAppSettings();
    const appSettings = propAppSettings || hookAppSettings;
    const { addToast } = useToast();

    // ── Session ──────────────────────────────────────────────────────────
    const [sessionData, setSessionData] = useState<VoiceTutorialSessionData | null>(null);

    // ── Blueprint ────────────────────────────────────────────────────────
    const [blueprint, setBlueprint] = useState<LessonBlueprint | null>(null);
    const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);
    const [blueprintGenStep, setBlueprintGenStep] = useState('');

    // ── Teaching position ────────────────────────────────────────────────
    const [conceptIdx, setConceptIdx] = useState(0);
    const [subStep, setSubStep] = useState<SubStep>('definition');
    const [suggestions, setSuggestions] = useState<[SuggestionPill, SuggestionPill, SuggestionPill]>(getSuggestions('definition'));
    const [isDone, setIsDone] = useState(false);

    // ── Board ────────────────────────────────────────────────────────────
    const [visibleBoardLines, setVisibleBoardLines] = useState<string[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isLoadingUnit, setIsLoadingUnit] = useState(false); // AI generating board content
    const [activeDiagramSvg, setActiveDiagramSvg] = useState<string | null>(null);
    const [activeTableMarkdown, setActiveTableMarkdown] = useState<string | null>(null);
    const [activeVisualCaption, setActiveVisualCaption] = useState<string | null>(null);
    const [diagramKey, setDiagramKey] = useState(0);
    const [isDiagramZoomed, setIsDiagramZoomed] = useState(false);

    // ── Audio / mic / input ──────────────────────────────────────────────
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isTtsLoading, setIsTtsLoading] = useState(false);
    const [isMicListening, setIsMicListening] = useState(false);
    const [speechRate, setSpeechRate] = useState(1.0);
    const [textInput, setTextInput] = useState('');

    // ── Navigation ───────────────────────────────────────────────────────
    const [isNavigatingBack, setIsNavigatingBack] = useState(false);

    // ── Refs ─────────────────────────────────────────────────────────────
    const isActiveRef        = useRef(true);   // prevents ghost updates after navigate/unmount
    const hasStartedRef      = useRef(false);  // prevents double-trigger of first present
    const conceptIdxRef      = useRef(0);
    const subStepRef         = useRef<SubStep>('definition');
    const audioContextRef    = useRef<AudioContext | null>(null);
    const currentAudioRef    = useRef<AudioBufferSourceNode | null>(null);
    const recognitionRef     = useRef<any>(null);
    const spokenTextRef      = useRef('');
    const lastSpokenTextRef  = useRef('');
    const streamTimersRef    = useRef<ReturnType<typeof setTimeout>[]>([]);
    const blueprintKeyRef    = useRef('');
    const progressKeyRef     = useRef('');
    const [micDisplay, setMicDisplay] = useState('');

    // ── Unmount / navigate cleanup ────────────────────────────────────────
    useEffect(() => {
        isActiveRef.current = true;
        return () => {
            isActiveRef.current = false;
            stopAudioImmediate();
            clearAllStreamTimers();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            stopMicImmediate();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Load session data ─────────────────────────────────────────────────
    useEffect(() => {
        const stored = readCachedJson<VoiceTutorialSessionData | null>('avelut_active_voice_tutorial', null);
        if (stored?.course) {
            setSessionData(stored);
        } else {
            setSessionData({
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
            });
        }
    }, [userProfile?.level]);

    // ── Compute cache keys when session loads ─────────────────────────────
    useEffect(() => {
        if (!sessionData) return;
        const uid  = userProfile?.uid || 'anon';
        const cid  = sessionData.course?.course_id  || 'general';
        const tid  = sessionData.topic?.topic_id    || 'core';
        blueprintKeyRef.current = `vt_blueprint_${uid}_${cid}_${tid}`;
        progressKeyRef.current  = `vt_progress_${uid}_${cid}_${tid}`;
    }, [sessionData, userProfile]);

    // ── Load / generate blueprint once session is ready ───────────────────
    useEffect(() => {
        if (!sessionData || hasStartedRef.current) return;
        hasStartedRef.current = true;
        void bootstrapSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionData]);

    // ─────────────────────────────────────────────────────────────────────────
    // Audio helpers
    // ─────────────────────────────────────────────────────────────────────────
    function stopAudioImmediate() {
        if (currentAudioRef.current) {
            try { currentAudioRef.current.stop(); } catch (_) {}
            currentAudioRef.current = null;
        }
        setIsSpeaking(false);
    }

    function stopMicImmediate() {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
        }
        setIsMicListening(false);
    }

    function clearAllStreamTimers() {
        streamTimersRef.current.forEach(t => clearTimeout(t));
        streamTimersRef.current = [];
    }

    const getAudioCtx = useCallback((): AudioContext => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return audioContextRef.current;
    }, []);

    const pcm16ToAudioBuffer = useCallback(async (b64: string, ctx: AudioContext): Promise<AudioBuffer> => {
        const bin  = atob(b64);
        const raw  = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
        const n    = raw.length / 2;
        const buf  = ctx.createBuffer(1, n, 24000);
        const ch   = buf.getChannelData(0);
        const view = new DataView(raw.buffer);
        for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
        return buf;
    }, []);

    const startMicListening = useCallback(() => {
        if (!isActiveRef.current) return;
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        stopMicImmediate();
        try {
            const rec = new SR();
            rec.continuous      = false;
            rec.interimResults  = true;
            rec.lang            = 'en-US';
            rec.onstart  = () => {
                if (isActiveRef.current) {
                    setIsMicListening(true);
                    setMicDisplay('');
                    spokenTextRef.current = '';
                }
            };
            rec.onresult = (e: any) => {
                const t = Array.from(e.results).map((r: any) => r[0].transcript).join('');
                spokenTextRef.current = t;
                if (isActiveRef.current) setMicDisplay(t);
            };
            rec.onend = () => {
                if (!isActiveRef.current) return;
                setIsMicListening(false);
                const final = spokenTextRef.current.trim();
                spokenTextRef.current = '';
                setMicDisplay('');
                if (final.length > 2) void handleStudentReply(final);
            };
            rec.onerror = () => { if (isActiveRef.current) setIsMicListening(false); };
            recognitionRef.current = rec;
            rec.start();
        } catch (_) { setIsMicListening(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const browserSpeak = useCallback((text: string, onEnd?: () => void) => {
        if (!('speechSynthesis' in window)) {
            onEnd?.();
            startMicListening();
            return;
        }
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate  = speechRate;
        const vs  = window.speechSynthesis.getVoices();
        const v   = vs.find(v => v.lang.startsWith('en') && v.name.includes('Google'))
                 || vs.find(v => v.lang.startsWith('en'));
        if (v) utt.voice = v;
        utt.onstart = () => { if (isActiveRef.current) { setIsSpeaking(true); setIsPaused(false); } };
        utt.onend   = () => {
            if (isActiveRef.current) {
                setIsSpeaking(false);
                setIsPaused(false);
                onEnd?.();
                // Auto-activate microphone immediately when teacher finishes talking!
                startMicListening();
            }
        };
        utt.onerror = () => { if (isActiveRef.current) { setIsSpeaking(false); setIsPaused(false); } };
        setIsSpeaking(true);
        setIsPaused(false);
        window.speechSynthesis.speak(utt);
    }, [speechRate, startMicListening]);

    const speakText = useCallback(async (text: string, onEnd?: () => void): Promise<void> => {
        if (!isActiveRef.current || isMuted || !text) {
            onEnd?.();
            if (!isMuted) startMicListening();
            return;
        }
        stopAudioImmediate();
        setIsTtsLoading(true);
        setIsPaused(false);
        lastSpokenTextRef.current = text;

        const clean = text
            .replace(/\$\$([\s\S]*?)\$\$/g, '[formula on board]')
            .replace(/\$([^\$]+)\$/g, '$1')
            .replace(/[#*`_~]/g, '')
            .trim();

        const usePersonal = !!(userProfile?.use_personal_token && userProfile?.personal_api_key?.trim());
        const apiKey = usePersonal
            ? userProfile!.personal_api_key!.trim()
            : (appSettings?.gemini_api_key?.trim() || '');

        if (!apiKey) { setIsTtsLoading(false); browserSpeak(clean, onEnd); return; }

        try {
            const tts = new GoogleGenAI({ apiKey });
            const res = await tts.models.generateContent({
                model: 'gemini-2.5-flash-preview-tts',
                contents: [{ role: 'user', parts: [{ text: clean }] }],
                config: {
                    responseModalities: ['AUDIO'] as any,
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: TUTOR_VOICE } }
                    },
                },
            });

            if (!isActiveRef.current) return;

            const inlineData = res?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (!inlineData?.data) throw new Error('no audio data');

            const ctx    = getAudioCtx();
            if (ctx.state === 'suspended') await ctx.resume();
            const abuf   = await pcm16ToAudioBuffer(inlineData.data, ctx);
            const src    = ctx.createBufferSource();
            src.buffer         = abuf;
            src.playbackRate.value = speechRate;
            src.connect(ctx.destination);
            src.onended = () => {
                if (isActiveRef.current) {
                    setIsSpeaking(false);
                    setIsPaused(false);
                    currentAudioRef.current = null;
                    onEnd?.();
                    // Auto-activate microphone immediately when teacher finishes talking!
                    startMicListening();
                }
            };
            currentAudioRef.current = src;
            setIsTtsLoading(false);
            if (isActiveRef.current) {
                setIsSpeaking(true);
                setIsPaused(false);
            }
            src.start(0);
        } catch (err) {
            console.warn('[TTS] fallback:', err);
            if (!isActiveRef.current) return;
            setIsTtsLoading(false);
            browserSpeak(clean, onEnd);
        }
    }, [isMuted, speechRate, userProfile, appSettings, getAudioCtx, pcm16ToAudioBuffer, browserSpeak, startMicListening]);

    // ─────────────────────────────────────────────────────────────────────────
    // Board streaming
    // ─────────────────────────────────────────────────────────────────────────
    const streamBoardLines = useCallback((lines: string[]) => {
        clearAllStreamTimers();
        setVisibleBoardLines([]);
        setIsStreaming(true);

        let displayed: string[] = [];
        let idx = 0;

        const tick = () => {
            if (!isActiveRef.current) return;
            if (idx >= lines.length) { setIsStreaming(false); return; }
            if (displayed.length >= MAX_BOARD_LINES) {
                displayed = [];
                setVisibleBoardLines([]);
            }
            displayed.push(lines[idx]);
            setVisibleBoardLines([...displayed]);
            idx++;
            const t = setTimeout(tick, LINE_STREAM_MS);
            streamTimersRef.current.push(t);
        };
        tick();
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Blueprint generation
    // ─────────────────────────────────────────────────────────────────────────
    const generateBlueprint = useCallback(async (session: VoiceTutorialSessionData): Promise<LessonBlueprint | null> => {
        setIsGeneratingBlueprint(true);
        setBlueprintGenStep('Analysing topic...');

        const aiClient = createAvelutAI(appSettings, userProfile || null);
        if (!aiClient) { setIsGeneratingBlueprint(false); return null; }

        const courseName = session.course.course_name;
        const topicName  = session.topic?.topic_name || 'Core Concepts';
        const level      = session.course.level || 'University';

        setBlueprintGenStep('Building visual lesson plan...');

        const prompt = `You are AVELUT Curriculum Designer. Create a comprehensive, structured lesson blueprint for a visual + voice blackboard AI tutor capable of drawing diagrams, shapes, illustrations, and structured tables.

Course: "${courseName}"
Topic: "${topicName}"
Student Level: ${level}

Generate a lesson blueprint as valid JSON ONLY — no explanation, no markdown fences.

BLUEPRINT REQUIREMENTS:
- Include 2–4 key concepts depending on topic complexity
- Each concept must have: definition, formula (or null), variables, intuition, two worked examples, pitfalls, summary
- Formulas must be LaTeX strings: e.g. "$$F = ma$$" or "$$v = \\frac{d}{t}$$"
- variables: list symbol, meaning, and standard unit if applicable
- example1 = standard problem, example2 = harder variant (add friction, incline, multi-step etc.)
- solution arrays: each string is ONE step of the working (max 4 steps)
- commonPitfalls: 2–3 specific student mistakes for this concept
- summaryPoints: 2–3 key takeaway lines
- diagramSvg: If this concept benefits from a visual diagram (e.g. physics free-body, geometric shape, graph, circuit, chemical structure, flowchart), include a valid, clean SVG string with viewBox="0 0 380 200" and warm sepia tones (#8B4513, #2B6CB0, #C53030, #5A3E22). Otherwise null.
- tableMarkdown: If comparison or variable matrix is helpful, include a clean Markdown table. Otherwise null.

{
  "overview": "2-3 sentence overview of what the student will learn",
  "concepts": [
    {
      "conceptName": "Short name (2-5 words)",
      "keyDefinition": "Clear, simple 1-2 sentence definition",
      "formula": "$$LaTeX formula$$ or null",
      "variables": [
        {"symbol": "F", "meaning": "Force in Newtons", "unit": "N"}
      ],
      "intuitionNote": "Real-world physical intuition in 1-2 sentences.",
      "example1": {
        "problem": "A 5 kg box is pushed with 20 N. Find acceleration.",
        "solution": ["Identify: F = 20 N, m = 5 kg", "Apply: a = F/m = 20/5", "Calculate: a = 4 m/s²"],
        "answer": "4 m/s²"
      },
      "example2": {
        "problem": "Same box on a surface with μ = 0.3. Find net acceleration.",
        "solution": ["Find friction: f = μmg = 0.3 × 5 × 10 = 15 N", "Net force: F_net = 20 - 15 = 5 N", "Apply: a = F_net/m = 5/5 = 1 m/s²"],
        "answer": "1 m/s²"
      },
      "commonPitfalls": [
        "Forgetting to subtract friction from applied force"
      ],
      "summaryPoints": [
        "Newton's 2nd Law: F = ma links force, mass and acceleration"
      ],
      "diagramSvg": null,
      "tableMarkdown": null
    }
  ],
  "overallSummary": "1–2 sentence closing remark about the full topic"
}`;

        try {
            setBlueprintGenStep('Generating lesson content...');
            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { responseMimeType: 'application/json', temperature: 0.4 },
            });
            const raw = getResponseText(result);
            if (!raw) throw new Error('empty blueprint response');
            const bp: LessonBlueprint = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
            setIsGeneratingBlueprint(false);
            return bp;
        } catch (err) {
            console.error('[Blueprint] generation failed:', err);
            addToast('Failed to generate lesson blueprint. Please try again.', 'error');
            setIsGeneratingBlueprint(false);
            return null;
        }
    }, [appSettings, userProfile, addToast]);

    // ─────────────────────────────────────────────────────────────────────────
    // Session bootstrap — load or generate blueprint, restore progress
    // ─────────────────────────────────────────────────────────────────────────
    const bootstrapSession = useCallback(async () => {
        if (!sessionData) return;

        const uid   = userProfile?.uid || 'anon';
        const cid   = sessionData.course?.course_id  || 'general';
        const tid   = sessionData.topic?.topic_id    || 'core';
        const bpKey = `vt_blueprint_${uid}_${cid}_${tid}`;
        const prKey = `vt_progress_${uid}_${cid}_${tid}`;
        blueprintKeyRef.current = bpKey;
        progressKeyRef.current  = prKey;

        // 1. Load blueprint from cache (instant)
        let bp = readCachedJson<LessonBlueprint | null>(bpKey, null);

        if (!bp) {
            // 2. Generate blueprint
            bp = await generateBlueprint(sessionData);
            if (!bp || !isActiveRef.current) return;
            // Save blueprint to cache (SQLite + localStorage)
            writeCachedJson(bpKey, bp, uid);
        }

        if (!isActiveRef.current) return;
        setBlueprint(bp);

        // 3. Restore progress
        const saved = readCachedJson<TutorialProgress | null>(prKey, null);
        let startConceptIdx = 0;
        let startSubStep: SubStep = 'definition';

        if (saved && saved.conceptIdx < bp.concepts.length) {
            startConceptIdx = saved.conceptIdx;
            startSubStep    = saved.subStep;
        }

        conceptIdxRef.current = startConceptIdx;
        subStepRef.current    = startSubStep;
        setConceptIdx(startConceptIdx);
        setSubStep(startSubStep);
        setSuggestions(getSuggestions(startSubStep));

        // 4. Start teaching
        await presentUnit(bp, startConceptIdx, startSubStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionData, userProfile, generateBlueprint]);

    // ─────────────────────────────────────────────────────────────────────────
    // Present a specific unit — calls AI with blueprint as strict guide
    // ─────────────────────────────────────────────────────────────────────────
    const presentUnit = useCallback(async (
        bp: LessonBlueprint,
        cIdx: number,
        sStep: SubStep,
    ) => {
        if (!isActiveRef.current) return;

        const concept = bp.concepts[cIdx];
        if (!concept) {
            setIsDone(true);
            setVisibleBoardLines(['🎓 Topic Complete!', bp.overallSummary]);
            setActiveDiagramSvg(null);
            setActiveTableMarkdown(null);
            setActiveVisualCaption(null);
            void speakText(`Well done! ${bp.overallSummary} You have mastered this topic!`);
            return;
        }

        setSuggestions(getSuggestions(sStep));
        setIsLoadingUnit(true);
        setVisibleBoardLines([]);
        setActiveDiagramSvg(null);
        setActiveTableMarkdown(null);
        setActiveVisualCaption(null);

        // Save progress immediately
        writeCachedJson(progressKeyRef.current, { conceptIdx: cIdx, subStep: sStep }, userProfile?.uid || 'anon');

        // ── Sub-step instructions for the AI ──────────────────────────────
        const subStepInstructions: Record<SubStep, string> = {
            definition:
                `Teach the DEFINITION of "${concept.conceptName}".
- boardLines[0]: the concept name as a clear title.
- boardLines[1-3]: the definition broken into 1-3 short punchy lines. Plain English, no jargon.
- diagramSvg / tableMarkdown: If a visual shape, diagram, or table clarifies this concept (e.g. geometric shape, physics setup, comparison table), provide it.
- spokenExplanation: Warm introduction. State the definition conversationally. Explain why it matters. Refer to any visual on the board if applicable. End with a question to check understanding.`,

            formula:
                `Teach the FORMULA for "${concept.conceptName}".
Blueprint formula: ${concept.formula}
Blueprint variables: ${JSON.stringify(concept.variables)}
- boardLines[0]: the LaTeX formula exactly as given in the blueprint ($$...$$).
- boardLines[1-N]: each variable as "symbol  →  plain meaning" — one per line.
- tableMarkdown: Provide a structured Markdown table of variables, symbols, and SI units (or comparison).
- diagramSvg: If a visual diagram or labeled triangle/vector clarifies the formula, include it in diagramSvg.
- spokenExplanation: Tell the student to look at the board and formula/diagram. Explain what each symbol represents physically. Do NOT read raw LaTeX. End with a question.`,

            intuition:
                `Teach the PHYSICAL INTUITION for "${concept.conceptName}".
Blueprint intuition: "${concept.intuitionNote}"
- boardLines[0]: "Intuition" as a label.
- boardLines[1-3]: 2-3 lines capturing the core physical intuition.
- diagramSvg: Create a vivid, clean illustration or annotated diagram representing this physical intuition (e.g. slopes, forces, fluid levels, circuits, waves).
- spokenExplanation: Deliver the intuition warmly with a memorable real-world analogy. Refer directly to the diagram drawn on the board. End with a question.`,

            example_1:
                `Teach WORKED EXAMPLE 1 for "${concept.conceptName}".
Blueprint example: ${JSON.stringify(concept.example1)}
- boardLines[0]: the problem statement.
- boardLines[1-3]: the working steps (use LaTeX for maths if needed: e.g. $a = F/m$).
- boardLines[4]: the final answer with units.
- diagramSvg: If a diagram illustrates the example (e.g. free body diagram with numbers, geometric figure, circuit), include it.
- spokenExplanation: Read the problem aloud. Walk each step slowly. Reference the board working and diagram. End by asking if they followed.`,

            example_2:
                `Teach WORKED EXAMPLE 2 (harder) for "${concept.conceptName}".
Blueprint example: ${JSON.stringify(concept.example2)}
- boardLines[0]: the harder problem statement.
- boardLines[1-3]: working steps with LaTeX where useful.
- boardLines[4]: final answer with units.
- diagramSvg: Provide an updated diagram reflecting the harder condition (e.g. adding friction arrow, inclined angle θ, multi-step circuit).
- spokenExplanation: Explain what makes this harder than Example 1. Walk through the solution. End by asking if they can see the pattern.`,

            pitfalls:
                `Teach COMMON PITFALLS for "${concept.conceptName}".
Blueprint pitfalls: ${JSON.stringify(concept.commonPitfalls)}
- boardLines[0]: "Common Pitfalls" as a header.
- boardLines[1-N]: one pitfall per line, phrased as a warning (e.g. "Don't confuse mass with weight").
- tableMarkdown: Provide a DO vs. DON'T comparison table if applicable.
- spokenExplanation: Warn the student directly about each pitfall. Be clear and emphatic. End by asking if they've fallen into any of these.`,

            summary:
                `Teach the SUMMARY for "${concept.conceptName}".
Blueprint summary points: ${JSON.stringify(concept.summaryPoints)}
- boardLines[0]: "${concept.conceptName} — Key Points" as a title.
- boardLines[1-N]: the summary points, concise and clear.
- tableMarkdown: Provide a recap matrix summarizing key formulas, rules, and units.
- spokenExplanation: Recap what was covered in 2-3 sentences. Reinforce the most important formula or diagram. End by asking if they're ready to continue.`,
        };

        const aiPrompt = `You are AVELUT Voice & Visual Tutor — a warm, expert classroom teacher delivering an interactive visual blackboard lesson.
You have the ability to write text on the board, draw animated vector SVG diagrams & shapes, and render structured Markdown tables.
You MUST follow the lesson blueprint EXACTLY. Do NOT introduce contradictory facts.

LESSON BLUEPRINT — CURRENT CONCEPT:
${JSON.stringify(concept, null, 2)}

CURRENT TEACHING SUB-STEP: ${sStep}

YOUR TASK FOR THIS SUB-STEP:
${subStepInstructions[sStep]}

VISUAL DRAWING & TABLE INSTRUCTIONS:
- diagramSvg: Valid SVG string with viewBox="0 0 380 200" (or null if not applicable). Use warm theme colors:
  * Outlines & shapes: "#8B4513", "#5A3E22", "#3D2817"
  * Accents & arrows: "#2B6CB0", "#C53030", "#276749", "#D97706"
  * Fills: "#F4ECE2", "#EDE2D4" or "none"
  * Text labels: font-family="sans-serif", font-weight="bold", fill="#3D2817"
  * Use <marker> for arrowheads if drawing vectors or flowcharts.
- tableMarkdown: Clean Markdown table (or null if not applicable).
- diagramCaption: Short descriptive title for the visual (e.g. "Free-Body Force Diagram", "Trigonometric Right Triangle").

STRICT OUTPUT RULES:
1. boardLines: Array of strings, max ${MAX_BOARD_LINES} items. LaTeX allowed ($$...$$ for blocks, $...$ inline).
2. spokenExplanation: Natural conversational spoken English ONLY. No LaTeX. 2-4 sentences. Always end with a question.
3. Output valid JSON ONLY — no explanation, no markdown fences.

{
  "boardLines": ["line 1", "$$formula$$"],
  "spokenExplanation": "Spoken explanation ending with a check question?",
  "diagramSvg": "<svg viewBox=\\"0 0 380 200\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>",
  "tableMarkdown": "| Col 1 | Col 2 |\\n|---|---|\\n| A | B |",
  "diagramCaption": "Visual Diagram Title"
}`;

        try {
            const aiClient = createAvelutAI(appSettings, userProfile || null);
            if (!aiClient || !isActiveRef.current) {
                // Fallback: derive content and visual from blueprint
                setIsLoadingUnit(false);
                streamBoardLines(getBoardLines(concept, sStep));
                const fallback = getFallbackVisual(concept, sStep);
                setActiveDiagramSvg(fallback.diagramSvg);
                setActiveTableMarkdown(fallback.tableMarkdown);
                setActiveVisualCaption(fallback.caption || null);
                setDiagramKey(k => k + 1);
                await speakText(getSpokenText(concept, sStep));
                return;
            }

            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
                config: { responseMimeType: 'application/json', temperature: 0.5 },
            });

            if (!isActiveRef.current) return;

            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty unit response');

            const parsed: UnitPresentationResponse =
                JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());

            setIsLoadingUnit(false);
            streamBoardLines(parsed.boardLines.slice(0, MAX_BOARD_LINES));

            // Sanitize & set visual diagram / table
            const sanitized = sanitizeSvg(parsed.diagramSvg || concept.diagramSvg);
            const table = parsed.tableMarkdown || concept.tableMarkdown;

            if (sanitized) {
                setActiveDiagramSvg(sanitized);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(parsed.diagramCaption || concept.diagramCaption || `${concept.conceptName} Diagram`);
                setDiagramKey(k => k + 1);
            } else if (table && table.trim().includes('|')) {
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(table);
                setActiveVisualCaption(parsed.diagramCaption || `${concept.conceptName} Table`);
                setDiagramKey(k => k + 1);
            } else {
                // Check fallback visual
                const fallback = getFallbackVisual(concept, sStep);
                setActiveDiagramSvg(fallback.diagramSvg);
                setActiveTableMarkdown(fallback.tableMarkdown);
                setActiveVisualCaption(fallback.caption || null);
                setDiagramKey(k => k + 1);
            }

            await speakText(parsed.spokenExplanation);

        } catch (err) {
            console.warn('[PresentUnit] AI error, using blueprint fallback:', err);
            if (!isActiveRef.current) return;
            setIsLoadingUnit(false);
            // Graceful fallback: derive directly from blueprint & procedural visuals
            streamBoardLines(getBoardLines(concept, sStep));
            const fallback = getFallbackVisual(concept, sStep);
            setActiveDiagramSvg(fallback.diagramSvg);
            setActiveTableMarkdown(fallback.tableMarkdown);
            setActiveVisualCaption(fallback.caption || null);
            setDiagramKey(k => k + 1);
            await speakText(getSpokenText(concept, sStep));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speakText, streamBoardLines, userProfile, appSettings]);

    // ─────────────────────────────────────────────────────────────────────────
    // Handle student reply (voice, tap pill, or typed text)
    // ─────────────────────────────────────────────────────────────────────────
    const handleStudentReply = useCallback(async (reply: string) => {
        if (!blueprint || !isActiveRef.current) return;

        stopAudioImmediate();
        stopMicImmediate();
        clearAllStreamTimers();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setTextInput('');

        const wantsRepeat = /again|repeat|explain|didn.t|don.t|slow|what/i.test(reply);

        let newConceptIdx = conceptIdxRef.current;
        let newSubStep    = subStepRef.current;

        if (!wantsRepeat) {
            const next = nextSubStep(conceptIdxRef.current, subStepRef.current, blueprint);
            newConceptIdx = next.conceptIdx;
            newSubStep    = next.subStep;

            if (next.done) {
                setIsDone(true);
                setVisibleBoardLines(['🎓 Topic Complete!', blueprint.overallSummary]);
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(null);
                void speakText(`Excellent work! ${blueprint.overallSummary} You have completed this topic!`);
                return;
            }
        }

        conceptIdxRef.current = newConceptIdx;
        subStepRef.current    = newSubStep;
        setConceptIdx(newConceptIdx);
        setSubStep(newSubStep);

        await presentUnit(blueprint, newConceptIdx, newSubStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blueprint, speakText, presentUnit]);

    const handleSendText = () => {
        if (!textInput.trim()) return;
        const text = textInput.trim();
        setTextInput('');
        void handleStudentReply(text);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Controls: Pause / Play, Mic, Mute, Speed, Replay
    // ─────────────────────────────────────────────────────────────────────────
    const togglePauseAI = () => {
        if (isSpeaking) {
            stopAudioImmediate();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setIsSpeaking(false);
            setIsPaused(true);
            addToast('Tutor Paused', 'info');
        } else {
            setIsPaused(false);
            if (lastSpokenTextRef.current) {
                void speakText(lastSpokenTextRef.current);
            } else if (blueprint) {
                const concept = blueprint.concepts[conceptIdxRef.current];
                if (concept) void speakText(getSpokenText(concept, subStepRef.current));
            }
        }
    };

    const toggleMic = () => {
        if (isMicListening) {
            stopMicImmediate();
        } else {
            if (isSpeaking) {
                stopAudioImmediate();
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            }
            startMicListening();
        }
    };

    const toggleMute = () => {
        if (!isMuted) {
            stopAudioImmediate();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setIsMuted(true);
        } else {
            setIsMuted(false);
            if (lastSpokenTextRef.current) {
                void speakText(lastSpokenTextRef.current);
            } else if (blueprint) {
                const concept = blueprint.concepts[conceptIdxRef.current];
                if (concept) void speakText(getSpokenText(concept, subStepRef.current));
            }
        }
    };

    const handleSpeedChange = () => {
        const speeds = [1.0, 1.25, 1.5];
        const next   = speeds[(speeds.indexOf(speechRate) + 1) % speeds.length];
        setSpeechRate(next);
        addToast(`Speed: ${next}x`, 'info');
    };

    const handleReplay = () => {
        if (!blueprint) return;
        const concept = blueprint.concepts[conceptIdxRef.current];
        if (!concept) return;
        stopAudioImmediate();
        streamBoardLines(getBoardLines(concept, subStepRef.current));
        const fallback = getFallbackVisual(concept, subStepRef.current);
        setActiveDiagramSvg(fallback.diagramSvg);
        setActiveTableMarkdown(fallback.tableMarkdown);
        setActiveVisualCaption(fallback.caption || null);
        setDiagramKey(k => k + 1);
        void speakText(getSpokenText(concept, subStepRef.current));
    };

    const handleGoBack = useCallback(async () => {
        setIsNavigatingBack(true);
        isActiveRef.current = false;    // immediately stop all ghost callbacks
        stopAudioImmediate();
        clearAllStreamTimers();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        stopMicImmediate();

        // Save progress
        if (blueprint) {
            const prog: TutorialProgress = { conceptIdx: conceptIdxRef.current, subStep: subStepRef.current };
            writeCachedJson(progressKeyRef.current, prog, userProfile?.uid || 'anon');
        }

        await new Promise(r => setTimeout(r, 80));
        if (onNavigate) onNavigate('study_guide');
        else window.history.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blueprint, userProfile, onNavigate]);

    // ── Derived UI values ─────────────────────────────────────────────────
    const currentConcept  = blueprint?.concepts[conceptIdx];
    const totalConcepts   = blueprint?.concepts.length ?? 0;
    const progressPercent = totalConcepts > 0
        ? Math.round(((conceptIdx * SUB_STEP_ORDER.length + SUB_STEP_ORDER.indexOf(subStep)) /
            (totalConcepts * SUB_STEP_ORDER.length)) * 100)
        : 0;

    const hasVisualElement = !!(activeDiagramSvg || activeTableMarkdown);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col flex-1 h-full w-full bg-[#FAF7F2] text-[#2C241D] overflow-hidden select-none">

            {/* ── Header ──────────────────────────────────────────────── */}
            <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-[#E5DACD] bg-[#F4ECE2]/95 backdrop-blur-md z-30 shadow-xs shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={handleGoBack}
                        disabled={isNavigatingBack}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-[#4A3E31] text-xs font-bold active:scale-95 cursor-pointer shadow-xs disabled:opacity-60 transition-all shrink-0"
                    >
                        <i className="bi bi-arrow-left text-sm"></i>
                        <span className="hidden sm:inline">{isNavigatingBack ? 'Saving...' : 'Study Guide'}</span>
                    </button>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black tracking-widest uppercase text-[#8B5A2B]">
                            {isGeneratingBlueprint ? '⚙ Preparing lesson...' : SUB_STEP_LABEL[subStep]}
                        </span>
                        <h2 className="text-sm font-bold text-[#2C241D] truncate max-w-[160px] sm:max-w-xs">
                            {sessionData?.course.course_name}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Speaking status */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FFFDFB] border border-[#D9CCBC] rounded-full text-[11px] font-semibold text-[#4A3E31] shadow-xs">
                        {isTtsLoading ? (
                            <span className="w-2 h-2 rounded-full bg-[#D4A373] animate-pulse shrink-0" />
                        ) : isPaused ? (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        ) : (
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isSpeaking ? 'bg-[#8B5A2B] animate-pulse' : 'bg-[#C2B2A3]'}`} />
                        )}
                        <span className="hidden sm:inline">
                            {isTtsLoading ? 'Generating...' : isPaused ? 'Paused' : isSpeaking ? 'Speaking' : 'Charon'}
                        </span>
                    </div>

                    {/* Mute toggle */}
                    <button
                        onClick={toggleMute}
                        title={isMuted ? 'Unmute' : 'Mute'}
                        className="p-1.5 sm:px-2 sm:py-1 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-xs font-bold text-[#4A3E31] cursor-pointer shadow-xs transition-colors"
                    >
                        <i className={`bi ${isMuted ? 'bi-volume-mute-fill text-red-600' : 'bi-volume-up'} text-sm`}></i>
                    </button>

                    {/* Speed */}
                    <button onClick={handleSpeedChange} className="px-2 py-1 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-xs font-mono font-bold text-[#4A3E31] cursor-pointer shadow-xs transition-colors">
                        {speechRate}x
                    </button>
                </div>
            </header>

            {/* ── Progress bar ────────────────────────────────────────── */}
            {blueprint && !isGeneratingBlueprint && (
                <div className="h-0.5 bg-[#E5DACD] shrink-0">
                    <div
                        className="h-full bg-[#8B5A2B] transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            )}

            {/* ── Blueprint generation screen ─────────────────────────── */}
            {isGeneratingBlueprint && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#EFE5D8] border border-[#DFD1C0] flex items-center justify-center shadow-md">
                        <i className="bi bi-journal-text text-3xl text-[#8B5A2B]"></i>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-[#2C241D]">Preparing Your Interactive Lesson</h3>
                        <p className="text-sm text-[#7A6B5C] mt-1">{sessionData?.topic?.topic_name}</p>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-[#C2B2A3] border-t-[#8B5A2B] rounded-full animate-spin" />
                        <p className="text-sm font-medium text-[#5A4D3E] animate-pulse">{blueprintGenStep}</p>
                    </div>
                    <p className="text-xs text-[#A09080] max-w-xs">
                        AVELUT is designing a personalized lesson blueprint with diagrams, math formulas, and worked examples. Future sessions load instantly.
                    </p>
                </div>
            )}

            {/* ── Completion screen ─────────────────────────────────────── */}
            {isDone && !isGeneratingBlueprint && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center pb-24 md:pb-6">
                    <div className="text-5xl">🎓</div>
                    <h3 className="text-2xl font-bold text-[#2C241D]">Topic Complete!</h3>
                    <p className="text-sm text-[#5A4D3E] max-w-sm">{blueprint?.overallSummary}</p>
                    <button
                        onClick={handleGoBack}
                        className="px-8 py-3 bg-[#8B5A2B] text-white rounded-2xl font-bold text-sm shadow-md hover:bg-[#7A4D24] transition-colors active:scale-95 cursor-pointer"
                    >
                        Back to Study Guide
                    </button>
                </div>
            )}

            {/* ── Main teaching area ────────────────────────────────────── */}
            {!isGeneratingBlueprint && !isDone && (
                <main className="flex-1 flex flex-col p-3 sm:p-5 max-w-5xl w-full mx-auto gap-2.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-[calc(90px+env(safe-area-inset-bottom,0px))] md:pb-4">

                    {/* Concept breadcrumb */}
                    {currentConcept && (
                        <div className="flex items-center justify-between text-xs text-[#6B5E51] shrink-0">
                            <span className="flex items-center gap-1.5 font-semibold text-[#3D3328] truncate">
                                <i className="bi bi-journal-bookmark text-[#8B5A2B]"></i>
                                {sessionData?.topic?.topic_name}
                            </span>
                            <span className="font-bold text-[#8B5A2B] px-2 py-0.5 rounded-lg bg-[#EFE5D8] border border-[#DFD1C0] shrink-0 ml-2 truncate max-w-[180px]">
                                {conceptIdx + 1}/{totalConcepts} · {currentConcept.conceptName}
                            </span>
                        </div>
                    )}

                    {/* ── Visual Blackboard ───────────────────────────────── */}
                    <div className="relative flex-1 min-h-[220px] sm:min-h-[280px] flex flex-col justify-start milk-canvas border-2 border-[#E5D7C5] rounded-3xl p-4 sm:p-7 shadow-md overflow-hidden">

                        {isLoadingUnit && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#FAF7F2]/85 backdrop-blur-xs rounded-3xl z-20">
                                <div className="w-8 h-8 border-2 border-[#C2B2A3] border-t-[#8B5A2B] rounded-full animate-spin" />
                                <p className="text-sm font-handwriting text-[#7A6B5C] tracking-wide animate-pulse">
                                    Drawing & writing on board...
                                </p>
                            </div>
                        )}

                        {!blueprint && !isGeneratingBlueprint && (
                            <div className="flex items-center justify-center h-full opacity-30">
                                <i className="bi bi-easel text-5xl text-[#8B5A2B]"></i>
                            </div>
                        )}

                        {visibleBoardLines.length > 0 && (
                            <div className="flex flex-col h-full gap-3">
                                {/* Title / Header (first line) */}
                                <div className="font-bold font-handwriting text-xl sm:text-2xl text-[#8B4513] w-full border-b border-[#E8DCCF] pb-1.5 flex items-center justify-between">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                    >{visibleBoardLines[0]}</ReactMarkdown>

                                    {hasVisualElement && (
                                        <span className="text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#EFE5D8] text-[#8B5A2B] border border-[#DFD1C0]">
                                            {activeDiagramSvg ? '🎨 Diagram' : '📊 Table'}
                                        </span>
                                    )}
                                </div>

                                {/* Body Content: Split or Single View */}
                                <div className={`flex-1 w-full ${hasVisualElement ? 'grid grid-cols-1 lg:grid-cols-12 gap-4 items-start' : 'space-y-3'}`}>

                                    {/* Left Column: Text & LaTeX Math */}
                                    <div className={`${hasVisualElement ? 'lg:col-span-6 space-y-2.5' : 'space-y-3'}`}>
                                        {visibleBoardLines.slice(1).map((line, idx) => {
                                            const isVarLine       = line.includes('→');
                                            const isBlockFormula  = line.trim().startsWith('$$');
                                            const isPitfallHeader = line === 'Common Pitfalls';
                                            const isSummaryHeader = line.includes('— Summary') || line === '🎓 Topic Complete!';
                                            const isIntHeader     = line === 'Intuition';

                                            return (
                                                <div key={`${idx}-${line.slice(0, 15)}`} className="flex items-start gap-2 animate-fade-in">
                                                    {!isVarLine && !isBlockFormula && !isPitfallHeader && !isSummaryHeader && !isIntHeader && (
                                                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#8B5A2B] shrink-0 opacity-70" />
                                                    )}

                                                    {isBlockFormula ? (
                                                        <div className="w-full text-center text-[#221B14] py-1.5 overflow-x-auto bg-[#F7EFE6]/60 rounded-xl border border-[#E5DACD]/50 px-2 my-1">
                                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                {line}
                                                            </ReactMarkdown>
                                                        </div>
                                                    ) : isVarLine ? (
                                                        <div className="font-mono text-xs sm:text-sm text-[#5A4020] leading-snug pl-2 w-full">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                                rehypePlugins={[rehypeKatex]}
                                                                components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                            >{line.trim()}</ReactMarkdown>
                                                        </div>
                                                    ) : (isPitfallHeader || isSummaryHeader || isIntHeader) ? (
                                                        <p className={`font-bold text-xs uppercase tracking-widest ${isPitfallHeader ? 'text-amber-800' : 'text-[#8B5A2B]'} w-full pt-1`}>
                                                            {line}
                                                        </p>
                                                    ) : (
                                                        <div className="font-handwriting text-base sm:text-lg text-[#2A1F14] leading-snug tracking-wide w-full">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                                rehypePlugins={[rehypeKatex]}
                                                                components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                            >{line}</ReactMarkdown>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {isStreaming && (
                                            <span className="inline-block w-2.5 h-4 bg-[#8B5A2B] opacity-60 rounded-sm animate-pulse ml-1" />
                                        )}
                                    </div>

                                    {/* Right Column: Visual Diagram / Table */}
                                    {hasVisualElement && (
                                        <div className="lg:col-span-6 flex flex-col items-center justify-center p-2 rounded-2xl bg-[#FFFDF9]/90 border border-[#E2D4C3] shadow-xs relative group animate-fade-in overflow-hidden">
                                            {activeDiagramSvg && (
                                                <div className="w-full flex flex-col items-center">
                                                    {/* Expand button */}
                                                    <button
                                                        onClick={() => setIsDiagramZoomed(true)}
                                                        title="Enlarge Diagram"
                                                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-[#EFE5D8]/80 hover:bg-[#E4D5C3] text-[#5A3E22] text-xs cursor-pointer opacity-70 hover:opacity-100 transition-opacity z-10"
                                                    >
                                                        <i className="bi bi-arrows-fullscreen"></i>
                                                    </button>

                                                    {/* Animated SVG Container */}
                                                    <div
                                                        key={`svg-${diagramKey}`}
                                                        className="w-full max-h-[180px] sm:max-h-[210px] flex items-center justify-center board-diagram-animated py-1"
                                                        dangerouslySetInnerHTML={{ __html: activeDiagramSvg }}
                                                    />

                                                    {activeVisualCaption && (
                                                        <span className="text-[11px] font-medium text-[#7A6B5C] mt-0.5 text-center italic">
                                                            {activeVisualCaption}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {activeTableMarkdown && (
                                                <div className="w-full overflow-x-auto text-xs py-1">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm, remarkMath]}
                                                        rehypePlugins={[rehypeKatex]}
                                                    >
                                                        {activeTableMarkdown}
                                                    </ReactMarkdown>
                                                    {activeVisualCaption && (
                                                        <p className="text-[11px] font-medium text-[#7A6B5C] mt-0.5 text-center italic">
                                                            {activeVisualCaption}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mic live transcript badge */}
                    {isMicListening && micDisplay && (
                        <div className="shrink-0 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-[#8B5A2B] animate-pulse px-3 py-1 bg-[#F4ECE2] rounded-full w-fit mx-auto border border-[#E5DACD]">
                            <i className="bi bi-mic-fill text-red-600"></i>
                            <span>"{micDisplay}..."</span>
                        </div>
                    )}

                    {/* ── Unified Input Card with Attached 3 Suggestion Pills ── */}
                    <div className="shrink-0 flex flex-col gap-2 bg-[#F4ECE2]/95 border border-[#E5DACD] rounded-3xl p-2.5 sm:p-3.5 shadow-sm backdrop-blur-md">

                        {/* ── The 3 Categorized Suggestion Pills (Answer, Question, Explore) ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 w-full">
                            {suggestions.map((pill, i) => {
                                const isAnswer   = pill.type === 'answer';
                                const isQuestion = pill.type === 'question';

                                const pillStyle = isAnswer
                                    ? 'bg-[#F2FAF4] hover:bg-[#E3F5E7] border-emerald-300 text-[#1D542B]'
                                    : isQuestion
                                    ? 'bg-[#F0F7FD] hover:bg-[#E1F0FC] border-sky-300 text-[#164E78]'
                                    : 'bg-[#FFF9EE] hover:bg-[#FDF0D5] border-amber-300 text-[#7A4B13]';

                                const iconClass = isAnswer
                                    ? 'bi bi-check2-circle text-emerald-600'
                                    : isQuestion
                                    ? 'bi bi-question-circle text-sky-600'
                                    : 'bi bi-stars text-amber-600';

                                return (
                                    <button
                                        key={i}
                                        onClick={() => void handleStudentReply(pill.text)}
                                        disabled={isGeneratingBlueprint || isTtsLoading}
                                        className={`px-3 py-2 border rounded-2xl text-xs font-semibold text-left transition-all active:scale-[0.98] shadow-2xs disabled:opacity-40 cursor-pointer flex items-center gap-2 ${pillStyle}`}
                                    >
                                        <i className={`${iconClass} text-xs shrink-0`}></i>
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">
                                                {pill.label}
                                            </span>
                                            <span className="truncate text-xs font-medium leading-tight">
                                                {pill.text}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Input Bar with Pause AI, Text Input, Mic & Send ── */}
                        <div className="flex items-center gap-1.5 sm:gap-2 w-full pt-1">
                            {/* Pause / Resume AI Voice button */}
                            <button
                                onClick={togglePauseAI}
                                disabled={isTtsLoading || !blueprint}
                                title={isSpeaking ? "Pause Tutor" : "Resume / Play"}
                                className={`flex items-center justify-center w-10 h-10 rounded-2xl border transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 disabled:opacity-40 ${
                                    isSpeaking
                                        ? 'bg-[#EFE5D8] border-[#DFD1C0] text-[#8B5A2B] hover:bg-[#E5D7C5]'
                                        : isPaused
                                        ? 'bg-amber-100 border-amber-300 text-amber-800 animate-pulse'
                                        : 'bg-[#FFFDFB] border-[#D9CCBC] text-[#5A4D3E] hover:bg-[#EDE2D4]'
                                }`}
                            >
                                <i className={`bi ${isSpeaking ? 'bi-pause-fill text-lg' : 'bi-play-fill text-xl'} `}></i>
                            </button>

                            {/* Replay button */}
                            <button
                                onClick={handleReplay}
                                disabled={isTtsLoading || isSpeaking || !blueprint}
                                title="Replay current step"
                                className="hidden sm:flex items-center justify-center w-10 h-10 rounded-2xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-[#5A4D3E] text-sm cursor-pointer shadow-xs transition-colors shrink-0 disabled:opacity-40"
                            >
                                <i className="bi bi-arrow-counterclockwise"></i>
                            </button>

                            {/* Text Input */}
                            <div className="flex-1 relative flex items-center">
                                <input
                                    type="text"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
                                    disabled={isGeneratingBlueprint}
                                    placeholder={isMicListening ? "Listening... (or type your reply)" : "Type your reply or question..."}
                                    className="w-full h-10 pl-3.5 pr-9 bg-[#FFFDFB] border border-[#D9CCBC] focus:border-[#8B5A2B] focus:ring-1 focus:ring-[#8B5A2B] rounded-2xl text-xs sm:text-sm text-[#2C241D] placeholder-[#9E8E7E] outline-none shadow-2xs transition-all"
                                />
                                {textInput.trim() && (
                                    <button
                                        onClick={handleSendText}
                                        title="Send response"
                                        className="absolute right-1.5 w-7 h-7 rounded-xl bg-[#8B5A2B] hover:bg-[#7A4D24] text-white flex items-center justify-center cursor-pointer transition-colors shadow-2xs active:scale-95"
                                    >
                                        <i className="bi bi-arrow-up-short text-lg"></i>
                                    </button>
                                )}
                            </div>

                            {/* Auto-Activated Mic Button */}
                            <button
                                onClick={toggleMic}
                                disabled={isGeneratingBlueprint || !blueprint}
                                title={isMicListening ? "Stop Listening" : "Speak to Tutor (Auto-activates)"}
                                className={`flex items-center gap-1.5 px-3.5 sm:px-4 h-10 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
                                    isMicListening
                                        ? 'bg-red-600 text-white animate-pulse shadow-md ring-2 ring-red-300'
                                        : 'bg-[#8B5A2B] hover:bg-[#7A4D24] text-white'
                                }`}
                            >
                                <i className={`bi ${isMicListening ? 'bi-mic-fill' : 'bi-mic'} text-sm`}></i>
                                <span className="hidden sm:inline">{isMicListening ? 'Listening' : 'Mic'}</span>
                            </button>
                        </div>
                    </div>
                </main>
            )}

            {/* ── Diagram Enlarge / Zoom Modal ─────────────────────────── */}
            {isDiagramZoomed && activeDiagramSvg && (
                <div
                    onClick={() => setIsDiagramZoomed(false)}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer animate-fade-in"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#FFFDF9] border-2 border-[#D9CCBC] rounded-3xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-4 relative cursor-default"
                    >
                        <div className="flex items-center justify-between border-b border-[#E5DACD] pb-3">
                            <h3 className="font-bold text-base text-[#5A3E22]">
                                {activeVisualCaption || 'Diagram Inspection'}
                            </h3>
                            <button
                                onClick={() => setIsDiagramZoomed(false)}
                                className="w-8 h-8 rounded-full bg-[#EFE5D8] hover:bg-[#E2D4C3] text-[#5A3E22] flex items-center justify-center cursor-pointer transition-colors"
                            >
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>
                        <div
                            className="w-full flex items-center justify-center p-4 bg-[#FBF7F0] rounded-2xl border border-[#EBE0D2]"
                            dangerouslySetInnerHTML={{ __html: activeDiagramSvg }}
                        />
                        <p className="text-xs text-[#7A6B5C] text-center">
                            Tap outside or click close to return to lesson.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VoiceTutorialPage;


