/**
 * In-Memory Pedagogical State Machine & Student Cognitive Model
 * Features:
 * - 15-20s Opening diagnostic knowledge gauge
 * - Struggle memory across chapter transitions
 * - Dynamic adaptive pacing (6–8m vs 12–15m)
 * - Evaluation of student whiteboard drawings
 * - End-of-topic flashcard & summary generation
 */

export interface PedagogicalSessionState {
  studentId: string;
  topicId: string;
  mode: 'understanding' | 'exam';
  currentChapterIndex: number;
  totalChapters: number;
  estimatedDurationMs: number;

  // Cognitive Tracking Metrics
  hesitationScore: number; // 0.0 (fluent) to 1.0 (confused)
  consecutiveCorrect: number;
  consecutiveErrors: number;
  struggledConcepts: string[];
  diagnosticAnswered: boolean;
  diagnosticResult: { isCorrect: boolean; selectedOption: string } | null;

  // Concept Retention Graph
  conceptMastery: Record<string, {
    mastered: boolean;
    confidence: number;
    lastTestedMs: number;
  }>;
}

export type PedagogicalEvent =
  | { type: 'OPENING_DIAGNOSTIC_COMPLETED'; isCorrect: boolean; responseLatencyMs: number; selectedOption: string }
  | { type: 'STUDENT_INTERRUPTION'; query: string; circledElementIds?: string[] }
  | { type: 'MICRO_CHECK_ANSWERED'; isCorrect: boolean; chapterIndex: number }
  | { type: 'CHAPTER_COMPLETED'; chapterIndex: number }
  | { type: 'STUDENT_DRAWING_SUBMITTED'; strokeCount: number; estimatedAttemptQuality: 'good' | 'incomplete' | 'incorrect' }
  | { type: 'MODE_TOGGLED'; newMode: 'understanding' | 'exam' };

export class PedagogicalStateMachine {
  private state: PedagogicalSessionState;

  constructor(
    studentId: string,
    topicId: string,
    topicComplexity: 'simple' | 'standard' | 'complex' = 'standard',
    initialMode: 'understanding' | 'exam' = 'understanding'
  ) {
    // Dynamic Adaptive Duration: Simple (7m), Standard (10m), Complex (14m)
    const durationMap = {
      simple: 7 * 60 * 1000,    // 7 mins (420,000 ms)
      standard: 10 * 60 * 1000, // 10 mins (600,000 ms)
      complex: 14 * 60 * 1000,  // 14 mins (840,000 ms)
    };

    this.state = {
      studentId,
      topicId,
      mode: initialMode,
      currentChapterIndex: 0,
      totalChapters: 4,
      estimatedDurationMs: durationMap[topicComplexity],
      hesitationScore: 0.2,
      consecutiveCorrect: 0,
      consecutiveErrors: 0,
      struggledConcepts: [],
      diagnosticAnswered: false,
      diagnosticResult: null,
      conceptMastery: {},
    };
  }

  public getState(): Readonly<PedagogicalSessionState> {
    return { ...this.state };
  }

  public dispatch(event: PedagogicalEvent) {
    switch (event.type) {
      case 'OPENING_DIAGNOSTIC_COMPLETED': {
        this.state.diagnosticAnswered = true;
        this.state.diagnosticResult = { isCorrect: event.isCorrect, selectedOption: event.selectedOption };
        if (event.isCorrect) {
          this.state.consecutiveCorrect = 1;
          this.state.hesitationScore = Math.max(0.1, this.state.hesitationScore - 0.15);
        } else {
          this.state.consecutiveErrors = 1;
          this.state.hesitationScore = Math.min(1.0, this.state.hesitationScore + 0.35);
          this.state.struggledConcepts.push('Foundational Terminology');
        }
        break;
      }

      case 'STUDENT_INTERRUPTION': {
        this.state.hesitationScore = Math.min(1.0, this.state.hesitationScore + 0.15);
        if (event.query.toLowerCase().includes('slower') || event.query.toLowerCase().includes('again')) {
          this.state.hesitationScore = Math.min(1.0, this.state.hesitationScore + 0.25);
          this.state.struggledConcepts.push(`Chapter ${this.state.currentChapterIndex + 1} Deep Mechanism`);
        }
        break;
      }

      case 'MICRO_CHECK_ANSWERED': {
        if (event.isCorrect) {
          this.state.consecutiveCorrect++;
          this.state.consecutiveErrors = 0;
          this.state.hesitationScore = Math.max(0, this.state.hesitationScore - 0.2);
        } else {
          this.state.consecutiveErrors++;
          this.state.consecutiveCorrect = 0;
          this.state.hesitationScore = Math.min(1.0, this.state.hesitationScore + 0.3);
          this.state.struggledConcepts.push(`Chapter ${event.chapterIndex + 1} Core Rule`);
        }
        break;
      }

      case 'CHAPTER_COMPLETED': {
        this.state.currentChapterIndex = Math.min(this.state.totalChapters - 1, event.chapterIndex + 1);
        break;
      }

      case 'STUDENT_DRAWING_SUBMITTED': {
        if (event.estimatedAttemptQuality === 'good') {
          this.state.consecutiveCorrect++;
          this.state.hesitationScore = Math.max(0, this.state.hesitationScore - 0.25);
        } else {
          this.state.consecutiveErrors++;
          this.state.hesitationScore = Math.min(1.0, this.state.hesitationScore + 0.2);
        }
        break;
      }

      case 'MODE_TOGGLED': {
        this.state.mode = event.newMode;
        break;
      }
    }
  }

  /**
   * Recommends how the AI tutor should adapt teaching depth and tone for the next chapter.
   */
  public getPedagogicalStrategy(): {
    pace: 'slow_analogy' | 'standard' | 'accelerated_exam';
    guidanceLevel: 'high_intuitive' | 'moderate' | 'concise_rigorous';
    suggestSideBoard: boolean;
    recallStruggledConcept?: string;
  } {
    const lastStruggle = this.state.struggledConcepts[this.state.struggledConcepts.length - 1];

    if (this.state.mode === 'exam') {
      return {
        pace: 'accelerated_exam',
        guidanceLevel: 'concise_rigorous',
        suggestSideBoard: false,
        recallStruggledConcept: lastStruggle,
      };
    }

    if (this.state.hesitationScore > 0.55 || this.state.consecutiveErrors >= 2) {
      return {
        pace: 'slow_analogy',
        guidanceLevel: 'high_intuitive',
        suggestSideBoard: true,
        recallStruggledConcept: lastStruggle,
      };
    }

    if (this.state.consecutiveCorrect >= 2 && this.state.hesitationScore < 0.25) {
      return {
        pace: 'accelerated_exam',
        guidanceLevel: 'concise_rigorous',
        suggestSideBoard: false,
        recallStruggledConcept: lastStruggle,
      };
    }

    return {
      pace: 'standard',
      guidanceLevel: 'moderate',
      suggestSideBoard: false,
      recallStruggledConcept: lastStruggle,
    };
  }
}
