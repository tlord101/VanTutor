import React, { useState, useEffect, useRef, useCallback } from 'react';
import { readCachedJson } from '../utils/cache';
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

// ── Pedagogical Multi-Board Step Ordering (9 Boards per Concept) ─────────────
export type SubStep =
    | 'intuition_hook'        // Board 1: Real-world motivation & relatable opening question
    | 'physical_meaning'      // Board 2: Deep conceptual definition & physical intuition
    | 'formula_table'         // Board 3: Progression table & LaTeX formula breakdown
    | 'distinctions_pitfalls' // Board 4: Twin-term distinctions & golden rules
    | 'example_problem'       // Board 5: Worked Example setup (full statement & givens)
    | 'example_step1'         // Board 6: Worked Example Step 1 (Principle & formula choice)
    | 'example_step2'         // Board 7: Worked Example Step 2 (Substitution & calculation)
    | 'example_step3'         // Board 8: Worked Example Step 3 (Final result & units/check)
    | 'concept_recap';        // Board 9: Concept wrap-up & readiness check

export const SUB_STEP_ORDER: SubStep[] = [
    'intuition_hook',
    'physical_meaning',
    'formula_table',
    'distinctions_pitfalls',
    'example_problem',
    'example_step1',
    'example_step2',
    'example_step3',
    'concept_recap',
];

export const SUB_STEP_LABEL: Record<SubStep, string> = {
    intuition_hook:        '🌱 1. Real-World Hook',
    physical_meaning:      '📌 2. Core Meaning',
    formula_table:         '📐 3. Formula & State Table',
    distinctions_pitfalls: '⚠️ 4. Key Distinctions',
    example_problem:       '✏️ 5. Problem Setup',
    example_step1:         '🔍 6. Step 1: Principle',
    example_step2:         '🧮 7. Step 2: Calculation',
    example_step3:         '🎯 8. Step 3: Final Result',
    concept_recap:         '🎓 9. Concept Recap',
};

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
 * Robust JSON parser specifically engineered for LLM generated JSON that may contain
 * unescaped LaTeX backslashes (\frac, \Delta, \alpha, \text, \approx), markdown fences,
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
                    // Standard valid JSON escapes
                    if (next === '"' || next === '\\' || next === '/') {
                        out += '\\' + next;
                        i++;
                    } else if (next === 'u' && /^[0-9a-fA-F]{4}/.test(cleaned.slice(i + 2, i + 6))) {
                        out += '\\u' + cleaned.slice(i + 2, i + 6);
                        i += 5;
                    } else if (/^[bfnrt]/.test(next)) {
                        // Check if it's a LaTeX command starting with b, f, n, r, t (e.g. \frac, \nabla, \text, \rho, \beta, \begin)
                        const remainder = cleaned.slice(i + 1, i + 15);
                        if (/^(frac|nabla|text|times|theta|tau|tan|rho|right|nu|neq|neg|normal|beta|begin|bar|bot|bf|bold|box|bullet|approx|gamma)/i.test(remainder)) {
                            out += '\\\\' + next;
                        } else {
                            out += '\\' + next;
                        }
                        i++;
                    } else {
                        // Any other LaTeX/escaped character like \sigma, \Delta, \vec, \alpha, \int, \sum, \partial, etc.
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

        // Clean trailing commas before closing braces/brackets
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
    } catch (err) {
        console.error('[robustParseJson] All JSON parse strategies failed. Snippet:', cleaned.slice(0, 400));
        throw err;
    }
}

interface BlueprintVariable {
    symbol: string;
    meaning: string;
    unit?: string;
}

interface BlueprintStep {
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

interface BlueprintExample {
    problem: string;
    givens: { symbol: string; value: string; unit?: string }[];
    find: string;
    step1: BlueprintStep;
    step2: BlueprintStep;
    step3: BlueprintStep;
    answer: string;
    physicalTakeaway: string;
}

interface BlueprintConcept {
    conceptName:        string;
    relatableQuestion:  string;
    realWorldScenario:  string;
    keyDefinition:      string;
    physicalMeaning:    string;
    progressionTable:   string;
    formula:            string | null;
    variables:          BlueprintVariable[];
    keyDistinction:     string;
    goldenRule:         string;
    example:            BlueprintExample;
    commonPitfalls:     string[];
    summaryPoints:      string[];
    diagramSvg?:        string | null;
    tableMarkdown?:     string | null;
    diagramCaption?:    string;
}

interface LessonBlueprint {
    overview:       string;
    concepts:       BlueprintConcept[];
    overallSummary: string;
}

interface UnitPresentationResponse {
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

interface DialogueTurn {
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

// ── Dynamic Action Button Helpers ─────────────────────────────────────────────
function getDefaultActions(step: SubStep): {
    positive: { label: string; text: string };
    negative: { label: string; text: string };
} {
    switch (step) {
        case 'intuition_hook':
            return {
                positive: { label: "Makes sense, define it →", text: "I understand the real-world idea, let's look at the definition." },
                negative: { label: "Another real-world example ↺", text: "Can you give another real-world scenario?" },
            };
        case 'physical_meaning':
            return {
                positive: { label: "Understood, show formula →", text: "The physical meaning is clear, show me the equation and state table." },
                negative: { label: "Explain in simpler terms ↺", text: "Can you explain the physical meaning in simpler terms?" },
            };
        case 'formula_table':
            return {
                positive: { label: "Table & math clear, next →", text: "I follow the state table and formula, what are the key distinctions?" },
                negative: { label: "Explain variables & units ↺", text: "Can you walk through the variables and units once more?" },
            };
        case 'distinctions_pitfalls':
            return {
                positive: { label: "Noted trap, let's solve! →", text: "I understand the distinction and golden rule, let's solve an example problem." },
                negative: { label: "Why is this confusing? ↺", text: "Why do students commonly get confused here?" },
            };
        case 'example_problem':
            return {
                positive: { label: "Givens clear, start Step 1 →", text: "I understand the given values and what we are finding, show Step 1." },
                negative: { label: "Re-read question slowly ↺", text: "Can you re-read the problem statement and clarify the givens?" },
            };
        case 'example_step1':
            return {
                positive: { label: "Formula chosen, do calculation →", text: "The formula selection makes sense, let's calculate the numbers in Step 2." },
                negative: { label: "Why this formula? ↺", text: "Why did we pick this specific formula instead of another?" },
            };
        case 'example_step2':
            return {
                positive: { label: "Calculation followed, see answer →", text: "I followed the substitution and math, let's verify the final result." },
                negative: { label: "Redo calculation step slowly ↺", text: "Can you redo the calculation step more slowly?" },
            };
        case 'example_step3':
            return {
                positive: { label: "Result verified, recap concept →", text: "The final answer and units make complete sense, let's recap." },
                negative: { label: "Explain the unit check ↺", text: "Could you explain why the unit came out this way?" },
            };
        case 'concept_recap':
            return {
                positive: { label: "Mastered! Next Concept →", text: "I have mastered this concept, let's move to the next concept!" },
                negative: { label: "Recap main takeaway once more ↺", text: "Could you recap the main takeaway once more?" },
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

        // In SVG <text>, y is the baseline. Offset vertically to center the foreignObject box.
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

    if (cleaned.includes('marker-end') && !cleaned.includes('<defs>')) {
        const defs = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#D9CCBC" /></marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#63B3ED" /></marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FC8181" /></marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#68D391" /></marker>
  </defs>`;
        cleaned = cleaned.replace(/<svg([^>]*)>/i, `<svg$1>${defs}`);
    }

    // Render KaTeX mathematical formulas inside SVG labels
    cleaned = renderKatexInSvg(cleaned);

    return cleaned;
}

// Visuals (SVG diagrams, Markdown tables) are dynamically generated exclusively by the AI in real time.

// ── Pure Board Content Generators for Fallback ────────────────────────────────
function getBoardLines(concept: BlueprintConcept, step: SubStep): string[] {
    switch (step) {
        case 'intuition_hook':
            return [
                `**Question**: ${concept.relatableQuestion}`,
                `**Physical Scenario**: ${concept.realWorldScenario || 'Everyday real-world situation'}`,
                `**Intuitive Meaning**: ${concept.physicalMeaning || concept.keyDefinition}`,
            ];
        case 'physical_meaning':
            return [
                concept.keyDefinition,
                `**Physical Significance**: ${concept.physicalMeaning || concept.keyDefinition}`,
            ];
        case 'formula_table': {
            const lines = [];
            if (concept.formula) lines.push(concept.formula);
            if (concept.variables && concept.variables.length > 0) {
                concept.variables.slice(0, 4).forEach(v => {
                    lines.push(`$${v.symbol}$ $\\rightarrow$ ${v.meaning} ($${v.unit || '\\text{SI}'}$)`);
                });
            }
            return lines;
        }
        case 'distinctions_pitfalls':
            return [
                `**Key Distinction**: ${concept.keyDistinction || 'Pay close attention to direction and sign convention.'}`,
                `**Golden Rule**: ${concept.goldenRule || (concept.summaryPoints?.[0] || 'Understand the core physical meaning.')}`,
                concept.commonPitfalls?.[0] ? `**Watch Out**: ${concept.commonPitfalls[0]}` : '',
            ].filter(Boolean);
        case 'example_problem': {
            const ex = concept.example || {
                problem: `Calculate the fundamental values for ${concept.conceptName}.`,
                givens: [{ symbol: 'x', value: '10', unit: 'units' }],
                find: `The primary value of ${concept.conceptName}`,
            };
            const lines = [
                `**Problem**: ${ex.problem || `Calculate the properties of ${concept.conceptName}.`}`,
            ];
            if (ex.givens && ex.givens.length > 0) {
                lines.push(`**Given**: ` + ex.givens.map(g => `$${g.symbol} = ${g.value}$ $${g.unit || ''}$`).join(', '));
            }
            if (ex.find) {
                lines.push(`**Find**: ${ex.find}`);
            }
            return lines;
        }
        case 'example_step1': {
            const s1 = concept.example?.step1;
            return [
                `**Step 1 — Principle & Formula**: ${s1?.explanation || 'Relate given values to target unknown.'}`,
                s1?.mathExpression ? `$$${s1.mathExpression}$$` : (s1?.formula ? `$$${s1.formula}$$` : (concept.formula ? `$$${concept.formula}$$` : `$$v_f = v_i + at$$`)),
            ];
        }
        case 'example_step2': {
            const s2 = concept.example?.step2;
            return [
                `**Step 2 — Calculation**: ${s2?.explanation || 'Substitute known numerical values.'}`,
                s2?.mathExpression ? `$$${s2.mathExpression}$$` : `$$v_f = 0 + (2\\text{ m/s}^2)(5\\text{ s}) = 10\\text{ m/s}$$`,
            ];
        }
        case 'example_step3': {
            const ex = concept.example;
            return [
                `**Step 3 — Final Result**: $$${ex?.answer || '10\\text{ units}'}$$`,
                `**Unit & Physical Check**: ${ex?.physicalTakeaway || 'Dimensionally consistent with physical meaning.'}`,
            ];
        }
        case 'concept_recap':
            return [
                `**Golden Rule**: ${concept.goldenRule || 'Core physical concept locked in.'}`,
                concept.formula ? `$$${concept.formula}$$` : '',
                `**Key Takeaway**: ${concept.summaryPoints?.[0] || 'Concept mastered.'}`,
            ].filter(Boolean);
        default:
            return [`${concept.conceptName}`];
    }
}

function getSpokenText(concept: BlueprintConcept, step: SubStep): string {
    const name = concept.conceptName;
    const ex = concept.example;
    switch (step) {
        case 'intuition_hook':
            return `Let us start with ${name}. Think about this question: ${concept.relatableQuestion || 'What happens when forces or variables interact?'} Picture ${concept.realWorldScenario || 'a real world situation'}. What comes to mind?`;
        case 'physical_meaning':
            return `Here is what ${name} means physically. ${concept.physicalMeaning || concept.keyDefinition || 'It defines how the system behaves under standard conditions.'}. Notice how it connects to our everyday experience. Does this definition feel clear?`;
        case 'formula_table':
            return `Look at the board. Here is how we quantify ${name}. Notice how the numbers progress step by step in our table, and how the equation gives us the mathematical shortcut. How do these variables relate to one another?`;
        case 'distinctions_pitfalls':
            return `Before we solve an example, let us look at the most common trap students fall into. ${concept.keyDistinction || 'Pay close attention to the difference between these quantities.'} Remember our golden rule: ${concept.goldenRule || 'Stay consistent with physical units and signs.'}. Does this make sense?`;
        case 'example_problem':
            return `Let us work through an example step by step. Here is our problem on the board: ${ex?.problem || `Find the key parameters for ${name}`}. We have identified our given values and what we are looking for. Are you ready to see Step 1?`;
        case 'example_step1':
            return `Step 1: First, we identify our governing principle and formula. ${ex?.step1?.explanation || 'We choose the equation that relates our knowns to our unknown.'} Take a look at the board. Does this formula choice make sense?`;
        case 'example_step2':
            return `Step 2: Now we substitute our given values into the formula and calculate. ${ex?.step2?.explanation || 'Substituting the numbers step by step gives us our result.'} Look at the calculation on the board. Did you follow each calculation step?`;
        case 'example_step3':
            return `Step 3: Here is our final answer: ${ex?.answer || 'Verified result'}. Notice that the units check out and the physical meaning matches our intuition. ${ex?.physicalTakeaway || ''} How do you feel about this solution?`;
        case 'concept_recap':
            return `Excellent work! You have mastered ${name}. Remember: ${concept.goldenRule || 'Physical principles remain constant across systems.'}. Are you ready to proceed to the next concept?`;
        default:
            return '';
    }
}

function nextSubStep(
    cIdx: number,
    sStep: SubStep,
    blueprint: LessonBlueprint
): { conceptIdx: number; subStep: SubStep; done: boolean } {
    const currentStepIdx = SUB_STEP_ORDER.indexOf(sStep);
    let nextIdx = currentStepIdx + 1;

    while (nextIdx < SUB_STEP_ORDER.length) {
        const candidate = SUB_STEP_ORDER[nextIdx];
        const concept = blueprint.concepts[cIdx];
        if (candidate === 'formula_table' && !concept?.formula && (!concept?.variables || concept.variables.length === 0)) {
            nextIdx++;
        } else {
            break;
        }
    }

    if (nextIdx < SUB_STEP_ORDER.length) {
        return { conceptIdx: cIdx, subStep: SUB_STEP_ORDER[nextIdx], done: false };
    }

    const nextConceptIdx = cIdx + 1;
    if (nextConceptIdx >= blueprint.concepts.length) {
        return { conceptIdx: cIdx, subStep: 'concept_recap', done: true };
    }
    return { conceptIdx: nextConceptIdx, subStep: 'intuition_hook', done: false };
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

    // ── Teaching Position ────────────────────────────────────────────────
    const [conceptIdx, setConceptIdx] = useState(0);
    const [subStep, setSubStep] = useState<SubStep>('intuition_hook');
    const [isDone, setIsDone] = useState(false);

    // ── Dynamic Action Buttons ───────────────────────────────────────────
    const [positiveAction, setPositiveAction] = useState<{ label: string; text: string }>(
        getDefaultActions('intuition_hook').positive
    );
    const [negativeAction, setNegativeAction] = useState<{ label: string; text: string }>(
        getDefaultActions('intuition_hook').negative
    );

    // ── Board State ──────────────────────────────────────────────────────
    const [visibleBoardLines, setVisibleBoardLines] = useState<string[]>([]);
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
    const fileInputRef       = useRef<HTMLInputElement | null>(null);
    const isActiveRef        = useRef(true);
    const hasStartedRef      = useRef(false);
    const conceptIdxRef      = useRef(0);
    const subStepRef         = useRef<SubStep>('intuition_hook');
    const audioContextRef    = useRef<AudioContext | null>(null);
    const currentAudioRef    = useRef<AudioBufferSourceNode | null>(null);
    const playSessionIdRef   = useRef<number>(0);
    const recognitionRef     = useRef<any>(null);
    const spokenTextRef      = useRef('');
    const lastSpokenTextRef  = useRef('');
    const handleStudentReplyRef = useRef<(reply: string, image?: { base64: string; mimeType: string } | null) => Promise<void>>(() => Promise.resolve());
    const streamTimersRef    = useRef<ReturnType<typeof setTimeout>[]>([]);
    const dialogueHistoryRef = useRef<DialogueTurn[]>([]);

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

    const speakText = useCallback(async (text: string, onEnd?: () => void): Promise<void> => {
        if (!isActiveRef.current || isMuted || !text) {
            onEnd?.();
            if (!isMuted) startMicListening();
            return;
        }
        stopAudioImmediate();
        setIsPaused(false);
        setIsTtsLoading(true);
        lastSpokenTextRef.current = text;

        const sessionId = ++playSessionIdRef.current;
        const cleanedText = cleanSpokenTextForTTS(text);

        if (!cleanedText) {
            setIsTtsLoading(false);
            onEnd?.();
            startMicListening();
            return;
        }

        // On-Device Kitten TTS Voice Synthesis (Zero Cloud API Queries, Zero Quota Consumption)
        setIsTtsLoading(false);
        setIsSpeaking(true);
        setIsPaused(false);

        const player = kittenTts.speak(cleanedText, {
            cleanText: true,
            onStart: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(true);
                setIsTtsLoading(false);
            },
            onEnd: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                setIsPaused(false);
                currentAudioRef.current = null;
                onEnd?.();
                startMicListening();
            },
            onError: () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                setIsSpeaking(false);
                setIsPaused(false);
                currentAudioRef.current = null;
                onEnd?.();
                startMicListening();
            },
        });

        currentAudioRef.current = player as any;
    }, [isMuted, startMicListening]);

    // ── Board Line Streaming (Smooth Bit-by-Bit Chalk Reveal Paced with Speech) ─
    const streamBoardLines = useCallback((lines: string[], spokenText?: string) => {
        clearAllStreamTimers();
        setVisibleBoardLines([]);
        setIsStreaming(true);

        if (!lines || lines.length === 0) {
            setIsStreaming(false);
            return;
        }

        // Calculate smooth pacing synchronized with natural speech duration (~55ms per character)
        const totalDurationMs = spokenText ? Math.max(3500, spokenText.length * 55) : lines.length * 2200;
        const lineIntervalMs = Math.max(1500, Math.min(3200, Math.floor(totalDurationMs / Math.max(lines.length, 1))));

        let displayed: string[] = [];
        let idx = 0;

        const tick = () => {
            if (!isActiveRef.current) return;
            if (idx >= lines.length) {
                setIsStreaming(false);
                return;
            }
            if (displayed.length >= MAX_BOARD_LINES) {
                displayed = [];
                setVisibleBoardLines([]);
            }
            displayed.push(lines[idx]);
            setVisibleBoardLines([...displayed]);
            idx++;
            if (idx < lines.length) {
                const t = setTimeout(tick, lineIntervalMs);
                streamTimersRef.current.push(t);
            } else {
                setIsStreaming(false);
            }
        };

        // Reveal the first headline/anchor line after a short initial pause
        const initialDelay = setTimeout(tick, 400);
        streamTimersRef.current.push(initialDelay);
    }, []);

    function normalizeBlueprint(bp: any): LessonBlueprint {
        if (!bp || typeof bp !== 'object') {
            return {
                title: 'Foundational Tutorial',
                overview: 'Step-by-step interactive lesson.',
                concepts: [],
            };
        }
        const rawConcepts = Array.isArray(bp.concepts) ? bp.concepts : [];
        const concepts: BlueprintConcept[] = rawConcepts.map((c: any, i: number) => {
            const cName = c.conceptName || `Concept ${i + 1}`;
            const ex = c.example || {};
            return {
                conceptName: cName,
                relatableQuestion: c.relatableQuestion || `What happens in real physical situations involving ${cName}?`,
                realWorldScenario: c.realWorldScenario || `Everyday practical interaction with ${cName}`,
                keyDefinition: c.keyDefinition || `Fundamental definition and role of ${cName}`,
                physicalMeaning: c.physicalMeaning || c.keyDefinition || `Physical intuition and meaning of ${cName}`,
                formula: c.formula || '',
                variables: Array.isArray(c.variables) ? c.variables : [],
                progressionTable: c.progressionTable || { headers: ['State', 'Value', 'Meaning'], rows: [['Initial', '0', 'Rest']] },
                keyDistinction: c.keyDistinction || 'Pay attention to units, direction, and conventions.',
                goldenRule: c.goldenRule || 'Physical laws remain consistent.',
                summaryPoints: Array.isArray(c.summaryPoints) && c.summaryPoints.length > 0 ? c.summaryPoints : ['Core principle mastered.'],
                commonPitfalls: Array.isArray(c.commonPitfalls) ? c.commonPitfalls : [],
                example: {
                    problem: ex.problem || `Calculate the governing parameters for ${cName}.`,
                    givens: Array.isArray(ex.givens) ? ex.givens : [{ symbol: 'x', value: '10', unit: 'units' }],
                    find: ex.find || `The primary value of ${cName}`,
                    step1: {
                        title: ex.step1?.title || 'Identify Principle & Formula',
                        explanation: ex.step1?.explanation || 'Relate knowns to unknown.',
                        formula: ex.step1?.formula || c.formula || 'y = f(x)',
                        mathExpression: ex.step1?.mathExpression || c.formula || 'y = f(x)',
                    },
                    step2: {
                        title: ex.step2?.title || 'Substitute Values & Calculate',
                        explanation: ex.step2?.explanation || 'Substitute known numerical values.',
                        mathExpression: ex.step2?.mathExpression || 'y = 10',
                    },
                    answer: ex.answer || '10\\text{ units}',
                    physicalTakeaway: ex.physicalTakeaway || 'Result is dimensionally consistent.',
                },
            };
        });

        return {
            title: bp.title || 'Interactive Lesson',
            overview: bp.overview || 'Comprehensive step-by-step tutorial.',
            concepts,
        };
    }

    // ── Master Blueprint Generation (Bit-by-Bit, Multi-Board & Step-by-Step) ─
    const generateBlueprint = useCallback(async (session: VoiceTutorialSessionData, studentMem?: StudentCognitiveProfile | null): Promise<LessonBlueprint | null> => {
        setIsGeneratingBlueprint(true);
        setBlueprintGenStep('Analyzing problem & learning objectives...');

        const aiClient = createAvelutAI(appSettings, userProfile || null);
        if (!aiClient) { setIsGeneratingBlueprint(false); return null; }

        const courseName = session.course?.course_name || 'Academic Tutorial';
        const topicName  = session.topic?.topic_name || 'Core Concepts';
        const level      = session.course?.level || userProfile?.level || 'University';
        const hasImage   = Boolean(session.image);

        setBlueprintGenStep(hasImage ? 'Analyzing scanned problem image & structuring step-by-step breakdown...' : 'Structuring deep multi-board lesson progression...');

        const memoryContext = studentMem?.lastTopicTaught
            ? `STUDENT HISTORY:
- Last Topic: "${studentMem.lastTopicTaught.topicName}"
- Known Masteries: ${studentMem.overallMasteries.slice(-4).join(', ') || 'Foundations'}
- Struggles: ${studentMem.overallWeakPoints.slice(-4).join(', ') || studentMem.lastTopicTaught.struggledKeyPoints.join(', ') || 'Unit consistency'}
- Pedagogy: Intuition first, state progression tables before formulas, and 1-step-per-board problem solving.`
            : `STUDENT: New session. Maintain crystal-clear intuitive pacing.`;

        const imageInstructions = hasImage ? `
*** SPECIAL MODE: SCANNED PROBLEM VISUAL TUTORIAL ***
The student uploaded an image of a problem/diagram they want to be taught.
1. Inspect the provided image in detail: equations, diagrams, given values, variables, and the questions asked.
2. Custom User Notes / Focus: "${session.customPrompt || 'Teach me how to solve this step by step'}"
3. The lesson concepts and worked example MUST BE BUILT DIRECTLY AROUND SOLVING AND UNDERSTANDING THE SCANNED PROBLEM IN THE IMAGE.
4. Explain the physical and mathematical intuition behind the problem first.
5. In the worked example ('example'): Set the problem to be the EXACT problem from the scanned image with all givens, unknowns, Step 1 (Principle & formula choice), Step 2 (Substitution & calculation), and Step 3 (Final result, units, and physical check).
` : '';

        const prompt = `You are AVELUT Master STEM Curriculum Architect & Voice Tutorial Instructor.
Design a thorough, bit-by-bit lesson blueprint for:
Course: "${courseName}"
Topic: "${topicName}"
Level: ${level}
${imageInstructions}
${memoryContext}

PEDAGOGICAL REQUIREMENTS:
1. Simplest Words Possible (CRITICAL): Use the simplest, most intuitive everyday words to explain every concept. Eliminate unnecessary academic jargon. If a technical term must be taught, define it immediately using a concrete real-world physical object.
2. Real-World Physical Object Analogies (MANDATORY): Always use familiar physical objects to describe and define abstract concepts.
   - For example, to define systems (open vs. closed vs. isolated system), use a room with open vs closed windows/doors, or a cup of hot tea (open cup vs lid on top vs thermos flask).
   - For circuits, use a water loop with a pump and valve.
   - For momentum/inertia, use a loaded shopping cart vs an empty cart.
   - For forces and kinematics, use a moving car or a ball tossed in the air.
3. Multi-Board Depth (3+ boards per concept): Do not rush concepts into a single slide. Break each concept into deep intuitive stages.
4. Step-by-Step Problem Solving (1 step per board): When giving worked examples, break the solution into 3 distinct steps:
   - step1: Principle & Formula selection (Why this formula?)
   - step2: Substitution & Math calculation (1 step calculation)
   - step3: Final Result & Unit verification (What does this number mean physically?)
5. LaTeX / KaTeX Typography: Format all math symbols, formulas, variables, subscripts, powers, and units in valid LaTeX delimiters ($...$ or $$...$$). E.g. $v_f = v_i + at$, $a = 2\\text{ m/s}^2$, $10^5$, $\\sqrt{2gh}$, $F_{\\text{net}}$.
6. State Progression Tables: Concrete numerical state tables showing how quantities evolve step-by-step.
7. Twin-Term Distinctions: Explicitly contrast confusing pairs (e.g. Speed vs. Velocity, Mass vs. Weight) with bold Golden Rules.

OUTPUT VALID JSON ONLY (No markdown fences, no raw text):
{
  "overview": "2-3 sentence engaging overview",
  "concepts": [
    {
      "conceptName": "Short Concept Name (2-5 words)",
      "relatableQuestion": "Everyday intuitive question (e.g. 'When you step on the gas pedal, what actually changes?')",
      "realWorldScenario": "Concrete everyday scenario (e.g. sports car 0 to 60 mph on highway ramp)",
      "keyDefinition": "Clear, deep physical definition with LaTeX math",
      "physicalMeaning": "Physical intuition and why it behaves this way in the physical world",
      "progressionTable": "| Time ($t$) | Velocity ($v$) | What is happening? |\\n| :---: | :---: | :--- |\\n| **0 s** | **12 m/s** | Initial speed ($v_i$) |\\n| **1 s** | **16 m/s** | Added $+4\\text{ m/s}$ ($a = 4\\text{ m/s}^2$) |\\n| **2 s** | **20 m/s** | Added $+4\\text{ m/s}$ |",
      "formula": "$$LaTeX equation$$ or null",
      "variables": [
        {"symbol": "a", "meaning": "Acceleration — rate of velocity change per second", "unit": "\\text{m/s}^2"}
      ],
      "keyDistinction": "Crucial distinction from its commonly confused counterpart (e.g. Speed vs. Velocity)",
      "goldenRule": "Memorable Golden Rule (e.g. 'Acceleration tells you how velocity changes each second; velocity tells you how position changes.')",
      "example": {
        "problem": "Clear, complete problem statement with given numbers in LaTeX (e.g. A train accelerates from rest at $2\\text{ m/s}^2$ for $5\\text{ s}$. Find its final velocity.)",
        "givens": [
          {"symbol": "v_i", "value": "0\\text{ m/s}"},
          {"symbol": "a", "value": "2\\text{ m/s}^2"},
          {"symbol": "t", "value": "5\\text{ s}"}
        ],
        "find": "Final velocity $v_f$",
        "step1": {
          "stepNumber": 1,
          "title": "Identify Principle & Formula",
          "explanation": "Since acceleration is constant, we use the first kinematic equation connecting velocity, acceleration, and time.",
          "mathExpression": "v_f = v_i + at"
        },
        "step2": {
          "stepNumber": 2,
          "title": "Substitute Values & Calculate",
          "explanation": "Substitute the initial velocity $v_i = 0\\text{ m/s}$, acceleration $a = 2\\text{ m/s}^2$, and time $t = 5\\text{ s}$.",
          "mathExpression": "v_f = 0 + (2\\text{ m/s}^2)(5\\text{ s}) = 10\\text{ m/s}"
        },
        "step3": {
          "stepNumber": 3,
          "title": "Final Result & Unit Verification",
          "explanation": "The train reaches $10\\text{ m/s}$, gaining $2\\text{ m/s}$ every second for 5 seconds.",
          "mathExpression": "v_f = 10\\text{ m/s}"
        },
        "answer": "10\\text{ m/s}",
        "physicalTakeaway": "Every second of acceleration added $2\\text{ m/s}$ of speed."
      },
      "commonPitfalls": ["Forgetting direction in vector quantities", "Mixing up units"],
      "summaryPoints": ["Key point 1", "Key point 2"]
    }
  ],
  "overallSummary": "1-2 sentence closing summary of the topic"
}`;

        try {
            setBlueprintGenStep('Designing interactive curriculum...');
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
                config: { responseMimeType: 'application/json', temperature: 0.4 },
            });
            const raw = getResponseText(result);
            if (!raw) throw new Error('empty blueprint response');
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
            await saveLocalVoiceTutorialProgress(uid, cid, tid, 0, 'intuition_hook', false, bp);
        }

        if (!isActiveRef.current || !bp) return;
        setBlueprint(bp);

        let startConceptIdx = sqliteRecord?.conceptIdx ?? 0;
        let startSubStep: SubStep = (sqliteRecord?.subStep as SubStep) || 'intuition_hook';

        if (startConceptIdx >= bp.concepts.length) {
            startConceptIdx = 0;
            startSubStep = 'intuition_hook';
        }

        conceptIdxRef.current = startConceptIdx;
        subStepRef.current    = startSubStep;
        const defaultActs = getDefaultActions(startSubStep);
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

        await presentUnit(bp, startConceptIdx, startSubStep, studentMem, true);
    }, [sessionData, userProfile, generateBlueprint]);

    // ── Present Unit (Deep Multi-Board & Step-by-Step) ────────────────────────
    const presentUnit = useCallback(async (
        bp: LessonBlueprint,
        cIdx: number,
        sStep: SubStep,
        studentMem?: StudentCognitiveProfile | null,
        isSessionStart?: boolean,
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

        const fallbackActs = getDefaultActions(sStep);
        setPositiveAction(fallbackActs.positive);
        setNegativeAction(fallbackActs.negative);

        setIsLoadingUnit(true);
        setVisibleBoardLines([]);
        setActiveDiagramSvg(null);
        setActiveTableMarkdown(null);
        setActiveVisualCaption(null);

        // Save progress immediately to SQLite & local cache
        const cid = sessionData?.course?.course_id || 'general';
        const tid = sessionData?.topic?.topic_id || 'core';
        void saveLocalVoiceTutorialProgress(userProfile?.uid || 'anon', cid, tid, cIdx, sStep, false, bp);

        const memoryOpening = (isSessionStart && cIdx === 0 && sStep === 'intuition_hook' && studentMem?.lastTopicTaught)
            ? `OPENING MEMORY CONTEXT:
The student previously learned "${studentMem.lastTopicTaught.topicName}" where they encountered ${studentMem.lastTopicTaught.struggledKeyPoints?.[0] || 'calculation precision'}. Open warmly referencing their journey before launching into ${concept.conceptName}.`
            : '';

        const subStepInstructions: Record<SubStep, string> = {
            intuition_hook: `Board 1: INTUITIVE HOOK & EVERYDAY SCENARIO for "${concept.conceptName}".
${memoryOpening}
Relatable Question: ${concept.relatableQuestion}
Everyday Scenario: ${concept.realWorldScenario}
- spokenExplanation: (4-5 engaging conversational sentences). Greet the student, pose the relatable question vividly, and ground the concept in everyday physical intuition. Ask how they visualize this.
- boardLines[0]: "**Question**: ${concept.relatableQuestion}"
- boardLines[1]: "**Physical Scenario**: ${concept.realWorldScenario}"
- boardLines[2]: "**Intuitive Meaning**: ${concept.physicalMeaning || concept.keyDefinition}"
- diagramSvg: Labeled physical scenario sketch (e.g. car on road, leaning ruler, cliff).
- positiveReplyLabel: "Makes sense, define it →"
- negativeReplyLabel: "Another real-world example ↺"`,

            physical_meaning: `Board 2: PHYSICAL MEANING & CONCEPTUAL DEFINITION for "${concept.conceptName}".
Definition: ${concept.keyDefinition}
Physical Intuition: ${concept.physicalMeaning}
- spokenExplanation: (4-5 sentences). Break down the definition into crystal-clear physical intuition. Explain what the words mean in real life. Avoid reading raw math formulas aloud. Ask if the physical concept makes sense.
- boardLines[0]: "${concept.keyDefinition}"
- boardLines[1]: "**Physical Meaning**: ${concept.physicalMeaning || concept.keyDefinition}"
- diagramSvg: Clean schematic illustrating the concept.
- positiveReplyLabel: "Understood, show formula →"
- negativeReplyLabel: "Explain in simpler terms ↺"`,

            formula_table: `Board 3: FORMULA & STATE PROGRESSION TABLE for "${concept.conceptName}".
Progression Table: ${concept.progressionTable || 'Step-by-step state table'}
Formula: ${concept.formula || 'Core Equation'}
- spokenExplanation: (4-5 sentences). Tell the student to observe the progression table on the board. Walk through the values row by row, then show how the algebraic formula is simply the universal rule for that table. Explain the symbols and units.
- tableMarkdown: Clean markdown table with KaTeX math formatting ($...$).
- boardLines[0]: "${concept.formula || '$$v_f = v_i + at$$'}"
- boardLines[1-3]: Variable definitions with units in LaTeX (e.g. "$a \\rightarrow$ Acceleration ($\\text{m/s}^2$)").
- positiveReplyLabel: "Table & math clear, next →"
- negativeReplyLabel: "Explain variables & units ↺"`,

            distinctions_pitfalls: `Board 4: TWIN-TERM DISTINCTIONS & GOLDEN RULE for "${concept.conceptName}".
Distinction: ${concept.keyDistinction}
Golden Rule: ${concept.goldenRule}
- spokenExplanation: (4-5 sentences). Highlight the common mistake students make. Point out the exact difference between twin terms. State the Golden Rule with emphasis and ask if they have ever fallen into that trap.
- boardLines[0]: "**Key Distinction**: ${concept.keyDistinction || 'Pay close attention to direction and sign convention.'}"
- boardLines[1]: "**Golden Rule**: ${concept.goldenRule}"
- boardLines[2]: "**Watch Out**: ${(concept.commonPitfalls && concept.commonPitfalls[0]) || 'Ignoring units or signs'}"
- tableMarkdown: Side-by-side comparison table if relevant.
- positiveReplyLabel: "Noted trap, let's solve! →"
- negativeReplyLabel: "Why is this confusing? ↺"`,

            example_problem: `Board 5: WORKED EXAMPLE — PROBLEM & GIVENS SETUP for "${concept.conceptName}".
Problem: ${concept.example?.problem || `Find the key parameters for ${concept.conceptName}.`}
- spokenExplanation: (4-5 sentences). Read the problem statement clearly. Guide the student to identify each given quantity from the text, note the units, and pinpoint exactly what we need to solve for.
- boardLines[0]: "**Problem**: ${concept.example?.problem || `Calculate the values for ${concept.conceptName}.`}"
- boardLines[1]: "**Given**: ${concept.example?.givens ? concept.example.givens.map(g => `$${g.symbol} = ${g.value}$ $${g.unit || ''}$`).join(', ') : 'Known variables'}"
- boardLines[2]: "**Find**: ${concept.example?.find || 'Target quantity'}"
- diagramSvg: Clean SVG setup of the problem scenario with labeled arrows.
- positiveReplyLabel: "Givens clear, start Step 1 →"
- negativeReplyLabel: "Re-read question slowly ↺"`,

            example_step1: `Board 6: WORKED EXAMPLE — STEP 1: PRINCIPLE & FORMULA SELECTION for "${concept.conceptName}".
Step 1: ${concept.example?.step1?.title || 'Identify Principle & Formula'}
Formula: ${concept.example?.step1?.mathExpression || concept.formula || 'Governing Equation'}
- spokenExplanation: (4-5 sentences). Explain WHY we choose this specific formula based on our known variables and the target variable. Show that math is a logical choice, not guesswork.
- boardLines[0]: "**Step 1 — Principle & Formula**: ${concept.example?.step1?.explanation || 'Relate given values to target variable.'}"
- boardLines[1]: "$$${concept.example?.step1?.mathExpression || concept.formula || 'v_f = v_i + at'}$$"
- positiveReplyLabel: "Formula chosen, do calculation →"
- negativeReplyLabel: "Why this formula? ↺"`,

            example_step2: `Board 7: WORKED EXAMPLE — STEP 2: SUBSTITUTION & CALCULATION for "${concept.conceptName}".
Step 2: ${concept.example?.step2?.title || 'Substitute Values & Calculate'}
Calculation: ${concept.example?.step2?.mathExpression || 'Numerical substitution'}
- spokenExplanation: (4-5 sentences). Walk through the numerical substitution step by step. Show the intermediate math clearly. Emphasize tracking units along the way.
- boardLines[0]: "**Step 2 — Calculation**: ${concept.example?.step2?.explanation || 'Substitute known numerical values into the equation.'}"
- boardLines[1]: "$$${concept.example?.step2?.mathExpression || 'v_f = 0 + (2)(5) = 10'}$$"
- positiveReplyLabel: "Calculation followed, see answer →"
- negativeReplyLabel: "Redo calculation step slowly ↺"`,

            example_step3: `Board 8: WORKED EXAMPLE — STEP 3: FINAL RESULT & UNIT CHECK for "${concept.conceptName}".
Final Answer: ${concept.example?.answer || '10 units'}
Physical Takeaway: ${concept.example?.physicalTakeaway || 'Dimensionally consistent.'}
- spokenExplanation: (4-5 sentences). Present the final result. Verify that the units match the required quantity. Explain what the final number represents in the physical scenario.
- boardLines[0]: "**Final Answer**: $$${concept.example?.answer || '10\\text{ units}'}$$"
- boardLines[1]: "**Unit & Physical Check**: ${concept.example?.physicalTakeaway || 'Dimensionally consistent with physical meaning.'}"
- positiveReplyLabel: "Result verified, recap concept →"
- negativeReplyLabel: "Explain the unit check ↺"`,

            concept_recap: `Board 9: CONCEPT RECAP & READINESS CHECK for "${concept.conceptName}".
Golden Rule: ${concept.goldenRule}
- spokenExplanation: (3-4 sentences). Recap the core takeaways for ${concept.conceptName}. Congratulate the student on completing the worked example and mastering the concept. Ask if they are ready for the next concept!
- boardLines[0]: "**Golden Rule**: ${concept.goldenRule}"
- boardLines[1]: "${concept.formula ? `$$${concept.formula}$$` : 'Concept mastered.'}"
- boardLines[2]: "**Key Takeaway**: ${concept.summaryPoints?.[0] || 'Physical principles locked in.'}"
- positiveReplyLabel: "Mastered! Next Concept →"
- negativeReplyLabel: "Recap main takeaway once more ↺"`,
        };

        const aiPrompt = `You are AVELUT Master Voice & Visual STEM Tutor.
You embody the "Intuition First, Math Second, Bit-by-Bit" teaching methodology:
- PEDAGOGICAL HARMONY (CRITICAL): What the student SEES on the blackboard must be a punchy visual summary of what they HEAR in your voice.
- KEEP BLACKBOARD LINES SHORT & SWEET (1-3 lines max): Never write long reading paragraphs on the blackboard! The blackboard is for 1 key headline/question, core formula/equations ($...$, $$...$$), and 1 brief bullet point takeaway. The spoken explanation provides the complete conversational narrative.
- USE THE SIMPLEST WORDS POSSIBLE: Explain in plain, crystal-clear everyday English without dense jargon.
- ALWAYS USE REAL-WORLD PHYSICAL OBJECT ANALOGIES: Describe and define concepts using concrete physical objects (e.g., diving boards, rulers, shopping carts, water pipes, tea cups).
- SLOW DOWN and teach bit-by-bit across multiple boards. Speak 3-4 natural conversational sentences per board.
- Speak in warm, conversational, encouraging classroom teacher English.
- Blackboard Cleanliness: Write clean educational statements and equations on the board lines. The topic header is already fixed at the top of the blackboard.
- LaTeX KaTeX Typography (CRITICAL): Always format all formulas, powers, superscripts, subscripts, fractions, and units in valid LaTeX math delimiters ($...$ or $$...$$). E.g. $x^2$, $\\text{m/s}^2$, $10^5$, $\\sigma = \\frac{My}{I}$, $v_f = v_i + at$.

CURRENT CONCEPT:
${JSON.stringify(concept, null, 2)}
CURRENT BOARD STEP: ${sStep}
INSTRUCTION: ${subStepInstructions[sStep]}

SVG REAL-WORLD VISUAL DRAWING RULES (Draw recognizable physical objects, NOT just abstract boxes!):
- Must be a valid SVG string with viewBox="0 0 420 220", xmlns="http://www.w3.org/2000/svg"
- Use markers in <defs>: #arrow (brown), #arrow-red (forces/loads/gravity), #arrow-blue (velocities/motion/current), #arrow-green (reactions/equilibrium).
- High visual legibility & physical memorability:
  * CAR / VEHICLE: Draw the car chassis (curved hood, roof, windows fill='#22272E', headlights fill='#F6E05E'), wheels with rims (fill='#1C2128' / stroke='#FFF'), road surface with dashed yellow/white lines, velocity arrow with $v = ...$ and acceleration arrow with $a = ...$.
  * RULER & TABLE / WALL: Draw a wooden table (top & legs fill='#DDB892' / stroke='#FFF'), a leaning yellow ruler with clear centimeter tick marks (fill='#FEF08A' stroke='#854D0E'), angle arc $\\theta$, and height dimension line $h$.
  * CLIFF & PROJECTILE: Draw the stone cliff profile, ball on edge, parabolic dotted trajectory arc, splash/ground, initial velocity $v_x$, and gravity arrow $g$.
  * PULLEY & WEIGHTS: Draw the top ceiling bracket, circular pulley wheel, hanging rope lines, suspended mass buckets/blocks with tension $T$ and weight $mg$.
  * ELECTRIC CIRCUIT: Draw the battery cell (+/-), wire loop, open/closed switch, glowing light bulb with filament and glow rays, current arrows $I$.
  * PENDULUM: Draw the anchor mount, string of length $L$, spherical bob, swing arc, and angle $\\theta$.
- Contrast colors for dark charcoal blackboard: stroke="#FFF", fill="#22272E", font-family="system-ui, sans-serif", font-weight="bold", font-size="12px" to "14px".

OUTPUT VALID JSON ONLY:
{
  "boardLines": ["Line 1 with LaTeX", "Line 2 with LaTeX", "Line 3 with LaTeX"],
  "spokenExplanation": "Conversational spoken English text without raw LaTeX codes",
  "diagramSvg": "SVG string or null",
  "tableMarkdown": "Markdown table string with LaTeX or null",
  "diagramCaption": "Caption string or null",
  "positiveReplyLabel": "Button text (e.g. Makes sense, define it →)",
  "positiveReplyText": "Spoken text if student taps affirmative button",
  "negativeReplyLabel": "Button text (e.g. Explain again ↺)",
  "negativeReplyText": "Spoken text if student taps question button"
}`;

        const cost = getFeatureCost('study_guide_lesson', appSettings);
        if (userProfile) {
            const limitCheck = checkAICredits(userProfile, cost, appSettings);
            if (!limitCheck.allowed) {
                setIsLoadingUnit(false);
                setLimitModalData({
                    balance: limitCheck.balance,
                    cost: limitCheck.cost,
                });
                setShowLimitModal(true);
                return;
            }
        }

        try {
            const aiClient = createAvelutAI(appSettings, userProfile || null);
            if (!aiClient || !isActiveRef.current) {
                setIsLoadingUnit(false);
                const defaultLines = getBoardLines(concept, sStep);
                const defaultSpoken = getSpokenText(concept, sStep);
                streamBoardLines(defaultLines, defaultSpoken);
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(null);
                await speakText(defaultSpoken);
                return;
            }

            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
                config: { responseMimeType: 'application/json', temperature: 0.4 },
            });

            if (!isActiveRef.current) return;

            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty unit response');

            const parsed: UnitPresentationResponse = robustParseJson<UnitPresentationResponse>(raw);

            if (userProfile?.uid) {
                deductAICredits(userProfile.uid, cost, 'Study Guide - Board Step', appSettings).catch(console.warn);
            }

            setIsLoadingUnit(false);
            streamBoardLines(parsed.boardLines.slice(0, MAX_BOARD_LINES), parsed.spokenExplanation);

            // Record tutor utterance in dialogue history
            dialogueHistoryRef.current.push({
                role: 'tutor',
                text: parsed.spokenExplanation,
                boardSummary: parsed.boardLines.join(' | '),
            });
            if (dialogueHistoryRef.current.length > 8) {
                dialogueHistoryRef.current = dialogueHistoryRef.current.slice(-8);
            }

            if (parsed.positiveReplyLabel && parsed.positiveReplyText) {
                const pos = { label: parsed.positiveReplyLabel, text: parsed.positiveReplyText };
                positiveActionRef.current = pos;
                setPositiveAction(pos);
            }
            if (parsed.negativeReplyLabel && parsed.negativeReplyText) {
                setNegativeAction({ label: parsed.negativeReplyLabel, text: parsed.negativeReplyText });
            }

            const sanitized = sanitizeSvg(parsed.diagramSvg || concept.diagramSvg);
            const table = parsed.tableMarkdown || concept.tableMarkdown;

            if (sanitized) {
                setActiveDiagramSvg(sanitized);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(parsed.diagramCaption || `${concept.conceptName} Diagram`);
                setDiagramKey(k => k + 1);
            } else if (table && table.trim().includes('|')) {
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(table);
                setActiveVisualCaption(parsed.diagramCaption || `${concept.conceptName} Table`);
                setDiagramKey(k => k + 1);
            } else {
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(null);
            }

            await speakText(parsed.spokenExplanation);

        } catch (err) {
            console.warn('[PresentUnit] presentation error:', err);
            if (!isActiveRef.current) return;
            setIsLoadingUnit(false);
            streamBoardLines(getBoardLines(concept, sStep));
            setActiveDiagramSvg(null);
            setActiveTableMarkdown(null);
            setActiveVisualCaption(null);
            await speakText(getSpokenText(concept, sStep));
        }
    }, [speakText, streamBoardLines, userProfile, appSettings, sessionData]);

    // ── Interactive Student Reply & Conversational Question Answering ────────
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
        const currentStep = subStepRef.current;
        const uid = userProfile?.uid || 'anon';
        const tid = sessionData?.topic?.topic_id || 'core';
        const tName = sessionData?.topic?.topic_name || 'Core Principles';
        const cName = sessionData?.course?.course_name || 'Academic Tutorial';
        const cid = sessionData?.course?.course_id || 'general';

        // Add student reply to dialogue history
        dialogueHistoryRef.current.push({ role: 'student', text: attached ? `[Photo Attached] ${userText}` : userText });

        const aiClient = createAvelutAI(appSettings, userProfile || null);

        const conversationalPrompt = `You are AVELUT Master Voice & Visual STEM Tutor.
You are in an interactive lesson with a student.
Topic: "${tName}" in "${cName}"
Current Concept: "${currentC?.conceptName}"
Current Board Step: "${currentStep}" (${SUB_STEP_LABEL[currentStep]})
Current Blackboard Summary: "${visibleBoardLines.join(' | ')}"
Recent Dialogue History:
${dialogueHistoryRef.current.map(d => `${d.role.toUpperCase()}: ${d.text}`).join('\n')}

STUDENT SAID: "${userText}"
${attached ? 'STUDENT ATTACHED A PICTURE of their work, handwritten steps, textbook, or diagram. Inspect the image carefully, give detailed direct feedback or answer their question.' : ''}

YOUR GOALS:
1. Understand what the student is saying or asking:
   - Did the student ask a question, express confusion, or submit photo of their work?
   - Or is the student answering a question or confirming understanding (e.g. "Yes, makes sense", "The answer is 10 m/s", "I'm ready for the next step")?
2. If the student ASKED A QUESTION, IS CONFUSED, or ATTACHED WORK:
   - isClarification = true (DO NOT ADVANCE THE STEP!).
   - Answer their specific question thoroughly, conversationally, and warmly in 3-5 sentences.
   - Update the blackboard lines to visually illustrate the answer (with LaTeX math).
   - Check if they now understand before continuing.
3. If the student CONFIRMED UNDERSTANDING or ANSWERED CORRECTLY:
   - isClarification = false (PROCEED TO NEXT STEP).
   - Give a warm 1-sentence acknowledgment (e.g. "Spot on!", "Exactly right, let's keep moving!").
4. If the student ANSWERED INCORRECTLY:
   - isClarification = true.
   - Gently explain where the misconception is, show the correct logic on the board, and ask if it makes sense.
5. If drawing diagramSvg, draw recognizable real-world physical objects (car with wheels, table with ruler, cliff with projectile, pulley with rope, etc.) with viewBox="0 0 420 220" and contrast colors for dark blackboard.

OUTPUT VALID JSON ONLY:
{
  "isClarification": true / false,
  "spokenExplanation": "Conversational spoken explanation in clear English",
  "boardLines": ["Line 1 with LaTeX ($...$)", "Line 2 with LaTeX"],
  "diagramSvg": "SVG string if helpful or null",
  "positiveReplyLabel": "Text for next button (e.g. Got it! Continue →)",
  "positiveReplyText": "Spoken text if clicked",
  "negativeReplyLabel": "Text for question button (e.g. Still have a question ↺)",
  "negativeReplyText": "Spoken text if clicked"
}`;

        try {
            if (!aiClient) throw new Error('No AI client');
            setIsLoadingUnit(true);

            const promptParts: any[] = [{ text: conversationalPrompt }];
            if (attached?.base64) {
                const b64Data = attached.base64.includes(',') ? attached.base64.split(',')[1] : attached.base64;
                promptParts.push({
                    inlineData: {
                        data: b64Data,
                        mimeType: attached.mimeType || 'image/jpeg',
                    }
                });
            }

            const result = await aiClient.models.generateContent({
                model: appSettings?.primary_gemini_model || 'gemini-3.1-flash-lite',
                contents: [{ role: 'user', parts: promptParts }],
                config: { responseMimeType: 'application/json', temperature: 0.4 },
            });

            if (!isActiveRef.current) return;

            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty AI reply');

            const parsed = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
            setIsLoadingUnit(false);

            if (parsed.isClarification) {
                if (currentC) {
                    void recordConceptProgress(uid, tid, tName, cName, currentC.conceptName, false);
                }

                if (parsed.boardLines && parsed.boardLines.length > 0) {
                    streamBoardLines(parsed.boardLines.slice(0, MAX_BOARD_LINES));
                }

                if (parsed.diagramSvg) {
                    const sanitized = sanitizeSvg(parsed.diagramSvg);
                    if (sanitized) {
                        setActiveDiagramSvg(sanitized);
                        setActiveTableMarkdown(null);
                        setDiagramKey(k => k + 1);
                    }
                }

                if (parsed.positiveReplyLabel && parsed.positiveReplyText) {
                    setPositiveAction({ label: parsed.positiveReplyLabel, text: parsed.positiveReplyText });
                } else {
                    setPositiveAction({ label: "Understood! Continue →", text: "That makes sense, let's continue" });
                }

                if (parsed.negativeReplyLabel && parsed.negativeReplyText) {
                    setNegativeAction({ label: parsed.negativeReplyLabel, text: parsed.negativeReplyText });
                } else {
                    setNegativeAction({ label: "Explain more ↺", text: "Could you explain that part a bit more?" });
                }

                dialogueHistoryRef.current.push({
                    role: 'tutor',
                    text: parsed.spokenExplanation,
                    boardSummary: parsed.boardLines?.join(' | '),
                });

                await speakText(parsed.spokenExplanation);
                return;
            }

            if (currentC) {
                void recordConceptProgress(uid, tid, tName, cName, currentC.conceptName, true);
            }

            const next = nextSubStep(conceptIdxRef.current, subStepRef.current, blueprint);
            const newConceptIdx = next.conceptIdx;
            const newSubStep = next.subStep;

            if (next.done) {
                setIsDone(true);
                setVisibleBoardLines(['🎓 Topic Complete!', blueprint.overallSummary]);
                setActiveDiagramSvg(null);
                setActiveTableMarkdown(null);
                setActiveVisualCaption(null);

                void recordSessionCompletion(uid, tid, tName, cName, blueprint.overallSummary, currentC?.commonPitfalls || []);
                void saveLocalVoiceTutorialProgress(uid, cid, tid, newConceptIdx, newSubStep, true, blueprint);

                void speakText(`Outstanding! ${blueprint.overallSummary} You have successfully completed this entire topic!`);
                return;
            }

            void saveLocalVoiceTutorialProgress(uid, cid, tid, newConceptIdx, newSubStep, false, blueprint);

            conceptIdxRef.current = newConceptIdx;
            subStepRef.current    = newSubStep;
            setConceptIdx(newConceptIdx);
            setSubStep(newSubStep);

            await presentUnit(blueprint, newConceptIdx, newSubStep);

        } catch (err) {
            console.warn('[HandleStudentReply] conversational error, falling back:', err);
            setIsLoadingUnit(false);

            const wantsRepeat = /again|repeat|explain|didn.t|don.t|slow|what|why|how|no|clarif/i.test(userText);
            if (wantsRepeat) {
                const fallbackActs = getDefaultActions(subStepRef.current);
                setPositiveAction(fallbackActs.positive);
                setNegativeAction(fallbackActs.negative);
                if (currentC) {
                    streamBoardLines(getBoardLines(currentC, subStepRef.current));
                    await speakText(getSpokenText(currentC, subStepRef.current));
                }
                return;
            }

            const next = nextSubStep(conceptIdxRef.current, subStepRef.current, blueprint);
            if (next.done) {
                setIsDone(true);
                setVisibleBoardLines(['🎓 Topic Complete!', blueprint.overallSummary]);
                void speakText(`Well done! ${blueprint.overallSummary}`);
                return;
            }

            conceptIdxRef.current = next.conceptIdx;
            subStepRef.current    = next.subStep;
            setConceptIdx(next.conceptIdx);
            setSubStep(next.subStep);
            await presentUnit(blueprint, next.conceptIdx, next.subStep);
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
        setSubStep('intuition_hook');
        conceptIdxRef.current = 0;
        subStepRef.current = 'intuition_hook';
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
            await saveLocalVoiceTutorialProgress(uid, cid, tid, 0, 'intuition_hook', false, bp);
        }

        if (!isActiveRef.current) return;
        setBlueprint(bp);
        const defaultActs = getDefaultActions('intuition_hook');
        positiveActionRef.current = defaultActs.positive;
        setPositiveAction(defaultActs.positive);
        setNegativeAction(defaultActs.negative);

        await presentUnit(bp, 0, 'intuition_hook', studentMem, true);
    }, [nextTopic, sessionData, handleGoBack, userProfile, generateBlueprint, presentUnit]);

    const currentConcept  = blueprint?.concepts[conceptIdx];
    const totalConcepts   = blueprint?.concepts.length ?? 0;
    const progressPercent = totalConcepts > 0
        ? Math.round(((conceptIdx * SUB_STEP_ORDER.length + SUB_STEP_ORDER.indexOf(subStep)) /
            (totalConcepts * SUB_STEP_ORDER.length)) * 100)
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
                                Dynamic AI Blackboard
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
                        <h3 className="text-lg font-bold text-[#2C241D]">Preparing Your Interactive Lesson</h3>
                        <p className="text-sm text-[#7A6B5C] mt-1">{sessionData?.topic?.topic_name}</p>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-[#C2B2A3] border-t-[#8B5A2B] rounded-full animate-spin" />
                        <p className="text-sm font-medium text-[#5A4D3E] animate-pulse">{blueprintGenStep}</p>
                    </div>
                    <p className="text-xs text-[#A09080] max-w-xs">
                        AVELUT is designing a personalized, bit-by-bit lesson blueprint with diagrams, math formulas, and worked examples. Saved to SQLite for instant local resume.
                    </p>
                </div>
            )}

            {/* ── Completion screen ─────────────────────────────────────── */}
            {isDone && !isGeneratingBlueprint && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center pb-24 md:pb-6 max-w-xl mx-auto animate-fade-in">
                    <div className="text-5xl">🎓</div>
                    <div>
                        <h3 className="text-2xl font-bold text-[#2C241D]">Topic Complete!</h3>
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
                            <span className="font-bold text-[#8B5A2B] px-2 py-0.5 rounded-lg bg-[#EFE5D8] border border-[#DFD1C0] shrink-0 ml-2 truncate max-w-[200px]">
                                Concept {conceptIdx + 1}/{totalConcepts} · {SUB_STEP_LABEL[subStep]}
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
                                    {SUB_STEP_LABEL[subStep]}
                                </span>
                            </div>

                            {/* ── Blackboard Content Area ── */}
                            {visibleBoardLines.length > 0 && (
                                <div className={`flex-1 w-full ${hasVisualElement ? 'grid grid-cols-1 lg:grid-cols-12 gap-4 items-start' : 'space-y-3'}`}>

                                    <div className={`${hasVisualElement ? 'lg:col-span-6 space-y-3' : 'space-y-3.5'}`}>
                                        {visibleBoardLines.map((line, idx) => {
                                            const isVarLine       = line.includes('→');
                                            const isBlockFormula  = line.trim().startsWith('$$');
                                            const stepMatch       = line.match(/^\*\*(.*?)\*\*\s*:\s*(.*)$/);
                                            const isLatestActive  = idx === visibleBoardLines.length - 1 && isStreaming;

                                            return (
                                                <div
                                                    key={`${idx}-${line.slice(0, 15)}`}
                                                    className={`flex items-start gap-2.5 transition-all duration-700 ease-out animate-fade-in ${
                                                        isLatestActive ? 'border-l-2 border-amber-400/80 pl-2 bg-amber-400/5 rounded-r-xl' : ''
                                                    }`}
                                                >
                                                    {!isVarLine && !isBlockFormula && !stepMatch && (
                                                        <span className={`mt-2.5 w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0 ${isLatestActive ? 'animate-ping' : 'opacity-80'}`} />
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
                                                        </div>
                                                    ) : (
                                                        <div className="font-handwriting text-base sm:text-lg text-white leading-relaxed tracking-wide w-full">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                                rehypePlugins={[rehypeKatex]}
                                                                components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                            >{formatLatexMath(line)}</ReactMarkdown>
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
