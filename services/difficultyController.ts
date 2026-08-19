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
    state: DifficultyState,
    performance: { correct: boolean; hintsUsed: number }
): { newState: DifficultyState; levelChanged: 'increased' | 'decreased' | 'unchanged' } {
    const { correct, hintsUsed } = performance;
    let newLevel = state.currentLevel;
    let consecutiveCorrect = state.consecutiveCorrect;
    let consecutiveIncorrect = state.consecutiveIncorrect;
    let levelChanged: 'increased' | 'decreased' | 'unchanged' = 'unchanged';

    const historyRecord: DifficultyRecord = {
        difficulty: state.currentLevel,
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
                levelChanged = 'increased';
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
            levelChanged = 'decreased';
        }
    }

    const newState: DifficultyState = {
        currentLevel: newLevel,
        consecutiveCorrect,
        consecutiveIncorrect,
        history: [...state.history.slice(-19), historyRecord],
    };

    return { newState, levelChanged };
}
