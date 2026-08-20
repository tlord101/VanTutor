import React, { useState, useEffect, useRef, useCallback } from 'react';
import { readCachedJson, writeCachedJson } from '../utils/cache';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { GoogleGenAI } from '@google/genai';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import type { UserProfile, Course, Topic } from '../types';
import {
    getStudentCognitiveProfile,
    recordConceptProgress,
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
import katex from 'katex';
import { checkAICredits, deductAICredits, getFeatureCost } from '../utils/usage';
import { LimitExceededModal } from './LimitExceededModal';
import { kittenTts, KittenVoice, KITTEN_VOICE_LIST } from '../services/kittenTtsService';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_BOARD_LINES = 6;
const LINE_STREAM_MS = 300;

// ── Adaptive Teaching Phases (capabilities, not fixed sequence) ───────────────
import type { TutorPhase, DiagnosticDimensionResult, RepairStrategy } from '../services/adaptivePathEngine';
import { generatePhasePath, adaptPath, selectRepairStrategy, scoreDiagnosticAnswers, REPAIR_STRATEGY_INSTRUCTIONS } from '../services/adaptivePathEngine';
import { DimensionalMastery, defaultMastery, updateMastery, updateMasteryOnAnswer, generateMasteryNarration, evaluateReadiness, PhaseResult, MisconceptionType } from '../services/masteryModel';
import { evaluateLocally, evaluateWithAI, evaluateStudentAnswer, isHintRequest, EvaluationResult } from '../services/answerEvaluator';
import { createInitialHintState, getNextHint, HintState } from '../services/hintEngine';
import { createInitialDifficultyState, recordQuestionPerformance, DifficultyState } from '../services/difficultyController';
import { calculateInitialReview, saveSpacedReviewItem, scheduleSpacedReviewItem } from '../services/spacedReviewService';
import { recordConceptDimensionalMastery } from '../services/tutorMemoryService';
import type { LearningQuestion, QuestionDifficulty } from '../types/learningQuestion';

export type { TutorPhase };

/** @deprecated — backward-compatible alias for SubStep during migration */
export type SubStep = TutorPhase;

export const INTERACTIVE_PHASES: Set<TutorPhase> = new Set([
    'diagnostic', 'predict', 'guided_practice',
    'independent_practice', 'misconception', 'transfer', 'retrieval', 'synthesis',
]);

export const PHASE_LABEL: Record<TutorPhase, string> = {
    diagnostic:           '🔍 Diagnostic',
    concept_map:          '🗺️ Concept Map',
    intuition:            '🌱 Intuition',
    concept_core:         '📌 Core Concept',
    predict:              '🤔 Predict',
    formalize:            '📐 Formalize',
    multi_represent:      '🔄 Representations',
    guided_practice:      '✏️ Guided Practice',
    independent_practice: '🎯 Independent Practice',
    misconception:        '⚠️ Misconception Check',
    transfer:             '🔀 Transfer',
    retrieval:            '🧠 Retrieval',
    mastery_decision:     '🎓 Mastery Check',
    repair:               '🔧 Repair',
    synthesis:            '🧩 Synthesis',
};

/** @deprecated — kept for backward-compat; phases are now runtime-generated */
export const SUB_STEP_LABEL = PHASE_LABEL;
export const SUB_STEP_ORDER: TutorPhase[] = ['diagnostic'];

// ── Types ────────────────────────────────────────────────────────────────────
export interface VoiceTutorialSessionData {
    course: Course;
    topic?: Topic | null;
    syllabusContext?: string;
    image?: string | null;
    customPrompt?: string | null;
    source?: string;
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
 * Robust JSON parser capable of handling:
 * 1. Markdown code blocks (```json ... ```)
 * 2. Unescaped LaTeX backslashes (\sigma, \Delta, \frac, \nabla, \alpha, etc.)
 * 3. Literal newlines or tabs inside JSON strings
 * 4. Trailing commas
 * 5. Truncated JSON responses (auto-closes quotes and braces)
 */
export function robustParseJson<T = any>(raw: string): T {
    if (!raw || typeof raw !== 'string') {
        throw new Error('Empty JSON input');
    }
    let cleaned = raw.replace(/^```(?:json)?\s*/gi, '').replace(/\s*```$/gi, '').trim();
    
    // Extract JSON substring between first { or [ and last } or ]
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    // Attempt 1: Direct JSON.parse
    try {
        return JSON.parse(cleaned) as T;
    } catch (_) {}

    // Attempt 2: Advanced character-by-character sanitize with LaTeX escape handler
    try {
        let inString = false;
        let isEscaped = false;
        let out = '';

        for (let i = 0; i < cleaned.length; i++) {
            const ch = cleaned[i];

            if (inString) {
                if (ch === '"' && !isEscaped) {
                    inString = false;
                    out += ch;
                } else if (ch === '\\' && !isEscaped) {
                    const next = cleaned[i + 1] || '';
                    if (next === '"' || next === '\\' || next === '/') {
                        out += '\\' + next;
                        i++;
                    } else if (next === 'u' && /^[0-9a-fA-F]{4}/.test(cleaned.slice(i + 2, i + 6))) {
                        out += '\\u' + cleaned.slice(i + 2, i + 6);
                        i += 5;
                    } else if (/^[bfnrt]/.test(next)) {
                        const remainder = cleaned.slice(i + 1, i + 15);
                        if (/^(frac|nabla|text|times|theta|tau|tan|rho|right|nu|neq|neg|normal|beta|begin|bar|bot|bf|bold|box|bullet|approx|gamma)/i.test(remainder)) {
                            out += '\\\\' + next;
                        } else {
                            out += '\\' + next;
                        }
                        i++;
                    } else {
                        out += '\\\\' + next;
                        i++;
                    }
                } else if (ch === '\n') {
                    out += '\\n';
                } else if (ch === '\r') {
                    out += '\\r';
                } else if (ch === '\t') {
                    out += '\\t';
                } else {
                    out += ch;
                }
                isEscaped = false;
            } else {
                if (ch === '"') {
                    inString = true;
                    out += ch;
                } else {
                    out += ch;
                }
            }
        }

        const withoutTrailingCommas = out.replace(/,\s*([\}\]])/g, '$1');
        return JSON.parse(withoutTrailingCommas) as T;
    } catch (_) {}

    // Attempt 3: Regex replacer function fixing all single backslashes
    try {
        const sanitized = cleaned
            .replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, () => '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/,\s*([\}\]])/g, '$1');
        return JSON.parse(sanitized) as T;
    } catch (_) {}

    // Attempt 4: Auto-balance unclosed quotes and braces if truncated
    try {
        let openBraces = (cleaned.match(/\{/g) || []).length - (cleaned.match(/\}/g) || []).length;
        let openBrackets = (cleaned.match(/\[/g) || []).length - (cleaned.match(/\]/g) || []).length;
        let openQuotes = (cleaned.match(/(?<!\\)"/g) || []).length % 2 !== 0;

        let patched = cleaned;
        if (openQuotes) patched += '"';
        while (openBrackets > 0) {
            patched += ']';
            openBrackets--;
        }
        while (openBraces > 0) {
            patched += '}';
            openBraces--;
        }

        const sanitized = patched
            .replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, () => '\\\\')
            .replace(/,\s*([\}\]])/g, '$1');
        return JSON.parse(sanitized) as T;
    } catch (_) {}

    // Attempt 5: Resilient regex-field extractor for truncated or malformed responses
    try {
        const obj: any = {};

        // Extract boardLines array
        const boardMatch = cleaned.match(/"boardLines"\s*:\s*\[([\s\S]*?)(\]|$)/);
        if (boardMatch) {
            const rawItems = boardMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
            if (rawItems && rawItems.length > 0) {
                obj.boardLines = rawItems.map(item => item.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
            }
        }

        // Extract spokenExplanation
        const spokenMatch = cleaned.match(/"spokenExplanation"\s*:\s*"((?:[^"\\]|\\.)*)/);
        if (spokenMatch) {
            obj.spokenExplanation = spokenMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }

        // Extract diagramSvg
        const svgMatch = cleaned.match(/"diagramSvg"\s*:\s*("(?:[^"\\]|\\.)*"|null)/);
        if (svgMatch && svgMatch[1] !== 'null') {
            obj.diagramSvg = svgMatch[1].slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }

        // Extract tableMarkdown
        const tableMatch = cleaned.match(/"tableMarkdown"\s*:\s*("(?:[^"\\]|\\.)*"|null)/);
        if (tableMatch && tableMatch[1] !== 'null') {
            obj.tableMarkdown = tableMatch[1].slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }

        // Extract action buttons
        const posLabelMatch = cleaned.match(/"positiveReplyLabel"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (posLabelMatch) obj.positiveReplyLabel = posLabelMatch[1];
        const posTextMatch = cleaned.match(/"positiveReplyText"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (posTextMatch) obj.positiveReplyText = posTextMatch[1];
        const negLabelMatch = cleaned.match(/"negativeReplyLabel"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (negLabelMatch) obj.negativeReplyLabel = negLabelMatch[1];
        const negTextMatch = cleaned.match(/"negativeReplyText"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (negTextMatch) obj.negativeReplyText = negTextMatch[1];

        if (obj.boardLines || obj.spokenExplanation) {
            if (!obj.boardLines) obj.boardLines = [];
            if (!obj.spokenExplanation) obj.spokenExplanation = obj.boardLines.join(' ');
            return obj as T;
        }
    } catch (_) {}

    console.warn('[robustParseJson] All JSON parse strategies failed. Snippet:', cleaned.slice(0, 300));
    // Return a safe minimal fallback object instead of throwing
    return {
        boardLines: ['Interactive Tutorial Step'],
        spokenExplanation: 'Let us continue our interactive lesson.',
    } as any as T;
}

export interface BlueprintVariable {
    symbol: string;
    meaning: string;
    unit?: string;
}

export interface BlueprintStep {
    stepNumber: number;
    title: string;
    principle?: string;
    formula?: string;
    substitution?: string;
    calculation?: string;
    result?: string;
    explanation: string;
    mathExpression: string;
}

export interface BlueprintExample {
    problem: string;
    givens: { symbol: string; value: string; unit?: string }[];
    find: string;
    step1: BlueprintStep;
    step2: BlueprintStep;
    step3: BlueprintStep;
    answer: string;
    physicalTakeaway: string;
    hints?: [string, string, string, string];
}

export interface DiagnosticQuestionItem {
    id: string;
    question: string;
    type: 'multiple_choice' | 'numeric' | 'open_ended';
    options?: string[];
    correctAnswer: string;
    dimension: 'prerequisiteKnowledge' | 'conceptualUnderstanding' | 'proceduralFluency' | 'transferAbility';
    difficulty: QuestionDifficulty;
    prerequisiteConcept: string;
    hints?: [string, string, string, string];
}

export interface BlueprintConcept {
    conceptName:        string;
    // ── Diagnostic Materials ──
    diagnosticQuestions?: DiagnosticQuestionItem[];
    // ── Intuition & Mental Model ──
    relatableQuestion:  string;
    realWorldScenario:  string;
    keyDefinition:      string;
    physicalMeaning:    string;
    progressionTable:   string;
    // ── Formalization ──
    formula:            string | null;
    variables:          BlueprintVariable[];
    keyDistinction:     string;
    goldenRule:         string;
    // ── Prediction ──
    predictionScenario?: string;
    predictionQuestion?: string;
    predictionAnswer?:   string;
    // ── Socratic Guided & Independent Practice ──
    example:            BlueprintExample;
    guidedSocraticQuestions?: string[];
    independentProblem?: BlueprintExample;
    // ── Misconception & Edge Cases ──
    misconceptionStatement?: string;
    misconceptionExplanation?: string;
    // ── Transfer & Retrieval ──
    transferProblem?:   string;
    transferAnswer?:    string;
    retrievalPrompts?:  string[];
    // ── Summary & Visuals ──
    commonPitfalls:     string[];
    summaryPoints:      string[];
    diagramSvg?:        string | null;
    tableMarkdown?:     string | null;
    diagramCaption?:    string;
}

export interface SynthesisProblem {
    problem: string;
    integratedConcepts: string[];
    givens: { symbol: string; value: string; unit?: string }[];
    expectedAnswer: string;
    explanation: string;
    hints: [string, string, string, string];
}

export interface LessonBlueprint {
    title:          string;
    overview:       string;
    concepts:       BlueprintConcept[];
    synthesisProblem?: SynthesisProblem;
    overallSummary: string;
}

export interface UnitPresentationResponse {
    boardLines: string[];
    spokenExplanation: string;
    diagramSvg?: string | null;
    tableMarkdown?: string | null;
    diagramCaption?: string;
    positiveReplyLabel?: string;
    positiveReplyText?: string;
    negativeReplyLabel?: string;
    negativeReplyText?: string;
}

export interface DialogueTurn {
    role: 'tutor' | 'student';
    text: string;
    boardSummary?: string;
}

export interface VoiceTutorialPageProps {
    userProfile?:  UserProfile | null;
    appSettings?:  any;
    onNavigate?:   (tab: string) => void;
    initialSessionData?: VoiceTutorialSessionData | null;
    onBack?:       () => void;
}

// ── Dynamic Action Button Helpers for All 15 Adaptive Phases ──────────────────
function getDefaultActions(step: TutorPhase): {
    positive: { label: string; text: string };
    negative: { label: string; text: string };
} {
    switch (step) {
        case 'diagnostic':
            return {
                positive: { label: "Submit Answer →", text: "I've submitted my answer." },
                negative: { label: "I'm not sure ↺", text: "I don't know the answer to this diagnostic question." },
            };
        case 'concept_map':
            return {
                positive: { label: "Explore Intuition →", text: "I see the roadmap, let's explore the real-world intuition." },
                negative: { label: "Explain Roadmap ↺", text: "Could you clarify what we'll cover in this topic?" },
            };
        case 'intuition':
            return {
                positive: { label: "Makes sense, define it →", text: "I understand the real-world idea, let's look at the core meaning." },
                negative: { label: "Another real-world example ↺", text: "Can you give another real-world scenario?" },
            };
        case 'concept_core':
            return {
                positive: { label: "Let me predict →", text: "The physical meaning is clear, test me with a prediction." },
                negative: { label: "Simpler terms ↺", text: "Can you explain the core meaning in simpler terms?" },
            };
        case 'predict':
            return {
                positive: { label: "Check my prediction →", text: "Here is what I predict will happen." },
                negative: { label: "Give me a hint 💡", text: "Can you give me a hint on what might happen?" },
            };
        case 'formalize':
            return {
                positive: { label: "Formula clear, let's practice →", text: "I follow the equation and variables, let's solve a problem together." },
                negative: { label: "Explain variables & units ↺", text: "Can you walk through the variables and units once more?" },
            };
        case 'multi_represent':
            return {
                positive: { label: "Representations clear →", text: "The graphs and symbols are clear, let's practice." },
                negative: { label: "Explain the visual ↺", text: "Can you walk through this visual representation again?" },
            };
        case 'guided_practice':
            return {
                positive: { label: "Submit Step →", text: "Here is my reasoning for this step." },
                negative: { label: "Need a hint 💡", text: "I need a hint for this step." },
            };
        case 'independent_practice':
            return {
                positive: { label: "Submit My Solution →", text: "I've solved it independently, please check my work." },
                negative: { label: "Give me a hint 💡", text: "Could you give me a hint to get started?" },
            };
        case 'misconception':
            return {
                positive: { label: "I can explain why →", text: "I know why this statement is incorrect." },
                negative: { label: "Explain the trap ↺", text: "Why do students fall into this common misconception?" },
            };
        case 'repair':
            return {
                positive: { label: "Aha! Now I get it →", text: "That explanation makes complete sense now." },
                negative: { label: "Still slightly unclear ↺", text: "Could you explain from another angle?" },
            };
        case 'transfer':
            return {
                positive: { label: "Apply principle →", text: "Here is how this applies to the new situation." },
                negative: { label: "Give context hint 💡", text: "How does our principle relate to this new context?" },
            };
        case 'retrieval':
            return {
                positive: { label: "Recall Concept →", text: "Here is the concept explained from memory." },
                negative: { label: "Prompt my memory ↺", text: "Give me a starting prompt to jog my memory." },
            };
        case 'mastery_decision':
            return {
                positive: { label: "Next Concept →", text: "I'm ready to advance!" },
                negative: { label: "Review Weak Points ↺", text: "Can we reinforce the parts I was shaky on?" },
            };
        case 'synthesis':
            return {
                positive: { label: "Submit Synthesis Solution →", text: "Here is my complete solution combining the concepts." },
                negative: { label: "Synthesis Hint 💡", text: "Give me a hint on how to connect these principles." },
            };
        default:
            return { positive: { label: "Continue →", text: "Continue" }, negative: { label: "Explain ↺", text: "Explain" } };
    }
}

// ── Visual Diagram Helpers with KaTeX Math Rendering ─────────────────────────
function renderKatexInSvg(svgString: string): string {
    return svgString.replace(/<text([^>]*)>([\s\S]*?)<\/text>/gi, (fullMatch, attrStr, content) => {
        const rawContent = content.trim();
        const hasMath = rawContent.includes('$') || /\\(frac|sqrt|text|theta|alpha|beta|gamma|lambda|omega|pi|sum|int|partial|times|cdot|approx|ne|le|ge|pm|infty|vec|hat|bar|dot|ddot|[a-zA-Z]+)/.test(rawContent);
        if (!hasMath) {
            return fullMatch;
        }

        const xMatch = attrStr.match(/\bx=["']?(-?[\d.]+)/i);
        const yMatch = attrStr.match(/\by=["']?(-?[\d.]+)/i);
        const fillMatch = attrStr.match(/\bfill=["']?([^"'\s>]+)/i);
        const sizeMatch = attrStr.match(/\bfont-size=["']?([^"'\s>]+)/i);
        const anchorMatch = attrStr.match(/\btext-anchor=["']?([^"'\s>]+)/i);
        const weightMatch = attrStr.match(/\bfont-weight=["']?([^"'\s>]+)/i);

        const origX = xMatch ? parseFloat(xMatch[1]) : 0;
        const origY = yMatch ? parseFloat(yMatch[1]) : 0;
        const fill = fillMatch ? fillMatch[1] : '#FFFFFF';
        const fontSize = sizeMatch ? sizeMatch[1].replace(/px$/, '') + 'px' : '13px';
        const anchor = anchorMatch ? anchorMatch[1].toLowerCase() : 'start';
        const fontWeight = weightMatch ? weightMatch[1] : 'normal';

        const foWidth = 200;
        const foHeight = 60;

        let foX = origX;
        let justify = 'flex-start';
        let textAlign = 'left';

        if (anchor === 'middle') {
            foX = origX - (foWidth / 2);
            justify = 'center';
            textAlign = 'center';
        } else if (anchor === 'end') {
            foX = origX - foWidth;
            justify = 'flex-end';
            textAlign = 'right';
        }

        const foY = origY - 30;

        let formattedContent = rawContent;
        if (formattedContent.includes('$')) {
            formattedContent = formattedContent
                .replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
                    try {
                        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
                    } catch {
                        return math;
                    }
                })
                .replace(/\$([^\$]+)\$/g, (_, math) => {
                    try {
                        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
                    } catch {
                        return math;
                    }
                });
        } else {
            try {
                formattedContent = katex.renderToString(rawContent, { displayMode: false, throwOnError: false });
            } catch {
                formattedContent = rawContent;
            }
        }

        return `<foreignObject x="${foX}" y="${foY}" width="${foWidth}" height="${foHeight}" overflow="visible">
  <div xmlns="http://www.w3.org/1999/xhtml" style="color: ${fill}; font-size: ${fontSize}; font-family: system-ui, -apple-system, sans-serif; font-weight: ${fontWeight}; display: flex; align-items: center; justify-content: ${justify}; text-align: ${textAlign}; width: 100%; height: 100%; pointer-events: none; line-height: 1.1;">
    ${formattedContent}
  </div>
</foreignObject>`;
    });
}

function sanitizeSvg(rawSvg: string | null | undefined): string | null {
    if (!rawSvg || typeof rawSvg !== 'string') return null;
    let cleaned = rawSvg.trim();
    cleaned = cleaned.replace(/^```(?:xml|svg|html)?\s*/i, '').replace(/```$/i, '').trim();

    const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
    if (match) {
        cleaned = match[0];
    } else if (!cleaned.startsWith('<svg')) {
        return null;
    }

    if (!cleaned.includes('viewBox')) {
        cleaned = cleaned.replace(/<svg/i, '<svg viewBox="0 0 420 220"');
    }
    if (!cleaned.includes('xmlns=')) {
        cleaned = cleaned.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const defs = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#D9CCBC" /></marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38BDF8" /></marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#F87171" /></marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#34D399" /></marker>
    <marker id="arrow-amber" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FBBF24" /></marker>
    <marker id="arrow-purple" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#A78BFA" /></marker>
    <linearGradient id="grad-blue" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38BDF8" stop-opacity="0.35"/><stop offset="100%" stop-color="#0284C7" stop-opacity="0.12"/></linearGradient>
    <linearGradient id="grad-emerald" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34D399" stop-opacity="0.35"/><stop offset="100%" stop-color="#059669" stop-opacity="0.12"/></linearGradient>
    <linearGradient id="grad-amber" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FBBF24" stop-opacity="0.35"/><stop offset="100%" stop-color="#D97706" stop-opacity="0.12"/></linearGradient>
    <linearGradient id="grad-purple" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#A78BFA" stop-opacity="0.35"/><stop offset="100%" stop-color="#7C3AED" stop-opacity="0.12"/></linearGradient>
    <linearGradient id="grad-dark" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#1E293B" stop-opacity="0.9"/><stop offset="100%" stop-color="#0F172A" stop-opacity="0.95"/></linearGradient>
    <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
  </defs>`;

    if (cleaned.includes('<defs>')) {
        cleaned = cleaned.replace(/<defs>/i, `<defs>${defs.replace('<defs>', '').replace('</defs>', '')}`);
    } else {
        cleaned = cleaned.replace(/<svg([^>]*)>/i, `<svg$1>${defs}`);
    }

    cleaned = renderKatexInSvg(cleaned);
    return cleaned;
}

// ── Pure Board Content Generators for Fallback ────────────────────────────────
function getBoardLines(concept: BlueprintConcept, step: TutorPhase, activeDiagIdx = 0): string[] {
    switch (step) {
        case 'diagnostic': {
            const diag = concept.diagnosticQuestions?.[activeDiagIdx];
            if (diag) {
                const lines = [`**Diagnostic Check** (${diag.dimension}):`, diag.question];
                if (diag.options && diag.options.length > 0) {
                    diag.options.forEach((opt, i) => lines.push(`${String.fromCharCode(65 + i)}) ${opt}`));
                }
                return lines;
            }
            return [
                `**Diagnostic Check**: ${concept.conceptName}`,
                `Before we begin, how would you define or calculate ${concept.conceptName}?`,
            ];
        }
        case 'concept_map':
            return [
                `**Topic Roadmap**: ${concept.conceptName}`,
                `**Core Goal**: Master physical intuition, governing laws, and problem solving.`,
                `**Key Distinctions**: ${concept.keyDistinction || 'Direction, units, and boundaries.'}`,
            ];
        case 'intuition':
            return [
                `**Real-World Question**: ${concept.relatableQuestion}`,
                `**Physical Scenario**: ${concept.realWorldScenario || 'Everyday physical phenomenon'}`,
                `**Intuitive Meaning**: ${concept.physicalMeaning || concept.keyDefinition}`,
            ];
        case 'concept_core':
            return [
                `**Core Definition**: ${concept.keyDefinition}`,
                `**Physical Principle**: ${concept.physicalMeaning || concept.keyDefinition}`,
                `**Golden Rule**: ${concept.goldenRule || 'Consistent physical behavior.'}`,
            ];
        case 'predict':
            return [
                `**Predictive Challenge**: ${concept.predictionScenario || concept.realWorldScenario || 'Think about this system.'}`,
                `**Question**: ${concept.predictionQuestion || concept.relatableQuestion || 'What happens next?'}`,
                `*State your prediction before we reveal the mathematical model.*`,
            ];
        case 'formalize': {
            const lines: string[] = [];
            if (concept.formula) lines.push(concept.formula);
            if (concept.variables && concept.variables.length > 0) {
                concept.variables.slice(0, 4).forEach(v => {
                    lines.push(`$${v.symbol}$ $\\rightarrow$ ${v.meaning} ($${v.unit || '\\text{SI}'}$)`);
                });
            }
            return lines.length > 0 ? lines : [`$$${concept.conceptName} = f(x)$$`];
        }
        case 'multi_represent':
            return [
                `**Multiple Representations of ${concept.conceptName}**:`,
                `• **Verbal**: ${concept.keyDefinition}`,
                `• **Symbolic**: ${concept.formula || 'Governing algebraic form'}`,
                `• **Rule**: ${concept.goldenRule || 'Core invariant'}`,
            ];
        case 'guided_practice': {
            const ex = concept.example;
            return [
                `**Guided Socratic Example**: ${ex?.problem || `Calculate ${concept.conceptName}`}`,
                `**Given**: ` + (ex?.givens?.map(g => `$${g.symbol} = ${g.value}$ $${g.unit || ''}$`).join(', ') || 'Knowns'),
                `**Target**: Find ${ex?.find || 'the unknown quantity'}`,
            ];
        }
        case 'independent_practice': {
            const ind = concept.independentProblem || concept.example;
            return [
                `**Independent Problem (Solve on your own)**:`,
                ind?.problem || `Calculate the parameters for ${concept.conceptName}.`,
                `*Try solving without looking at previous steps. Ask for a hint if stuck.*`,
            ];
        }
        case 'misconception':
            return [
                `**Common Pitfall & Trap**:`,
                `"${concept.misconceptionStatement || concept.commonPitfalls?.[0] || 'Students often confuse the sign or direction.'}"`,
                `*Do you agree or disagree? Explain why.*`,
            ];
        case 'repair':
            return [
                `**Targeted Conceptual Repair**: ${concept.conceptName}`,
                `Let's look at this from a different angle.`,
                `**Golden Rule**: ${concept.goldenRule || 'Observe the fundamental balance.'}`,
            ];
        case 'transfer':
            return [
                `**Transfer Challenge (New Context)**:`,
                concept.transferProblem || `How does ${concept.conceptName} apply when boundary conditions change?`,
                `*Apply the same underlying principle to this novel scenario.*`,
            ];
        case 'retrieval':
            return [
                `**Memory Retrieval Check**:`,
                concept.retrievalPrompts?.[0] || `Without notes: State the core rule and formula for ${concept.conceptName}.`,
            ];
        case 'mastery_decision':
            return [
                `**Concept Mastery Review**: ${concept.conceptName}`,
                `Evaluating conceptual understanding, procedure, transfer, and retrieval.`,
            ];
        case 'synthesis':
            return [
                `**Topic Synthesis Problem**: Integrated Cross-Concept Challenge`,
                `Combine your understanding of all concepts to solve this university-level problem.`,
            ];
        default:
            return [`${concept.conceptName}`];
    }
}

function getSpokenText(concept: BlueprintConcept, step: TutorPhase, activeDiagIdx = 0): string {
    const name = concept.conceptName;
    const ex = concept.example;
    switch (step) {
        case 'diagnostic': {
            const diag = concept.diagnosticQuestions?.[activeDiagIdx];
            return diag
                ? `Let's start with a quick diagnostic check. ${diag.question} What do you think?`
                : `Before we explore ${name}, what is your current understanding of how it works?`;
        }
        case 'concept_map':
            return `Here is our roadmap for ${name}. We will build physical intuition, construct the mathematical model, and practice until you've reached full mastery.`;
        case 'intuition':
            return `Let us explore ${name}. Think about this: ${concept.relatableQuestion || 'What happens when physical quantities interact?'} Picture ${concept.realWorldScenario || 'a real situation'}. What comes to mind?`;
        case 'concept_core':
            return `Here is what ${name} means physically. ${concept.physicalMeaning || concept.keyDefinition}. Notice how it connects directly to our everyday physical intuition.`;
        case 'predict':
            return `Before we look at the math, make a prediction. ${concept.predictionScenario || 'In this setup'}, ${concept.predictionQuestion || 'what do you think will happen?'} State your prediction!`;
        case 'formalize':
            return `Now look at the board. Here is the mathematical formula for ${name}. Notice how each variable represents a specific physical quantity. Let's look at the symbols.`;
        case 'multi_represent':
            return `Notice how ${name} looks across different representations: in words, as an equation, and visually on the board. Each view gives you a deeper mental model.`;
        case 'guided_practice':
            return `Let's work through this problem together. Here is our setup on the board: ${ex?.problem || `Find the key parameters for ${name}`}. What principle or equation should we apply first?`;
        case 'independent_practice':
            return `Now it's your turn to solve a problem independently. Take your time, calculate the result, and let me know your answer. If you get stuck, simply ask for a hint!`;
        case 'misconception':
            return `Here is a classic trap many students fall into: ${concept.misconceptionStatement || 'a common mistake'}. Do you agree with this statement, or what is wrong with it?`;
        case 'repair':
            return `Let us clarify this misunderstanding with a new perspective. Look at the board as we break down the exact relationship.`;
        case 'transfer':
            return `Great! Now let's see if you can transfer this principle to a completely different context: ${concept.transferProblem || 'a new physical application'}. How would you approach this?`;
        case 'retrieval':
            return `To lock this concept into long-term memory: Without looking at your notes, how would you explain ${name} and its governing formula in your own words?`;
        case 'mastery_decision':
            return `Let's review your mastery profile across conceptual reasoning, procedural fluency, and transfer ability.`;
        case 'synthesis':
            return `Outstanding! You have mastered all individual concepts. Now, let us tackle an integrated synthesis problem that brings all these principles together!`;
        default:
            return '';
    }
}

// ── Component ─────────────────────────────────────────────────────────────────
export const VoiceTutorialPage: React.FC<VoiceTutorialPageProps> = ({
    userProfile,
    appSettings: propAppSettings,
    onNavigate,
    initialSessionData,
    onBack,
}) => {
    const { settings: hookAppSettings } = useAppSettings();
    const appSettings = propAppSettings || hookAppSettings;
    const { addToast } = useToast();

    // ── Session & State ──────────────────────────────────────────────────
    const [sessionData, setSessionData] = useState<VoiceTutorialSessionData | null>(initialSessionData || null);
    const [blueprint, setBlueprint] = useState<LessonBlueprint | null>(null);
    const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);
    const [blueprintGenStep, setBlueprintGenStep] = useState('');
    const [isModelDownloading, setIsModelDownloading] = useState(false);
    const [modelDownloadProgress, setModelDownloadProgress] = useState(0);
    const [showScannedImageModal, setShowScannedImageModal] = useState(false);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [limitModalData, setLimitModalData] = useState<{ cost: number; balance: number }>({ cost: 1, balance: 0 });

    // ── Teaching Position & Adaptive State Machine ────────────────────────
    const [conceptIdx, setConceptIdx] = useState(0);
    const [subStep, setSubStep] = useState<TutorPhase>('diagnostic');
    const [activePhasePath, setActivePhasePath] = useState<TutorPhase[]>(['diagnostic']);
    const [phaseIdx, setPhaseIdx] = useState(0);
    const [conceptMastery, setConceptMastery] = useState<DimensionalMastery>(() => defaultMastery());
    const [difficultyState, setDifficultyState] = useState<DifficultyState>(() => createInitialDifficultyState(2));
    const [hintState, setHintState] = useState<HintState>(() => createInitialHintState('init'));
    const [repairAttempt, setRepairAttempt] = useState(0);
    const [repairStrategiesUsed, setRepairStrategiesUsed] = useState<RepairStrategy[]>([]);
    const [activeDiagnosticIdx, setActiveDiagnosticIdx] = useState(0);
    const [activeLearningQuestion, setActiveLearningQuestion] = useState<LearningQuestion | null>(null);
    const [isDone, setIsDone] = useState(false);

    // ── Dynamic Action Buttons ───────────────────────────────────────────
    const [positiveAction, setPositiveAction] = useState<{ label: string; text: string }>(
        getDefaultActions('diagnostic').positive
    );
    const [negativeAction, setNegativeAction] = useState<{ label: string; text: string }>(
        getDefaultActions('diagnostic').negative
    );

    // ── Board State ──────────────────────────────────────────────────────
    const [visibleBoardLines, setVisibleBoardLines] = useState<string[]>([]);
    const [activeWritingIndex, setActiveWritingIndex] = useState<number>(-1);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isLoadingUnit, setIsLoadingUnit] = useState(false);
    const [activeDiagramSvg, setActiveDiagramSvg] = useState<string | null>(null);
    const [activeTableMarkdown, setActiveTableMarkdown] = useState<string | null>(null);
    const [activeVisualCaption, setActiveVisualCaption] = useState<string | null>(null);
    const [diagramKey, setDiagramKey] = useState(0);
    const [isDiagramZoomed, setIsDiagramZoomed] = useState(false);

    // ── Audio / Mic / Input / Image Attachment ────────────────────────────
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isTtsLoading, setIsTtsLoading] = useState(false);
    const [isMicListening, setIsMicListening] = useState(false);
    const [textInput, setTextInput] = useState('');
    const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string } | null>(null);
    const [isNavigatingBack, setIsNavigatingBack] = useState(false);
    const [micDisplay, setMicDisplay] = useState('');
    const [selectedVoice, setSelectedVoice] = useState<KittenVoice>(() => kittenTts.getSelectedVoice());
    const [showVoiceModal, setShowVoiceModal] = useState(false);
    const [previewingVoice, setPreviewingVoice] = useState<KittenVoice | null>(null);
    const previewPlayerRef = useRef<{ stop: () => void } | null>(null);

    // ── Subscribe to voice updates ────────────────────────────────────────
    useEffect(() => {
        const unsubscribe = kittenTts.subscribe((status) => {
            setSelectedVoice(status.selectedVoice);
        });
        return () => unsubscribe();
    }, []);

    // ── Refs ─────────────────────────────────────────────────────────────
    const fileInputRef              = useRef<HTMLInputElement | null>(null);
    const isActiveRef               = useRef(true);
    const hasStartedRef             = useRef(false);
    const conceptIdxRef             = useRef(0);
    const subStepRef                = useRef<TutorPhase>('diagnostic');
    const activePhasePathRef        = useRef<TutorPhase[]>(['diagnostic']);
    const phaseIdxRef               = useRef(0);
    const conceptMasteryRef         = useRef<DimensionalMastery>(defaultMastery());
    const difficultyStateRef        = useRef<DifficultyState>(createInitialDifficultyState(2));
    const hintStateRef              = useRef<HintState>(createInitialHintState('init'));
    const repairAttemptRef          = useRef(0);
    const repairStrategiesUsedRef   = useRef<RepairStrategy[]>([]);
    const diagnosticAnswersRef      = useRef<{ questionIdx: number; correct: boolean; dimension: string }[]>([]);
    const activeDiagnosticIdxRef    = useRef(0);
    const activeLearningQuestionRef = useRef<LearningQuestion | null>(null);

    const pendingBoardLinesRef      = useRef<string[]>([]);
    const pendingVisualsRef         = useRef<{ svg: string | null; table: string | null; caption: string | null }>({ svg: null, table: null, caption: null });

    const audioContextRef           = useRef<AudioContext | null>(null);
    const currentAudioRef           = useRef<AudioBufferSourceNode | null>(null);
    const playSessionIdRef          = useRef<number>(0);
    const recognitionRef            = useRef<any>(null);
    const spokenTextRef             = useRef('');
    const lastSpokenTextRef         = useRef('');
    const handleStudentReplyRef     = useRef<(reply: string, image?: { base64: string; mimeType: string } | null) => Promise<void>>(() => Promise.resolve());
    const streamTimersRef           = useRef<ReturnType<typeof setTimeout>[]>([]);
    const dialogueHistoryRef        = useRef<DialogueTurn[]>([]);

    // Keep state refs in sync
    useEffect(() => { conceptIdxRef.current = conceptIdx; }, [conceptIdx]);
    useEffect(() => { subStepRef.current = subStep; }, [subStep]);
    useEffect(() => { activePhasePathRef.current = activePhasePath; }, [activePhasePath]);
    useEffect(() => { phaseIdxRef.current = phaseIdx; }, [phaseIdx]);
    useEffect(() => { conceptMasteryRef.current = conceptMastery; }, [conceptMastery]);
    useEffect(() => { difficultyStateRef.current = difficultyState; }, [difficultyState]);
    useEffect(() => { hintStateRef.current = hintState; }, [hintState]);
    useEffect(() => { repairAttemptRef.current = repairAttempt; }, [repairAttempt]);
    useEffect(() => { repairStrategiesUsedRef.current = repairStrategiesUsed; }, [repairStrategiesUsed]);
    useEffect(() => { activeDiagnosticIdxRef.current = activeDiagnosticIdx; }, [activeDiagnosticIdx]);
    useEffect(() => { activeLearningQuestionRef.current = activeLearningQuestion; }, [activeLearningQuestion]);

    // ── Unmount / Cleanup ─────────────────────────────────────────────────
    useEffect(() => {
        isActiveRef.current = true;
        return () => {
            isActiveRef.current = false;
            stopAudioImmediate();
            clearAllStreamTimers();
            stopMicImmediate();
        };
    }, []);

    // ── Load Session Data ─────────────────────────────────────────────────
    useEffect(() => {
        if (initialSessionData?.course) {
            setSessionData(initialSessionData);
            return;
        }
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
    }, [initialSessionData, userProfile?.level]);

    // ── Bootstrap session ─────────────────────────────────────────────────
    useEffect(() => {
        if (!sessionData || hasStartedRef.current) return;
        hasStartedRef.current = true;
        void bootstrapSession();
    }, [sessionData]);

    // ── Audio & Mic Functions ─────────────────────────────────────────────
    function stopAudioImmediate() {
        playSessionIdRef.current++;
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

    const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const positiveActionRef   = useRef<{ label: string; text: string }>(
        getDefaultActions('intuition_hook').positive
    );

    const clearAutoAdvanceTimer = useCallback(() => {
        if (autoAdvanceTimerRef.current) {
            clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
        }
    }, []);

    const scheduleAutoAdvance = useCallback((delayMs = 2200) => {
        clearAutoAdvanceTimer();
        if (!isActiveRef.current || isPaused || isGeneratingBlueprint) return;
        autoAdvanceTimerRef.current = setTimeout(() => {
            if (!isActiveRef.current || isPaused || isGeneratingBlueprint) return;
            // Swiftly advance to next board with current affirmative action
            void handleStudentReplyRef.current(positiveActionRef.current.text, null);
        }, delayMs);
    }, [clearAutoAdvanceTimer, isPaused, isGeneratingBlueprint]);

    const startMicListening = useCallback(() => {
        if (!isActiveRef.current || isPaused) return;
        clearAutoAdvanceTimer();
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            // If SpeechRecognition not available on browser, swiftly auto-advance
            scheduleAutoAdvance(2500);
            return;
        }
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
                const t = Array.from(e.results).map((r: any) => r[0].transcript).join(' ').trim();
                spokenTextRef.current = t;
                if (isActiveRef.current) setMicDisplay(t);
            };
            rec.onend = () => {
                if (!isActiveRef.current) return;
                setIsMicListening(false);
                const final = spokenTextRef.current.trim();
                spokenTextRef.current = '';
                setMicDisplay('');
                if (final.length > 0) {
                    addToast(`Heard: "${final}"`, 'info');
                    void handleStudentReplyRef.current(final, attachedImage);
                } else {
                    // No reply spoken by student -> swiftly auto-advance to next board
                    scheduleAutoAdvance(2200);
                }
            };
            rec.onerror = () => {
                if (isActiveRef.current) {
                    setIsMicListening(false);
                    scheduleAutoAdvance(2500);
                }
            };
            recognitionRef.current = rec;
            rec.start();
        } catch (_) {
            setIsMicListening(false);
            scheduleAutoAdvance(2500);
        }
    }, [addToast, attachedImage, clearAutoAdvanceTimer, scheduleAutoAdvance, isPaused]);

    // ── Dedicated Pure Gemini Natural Voice (Charon) Engine ─────────────────
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
                    .replace(/\\rightarrow/g, ' is ')
                    .replace(/\\Delta/g, 'change in ');
            })
            .replace(/[#*`_~]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // ── Progressive Line-by-Line Chalk Reveal (Synchronized with Voice) ────────
    const revealLinesProgressively = useCallback((lines: string[], spokenText?: string) => {
        clearAllStreamTimers();
        if (!lines || lines.length === 0) {
            setVisibleBoardLines([]);
            setIsStreaming(false);
            setActiveWritingIndex(-1);
            return;
        }

        setIsStreaming(true);
        const wordCount = spokenText ? spokenText.split(/\s+/).length : 25;
        const totalEstMs = Math.max(3000, wordCount * 360);
        const lineCount = lines.length;
        const lineIntervalMs = Math.max(1800, Math.min(4200, Math.floor(totalEstMs / Math.max(lineCount, 1))));

        // Reveal Line 0 immediately with chalk active indicator
        setVisibleBoardLines([lines[0]]);
        setActiveWritingIndex(0);

        // Schedule subsequent lines bit-by-bit
        for (let i = 1; i < lineCount; i++) {
            const timer = setTimeout(() => {
                if (!isActiveRef.current) return;
                setVisibleBoardLines(lines.slice(0, i + 1));
                setActiveWritingIndex(i);
            }, i * lineIntervalMs);
            streamTimersRef.current.push(timer);
        }

        // Settle all lines into clean chalk white when complete
        const finishTimer = setTimeout(() => {
            if (!isActiveRef.current) return;
            setVisibleBoardLines(lines.slice(0, MAX_BOARD_LINES));
            setIsStreaming(false);
            setActiveWritingIndex(-1);
        }, lineCount * lineIntervalMs);
        streamTimersRef.current.push(finishTimer);
    }, [clearAllStreamTimers]);

    const streamBoardLines = useCallback((lines: string[], spokenText?: string) => {
        clearAllStreamTimers();
        pendingBoardLinesRef.current = lines.slice(0, MAX_BOARD_LINES);
        if (isMuted || !isTtsLoading) {
            revealLinesProgressively(pendingBoardLinesRef.current, spokenText);
        } else {
            setVisibleBoardLines([]);
            setIsStreaming(true);
            setActiveWritingIndex(-1);
        }
    }, [clearAllStreamTimers, isMuted, isTtsLoading, revealLinesProgressively]);

    const speakText = useCallback(async (
        text: string,
        onEnd?: () => void,
        linesToReveal?: string[]
    ): Promise<void> => {
        if (!isActiveRef.current || !text) {
            onEnd?.();
            if (!isMuted) startMicListening();
            return;
        }

        const lines = (linesToReveal && linesToReveal.length > 0)
            ? linesToReveal.slice(0, MAX_BOARD_LINES)
            : pendingBoardLinesRef.current;
        pendingBoardLinesRef.current = lines;

        stopAudioImmediate();
        clearAllStreamTimers();
        setIsPaused(false);
        lastSpokenTextRef.current = text;

        if (isMuted) {
            setIsTtsLoading(false);
            setIsSpeaking(false);
            revealLinesProgressively(lines, text);

            if (pendingVisualsRef.current.svg) {
                setActiveDiagramSvg(pendingVisualsRef.current.svg);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(pendingVisualsRef.current.caption);
                setDiagramKey(k => k + 1);
            } else if (pendingVisualsRef.current.table) {
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(pendingVisualsRef.current.table);
                setActiveVisualCaption(pendingVisualsRef.current.caption);
                setDiagramKey(k => k + 1);
            }
            onEnd?.();
            return;
        }

        // Voice is preparing: hide board lines and visuals to prevent premature text display
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
            startMicListening();
            return;
        }

        const player = kittenTts.speak(cleanedText, {
            cleanText: true,
            onStart: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(true);
                setIsTtsLoading(false);

                // Voice has started speaking: begin progressive line-by-line chalk write-in
                revealLinesProgressively(pendingBoardLinesRef.current, cleanedText);

                if (pendingVisualsRef.current.svg) {
                    setActiveDiagramSvg(pendingVisualsRef.current.svg);
                    setActiveTableMarkdown(null);
                    setActiveVisualCaption(pendingVisualsRef.current.caption);
                    setDiagramKey(k => k + 1);
                } else if (pendingVisualsRef.current.table) {
                    setActiveDiagramSvg(null);
                    setActiveTableMarkdown(pendingVisualsRef.current.table);
                    setActiveVisualCaption(pendingVisualsRef.current.caption);
                    setDiagramKey(k => k + 1);
                }
            },
            onEnd: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                setIsPaused(false);
                setIsTtsLoading(false);
                currentAudioRef.current = null;

                // Ensure all lines are revealed and active writing marker clears
                setVisibleBoardLines(pendingBoardLinesRef.current);
                setIsStreaming(false);
                setActiveWritingIndex(-1);

                onEnd?.();
                startMicListening();
            },
            onError: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                setIsPaused(false);
                setIsTtsLoading(false);
                currentAudioRef.current = null;

                // Fallback progressive reveal
                revealLinesProgressively(pendingBoardLinesRef.current, cleanedText);
                if (pendingVisualsRef.current.svg) {
                    setActiveDiagramSvg(pendingVisualsRef.current.svg);
                } else if (pendingVisualsRef.current.table) {
                    setActiveTableMarkdown(pendingVisualsRef.current.table);
                }

                onEnd?.();
                startMicListening();
            },
        });

        currentAudioRef.current = player as any;
    }, [isMuted, startMicListening, clearAllStreamTimers, revealLinesProgressively]);

    function normalizeBlueprint(bp: any): LessonBlueprint {
        if (!bp || typeof bp !== 'object') {
            return {
                title: 'Adaptive STEM Tutorial',
                overview: 'Adaptive, student-driven interactive lesson.',
                concepts: [],
                overallSummary: 'Comprehensive tutorial completed.',
            };
        }
        const rawConcepts = Array.isArray(bp.concepts) ? bp.concepts : [];
        const concepts: BlueprintConcept[] = rawConcepts.map((c: any, i: number) => {
            const cName = c.conceptName || `Concept ${i + 1}`;
            const ex = c.example || {};
            const ind = c.independentProblem || ex;
            const diags: DiagnosticQuestionItem[] = Array.isArray(c.diagnosticQuestions) && c.diagnosticQuestions.length > 0
                ? c.diagnosticQuestions.map((d: any, dIdx: number) => ({
                    id: d.id || `diag_${i}_${dIdx}`,
                    question: d.question || `What is your understanding of ${cName}?`,
                    type: d.type || (d.options ? 'multiple_choice' : 'open_ended'),
                    options: Array.isArray(d.options) ? d.options : undefined,
                    correctAnswer: d.correctAnswer || cName,
                    dimension: d.dimension || (dIdx === 0 ? 'prerequisiteKnowledge' : dIdx === 1 ? 'conceptualUnderstanding' : 'proceduralFluency'),
                    difficulty: (d.difficulty || 2) as QuestionDifficulty,
                    prerequisiteConcept: d.prerequisiteConcept || cName,
                    hints: Array.isArray(d.hints) && d.hints.length === 4 ? d.hints : [
                        `Think about the physical meaning of ${cName}.`,
                        `Consider what law connects these quantities.`,
                        `Look at the equation relating the variables.`,
                        `Substitute the given values into the formula.`
                    ],
                }))
                : [
                    {
                        id: `diag_${i}_0`,
                        question: `Before we explore ${cName}, how would you describe what happens physically when forces or variables interact?`,
                        type: 'open_ended',
                        correctAnswer: c.keyDefinition || cName,
                        dimension: 'prerequisiteKnowledge',
                        difficulty: 2,
                        prerequisiteConcept: 'Foundations',
                        hints: [
                            `Think about everyday physical objects.`,
                            `Consider how energy or forces transfer.`,
                            `Focus on cause and effect.`,
                            `State the basic relationship.`
                        ],
                    }
                ];

            return {
                conceptName: cName,
                diagnosticQuestions: diags,
                relatableQuestion: c.relatableQuestion || `What happens in real physical situations involving ${cName}?`,
                realWorldScenario: c.realWorldScenario || `Everyday practical interaction with ${cName}`,
                keyDefinition: c.keyDefinition || `Fundamental definition and role of ${cName}`,
                physicalMeaning: c.physicalMeaning || c.keyDefinition || `Physical intuition and meaning of ${cName}`,
                progressionTable: c.progressionTable || '| State | Value | Meaning |\n| :---: | :---: | :--- |\n| Initial | 0 | Rest |',
                formula: c.formula || '',
                variables: Array.isArray(c.variables) ? c.variables : [],
                keyDistinction: c.keyDistinction || 'Pay attention to units, direction, and boundary limits.',
                goldenRule: c.goldenRule || 'Physical laws remain consistent across coordinate frames.',
                predictionScenario: c.predictionScenario || c.realWorldScenario || `Consider a physical system where ${cName} changes.`,
                predictionQuestion: c.predictionQuestion || `If we double the input, what will happen to the output?`,
                predictionAnswer: c.predictionAnswer || `It scales proportionally according to the governing formula.`,
                example: {
                    problem: ex.problem || `Calculate the governing parameters for ${cName}.`,
                    givens: Array.isArray(ex.givens) ? ex.givens : [{ symbol: 'x', value: '10', unit: 'units' }],
                    find: ex.find || `The primary value of ${cName}`,
                    step1: {
                        stepNumber: 1,
                        title: ex.step1?.title || 'Identify Principle & Formula',
                        explanation: ex.step1?.explanation || 'Relate knowns to unknown.',
                        formula: ex.step1?.formula || c.formula || 'y = f(x)',
                        mathExpression: ex.step1?.mathExpression || c.formula || 'y = f(x)',
                    },
                    step2: {
                        stepNumber: 2,
                        title: ex.step2?.title || 'Substitute Values & Calculate',
                        explanation: ex.step2?.explanation || 'Substitute known numerical values.',
                        mathExpression: ex.step2?.mathExpression || 'y = 10',
                    },
                    step3: {
                        stepNumber: 3,
                        title: ex.step3?.title || 'Final Result & Verification',
                        explanation: ex.step3?.explanation || 'Verify units and physical meaning.',
                        mathExpression: ex.step3?.mathExpression || ex.answer || '10\\text{ units}',
                    },
                    answer: ex.answer || '10\\text{ units}',
                    physicalTakeaway: ex.physicalTakeaway || 'Result is dimensionally consistent.',
                    hints: Array.isArray(ex.hints) && ex.hints.length === 4 ? ex.hints : [
                        `Identify which quantity is given and what we need to find.`,
                        `Select the governing equation connecting our knowns.`,
                        `Rearrange the equation for the target unknown.`,
                        `Substitute values and verify the final units.`
                    ],
                },
                guidedSocraticQuestions: Array.isArray(c.guidedSocraticQuestions) && c.guidedSocraticQuestions.length > 0
                    ? c.guidedSocraticQuestions
                    : ['Which principle or formula should we apply first?', 'What happens when we substitute our known values?', 'What does this final number tell us physically?'],
                independentProblem: {
                    problem: ind.problem || `A system operates with ${cName}. Calculate the resulting unknown parameter.`,
                    givens: Array.isArray(ind.givens) ? ind.givens : [{ symbol: 'm', value: '5', unit: 'kg' }],
                    find: ind.find || `The resulting state`,
                    step1: ind.step1 || { stepNumber: 1, title: 'Principle', explanation: 'Formulate relation', mathExpression: 'F = ma' },
                    step2: ind.step2 || { stepNumber: 2, title: 'Calculation', explanation: 'Compute value', mathExpression: 'a = 4' },
                    step3: ind.step3 || { stepNumber: 3, title: 'Result', explanation: 'Dimension check', mathExpression: '4\\text{ m/s}^2' },
                    answer: ind.answer || '4\\text{ m/s}^2',
                    physicalTakeaway: ind.physicalTakeaway || 'Physical consistency confirmed.',
                    hints: Array.isArray(ind.hints) && ind.hints.length === 4 ? ind.hints : [
                        `Start by listing your given variables and required target.`,
                        `Apply the universal formula we derived.`,
                        `Isolate the target variable algebraically.`,
                        `Perform arithmetic carefully and check standard SI units.`
                    ],
                },
                misconceptionStatement: c.misconceptionStatement || `Heavier objects always accelerate faster regardless of applied force.`,
                misconceptionExplanation: c.misconceptionExplanation || `Mass provides inertia which resists acceleration ($a = F/m$), so greater mass reduces acceleration for a given force.`,
                transferProblem: c.transferProblem || `How would this principle apply in an orbital or submerged fluid environment?`,
                transferAnswer: c.transferAnswer || `The same conservation and force balance laws hold with buoyant or gravitational field adjustments.`,
                retrievalPrompts: Array.isArray(c.retrievalPrompts) && c.retrievalPrompts.length > 0
                    ? c.retrievalPrompts
                    : [`State the governing formula for ${cName} and explain what each variable represents physically.`],
                commonPitfalls: Array.isArray(c.commonPitfalls) ? c.commonPitfalls : ['Forgetting vector direction', 'Mixing units'],
                summaryPoints: Array.isArray(c.summaryPoints) && c.summaryPoints.length > 0 ? c.summaryPoints : ['Concept locked in.'],
            };
        });

        return {
            title: bp.title || 'Adaptive STEM Tutorial',
            overview: bp.overview || 'Adaptive student-driven tutorial.',
            concepts,
            synthesisProblem: bp.synthesisProblem || {
                problem: `Integrate the core principles learned in this topic to solve for the overall equilibrium of the system.`,
                integratedConcepts: concepts.map(c => c.conceptName),
                givens: [{ symbol: 'K', value: '100', unit: 'N/m' }],
                expectedAnswer: 'Verified result',
                explanation: 'Combines multiple laws across all concepts.',
                hints: [
                    `Break the complex problem into sub-systems matching our learned concepts.`,
                    `Apply the first concept equation to find the intermediate state.`,
                    `Substitute intermediate results into the second governing law.`,
                    `Verify overall dimensional consistency and physical limits.`
                ],
            },
            overallSummary: bp.overallSummary || 'Topic successfully completed with demonstrated mastery.',
        };
    }

    // ── Master Adaptive Blueprint Generation ──────────────────────────────────
    const generateBlueprint = useCallback(async (session: VoiceTutorialSessionData, studentMem?: StudentCognitiveProfile | null): Promise<LessonBlueprint | null> => {
        setIsGeneratingBlueprint(true);
        setBlueprintGenStep('Designing adaptive curriculum & diagnostic checks...');

        const aiClient = createAvelutAI(appSettings, userProfile || null);
        if (!aiClient) { setIsGeneratingBlueprint(false); return null; }

        const courseName = session.course?.course_name || 'Academic Tutorial';
        const topicName  = session.topic?.topic_name || 'Core Concepts';
        const level      = session.course?.level || userProfile?.level || 'University';
        const hasImage   = Boolean(session.image);

        setBlueprintGenStep(hasImage ? 'Analyzing scanned problem image & structuring adaptive stages...' : 'Constructing adaptive pedagogical diagnostic and practice modules...');

        const memoryContext = studentMem?.lastTopicTaught
            ? `STUDENT COGNITIVE HISTORY:
- Last Topic: "${studentMem.lastTopicTaught.topicName}"
- Demonstrated Masteries: ${studentMem.overallMasteries.slice(-4).join(', ') || 'Foundations'}
- Struggles: ${studentMem.overallWeakPoints.slice(-4).join(', ') || studentMem.lastTopicTaught.struggledKeyPoints.join(', ') || 'Unit consistency'}`
            : `STUDENT: New learner session.`;

        const imageInstructions = hasImage ? `
*** SCANNED PROBLEM ADAPTIVE TUTORIAL ***
The student uploaded an image of a problem/diagram.
1. Inspect image in detail: equations, geometry, givens, target unknowns.
2. Build the lesson concepts, diagnostics, guided example, and independent practice DIRECTLY around the scanned problem.
` : '';

        const prompt = `You are AVELUT Master STEM Curriculum Architect & Adaptive Learning Engine.
Design an intelligent, adaptive lesson blueprint for:
Course: "${courseName}"
Topic: "${topicName}"
Level: ${level}
${imageInstructions}
${memoryContext}

PEDAGOGICAL REQUIREMENTS:
1. Simplest Words Possible: Explain intuitively in everyday English before formal math.
2. Concrete Real-World Analogies: Always ground abstract laws in familiar physical objects.
3. Diagnostic Questions (2-3 per concept): Design concise diagnostic questions that test prerequisite knowledge, conceptual understanding, and formula application. Include multiple_choice or numeric format with options and 4 progressive hints.
4. Prediction Challenges: Include a prediction scenario for each concept where the student predicts what happens before seeing the math.
5. Socratic Worked Example & Independent Practice: Each concept must have a worked example (3 clear steps) AND a separate independent practice problem with 4 progressive hints.
6. Misconception Traps: Explicitly craft common misunderstandings for the student to defend against.
7. Topic Synthesis Problem: Create 1 integrated problem combining all concepts in this topic.
8. Valid LaTeX Math: Format all math in LaTeX ($...$ or $$...$$).

OUTPUT VALID JSON ONLY:
{
  "title": "${topicName} - Adaptive Tutorial",
  "overview": "2-3 sentence engaging overview",
  "concepts": [
    {
      "conceptName": "Short Concept Name",
      "diagnosticQuestions": [
        {
          "id": "diag_0_0",
          "question": "Clear diagnostic question with LaTeX math",
          "type": "multiple_choice",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "Option A",
          "dimension": "prerequisiteKnowledge",
          "difficulty": 2,
          "prerequisiteConcept": "Foundations",
          "hints": ["Hint 1: Conceptual clue", "Hint 2: Relevant law", "Hint 3: Governing formula", "Hint 4: Step calculation"]
        }
      ],
      "relatableQuestion": "Everyday intuitive question",
      "realWorldScenario": "Concrete everyday scenario",
      "keyDefinition": "Clear physical definition with LaTeX math",
      "physicalMeaning": "Physical intuition of why it behaves this way",
      "progressionTable": "| State | Value | Meaning |\\n| :---: | :---: | :--- |\\n| Initial | 0 | Rest |",
      "formula": "$$LaTeX equation$$",
      "variables": [{"symbol": "a", "meaning": "Acceleration", "unit": "\\text{m/s}^2"}],
      "keyDistinction": "Crucial distinction from commonly confused counterpart",
      "goldenRule": "Memorable Golden Rule",
      "predictionScenario": "Concrete physical setup",
      "predictionQuestion": "What happens when you increase the input?",
      "predictionAnswer": "Direct proportional change according to formula",
      "example": {
        "problem": "Clear problem statement with givens",
        "givens": [{"symbol": "v_i", "value": "0", "unit": "\\text{m/s}"}],
        "find": "Target unknown",
        "step1": {"stepNumber": 1, "title": "Formula Selection", "explanation": "Choose equation", "mathExpression": "v_f = v_i + at"},
        "step2": {"stepNumber": 2, "title": "Substitution", "explanation": "Calculate values", "mathExpression": "v_f = 0 + (2)(5) = 10"},
        "step3": {"stepNumber": 3, "title": "Result & Units", "explanation": "Physical verification", "mathExpression": "v_f = 10\\text{ m/s}"},
        "answer": "10\\text{ m/s}",
        "physicalTakeaway": "Every second added speed.",
        "hints": ["Identify knowns", "Select formula", "Substitute numbers", "Check SI units"]
      },
      "guidedSocraticQuestions": ["Which equation relates our knowns?", "What is the numerical substitution?", "What are the final units?"],
      "independentProblem": {
        "problem": "Independent problem for student to solve alone",
        "givens": [{"symbol": "m", "value": "10", "unit": "\\text{kg}"}],
        "find": "Target quantity",
        "step1": {"stepNumber": 1, "title": "Law", "explanation": "State law", "mathExpression": "F = ma"},
        "step2": {"stepNumber": 2, "title": "Math", "explanation": "Compute", "mathExpression": "a = 5"},
        "step3": {"stepNumber": 3, "title": "Check", "explanation": "Verify", "mathExpression": "5\\text{ m/s}^2"},
        "answer": "5\\text{ m/s}^2",
        "physicalTakeaway": "Consistent with Newton's second law",
        "hints": ["Identify given values", "Use governing equation", "Isolate unknown", "Calculate result"]
      },
      "misconceptionStatement": "Common student misconception statement",
      "misconceptionExplanation": "Detailed scientific reason why it is false",
      "transferProblem": "Application of principle to novel context",
      "transferAnswer": "Explanation of how principle applies in new context",
      "retrievalPrompts": ["Explain formula and physical meaning from memory"],
      "commonPitfalls": ["Sign errors", "Unit mismatch"],
      "summaryPoints": ["Point 1", "Point 2"]
    }
  ],
  "synthesisProblem": {
    "problem": "Integrated multi-concept university problem",
    "integratedConcepts": ["Concept 1", "Concept 2"],
    "givens": [{"symbol": "F", "value": "50", "unit": "\\text{N}"}],
    "expectedAnswer": "Complete numerical result",
    "explanation": "Step-by-step cross-concept solution",
    "hints": ["Deconstruct sub-systems", "Apply first law", "Link intermediate state", "Verify total balance"]
  },
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
                    console.warn('[Blueprint] Failed to format image for AI:', imgErr);
                }
            }
            parts.push({ text: prompt });

            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts }],
                config: { responseMimeType: 'application/json', temperature: 0.35 },
            });
            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty blueprint response');
            const bp: LessonBlueprint = robustParseJson<LessonBlueprint>(raw);
            setIsGeneratingBlueprint(false);
            return bp;
        } catch (err) {
            console.error('[Blueprint] generation failed:', err);
            addToast('Failed to generate lesson blueprint. Please try again.', 'error');
            setIsGeneratingBlueprint(false);
            return null;
        }
    }, [appSettings, userProfile, addToast]);

    // ── Session Bootstrap & SQLite Restore ────────────────────────────────────
    const bootstrapSession = useCallback(async () => {
        if (!sessionData) return;

        const uid = userProfile?.uid || 'anon';
        const cid = sessionData.course?.course_id || 'general';
        const tid = sessionData.topic?.topic_id || 'core';

        const studentMem = await getStudentCognitiveProfile(uid);
        const sqliteRecord = await getLocalVoiceTutorialProgress(uid, cid, tid);
        let bp: LessonBlueprint | null = sqliteRecord?.blueprint ? normalizeBlueprint(sqliteRecord.blueprint) : null;

        if (!bp) {
            const rawBp = await generateBlueprint(sessionData, studentMem);
            if (!rawBp || !isActiveRef.current) return;
            bp = normalizeBlueprint(rawBp);
            await saveLocalVoiceTutorialProgress(uid, cid, tid, 0, 'diagnostic', false, bp, {
                phasePath: ['diagnostic'],
                mastery: defaultMastery(),
                difficultyLevel: 2,
            });
        }

        if (!isActiveRef.current || !bp) return;
        setBlueprint(bp);

        let startConceptIdx = sqliteRecord?.conceptIdx ?? 0;
        let startPhase: TutorPhase = (sqliteRecord?.subStep as TutorPhase) || 'diagnostic';
        let savedPath: TutorPhase[] = (sqliteRecord?.phasePath as TutorPhase[]) || ['diagnostic'];
        let savedMastery: DimensionalMastery = sqliteRecord?.mastery || defaultMastery();
        let savedDifficulty: DifficultyState = createInitialDifficultyState((sqliteRecord?.difficultyLevel || 2) as QuestionDifficulty);

        if (startConceptIdx >= bp.concepts.length) {
            startConceptIdx = 0;
            startPhase = 'diagnostic';
            savedPath = ['diagnostic'];
        }

        setConceptIdx(startConceptIdx);
        setSubStep(startPhase);
        setActivePhasePath(savedPath);
        setPhaseIdx(0);
        setConceptMastery(savedMastery);
        setDifficultyState(savedDifficulty);

        conceptIdxRef.current = startConceptIdx;
        subStepRef.current    = startPhase;
        activePhasePathRef.current = savedPath;
        phaseIdxRef.current   = 0;
        conceptMasteryRef.current = savedMastery;
        difficultyStateRef.current = savedDifficulty;

        const defaultActs = getDefaultActions(startPhase);
        positiveActionRef.current = defaultActs.positive;
        setPositiveAction(defaultActs.positive);
        setNegativeAction(defaultActs.negative);

        // Enforce: Do not continue unless Kitten TTS voice model finishes download
        if (!kittenTts.getStatus().isDownloaded) {
            setIsModelDownloading(true);
            await kittenTts.startBackgroundDownload((p) => {
                if (isActiveRef.current) {
                    setModelDownloadProgress(Math.round(p * 100));
                }
            });
            if (!isActiveRef.current) return;
            setIsModelDownloading(false);
        }

        await presentUnit(bp, startConceptIdx, startPhase, 0, studentMem, true);
    }, [sessionData, userProfile, generateBlueprint]);

    // ── Present Unit (Adaptive Phased Engine) ──────────────────────────────────
    const presentUnit = useCallback(async (
        bp: LessonBlueprint,
        cIdx: number,
        currentPhase: TutorPhase,
        diagIdx = 0,
        studentMem?: StudentCognitiveProfile | null,
        isSessionStart?: boolean,
    ) => {
        if (!isActiveRef.current) return;

        const concept = bp.concepts[cIdx];
        if (!concept && currentPhase !== 'synthesis') {
            setIsDone(true);
            setVisibleBoardLines(['🎓 Topic Complete!', bp.overallSummary]);
            setActiveDiagramSvg(null);
            setActiveTableMarkdown(null);
            setActiveVisualCaption(null);
            void speakText(`Well done! ${bp.overallSummary} You have achieved topic mastery!`);
            return;
        }

        const fallbackActs = getDefaultActions(currentPhase);
        setPositiveAction(fallbackActs.positive);
        setNegativeAction(fallbackActs.negative);
        positiveActionRef.current = fallbackActs.positive;

        setIsLoadingUnit(true);
        setVisibleBoardLines([]);
        setActiveDiagramSvg(null);
        setActiveTableMarkdown(null);
        setActiveVisualCaption(null);

        // Save progress to SQLite & local cache
        const cid = sessionData?.course?.course_id || 'general';
        const tid = sessionData?.topic?.topic_id || 'core';
        void saveLocalVoiceTutorialProgress(userProfile?.uid || 'anon', cid, tid, cIdx, currentPhase, false, bp, {
            phasePath: activePhasePathRef.current,
            mastery: conceptMasteryRef.current,
            difficultyLevel: difficultyStateRef.current.currentLevel,
            repairCount: repairAttemptRef.current,
        });

        // Configure learning question metadata if applicable
        if (currentPhase === 'diagnostic' && concept?.diagnosticQuestions?.[diagIdx]) {
            const dq = concept.diagnosticQuestions[diagIdx];
            const lq: LearningQuestion = {
                id: dq.id,
                question: dq.question,
                expectedAnswer: dq.correctAnswer,
                difficulty: dq.difficulty,
                skill: dq.dimension === 'prerequisiteKnowledge' ? 'recall' : dq.dimension === 'conceptualUnderstanding' ? 'concept' : 'application',
                type: dq.type,
                options: dq.options,
                prerequisiteConcepts: [dq.prerequisiteConcept],
                hints: dq.hints || ['Consider the fundamental definition.', 'Identify the governing rule.', 'Look at the formula.', 'Calculate step by step.'],
            };
            setActiveLearningQuestion(lq);
            setHintState(createInitialHintState(dq.id));
        } else if (currentPhase === 'independent_practice' && concept?.independentProblem) {
            const ind = concept.independentProblem;
            const lq: LearningQuestion = {
                id: `ind_${cIdx}`,
                question: ind.problem,
                expectedAnswer: ind.answer,
                difficulty: difficultyStateRef.current.currentLevel,
                skill: 'application',
                type: 'numeric',
                prerequisiteConcepts: [concept.conceptName],
                hints: ind.hints || ['Identify given values.', 'Formulate equation.', 'Substitute numbers.', 'Check units.'],
            };
            setActiveLearningQuestion(lq);
            setHintState(createInitialHintState(`ind_${cIdx}`));
        } else if (currentPhase === 'synthesis' && bp.synthesisProblem) {
            const sp = bp.synthesisProblem;
            const lq: LearningQuestion = {
                id: `synth_${tid}`,
                question: sp.problem,
                expectedAnswer: sp.expectedAnswer,
                difficulty: 4,
                skill: 'analysis',
                type: 'open_ended',
                prerequisiteConcepts: sp.integratedConcepts,
                hints: sp.hints,
            };
            setActiveLearningQuestion(lq);
            setHintState(createInitialHintState(`synth_${tid}`));
        } else {
            setActiveLearningQuestion(null);
        }

        const repairStrategy = repairStrategiesUsedRef.current[repairStrategiesUsedRef.current.length - 1] || 'simpler_language';
        const repairInstruction = REPAIR_STRATEGY_INSTRUCTIONS[repairStrategy] || 'Explain in simpler words.';

        const memoryOpening = (isSessionStart && cIdx === 0 && currentPhase === 'diagnostic' && studentMem?.lastTopicTaught)
            ? `OPENING MEMORY CONTEXT: The student previously completed "${studentMem.lastTopicTaught.topicName}". Welcome them warmly before starting diagnostic check.`
            : '';

        const phaseInstructions: Record<TutorPhase, string> = {
            diagnostic: `PHASE 0: DIAGNOSTIC PREREQUISITE CHECK for "${concept?.conceptName}".
${memoryOpening}
Diagnostic Question ${diagIdx + 1}: "${concept?.diagnosticQuestions?.[diagIdx]?.question || `How does ${concept?.conceptName} work?`}"
- spokenExplanation: (2-3 sentences). Warmly pose this diagnostic question. Ask the student what they think or to choose an option.
- boardLines: Show the diagnostic question clearly with options if available.
- positiveReplyLabel: "Submit Answer →"
- negativeReplyLabel: "I'm not sure ↺"`,

            concept_map: `PHASE 1: CONCEPT MAP & ROADMAP for "${concept?.conceptName}".
- spokenExplanation: (3-4 sentences). Present the learning objective and big-picture roadmap. Explain what we will master.
- boardLines[0]: "**Learning Roadmap**: ${concept?.conceptName}"
- boardLines[1]: "**Core Goal**: Master physical intuition & problem solving"
- boardLines[2]: "**Key Focus**: ${concept?.keyDistinction || 'Boundaries & principles'}"
- positiveReplyLabel: "Explore Intuition →"
- negativeReplyLabel: "Explain Roadmap ↺"`,

            intuition: `PHASE 2: REAL-WORLD INTUITION for "${concept?.conceptName}".
Relatable Question: ${concept?.relatableQuestion}
Everyday Scenario: ${concept?.realWorldScenario}
- spokenExplanation: (3-4 sentences). Ground the concept in everyday physical experience using concrete physical objects.
- boardLines[0]: "**Question**: ${concept?.relatableQuestion}"
- boardLines[1]: "**Physical Scenario**: ${concept?.realWorldScenario}"
- boardLines[2]: "**Intuitive Meaning**: ${concept?.physicalMeaning || concept?.keyDefinition}"
- diagramSvg: Labeled physical scenario sketch (e.g. car, ruler, diving board, circuit).
- positiveReplyLabel: "Makes sense, define it →"
- negativeReplyLabel: "Another real-world example ↺"`,

            concept_core: `PHASE 3: CORE MENTAL MODEL for "${concept?.conceptName}".
Definition: ${concept?.keyDefinition}
Physical Meaning: ${concept?.physicalMeaning}
- spokenExplanation: (3-4 sentences). Break down the core physical meaning and golden rule.
- boardLines[0]: "${concept?.keyDefinition}"
- boardLines[1]: "**Physical Meaning**: ${concept?.physicalMeaning}"
- boardLines[2]: "**Golden Rule**: ${concept?.goldenRule}"
- positiveReplyLabel: "Let me predict →"
- negativeReplyLabel: "Simpler terms ↺"`,

            predict: `PHASE 4: STUDENT PREDICTION CHALLENGE for "${concept?.conceptName}".
Prediction Scenario: ${concept?.predictionScenario || concept?.realWorldScenario}
Prediction Question: ${concept?.predictionQuestion}
- spokenExplanation: (3-4 sentences). Challenge the student to predict what will happen in this scenario BEFORE revealing the formula. Ask for their prediction.
- boardLines[0]: "**Predictive Challenge**: ${concept?.predictionScenario || concept?.realWorldScenario}"
- boardLines[1]: "**Question**: ${concept?.predictionQuestion}"
- boardLines[2]: "*State your prediction before looking at the formula.*"
- positiveReplyLabel: "Check my prediction →"
- negativeReplyLabel: "Give me a hint 💡"`,

            formalize: `PHASE 5: MATHEMATICAL FORMALIZATION for "${concept?.conceptName}".
Formula: ${concept?.formula || 'Core Equation'}
Progression Table: ${concept?.progressionTable}
- spokenExplanation: (3-4 sentences). Show how the mathematical equation quantifies our physical intuition. Walk through the variables and units.
- boardLines[0]: "${concept?.formula || '$$v_f = v_i + at$$'}"
- boardLines[1-3]: Variable breakdown with LaTeX units.
- tableMarkdown: Markdown table of states if helpful.
- positiveReplyLabel: "Formula clear, let's practice →"
- negativeReplyLabel: "Explain variables & units ↺"`,

            multi_represent: `PHASE 6: MULTIPLE REPRESENTATIONS for "${concept?.conceptName}".
- spokenExplanation: (3-4 sentences). Contrast verbal, symbolic, and diagrammatic views of the concept.
- boardLines[0]: "**Verbal**: ${concept?.keyDefinition}"
- boardLines[1]: "**Symbolic**: ${concept?.formula}"
- boardLines[2]: "**Key Invariant**: ${concept?.goldenRule}"
- diagramSvg: Clean visual representation of the concept.
- positiveReplyLabel: "Representations clear →"
- negativeReplyLabel: "Explain the visual ↺"`,

            guided_practice: `PHASE 7: SOCRATIC GUIDED PRACTICE for "${concept?.conceptName}".
Problem: ${concept?.example?.problem}
- spokenExplanation: (3-4 sentences). Present the problem and ask the student Socratic questions on what principle or formula to apply.
- boardLines[0]: "**Guided Example**: ${concept?.example?.problem}"
- boardLines[1]: "**Given**: ${concept?.example?.givens ? concept.example.givens.map(g => '$' + g.symbol + ' = ' + g.value + '$ ' + (g.unit || '')).join(', ') : 'Knowns'}"
- boardLines[2]: "**Target**: Find ${concept?.example?.find || 'the unknown quantity'}"
- positiveReplyLabel: "Submit Step →"
- negativeReplyLabel: "Need a hint 💡"`,

            independent_practice: `PHASE 8: INDEPENDENT PRACTICE for "${concept?.conceptName}".
Problem: ${concept?.independentProblem?.problem || concept?.example?.problem}
- spokenExplanation: (2-3 sentences). Invite the student to solve this problem independently. Remind them they can ask for hints.
- boardLines[0]: "**Independent Problem**: ${concept?.independentProblem?.problem || concept?.example?.problem}"
- boardLines[1]: "*Calculate the answer independently. Ask for a hint if stuck.*"
- positiveReplyLabel: "Submit My Solution →"
- negativeReplyLabel: "Give me a hint 💡"`,

            misconception: `PHASE 9: MISCONCEPTION DEFENSE for "${concept?.conceptName}".
Trap Statement: "${concept?.misconceptionStatement}"
Scientific Explanation: "${concept?.misconceptionExplanation}"
- spokenExplanation: (3-4 sentences). Present this common misconception and ask the student to explain why it is false.
- boardLines[0]: "**Common Misconception Trap**:"
- boardLines[1]: "\"${concept?.misconceptionStatement}\""
- boardLines[2]: "*Do you agree or disagree? Explain why.*"
- positiveReplyLabel: "I can explain why →"
- negativeReplyLabel: "Explain the trap ↺"`,

            repair: `TARGETED REPAIR PHASE for "${concept?.conceptName}".
Repair Strategy: ${repairStrategy}
Strategy Guidelines: ${repairInstruction}
- spokenExplanation: (3-4 sentences). Re-explain using the specific repair strategy. Address the misunderstanding directly without restarting from scratch.
- boardLines[0]: "**Conceptual Repair**: ${concept?.conceptName}"
- boardLines[1]: "**Key Insight**: ${concept?.goldenRule}"
- positiveReplyLabel: "Aha! Now I get it →"
- negativeReplyLabel: "Still slightly unclear ↺"`,

            transfer: `PHASE 10: TRANSFER TO NOVEL CONTEXT for "${concept?.conceptName}".
Transfer Scenario: ${concept?.transferProblem}
- spokenExplanation: (3-4 sentences). Ask the student to apply this principle to a completely new context.
- boardLines[0]: "**Transfer Challenge**: ${concept?.transferProblem}"
- boardLines[1]: "*Apply the underlying principle to this novel scenario.*"
- positiveReplyLabel: "Apply principle →"
- negativeReplyLabel: "Give context hint 💡"`,

            retrieval: `PHASE 11: CLOSED-BOOK RETRIEVAL for "${concept?.conceptName}".
Retrieval Prompt: "${concept?.retrievalPrompts?.[0]}"
- spokenExplanation: (2-3 sentences). Ask the student to recall and summarize the core rule and formula from memory.
- boardLines[0]: "**Retrieval Check**:"
- boardLines[1]: "${concept?.retrievalPrompts?.[0] || `Explain ${concept?.conceptName} and its formula from memory.`}"
- positiveReplyLabel: "Recall Concept →"
- negativeReplyLabel: "Prompt my memory ↺"`,

            mastery_decision: `PHASE 12: MASTERY EVALUATION for "${concept?.conceptName}".
Mastery Breakdown: Conceptual (${Math.round(conceptMasteryRef.current.conceptualUnderstanding)}%), Procedure (${Math.round(conceptMasteryRef.current.proceduralFluency)}%), Transfer (${Math.round(conceptMasteryRef.current.transferAbility)}%), Retrieval (${Math.round(conceptMasteryRef.current.retrievalStrength)}%).
- spokenExplanation: (3-4 sentences). ${generateMasteryNarration(conceptMasteryRef.current, concept?.conceptName || 'this concept')} Ask if they feel ready to advance!
- boardLines[0]: "**Mastery Summary for ${concept?.conceptName}**"
- boardLines[1]: "• Conceptual: ${Math.round(conceptMasteryRef.current.conceptualUnderstanding)}% | Procedural: ${Math.round(conceptMasteryRef.current.proceduralFluency)}%"
- boardLines[2]: "• Transfer: ${Math.round(conceptMasteryRef.current.transferAbility)}% | Retrieval: ${Math.round(conceptMasteryRef.current.retrievalStrength)}%"
- positiveReplyLabel: "Next Concept →"
- negativeReplyLabel: "Review Weak Points ↺"`,

            synthesis: `TOPIC SYNTHESIS: Cross-Concept University Integration.
Problem: ${bp.synthesisProblem?.problem}
- spokenExplanation: (3-4 sentences). Congratulate the student on mastering all concepts. Present the synthesis problem combining all topic principles!
- boardLines[0]: "**Topic Synthesis Challenge**"
- boardLines[1]: "${bp.synthesisProblem?.problem}"
- positiveReplyLabel: "Submit Synthesis Solution →"
- negativeReplyLabel: "Synthesis Hint 💡"`,
        };

        const aiPrompt = `You are AVELUT Master Voice & Visual STEM Tutor.
You embody Adaptive Teaching Engine methodology:
- PEDAGOGICAL HARMONY: Board lines must be a punchy visual summary of spoken voice.
- SHORT BOARD LINES (1-3 lines max): Never write long reading paragraphs on the blackboard!
- SIMPLEST WORDS: Explain plainly without dense jargon.
- REAL-WORLD OBJECT ANALOGIES: Always use familiar physical objects.
- LaTeX Math: Format all formulas, powers, superscripts, subscripts, fractions, and units in LaTeX ($...$ or $$...$$).

DIAGRAM SVG SPECIFICATIONS (HIGH PRECISION STEM ILLUSTRATION):
- When diagramSvg is provided, draw a HIGH-PRECISION, BEAUTIFULLY DETAILED STEM ILLUSTRATION in valid SVG (viewBox="0 0 420 220").
- Use dark-mode optimized aesthetics: Dark slate background or transparent, crisp high-contrast strokes.
- Palette: #38BDF8 (Sky Blue for objects, trajectories, forces), #34D399 (Emerald Green for target quantities, velocities), #F87171 (Coral Red for resistance, friction, normal forces), #FBBF24 (Amber for givens, angles, dimensions), #A78BFA (Purple for field lines, components), #E2E8F0 (Text labels).
- Real physical scenario detail: Draw recognizable physical objects (cars with wheels, inclined planes with angles and surface hatching, circuits with standard schematic symbols, pulleys with grooved wheels, springs with realistic coils, vectors with arrow markers).
- Vector arrows: Always use marker-end="url(#arrow-blue)", "url(#arrow-red)", or "url(#arrow-green)".
- Labeled parameters: Dimension arrows, angle arcs $\\theta$, and variables in LaTeX format ($F$, $m$, $a$, $v$, $t$).

CURRENT TOPIC: "${sessionData?.topic?.topic_name}"
CURRENT CONCEPT: "${concept?.conceptName}"
CURRENT ADAPTIVE PHASE: "${currentPhase}" (${PHASE_LABEL[currentPhase]})
DIFFICULTY LEVEL: ${difficultyStateRef.current.currentLevel}/5
INSTRUCTION: ${phaseInstructions[currentPhase]}

OUTPUT VALID JSON ONLY:
{
  "boardLines": ["Line 1 with LaTeX", "Line 2 with LaTeX", "Line 3 with LaTeX"],
  "spokenExplanation": "Conversational spoken English text without raw LaTeX codes",
  "diagramSvg": "SVG string with viewBox=\\"0 0 420 220\\" or null",
  "tableMarkdown": "Markdown table with LaTeX or null",
  "diagramCaption": "Caption string or null",
  "positiveReplyLabel": "Button text",
  "positiveReplyText": "Spoken text if affirmative button tapped",
  "negativeReplyLabel": "Button text",
  "negativeReplyText": "Spoken text if question/hint button tapped"
}`;

        const cost = getFeatureCost('study_guide_lesson', appSettings);
        if (userProfile) {
            const limitCheck = checkAICredits(userProfile, cost, appSettings);
            if (!limitCheck.allowed) {
                setIsLoadingUnit(false);
                setLimitModalData({ balance: limitCheck.balance, cost: limitCheck.cost });
                setShowLimitModal(true);
                return;
            }
        }

        try {
            const aiClient = createAvelutAI(appSettings, userProfile || null);
            if (!aiClient || !isActiveRef.current) {
                setIsLoadingUnit(false);
                const defaultLines = getBoardLines(concept || bp.concepts[0], currentPhase, diagIdx);
                const defaultSpoken = getSpokenText(concept || bp.concepts[0], currentPhase, diagIdx);
                streamBoardLines(defaultLines);
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(null);
                await speakText(defaultSpoken);
                return;
            }

            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
                config: { responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 3000 },
            });

            if (!isActiveRef.current) return;
            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty unit response');

            const parsed: UnitPresentationResponse = robustParseJson<UnitPresentationResponse>(raw);

            const sanitized = sanitizeSvg(parsed.diagramSvg || concept?.diagramSvg);
            const table = parsed.tableMarkdown || concept?.tableMarkdown;

            pendingVisualsRef.current = {
                svg: sanitized || null,
                table: (table && table.trim().includes('|')) ? table : null,
                caption: parsed.diagramCaption || `${concept?.conceptName || 'Lesson'} Visual`,
            };
            pendingBoardLinesRef.current = parsed.boardLines.slice(0, MAX_BOARD_LINES);

            if (parsed.positiveReplyLabel && parsed.positiveReplyText) {
                const pos = { label: parsed.positiveReplyLabel, text: parsed.positiveReplyText };
                positiveActionRef.current = pos;
                setPositiveAction(pos);
            }
            if (parsed.negativeReplyLabel && parsed.negativeReplyText) {
                setNegativeAction({ label: parsed.negativeReplyLabel, text: parsed.negativeReplyText });
            }

            dialogueHistoryRef.current.push({
                role: 'tutor',
                text: parsed.spokenExplanation,
                boardSummary: parsed.boardLines.join(' | '),
            });
            if (dialogueHistoryRef.current.length > 8) {
                dialogueHistoryRef.current = dialogueHistoryRef.current.slice(-8);
            }

            setIsLoadingUnit(false);
            await speakText(parsed.spokenExplanation, undefined, parsed.boardLines.slice(0, MAX_BOARD_LINES));

        } catch (err) {
            console.warn('[PresentUnit] presentation fallback:', err);
            if (!isActiveRef.current) return;
            setIsLoadingUnit(false);
            const fallbackConcept = concept || bp.concepts[0];
            const fallbackLines = getBoardLines(fallbackConcept, currentPhase, diagIdx);
            pendingBoardLinesRef.current = fallbackLines;
            pendingVisualsRef.current = { svg: null, table: null, caption: null };
            await speakText(getSpokenText(fallbackConcept, currentPhase, diagIdx), undefined, fallbackLines);
        }
    }, [speakText, streamBoardLines, userProfile, appSettings, sessionData]);

    // ── Interactive Student Reply (Intelligence & Decision Engine) ────────────
    const handleStudentReply = useCallback(async (
        reply: string,
        imageAttachment?: { base64: string; mimeType: string } | null
    ) => {
        if (!blueprint || !isActiveRef.current || (!reply.trim() && !imageAttachment)) return;

        stopAudioImmediate();
        stopMicImmediate();
        clearAllStreamTimers();
        setTextInput('');
        const attached = imageAttachment || attachedImage;
        setAttachedImage(null);

        const userText = reply.trim() || (attached ? 'Please check my work in this attached photo.' : 'Continue');
        const currentC = blueprint.concepts[conceptIdxRef.current];
        const currentPhase = subStepRef.current;
        const currentPath = activePhasePathRef.current;
        const currentPIdx = phaseIdxRef.current;
        const currentDiagIdx = activeDiagnosticIdxRef.current;
        const uid = userProfile?.uid || 'anon';
        const tid = sessionData?.topic?.topic_id || 'core';
        const tName = sessionData?.topic?.topic_name || 'Core Principles';
        const cName = sessionData?.course?.course_name || 'Academic Tutorial';
        const cid = sessionData?.course?.course_id || 'general';

        dialogueHistoryRef.current.push({ role: 'student', text: attached ? `[Photo Attached] ${userText}` : userText });

        const aiClient = createAvelutAI(appSettings, userProfile || null);

        // ── 1. Progressive Hint Check ──────────────────────────────────────────
        if (isHintRequest(userText) && activeLearningQuestionRef.current) {
            const currentHState = hintStateRef.current;
            const nextH = getNextHint(activeLearningQuestionRef.current, currentHState);
            setHintState(nextH);
            hintStateRef.current = nextH;

            const hintLines = [
                `💡 **Hint ${nextH.currentTier} of ${nextH.maxTier}**`,
                nextH.activeHintText || 'Review the given values and equations.'
            ];
            streamBoardLines(hintLines);
            setPositiveAction({ label: "Try Answering Now →", text: "I'll try calculating now" });
            setNegativeAction({ label: nextH.currentTier < nextH.maxTier ? "Need Next Hint 💡" : "Explain Step ↺", text: "Need more guidance" });

            const spokenHint = `Here is a clue: ${nextH.activeHintText} Take your time and give it a shot.`;
            dialogueHistoryRef.current.push({ role: 'tutor', text: spokenHint, boardSummary: hintLines.join(' | ') });
            await speakText(spokenHint, undefined, hintLines);
            return;
        }

        const isInteractivePhase = Boolean(
            activeLearningQuestionRef.current &&
            (currentPhase === 'diagnostic' || currentPhase === 'predict' || currentPhase === 'guided_practice' ||
             currentPhase === 'independent_practice' || currentPhase === 'misconception' || currentPhase === 'transfer' ||
             currentPhase === 'retrieval' || currentPhase === 'synthesis')
        );

        // ── 2. Handle Non-Interactive Presentation Phases ──────────────────────
        if (!isInteractivePhase) {
            const isAffirmative = /^(continue|next|ok|okay|got it|makes sense|let's go|proceed|clear|yes|understood|i see|let me predict|explore|formula clear)/i.test(userText.toLowerCase()) ||
                userText === positiveActionRef.current.text;

            // Student asked a question or asked to explain again during presentation phase
            if (!isAffirmative && aiClient) {
                try {
                    setIsLoadingUnit(true);
                    const clarifyPrompt = `You are AVELUT Master Voice & Visual STEM Tutor.
The student is in presentation phase "${currentPhase}" for "${currentC?.conceptName}".
Student said: "${userText}"

Provide a warm, concise clarification (2-3 sentences) answering their specific question without skipping ahead, plus 2-3 crisp blackboard lines in LaTeX.
OUTPUT VALID JSON ONLY:
{
  "spokenExplanation": "Spoken clarification in plain English",
  "boardLines": ["Clarification point 1 with LaTeX", "Clarification point 2 with LaTeX"],
  "positiveReplyLabel": "Got it, continue →",
  "positiveReplyText": "I understand now, let's continue.",
  "negativeReplyLabel": "Ask another question ↺",
  "negativeReplyText": "Could you explain more about this?"
}`;
                    const res = await aiClient.models.generateContent({
                        model: appSettings?.primary_gemini_model || 'gemini-3.1-flash-lite',
                        contents: [{ role: 'user', parts: [{ text: clarifyPrompt }] }],
                        config: { responseMimeType: 'application/json', temperature: 0.3 },
                    });
                    const raw = getResponseText(res);
                    const parsed = robustParseJson<{ spokenExplanation: string; boardLines: string[]; positiveReplyLabel: string; positiveReplyText: string; negativeReplyLabel: string; negativeReplyText: string }>(raw);
                    setIsLoadingUnit(false);
                    if (parsed.boardLines) streamBoardLines(parsed.boardLines);
                    if (parsed.positiveReplyLabel) setPositiveAction({ label: parsed.positiveReplyLabel, text: parsed.positiveReplyText || 'Continue' });
                    if (parsed.negativeReplyLabel) setNegativeAction({ label: parsed.negativeReplyLabel, text: parsed.negativeReplyText || 'Explain more' });
                    dialogueHistoryRef.current.push({ role: 'tutor', text: parsed.spokenExplanation, boardSummary: (parsed.boardLines || []).join(' | ') });
                    await speakText(parsed.spokenExplanation, undefined, parsed.boardLines);
                    return;
                } catch (e) {
                    console.warn('[HandleStudentReply] clarification error:', e);
                    setIsLoadingUnit(false);
                }
            }

            // Standard progression along path for presentation phase
            const nextPIdx = currentPIdx + 1;
            if (nextPIdx < currentPath.length) {
                const nextPhase = currentPath[nextPIdx];
                setPhaseIdx(nextPIdx);
                phaseIdxRef.current = nextPIdx;
                setSubStep(nextPhase);
                subStepRef.current = nextPhase;
                setIsLoadingUnit(false);
                await presentUnit(blueprint, conceptIdxRef.current, nextPhase, 0);
                return;
            }

            // End of concept path
            const readiness = evaluateReadiness(conceptMasteryRef.current);
            if (currentC) {
                void recordConceptProgress(uid, tid, tName, cName, currentC.conceptName, readiness.readyToAdvance);
                void scheduleSpacedReviewItem(uid, cid, tid, currentC.conceptName, conceptMasteryRef.current, 3);
            }

            const nextCIdx = conceptIdxRef.current + 1;
            if (nextCIdx < blueprint.concepts.length) {
                conceptIdxRef.current = nextCIdx;
                setConceptIdx(nextCIdx);
                const freshPath: TutorPhase[] = ['diagnostic'];
                setActivePhasePath(freshPath);
                activePhasePathRef.current = freshPath;
                setPhaseIdx(0);
                phaseIdxRef.current = 0;
                setSubStep('diagnostic');
                subStepRef.current = 'diagnostic';
                setActiveDiagnosticIdx(0);
                activeDiagnosticIdxRef.current = 0;
                setRepairAttempt(0);
                repairAttemptRef.current = 0;
                setRepairStrategiesUsed([]);
                repairStrategiesUsedRef.current = [];
                setIsLoadingUnit(false);
                await presentUnit(blueprint, nextCIdx, 'diagnostic', 0);
                return;
            }

            if (currentPhase !== 'synthesis' && blueprint.synthesisProblem) {
                const synthPath: TutorPhase[] = ['synthesis'];
                setActivePhasePath(synthPath);
                activePhasePathRef.current = synthPath;
                setPhaseIdx(0);
                phaseIdxRef.current = 0;
                setSubStep('synthesis');
                subStepRef.current = 'synthesis';
                setIsLoadingUnit(false);
                await presentUnit(blueprint, conceptIdxRef.current, 'synthesis', 0);
                return;
            }

            // Topic Mastered
            setIsDone(true);
            setVisibleBoardLines(['🎓 Topic Mastered!', blueprint.overallSummary]);
            setActiveDiagramSvg(null);
            setActiveTableMarkdown(null);
            setActiveVisualCaption(null);
            void recordSessionCompletion(uid, tid, tName, cName, blueprint.overallSummary, currentC?.commonPitfalls || []);
            void saveLocalVoiceTutorialProgress(uid, cid, tid, conceptIdxRef.current, 'mastery_decision', true, blueprint, {
                phasePath: activePhasePathRef.current,
                mastery: conceptMasteryRef.current,
                difficultyLevel: difficultyStateRef.current.currentLevel,
            });
            void speakText(`Congratulations! ${blueprint.overallSummary} You have demonstrated mastery across all concepts!`);
            setIsLoadingUnit(false);
            return;
        }

        // ── 3. Evaluate Interactive Answers (Diagnostic & Practice) ───────────
        try {
            setIsLoadingUnit(true);
            let isCorrect = true;
            let misconceptionType: MisconceptionType | undefined;
            let feedback = '';

            if (activeLearningQuestionRef.current) {
                const evalResult = await evaluateStudentAnswer(
                    activeLearningQuestionRef.current,
                    userText,
                    dialogueHistoryRef.current.map(d => `${d.role}: ${d.text}`).join('\n'),
                    aiClient,
                    appSettings?.primary_gemini_model
                );
                isCorrect = evalResult.isCorrect;
                misconceptionType = evalResult.misconceptionType;
                feedback = evalResult.feedback;

                // Update dynamic difficulty
                const newDiffState = recordQuestionPerformance(
                    difficultyStateRef.current,
                    isCorrect,
                    hintStateRef.current.hintsUsed > 0,
                    activeLearningQuestionRef.current.difficulty
                );
                setDifficultyState(newDiffState);
                difficultyStateRef.current = newDiffState;

                // Update 5-axis Mastery Model
                const newMastery = updateMasteryOnAnswer(
                    conceptMasteryRef.current,
                    currentPhase,
                    isCorrect,
                    hintStateRef.current.hintsUsed,
                    activeLearningQuestionRef.current.difficulty,
                    misconceptionType,
                    feedback
                );
                setConceptMastery(newMastery);
                conceptMasteryRef.current = newMastery;
            }

            // ── Diagnostic Phase Handling ──
            if (currentPhase === 'diagnostic') {
                diagnosticAnswersRef.current.push({
                    questionIdx: currentDiagIdx,
                    correct: isCorrect,
                    dimension: currentC?.diagnosticQuestions?.[currentDiagIdx]?.dimension || 'prerequisiteKnowledge',
                });

                const totalDiags = currentC?.diagnosticQuestions?.length || 1;
                if (currentDiagIdx + 1 < totalDiags) {
                    const nextDiagIdx = currentDiagIdx + 1;
                    setActiveDiagnosticIdx(nextDiagIdx);
                    activeDiagnosticIdxRef.current = nextDiagIdx;
                    setIsLoadingUnit(false);
                    await presentUnit(blueprint, conceptIdxRef.current, 'diagnostic', nextDiagIdx);
                    return;
                }

                // Diagnostic complete for this concept -> evaluate dimensions independently
                const scoredDims = scoreDiagnosticAnswers(diagnosticAnswersRef.current);
                const generatedPath = generatePhasePath(scoredDims, conceptMasteryRef.current);
                diagnosticAnswersRef.current = [];
                setActiveDiagnosticIdx(0);
                activeDiagnosticIdxRef.current = 0;

                setActivePhasePath(generatedPath);
                activePhasePathRef.current = generatedPath;
                setPhaseIdx(0);
                phaseIdxRef.current = 0;

                const firstPhase = generatedPath[0] || 'concept_map';
                setSubStep(firstPhase);
                subStepRef.current = firstPhase;

                setIsLoadingUnit(false);
                await presentUnit(blueprint, conceptIdxRef.current, firstPhase, 0);
                return;
            }

            // ── Interactive Practice / Predict / Misconception: If Incorrect ──
            if (!isCorrect) {
                const currentAttempts = repairAttemptRef.current + 1;
                setRepairAttempt(currentAttempts);
                repairAttemptRef.current = currentAttempts;

                const strategy = selectRepairStrategy(
                    misconceptionType || 'definition_confusion',
                    repairStrategiesUsedRef.current
                );
                const updatedUsed = [...repairStrategiesUsedRef.current, strategy];
                setRepairStrategiesUsed(updatedUsed);
                repairStrategiesUsedRef.current = updatedUsed;

                const adaptedPath = adaptPath(
                    currentPath,
                    currentPIdx,
                    {
                        phase: currentPhase,
                        score: 0,
                        success: false,
                        errorType: misconceptionType,
                        misconceptionDetail: feedback,
                        hintsUsed: hintStateRef.current.hintsUsed,
                        difficulty: activeLearningQuestionRef.current?.difficulty,
                    },
                    conceptMasteryRef.current
                );
                setActivePhasePath(adaptedPath);
                activePhasePathRef.current = adaptedPath;

                // Show corrective feedback and allow retry or repair
                const feedbackLines = [
                    `❌ **Let's review this step**`,
                    feedback || `Check the governing relationship for ${currentC?.conceptName}.`,
                    `💡 **Key Insight**: ${REPAIR_STRATEGY_INSTRUCTIONS[strategy] || 'Consider the physical balance.'}`,
                ];
                streamBoardLines(feedbackLines);
                setPositiveAction({ label: "Try Answering Again →", text: "I'll try calculating again." });
                setNegativeAction({ label: "Walk Through Step ↺", text: "Please explain this step in detail." });

                const spokenFeedback = `Not quite. ${feedback} ${REPAIR_STRATEGY_INSTRUCTIONS[strategy] || 'Let\'s think about the fundamental law.'} Take a moment and try answering again, or tap below for a step-by-step walkthrough.`;
                dialogueHistoryRef.current.push({ role: 'tutor', text: spokenFeedback, boardSummary: feedbackLines.join(' | ') });
                setIsLoadingUnit(false);
                await speakText(spokenFeedback, undefined, feedbackLines);
                return;
            }

            // ── Interactive Practice: If Correct ──
            setRepairAttempt(0);
            repairAttemptRef.current = 0;

            const nextPIdx = currentPIdx + 1;
            if (nextPIdx < currentPath.length) {
                const nextPhase = currentPath[nextPIdx];
                setPhaseIdx(nextPIdx);
                phaseIdxRef.current = nextPIdx;
                setSubStep(nextPhase);
                subStepRef.current = nextPhase;
                setIsLoadingUnit(false);
                await presentUnit(blueprint, conceptIdxRef.current, nextPhase, 0);
                return;
            }

            // End of concept path
            const readiness = evaluateReadiness(conceptMasteryRef.current);
            if (currentC) {
                void recordConceptProgress(uid, tid, tName, cName, currentC.conceptName, readiness.readyToAdvance);
                void scheduleSpacedReviewItem(uid, cid, tid, currentC.conceptName, conceptMasteryRef.current, 4);
            }

            const nextCIdx = conceptIdxRef.current + 1;
            if (nextCIdx < blueprint.concepts.length) {
                conceptIdxRef.current = nextCIdx;
                setConceptIdx(nextCIdx);

                const freshPath: TutorPhase[] = ['diagnostic'];
                setActivePhasePath(freshPath);
                activePhasePathRef.current = freshPath;
                setPhaseIdx(0);
                phaseIdxRef.current = 0;
                setSubStep('diagnostic');
                subStepRef.current = 'diagnostic';
                setActiveDiagnosticIdx(0);
                activeDiagnosticIdxRef.current = 0;
                setRepairAttempt(0);
                repairAttemptRef.current = 0;
                setRepairStrategiesUsed([]);
                repairStrategiesUsedRef.current = [];

                setIsLoadingUnit(false);
                await presentUnit(blueprint, nextCIdx, 'diagnostic', 0);
                return;
            }

            // Synthesis phase
            if (currentPhase !== 'synthesis' && blueprint.synthesisProblem) {
                const synthPath: TutorPhase[] = ['synthesis'];
                setActivePhasePath(synthPath);
                activePhasePathRef.current = synthPath;
                setPhaseIdx(0);
                phaseIdxRef.current = 0;
                setSubStep('synthesis');
                subStepRef.current = 'synthesis';

                setIsLoadingUnit(false);
                await presentUnit(blueprint, conceptIdxRef.current, 'synthesis', 0);
                return;
            }

            // All completed with demonstrated mastery
            setIsDone(true);
            setVisibleBoardLines(['🎓 Topic Mastered!', blueprint.overallSummary]);
            setActiveDiagramSvg(null);
            setActiveTableMarkdown(null);
            setActiveVisualCaption(null);

            void recordSessionCompletion(uid, tid, tName, cName, blueprint.overallSummary, currentC?.commonPitfalls || []);
            void saveLocalVoiceTutorialProgress(uid, cid, tid, conceptIdxRef.current, 'mastery_decision', true, blueprint, {
                phasePath: activePhasePathRef.current,
                mastery: conceptMasteryRef.current,
                difficultyLevel: difficultyStateRef.current.currentLevel,
            });

            void speakText(`Congratulations! ${blueprint.overallSummary} You have demonstrated mastery across all concepts!`);
            setIsLoadingUnit(false);

        } catch (err) {
            console.warn('[HandleStudentReply] intelligence engine error:', err);
            setIsLoadingUnit(false);
            // Safe fallback without abruptly completing topic
            const nextPIdx = currentPIdx + 1;
            if (nextPIdx < currentPath.length) {
                const nextPhase = currentPath[nextPIdx];
                setPhaseIdx(nextPIdx);
                phaseIdxRef.current = nextPIdx;
                setSubStep(nextPhase);
                subStepRef.current = nextPhase;
                await presentUnit(blueprint, conceptIdxRef.current, nextPhase, 0);
            } else {
                await speakText("Let's review this step together. Take another look at the key principle on the board.");
            }
        }
    }, [blueprint, speakText, presentUnit, userProfile, sessionData, appSettings, streamBoardLines, visibleBoardLines, attachedImage]);

    useEffect(() => {
        handleStudentReplyRef.current = handleStudentReply;
    }, [handleStudentReply]);

    const handleSendText = () => {
        if (!textInput.trim() && !attachedImage) return;
        const text = textInput.trim();
        const img = attachedImage;
        setTextInput('');
        setAttachedImage(null);
        void handleStudentReply(text, img);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            addToast('Please select a valid image file', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const base64 = typeof reader.result === 'string' ? reader.result : '';
            if (base64) {
                setAttachedImage({ base64, mimeType: file.type || 'image/jpeg' });
                addToast('Photo attached. Ask your question or press send!', 'info');
            }
        };
        reader.readAsDataURL(file);
        // Reset file input value so user can re-select same image if needed
        e.target.value = '';
    };

    // ── Controls ─────────────────────────────────────────────────────────────
    const togglePauseAI = () => {
        if (isSpeaking) {
            stopAudioImmediate();
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
            }
            startMicListening();
        }
    };

    const toggleMute = () => {
        if (!isMuted) {
            stopAudioImmediate();
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

    const handlePreviewVoice = (voiceId: KittenVoice, e: React.MouseEvent) => {
        e.stopPropagation();
        if (previewingVoice === voiceId) {
            if (previewPlayerRef.current) {
                previewPlayerRef.current.stop();
                previewPlayerRef.current = null;
            }
            setPreviewingVoice(null);
            return;
        }

        stopAudioImmediate();
        if (previewPlayerRef.current) {
            previewPlayerRef.current.stop();
            previewPlayerRef.current = null;
        }

        setPreviewingVoice(voiceId);
        const player = kittenTts.previewVoice(voiceId, {
            onStart: () => setPreviewingVoice(voiceId),
            onEnd: () => {
                setPreviewingVoice(null);
                previewPlayerRef.current = null;
            },
            onError: () => {
                setPreviewingVoice(null);
                previewPlayerRef.current = null;
            },
        });
        previewPlayerRef.current = player;
    };

    const handleSelectVoice = (voiceId: KittenVoice) => {
        if (previewPlayerRef.current) {
            previewPlayerRef.current.stop();
            previewPlayerRef.current = null;
        }
        setPreviewingVoice(null);
        kittenTts.setVoice(voiceId);
        setSelectedVoice(voiceId);
        addToast(`Voice switched to ${voiceId}`, 'success');
    };

    const handleGoBack = useCallback(async () => {
        setIsNavigatingBack(true);
        isActiveRef.current = false;
        stopAudioImmediate();
        clearAllStreamTimers();
        stopMicImmediate();

        if (blueprint) {
            const uid = userProfile?.uid || 'anon';
            const cid = sessionData?.course?.course_id || 'general';
            const tid = sessionData?.topic?.topic_id || 'core';
            await saveLocalVoiceTutorialProgress(uid, cid, tid, conceptIdxRef.current, subStepRef.current, false, blueprint);
        }

        await new Promise(r => setTimeout(r, 80));
        if (onBack) {
            onBack();
        } else if (onNavigate) {
            onNavigate('study_guide');
        } else {
            window.history.back();
        }
    }, [blueprint, userProfile, onBack, onNavigate, sessionData]);

    const currentTopicIdx = sessionData?.course?.topics?.findIndex(
        t => t.topic_id === sessionData?.topic?.topic_id
    ) ?? -1;
    const nextTopic = (currentTopicIdx >= 0 && sessionData?.course?.topics && currentTopicIdx + 1 < sessionData.course.topics.length)
        ? sessionData.course.topics[currentTopicIdx + 1]
        : null;

    const handleNextTopic = useCallback(async () => {
        if (!nextTopic || !sessionData) {
            void handleGoBack();
            return;
        }
        stopAudioImmediate();
        clearAllStreamTimers();
        stopMicImmediate();

        const newSessionData: VoiceTutorialSessionData = {
            course: sessionData.course,
            topic: nextTopic,
        };
        writeCachedJson('avelut_active_voice_tutorial', newSessionData);
        setSessionData(newSessionData);
        setBlueprint(null);
        setIsDone(false);
        setConceptIdx(0);
        setSubStep('diagnostic');
        setActivePhasePath(['diagnostic']);
        setPhaseIdx(0);
        conceptIdxRef.current = 0;
        subStepRef.current = 'diagnostic';
        activePhasePathRef.current = ['diagnostic'];
        phaseIdxRef.current = 0;
        dialogueHistoryRef.current = [];
        setVisibleBoardLines([]);
        setActiveDiagramSvg(null);
        setActiveTableMarkdown(null);
        setActiveVisualCaption(null);

        const uid = userProfile?.uid || 'anon';
        const cid = newSessionData.course?.course_id || 'general';
        const tid = nextTopic.topic_id;

        const studentMem = await getStudentCognitiveProfile(uid);
        const sqliteRecord = await getLocalVoiceTutorialProgress(uid, cid, tid);
        let bp: LessonBlueprint | null = sqliteRecord?.blueprint || null;

        if (!bp) {
            bp = await generateBlueprint(newSessionData, studentMem);
            if (!bp || !isActiveRef.current) return;
            await saveLocalVoiceTutorialProgress(uid, cid, tid, 0, 'diagnostic', false, bp, {
                phasePath: ['diagnostic'],
                mastery: defaultMastery(),
                difficultyLevel: 2,
            });
        }

        if (!isActiveRef.current) return;
        setBlueprint(bp);
        const defaultActs = getDefaultActions('diagnostic');
        positiveActionRef.current = defaultActs.positive;
        setPositiveAction(defaultActs.positive);
        setNegativeAction(defaultActs.negative);

        await presentUnit(bp, 0, 'diagnostic', 0, studentMem, true);
    }, [nextTopic, sessionData, handleGoBack, userProfile, generateBlueprint, presentUnit]);

    const currentConcept  = blueprint?.concepts[conceptIdx];
    const totalConcepts   = blueprint?.concepts.length ?? 0;
    const currentPathLen  = Math.max(activePhasePath.length, 1);
    const progressPercent = totalConcepts > 0
        ? Math.min(100, Math.round(((conceptIdx * currentPathLen + phaseIdx) /
            (totalConcepts * currentPathLen)) * 100))
        : 0;

    const hasVisualElement = !!(activeDiagramSvg || activeTableMarkdown);

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col flex-1 h-full w-full bg-[#FAF7F2] text-[#2C241D] overflow-hidden select-none">

            {/* ── Header ──────────────────────────────────────────────── */}
            <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-[#E5DACD] bg-[#F4ECE2]/95 backdrop-blur-md z-30 shadow-xs shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={handleGoBack}
                        disabled={isNavigatingBack}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-[#4A3E31] text-xs font-bold active:scale-95 cursor-pointer shadow-xs transition-all shrink-0"
                    >
                        <i className="bi bi-arrow-left text-sm"></i>
                        <span className="hidden sm:inline">Back</span>
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-sm font-bold text-[#2C241D] truncate flex items-center gap-2">
                            <span>{sessionData?.topic?.topic_name || 'Interactive Voice & Visual Tutorial'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFE5D8] text-[#8B5A2B] font-bold border border-[#DFD1C0] hidden md:inline">
                                Adaptive AI Engine
                            </span>
                        </h1>
                        <p className="text-[11px] text-[#7A6B5C] truncate">
                            {sessionData?.course?.course_name || 'Course Topic'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {sessionData?.image && (
                        <button
                            onClick={() => setShowScannedImageModal(true)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/80 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-200 text-xs font-bold shadow-xs transition-all cursor-pointer"
                            title="View scanned problem"
                        >
                            <i className="bi bi-image text-xs"></i>
                            <span className="hidden sm:inline">Scanned Problem</span>
                        </button>
                    )}

                    {/* 1. Voice Selection Dropdown Button */}
                    <button
                        onClick={() => setShowVoiceModal(prev => !prev)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#EFE5D8] hover:bg-[#E5D7C5] border border-[#DFD1C0] text-xs font-bold text-[#5A4D3E] shadow-2xs transition-all cursor-pointer active:scale-95"
                        title="Choose Tutor Voice (8 KittenTTS Models)"
                    >
                        <i className="bi bi-mic-fill text-[#8B5A2B] text-xs"></i>
                        <span>{selectedVoice}</span>
                        <i className={`bi bi-chevron-${showVoiceModal ? 'up' : 'down'} text-[10px] text-[#8B5A2B]`}></i>
                    </button>

                    {/* 2. Live State Status Badge */}
                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#EFE5D8] border border-[#DFD1C0] text-xs font-semibold text-[#5A4D3E]">
                        {isTtsLoading ? (
                            <span className="w-2 h-2 rounded-full bg-[#8B5A2B] animate-ping shrink-0" />
                        ) : (
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isSpeaking ? 'bg-[#8B5A2B] animate-pulse' : 'bg-[#C2B2A3]'}`} />
                        )}
                        <span>
                            {isTtsLoading ? `Generating ${selectedVoice}...` : isPaused ? 'Paused' : isSpeaking ? 'Speaking' : selectedVoice}
                        </span>
                    </div>

                    {/* 3. Mastery Badge */}
                    <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                        <i className="bi bi-mortarboard-fill text-amber-600"></i>
                        <span>Mastery {Math.round((conceptMastery.conceptualUnderstanding + conceptMastery.proceduralFluency + conceptMastery.transferAbility) / 3)}%</span>
                    </div>

                    {/* 4. Mute Button */}
                    <button
                        onClick={toggleMute}
                        className="p-1.5 sm:px-2 sm:py-1 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-xs font-bold text-[#4A3E31] cursor-pointer shadow-xs transition-colors"
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        <i className={`bi ${isMuted ? 'bi-volume-mute-fill text-red-600' : 'bi-volume-up'} text-sm`}></i>
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
                        <h3 className="text-lg font-bold text-[#2C241D]">Preparing Your Adaptive Lesson</h3>
                        <p className="text-sm text-[#7A6B5C] mt-1">{sessionData?.topic?.topic_name}</p>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-[#C2B2A3] border-t-[#8B5A2B] rounded-full animate-spin" />
                        <p className="text-sm font-medium text-[#5A4D3E] animate-pulse">{blueprintGenStep}</p>
                    </div>
                    <p className="text-xs text-[#A09080] max-w-xs">
                        AVELUT is designing an adaptive, diagnostic-driven curriculum tailored to your exact mastery level.
                    </p>
                </div>
            )}

            {/* ── Completion screen ─────────────────────────────────────── */}
            {isDone && !isGeneratingBlueprint && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center pb-24 md:pb-6 max-w-xl mx-auto animate-fade-in">
                    <div className="text-5xl">🎓</div>
                    <div>
                        <h3 className="text-2xl font-bold text-[#2C241D]">Topic Mastered!</h3>
                        <p className="text-xs font-semibold text-[#8B5A2B] mt-1 uppercase tracking-wider">{sessionData?.topic?.topic_name}</p>
                    </div>
                    <p className="text-sm text-[#5A4D3E] max-w-md leading-relaxed">{blueprint?.overallSummary}</p>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
                        {nextTopic ? (
                            <button
                                onClick={handleNextTopic}
                                className="w-full sm:flex-1 py-3.5 px-6 bg-[#8B5A2B] hover:bg-[#7A4D24] text-white rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                            >
                                <span>Next Topic: {nextTopic.topic_name}</span>
                                <i className="bi bi-arrow-right font-bold"></i>
                            </button>
                        ) : null}
                        <button
                            onClick={handleGoBack}
                            className={`w-full ${nextTopic ? 'sm:flex-1' : 'sm:w-auto px-8'} py-3.5 bg-[#FFFDFB] hover:bg-[#EFE5D8] border border-[#D9CCBC] text-[#5A4D3E] rounded-2xl font-bold text-sm shadow-xs transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-2`}
                        >
                            <i className="bi bi-journal-check"></i>
                            <span>Return to Study Guide</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Main teaching area ────────────────────────────────────── */}
            {!isGeneratingBlueprint && !isDone && (
                <main className="flex-1 flex flex-col p-2.5 sm:p-4 max-w-5xl w-full mx-auto gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:pb-3">

                    {/* Concept breadcrumb */}
                    {currentConcept && (
                        <div className="flex items-center justify-between text-xs text-[#6B5E51] shrink-0">
                            <span className="flex items-center gap-1.5 font-semibold text-[#3D3328] truncate">
                                <i className="bi bi-journal-bookmark text-[#8B5A2B]"></i>
                                {sessionData?.topic?.topic_name}
                            </span>
                            <span className="font-bold text-[#8B5A2B] px-2 py-0.5 rounded-lg bg-[#EFE5D8] border border-[#DFD1C0] shrink-0 ml-2 truncate max-w-[220px]">
                                Concept {conceptIdx + 1}/{totalConcepts} · {PHASE_LABEL[subStep] || subStep}
                            </span>
                        </div>
                    )}

                    {/* ── Charcoal Blackboard (Typical Blackboard Look) ── */}
                    <div className="relative flex-1 min-h-[265px] sm:min-h-[325px] max-h-[calc(100vh-250px)] flex flex-col justify-start bg-[#181C20] border-2 border-[#2D333B] rounded-3xl p-4 sm:p-6 shadow-2xl overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-[#444C56]/60 [&::-webkit-scrollbar-thumb]:rounded-full text-white">

                        {isModelDownloading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#181C20]/95 backdrop-blur-md rounded-3xl z-30 p-6 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                    <i className="bi bi-cpu-fill text-2xl animate-pulse"></i>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1">
                                        Downloading On-Device Voice Model
                                    </h3>
                                    <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                                        Caching Kitten TTS (25MB) locally so your interactive voice lessons run offline with zero cloud audio quota.
                                    </p>
                                </div>
                                <div className="w-full max-w-xs bg-slate-800 rounded-full h-3 overflow-hidden border border-white/10 shadow-inner">
                                    <div 
                                        className="bg-gradient-to-r from-emerald-400 to-teal-400 h-full rounded-full transition-all duration-300"
                                        style={{ width: `${modelDownloadProgress}%` }}
                                    />
                                </div>
                                <span className="text-xs font-mono font-bold text-emerald-400">
                                    {modelDownloadProgress}% Downloaded
                                </span>
                            </div>
                        )}

                        {isLoadingUnit && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#181C20]/90 backdrop-blur-xs rounded-3xl z-20">
                                <div className="w-8 h-8 border-2 border-[#444C56] border-t-amber-400 rounded-full animate-spin" />
                                <p className="text-sm font-handwriting text-[#E2E8F0] tracking-wide animate-pulse">
                                    Writing on blackboard...
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col h-full gap-3.5">
                            {/* ── Fixed Blackboard Topic Header (Underlined) ── */}
                            <div className="w-full border-b border-white/20 pb-2.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1.5 shrink-0">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-mono tracking-widest uppercase text-amber-300 font-bold">
                                        {currentConcept ? `${currentConcept.conceptName}` : 'Lesson'}
                                    </span>
                                    <h2 className="font-handwriting font-bold text-xl sm:text-2xl text-white tracking-wide underline underline-offset-8 decoration-white/70 truncate">
                                        {sessionData?.topic?.topic_name || sessionData?.course.course_name}
                                    </h2>
                                </div>
                                <span className="text-[11px] font-mono font-medium text-[#93C5FD] shrink-0">
                                    {PHASE_LABEL[subStep] || subStep}
                                </span>
                            </div>

                            {/* ── Voice Preparation Loading Screen (Centered with Animated Bar) ── */}
                            {isTtsLoading && (
                                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center animate-fade-in my-auto">
                                    <div className="w-16 h-16 rounded-3xl bg-[#22272E] border border-amber-400/40 flex items-center justify-center shadow-xl relative">
                                        <i className="bi bi-soundwave text-3xl text-amber-400 animate-pulse"></i>
                                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                        </span>
                                    </div>
                                    <div className="space-y-1 max-w-sm">
                                        <h3 className="text-lg font-bold font-handwriting tracking-wide text-amber-200">
                                            Avelut is preparing {selectedVoice} voice...
                                        </h3>
                                        <p className="text-xs text-slate-300">
                                            Synchronizing on-device audio · Text will reveal line-by-line in sync with speech.
                                        </p>
                                    </div>
                                    <div className="w-full max-w-xs bg-slate-800/90 rounded-full h-2 overflow-hidden border border-white/10 shadow-inner">
                                        <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 h-full rounded-full w-full animate-pulse transition-all" />
                                    </div>
                                </div>
                            )}

                            {/* ── Blackboard Content Area (Progressive Chalk Write-In) ── */}
                            {!isTtsLoading && visibleBoardLines.length > 0 && (
                                <div className={`flex-1 w-full ${hasVisualElement ? 'grid grid-cols-1 lg:grid-cols-12 gap-4 items-start' : 'space-y-3'}`}>

                                    <div className={`${hasVisualElement ? 'lg:col-span-6 space-y-3' : 'space-y-3.5'}`}>
                                        {visibleBoardLines.map((line, idx) => {
                                            const isVarLine       = line.includes('→');
                                            const isBlockFormula  = line.trim().startsWith('$$');
                                            const stepMatch       = line.match(/^\*\*(.*?)\*\*\s*:\s*(.*)$/);
                                            const isWritingActive = (idx === activeWritingIndex || (idx === visibleBoardLines.length - 1 && isStreaming)) && isStreaming;

                                            return (
                                                <div
                                                    key={`${idx}-${line.slice(0, 15)}`}
                                                    className={`flex items-start gap-2.5 transition-all duration-700 ease-out animate-fade-in ${
                                                        isWritingActive ? 'border-l-2 border-amber-400 pl-3 bg-amber-400/10 rounded-r-xl shadow-xs' : ''
                                                    }`}
                                                >
                                                    {!isVarLine && !isBlockFormula && !stepMatch && (
                                                        <span className={`mt-2.5 w-1.5 h-1.5 rounded-full ${isWritingActive ? 'bg-amber-400 animate-ping' : 'bg-amber-300 opacity-80'} shrink-0`} />
                                                    )}

                                                    {stepMatch ? (
                                                        <div className="w-full flex flex-col gap-1 py-0.5">
                                                            <span className="px-2 py-0.5 rounded-md bg-[#2D333B] border border-[#444C56] font-mono text-[10px] font-bold uppercase tracking-wider text-[#93C5FD] w-fit">
                                                                {stepMatch[1]}
                                                            </span>
                                                            <div className="font-handwriting text-base sm:text-lg text-white leading-relaxed overflow-x-auto pl-1">
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                                    rehypePlugins={[rehypeKatex]}
                                                                    components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                                >{formatLatexMath(stepMatch[2])}</ReactMarkdown>
                                                                {isWritingActive && (
                                                                    <span className="inline-block w-2 h-4 ml-1.5 bg-amber-400 rounded-xs animate-pulse align-middle shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : isBlockFormula ? (
                                                        <div className="w-full text-center text-white py-2 overflow-x-auto bg-[#22272E]/90 rounded-2xl border border-[#373E47] px-3 my-1 shadow-inner">
                                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                {formatLatexMath(line)}
                                                            </ReactMarkdown>
                                                        </div>
                                                    ) : isVarLine ? (
                                                        <div className="font-mono text-xs sm:text-sm text-[#93C5FD] leading-snug pl-2 w-full">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                                rehypePlugins={[rehypeKatex]}
                                                                components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                            >{formatLatexMath(line.trim())}</ReactMarkdown>
                                                            {isWritingActive && (
                                                                <span className="inline-block w-2 h-3 ml-1.5 bg-amber-400 rounded-xs animate-pulse align-middle shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="font-handwriting text-base sm:text-lg text-white leading-relaxed tracking-wide w-full">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                                rehypePlugins={[rehypeKatex]}
                                                                components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                            >{formatLatexMath(line)}</ReactMarkdown>
                                                            {isWritingActive && (
                                                                <span className="inline-block w-2 h-4 ml-1.5 bg-amber-400 rounded-xs animate-pulse align-middle shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {hasVisualElement && (
                                        <div className="lg:col-span-6 flex flex-col items-center justify-center p-2 rounded-2xl bg-[#22272E]/90 border border-[#373E47] shadow-md relative group animate-fade-in transition-all duration-700 w-full">
                                            {activeDiagramSvg && (
                                                <div className="w-full flex flex-col items-center animate-scale-in">
                                                    <button
                                                        onClick={() => setIsDiagramZoomed(true)}
                                                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-[#2D333B] hover:bg-[#444C56] text-[#E2E8F0] text-xs cursor-pointer opacity-70 hover:opacity-100 transition-opacity z-10"
                                                    >
                                                        <i className="bi bi-arrows-fullscreen"></i>
                                                    </button>
                                                    <div
                                                        key={`svg-${diagramKey}`}
                                                        className="w-full max-h-[220px] sm:max-h-[260px] flex items-center justify-center board-diagram-animated py-1 overflow-visible"
                                                        dangerouslySetInnerHTML={{ __html: activeDiagramSvg }}
                                                    />
                                                </div>
                                            )}

                                            {activeTableMarkdown && (
                                                <div className="w-full overflow-x-auto p-2.5 bg-[#1C2128] rounded-xl border border-[#373E47] text-xs sm:text-sm font-mono text-white">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm, remarkMath]}
                                                        rehypePlugins={[rehypeKatex]}
                                                    >{formatLatexMath(activeTableMarkdown)}</ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {isMicListening && micDisplay && (
                        <div className="shrink-0 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-[#8B5A2B] animate-pulse px-3 py-1 bg-[#F4ECE2] rounded-full w-fit mx-auto border border-[#E5DACD]">
                            <i className="bi bi-mic-fill text-red-600"></i>
                            <span>"{micDisplay}..."</span>
                        </div>
                    )}

                    {/* ── Expanded Full-Width Input Card ── */}
                    <div className="shrink-0 flex flex-col gap-2 bg-[#F4ECE2]/95 border border-[#E5DACD] rounded-3xl p-2.5 sm:p-3.5 shadow-md backdrop-blur-md w-full">

                        {/* ── Dual Dynamic Contextual Buttons ── */}
                        <div className="flex items-center gap-2 w-full">
                            <button
                                onClick={() => void handleStudentReply(negativeAction.text)}
                                disabled={isGeneratingBlueprint || isTtsLoading}
                                className="flex-1 py-2.5 px-3 rounded-2xl bg-[#FFFDFB] hover:bg-[#F3EBE1] border border-[#D9CCBC] text-[#6B5A4B] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                            >
                                <i className="bi bi-arrow-counterclockwise text-xs"></i>
                                <span className="truncate">{negativeAction.label}</span>
                            </button>

                            <button
                                onClick={() => void handleStudentReply(positiveAction.text)}
                                disabled={isGeneratingBlueprint || isTtsLoading}
                                className="flex-1 py-2.5 px-3 rounded-2xl bg-[#8B5A2B] hover:bg-[#764920] active:bg-[#5C3817] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                            >
                                <span className="truncate">{positiveAction.label}</span>
                                <i className="bi bi-arrow-right text-xs font-bold"></i>
                            </button>
                        </div>

                        {/* ── Image Attachment Preview (if photo snapped/uploaded) ── */}
                        {attachedImage && (
                            <div className="flex items-center gap-2 p-1.5 px-3 bg-[#FFFDFB] border border-[#D9CCBC] rounded-2xl w-fit animate-fade-in shadow-xs">
                                <img src={attachedImage.base64} alt="Attached work" className="w-9 h-9 object-cover rounded-xl border border-[#C2B2A3]" />
                                <span className="text-xs font-bold text-[#5A4D3E]">Photo attached</span>
                                <button
                                    onClick={() => setAttachedImage(null)}
                                    className="w-5 h-5 rounded-full bg-[#EDE2D4] hover:bg-[#DFD1C0] flex items-center justify-center text-xs text-[#3D2817] cursor-pointer"
                                >
                                    <i className="bi bi-x"></i>
                                </button>
                            </div>
                        )}

                        {/* ── Input Bar with Pause AI, Mic (LEFT), Text Input, Camera (RIGHT), & Send ── */}
                        <div className="flex items-center gap-1.5 sm:gap-2 w-full pt-0.5">
                            {/* 1. Pause AI Button */}
                            <button
                                onClick={togglePauseAI}
                                disabled={isTtsLoading || !blueprint}
                                className={`flex items-center justify-center w-10 h-10 rounded-2xl border transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
                                    isSpeaking ? 'bg-[#EFE5D8] border-[#DFD1C0] text-[#8B5A2B]' : 'bg-[#FFFDFB] border-[#D9CCBC] text-[#5A4D3E]'
                                }`}
                            >
                                <i className={`bi ${isSpeaking ? 'bi-pause-fill text-lg' : 'bi-play-fill text-xl'}`}></i>
                            </button>

                            {/* 2. Mic Button on the LEFT */}
                            <button
                                onClick={toggleMic}
                                disabled={isGeneratingBlueprint || !blueprint}
                                className={`flex items-center gap-1.5 px-3.5 sm:px-4 h-10 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
                                    isMicListening ? 'bg-red-600 text-white animate-pulse' : 'bg-[#8B5A2B] hover:bg-[#7A4D24] text-white'
                                }`}
                            >
                                <i className={`bi ${isMicListening ? 'bi-mic-fill' : 'bi-mic'} text-sm`}></i>
                                <span className="hidden sm:inline">{isMicListening ? 'Listening' : 'Mic'}</span>
                            </button>

                            {/* 3. Text Input Container with Camera on the RIGHT and Send */}
                            <div className="flex-1 relative flex items-center min-w-0">
                                <input
                                    type="text"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
                                    disabled={isGeneratingBlueprint}
                                    placeholder="Type your question or snap a photo..."
                                    className="w-full h-10 pl-3.5 pr-20 bg-[#FFFDFB] border border-[#D9CCBC] focus:border-[#8B5A2B] focus:ring-1 focus:ring-[#8B5A2B] rounded-2xl text-xs sm:text-sm text-[#2C241D] placeholder-[#9E8E7E] outline-none shadow-2xs transition-all"
                                />

                                {/* Camera Icon Button on the RIGHT */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    type="button"
                                    title="Snap or upload picture"
                                    className="absolute right-9 w-7 h-7 rounded-xl hover:bg-[#EDE2D4] text-[#6B5A4B] hover:text-[#8B5A2B] flex items-center justify-center cursor-pointer active:scale-95 transition-colors"
                                >
                                    <i className="bi bi-camera text-base"></i>
                                </button>

                                {/* Send Arrow Button on the RIGHT */}
                                {(textInput.trim() || attachedImage) && (
                                    <button
                                        onClick={handleSendText}
                                        className="absolute right-1.5 w-7 h-7 rounded-xl bg-[#8B5A2B] hover:bg-[#7A4D24] text-white flex items-center justify-center cursor-pointer active:scale-95 animate-fade-in"
                                    >
                                        <i className="bi bi-arrow-up-short text-lg"></i>
                                    </button>
                                )}

                                {/* Hidden File Input for Camera / Photo picker */}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                    accept="image/*"
                                    className="hidden"
                                />
                            </div>
                        </div>
                    </div>
                </main>
            )}

            {/* ── Diagram Zoom Modal ────────────────────────────────────────── */}
            {isDiagramZoomed && activeDiagramSvg && (
                <div
                    onClick={() => setIsDiagramZoomed(false)}
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer animate-fade-in"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#181C20] border-2 border-[#373E47] rounded-3xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-4 relative cursor-default text-white"
                    >
                        <div className="flex items-center justify-between border-b border-white/20 pb-3">
                            <h3 className="font-bold text-base text-white">Diagram Inspection</h3>
                            <button
                                onClick={() => setIsDiagramZoomed(false)}
                                className="w-8 h-8 rounded-full bg-[#2D333B] hover:bg-[#444C56] text-white flex items-center justify-center cursor-pointer"
                            >
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>
                        <div
                            className="w-full flex items-center justify-center p-4 bg-[#22272E] rounded-2xl border border-[#373E47]"
                            dangerouslySetInnerHTML={{ __html: activeDiagramSvg }}
                        />
                    </div>
                </div>
            )}

            {/* ── Scanned Problem Image Modal ────────────────────────────────── */}
            {showScannedImageModal && sessionData?.image && (
                <div
                    onClick={() => setShowScannedImageModal(false)}
                    className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer animate-fade-in"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 max-w-2xl w-full max-h-[88vh] shadow-2xl flex flex-col gap-3 relative cursor-default"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                                <i className="bi bi-image text-sky-500"></i>
                                <span>Original Scanned Problem</span>
                            </h3>
                            <button
                                onClick={() => setShowScannedImageModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer hover:bg-slate-200"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto flex items-center justify-center bg-black/5 dark:bg-black/40 rounded-2xl p-2 max-h-[62vh]">
                            <img src={sessionData.image} alt="Scanned problem" className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-md" />
                        </div>
                        {sessionData.customPrompt && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">Instructions: </span>
                                {sessionData.customPrompt}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* ── Voice Selection Dropdown Modal (8 KittenTTS Voices) ───────── */}
            {showVoiceModal && (
                <div
                    onClick={() => {
                        if (previewPlayerRef.current) {
                            previewPlayerRef.current.stop();
                            previewPlayerRef.current = null;
                        }
                        setPreviewingVoice(null);
                        setShowVoiceModal(false);
                    }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer animate-fade-in"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#FAF7F2] border border-[#E5DACD] rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 relative cursor-default text-[#2C241D] animate-scale-in max-h-[90vh] overflow-y-auto [scrollbar-width:thin]"
                    >
                        <div className="flex items-center justify-between border-b border-[#E5DACD] pb-3 shrink-0">
                            <div>
                                <h3 className="font-extrabold text-base text-[#2C241D] flex items-center gap-2">
                                    <i className="bi bi-mic-fill text-[#8B5A2B]"></i>
                                    <span>Select AI Tutor Voice</span>
                                </h3>
                                <p className="text-xs text-[#7A6B5C] mt-0.5">
                                    8 High-Fidelity 24 kHz KittenTTS Models · Click ▶ to preview
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    if (previewPlayerRef.current) {
                                        previewPlayerRef.current.stop();
                                        previewPlayerRef.current = null;
                                    }
                                    setPreviewingVoice(null);
                                    setShowVoiceModal(false);
                                }}
                                className="w-8 h-8 rounded-full bg-[#EFE5D8] hover:bg-[#E5D7C5] text-[#5A4D3E] flex items-center justify-center cursor-pointer transition-colors"
                            >
                                <i className="bi bi-x-lg text-xs"></i>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 py-1">
                            {KITTEN_VOICE_LIST.map((v) => {
                                const isSelected = selectedVoice === v.id;
                                const isPreviewing = previewingVoice === v.id;

                                return (
                                    <div
                                        key={v.id}
                                        onClick={() => handleSelectVoice(v.id)}
                                        className={`flex flex-col justify-between p-3 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
                                            isSelected
                                                ? 'bg-[#EFE5D8] border-[#8B5A2B] ring-2 ring-[#8B5A2B]/20'
                                                : 'bg-[#FFFDFB] hover:bg-[#F6EFE6] border-[#DFD1C0]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                                                    v.gender === 'female' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'
                                                }`}>
                                                    {v.name[0]}
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="font-extrabold text-sm text-[#2C241D] block truncate">
                                                        {v.name}
                                                    </span>
                                                    <span className="text-[10px] text-[#7A6B5C] block truncate">
                                                        {v.tone}
                                                    </span>
                                                </div>
                                            </div>

                                            {isSelected && (
                                                <span className="px-2 py-0.5 rounded-full bg-[#8B5A2B] text-white text-[10px] font-extrabold shrink-0">
                                                    Active
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#EFE5D8]">
                                            <button
                                                type="button"
                                                onClick={(e) => handlePreviewVoice(v.id, e)}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 ${
                                                    isPreviewing
                                                        ? 'bg-amber-600 text-white animate-pulse'
                                                        : 'bg-[#EAE0D2] hover:bg-[#DFD1C0] text-[#5A4D3E]'
                                                }`}
                                                title={`Preview ${v.name} voice`}
                                            >
                                                <i className={`bi ${isPreviewing ? 'bi-stop-fill text-xs' : 'bi-play-fill text-sm'}`}></i>
                                                <span>{isPreviewing ? 'Stop' : 'Preview'}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleSelectVoice(v.id)}
                                                className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
                                                    isSelected ? 'text-[#8B5A2B]' : 'text-[#7A6B5C] hover:text-[#2C241D]'
                                                }`}
                                            >
                                                {isSelected ? '✓ Selected' : 'Choose'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Limit Exceeded Modal (Upgrade Account / Buy Credits) ────────── */}
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
