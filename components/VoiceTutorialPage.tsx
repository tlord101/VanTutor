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

// ── Constants ────────────────────────────────────────────────────────────────
const TUTOR_VOICE = 'Charon';
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
interface VoiceTutorialSessionData {
    course: Course;
    topic?: Topic | null;
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

interface VoiceTutorialPageProps {
    userProfile?:  UserProfile | null;
    appSettings?:  any;
    onNavigate?:   (tab: string) => void;
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

// ── Visual Diagram Helpers ────────────────────────────────────────────────────
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

    return cleaned;
}

function getFallbackVisual(concept: BlueprintConcept, step: SubStep): { diagramSvg: string | null; tableMarkdown: string | null; caption?: string } {
    const textContext = `${concept.conceptName} ${concept.keyDefinition} ${concept.formula || ''}`.toLowerCase();

    if (step === 'formula_table') {
        if (concept.progressionTable && concept.progressionTable.includes('|')) {
            return { diagramSvg: null, tableMarkdown: concept.progressionTable, caption: 'State Progression Table' };
        }
        if (concept.variables && concept.variables.length > 0) {
            const rows = concept.variables.map(v => `| \`${v.symbol}\` | ${v.meaning} | $${v.unit || '\\text{unit}'}$ |`).join('\n');
            const tableMarkdown = `| Symbol | Quantity / Meaning | SI Unit |\n| :--- | :--- | :--- |\n${rows}`;
            return { diagramSvg: null, tableMarkdown, caption: `${concept.conceptName} — Variables Breakdown` };
        }
    }

    if (step === 'distinctions_pitfalls') {
        if (textContext.includes('distance') || textContext.includes('displacement')) {
            const tableMarkdown = `| Property | Distance | Displacement |
| :--- | :--- | :--- |
| **Type** | Scalar (Magnitude only) | Vector (Magnitude + Direction) |
| **Sign** | **Always positive ($+$)** | **Can be $(+)$, $(-)$, or $0$** |
| **Meaning** | Total ground covered | Net straight-line change |`;
            return { diagramSvg: null, tableMarkdown, caption: 'Key Distinction: Distance vs. Displacement' };
        }
        if (textContext.includes('speed') || textContext.includes('velocity')) {
            const tableMarkdown = `| Property | Speed | Velocity |
| :--- | :--- | :--- |
| **Type** | Scalar | Vector |
| **Formula** | $\\text{Distance} / \\text{Time}$ | $\\text{Displacement} / \\text{Time}$ |
| **Direction** | Direction does not matter | **Direction is essential** |`;
            return { diagramSvg: null, tableMarkdown, caption: 'Key Distinction: Speed vs. Velocity' };
        }
    }

    // ── 1. Car on Road (Kinematics, Speed, Velocity, Acceleration, Motion) ──
    if (textContext.includes('car') || textContext.includes('vehicle') || textContext.includes('speed') || textContext.includes('velocity') || textContext.includes('accel') || textContext.includes('motion') || textContext.includes('kinematic')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#D9CCBC" /></marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#63B3ED" /></marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FC8181" /></marker>
  </defs>
  <!-- Road surface & dashed centerline -->
  <rect x="10" y="160" width="400" height="40" rx="4" fill="#2D333B" stroke="#444C56" stroke-width="2" />
  <line x1="25" y1="180" x2="75" y2="180" stroke="#F6E05E" stroke-width="3" stroke-dasharray="16 12" />
  <line x1="105" y1="180" x2="165" y2="180" stroke="#F6E05E" stroke-width="3" stroke-dasharray="16 12" />
  <line x1="195" y1="180" x2="255" y2="180" stroke="#F6E05E" stroke-width="3" stroke-dasharray="16 12" />
  <line x1="285" y1="180" x2="345" y2="180" stroke="#F6E05E" stroke-width="3" stroke-dasharray="16 12" />
  <line x1="375" y1="180" x2="405" y2="180" stroke="#F6E05E" stroke-width="3" stroke-dasharray="16 12" />

  <!-- Motion wind streaks -->
  <line x1="30" y1="110" x2="70" y2="110" stroke="#768390" stroke-width="2" stroke-linecap="round" />
  <line x1="20" y1="125" x2="80" y2="125" stroke="#768390" stroke-width="2" stroke-linecap="round" />

  <!-- Car Body Chassis -->
  <path d="M 90 148 L 105 115 Q 120 95 155 95 L 225 95 Q 245 95 260 115 L 295 125 L 305 148 Q 305 152 298 152 L 95 152 Q 90 152 90 148 Z" fill="#E6BAA3" stroke="#FFF" stroke-width="2.5" />
  <!-- Car Roof & Windows -->
  <path d="M 145 102 L 190 102 L 190 125 L 125 125 Q 135 110 145 102 Z" fill="#22272E" stroke="#FFF" stroke-width="1.8" />
  <path d="M 200 102 L 230 102 Q 242 110 250 125 L 200 125 Z" fill="#22272E" stroke="#FFF" stroke-width="1.8" />
  <!-- Headlight -->
  <polygon points="298,135 305,137 305,145 295,145" fill="#F6E05E" stroke="#FFF" stroke-width="1.5" />
  <!-- Wheels -->
  <circle cx="140" cy="155" r="18" fill="#1C2128" stroke="#FFF" stroke-width="2" />
  <circle cx="140" cy="155" r="7" fill="#ADBAC7" />
  <circle cx="260" cy="155" r="18" fill="#1C2128" stroke="#FFF" stroke-width="2" />
  <circle cx="260" cy="155" r="7" fill="#ADBAC7" />

  <!-- Velocity Vector -->
  <line x1="200" y1="55" x2="340" y2="55" stroke="#63B3ED" stroke-width="3" marker-end="url(#arrow-blue)" />
  <text x="270" y="45" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="13" fill="#63B3ED">Velocity v = 20 m/s</text>
  <!-- Acceleration Vector -->
  <line x1="200" y1="78" x2="290" y2="78" stroke="#FC8181" stroke-width="2.8" marker-end="url(#arrow-red)" />
  <text x="245" y="72" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="11" fill="#FC8181">Acceleration a = 3 m/s²</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Moving Car with Velocity & Acceleration Vectors' };
    }

    // ── 2. Ruler Against Table / Wall (Trig, Angles, Static Equilibrium, Pythagoras) ──
    if (textContext.includes('ruler') || textContext.includes('table') || textContext.includes('ladder') || textContext.includes('angle') || textContext.includes('wall') || textContext.includes('triangle') || textContext.includes('pythagor') || textContext.includes('incline')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#63B3ED" /></marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FC8181" /></marker>
  </defs>
  <!-- Floor line -->
  <line x1="20" y1="180" x2="400" y2="180" stroke="#ADBAC7" stroke-width="3" />

  <!-- Wooden Table (Top & 2 Legs) -->
  <rect x="230" y="70" width="160" height="18" rx="3" fill="#DDB892" stroke="#FFF" stroke-width="2" />
  <rect x="250" y="88" width="16" height="92" fill="#C9A680" stroke="#FFF" stroke-width="1.8" />
  <rect x="360" y="88" width="16" height="92" fill="#C9A680" stroke="#FFF" stroke-width="1.8" />
  <text x="310" y="60" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="12" fill="#FFF">Table Top (Height h)</text>

  <!-- Yellow Wooden Ruler leaning from floor (x=70, y=180) to table edge (x=230, y=70) -->
  <g transform="translate(70, 180) rotate(-34.5)">
    <rect x="0" y="-8" width="195" height="16" rx="2" fill="#FEF08A" stroke="#854D0E" stroke-width="2" />
    <line x1="20" y1="-8" x2="20" y2="-1" stroke="#854D0E" stroke-width="1.5" />
    <line x1="40" y1="-8" x2="40" y2="2" stroke="#854D0E" stroke-width="2" />
    <line x1="60" y1="-8" x2="60" y2="-1" stroke="#854D0E" stroke-width="1.5" />
    <line x1="80" y1="-8" x2="80" y2="2" stroke="#854D0E" stroke-width="2" />
    <line x1="100" y1="-8" x2="100" y2="-1" stroke="#854D0E" stroke-width="1.5" />
    <line x1="120" y1="-8" x2="120" y2="2" stroke="#854D0E" stroke-width="2" />
    <line x1="140" y1="-8" x2="140" y2="-1" stroke="#854D0E" stroke-width="1.5" />
    <line x1="160" y1="-8" x2="160" y2="2" stroke="#854D0E" stroke-width="2" />
    <line x1="180" y1="-8" x2="180" y2="-1" stroke="#854D0E" stroke-width="1.5" />
    <text x="95" y="6" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="10" fill="#854D0E">Ruler (L = 1.0 m)</text>
  </g>

  <!-- Angle arc θ at base -->
  <path d="M 115 180 A 45 45 0 0 0 105 155" fill="none" stroke="#63B3ED" stroke-width="2" />
  <text x="128" y="168" font-family="system-ui" font-weight="bold" font-size="13" fill="#63B3ED">θ = 34.5°</text>

  <!-- Height dimension line -->
  <line x1="220" y1="70" x2="220" y2="180" stroke="#FC8181" stroke-width="1.5" stroke-dasharray="4 3" />
  <text x="200" y="130" text-anchor="end" font-family="system-ui" font-weight="bold" font-size="12" fill="#FC8181">h = 0.57 m</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Ruler Leaning Against a Table with Angle and Height' };
    }

    // ── 3. Ball / Projectile Launched from Cliff ──
    if (textContext.includes('cliff') || textContext.includes('drop') || textContext.includes('projectile') || textContext.includes('gravity') || textContext.includes('fall') || textContext.includes('height') || textContext.includes('ball')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#63B3ED" /></marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FC8181" /></marker>
  </defs>
  <!-- Stone Cliff -->
  <path d="M 10 190 L 140 190 L 140 70 L 10 70 Z" fill="#2D333B" stroke="#ADBAC7" stroke-width="2.5" />
  <text x="75" y="135" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="13" fill="#FFF">Cliff (Height h)</text>

  <!-- Water / Ground below -->
  <line x1="140" y1="190" x2="410" y2="190" stroke="#3182CE" stroke-width="3" />

  <!-- Ball on cliff edge -->
  <circle cx="140" cy="60" r="10" fill="#E53E3E" stroke="#FFF" stroke-width="2" />
  <!-- Horizontal velocity arrow -->
  <line x1="150" y1="60" x2="230" y2="60" stroke="#63B3ED" stroke-width="3" marker-end="url(#arrow-blue)" />
  <text x="190" y="48" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="12" fill="#63B3ED">v_x = 15 m/s</text>

  <!-- Parabolic trajectory path -->
  <path d="M 140 60 Q 230 65 330 188" fill="none" stroke="#FC8181" stroke-width="2.5" stroke-dasharray="6 4" />
  <circle cx="330" cy="188" r="10" fill="#E53E3E" stroke="#FFF" stroke-width="2" />
  <line x1="250" y1="90" x2="250" y2="140" stroke="#FC8181" stroke-width="2.5" marker-end="url(#arrow-red)" />
  <text x="260" y="120" font-family="system-ui" font-weight="bold" font-size="11" fill="#FC8181">g = 9.8 m/s²</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Ball Launched Horizontally Off a Cliff (Projectile Motion)' };
    }

    // ── 4. Pulley & Suspended Masses (Atwood Machine, Tension, Dynamics) ──
    if (textContext.includes('pulley') || textContext.includes('tension') || textContext.includes('string') || textContext.includes('rope') || textContext.includes('hanging')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FC8181" /></marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#68D391" /></marker>
  </defs>
  <line x1="140" y1="20" x2="280" y2="20" stroke="#ADBAC7" stroke-width="3" />
  <line x1="210" y1="20" x2="210" y2="50" stroke="#ADBAC7" stroke-width="3" />

  <!-- Pulley wheel -->
  <circle cx="210" cy="65" r="22" fill="#2D333B" stroke="#FFF" stroke-width="2.5" />
  <circle cx="210" cy="65" r="6" fill="#FFF" />

  <!-- Rope over pulley -->
  <line x1="188" y1="65" x2="188" y2="130" stroke="#F6AD55" stroke-width="2.5" />
  <line x1="232" y1="65" x2="232" y2="155" stroke="#F6AD55" stroke-width="2.5" />

  <!-- Mass A (Left, lighter) -->
  <rect x="168" y="130" width="40" height="35" rx="4" fill="#22272E" stroke="#FFF" stroke-width="2" />
  <text x="188" y="152" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="12" fill="#FFF">m₁</text>

  <!-- Mass B (Right, heavier) -->
  <rect x="212" y="155" width="40" height="45" rx="4" fill="#E6BAA3" stroke="#FFF" stroke-width="2" />
  <text x="232" y="182" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="12" fill="#22272E">m₂</text>

  <!-- Tension T & Gravity arrows -->
  <line x1="150" y1="125" x2="150" y2="95" stroke="#68D391" stroke-width="2" marker-end="url(#arrow-green)" />
  <text x="142" y="112" text-anchor="end" font-family="system-ui" font-weight="bold" font-size="11" fill="#68D391">T</text>
  <line x1="270" y1="175" x2="270" y2="205" stroke="#FC8181" stroke-width="2" marker-end="url(#arrow-red)" />
  <text x="278" y="195" font-family="system-ui" font-weight="bold" font-size="11" fill="#FC8181">m₂g</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Pulley with Hanging Masses (Tension & Gravity)' };
    }

    // ── 5. Standard Dynamics & Free-Body Force Diagram ──
    if (textContext.includes('force') || textContext.includes('newton') || textContext.includes('mass')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#63B3ED" /></marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#FC8181" /></marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#68D391" /></marker>
  </defs>
  <line x1="30" y1="160" x2="390" y2="160" stroke="#ADBAC7" stroke-width="2.5" />
  <rect x="150" y="100" width="120" height="60" rx="8" fill="#22272E" stroke="#FFF" stroke-width="2.5" />
  <text x="210" y="136" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="14" fill="#FFF">Mass m</text>
  <line x1="270" y1="130" x2="360" y2="130" stroke="#FC8181" stroke-width="3" marker-end="url(#arrow-red)" />
  <text x="315" y="120" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="12" fill="#FC8181">F_net</text>
  <line x1="210" y1="100" x2="210" y2="30" stroke="#68D391" stroke-width="2.5" marker-end="url(#arrow-green)" />
  <text x="210" y="22" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="12" fill="#68D391">Normal Force F_N</text>
  <line x1="210" y1="160" x2="210" y2="210" stroke="#FC8181" stroke-width="2.5" marker-end="url(#arrow-red)" />
  <text x="210" y="218" text-anchor="middle" font-family="system-ui" font-weight="bold" font-size="12" fill="#FC8181">Gravity W = mg</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Free-Body Force Diagram' };
    }

    return { diagramSvg: null, tableMarkdown: null };
}

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
            const ex = concept.example;
            const lines = [
                `**Problem**: ${ex.problem}`,
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
            const s1 = concept.example.step1;
            return [
                `**Step 1 — Principle & Formula**: ${s1?.explanation || 'Relate given values to target unknown.'}`,
                s1?.mathExpression ? `$$${s1.mathExpression}$$` : (s1?.formula ? `$$${s1.formula}$$` : `$$v_f = v_i + at$$`),
            ];
        }
        case 'example_step2': {
            const s2 = concept.example.step2;
            return [
                `**Step 2 — Calculation**: ${s2?.explanation || 'Substitute known numerical values.'}`,
                s2?.mathExpression ? `$$${s2.mathExpression}$$` : `$$v_f = 0 + (2\\text{ m/s}^2)(5\\text{ s}) = 10\\text{ m/s}$$`,
            ];
        }
        case 'example_step3': {
            const ex = concept.example;
            return [
                `**Step 3 — Final Result**: $$${ex.answer}$$`,
                `**Unit & Physical Check**: ${ex.physicalTakeaway || 'Dimensionally consistent with physical meaning.'}`,
            ];
        }
        case 'concept_recap':
            return [
                `**Golden Rule**: ${concept.goldenRule}`,
                concept.formula ? `$$${concept.formula}$$` : '',
                `**Key Takeaway**: ${concept.summaryPoints?.[0] || 'Concept mastered.'}`,
            ].filter(Boolean);
        default:
            return [`${concept.conceptName}`];
    }
}

function getSpokenText(concept: BlueprintConcept, step: SubStep): string {
    const name = concept.conceptName;
    switch (step) {
        case 'intuition_hook':
            return `Let us start with ${name}. Think about this question: ${concept.relatableQuestion} Picture ${concept.realWorldScenario || 'a real world situation'}. What comes to mind?`;
        case 'physical_meaning':
            return `Here is what ${name} means physically. ${concept.physicalMeaning || concept.keyDefinition}. Notice how it connects to our everyday experience. Does this definition feel clear?`;
        case 'formula_table':
            return `Look at the board. Here is how we quantify ${name}. Notice how the numbers progress step by step in our table, and how the equation gives us the mathematical shortcut. How do these variables relate to one another?`;
        case 'distinctions_pitfalls':
            return `Before we solve an example, let us look at the most common trap students fall into. ${concept.keyDistinction || 'Pay close attention to the difference between these quantities.'} Remember our golden rule: ${concept.goldenRule}. Does this make sense?`;
        case 'example_problem':
            return `Let us work through an example step by step. Here is our problem on the board: ${concept.example.problem}. We have identified our given values and what we are looking for. Are you ready to see Step 1?`;
        case 'example_step1':
            return `Step 1: First, we identify our governing principle and formula. ${concept.example.step1?.explanation || 'We choose the equation that relates our knowns to our unknown.'} Take a look at the board. Does this formula choice make sense?`;
        case 'example_step2':
            return `Step 2: Now we substitute our given values into the formula and calculate. ${concept.example.step2?.explanation || 'Substituting the numbers step by step gives us our result.'} Look at the calculation on the board. Did you follow each calculation step?`;
        case 'example_step3':
            return `Step 3: Here is our final answer: ${concept.example.answer}. Notice that the units check out and the physical meaning matches our intuition. ${concept.example.physicalTakeaway || ''} How do you feel about this solution?`;
        case 'concept_recap':
            return `Excellent work! You have mastered ${name}. Remember: ${concept.goldenRule}. Are you ready to proceed to the next concept?`;
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
}) => {
    const { settings: hookAppSettings } = useAppSettings();
    const appSettings = propAppSettings || hookAppSettings;
    const { addToast } = useToast();

    // ── Session & State ──────────────────────────────────────────────────
    const [sessionData, setSessionData] = useState<VoiceTutorialSessionData | null>(null);
    const [blueprint, setBlueprint] = useState<LessonBlueprint | null>(null);
    const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);
    const [blueprintGenStep, setBlueprintGenStep] = useState('');

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
    const [speechRate, setSpeechRate] = useState(1.0);
    const [textInput, setTextInput] = useState('');
    const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string } | null>(null);
    const [isNavigatingBack, setIsNavigatingBack] = useState(false);
    const [micDisplay, setMicDisplay] = useState('');

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
                }
            };
            rec.onerror = () => { if (isActiveRef.current) setIsMicListening(false); };
            recognitionRef.current = rec;
            rec.start();
        } catch (_) { setIsMicListening(false); }
    }, [addToast, attachedImage]);

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

        const usePersonal = !!(userProfile?.use_personal_token && userProfile?.personal_api_key?.trim());
        const apiKey = usePersonal
            ? userProfile!.personal_api_key!.trim()
            : (appSettings?.gemini_api_key?.trim() || '');

        if (!apiKey) {
            console.warn('[Gemini TTS] No API key available for natural voice generation');
            setIsTtsLoading(false);
            onEnd?.();
            startMicListening();
            return;
        }

        try {
            const tts = new GoogleGenAI({ apiKey });
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') await ctx.resume();

            // Split into concise natural speech chunks (max ~200 chars per sentence) for smooth streaming
            const rawSentences = cleanedText.match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|$)/g) || [cleanedText];
            const sentences: string[] = [];
            for (const s of rawSentences) {
                const t = s.trim();
                if (t) sentences.push(t);
            }

            if (sentences.length === 0) {
                setIsTtsLoading(false);
                onEnd?.();
                startMicListening();
                return;
            }

            const bufferPromiseMap = new Map<number, Promise<AudioBuffer | null>>();

            const fetchSentenceAudio = (index: number): Promise<AudioBuffer | null> => {
                if (bufferPromiseMap.has(index)) return bufferPromiseMap.get(index)!;
                const promise = (async (): Promise<AudioBuffer | null> => {
                    if (index >= sentences.length) return null;
                    const sentenceText = sentences[index];
                    try {
                        const res = await tts.models.generateContent({
                            model: 'gemini-2.5-flash-preview-tts',
                            contents: [{ role: 'user', parts: [{ text: sentenceText }] }],
                            config: {
                                responseModalities: ['AUDIO'] as any,
                                speechConfig: {
                                    voiceConfig: { prebuiltVoiceConfig: { voiceName: TUTOR_VOICE } }
                                },
                            },
                        });

                        if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return null;
                        const inlineData = res?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
                        if (!inlineData?.data) return null;
                        return await pcm16ToAudioBuffer(inlineData.data, ctx);
                    } catch (e) {
                        console.warn(`[Gemini TTS] Sentence ${index} fetch error:`, e);
                        return null;
                    }
                })();
                bufferPromiseMap.set(index, promise);
                return promise;
            };

            // Pre-fetch first 2 sentences immediately
            void fetchSentenceAudio(0);
            if (sentences.length > 1) void fetchSentenceAudio(1);

            let currentIndex = 0;

            const playNextSentence = async () => {
                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;

                if (currentIndex >= sentences.length) {
                    if (isActiveRef.current && playSessionIdRef.current === sessionId) {
                        setIsSpeaking(false);
                        setIsPaused(false);
                        setIsTtsLoading(false);
                        currentAudioRef.current = null;
                        onEnd?.();
                        startMicListening();
                    }
                    return;
                }

                const sentenceIdx = currentIndex;
                if (sentenceIdx + 1 < sentences.length) void fetchSentenceAudio(sentenceIdx + 1);
                if (sentenceIdx + 2 < sentences.length) void fetchSentenceAudio(sentenceIdx + 2);

                const buffer = await fetchSentenceAudio(sentenceIdx);

                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;

                if (!buffer) {
                    currentIndex++;
                    void playNextSentence();
                    return;
                }

                setIsTtsLoading(false);
                setIsSpeaking(true);
                setIsPaused(false);

                const src = ctx.createBufferSource();
                src.buffer = buffer;
                src.playbackRate.value = speechRate;
                src.connect(ctx.destination);
                currentAudioRef.current = src;

                src.onended = () => {
                    if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
                    currentIndex++;
                    void playNextSentence();
                };

                src.start(0);
            };

            void playNextSentence();

        } catch (err) {
            console.warn('[Gemini TTS] Voice generation error:', err);
            if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
            setIsTtsLoading(false);
            setIsSpeaking(false);
            onEnd?.();
            startMicListening();
        }
    }, [isMuted, speechRate, userProfile, appSettings, getAudioCtx, pcm16ToAudioBuffer, startMicListening]);

    // ── Board Line Streaming ─────────────────────────────────────────────────
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

    // ── Master Blueprint Generation (Bit-by-Bit, Multi-Board & Step-by-Step) ─
    const generateBlueprint = useCallback(async (session: VoiceTutorialSessionData, studentMem?: StudentCognitiveProfile | null): Promise<LessonBlueprint | null> => {
        setIsGeneratingBlueprint(true);
        setBlueprintGenStep('Analyzing topic & student cognitive history...');

        const aiClient = createAvelutAI(appSettings, userProfile || null);
        if (!aiClient) { setIsGeneratingBlueprint(false); return null; }

        const courseName = session.course.course_name;
        const topicName  = session.topic?.topic_name || 'Core Concepts';
        const level      = session.course.level || 'University';

        setBlueprintGenStep('Structuring deep multi-board lesson progression...');

        const memoryContext = studentMem?.lastTopicTaught
            ? `STUDENT HISTORY:
- Last Topic: "${studentMem.lastTopicTaught.topicName}"
- Known Masteries: ${studentMem.overallMasteries.slice(-4).join(', ') || 'Foundations'}
- Struggles: ${studentMem.overallWeakPoints.slice(-4).join(', ') || studentMem.lastTopicTaught.struggledKeyPoints.join(', ') || 'Unit consistency'}
- Pedagogy: Intuition first, state progression tables before formulas, and 1-step-per-board problem solving.`
            : `STUDENT: New session. Maintain crystal-clear intuitive pacing.`;

        const prompt = `You are AVELUT Master STEM Curriculum Architect.
Design a thorough, bit-by-bit lesson blueprint for:
Course: "${courseName}"
Topic: "${topicName}"
Level: ${level}
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

    // ── Session Bootstrap & SQLite Restore ────────────────────────────────────
    const bootstrapSession = useCallback(async () => {
        if (!sessionData) return;

        const uid = userProfile?.uid || 'anon';
        const cid = sessionData.course?.course_id || 'general';
        const tid = sessionData.topic?.topic_id || 'core';

        const studentMem = await getStudentCognitiveProfile(uid);
        const sqliteRecord = await getLocalVoiceTutorialProgress(uid, cid, tid);
        let bp: LessonBlueprint | null = sqliteRecord?.blueprint || null;

        if (!bp) {
            bp = await generateBlueprint(sessionData, studentMem);
            if (!bp || !isActiveRef.current) return;
            await saveLocalVoiceTutorialProgress(uid, cid, tid, 0, 'intuition_hook', false, bp);
        }

        if (!isActiveRef.current) return;
        setBlueprint(bp);

        let startConceptIdx = sqliteRecord?.conceptIdx ?? 0;
        let startSubStep: SubStep = (sqliteRecord?.subStep as SubStep) || 'intuition_hook';

        if (startConceptIdx >= bp.concepts.length) {
            startConceptIdx = 0;
            startSubStep = 'intuition_hook';
        }

        conceptIdxRef.current = startConceptIdx;
        subStepRef.current    = startSubStep;
        setConceptIdx(startConceptIdx);
        setSubStep(startSubStep);

        const defaultActs = getDefaultActions(startSubStep);
        setPositiveAction(defaultActs.positive);
        setNegativeAction(defaultActs.negative);

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
Problem: ${concept.example.problem}
- spokenExplanation: (4-5 sentences). Read the problem statement clearly. Guide the student to identify each given quantity from the text, note the units, and pinpoint exactly what we need to solve for.
- boardLines[0]: "**Problem**: ${concept.example.problem}"
- boardLines[1]: "**Given**: ${concept.example.givens ? concept.example.givens.map(g => `$${g.symbol} = ${g.value}$ $${g.unit || ''}$`).join(', ') : 'Known variables'}"
- boardLines[2]: "**Find**: ${concept.example.find || 'Target quantity'}"
- diagramSvg: Clean SVG setup of the problem scenario with labeled arrows.
- positiveReplyLabel: "Givens clear, start Step 1 →"
- negativeReplyLabel: "Re-read question slowly ↺"`,

            example_step1: `Board 6: WORKED EXAMPLE — STEP 1: PRINCIPLE & FORMULA SELECTION for "${concept.conceptName}".
Step 1: ${concept.example.step1?.title || 'Identify Principle & Formula'}
Formula: ${concept.example.step1?.mathExpression || concept.formula}
- spokenExplanation: (4-5 sentences). Explain WHY we choose this specific formula based on our known variables and the target variable. Show that math is a logical choice, not guesswork.
- boardLines[0]: "**Step 1 — Principle & Formula**: ${concept.example.step1?.explanation || 'Relate given values to target variable.'}"
- boardLines[1]: "$$${concept.example.step1?.mathExpression || 'v_f = v_i + at'}$$"
- positiveReplyLabel: "Formula chosen, do calculation →"
- negativeReplyLabel: "Why this formula? ↺"`,

            example_step2: `Board 7: WORKED EXAMPLE — STEP 2: SUBSTITUTION & CALCULATION for "${concept.conceptName}".
Step 2: ${concept.example.step2?.title || 'Substitute Values & Calculate'}
Calculation: ${concept.example.step2?.mathExpression || 'Numerical substitution'}
- spokenExplanation: (4-5 sentences). Walk through the numerical substitution step by step. Show the intermediate math clearly. Emphasize tracking units along the way.
- boardLines[0]: "**Step 2 — Calculation**: ${concept.example.step2?.explanation || 'Substitute known numerical values into the equation.'}"
- boardLines[1]: "$$${concept.example.step2?.mathExpression || 'v_f = 0 + (2)(5) = 10'}$$"
- positiveReplyLabel: "Calculation followed, see answer →"
- negativeReplyLabel: "Redo calculation step slowly ↺"`,

            example_step3: `Board 8: WORKED EXAMPLE — STEP 3: FINAL RESULT & UNIT CHECK for "${concept.conceptName}".
Final Answer: ${concept.example.answer}
Physical Takeaway: ${concept.example.physicalTakeaway}
- spokenExplanation: (4-5 sentences). Present the final result. Verify that the units match the required quantity. Explain what the final number represents in the physical scenario.
- boardLines[0]: "**Final Answer**: $$${concept.example.answer}$$"
- boardLines[1]: "**Unit & Physical Check**: ${concept.example.physicalTakeaway || 'Dimensionally consistent with physical meaning.'}"
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
- USE THE SIMPLEST WORDS POSSIBLE: Explain in plain, crystal-clear everyday English without dense jargon.
- ALWAYS USE REAL-WORLD PHYSICAL OBJECT ANALOGIES: Describe and define concepts using concrete physical objects (e.g., a room with open/closed doors and windows for systems, cups of tea with/without lids, shopping carts for mass/momentum, cars for motion, water pipes for circuits).
- SLOW DOWN and teach bit-by-bit across multiple boards. Speak 4-5 natural sentences per board.
- Speak in warm, conversational, encouraging classroom teacher English.
- Use the board to draw diagrams, state progression tables, and clean LaTeX KaTeX formulas ($...$, $$...$$).
- Always refer to what is on the board.
- Blackboard Cleanliness: Do NOT write meta-jargon like "Intuition stuff" or "Board 1: Intuition". Write direct, educational statements and equations on the board lines. The topic header is already fixed at the top of the blackboard.
- LaTeX KaTeX Typography (CRITICAL): Always format all formulas, powers, superscripts, subscripts, fractions, and units in valid LaTeX math delimiters ($...$ or $$...$$). E.g. $x^2$, $\\text{m/s}^2$, $10^5$, $v_f = v_i + at$, $\\sqrt{2gh}$, $F_{\\text{net}}$, $v_i$.

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

        try {
            const aiClient = createAvelutAI(appSettings, userProfile || null);
            if (!aiClient || !isActiveRef.current) {
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
                config: { responseMimeType: 'application/json', temperature: 0.4 },
            });

            if (!isActiveRef.current) return;

            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty unit response');

            const parsed: UnitPresentationResponse =
                JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());

            setIsLoadingUnit(false);
            streamBoardLines(parsed.boardLines.slice(0, MAX_BOARD_LINES));

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
                setPositiveAction({ label: parsed.positiveReplyLabel, text: parsed.positiveReplyText });
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
                const fallback = getFallbackVisual(concept, sStep);
                setActiveDiagramSvg(fallback.diagramSvg);
                setActiveTableMarkdown(fallback.tableMarkdown);
                setActiveVisualCaption(fallback.caption || null);
                setDiagramKey(k => k + 1);
            }

            await speakText(parsed.spokenExplanation);

        } catch (err) {
            console.warn('[PresentUnit] fallback used:', err);
            if (!isActiveRef.current) return;
            setIsLoadingUnit(false);
            streamBoardLines(getBoardLines(concept, sStep));
            const fallback = getFallbackVisual(concept, sStep);
            setActiveDiagramSvg(fallback.diagramSvg);
            setActiveTableMarkdown(fallback.tableMarkdown);
            setActiveVisualCaption(fallback.caption || null);
            setDiagramKey(k => k + 1);
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
                model: appSettings?.primary_gemini_model || 'gemini-2.5-flash',
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

    const handleSpeedChange = () => {
        const speeds = [1.0, 1.15, 1.35];
        const next   = speeds[(speeds.indexOf(speechRate) + 1) % speeds.length];
        setSpeechRate(next);
        addToast(`Speed: ${next}x`, 'info');
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
        if (onNavigate) onNavigate('study_guide');
        else window.history.back();
    }, [blueprint, userProfile, onNavigate, sessionData]);

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
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FFFDFB] border border-[#D9CCBC] rounded-full text-[11px] font-semibold text-[#4A3E31] shadow-xs">
                        {isTtsLoading ? (
                            <span className="w-2 h-2 rounded-full bg-[#D4A373] animate-pulse shrink-0" />
                        ) : isPaused ? (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        ) : (
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isSpeaking ? 'bg-[#8B5A2B] animate-pulse' : 'bg-[#C2B2A3]'}`} />
                        )}
                        <span className="hidden sm:inline">
                            {isTtsLoading ? 'Generating Natural Voice...' : isPaused ? 'Paused' : isSpeaking ? 'Speaking' : 'Charon'}
                        </span>
                    </div>

                    <button
                        onClick={toggleMute}
                        className="p-1.5 sm:px-2 sm:py-1 rounded-xl border border-[#D9CCBC] bg-[#FFFDFB] hover:bg-[#EDE2D4] text-xs font-bold text-[#4A3E31] cursor-pointer shadow-xs transition-colors"
                    >
                        <i className={`bi ${isMuted ? 'bi-volume-mute-fill text-red-600' : 'bi-volume-up'} text-sm`}></i>
                    </button>

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
                        AVELUT is designing a personalized, bit-by-bit lesson blueprint with diagrams, math formulas, and worked examples. Saved to SQLite for instant local resume.
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
                <main className="flex-1 flex flex-col p-3 sm:p-5 max-w-5xl w-full mx-auto gap-2.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-[calc(140px+env(safe-area-inset-bottom,0px))] md:pb-4">

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
                    <div className="relative flex-1 min-h-[250px] sm:min-h-[310px] max-h-[calc(100vh-270px)] flex flex-col justify-start bg-[#181C20] border-2 border-[#2D333B] rounded-3xl p-4 sm:p-6 shadow-2xl overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-[#444C56]/60 [&::-webkit-scrollbar-thumb]:rounded-full text-white">

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

                                            return (
                                                <div key={`${idx}-${line.slice(0, 15)}`} className="flex items-start gap-2.5 animate-fade-in">
                                                    {!isVarLine && !isBlockFormula && !stepMatch && (
                                                        <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0 opacity-80" />
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
                                        <div className="lg:col-span-6 flex flex-col items-center justify-center p-2 rounded-2xl bg-[#22272E]/90 border border-[#373E47] shadow-md relative group animate-fade-in w-full">
                                            {activeDiagramSvg && (
                                                <div className="w-full flex flex-col items-center">
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
                    <div className="shrink-0 flex flex-col gap-2.5 bg-[#F4ECE2]/95 border border-[#E5DACD] rounded-3xl p-3 sm:p-4 shadow-md backdrop-blur-md w-full">

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
        </div>
    );
};

export default VoiceTutorialPage;
