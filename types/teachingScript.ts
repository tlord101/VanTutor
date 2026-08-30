/**
 * TeachingScript Architecture Types
 * Defines data structures for Avelut AI Teaching Engine.
 * 
 * The AI generates structured TeachingScripts representing a live lesson performance:
 * Explain -> Visualize -> Demonstrate -> Ask -> Listen -> Clarify -> Continue
 */

export interface Point2D {
  x: number;
  y: number;
  pressure?: number;
}

export type VisualPrimitiveType =
  | 'circle'
  | 'rectangle'
  | 'line'
  | 'arrow'
  | 'axis'
  | 'curve'
  | 'particle'
  | 'atom'
  | 'cell'
  | 'organ'
  | 'circuit'
  | 'graph'
  | 'table'
  | 'formula'
  | 'label'
  | 'custom';

export type BoardActionType =
  | 'draw'
  | 'write'
  | 'label'
  | 'highlight'
  | 'circle'
  | 'underline'
  | 'arrow'
  | 'erase'
  | 'clear'
  | 'zoom'
  | 'pan';

export interface BoardActionSync {
  phrase?: string;          // Spoken phrase that anchors this action
  offsetMs?: number;        // Approximate millisecond offset
  triggerImmediately?: boolean;
}

export interface BoardAction {
  id: string;
  type: BoardActionType;
  target?: string;          // ID or token name of the element being targeted
  content?: string;         // Text, formula, or label content
  from?: string | Point2D;  // Source ID or coordinate
  to?: string | Point2D;    // Destination ID or coordinate
  sync?: BoardActionSync;   // Semantic speech synchronization
  metadata?: {
    primitive?: VisualPrimitiveType;
    x?: number;             // X percentage (0-100) or pixel
    y?: number;             // Y percentage (0-100) or pixel
    width?: number;
    height?: number;
    color?: string;
    style?: string;
    subElements?: string[];
    tableData?: { headers: string[]; rows: string[][] };
    latex?: string;
    workedSteps?: Array<{
      stepNumber: number;
      latex: string;
      explanation?: string;
      highlightTokens?: string[];
      isCalculated?: boolean;
    }>;
    zoomLevel?: number;
    panTarget?: { x: number; y: number };
  };
}

export type TeachingQuestionType =
  | 'recall'
  | 'understanding'
  | 'prediction'
  | 'application'
  | 'comparison'
  | 'explanation'
  | 'step_completion';

export interface TeachingQuestion {
  id: string;
  type: TeachingQuestionType;
  question: string;
  waitForAnswer: boolean;
  expectedConcepts?: string[];
  options?: string[];       // Optional quick-select options for hybrid input
  hint?: string;
}

export interface TeachingSegment {
  lesson: {
    id: string;
    topic: string;
    segmentId: string;
    title: string;
    segmentNumber: number;
    totalEstimatedSegments?: number;
  };
  teaching: {
    objective: string;
    speech: string;
    actions: BoardAction[];
  };
  question?: TeachingQuestion | null;
  next?: {
    type: 'continue' | 'wait_for_answer' | 'completed';
    suggestedNextSegment?: string;
  };
}

export interface StudentAnswerEvaluation {
  isCorrect: boolean;
  score: 'correct' | 'partially_correct' | 'misconception';
  spokenFeedback: string;
  boardActions?: BoardAction[];
  followUpObjective?: string;
}

export interface TeachingSessionSummary {
  topicTitle: string;
  topicId: string;
  completedSegmentsCount: number;
  keyTakeaways: string[];
  formulasCovered: Array<{ formula: string; explanation: string }>;
  diagnosticMastery: {
    questionsAsked: number;
    correctAnswers: number;
    struggledConcepts: string[];
  };
}
