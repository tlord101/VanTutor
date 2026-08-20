/**
 * difficultyController.ts — Dynamic Difficulty Adaptation Engine
 *
 * Adjusts question difficulty on a scale from 1 (fundamental intuition) to 5 (advanced synthesis/application).
 *
 * Adaptation Rules:
 *   - 2 consecutive correct answers without hints -> Increase difficulty level (+1)
 *   - 2 consecutive errors -> Decrease difficulty level (-1) and flag for repair/reinforcement
 *   - Correct answers requiring multiple hints reset the streak without boosting difficulty
 */

import type { QuestionDifficulty } from '../types/learningQuestion';

export interface DifficultyRecord {
    difficulty: QuestionDifficulty;
    correct: boolean;
    hintsUsed: number;
    timestamp: number;
}

export interface DifficultyState {
    currentLevel: QuestionDifficulty;
    consecutiveCorrect: number;
    consecutiveIncorrect: number;
    history: DifficultyRecord[];
}

export function createInitialDifficultyState(startingLevel: QuestionDifficulty = 2): DifficultyState {
    return {
        currentLevel: startingLevel,
        consecutiveCorrect: 0,
        consecutiveIncorrect: 0,
        history: [],
    };
}

/**
 * Adjusts the current difficulty state based on recent student question execution.
 */
export function recordQuestionPerformance(
    state: any,
    performanceOrCorrect: boolean | { correct: boolean; hintsUsed?: number },
    hintsUsedArg: boolean | number = 0,
    _difficulty?: QuestionDifficulty
): DifficultyState {
    const rawState = state?.newState || state || {};
    let newLevel: QuestionDifficulty = typeof rawState.currentLevel === 'number' ? rawState.currentLevel : 2;
    let consecutiveCorrect = typeof rawState.consecutiveCorrect === 'number' ? rawState.consecutiveCorrect : 0;
    let consecutiveIncorrect = typeof rawState.consecutiveIncorrect === 'number' ? rawState.consecutiveIncorrect : 0;
    const history: DifficultyRecord[] = Array.isArray(rawState.history) ? rawState.history : [];

    let correct: boolean;
    let hintsUsed: number;

    if (typeof performanceOrCorrect === 'object' && performanceOrCorrect !== null) {
        correct = Boolean(performanceOrCorrect.correct);
        hintsUsed = typeof performanceOrCorrect.hintsUsed === 'number' ? performanceOrCorrect.hintsUsed : 0;
    } else {
        correct = Boolean(performanceOrCorrect);
        hintsUsed = typeof hintsUsedArg === 'number' ? hintsUsedArg : (hintsUsedArg ? 1 : 0);
    }

    const historyRecord: DifficultyRecord = {
        difficulty: newLevel,
        correct,
        hintsUsed,
        timestamp: Date.now(),
    };

    if (correct) {
        consecutiveIncorrect = 0;
        // Only count towards difficulty promotion if solved independently (0 or 1 minor hint)
        if (hintsUsed <= 1) {
            consecutiveCorrect += 1;
            if (consecutiveCorrect >= 2 && newLevel < 5) {
                newLevel = (newLevel + 1) as QuestionDifficulty;
                consecutiveCorrect = 0;
            }
        } else {
            consecutiveCorrect = 0;
        }
    } else {
        consecutiveCorrect = 0;
        consecutiveIncorrect += 1;
        if (consecutiveIncorrect >= 2 && newLevel > 1) {
            newLevel = (newLevel - 1) as QuestionDifficulty;
            consecutiveIncorrect = 0;
        }
    }

    return {
        currentLevel: newLevel,
        consecutiveCorrect,
        consecutiveIncorrect,
        history: [...history.slice(-19), historyRecord],
    };
}
