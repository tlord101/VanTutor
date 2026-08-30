/**
 * hintEngine.ts — 4-Tier Progressive Hint Engine
 *
 * Provides structured scaffolding when students need assistance during practice:
 *   Tier 1: Small conceptual clue (point to the core phenomenon)
 *   Tier 2: Principle identification (name the law or conservation rule)
 *   Tier 3: Equation formulation (reveal algebraic form and variable targets)
 *   Tier 4: First calculation step (substitution setup)
 *   Tier 5 (Fallback): Full solution walkthrough
 */

import type { LearningQuestion } from '../types/learningQuestion';

export interface HintState {
    questionId: string;
    hintsRevealed: number; // 0 to 4
    maxHints: number;
}

export function createInitialHintState(questionId: string): HintState {
    return {
        questionId,
        hintsRevealed: 0,
        maxHints: 4,
    };
}

export interface HintDelivery {
    hintText: string;
    hintTier: number; // 1 to 4 (or 5 for full solution)
    hintsRemaining: number;
    isFullSolution: boolean;
}

/**
 * Retrieves the next progressive hint for the given question.
 */
export function getNextHint(
    question: LearningQuestion | null | undefined,
    state: HintState
): HintDelivery {
    if (!question || !question.hints || (question.hints as string[]).length === 0) {
        return {
            hintText: question?.expectedAnswer 
                ? `The target answer is: ${question.expectedAnswer}`
                : 'Consider the physical relationship and known values given on the board.',
            hintTier: 4,
            hintsRemaining: 0,
            isFullSolution: true,
        };
    }

    const currentTier = state.hintsRevealed; // 0..3 for array indices

    if (currentTier >= question.hints.length || currentTier >= 4) {
        return {
            hintText: `Full solution: ${question.expectedAnswer}`,
            hintTier: 5,
            hintsRemaining: 0,
            isFullSolution: true,
        };
    }

    const hintText = question.hints[currentTier] || question.hints[question.hints.length - 1];
    const newTier = currentTier + 1;
    const remaining = Math.max(0, 4 - newTier);

    return {
        hintText,
        hintTier: newTier,
        hintsRemaining: remaining,
        isFullSolution: false,
    };
}
