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
// @ts-ignore: KaTeX stylesheet
import 'katex/dist/katex.min.css';
import { checkAICredits, deductAICredits, getFeatureCost } from '../utils/usage';
import { LimitExceededModal } from './LimitExceededModal';
import { kittenTts, KittenVoice, kittenWebGpu } from '../services/kittenTtsService';


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
import { sanitizeAndValidateSvg, SVG_REALISTIC_ILLUSTRATION_SYSTEM_PROMPT } from '../services/svgIllustrationEngine';

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
 * 2. Unescaped LaTeX backslashes (\sigma, \Delta, \frac, \nabla, \alpha, etc.) without control character corruption
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

    // Pre-escape LaTeX words so JSON.parse doesn't turn \frac into \x0c + rac or \beta into \x08 + eta
    const preEscapeLatex = (str: string) => {
        return str.replace(/(?<!\\)\\([a-zA-Z]+)/g, (match, word) => {
            if (/^(frac|nabla|text|times|theta|tau|tan|rho|right|nu|neq|neg|normal|beta|begin|bar|bot|bf|bold|box|bullet|approx|gamma|delta|epsilon|zeta|eta|iota|kappa|lambda|mu|xi|pi|sigma|upsilon|phi|chi|psi|omega|sqrt|sum|int|partial|infty|cdot|pm|mp|le|ge|equiv|rightarrow|leftarrow|left|right|vec|hat|dot|ddot|tilde|mathbf|mathrm|mathit|displaystyle)/i.test(word)) {
                return `\\\\${word}`;
            }
            return match;
        });
    };

    const preprocessed = preEscapeLatex(cleaned);

    // Attempt 1: Preprocessed JSON.parse
    try {
        return JSON.parse(preprocessed) as T;
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

        // Extract Blueprint title & overview
        const titleMatch = cleaned.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (titleMatch) obj.title = titleMatch[1];
        const overviewMatch = cleaned.match(/"overview"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (overviewMatch) obj.overview = overviewMatch[1];
        const summaryMatch = cleaned.match(/"overallSummary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (summaryMatch) obj.overallSummary = summaryMatch[1];

        if (obj.boardLines || obj.spokenExplanation || obj.title) {
            if (!obj.boardLines) obj.boardLines = [];
            if (!obj.spokenExplanation) obj.spokenExplanation = obj.boardLines.join(' ');
            if (obj.title && !obj.concepts) obj.concepts = [];
            return obj as T;
        }
    } catch (_) {}

    console.warn('[robustParseJson] All JSON parse strategies failed. Snippet:', cleaned.slice(0, 300));
    // Return a safe minimal fallback object instead of throwing
    return {
        title: 'Interactive STEM Tutorial',
        overview: 'Adaptive lesson breakdown',
        concepts: [],
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
    setCustomHeaderConfig?: (config: any) => void;
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

function sanitizeSvg(rawSvg: string | null | undefined): string | null {
    return sanitizeAndValidateSvg(rawSvg);
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
    setCustomHeaderConfig,
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
    const [previewingVoice, setPreviewingVoice] = useState<KittenVoice | null>(null);
    const [selectedVoice, setSelectedVoice] = useState<KittenVoice>(KittenVoice.Bella);
    const previewPlayerRef = useRef<any>(null);

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

    const positiveActionRef         = useRef<{ label: string; text: string }>(getDefaultActions('diagnostic').positive);
    const negativeActionRef         = useRef<{ label: string; text: string }>(getDefaultActions('diagnostic').negative);

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
    useEffect(() => { positiveActionRef.current = positiveAction; }, [positiveAction]);
    useEffect(() => { negativeActionRef.current = negativeAction; }, [negativeAction]);
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

    const isSpeakingRef = useRef(false);

    // ── Audio & Mic Functions ─────────────────────────────────────────────
    function stopAudioImmediate() {
        playSessionIdRef.current++;
        isSpeakingRef.current = false;
        if (currentAudioRef.current) {
            try { currentAudioRef.current.stop(); } catch (_) {}
            currentAudioRef.current = null;
        }
        setIsSpeaking(false);
    }

    function stopMicImmediate() {
        if (recognitionRef.current) {
            try { 
                recognitionRef.current.abort();
            } catch (_) {
                try { recognitionRef.current.stop(); } catch (_) {}
            }
            recognitionRef.current = null;
        }
        setIsMicListening(false);
        setMicDisplay('');
        spokenTextRef.current = '';
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
        if (!isActiveRef.current || isPaused || isSpeakingRef.current) return;
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        stopMicImmediate();

        try {
            const rec = new SR();
            rec.continuous      = false; // Single utterance turn to prevent recording subsequent AI speech
            rec.interimResults  = true;
            rec.lang            = 'en-US';
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

                // Immediately turn off and deactivate microphone
                stopMicImmediate();

                const final = text.trim();
                if (final.length > 1) {
                    addToast(`Heard: "${final}"`, 'info');
                    void handleStudentReplyRef.current(final, attachedImage);
                }
            };

            rec.onresult = (e: any) => {
                const resultsArr = Array.from(e.results);
                const t = resultsArr.map((r: any) => r[0].transcript).join(' ').trim();
                spokenTextRef.current = t;
                if (isActiveRef.current) setMicDisplay(t);

                // When speech pause detected (1.4s), deactivate mic and submit
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

            rec.onerror = () => {
                stopMicImmediate();
            };

            recognitionRef.current = rec;
            rec.start();
        } catch (_) {
            stopMicImmediate();
        }
    }, [addToast, attachedImage, isPaused]);

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
        const words = spokenText ? spokenText.split(/\s+/).filter(Boolean) : [];
        const wordCount = words.length > 0 ? words.length : 28;
        
        // Pacing at 480ms per word gives natural speech duration and prevents text from revealing ahead of voice
        const totalEstMs = Math.max(3600, wordCount * 480);
        const lineCount = lines.length;
        const lineIntervalMs = Math.max(2800, Math.min(5600, Math.floor(totalEstMs / Math.max(lineCount, 1))));

        // Lead delay of 450ms so the voice begins speaking before Line 0 writes on the board
        const initTimer = setTimeout(() => {
            if (!isActiveRef.current) return;
            setVisibleBoardLines([lines[0]]);
            setActiveWritingIndex(0);
        }, 450);
        streamTimersRef.current.push(initTimer);

        // Schedule subsequent lines sequentially synchronized with spoken progress
        for (let i = 1; i < lineCount; i++) {
            const timer = setTimeout(() => {
                if (!isActiveRef.current) return;
                setVisibleBoardLines(lines.slice(0, i + 1));
                setActiveWritingIndex(i);
            }, 450 + i * lineIntervalMs);
            streamTimersRef.current.push(timer);
        }

        // Settle all lines cleanly when narration concludes
        const finishTimer = setTimeout(() => {
            if (!isActiveRef.current) return;
            setVisibleBoardLines(lines.slice(0, MAX_BOARD_LINES));
            setIsStreaming(false);
            setActiveWritingIndex(-1);
        }, 450 + lineCount * lineIntervalMs);
        streamTimersRef.current.push(finishTimer);
    }, [clearAllStreamTimers]);

    const streamBoardLines = useCallback((lines: string[], spokenText?: string) => {
        clearAllStreamTimers();
        pendingBoardLinesRef.current = lines.slice(0, MAX_BOARD_LINES);
        if (isMuted) {
            revealLinesProgressively(pendingBoardLinesRef.current, spokenText);
        } else {
            // Keep board text hidden until voice is ready and begins reading
            setVisibleBoardLines([]);
            setIsStreaming(true);
            setActiveWritingIndex(-1);
        }
    }, [clearAllStreamTimers, isMuted, revealLinesProgressively]);

    const speakText = useCallback(async (
        text: string,
        onEnd?: () => void,
        linesToReveal?: string[]
    ): Promise<void> => {
        if (!isActiveRef.current || !text) {
            onEnd?.();
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
            return;
        }

        const player = kittenTts.speak(cleanedText, {
            cleanText: true,
            voice: KittenVoice.Bella,
            rate: 1.2,
            onStart: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(true);
                isSpeakingRef.current = true;
                setIsTtsLoading(false);

                // Voice has started speaking: start progressive line-by-line chalk write-in with slight lead delay
                setTimeout(() => {
                    if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
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
                }, 350);
            },
            onEnd: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setIsPaused(false);
                setIsTtsLoading(false);
                currentAudioRef.current = null;

                // Ensure all lines are revealed and active writing marker clears
                setVisibleBoardLines(pendingBoardLinesRef.current);
                setIsStreaming(false);
                setActiveWritingIndex(-1);

                onEnd?.();
            },
            onError: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setIsPaused(false);
                setIsTtsLoading(false);
                currentAudioRef.current = null;
                // Reveal lines only if voice completely failed
                revealLinesProgressively(pendingBoardLinesRef.current, cleanedText);
                if (pendingVisualsRef.current.svg) {
                    setActiveDiagramSvg(pendingVisualsRef.current.svg);
                } else if (pendingVisualsRef.current.table) {
                    setActiveTableMarkdown(pendingVisualsRef.current.table);
                }
                onEnd?.();
            },
        });

        currentAudioRef.current = player as any;
    }, [isMuted, clearAllStreamTimers, revealLinesProgressively]);

    // ── Real-Time Streaming Speech Engine for Live Interaction & Q&A ──────────
    const streamText = useCallback(async (
        text: string,
        onEnd?: () => void,
        linesToReveal?: string[]
    ): Promise<void> => {
        if (!isActiveRef.current || !text) {
            onEnd?.();
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
            onEnd?.();
            return;
        }

        setIsTtsLoading(true);
        setIsSpeaking(false);
        setVisibleBoardLines([]);
        setActiveWritingIndex(-1);

        const sessionId = ++playSessionIdRef.current;
        const cleanedText = cleanSpokenTextForTTS(text);

        if (!cleanedText) {
            setIsTtsLoading(false);
            revealLinesProgressively(lines, text);
            onEnd?.();
            return;
        }

        const player = kittenWebGpu.streamSpeech(cleanedText, {
            cleanText: true,
            voice: KittenVoice.Bella,
            speed: 1.1,
            onStart: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(true);
                isSpeakingRef.current = true;
                setIsTtsLoading(false);
                revealLinesProgressively(lines, cleanedText);
            },
            onEnd: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setIsPaused(false);
                setIsTtsLoading(false);
                currentAudioRef.current = null;
                setVisibleBoardLines(pendingBoardLinesRef.current);
                setIsStreaming(false);
                setActiveWritingIndex(-1);
                onEnd?.();
            },
            onError: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setIsPaused(false);
                setIsTtsLoading(false);
                currentAudioRef.current = null;
                revealLinesProgressively(pendingBoardLinesRef.current, cleanedText);
                onEnd?.();
            },
        });

        currentAudioRef.current = player as any;
    }, [isMuted, clearAllStreamTimers, revealLinesProgressively]);

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
        const topicLabel = bp.title || sessionData?.topic?.topic_name || sessionData?.course?.course_name || 'Core Topic Principles';
        
        // Ensure at least 3 deep structured concepts if empty
        const defaultConceptsList: any[] = [
            {
                conceptName: `${topicLabel}: Physical Intuition & Foundations`,
                relatableQuestion: `What happens physically in real scenarios involving ${topicLabel}?`,
                realWorldScenario: `Everyday physical occurrence demonstrating the foundational intuition of ${topicLabel}.`,
                keyDefinition: `Fundamental principle and governing definition of ${topicLabel}.`,
                physicalMeaning: `Physical intuition and core behavior of ${topicLabel}.`,
                formula: '$$\\Delta y = f(x)$$',
                goldenRule: 'Physical quantities and conservation laws remain invariant across frames.',
            },
            {
                conceptName: `${topicLabel}: Governing Mathematical Model & Laws`,
                relatableQuestion: `How do we mathematically quantify and formulate ${topicLabel}?`,
                realWorldScenario: `Calculations and relations predicting precise behavior in ${topicLabel}.`,
                keyDefinition: `Mathematical formalization and equations governing ${topicLabel}.`,
                physicalMeaning: `Relationship between variables, constants, and rates for ${topicLabel}.`,
                formula: '$$F = m \\cdot a$$',
                goldenRule: 'Units and dimensional homogeneity must balance across all terms in every formula.',
            },
            {
                conceptName: `${topicLabel}: Applied Socratic Problem Solving & Boundary Principles`,
                relatableQuestion: `How do we apply our equations to solve complex, multi-step problems in ${topicLabel}?`,
                realWorldScenario: `Practical STEM scenario applying ${topicLabel}.`,
                keyDefinition: `Step-by-step problem decomposition and solution strategy for ${topicLabel}.`,
                physicalMeaning: `Applying governing laws to determine target unknowns accurately.`,
                formula: '$$\\sum F = 0$$',
                goldenRule: 'Always verify physical boundary conditions and the reasonableness of final answers.',
            }
        ];

        const sourceConcepts = rawConcepts.length > 0 ? rawConcepts : defaultConceptsList;
        const concepts: BlueprintConcept[] = sourceConcepts.map((c: any, i: number) => {
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
Design an intelligent, highly comprehensive adaptive lesson blueprint for:
Course: "${courseName}"
Topic: "${topicName}"
Level: ${level}
${imageInstructions}
${memoryContext}

PEDAGOGICAL REQUIREMENTS:
1. Deep Multi-Concept Coverage: Break down this topic thoroughly into 3 to 4 sequential, progressive concepts (Concept 1: Physical Intuition & Foundations, Concept 2: Mathematical Formalization & Governing Laws, Concept 3: Applied Socratic Problem Solving & Boundary Cases, Concept 4: Advanced Scenarios & Edge Cases). DO NOT return just 1 superficial concept.
2. Simplest Words Possible: Explain intuitively in everyday English before formal math.
3. Concrete Real-World Analogies: Always ground abstract laws in familiar physical objects.
4. Diagnostic Questions (2-3 per concept): Design concise diagnostic questions that test prerequisite knowledge, conceptual understanding, and formula application. Include multiple_choice or numeric format with options and 4 progressive hints.
5. Prediction Challenges: Include a prediction scenario for each concept where the student predicts what happens before seeing the math.
6. Socratic Worked Example & Independent Practice: Each concept must have a worked example (3 clear steps) AND a separate independent practice problem with 4 progressive hints.
7. Misconception Traps: Explicitly craft common misunderstandings for the student to defend against.
8. Topic Synthesis Problem: Create 1 integrated problem combining all concepts in this topic.
9. Valid LaTeX Math: Format all math in LaTeX ($...$ or $$...$$).

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
                config: { responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 8192 },
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
        setIsDone(false);
        setBlueprint(bp);

        let startConceptIdx = sqliteRecord?.conceptIdx ?? 0;
        let startPhase: TutorPhase = (sqliteRecord?.subStep as TutorPhase) || 'diagnostic';
        let savedPath: TutorPhase[] = (sqliteRecord?.phasePath as TutorPhase[]) || ['diagnostic'];
        let savedMastery: DimensionalMastery = sqliteRecord?.mastery || defaultMastery();
        let savedDifficulty: DifficultyState = createInitialDifficultyState((sqliteRecord?.difficultyLevel || 2) as QuestionDifficulty);

        if (sqliteRecord?.isCompleted || startConceptIdx >= bp.concepts.length) {
            startConceptIdx = 0;
            startPhase = 'diagnostic';
            savedPath = ['diagnostic'];
            savedMastery = defaultMastery();
            savedDifficulty = createInitialDifficultyState(2);
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

        const concept = bp.concepts[cIdx] || bp.concepts[0];
        if (!concept && currentPhase !== 'synthesis') {
            setIsLoadingUnit(false);
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

${SVG_REALISTIC_ILLUSTRATION_SYSTEM_PROMPT}

CURRENT TOPIC: "${sessionData?.topic?.topic_name}"
CURRENT CONCEPT: "${concept?.conceptName}"
CURRENT ADAPTIVE PHASE: "${currentPhase}" (${PHASE_LABEL[currentPhase]})
DIFFICULTY LEVEL: ${difficultyStateRef.current.currentLevel}/5
INSTRUCTION: ${phaseInstructions[currentPhase]}

OUTPUT VALID JSON ONLY:
{
  "boardLines": ["Line 1 with LaTeX", "[DIAGRAM]", "Line 2 with LaTeX", "Line 3 with LaTeX"],
  "spokenExplanation": "Conversational spoken English text without raw LaTeX codes",
  "diagramSvg": "Complete realistic SVG string (viewBox=\\"0 0 800 480\\") with actual recognizable objects drawn from scratch or null",
  "tableMarkdown": "Markdown table with LaTeX or null",
  "diagramCaption": "Caption string or null",
  "positiveReplyLabel": "Button text",
  "positiveReplyText": "Spoken text if affirmative button tapped",
  "negativeReplyLabel": "Button text",
  "negativeReplyText": "Spoken text if question/hint button tapped"
}
NOTE: You can place "[DIAGRAM]" or "[TABLE]" anywhere inside the boardLines array (at any line index) where the illustration or table best fits the visual explanation!`;

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
                pendingBoardLinesRef.current = defaultLines;
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(null);
                await speakText(defaultSpoken, undefined, defaultLines);
                return;
            }

            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
                config: { responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 4096 },
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

            // Pre-fetch next board's audio in background
            const nextPIdx = phaseIdxRef.current + 1;
            const currentPath = activePhasePathRef.current;
            if (nextPIdx < currentPath.length) {
                const nextPhase = currentPath[nextPIdx];
                const nextFallbackSpoken = getSpokenText(concept || bp.concepts[0], nextPhase, 0);
                void kittenWebGpu.prefetchAudio(nextFallbackSpoken);
            }

            // On speech completion: auto-flip to next board for narrative phases
            const onBoardSpeechEnd = () => {
                if (!isActiveRef.current) return;
                const isNarrativePhase = (
                    currentPhase === 'concept_map' || 
                    currentPhase === 'intuition' || 
                    currentPhase === 'concept_core' || 
                    currentPhase === 'formalize' || 
                    currentPhase === 'multi_represent'
                );

                if (isNarrativePhase) {
                    setTimeout(() => {
                        if (!isActiveRef.current) return;
                        void handleAdvanceNextBoard();
                    }, 1400);
                }
            };

            await speakText(parsed.spokenExplanation, onBoardSpeechEnd, parsed.boardLines.slice(0, MAX_BOARD_LINES));

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

    // ── Advance to Next Board ────────────────────────────────────────────────
    const handleAdvanceNextBoard = useCallback(async () => {
        if (!blueprint || isGeneratingBlueprint) return;
        stopAudioImmediate();
        stopMicImmediate();
        clearAllStreamTimers();

        const currentPIdx = phaseIdxRef.current;
        const currentPath = activePhasePathRef.current;
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

        // Advance to next concept
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
            setIsLoadingUnit(false);
            await presentUnit(blueprint, nextCIdx, 'diagnostic', 0);
            return;
        }

        // Synthesis / Completion
        if (subStepRef.current !== 'synthesis' && blueprint.synthesisProblem) {
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

        setIsDone(true);
        setVisibleBoardLines(['🎓 Topic Mastered!', blueprint.overallSummary]);
        void speakText(`Congratulations! ${blueprint.overallSummary} You have mastered this entire topic!`);
    }, [blueprint, isGeneratingBlueprint, presentUnit, speakText]);

    // ── Restart Current Board with Simpler Explanation ───────────────────────
    const handleRestartSimplerBoard = useCallback(async () => {
        if (!blueprint || isGeneratingBlueprint) return;
        stopAudioImmediate();
        stopMicImmediate();
        clearAllStreamTimers();

        repairStrategiesUsedRef.current.push('simpler_language');
        setRepairStrategiesUsed([...repairStrategiesUsedRef.current]);
        
        setIsLoadingUnit(false);
        await presentUnit(blueprint, conceptIdxRef.current, subStepRef.current, activeDiagnosticIdxRef.current);
    }, [blueprint, isGeneratingBlueprint, presentUnit]);

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
            const delivery = getNextHint(activeLearningQuestionRef.current, currentHState);
            const nextH: HintState = {
                ...currentHState,
                hintsRevealed: Math.min(currentHState.maxHints, currentHState.hintsRevealed + 1)
            };
            setHintState(nextH);
            hintStateRef.current = nextH;

            const hintLines = [
                `💡 **Hint ${delivery.hintTier} of ${currentHState.maxHints}**`,
                delivery.hintText || 'Review the given values and equations.'
            ];
            pendingBoardLinesRef.current = hintLines;
            setPositiveAction({ label: "Try Answering Now →", text: "I'll try calculating now" });
            setNegativeAction({ label: delivery.hintsRemaining > 0 ? "Need Next Hint 💡" : "Explain Step ↺", text: "Need more guidance" });

            const spokenHint = `Here is a clue: ${delivery.hintText} Take your time and give it a shot.`;
            dialogueHistoryRef.current.push({ role: 'tutor', text: spokenHint, boardSummary: hintLines.join(' | ') });
            await streamText(spokenHint, undefined, hintLines);
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
                    if (parsed.boardLines) pendingBoardLinesRef.current = parsed.boardLines.slice(0, MAX_BOARD_LINES);
                    if (parsed.positiveReplyLabel) setPositiveAction({ label: parsed.positiveReplyLabel, text: parsed.positiveReplyText || 'Continue' });
                    if (parsed.negativeReplyLabel) setNegativeAction({ label: parsed.negativeReplyLabel, text: parsed.negativeReplyText || 'Explain more' });
                    dialogueHistoryRef.current.push({ role: 'tutor', text: parsed.spokenExplanation, boardSummary: (parsed.boardLines || []).join(' | ') });
                    await streamText(parsed.spokenExplanation, undefined, parsed.boardLines);
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
            // Check if student is explicitly asking to retry calculating
            const isTryAgainIntent = /^(try answering again|i'll try calculating again|try calculating again|let me calculate|let me try|i'll try again|retry calculation|try again)/i.test(userText.trim());
            if (isTryAgainIntent) {
                const promptMsg = `Take your time to work out the calculation. Whenever you're ready, type or speak your answer!`;
                dialogueHistoryRef.current.push({ role: 'tutor', text: promptMsg, boardSummary: 'Ready for calculation attempt' });
                setPositiveAction({ label: "Submit Answer →", text: "Ready to submit answer" });
                setNegativeAction({ label: "Walk Through Step ↺", text: "Please explain this step in detail." });
                await speakText(promptMsg);
                return;
            }

            // Check if student is explicitly requesting a step-by-step walkthrough / explanation
            const isWalkthroughIntent = /^(walk through step|please explain this step in detail|explain this step|walk me through|step by step|show me how to solve|how to solve this|need walkthrough|need more guidance|i don't know the answer)/i.test(userText.trim());
            if (isWalkthroughIntent && blueprint) {
                setIsLoadingUnit(true);
                const currentAttempts = repairAttemptRef.current + 1;
                setRepairAttempt(currentAttempts);
                repairAttemptRef.current = currentAttempts;

                const strategy = selectRepairStrategy(
                    'definition_confusion',
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
                        errorType: 'definition_confusion',
                        misconceptionDetail: 'Student requested step-by-step walkthrough',
                        hintsUsed: hintStateRef.current.hintsRevealed,
                        difficulty: activeLearningQuestionRef.current?.difficulty,
                    },
                    conceptMasteryRef.current
                );
                setActivePhasePath(adaptedPath);
                activePhasePathRef.current = adaptedPath;

                setSubStep('repair');
                subStepRef.current = 'repair';
                setIsLoadingUnit(false);
                await presentUnit(blueprint, conceptIdxRef.current, 'repair', 0);
                return;
            }

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
                    hintStateRef.current.hintsRevealed > 0,
                    activeLearningQuestionRef.current.difficulty
                );
                setDifficultyState(newDiffState);
                difficultyStateRef.current = newDiffState;

                // Update 5-axis Mastery Model
                const newMastery = updateMasteryOnAnswer(
                    conceptMasteryRef.current,
                    currentPhase,
                    isCorrect,
                    hintStateRef.current.hintsRevealed,
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
                        hintsUsed: hintStateRef.current.hintsRevealed,
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
                ];
                pendingBoardLinesRef.current = feedbackLines;
                setPositiveAction({ label: "Try Answering Again →", text: "I'll try calculating again." });
                setNegativeAction({ label: "Walk Through Step ↺", text: "Please explain this step in detail." });

                const spokenFeedback = feedback
                    ? `${feedback} Take a moment and try answering again, or tap Walk Through Step below for a step-by-step walkthrough.`
                    : `Let's double-check our calculation. Take a moment and try answering again, or tap Walk Through Step below for a step-by-step walkthrough.`;
                dialogueHistoryRef.current.push({ role: 'tutor', text: spokenFeedback, boardSummary: feedbackLines.join(' | ') });
                setIsLoadingUnit(false);
                await streamText(spokenFeedback, undefined, feedbackLines);
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

    const handleReStudyTopic = useCallback(async () => {
        const uid = userProfile?.uid || 'anon';
        const cid = sessionData?.course?.course_id || 'general';
        const tid = sessionData?.topic?.topic_id || 'core';

        stopAudioImmediate();
        clearAllStreamTimers();
        stopMicImmediate();

        await saveLocalVoiceTutorialProgress(uid, cid, tid, 0, 'diagnostic', false, blueprint, {
            phasePath: ['diagnostic'],
            mastery: defaultMastery(),
            difficultyLevel: 2,
        });

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

        if (blueprint) {
            const studentMem = await getStudentCognitiveProfile(uid);
            await presentUnit(blueprint, 0, 'diagnostic', 0, studentMem, true);
        }
    }, [blueprint, userProfile, sessionData, presentUnit, clearAllStreamTimers]);

    const currentConcept  = blueprint?.concepts[conceptIdx];
    const totalConcepts   = blueprint?.concepts.length ?? 0;
    const currentPathLen  = Math.max(activePhasePath.length, 1);
    const progressPercent = totalConcepts > 0
        ? Math.min(100, Math.round(((conceptIdx * currentPathLen + phaseIdx) /
            (totalConcepts * currentPathLen)) * 100))
        : 0;

    const hasVisualElement = !!(activeDiagramSvg || activeTableMarkdown);

    // ── Dynamic App Header Synchronization ──
    useEffect(() => {
        if (setCustomHeaderConfig) {
            const topicName = sessionData?.topic?.topic_name || sessionData?.course?.course_name || 'Voice Tutorial';
            setCustomHeaderConfig({
                hideTitle: true,
                hideDefaultRightActions: true,
                leftActions: (
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 max-w-[calc(100vw-110px)] sm:max-w-none">
                        <button
                            onClick={handleGoBack}
                            disabled={isNavigatingBack}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-white/20 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-900 dark:text-white text-xs sm:text-sm font-bold active:scale-95 cursor-pointer transition-all shrink-0 shadow-2xs"
                        >
                            <i className="bi bi-arrow-left text-sm font-bold"></i>
                            <span className="whitespace-nowrap">Back to Study Guide</span>
                        </button>
                        <div className="min-w-0 flex flex-col justify-center">
                            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-[280px] md:max-w-[400px]">
                                {topicName}
                            </span>
                            {currentConcept && (
                                <span className="text-[10px] text-amber-500 dark:text-amber-400 font-mono truncate max-w-[120px] sm:max-w-[280px]">
                                    Concept {conceptIdx + 1}/{totalConcepts}: {currentConcept.conceptName}
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
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-900/70 hover:bg-sky-800 border border-sky-500/60 text-sky-200 text-xs font-bold transition-all cursor-pointer shadow-xs"
                                title="View original problem scan"
                            >
                                <i className="bi bi-image text-xs"></i>
                                <span className="hidden sm:inline">Scan</span>
                            </button>
                        )}
                        <button
                            onClick={toggleMute}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-white/20 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-xs font-bold text-slate-800 dark:text-white cursor-pointer transition-colors active:scale-95 shadow-xs"
                            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                        >
                            <i className={`bi ${isMuted ? 'bi-volume-mute-fill text-rose-400' : 'bi-volume-up-fill text-amber-500'} text-sm`}></i>
                            <span className="text-[11px] hidden md:inline">{isMuted ? 'Muted' : 'Voice'}</span>
                        </button>
                    </div>
                ),
                className: 'bg-[#181C20]/95 border-b border-white/10 backdrop-blur-md'
            });
        }

        return () => {
            if (setCustomHeaderConfig) {
                setCustomHeaderConfig(null);
            }
        };
    }, [setCustomHeaderConfig, sessionData, currentConcept, conceptIdx, totalConcepts, isMuted, isNavigatingBack, handleGoBack]);

    // Helper to render embedded diagram directly inside the blackboard (clean, diagram-only, space-efficient)
    const renderInlineDiagram = () => {
        if (!activeDiagramSvg) return null;
        return (
            <div className="w-full my-1 flex items-center justify-center bg-transparent border-0 shadow-none animate-fade-in transition-all">
                <div
                    key={`svg-${diagramKey}`}
                    className="w-full max-h-[190px] sm:max-h-[230px] flex items-center justify-center py-0.5 overflow-visible [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[190px] sm:[&>svg]:max-h-[230px]"
                    dangerouslySetInnerHTML={{ __html: activeDiagramSvg }}
                />
            </div>
        );
    };

    // Helper to render inline table
    const renderInlineTable = () => {
        if (!activeTableMarkdown) return null;
        return (
            <div className="w-full my-2.5 overflow-x-auto p-3 bg-[#1C2128] rounded-2xl border border-[#373E47] text-xs sm:text-sm font-mono text-white shadow-inner animate-fade-in">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formatLatexMath(activeTableMarkdown)}
                </ReactMarkdown>
            </div>
        );
    };

    // Check if boardLines explicitly contain diagram/table placeholders
    const hasExplicitDiagramTag = visibleBoardLines.some(l => /\[(diagram|visual|image)\]/i.test(l));
    const hasExplicitTableTag = visibleBoardLines.some(l => /\[table\]/i.test(l));

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="flex-1 w-full h-full flex flex-col bg-[#12161A] text-white overflow-hidden select-none relative">

            {/* ── Progress bar ────────────────────────────────────────── */}
            {blueprint && !isGeneratingBlueprint && (
                <div className="h-1 bg-white/10 shrink-0">
                    <div
                        className="h-full bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-500 transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            )}

            {/* ── Blueprint generation screen ─────────────────────────── */}
            {isGeneratingBlueprint && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 text-center animate-fade-in my-auto">
                    <div className="w-20 h-20 rounded-3xl bg-[#181C20] border-2 border-blue-400/50 flex items-center justify-center shadow-2xl">
                        <i className="bi bi-mortarboard-fill text-3xl text-blue-400"></i>
                    </div>

                    <div className="space-y-2 max-w-md">
                        <span className="text-xs font-mono font-bold tracking-widest uppercase text-blue-400">
                            Avelut Adaptive Engine
                        </span>
                        <h2 className="text-xl sm:text-2xl font-bold font-handwriting text-white tracking-wide">
                            {blueprintGenStep || 'Building Lesson Blueprint...'}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-300">
                            Customizing diagnostic checks, real-world analogies, worked examples, and socratic prompts.
                        </p>
                    </div>

                    <div className="w-full max-w-xs bg-slate-800/80 rounded-full h-2 overflow-hidden border border-white/10 shadow-inner">
                        <div className="bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-400 h-full rounded-full w-full animate-pulse transition-all" />
                    </div>
                </div>
            )}

            {/* ── Completion screen ─────────────────────────────────────── */}
            {isDone && !isGeneratingBlueprint && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center pb-24 md:pb-6 max-w-xl mx-auto animate-fade-in my-auto">
                    <div className="text-5xl">🎓</div>
                    <div>
                        <h3 className="text-2xl font-bold text-white">Topic Mastered!</h3>
                        <p className="text-xs font-semibold text-amber-400 mt-1 uppercase tracking-wider">{sessionData?.topic?.topic_name}</p>
                    </div>
                    <p className="text-sm text-slate-300 max-w-md leading-relaxed">{blueprint?.overallSummary}</p>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
                        {nextTopic ? (
                            <button
                                onClick={handleNextTopic}
                                className="w-full sm:flex-1 py-3.5 px-6 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                            >
                                <span>Next Topic: {nextTopic.topic_name}</span>
                                <i className="bi bi-arrow-right font-bold"></i>
                            </button>
                        ) : null}
                        <button
                            onClick={handleReStudyTopic}
                            className="w-full sm:flex-1 py-3.5 px-6 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 rounded-2xl font-bold text-sm shadow-xs transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <i className="bi bi-arrow-counterclockwise"></i>
                            <span>Re-study Topic</span>
                        </button>
                        <button
                            onClick={handleGoBack}
                            className="w-full sm:w-auto px-6 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold text-sm shadow-xs transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <i className="bi bi-journal-check"></i>
                            <span>Study Guide</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Main Fullscreen Teaching Canvas (Full Screen Width) ───────────────────────── */}
            {!isGeneratingBlueprint && !isDone && (
                <main className="flex-1 flex flex-col px-1.5 sm:px-4 pt-1.5 pb-2 w-full h-full gap-2 min-h-0 overflow-hidden">

                    {/* ── Fullscreen Charcoal Blackboard ── */}
                    <div className="relative flex-1 min-h-0 flex flex-col justify-start bg-[#181C20] border-2 border-[#2D333B] rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 shadow-2xl overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-[#444C56]/60 [&::-webkit-scrollbar-thumb]:rounded-full text-white">

                        {isLoadingUnit && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#181C20]/90 backdrop-blur-xs rounded-3xl z-20">
                                <div className="w-8 h-8 border-2 border-[#444C56] border-t-amber-400 rounded-full animate-spin" />
                                <p className="text-sm font-handwriting text-[#E2E8F0] tracking-wide">
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

                            {/* ── Waiting for voice / preparation state: Blinking Colored Cursor on Clean Blackboard ── */}
                            {visibleBoardLines.length === 0 && !isDone && (
                                <div className="flex-1 flex flex-col items-start justify-start pt-6 sm:pt-8 px-2 animate-fade-in">
                                    <div className="flex items-center gap-3 font-mono text-sm sm:text-base tracking-wide">
                                        <span className="inline-block w-3 h-5 sm:w-3.5 sm:h-6 bg-gradient-to-b from-sky-300 via-blue-400 to-indigo-400 rounded-xs shadow-[0_0_12px_rgba(59,130,246,0.9)] animate-pulse" />
                                        <span className="text-xs text-sky-300/80 font-mono italic">
                                            {isTtsLoading ? 'Tuning audio synthesizer...' : isLoadingUnit ? 'Writing lesson...' : ''}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* ── Blackboard Content Area (Progressive Chalk Write-In & Inline Visuals) ── */}
                            {visibleBoardLines.length > 0 && (
                                <div className="flex-1 w-full space-y-3 pb-2">
                                    {visibleBoardLines.map((line, idx) => {
                                        const trimmed = line.trim();
                                        const isExplicitDiagram = /\[(diagram|visual|image)\]/i.test(trimmed);
                                        const isExplicitTable = /\[table\]/i.test(trimmed);

                                        // Render inline diagram if tag present
                                        if (isExplicitDiagram) {
                                            return (
                                                <div key={`inline-diag-${idx}`}>
                                                    {renderInlineDiagram()}
                                                </div>
                                            );
                                        }

                                        // Render inline table if tag present
                                        if (isExplicitTable) {
                                            return (
                                                <div key={`inline-table-${idx}`}>
                                                    {renderInlineTable()}
                                                </div>
                                            );
                                        }

                                        const isVarLine       = trimmed.includes('→');
                                        const isBlockFormula  = trimmed.startsWith('$$');
                                        const stepMatch       = trimmed.match(/^\*\*(.*?)\*\*\s*:\s*(.*)$/);
                                        const isWritingActive = (idx === activeWritingIndex || (idx === visibleBoardLines.length - 1 && isStreaming)) && isStreaming;

                                        // Auto-insert diagram right after line 1 (or after the first concept line) if no explicit tag exists
                                        const shouldAutoInsertDiagram = !hasExplicitDiagramTag && activeDiagramSvg && (
                                            idx === 0 || (visibleBoardLines.length === 1 && idx === 0)
                                        );

                                        // Auto-insert table right after formula line if no explicit table tag exists
                                        const shouldAutoInsertTable = !hasExplicitTableTag && activeTableMarkdown && (
                                            isBlockFormula || idx === 1
                                        );

                                        return (
                                            <React.Fragment key={`${idx}-${line.slice(0, 15)}`}>
                                                <div className="flex items-start gap-2.5 animate-fade-in w-full">
                                                    {stepMatch ? (
                                                        <div className="w-full flex flex-col gap-1 my-0.5">
                                                            <span className="font-bold text-xs sm:text-sm text-sky-300 tracking-wide font-mono bg-sky-400/10 px-2 py-0.5 rounded-md w-fit border border-sky-400/20">
                                                                {stepMatch[1]}
                                                            </span>
                                                            <div className="font-handwriting text-base sm:text-lg text-white leading-relaxed overflow-x-auto pl-1">
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                                    rehypePlugins={[rehypeKatex]}
                                                                    components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                                >{formatLatexMath(stepMatch[2])}</ReactMarkdown>
                                                                {isWritingActive && (
                                                                    <span className="inline-block w-2.5 h-4 sm:w-3 sm:h-5 ml-1.5 bg-gradient-to-b from-sky-300 via-blue-400 to-indigo-400 rounded-xs shadow-[0_0_10px_rgba(59,130,246,0.9)] animate-pulse align-middle" />
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
                                                                <span className="inline-block w-2.5 h-4 sm:w-3 sm:h-5 ml-1.5 bg-gradient-to-b from-sky-300 via-blue-400 to-indigo-400 rounded-xs shadow-[0_0_10px_rgba(59,130,246,0.9)] animate-pulse align-middle" />
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
                                                                <span className="inline-block w-2.5 h-4 sm:w-3 sm:h-5 ml-1.5 bg-gradient-to-b from-sky-300 via-blue-400 to-indigo-400 rounded-xs shadow-[0_0_10px_rgba(59,130,246,0.9)] animate-pulse align-middle" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Auto-injected diagram anywhere on board */}
                                                {shouldAutoInsertDiagram && renderInlineDiagram()}

                                                {/* Auto-injected table anywhere on board */}
                                                {shouldAutoInsertTable && renderInlineTable()}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {isMicListening && micDisplay && (
                        <div className="shrink-0 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-amber-300 animate-pulse px-3 py-1 bg-white/10 rounded-full w-fit mx-auto border border-white/20">
                            <i className="bi bi-mic-fill text-red-400"></i>
                            <span>"{micDisplay}..."</span>
                        </div>
                    )}

                    {/* ── Voice-First Floating Bottom Control Bar ── */}
                    <div className="shrink-0 flex flex-col gap-2 bg-[#181C20]/95 border border-[#2D333B] rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-md w-full mb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] sm:mb-2 max-w-xl mx-auto">
                        
                        {/* ── Image Attachment Preview (if photo snapped/uploaded) ── */}
                        {attachedImage && (
                            <div className="flex items-center justify-between gap-2 p-2 px-3.5 bg-[#22272E] border border-[#373E47] rounded-2xl w-full animate-fade-in shadow-xs">
                                <div className="flex items-center gap-2.5">
                                    <img src={attachedImage.base64} alt="Attached work" className="w-10 h-10 object-cover rounded-xl border border-white/20" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-100">Photo Attached</p>
                                        <p className="text-[10px] text-slate-400">Tap mic to speak question about your work</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => handleStudentReply('Please inspect my handwritten problem in this attached photo.', attachedImage)}
                                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer"
                                    >
                                        Analyze
                                    </button>
                                    <button
                                        onClick={() => setAttachedImage(null)}
                                        className="w-7 h-7 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs text-white cursor-pointer"
                                    >
                                        <i className="bi bi-x-lg text-xs"></i>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Centered Voice Navigation & Interaction Controls ── */}
                        <div className="flex items-center justify-between w-full">
                            {/* 1. Left: Restart / Simpler Explanation Button */}
                            <button
                                onClick={handleRestartSimplerBoard}
                                disabled={isGeneratingBlueprint || isTtsLoading}
                                title="Restart this board with simpler language"
                                className="flex items-center gap-1.5 px-3.5 sm:px-4 h-12 rounded-2xl bg-[#22272E] hover:bg-[#2D333B] border border-[#373E47] text-slate-300 hover:text-white font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-xs"
                            >
                                <i className="bi bi-arrow-counterclockwise text-base text-amber-400 font-bold"></i>
                                <span className="hidden sm:inline">Simpler</span>
                            </button>

                            {/* 2. Middle Controls: Pause/Play, Mic (Prominent Center), Camera */}
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                {/* Play/Pause Button */}
                                <button
                                    onClick={togglePauseAI}
                                    disabled={isTtsLoading || !blueprint}
                                    title={isSpeaking ? "Pause speech" : "Resume speech"}
                                    className={`flex items-center justify-center w-11 h-11 rounded-2xl border transition-all cursor-pointer shadow-xs active:scale-95 ${
                                        isSpeaking ? 'bg-amber-500/20 border-amber-400/40 text-amber-300' : 'bg-[#22272E] border-[#373E47] text-slate-300'
                                    }`}
                                >
                                    <i className={`bi ${isSpeaking ? 'bi-pause-fill text-lg' : 'bi-play-fill text-xl'}`}></i>
                                </button>

                                {/* Center Prominent Mic Button */}
                                <button
                                    onClick={toggleMic}
                                    disabled={isGeneratingBlueprint || !blueprint}
                                    title={isMicListening ? "Listening... Click to send" : "Tap to speak question or answer"}
                                    className={`flex items-center justify-center w-14 h-14 rounded-2xl font-bold transition-all cursor-pointer shadow-lg active:scale-95 ${
                                        isMicListening 
                                            ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-500/40' 
                                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-400/30'
                                    }`}
                                >
                                    <i className={`bi ${isMicListening ? 'bi-mic-fill' : 'bi-mic'} text-2xl`}></i>
                                </button>

                                {/* Camera Button */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    type="button"
                                    title="Snap or upload picture of your work"
                                    className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#22272E] hover:bg-[#2D333B] border border-[#373E47] text-slate-300 hover:text-white transition-all cursor-pointer shadow-xs active:scale-95"
                                >
                                    <i className="bi bi-camera text-lg"></i>
                                </button>
                            </div>

                            {/* 3. Right: Next Board / Advance Button */}
                            <button
                                onClick={handleAdvanceNextBoard}
                                disabled={isGeneratingBlueprint || isTtsLoading}
                                title="Advance to next board"
                                className="flex items-center gap-1.5 px-3.5 sm:px-4 h-12 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md"
                            >
                                <span className="hidden sm:inline">Next</span>
                                <i className="bi bi-arrow-right text-base font-bold"></i>
                            </button>

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
                </main>
            )}

            {/* ── Diagram Zoom Modal ────────────────────────────────────────── */}
            {isDiagramZoomed && activeDiagramSvg && (
                <div
                    onClick={() => setIsDiagramZoomed(false)}
                    className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 cursor-pointer animate-fade-in"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#181C20] border-2 border-[#373E47] rounded-3xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl flex flex-col gap-4 relative cursor-default text-white max-h-[92vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between border-b border-white/20 pb-3">
                            <div className="flex items-center gap-2">
                                <i className="bi bi-diagram-3-fill text-sky-400 text-lg"></i>
                                <h3 className="font-bold text-base text-white">Realistic Scientific Illustration</h3>
                            </div>
                            <button
                                onClick={() => setIsDiagramZoomed(false)}
                                className="w-8 h-8 rounded-full bg-[#2D333B] hover:bg-[#444C56] text-white flex items-center justify-center cursor-pointer transition-colors"
                            >
                                <i className="bi bi-x-lg text-xs"></i>
                            </button>
                        </div>
                        <div
                            className="w-full flex items-center justify-center p-4 sm:p-6 bg-[#22272E] rounded-2xl border border-[#373E47] overflow-auto [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[65vh]"
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
