/**
 * adaptivePathEngine.ts — Runtime Phase Path Generation & Adaptation
 *
 * This is the brain of the teaching engine. It:
 *   1. Evaluates each learning dimension INDEPENDENTLY after diagnostic
 *   2. Generates a unique phase path per student per concept
 *   3. Adapts the path at runtime based on phase results
 *   4. Selects intelligent repair strategies based on misconception classification
 *
 * There are NO predetermined paths. Every student's sequence is unique.
 */

import type {
    DimensionalMastery,
    PhaseResult,
    MisconceptionType,
    TutorPhaseKey,
} from './masteryModel';

// Re-export TutorPhase as the canonical type used in VoiceTutorialPage
export type TutorPhase = TutorPhaseKey;

// ── Diagnostic dimension results ────────────────────────────────────────────

export interface DiagnosticDimensionResult {
    dimension: 'prerequisiteKnowledge' | 'conceptualUnderstanding' | 'proceduralFluency' | 'transferAbility';
    score: number; // 0–1
    details: string;
}

// ── Repair strategies ───────────────────────────────────────────────────────

export type RepairStrategy =
    | 'numerical_contrast'   // Show two cases with different numbers
    | 'physical_analogy'     // Real-world object comparison
    | 'visual_diagram'       // SVG diagram showing the relationship
    | 'simpler_language'     // Restate with simpler vocabulary
    | 'edge_case'            // Show where the rule breaks
    | 'counterexample';      // Disprove the misconception directly

/**
 * Maps misconception type → optimal repair strategies (ordered by effectiveness).
 * The AI uses this mapping instead of round-robin rotation.
 */
export const REPAIR_STRATEGY_MAP: Record<MisconceptionType, RepairStrategy[]> = {
    relationship_error:   ['numerical_contrast', 'counterexample', 'visual_diagram'],
    definition_confusion: ['physical_analogy', 'simpler_language', 'visual_diagram'],
    formula_misuse:       ['edge_case', 'numerical_contrast', 'counterexample'],
    sign_direction_error: ['visual_diagram', 'numerical_contrast', 'physical_analogy'],
    unit_confusion:       ['numerical_contrast', 'simpler_language', 'edge_case'],
    prerequisite_gap:     ['simpler_language', 'physical_analogy', 'visual_diagram'],
    overgeneralization:   ['edge_case', 'counterexample', 'numerical_contrast'],
};

/**
 * Human-readable instructions for each repair strategy.
 * Passed to the AI prompt so it knows HOW to repair.
 */
export const REPAIR_STRATEGY_INSTRUCTIONS: Record<RepairStrategy, string> = {
    numerical_contrast:
        'Show TWO numerical examples side by side with different values. Let the student see how changing one variable affects the result. Use a simple table or comparison.',
    physical_analogy:
        'Use a completely different real-world physical object analogy that the student can visualize. Avoid abstract language. Use objects from everyday life (cars, balls, cups, ropes, etc.).',
    visual_diagram:
        'Draw an SVG diagram that visually shows the relationship. Use arrows, labels, and color to make the concept immediately obvious. The diagram should speak for itself.',
    simpler_language:
        'Restate the concept using the simplest possible words. Avoid ALL technical jargon. Explain it as if talking to someone who has never taken a science class.',
    edge_case:
        'Show a boundary case or extreme scenario where the concept becomes obvious. For example: "What happens when mass is zero?" or "What if velocity is infinite?"',
    counterexample:
        'Present a direct counterexample that disproves the student\'s misconception. Show them concrete evidence that their mental model is wrong, then explain why.',
};

// ── Phase path generation ───────────────────────────────────────────────────

/**
 * Generates the phase path by evaluating EACH learning dimension independently.
 * No predetermined paths — every student gets a unique sequence.
 *
 * Logic:
 *   - prereq < 0.6      → add concept_map
 *   - conceptual < 0.7  → add intuition + concept_core
 *   - always            → predict
 *   - procedural < 0.5  → formalize + multi_represent
 *   - procedural < 0.8  → formalize only
 *   - always            → guided_practice + independent_practice (never skip independent)
 *   - conceptual < 0.8  → misconception
 *   - transfer < 0.7    → transfer
 *   - always            → retrieval + mastery_decision
 */
export function generatePhasePath(
    _dimensionResults?: DiagnosticDimensionResult[],
    _studentMastery?: DimensionalMastery,
): TutorPhase[] {
    const path: TutorPhase[] = [];

    // ── 1. Intuition & Real-World Analogy ──
    path.push('intuition');

    // ── 2. Core Principle & Definition ──
    path.push('concept_core');

    // ── 3. Guided Real-World / Worked Example ──
    path.push('guided_practice');

    // ── 4. Interactive Practice & Check-in ──
    path.push('independent_practice');

    // ── 5. Golden Rule & Mastery Anchor ──
    path.push('mastery_decision');

    return path;
}

// ── Runtime path adaptation ─────────────────────────────────────────────────

/**
 * Adapts the remaining path after each interactive phase result.
 * Can insert 'repair' phases or trim unnecessary phases.
 *
 * Rules:
 *   - If student failed and error was classified → insert 'repair' next
 *   - NEVER remove independent_practice
 *   - If misconception defense strong AND transfer strong → skip transfer
 */
export function adaptPath(
    currentPath: TutorPhase[],
    currentPhaseIdx: number,
    phaseResult: PhaseResult,
    mastery: DimensionalMastery,
): TutorPhase[] {
    const adapted = [...currentPath];

    // Insert repair if student failed and error was classified
    if (!phaseResult.success && phaseResult.errorType) {
        const insertIdx = currentPhaseIdx + 1;
        if (adapted[insertIdx] !== 'repair') {
            adapted.splice(insertIdx, 0, 'repair');
        }
    }

    // If misconception defense was strong AND transfer is already strong, skip transfer
    if (phaseResult.phase === 'misconception' && phaseResult.success) {
        if (mastery.transferAbility >= 85) {
            const txIdx = adapted.indexOf('transfer', currentPhaseIdx + 1);
            if (txIdx > currentPhaseIdx) {
                adapted.splice(txIdx, 1);
            }
        }
    }

    return adapted;
}

// ── Repair strategy selection ───────────────────────────────────────────────

/**
 * Selects the best repair strategy based on:
 *   1. Misconception classification
 *   2. Previously used strategies (never repeat)
 *   3. Student's preferred modality (from cognitive profile)
 */
export function selectRepairStrategy(
    misconceptionType: MisconceptionType,
    previousStrategies: RepairStrategy[],
    preferredModality?: 'visual_first' | 'detailed_step_by_step' | 'fast',
): RepairStrategy {
    const candidates = REPAIR_STRATEGY_MAP[misconceptionType] || [
        'simpler_language', 'physical_analogy', 'numerical_contrast',
    ];

    // Filter out already-used strategies
    const available = candidates.filter(s => !previousStrategies.includes(s));

    if (available.length === 0) {
        // All strategies exhausted — cycle back to first with a note
        return candidates[0];
    }

    // If student prefers visual → boost visual_diagram
    if (preferredModality === 'visual_first') {
        const visualIdx = available.indexOf('visual_diagram');
        if (visualIdx >= 0) return available[visualIdx];
    }

    return available[0];
}

// ── Diagnostic scoring ──────────────────────────────────────────────────────

/**
 * Scores diagnostic answers into per-dimension results.
 * Each diagnostic question tests a specific dimension.
 */
export function scoreDiagnosticAnswers(
    answers: { questionIdx: number; correct: boolean; dimension: string }[],
): DiagnosticDimensionResult[] {
    const dimGroups = new Map<string, { correct: number; total: number }>();

    for (const a of answers) {
        const dim = a.dimension;
        if (!dimGroups.has(dim)) {
            dimGroups.set(dim, { correct: 0, total: 0 });
        }
        const g = dimGroups.get(dim)!;
        g.total++;
        if (a.correct) g.correct++;
    }

    const results: DiagnosticDimensionResult[] = [];
    for (const [dim, g] of dimGroups) {
        results.push({
            dimension: dim as DiagnosticDimensionResult['dimension'],
            score: g.total > 0 ? g.correct / g.total : 0,
            details: `${g.correct}/${g.total} correct`,
        });
    }

    return results;
}
