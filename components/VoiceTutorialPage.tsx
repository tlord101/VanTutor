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
    conceptName:        string;
    relatableQuestion?: string;      // "When you hear the word distance, what do you think of?"
    keyDefinition:      string;
    realWorldAnalogy?:  string;      // Sports car vs. truck, ball dropped off sea cliff
    intuitionNote:      string;
    progressionTable?:  string;
    formula:            string | null;
    variables:          BlueprintVariable[];
    keyDistinction?:    string;
    goldenRule?:        string;
    example1:           BlueprintExample;
    example2:           BlueprintExample;
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

interface TutorialProgress { conceptIdx: number; subStep: SubStep; }

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
        case 'definition':
            return {
                positive: { label: "Yes, makes sense →", text: "I understand the definition, let's continue" },
                negative: { label: "Explain in simpler terms ↺", text: "Can you explain the definition in simpler terms?" },
            };
        case 'intuition':
            return {
                positive: { label: "Got the intuition, show formula →", text: "The intuition makes sense, show me the formula" },
                negative: { label: "Give another analogy ↺", text: "Can you give another real-world analogy?" },
            };
        case 'formula':
            return {
                positive: { label: "Formula understood, do example →", text: "I understand the formula and table, let's solve an example" },
                negative: { label: "Explain variables again ↺", text: "Can you explain the variables and units again?" },
            };
        case 'pitfalls':
            return {
                positive: { label: "Noted, I'll avoid this trap →", text: "Understood, I will watch out for that mistake" },
                negative: { label: "Why is this mistake common? ↺", text: "Why do students commonly make this mistake?" },
            };
        case 'example_1':
            return {
                positive: { label: "I followed each step, next challenge →", text: "I followed the working steps, show me the challenge variant" },
                negative: { label: "Redo calculation step slowly ↺", text: "Can you redo the calculation step slowly?" },
            };
        case 'example_2':
            return {
                positive: { label: "Understood, summarize topic →", text: "I understand this challenge solution, let's summarize" },
                negative: { label: "What if values changed? ↺", text: "What if the initial conditions were different?" },
            };
        case 'summary':
            return {
                positive: { label: "Ready for next concept! 🎓", text: "Ready for the next concept!" },
                negative: { label: "Recap key formula once more ↺", text: "Could you recap the main formula once more?" },
            };
        default:
            return { positive: { label: "Continue", text: "Continue" }, negative: { label: "Explain", text: "Explain" } };
    }
}

// ── Pure helpers & Visual Diagram Generators ─────────────────────────────────

/**
 * Sanitizes and normalizes an SVG string for rendering on the board.
 */
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

    // Ensure standard engineering arrow markers exist if referenced
    if (cleaned.includes('marker-end') && !cleaned.includes('<defs>')) {
        const defs = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8B4513" />
    </marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2B6CB0" />
    </marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#C53030" />
    </marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#276749" />
    </marker>
  </defs>`;
        cleaned = cleaned.replace(/<svg([^>]*)>/i, `<svg$1>${defs}`);
    }

    return cleaned;
}

/**
 * Generate procedural fallback diagrams and progression tables when offline or AI doesn't provide one.
 * Engineered for high-precision visual clarity across mechanics, kinematics, calculus, circuits, geometry, and chemistry.
 */
function getFallbackVisual(concept: BlueprintConcept, step: SubStep): { diagramSvg: string | null; tableMarkdown: string | null; caption?: string } {
    const textContext = `${concept.conceptName} ${concept.keyDefinition} ${concept.formula || ''} ${concept.intuitionNote}`.toLowerCase();

    if (step === 'formula') {
        if (textContext.includes('accel') || textContext.includes('speed') || textContext.includes('motion') || textContext.includes('velocity')) {
            const tableMarkdown = `| Time ($t$) | Velocity ($v$) | What is happening? |
| :---: | :---: | :--- |
| **0 s** | **12 m/s** | Initial speed ($v_i$) |
| **1 s** | **16 m/s** | Added $+4\\text{ m/s}$ ($a = 4\\text{ m/s}^2$) |
| **2 s** | **20 m/s** | Added $+4\\text{ m/s}$ |
| **3 s** | **24 m/s** | Final speed ($v_f$) |`;
            return { diagramSvg: null, tableMarkdown, caption: 'Second-by-Second Progression Table' };
        }

        if (concept.variables && concept.variables.length > 0) {
            const rows = concept.variables.map(v => `| \`${v.symbol}\` | ${v.meaning} | ${v.unit || 'SI unit'} |`).join('\n');
            const tableMarkdown = `| Symbol | Variable / Property | Unit |\n| :--- | :--- | :--- |\n${rows}`;
            return { diagramSvg: null, tableMarkdown, caption: `${concept.conceptName} — Variables Reference` };
        }
    }

    if (step === 'pitfalls') {
        if (textContext.includes('distance') || textContext.includes('displacement')) {
            const tableMarkdown = `| Property | Distance | Displacement |
| :--- | :--- | :--- |
| **Type** | Scalar (Magnitude only) | Vector (Magnitude + Direction) |
| **Sign** | **Always positive ($+$)** | **Can be $(+)$, $(-)$, or $0$** |
| **Meaning** | Total path traveled | Net straight-line change |`;
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

    // ── 1. Dynamics & Free-Body Force Diagram ──
    if (textContext.includes('force') || textContext.includes('newton') || textContext.includes('friction') || textContext.includes('mass') || textContext.includes('gravity') || textContext.includes('weight')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
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
    <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#276749" />
    </marker>
  </defs>
  <!-- Surface -->
  <line x1="30" y1="165" x2="390" y2="165" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round" />
  <line x1="50" y1="173" x2="40" y2="183" stroke="#C2B2A3" stroke-width="2" />
  <line x1="100" y1="173" x2="90" y2="183" stroke="#C2B2A3" stroke-width="2" />
  <line x1="150" y1="173" x2="140" y2="183" stroke="#C2B2A3" stroke-width="2" />
  <line x1="200" y1="173" x2="190" y2="183" stroke="#C2B2A3" stroke-width="2" />
  <line x1="250" y1="173" x2="240" y2="183" stroke="#C2B2A3" stroke-width="2" />
  <line x1="300" y1="173" x2="290" y2="183" stroke="#C2B2A3" stroke-width="2" />
  <line x1="350" y1="173" x2="340" y2="183" stroke="#C2B2A3" stroke-width="2" />

  <!-- Mass Block -->
  <rect x="150" y="85" width="120" height="80" rx="8" fill="#F4ECE2" stroke="#5A3E22" stroke-width="2.5" />
  <text x="210" y="130" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" fill="#3D2817" text-anchor="middle">Mass m</text>

  <!-- Force Applied (Right) -->
  <line x1="270" y1="125" x2="365" y2="125" stroke="#2B6CB0" stroke-width="3.5" marker-end="url(#arrow-blue)" />
  <text x="325" y="112" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#2B6CB0">F_applied →</text>

  <!-- Friction Force (Left) -->
  <line x1="150" y1="155" x2="65" y2="155" stroke="#C53030" stroke-width="3" marker-end="url(#arrow-red)" />
  <text x="75" y="145" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#C53030">← f_friction</text>

  <!-- Normal Force (Up) -->
  <line x1="210" y1="85" x2="210" y2="25" stroke="#276749" stroke-width="2.8" marker-end="url(#arrow-green)" />
  <text x="220" y="45" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#276749">F_N (Normal)</text>

  <!-- Gravity Force (Down) -->
  <line x1="210" y1="165" x2="210" y2="212" stroke="#8B4513" stroke-width="2.8" marker-end="url(#arrow)" />
  <text x="220" y="205" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#8B4513">F_g = mg</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Free-Body Force & Equilibrium Diagram' };
    }

    // ── 2. Kinematics: Velocity-Time & Slope Model ──
    if (textContext.includes('accel') || textContext.includes('kinematics') || textContext.includes('speed') || textContext.includes('velocity') || textContext.includes('motion')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8B4513" />
    </marker>
  </defs>
  <!-- Axes -->
  <line x1="50" y1="180" x2="380" y2="180" stroke="#8B4513" stroke-width="2.5" marker-end="url(#arrow)" />
  <line x1="50" y1="180" x2="50" y2="25" stroke="#8B4513" stroke-width="2.5" marker-end="url(#arrow)" />
  <text x="385" y="185" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#8B4513">Time (t)</text>
  <text x="55" y="25" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#8B4513">Velocity (v)</text>

  <!-- Area under curve (Displacement) -->
  <polygon points="50,140 320,50 320,180 50,180" fill="#2B6CB0" fill-opacity="0.12" />
  <text x="180" y="165" font-family="system-ui, sans-serif" font-size="12" font-style="italic" fill="#2B6CB0">Area = Displacement (Δx)</text>

  <!-- Velocity Line -->
  <line x1="50" y1="140" x2="320" y2="50" stroke="#2B6CB0" stroke-width="3.5" />
  <circle cx="50" cy="140" r="5" fill="#2B6CB0" />
  <text x="20" y="145" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0">v_i</text>
  <circle cx="320" cy="50" r="5" fill="#C53030" />
  <text x="330" y="52" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#C53030">v_f</text>

  <!-- Slope Rise/Run Triangle -->
  <line x1="170" y1="100" x2="270" y2="100" stroke="#C53030" stroke-width="1.8" stroke-dasharray="4,3" />
  <line x1="270" y1="100" x2="270" y2="67" stroke="#C53030" stroke-width="1.8" stroke-dasharray="4,3" />
  <text x="210" y="115" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#C53030">Δt (Run)</text>
  <text x="278" y="87" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#C53030">Δv (Rise)</text>
  <text x="135" y="70" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#C53030">Slope = a = Δv / Δt</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Kinematics: Velocity-Time Graph & Acceleration Slope' };
    }

    // ── 3. Geometry & Trigonometry Right Triangle ──
    if (textContext.includes('triang') || textContext.includes('sin') || textContext.includes('cos') || textContext.includes('tan') || textContext.includes('angle') || textContext.includes('pythag') || textContext.includes('geometry')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <!-- Triangle Polygon -->
  <polygon points="70,175 330,175 330,35" fill="#F4ECE2" stroke="#8B4513" stroke-width="3" />
  
  <!-- Right Angle Square -->
  <rect x="305" y="150" width="25" height="25" fill="none" stroke="#8B4513" stroke-width="2" />
  
  <!-- Labels -->
  <text x="200" y="195" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#5A3E22" text-anchor="middle">Adjacent Side (b)</text>
  <text x="345" y="110" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#5A3E22">Opposite (a)</text>
  <text x="175" y="90" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#2B6CB0" transform="rotate(-28 175 90)">Hypotenuse (c)</text>
  
  <!-- Angle Arc θ -->
  <path d="M 115,175 A 45,45 0 0,0 108,152" fill="none" stroke="#C53030" stroke-width="2.5" />
  <text x="125" y="165" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#C53030">θ</text>
  
  <!-- Formula Pill -->
  <rect x="70" y="15" width="200" height="30" rx="6" fill="#FFFDF9" stroke="#DFD1C0" />
  <text x="80" y="35" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#8B4513">a² + b² = c²  |  sin θ = a / c</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Right Triangle Trigonometric & Geometric Model' };
    }

    // ── 4. Calculus: Tangent Line & Derivative Slope ──
    if (textContext.includes('slope') || textContext.includes('deriv') || textContext.includes('tangent') || textContext.includes('rate') || textContext.includes('calculus') || textContext.includes('integral')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8B4513" />
    </marker>
  </defs>
  <!-- Axes -->
  <line x1="45" y1="185" x2="385" y2="185" stroke="#8B4513" stroke-width="2" marker-end="url(#arrow)" />
  <line x1="45" y1="185" x2="45" y2="25" stroke="#8B4513" stroke-width="2" marker-end="url(#arrow)" />
  <text x="390" y="190" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#8B4513">x</text>
  <text x="50" y="25" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#8B4513">f(x)</text>

  <!-- Curve f(x) -->
  <path d="M 60,170 Q 180,160 240,95 T 370,30" fill="none" stroke="#2B6CB0" stroke-width="3.5" />
  <text x="320" y="30" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#2B6CB0">y = f(x)</text>

  <!-- Tangent Line -->
  <line x1="140" y1="175" x2="330" y2="35" stroke="#C53030" stroke-width="2.5" stroke-dasharray="6,4" />
  <circle cx="235" cy="105" r="5" fill="#C53030" />
  <text x="248" y="110" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#C53030">Point (x₀, f(x₀))</text>

  <rect x="60" y="40" width="180" height="32" rx="6" fill="#FFFDF9" stroke="#E5DACD" />
  <text x="70" y="61" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#C53030">Tangent Slope m = f'(x₀)</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Calculus: Function Curve & Instantaneous Tangent Rate' };
    }

    // ── 5. Electricity & Circuits ──
    if (textContext.includes('circuit') || textContext.includes('resistor') || textContext.includes('voltage') || textContext.includes('current') || textContext.includes('ohm')) {
        const svg = `<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2B6CB0" />
    </marker>
  </defs>
  <!-- Wire loop -->
  <rect x="70" y="45" width="280" height="130" rx="10" fill="none" stroke="#5A3E22" stroke-width="3" />
  
  <!-- Battery Source on Left -->
  <rect x="60" y="90" width="20" height="40" fill="#FAF7F2" stroke="none" />
  <line x1="60" y1="100" x2="80" y2="100" stroke="#C53030" stroke-width="4" />
  <line x1="66" y1="120" x2="74" y2="120" stroke="#5A3E22" stroke-width="3" />
  <text x="35" y="103" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#C53030">+</text>
  <text x="35" y="125" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#5A3E22">-</text>
  <text x="25" y="145" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#5A3E22">Voltage (V)</text>

  <!-- Resistor on Top -->
  <rect x="170" y="35" width="80" height="20" fill="#FAF7F2" stroke="none" />
  <path d="M 170,45 L 180,35 L 195,55 L 210,35 L 225,55 L 240,35 L 250,45" fill="none" stroke="#8B4513" stroke-width="3" />
  <text x="185" y="25" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#8B4513">Resistor (R)</text>

  <!-- Current Arrow in Center -->
  <path d="M 180,110 A 30,30 0 1,1 230,110" fill="none" stroke="#2B6CB0" stroke-width="2.5" marker-end="url(#arrow-blue)" />
  <text x="175" y="130" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0">Current I = V / R</text>
</svg>`;
        return { diagramSvg: svg, tableMarkdown: null, caption: 'Ohm\'s Law DC Circuit Loop Model' };
    }

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
    const [isDone, setIsDone] = useState(false);

    // ── Dynamic Affirmative & Negative Action Buttons ────────────────────
    const [positiveAction, setPositiveAction] = useState<{ label: string; text: string }>(
        getDefaultActions('definition').positive
    );
    const [negativeAction, setNegativeAction] = useState<{ label: string; text: string }>(
        getDefaultActions('definition').negative
    );

    // ── Board ────────────────────────────────────────────────────────────
    const [visibleBoardLines, setVisibleBoardLines] = useState<string[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isLoadingUnit, setIsLoadingUnit] = useState(false);
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
    const isActiveRef        = useRef(true);
    const hasStartedRef      = useRef(false);
    const conceptIdxRef      = useRef(0);
    const subStepRef         = useRef<SubStep>('definition');
    const audioContextRef    = useRef<AudioContext | null>(null);
    const currentAudioRef    = useRef<AudioBufferSourceNode | null>(null);
    const playSessionIdRef   = useRef<number>(0);
    const recognitionRef     = useRef<any>(null);
    const spokenTextRef      = useRef('');
    const lastSpokenTextRef  = useRef('');
    const handleStudentReplyRef = useRef<(reply: string) => Promise<void>>(() => Promise.resolve());
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
        blueprintKeyRef.current = `vt_blueprint_v5_${uid}_${cid}_${tid}`;
        progressKeyRef.current  = `vt_progress_v5_${uid}_${cid}_${tid}`;
    }, [sessionData, userProfile]);

    // ── Load / generate blueprint once session is ready ───────────────────
    useEffect(() => {
        if (!sessionData || hasStartedRef.current) return;
        hasStartedRef.current = true;
        void bootstrapSession();
    }, [sessionData]);

    // ─────────────────────────────────────────────────────────────────────────
    // Audio helpers
    // ─────────────────────────────────────────────────────────────────────────
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
                    void handleStudentReplyRef.current(final);
                }
            };
            rec.onerror = () => { if (isActiveRef.current) setIsMicListening(false); };
            recognitionRef.current = rec;
            rec.start();
        } catch (_) { setIsMicListening(false); }
    }, [addToast]);

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
        const v   = vs.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Neural')))
                 || vs.find(v => v.lang.startsWith('en'));
        if (v) utt.voice = v;
        utt.onstart = () => { if (isActiveRef.current) { setIsSpeaking(true); setIsPaused(false); setIsTtsLoading(false); } };
        utt.onend   = () => {
            if (isActiveRef.current) {
                setIsSpeaking(false);
                setIsPaused(false);
                setIsTtsLoading(false);
                onEnd?.();
                startMicListening();
            }
        };
        utt.onerror = () => { if (isActiveRef.current) { setIsSpeaking(false); setIsPaused(false); setIsTtsLoading(false); } };
        setIsSpeaking(true);
        setIsPaused(false);
        setIsTtsLoading(false);
        window.speechSynthesis.speak(utt);
    }, [speechRate, startMicListening]);

    // ── Sentence Splitter for Ultra-Low Latency Speech Streaming ─────────────
    const splitSpeechSentences = useCallback((rawText: string): string[] => {
        const clean = rawText
            .replace(/\$\$([\s\S]*?)\$\$/g, ' as shown on the board ')
            .replace(/\$([^\$]+)\$/g, '$1')
            .replace(/[#*`_~]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!clean) return [];

        // Match complete sentences ending in . ! ? or newline
        const parts = clean.match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|$)/g) || [clean];
        const sentences: string[] = [];

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            // Split overly long sentences (>150 characters) at punctuation marks for instant TTFB
            if (trimmed.length > 150) {
                const subChunks = trimmed.match(/[^,;:—]+(?:[,;:—]+(?=\s|$)|$)/g) || [trimmed];
                for (const sub of subChunks) {
                    const subTrimmed = sub.trim();
                    if (subTrimmed) sentences.push(subTrimmed);
                }
            } else {
                sentences.push(trimmed);
            }
        }
        return sentences.length > 0 ? sentences : [clean];
    }, []);

    // ── Gemini Live Voice Sentence-Pipelined Streaming Speech Engine ─────────
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
        const sentences = splitSpeechSentences(text);
        if (sentences.length === 0) {
            setIsTtsLoading(false);
            onEnd?.();
            return;
        }

        const usePersonal = !!(userProfile?.use_personal_token && userProfile?.personal_api_key?.trim());
        const apiKey = usePersonal
            ? userProfile!.personal_api_key!.trim()
            : (appSettings?.gemini_api_key?.trim() || '');

        if (!apiKey) {
            setIsTtsLoading(false);
            browserSpeak(sentences.join(' '), onEnd);
            return;
        }

        try {
            const tts = new GoogleGenAI({ apiKey });
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') await ctx.resume();

            // Cache for fetched audio buffers by sentence index
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

            // Initiate sentence 0 and pre-fetch sentence 1 immediately
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

                // Pipeline pre-fetch for upcoming sentences
                if (sentenceIdx + 1 < sentences.length) void fetchSentenceAudio(sentenceIdx + 1);
                if (sentenceIdx + 2 < sentences.length) void fetchSentenceAudio(sentenceIdx + 2);

                const buffer = await fetchSentenceAudio(sentenceIdx);

                if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;

                if (!buffer) {
                    if (sentenceIdx === 0) {
                        console.warn('[Gemini TTS] Initial sentence failed, falling back to natural browser synthesis');
                        setIsTtsLoading(false);
                        browserSpeak(sentences.slice(currentIndex).join(' '), onEnd);
                        return;
                    }
                    // Skip to next sentence if one intermediate sentence had a network error
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
            console.warn('[Gemini TTS] Pipelining error, falling back to browser synthesis:', err);
            if (!isActiveRef.current || playSessionIdRef.current !== sessionId) return;
            setIsTtsLoading(false);
            browserSpeak(sentences.join(' '), onEnd);
        }
    }, [isMuted, speechRate, userProfile, appSettings, getAudioCtx, pcm16ToAudioBuffer, splitSpeechSentences, browserSpeak, startMicListening]);

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
    // Blueprint generation (Deep, Bit-by-Bit Master Pedagogical Blueprint)
    // ─────────────────────────────────────────────────────────────────────────
    const generateBlueprint = useCallback(async (session: VoiceTutorialSessionData, studentMem?: StudentCognitiveProfile | null): Promise<LessonBlueprint | null> => {
        setIsGeneratingBlueprint(true);
        setBlueprintGenStep('Analysing topic & student memory...');

        const aiClient = createAvelutAI(appSettings, userProfile || null);
        if (!aiClient) { setIsGeneratingBlueprint(false); return null; }

        const courseName = session.course.course_name;
        const topicName  = session.topic?.topic_name || 'Core Concepts';
        const level      = session.course.level || 'University';

        setBlueprintGenStep('Designing personalized bit-by-bit lesson plan...');

        const memoryContext = studentMem?.lastTopicTaught
            ? `STUDENT COGNITIVE MEMORY & HISTORY:
- Last Taught Topic: "${studentMem.lastTopicTaught.topicName}" in ${studentMem.lastTopicTaught.courseName}
- Mastered Concepts: ${studentMem.overallMasteries.slice(-5).join(', ') || 'Foundational topics'}
- Areas of Past Struggle / Pitfalls: ${studentMem.overallWeakPoints.slice(-5).join(', ') || studentMem.lastTopicTaught.struggledKeyPoints.join(', ') || 'Unit conversions & boundary conditions'}
- Preferred Learning Style: Step-by-step physical intuition, concrete numerical state tables before algebra.`
            : `STUDENT COGNITIVE MEMORY: New student or fresh topic. Maintain intuitive, step-by-step pacing.`;

        const prompt = `You are AVELUT Master STEM Curriculum Designer. You follow the "Intuition First, Math Second, Bit-by-Bit" pedagogy:
1. Slow Down & Teach Bit-by-Bit: Never rush or give compressed 1-sentence summaries. Thoroughly explain what terms mean and how things work in the real world.
2. Step-by-Step, Foundational: Start with basic, relatable questions (e.g. "When you hear the word distance, what do you think of?").
3. Real-World Physical Analogies: Vivid everyday scenarios (e.g. sports car vs. truck 0-60, ball dropped off a cliff, column buckling under roof weight).
4. Concrete Progression Tables Over Abstract Math: Build step-by-step or second-by-second numerical state tables showing how quantities evolve before showing algebraic formulas.
5. Clear Distinctions & Golden Rules: Explicitly contrast confusing twin terms (e.g. Distance vs. Displacement, Speed vs. Velocity, Mass vs. Weight) with bold Golden Rules.
6. Full Problem Statements & Interactive Pacing: When giving examples, ALWAYS write the FULL, CLEAR question text (do not compress into shorthand). Break down given data, state the principle, substitute numbers, and interpret the physical result.
7. Visual Representation: Labeled diagrams, force vectors with arrows, geometry sketches.

${memoryContext}

Course: "${courseName}"
Topic: "${topicName}"
Student Level: ${level}

Generate a lesson blueprint as valid JSON ONLY — no explanation, no markdown fences.

{
  "overview": "2-3 sentence overview of what the student will learn",
  "concepts": [
    {
      "conceptName": "Short name (2-5 words)",
      "relatableQuestion": "Everyday intuitive question to open the topic (e.g. 'When you hear acceleration, what comes to mind?')",
      "keyDefinition": "Clear, deep, and thorough definition grounded in physical meaning, plain English",
      "realWorldAnalogy": "Concrete physical analogy or scenario (e.g. truck vs. sports car 0 to 60 mph)",
      "intuitionNote": "What this concept feels like physically in everyday life and why it behaves this way.",
      "progressionTable": "| Time (t) | Velocity (v) | What is happening? |\\n| :---: | :---: | :--- |\\n| 0 s | 12 m/s | Starting speed |\\n| 1 s | 16 m/s | Added +4 m/s |\\n| 2 s | 20 m/s | Added +4 m/s |",
      "formula": "$$LaTeX formula$$ or null",
      "variables": [
        {"symbol": "a", "meaning": "Acceleration — rate velocity changes per second", "unit": "m/s²"}
      ],
      "keyDistinction": "Clear distinction between this and its commonly confused counterpart (e.g. Speed vs. Velocity)",
      "goldenRule": "Memorable Golden Rule (e.g. 'Distance is always positive; displacement can be positive, negative, or zero.')",
      "example1": {
        "problem": "Detailed problem statement including all given variables.",
        "solution": ["Step 1", "Step 2", "Step 3"],
        "answer": "Final value"
      },
      "example2": {
        "problem": "A slightly harder challenge variation.",
        "solution": ["Step 1", "Step 2", "Step 3"],
        "answer": "Final value"
      },
      "commonPitfalls": ["Pitfall 1", "Pitfall 2"],
      "summaryPoints": ["Summary point 1", "Summary point 2"]
    }
  ],
  "overallSummary": "1–2 sentence closing summary of the topic"
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

    // ─────────────────────────────────────────────────────────────────────────
    // Session bootstrap — load or generate blueprint, restore progress & memory
    // ─────────────────────────────────────────────────────────────────────────
    const bootstrapSession = useCallback(async () => {
        if (!sessionData) return;

        const uid   = userProfile?.uid || 'anon';
        const cid   = sessionData.course?.course_id  || 'general';
        const tid   = sessionData.topic?.topic_id    || 'core';
        const bpKey = `vt_blueprint_v6_${uid}_${cid}_${tid}`;
        const prKey = `vt_progress_v6_${uid}_${cid}_${tid}`;
        blueprintKeyRef.current = bpKey;
        progressKeyRef.current  = prKey;

        // Load student cognitive memory profile
        const studentMem = await getStudentCognitiveProfile(uid);

        // 1. Load blueprint from cache
        let bp = readCachedJson<LessonBlueprint | null>(bpKey, null);

        if (!bp) {
            // 2. Generate blueprint
            bp = await generateBlueprint(sessionData, studentMem);
            if (!bp || !isActiveRef.current) return;
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

        const defaultActs = getDefaultActions(startSubStep);
        setPositiveAction(defaultActs.positive);
        setNegativeAction(defaultActs.negative);

        // 4. Start teaching with memory context
        await presentUnit(bp, startConceptIdx, startSubStep, studentMem, true);
    }, [sessionData, userProfile, generateBlueprint]);

    // ─────────────────────────────────────────────────────────────────────────
    // Present a specific unit — with memory recall & precision SVG rendering
    // ─────────────────────────────────────────────────────────────────────────
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

        // Save progress immediately
        writeCachedJson(progressKeyRef.current, { conceptIdx: cIdx, subStep: sStep }, userProfile?.uid || 'anon');

        // Build cognitive memory prompt snippet
        const memoryOpeningInstruction = (isSessionStart && cIdx === 0 && sStep === 'definition' && studentMem?.lastTopicTaught)
            ? `MEMORY-BASED OPENING (CRITICAL):
The student previously completed topic "${studentMem.lastTopicTaught.topicName}" where they struggled with: ${studentMem.lastTopicTaught.struggledKeyPoints?.join(', ') || studentMem.overallWeakPoints?.join(', ') || 'key boundary conditions'}.
Open the spokenExplanation warmly with personal tutor memory:
"Welcome back! Last time we nailed down ${studentMem.lastTopicTaught.topicName}, but we noticed ${studentMem.lastTopicTaught.struggledKeyPoints?.[0] || 'the calculation details'} was tricky. Today, we're taking ${concept.conceptName} step-by-step so it becomes second nature... [Then transition into relatable opening question for ${concept.conceptName}]"`
            : '';

        // ── Sub-step instructions for the AI ("Intuition First, Math Second, Bit-by-Bit") ──
        const subStepInstructions: Record<SubStep, string> = {
            definition:
                `Teach the DEFINITION of "${concept.conceptName}" thoroughly using Relatable Question & Intuitive Foundation.
${memoryOpeningInstruction}
Relatable Question: ${concept.relatableQuestion || `When you hear the word "${concept.conceptName}", what comes to mind?`}
- spokenExplanation: (4-6 sentences, slow & engaging). Open warmly (with memory if applicable), deliver the relatable question, and define the key concept in everyday physical terms before introducing equations. Explain what each word means and why it matters in real life. End with a check question.
- boardLines[0]: "${concept.conceptName}" as title.
- boardLines[1-3]: The definition broken into 1-3 punchy, plain English lines.
- diagramSvg: Simple physical sketch or labeled coordinate axis.
- positiveReplyLabel: "Yes, makes sense →"
- negativeReplyLabel: "No, explain again ↺"`,

            intuition:
                `Teach the PHYSICAL INTUITION & REAL-WORLD ANALOGY for "${concept.conceptName}".
Analogy: ${concept.realWorldAnalogy || concept.intuitionNote}
- spokenExplanation: (4-6 sentences). Deliver the physical analogy vividly. Make the student physically visualize what is happening. Refer directly to the diagram drawn on the board. End by asking if they can picture this.
- boardLines[0]: "💡 Physical Intuition" as header.
- boardLines[1-3]: 2-3 lines capturing the physical feel and takeaway.
- diagramSvg: Clean SVG illustration with colored arrows.
- positiveReplyLabel: "I visualize it, show formula →"
- negativeReplyLabel: "Give another analogy ↺"`,

            formula:
                `Teach the FORMULA for "${concept.conceptName}" via a CONCRETE PROGRESSION TABLE (Table First, Math Second).
Progression Table: ${concept.progressionTable || 'Second-by-second numerical table'}
- spokenExplanation: (4-6 sentences). Tell the student to look at the table on the board. Walk through the numbers second-by-second. THEN explain that the formula on the board is simply the algebraic shortcut for this table. Explain what each symbol represents physically. Do NOT read raw LaTeX.
- tableMarkdown: Clean second-by-second or step-by-step progression table.
- boardLines[0]: The LaTeX formula ($$...$$).
- boardLines[1-N]: Each variable as "symbol  →  plain meaning (units)".
- positiveReplyLabel: "Formula understood, do example →"
- negativeReplyLabel: "Explain variables again ↺"`,

            pitfalls:
                `Teach CRUCIAL DISTINCTIONS & GOLDEN RULES for "${concept.conceptName}".
- spokenExplanation: (4-6 sentences). Highlight the most common mistake students make. Point out the exact difference between the twin terms. Emphasize the Golden Rule clearly. Ask if they have ever fallen into this trap.
- boardLines[0]: "⚠️ Crucial Distinction & Golden Rule" as header.
- boardLines[1-N]: The golden rules and warnings formatted clearly.
- tableMarkdown: Side-by-side comparison table.
- positiveReplyLabel: "Noted, I'll avoid this trap →"
- negativeReplyLabel: "Why is this mistake common? ↺"`,

            example_1:
                `Teach WORKED EXAMPLE 1 for "${concept.conceptName}".
- spokenExplanation: (4-6 sentences). "Let's read this problem on the board: [Read problem statement]. Here is how we think about it... First, we write down our given values... Then we apply the formula... giving us our final answer of ${concept.example1.answer}. Does every step make sense?"
- boardLines[0]: "Example: ${concept.example1.problem}"
- boardLines[1-4]: The 4 clean working steps.
- positiveReplyLabel: "I followed each step, next challenge →"
- negativeReplyLabel: "Redo calculation step slowly ↺"`,

            example_2:
                `Teach WORKED EXAMPLE 2 (Harder / Challenge Variant) for "${concept.conceptName}".
- spokenExplanation: (4-6 sentences). "Now let's look at a challenge problem: [Read problem statement]. What makes this harder is [explain condition change]. Let's solve it step-by-step: [walk through steps]. Notice our final result: ${concept.example2.answer}. Can you see how that condition changed the outcome?"
- boardLines[0]: "Challenge: ${concept.example2.problem}"
- boardLines[1-4]: The 4 clean calculation steps with LaTeX.
- positiveReplyLabel: "Understood, summarize topic →"
- negativeReplyLabel: "What if values were different? ↺"`,

            summary:
                `Teach the SUMMARY for "${concept.conceptName}".
- spokenExplanation: (3-5 sentences). Recap what was learned. Reinforce the golden rule and the formula shortcut. Celebrate their progress and ask if they are ready for the next concept.
- boardLines[0]: "${concept.conceptName} — Key Takeaways" as title.
- boardLines[1-N]: The summary points and golden rule.
- positiveReplyLabel: "Ready for next concept! 🎓"
- negativeReplyLabel: "Recap key formula once more ↺"`,
        };

        const aiPrompt = `You are AVELUT Master Voice & Visual STEM Tutor.
You embody the "Intuition First, Math Second, Bit-by-Bit" teaching methodology:
- SLOW DOWN and teach bit-by-bit. Speak 4-6 sentences per step, explaining concepts thoroughly and warmly.
- When presenting examples/problems, ALWAYS state and read the FULL question before solving.
- Never dump raw math without explaining the physical reasoning and given data first.
- Always use conversational, engaging, classroom teacher English (no robotic jargon).
- Provide positiveReplyLabel and negativeReplyLabel tailored specifically to what you just taught/asked!
- Use the board to draw diagrams, second-by-second progression tables, and clean LaTeX formulas.
- Always refer to what you are drawing or writing on the board.

LESSON BLUEPRINT — CURRENT CONCEPT:
${JSON.stringify(concept, null, 2)}
CURRENT TEACHING SUB-STEP: ${sStep}
TASK: ${subStepInstructions[sStep]}

SVG VISUAL DRAWING RULES (Ultra-Precise, Detailed & Scientifically Accurate):
- Must be a valid SVG string with viewBox="0 0 420 220", xmlns="http://www.w3.org/2000/svg"
- Use proper <defs> with arrow markers (#arrow for brown/neutral, #arrow-red for forces/loads, #arrow-blue for velocities/motion/current, #arrow-green for reactions/equilibrium).
- Precision Engineering Details:
  * Bodies / Containers / Objects: fill="#F4ECE2", stroke="#5A3E22", stroke-width="2.5", rx="8"
  * Primary Forces / Loads / Critical Vectors: stroke="#C53030", stroke-width="3", marker-end="url(#arrow-red)", with clear force values (e.g. "F = 45 N", "mg = 98 N")
  * Velocity / Motion / Flow / Displacement: stroke="#2B6CB0", stroke-width="3", marker-end="url(#arrow-blue)", with values (e.g. "v = 12 m/s", "I = 2.5 A")
  * Reactions / Equilibrium / Normals: stroke="#276749", stroke-width="2.8", marker-end="url(#arrow-green)" (e.g. "F_N = 98 N")
  * Ground / Surface / Axes: stroke="#8B5A2B", stroke-width="2.5" with hatch marks for ground or arrowheads for axes
  * Dimension & Angle annotations: Clean dashed extension lines (#8B5A2B), angle arcs with "θ = 30°" or clear variable letters
  * High-legibility text: font-family="system-ui, -apple-system, sans-serif", font-weight="bold", fill="#3D2817", font-size="12px" to "14px"
- Ensure diagram directly illustrates the exact problem, quantities, variables, and scenario of the current sub-step.

STRICT OUTPUT RULES (Valid JSON ONLY):
1. boardLines: Array of strings, max ${MAX_BOARD_LINES} items.
2. spokenExplanation: Natural conversational spoken English ONLY (no LaTeX).
3. diagramSvg: Ultra-precise, detailed SVG string with viewBox="0 0 420 220" or null.
4. tableMarkdown: Clean markdown table string or null.
5. positiveReplyLabel: Text for the forward/affirmative button (e.g. "Yes, makes sense →").
6. positiveReplyText: Spoken response if tapped.
7. negativeReplyLabel: Text for the back/negative button (e.g. "Explain again ↺").
8. negativeReplyText: Spoken inquiry if tapped.
`;

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
                config: { responseMimeType: 'application/json', temperature: 0.5 },
            });

            if (!isActiveRef.current) return;

            const raw = getResponseText(result);
            if (!raw) throw new Error('Empty unit response');

            const parsed: UnitPresentationResponse =
                JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());

            setIsLoadingUnit(false);
            streamBoardLines(parsed.boardLines.slice(0, MAX_BOARD_LINES));

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
                setActiveVisualCaption(parsed.diagramCaption || concept.diagramCaption || `${concept.conceptName} Diagram`);
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
            console.warn('[PresentUnit] AI error, using blueprint fallback:', err);
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
    }, [speakText, streamBoardLines, userProfile, appSettings]);

    // ─────────────────────────────────────────────────────────────────────────
    // Handle student reply — update persistent memory as learning unfolds
    // ─────────────────────────────────────────────────────────────────────────
    const handleStudentReply = useCallback(async (reply: string) => {
        if (!blueprint || !isActiveRef.current) return;

        stopAudioImmediate();
        stopMicImmediate();
        clearAllStreamTimers();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setTextInput('');

        const wantsRepeat = /again|repeat|explain|didn.t|don.t|slow|what|why|no|clarif/i.test(reply);

        const uid       = userProfile?.uid || 'anon';
        const tid       = sessionData?.topic?.topic_id || 'core';
        const tName     = sessionData?.topic?.topic_name || 'Core Principles';
        const cName     = sessionData?.course?.course_name || 'Academic Tutorial';
        const currentC  = blueprint.concepts[conceptIdxRef.current];

        // Track cognitive progress in persistent memory
        if (currentC) {
            void recordConceptProgress(uid, tid, tName, cName, currentC.conceptName, !wantsRepeat);
        }

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

                // Save session completion into student cognitive memory
                void recordSessionCompletion(uid, tid, tName, cName, blueprint.overallSummary, currentC?.commonPitfalls || []);

                void speakText(`Excellent work! ${blueprint.overallSummary} You have completed this topic!`);
                return;
            }
        }

        conceptIdxRef.current = newConceptIdx;
        subStepRef.current    = newSubStep;
        setConceptIdx(newConceptIdx);
        setSubStep(newSubStep);

        await presentUnit(blueprint, newConceptIdx, newSubStep);
    }, [blueprint, speakText, presentUnit, userProfile, sessionData]);

    useEffect(() => {
        handleStudentReplyRef.current = handleStudentReply;
    }, [handleStudentReply]);

    const handleSendText = () => {
        if (!textInput.trim()) return;
        const text = textInput.trim();
        setTextInput('');
        void handleStudentReply(text);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Controls
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
        const speeds = [1.0, 1.15, 1.35];
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
        isActiveRef.current = false;
        stopAudioImmediate();
        clearAllStreamTimers();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        stopMicImmediate();

        if (blueprint) {
            const prog: TutorialProgress = { conceptIdx: conceptIdxRef.current, subStep: subStepRef.current };
            writeCachedJson(progressKeyRef.current, prog, userProfile?.uid || 'anon');
        }

        await new Promise(r => setTimeout(r, 80));
        if (onNavigate) onNavigate('study_guide');
        else window.history.back();
    }, [blueprint, userProfile, onNavigate]);

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
                        AVELUT is designing a personalized, bit-by-bit lesson blueprint with diagrams, math formulas, and worked examples. Future sessions load instantly.
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
                            <span className="font-bold text-[#8B5A2B] px-2 py-0.5 rounded-lg bg-[#EFE5D8] border border-[#DFD1C0] shrink-0 ml-2 truncate max-w-[180px]">
                                {conceptIdx + 1}/{totalConcepts} · {currentConcept.conceptName}
                            </span>
                        </div>
                    )}

                    {/* ── Visual Blackboard ── */}
                    <div className="relative flex-1 min-h-[220px] sm:min-h-[280px] max-h-[calc(100vh-280px)] flex flex-col justify-start milk-canvas border-2 border-[#E5D7C5] rounded-3xl p-4 sm:p-6 shadow-md overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-[#D4C3B3]/60 [&::-webkit-scrollbar-thumb]:rounded-full">

                        {isLoadingUnit && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#FAF7F2]/85 backdrop-blur-xs rounded-3xl z-20">
                                <div className="w-8 h-8 border-2 border-[#C2B2A3] border-t-[#8B5A2B] rounded-full animate-spin" />
                                <p className="text-sm font-handwriting text-[#7A6B5C] tracking-wide animate-pulse">
                                    Drawing & preparing board...
                                </p>
                            </div>
                        )}

                        {visibleBoardLines.length > 0 && (
                            <div className="flex flex-col h-full gap-3">
                                <div className="w-full border-b border-[#E8DCCF] pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 shrink-0">
                                    <div className="font-bold font-handwriting text-lg sm:text-2xl text-[#8B4513] leading-snug flex-1">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm, remarkMath]}
                                            rehypePlugins={[rehypeKatex]}
                                            components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                        >{visibleBoardLines[0]}</ReactMarkdown>
                                    </div>
                                </div>

                                <div className={`flex-1 w-full ${hasVisualElement ? 'grid grid-cols-1 lg:grid-cols-12 gap-4 items-start' : 'space-y-3'}`}>

                                    <div className={`${hasVisualElement ? 'lg:col-span-6 space-y-2.5' : 'space-y-3'}`}>
                                        {visibleBoardLines.slice(1).map((line, idx) => {
                                            const isVarLine       = line.includes('→');
                                            const isBlockFormula  = line.trim().startsWith('$$');
                                            const isPitfallHeader = line === 'Common Pitfalls';
                                            const isSummaryHeader = line.includes('— Summary') || line === '🎓 Topic Complete!';
                                            const isIntHeader     = line === 'Intuition' || line.includes('Physical Intuition');

                                            const stepMatch = line.match(/^(Given|Formula|Substitute|Calculate|Calculation|Apply|Result|Identify|Step\s*\d+)\s*:\s*(.*)$/i);

                                            return (
                                                <div key={`${idx}-${line.slice(0, 15)}`} className="flex items-start gap-2 animate-fade-in">
                                                    {!isVarLine && !isBlockFormula && !isPitfallHeader && !isSummaryHeader && !isIntHeader && !stepMatch && (
                                                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#8B5A2B] shrink-0 opacity-70" />
                                                    )}

                                                    {stepMatch ? (
                                                        <div className="w-full flex items-start gap-2 py-0.5">
                                                            <span className="mt-0.5 px-2 py-0.5 rounded-md bg-[#EFE5D8] border border-[#DFD1C0] font-sans text-[10px] font-bold uppercase tracking-wider text-[#8B5A2B] shrink-0">
                                                                {stepMatch[1]}
                                                            </span>
                                                            <div className="font-handwriting text-base sm:text-lg text-[#2A1F14] leading-snug flex-1 overflow-x-auto">
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm, remarkMath]}
                                                                    rehypePlugins={[rehypeKatex]}
                                                                    components={{ p: ({ node, ...props }) => <span {...props} /> }}
                                                                >{stepMatch[2]}</ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    ) : isBlockFormula ? (
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
                                    </div>

                                    {hasVisualElement && (
                                        <div className="lg:col-span-6 flex flex-col items-center justify-center p-2 rounded-2xl bg-[#FFFDF9]/90 border border-[#E2D4C3] shadow-xs relative group animate-fade-in">
                                            {activeDiagramSvg && (
                                                <div className="w-full flex flex-col items-center">
                                                    <button
                                                        onClick={() => setIsDiagramZoomed(true)}
                                                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-[#EFE5D8]/80 hover:bg-[#E4D5C3] text-[#5A3E22] text-xs cursor-pointer opacity-70 hover:opacity-100 transition-opacity z-10"
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
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {isMicListening && micDisplay && (
                        <div className="shrink-0 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-[#8B5A2B] animate-pulse px-3 py-1 bg-[#F4ECE2] rounded-full w-fit mx-auto border border-[#E5DACD]">
                            <i className="bi bi-mic-fill text-red-600"></i>
                            <span>"{micDisplay}..."</span>
                        </div>
                    )}

                    {/* ── Unified Input Card with Dynamic Contextual Action Buttons ── */}
                    <div className="shrink-0 flex flex-col gap-2 bg-[#F4ECE2]/95 border border-[#E5DACD] rounded-3xl p-2.5 sm:p-3.5 shadow-sm backdrop-blur-md">

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

                        {/* ── Input Bar with Pause AI, Text Input, Mic & Send ── */}
                        <div className="flex items-center gap-1.5 sm:gap-2 w-full pt-0.5">
                            <button
                                onClick={togglePauseAI}
                                disabled={isTtsLoading || !blueprint}
                                className={`flex items-center justify-center w-10 h-10 rounded-2xl border transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
                                    isSpeaking ? 'bg-[#EFE5D8] border-[#DFD1C0] text-[#8B5A2B]' : 'bg-[#FFFDFB] border-[#D9CCBC] text-[#5A4D3E]'
                                }`}
                            >
                                <i className={`bi ${isSpeaking ? 'bi-pause-fill text-lg' : 'bi-play-fill text-xl'}`}></i>
                            </button>
                            <div className="flex-1 relative flex items-center">
                                <input
                                    type="text"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
                                    disabled={isGeneratingBlueprint}
                                    placeholder="Type your reply or question..."
                                    className="w-full h-10 pl-3.5 pr-9 bg-[#FFFDFB] border border-[#D9CCBC] focus:border-[#8B5A2B] focus:ring-1 focus:ring-[#8B5A2B] rounded-2xl text-xs sm:text-sm text-[#2C241D] placeholder-[#9E8E7E] outline-none shadow-2xs transition-all"
                                />
                                {textInput.trim() && (
                                    <button
                                        onClick={handleSendText}
                                        className="absolute right-1.5 w-7 h-7 rounded-xl bg-[#8B5A2B] hover:bg-[#7A4D24] text-white flex items-center justify-center cursor-pointer active:scale-95"
                                    >
                                        <i className="bi bi-arrow-up-short text-lg"></i>
                                    </button>
                                )}
                            </div>
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
                        </div>
                    </div>
                </main>
            )}

            {/* ── Diagram Zoom Modal ────────────────────────────────────────── */}
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
                            <h3 className="font-bold text-base text-[#5A3E22]">Diagram Inspection</h3>
                            <button
                                onClick={() => setIsDiagramZoomed(false)}
                                className="w-8 h-8 rounded-full bg-[#EFE5D8] hover:bg-[#E2D4C3] text-[#5A3E22] flex items-center justify-center cursor-pointer"
                            >
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>
                        <div
                            className="w-full flex items-center justify-center p-4 bg-[#FBF7F0] rounded-2xl border border-[#EBE0D2]"
                            dangerouslySetInnerHTML={{ __html: activeDiagramSvg }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default VoiceTutorialPage;
