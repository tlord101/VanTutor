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

interface BlueprintVariable { symbol: string; meaning: string; }
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
}

interface LessonBlueprint {
    overview:       string;
    concepts:       BlueprintConcept[];
    overallSummary: string;
}

interface TutorialProgress { conceptIdx: number; subStep: SubStep; }

interface VoiceTutorialPageProps {
    userProfile?:  UserProfile | null;
    appSettings?:  any;
    onNavigate?:   (tab: string) => void;
}

// ── Pure helpers (outside component, no hooks) ───────────────────────────────

function getBoardLines(concept: BlueprintConcept, step: SubStep): string[] {
    switch (step) {
        case 'definition': {
            // Split definition into up to 2 lines if it's long
            const defLines: string[] = [concept.conceptName];
            // break definition at sentences if too long
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

function getSuggestions(step: SubStep): [string, string, string] {
    const map: Record<SubStep, [string, string, string]> = {
        definition:  ["I understand, let's continue",    "Explain it differently",         "Can you explain that again?"],
        formula:     ["I understand the formula",         "Explain the variables more",      "Can you explain that again?"],
        intuition:   ["That makes sense, continue",      "Give me a different analogy",     "Can you explain that again?"],
        example_1:   ["Got it, show harder example",     "Redo that step slowly",           "Can you explain that again?"],
        example_2:   ["I understand this approach",      "What if conditions changed?",     "Can you explain that again?"],
        pitfalls:    ["Noted, I'll be careful",           "I've made that mistake before",   "Can you explain that again?"],
        summary:     ["Ready for next concept!",          "Recap the key formula",           "Can you explain that again?"],
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
    const [suggestions, setSuggestions] = useState<[string, string, string]>(getSuggestions('definition'));
    const [isDone, setIsDone] = useState(false);

    // ── Board ────────────────────────────────────────────────────────────
    const [visibleBoardLines, setVisibleBoardLines] = useState<string[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);

    // ── Audio / mic ──────────────────────────────────────────────────────
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isTtsLoading, setIsTtsLoading] = useState(false);
    const [isMicListening, setIsMicListening] = useState(false);
    const [speechRate, setSpeechRate] = useState(1.0);

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
    const streamTimersRef    = useRef<ReturnType<typeof setTimeout>[]>([]);
    const blueprintKeyRef    = useRef('');
    const progressKeyRef     = useRef('');
    const spokenTextBuffer   = useRef(''); // for mic display
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

    const browserSpeak = useCallback((text: string, onEnd?: () => void) => {
        if (!('speechSynthesis' in window)) { onEnd?.(); return; }
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate  = speechRate;
        const vs  = window.speechSynthesis.getVoices();
        const v   = vs.find(v => v.lang.startsWith('en') && v.name.includes('Google'))
                 || vs.find(v => v.lang.startsWith('en'));
        if (v) utt.voice = v;
        utt.onstart = () => { if (isActiveRef.current) setIsSpeaking(true); };
        utt.onend   = () => { if (isActiveRef.current) setIsSpeaking(false); onEnd?.(); };
        utt.onerror = () => { if (isActiveRef.current) setIsSpeaking(false); };
        setIsSpeaking(true);
        window.speechSynthesis.speak(utt);
    }, [speechRate]);

    const speakText = useCallback(async (text: string, onEnd?: () => void): Promise<void> => {
        if (!isActiveRef.current || isMuted || !text) { onEnd?.(); return; }
        stopAudioImmediate();
        setIsTtsLoading(true);

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
                if (isActiveRef.current) setIsSpeaking(false);
                currentAudioRef.current = null;
                onEnd?.();
            };
            currentAudioRef.current = src;
            setIsTtsLoading(false);
            if (isActiveRef.current) setIsSpeaking(true);
            src.start(0);
        } catch (err) {
            console.warn('[TTS] fallback:', err);
            if (!isActiveRef.current) return;
            setIsTtsLoading(false);
            browserSpeak(clean, onEnd);
        }
    }, [isMuted, speechRate, userProfile, appSettings, getAudioCtx, pcm16ToAudioBuffer, browserSpeak]);

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
    // Microphone
    // ─────────────────────────────────────────────────────────────────────────
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
            rec.onstart  = () => { if (isActiveRef.current) { setIsMicListening(true); setMicDisplay(''); spokenTextRef.current = ''; } };
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

        setBlueprintGenStep('Building lesson plan...');

        const prompt = `You are AVELUT Curriculum Designer. Create a comprehensive, structured lesson blueprint for a voice + blackboard AI tutor.

Course: "${courseName}"
Topic: "${topicName}"
Student Level: ${level}

Generate a lesson blueprint as valid JSON ONLY — no explanation, no markdown fences.

BLUEPRINT REQUIREMENTS:
- Include 2–4 key concepts depending on topic complexity
- Each concept must have: definition, formula (or null), variables, intuition, two worked examples, pitfalls, summary
- Formulas must be LaTeX strings: e.g. "$$F = ma$$" or "$$v = \\frac{d}{t}$$"
- example1 = standard problem, example2 = harder variant (add friction, incline, multi-step etc.)
- solution arrays: each string is ONE step of the working (max 4 steps)
- commonPitfalls: 2–3 specific student mistakes for this concept
- summaryPoints: 2–3 key takeaway lines

{
  "overview": "2-3 sentence overview of what the student will learn",
  "concepts": [
    {
      "conceptName": "Short name (2-5 words)",
      "keyDefinition": "Clear, simple 1-2 sentence definition",
      "formula": "$$LaTeX formula$$ or null",
      "variables": [
        {"symbol": "F", "meaning": "Force in Newtons — the push or pull on an object"}
      ],
      "intuitionNote": "Real-world physical intuition in 1-2 sentences. Mention what μ, v, or other symbols feel like physically.",
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
        "Forgetting to subtract friction from applied force",
        "Using mass instead of weight for the normal force"
      ],
      "summaryPoints": [
        "Newton's 2nd Law: F = ma links force, mass and acceleration",
        "Net force = sum of all forces including friction",
        "Always check units: N = kg·m/s²"
      ]
    }
  ],
  "overallSummary": "1–2 sentence closing remark about the full topic"
}`;

        try {
            setBlueprintGenStep('Generating content...');
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
    // Present a specific unit
    // ─────────────────────────────────────────────────────────────────────────
    const presentUnit = useCallback(async (
        bp: LessonBlueprint,
        cIdx: number,
        sStep: SubStep,
    ) => {
        if (!isActiveRef.current) return;

        const concept = bp.concepts[cIdx];
        if (!concept) {
            // All done — show overall summary
            setIsDone(true);
            setVisibleBoardLines(['🎓 Topic Complete!', bp.overallSummary]);
            void speakText(`Well done! ${bp.overallSummary} You have mastered this topic!`);
            return;
        }

        const boardLines  = getBoardLines(concept, sStep);
        const spokenWords = getSpokenText(concept, sStep);
        const sugg        = getSuggestions(sStep);

        setSuggestions(sugg);

        // Stream board
        streamBoardLines(boardLines);

        // Save progress
        const prog: TutorialProgress = { conceptIdx: cIdx, subStep: sStep };
        writeCachedJson(progressKeyRef.current, prog, userProfile?.uid || 'anon');

        // Speak then activate mic
        await speakText(spokenWords, () => {
            if (isActiveRef.current) startMicListening();
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speakText, streamBoardLines, startMicListening, userProfile]);

    // ─────────────────────────────────────────────────────────────────────────
    // Handle student reply (voice or tap)
    // ─────────────────────────────────────────────────────────────────────────
    const handleStudentReply = useCallback(async (reply: string) => {
        if (!blueprint || !isActiveRef.current) return;

        stopAudioImmediate();
        stopMicImmediate();
        clearAllStreamTimers();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();

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

    // ─────────────────────────────────────────────────────────────────────────
    // Controls
    // ─────────────────────────────────────────────────────────────────────────
    const toggleMic = () => {
        if (isMicListening) stopMicImmediate();
        else startMicListening();
    };

    const toggleMute = () => {
        if (!isMuted) {
            stopAudioImmediate();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setIsMuted(true);
        } else {
            setIsMuted(false);
            if (blueprint) {
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
        void speakText(getSpokenText(concept, subStepRef.current), () => {
            if (isActiveRef.current) startMicListening();
        });
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

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col flex-1 h-full w-full bg-[#FAF7F2] text-[#2C241D] overflow-hidden select-none">

            {/* ── Header ──────────────────────────────────────────────── */}
            <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#E5DACD] bg-[#F4ECE2]/95 backdrop-blur-md z-30 shadow-xs shrink-0">
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
                        {isTtsLoading
                            ? <span className="w-2 h-2 rounded-full bg-[#D4A373] animate-pulse shrink-0" />
                            : <span className={`w-2 h-2 rounded-full shrink-0 ${isSpeaking ? 'bg-[#8B5A2B] animate-pulse' : 'bg-[#C2B2A3]'}`} />
                        }
                        <span className="hidden sm:inline">
                            {isTtsLoading ? 'Generating...' : isSpeaking ? 'Speaking' : 'Charon'}
                        </span>
                    </div>
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
                        <h3 className="text-lg font-bold text-[#2C241D]">Preparing Your Lesson</h3>
                        <p className="text-sm text-[#7A6B5C] mt-1">{sessionData?.topic?.topic_name}</p>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-[#C2B2A3] border-t-[#8B5A2B] rounded-full animate-spin" />
                        <p className="text-sm font-medium text-[#5A4D3E] animate-pulse">{blueprintGenStep}</p>
                    </div>
                    <p className="text-xs text-[#A09080] max-w-xs">
                        AVELUT is designing a personalised lesson blueprint for this topic. This happens only once — future sessions load instantly.
                    </p>
                </div>
            )}

            {/* ── Completion screen ─────────────────────────────────────── */}
            {isDone && !isGeneratingBlueprint && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
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
                <main className="flex-1 flex flex-col p-3 sm:p-5 max-w-4xl w-full mx-auto gap-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                    {/* Concept breadcrumb */}
                    {currentConcept && (
                        <div className="flex items-center justify-between text-xs text-[#6B5E51] shrink-0">
                            <span className="flex items-center gap-1.5 font-semibold text-[#3D3328] truncate">
                                <i className="bi bi-journal-bookmark text-[#8B5A2B]"></i>
                                {sessionData?.topic?.topic_name}
                            </span>
                            <span className="font-bold text-[#8B5A2B] px-2 py-0.5 rounded-lg bg-[#EFE5D8] border border-[#DFD1C0] shrink-0 ml-2 truncate max-w-[150px]">
                                {conceptIdx + 1}/{totalConcepts} · {currentConcept.conceptName}
                            </span>
                        </div>
                    )}

                    {/* ── Blackboard ─────────────────────────────────────── */}
                    <div className="relative flex-1 min-h-[200px] sm:min-h-[260px] flex flex-col justify-start milk-canvas border-2 border-[#E5D7C5] rounded-3xl p-5 sm:p-8 shadow-md overflow-hidden">

                        {!blueprint && !isGeneratingBlueprint && (
                            <div className="flex items-center justify-center h-full opacity-30">
                                <i className="bi bi-easel text-5xl text-[#8B5A2B]"></i>
                            </div>
                        )}

                        {visibleBoardLines.length > 0 && (
                            <div className="space-y-3">
                                {visibleBoardLines.map((line, i) => {
                                    const isVarLine       = line.includes('→');
                                    const isBlockFormula  = line.trim().startsWith('$$');
                                    const isPitfallHeader = line === 'Common Pitfalls';
                                    const isSummaryHeader = line.includes('— Summary') || line === '🎓 Topic Complete!';
                                    const isIntHeader     = line === 'Intuition';

                                    return (
                                        <div key={`${i}-${line.slice(0, 15)}`} className="flex items-start gap-2 animate-fade-in">

                                            {/* Bullet/indicator */}
                                            {!isVarLine && !isBlockFormula && !isPitfallHeader && !isSummaryHeader && !isIntHeader && i > 0 && (
                                                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#8B5A2B] shrink-0 opacity-70" />
                                            )}

                                            {isBlockFormula ? (
                                                <div className="w-full text-center text-[#221B14] py-2 overflow-x-auto">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                        {line}
                                                    </ReactMarkdown>
                                                </div>
                                            ) : isVarLine ? (
                                                <div className="font-mono text-sm sm:text-base text-[#5A4020] leading-snug pl-4 w-full">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm, remarkMath]}
                                                        rehypePlugins={[rehypeKatex]}
                                                        components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                    >{line.trim()}</ReactMarkdown>
                                                </div>
                                            ) : (isPitfallHeader || isSummaryHeader || isIntHeader) ? (
                                                <p className={`font-bold text-sm uppercase tracking-widest ${isPitfallHeader ? 'text-amber-700' : 'text-[#8B5A2B]'} w-full`}>
                                                    {line}
                                                </p>
                                            ) : i === 0 ? (
                                                // First line = concept name / title
                                                <div className="font-bold font-handwriting text-2xl sm:text-3xl text-[#8B4513] w-full border-b border-[#E8DCCF] pb-1">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm, remarkMath]}
                                                        rehypePlugins={[rehypeKatex]}
                                                        components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                    >{line}</ReactMarkdown>
                                                </div>
                                            ) : (
                                                <div className="font-handwriting text-xl sm:text-2xl text-[#2A1F14] leading-snug tracking-wide w-full">
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

                                {/* Streaming cursor */}
                                {isStreaming && (
                                    <span className="inline-block w-2.5 h-5 bg-[#8B5A2B] opacity-60 rounded-sm animate-pulse ml-1" />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Mic live transcript (no captions — only mic input shown) */}
                    {isMicListening && micDisplay && (
                        <div className="shrink-0 flex items-center justify-center gap-2 text-sm font-medium text-[#8B5A2B] animate-pulse">
                            <i className="bi bi-mic-fill"></i>
                            <span>"{micDisplay}..."</span>
                        </div>
                    )}

                    {/* ── Suggestions ─────────────────────────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0">
                        {suggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => void handleStudentReply(s)}
                                disabled={isGeneratingBlueprint || isTtsLoading}
                                className="px-4 py-3 bg-[#FFFDFB] hover:bg-[#F5EDE3] border-2 border-[#E5DACD] hover:border-[#D5C3AE] active:border-[#8B5A2B] text-[#2C241D] rounded-2xl text-xs sm:text-sm font-semibold text-left transition-all active:scale-[0.98] shadow-xs disabled:opacity-40 cursor-pointer flex items-center gap-2.5"
                            >
                                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-[#EFE5D8] border border-[#DFD1C0] text-[10px] font-bold text-[#8B5A2B] shrink-0">
                                    {i + 1}
                                </span>
                                <span className="truncate">{s}</span>
                            </button>
                        ))}
                    </div>

                    {/* ── Controls bar ─────────────────────────────────────── */}
                    <div className="flex items-center justify-between bg-[#F4ECE2] border border-[#E5DACD] rounded-2xl px-5 py-2.5 shadow-sm shrink-0">
                        <button
                            onClick={handleReplay}
                            disabled={isTtsLoading || isSpeaking || !blueprint}
                            className="flex items-center gap-1.5 text-xs font-bold text-[#5A4D3E] hover:text-[#2C241D] cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-[#EBE0D2] disabled:opacity-40 transition-colors"
                        >
                            <i className="bi bi-arrow-counterclockwise text-sm"></i>
                            <span className="hidden sm:inline">Replay</span>
                        </button>

                        <button
                            onClick={toggleMic}
                            disabled={isTtsLoading || isSpeaking || !blueprint}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-40 ${
                                isMicListening
                                    ? 'bg-[#8B5A2B] text-white animate-pulse shadow-md'
                                    : 'bg-[#FFFDFB] hover:bg-[#EDE1D1] text-[#3D3328] border-2 border-[#D9CCBC]'
                            }`}
                        >
                            <i className={`bi ${isMicListening ? 'bi-mic-fill' : 'bi-mic'} text-sm`}></i>
                            <span>{isMicListening ? 'Listening...' : 'Speak'}</span>
                        </button>

                        <button
                            onClick={toggleMute}
                            className="flex items-center gap-1.5 text-xs font-bold text-[#5A4D3E] hover:text-[#2C241D] cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-[#EBE0D2] transition-colors"
                        >
                            <i className={`bi ${isMuted ? 'bi-volume-mute-fill text-red-600' : 'bi-volume-up'} text-sm`}></i>
                            <span className="hidden sm:inline">{isMuted ? 'Unmute' : 'Mute'}</span>
                        </button>
                    </div>
                </main>
            )}
        </div>
    );
};

export default VoiceTutorialPage;
