/**
 * masteryModel.ts — 5-Axis Dimensional Mastery with EMA Updates
 *
 * Each concept is tracked across 5 independent dimensions:
 *   1. prerequisiteKnowledge  — from diagnostic phase
 *   2. conceptualUnderstanding — from predict + misconception
 *   3. proceduralFluency       — from guided + independent practice
 *   4. transferAbility         — from transfer phase
 *   5. retrievalStrength       — from retrieval phase
 *
 * Uses Exponential Moving Average (α=0.3) so one bad answer doesn't destroy
 * mastery. Three consecutive correct answers fully recover from one mistake.
 *
 * Difficulty weighting: harder questions contribute more to mastery.
 * Hint penalty: students who need hints get reduced procedural credit.
 */

import type { QuestionDifficulty } from '../types/learningQuestion';
import { difficultyWeight } from '../types/learningQuestion';

// ── Phase result from any interactive phase ──────────────────────────────────
export type TutorPhaseKey =
    | 'diagnostic' | 'concept_map' | 'intuition' | 'concept_core'
    | 'predict' | 'formalize' | 'multi_represent'
    | 'guided_practice' | 'independent_practice'
    | 'misconception' | 'transfer' | 'retrieval'
    | 'mastery_decision' | 'repair' | 'synthesis';

export interface PhaseResult {
    phase: TutorPhaseKey;
    score: number;          // 0–1
    success: boolean;
    errorType?: MisconceptionType | null;
    misconceptionDetail?: string;
    hintsUsed?: number;
    difficulty?: QuestionDifficulty;
}

// ── Misconception classification ─────────────────────────────────────────────
export type MisconceptionType =
    | 'relationship_error'    // "Heavier objects accelerate faster"
    | 'definition_confusion'  // "I don't know what acceleration means"
    | 'formula_misuse'        // Wrong equation selected
    | 'sign_direction_error'  // Forgot vectors / negatives
    | 'unit_confusion'        // Mixed up units
    | 'prerequisite_gap'      // Missing foundational knowledge
    | 'overgeneralization';   // Applied rule outside valid scope

// ── Error tracking ──────────────────────────────────────────────────────────
export interface ErrorRecord {
    type: MisconceptionType;
    count: number;
    lastOccurred: number;
    examples: string[];     // What the student said
    corrections: string[];  // What was correct
}

// ── 5-Axis Dimensional Mastery ──────────────────────────────────────────────
export interface DimensionalMastery {
    prerequisiteKnowledge: number;      // 0–100
    conceptualUnderstanding: number;    // 0–100
    proceduralFluency: number;          // 0–100
    transferAbility: number;            // 0–100
    retrievalStrength: number;          // 0–100

    /** Separate psychological signal — asked directly ("1–5?") */
    selfReportedConfidence?: number;    // 1–5

    errorHistory: ErrorRecord[];
}

/** Fresh mastery profile with no data. */
export function defaultMastery(): DimensionalMastery {
    return {
        prerequisiteKnowledge: 50,
        conceptualUnderstanding: 50,
        proceduralFluency: 50,
        transferAbility: 50,
        retrievalStrength: 50,
        errorHistory: [],
    };
}

// ── EMA helper ──────────────────────────────────────────────────────────────
function ema(oldVal: number, newVal: number, alpha: number): number {
    return alpha * newVal + (1 - alpha) * oldVal;
}

/**
 * Hint penalty factor.
 * 0 hints → 1.0, 1 → 0.85, 2 → 0.70, 3 → 0.55, 4 → 0.40
 */
export function hintPenaltyFactor(hintsUsed: number): number {
    return Math.max(0.4, 1 - hintsUsed * 0.15);
}

// ── Core update function ────────────────────────────────────────────────────
const EMA_ALPHA = 0.3;

/**
 * Updates the mastery model based on a phase result.
 *
 * - Weights by question difficulty (harder → more contribution)
 * - Penalizes procedural fluency based on hints used
 * - Tracks error types for repair targeting
 */
export function updateMastery(
    current: DimensionalMastery,
    result: PhaseResult,
): DimensionalMastery {
    const updated: DimensionalMastery = {
        ...current,
        errorHistory: [...current.errorHistory],
    };

    const dWeight = result.difficulty ? difficultyWeight(result.difficulty) : 0.8;
    const rawWeightedScore = result.score * dWeight * 100;

    switch (result.phase) {
        case 'diagnostic':
            updated.prerequisiteKnowledge =
                ema(current.prerequisiteKnowledge, rawWeightedScore, EMA_ALPHA);
            break;

        case 'predict':
        case 'misconception':
            updated.conceptualUnderstanding =
                ema(current.conceptualUnderstanding, rawWeightedScore, EMA_ALPHA);
            break;

        case 'guided_practice':
        case 'independent_practice': {
            const penalty = result.hintsUsed != null ? hintPenaltyFactor(result.hintsUsed) : 1;
            updated.proceduralFluency =
                ema(current.proceduralFluency, rawWeightedScore * penalty, EMA_ALPHA);
            break;
        }

        case 'transfer':
        case 'synthesis':
            updated.transferAbility =
                ema(current.transferAbility, rawWeightedScore, EMA_ALPHA);
            break;

        case 'retrieval':
            updated.retrievalStrength =
                ema(current.retrievalStrength, rawWeightedScore, EMA_ALPHA);
            break;

        // Presentation-only phases don't update mastery
        default:
            break;
    }

    // Track error types
    if (result.errorType) {
        const existing = updated.errorHistory.find(e => e.type === result.errorType);
        if (existing) {
            existing.count++;
            existing.lastOccurred = Date.now();
            if (result.misconceptionDetail && existing.examples.length < 5) {
                existing.examples.push(result.misconceptionDetail);
            }
        } else {
            updated.errorHistory.push({
                type: result.errorType,
                count: 1,
                lastOccurred: Date.now(),
                examples: result.misconceptionDetail ? [result.misconceptionDetail] : [],
                corrections: [],
            });
        }
    }

    return updated;
}

// ── Mastery narration ───────────────────────────────────────────────────────

/**
 * Generates dimensional narration for voice feedback.
 * e.g. "You understand this concept well, but your calculation procedure
 *       needs more practice."
 */
export function generateMasteryNarration(
    m: DimensionalMastery,
    conceptName: string,
): string {
    const dims = [
        { name: 'conceptual understanding', val: m.conceptualUnderstanding },
        { name: 'calculation procedure', val: m.proceduralFluency },
        { name: 'ability to apply it to new situations', val: m.transferAbility },
        { name: 'ability to recall from memory', val: m.retrievalStrength },
    ];

    const strong = dims.filter(d => d.val >= 80).map(d => d.name);
    const weak   = dims.filter(d => d.val < 70).map(d => d.name);

    let narration = `Let's review your mastery of ${conceptName}. `;

    if (strong.length > 0) {
        narration += `Your ${strong.join(' and ')} ${strong.length === 1 ? 'is' : 'are'} strong. `;
    }
    if (weak.length > 0) {
        narration += `However, your ${weak.join(' and ')} still ${weak.length === 1 ? 'needs' : 'need'} more practice. `;
    }
    if (weak.length === 0 && strong.length > 0) {
        narration += `Excellent — you've demonstrated strong understanding across all dimensions!`;
    }
    if (strong.length === 0 && weak.length === 0) {
        narration += `You're making solid progress across all areas.`;
    }

    return narration;
}

// ── Readiness evaluation ────────────────────────────────────────────────────

export interface ReadinessResult {
    ready: boolean;
    readyToAdvance: boolean;
    weakDimensions: {
        name: string;
        dimension: keyof DimensionalMastery;
        value: number;
        reinforcementPhases: TutorPhaseKey[];
    }[];
}

/**
 * Determines if the student is ready to advance or needs reinforcement.
 * Returns which specific dimensions need work and which phases address them.
 */
export function evaluateReadiness(m: DimensionalMastery): ReadinessResult {
    const threshold = 70;
    const weakDimensions: ReadinessResult['weakDimensions'] = [];

    if (m.conceptualUnderstanding < threshold) {
        weakDimensions.push({
            name: 'conceptual understanding',
            dimension: 'conceptualUnderstanding',
            value: m.conceptualUnderstanding,
            reinforcementPhases: ['repair', 'predict', 'misconception'],
        });
    }
    if (m.proceduralFluency < threshold) {
        weakDimensions.push({
            name: 'procedural fluency',
            dimension: 'proceduralFluency',
            value: m.proceduralFluency,
            reinforcementPhases: ['repair', 'guided_practice', 'independent_practice'],
        });
    }
    if (m.transferAbility < threshold) {
        weakDimensions.push({
            name: 'transfer ability',
            dimension: 'transferAbility',
            value: m.transferAbility,
            reinforcementPhases: ['repair', 'transfer'],
        });
    }
    if (m.retrievalStrength < threshold) {
        weakDimensions.push({
            name: 'retrieval strength',
            dimension: 'retrievalStrength',
            value: m.retrievalStrength,
            reinforcementPhases: ['retrieval'],
        });
    }
    return {
        ready: weakDimensions.length === 0,
        readyToAdvance: weakDimensions.length === 0,
        weakDimensions,
    };
}

/**
 * Convenient helper to update 5-axis mastery based on a single student question answer.
 */
export function updateMasteryOnAnswer(
    current: DimensionalMastery,
    phase: TutorPhaseKey,
    isCorrect: boolean,
    hintsUsed: number = 0,
    difficulty?: QuestionDifficulty,
    errorType?: MisconceptionType | null,
    misconceptionDetail?: string
): DimensionalMastery {
    return updateMastery(current, {
        phase,
        score: isCorrect ? 1.0 : 0.0,
        success: isCorrect,
        hintsUsed,
        difficulty,
        errorType,
        misconceptionDetail,
    });
}
