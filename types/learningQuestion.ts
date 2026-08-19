/**
 * LearningQuestion — metadata-rich question type used across all interactive phases.
 *
 * Every question the student encounters carries difficulty, skill classification,
 * prerequisite info, and progressive hints so the intelligence layer can:
 *   - Weight mastery contributions by difficulty
 *   - Track which skills are practiced
 *   - Provide scaffolded hints without revealing the answer
 */

export type QuestionDifficulty = 1 | 2 | 3 | 4 | 5;

export type QuestionSkill =
    | 'recall'       // Remember a fact or definition
    | 'concept'      // Explain why something works
    | 'application'  // Apply a formula to a standard problem
    | 'analysis'     // Break down a complex scenario
    | 'transfer';    // Apply knowledge to an unfamiliar context

export type QuestionType = 'multiple_choice' | 'numeric' | 'formula' | 'open_ended';

export interface LearningQuestion {
    /** Unique identifier for this question instance */
    id: string;

    /** The question text (may include LaTeX math) */
    question: string;

    /** The expected correct answer */
    expectedAnswer: string;

    /** Difficulty 1 (easiest) to 5 (hardest) */
    difficulty: QuestionDifficulty;

    /** Bloom's-inspired skill classification */
    skill: QuestionSkill;

    /** Response format */
    type: QuestionType;

    /** Answer options for multiple_choice type */
    options?: string[];

    /** Concepts this question requires understanding of */
    prerequisiteConcepts: string[];

    /**
     * Progressive hints (4 tiers):
     *   [0] Small conceptual clue
     *   [1] Identify relevant principle
     *   [2] Show the equation
     *   [3] Show the first calculation step
     */
    hints: [string, string, string, string];
}

/**
 * Compute the effective difficulty weight for mastery scoring.
 * difficulty 1 → 0.6 weight, difficulty 5 → 1.0 weight
 */
export function difficultyWeight(difficulty: QuestionDifficulty): number {
    return 0.5 + difficulty * 0.1;
}
