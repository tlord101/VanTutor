/**
 * TeachingScript Architecture Types
 * Defines data structures for Avelut AI Teaching Engine.
 * 
 * The AI generates structured TeachingScripts representing a live lesson performance:
 * Explain -> Visualize on Board -> Derive -> Ask -> Listen -> Erase -> Next Concept
 */

export interface Point2D {
  x: number;
  y: number;
  pressure?: number;
}

export type DiagramPrimitiveType =
  | 'line'
  | 'path'
  | 'circle'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'formula'
  | 'connector'
  | 'group';

export interface DiagramSubElement {
  id: string;
  type: DiagramPrimitiveType;
  position?: { x: number; y: number }; // Relative coordinates inside diagram box (0 to 100)
  size?: { width: number; height: number };
  from?: { x: number; y: number } | string;
  to?: { x: number; y: number } | string;
  points?: Array<{ x: number; y: number }>;
  d?: string;
  radius?: number;
  rx?: number;
  ry?: number;
  content?: string;
  latex?: string;
  label?: string;
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  fontSize?: string | number;
  elements?: DiagramSubElement[];
}

export interface ComposedDiagram {
  id: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  elements: DiagramSubElement[];
}

export type VisualPrimitiveType =
  | 'physics_block'
  | 'physics_force'
  | 'physics_pulley'
  | 'physics_spring'
  | 'physics_wave'
  | 'circuit'
  | 'circuit_resistor'
  | 'circuit_battery'
  | 'chemistry_molecule'
  | 'chemistry_atom'
  | 'chemistry_reaction'
  | 'biology_cell'
  | 'biology_dna'
  | 'biology_neuron'
  | 'graph'
  | 'graph_axes'
  | 'geometry_triangle'
  | 'geometry_circle'
  | 'table'
  | 'formula'
  | 'text'
  | 'custom';

export type BoardActionType =
  | 'write'
  | 'draw'
  | 'arrow'
  | 'label'
  | 'highlight'
  | 'circle'
  | 'underline'
  | 'erase'
  | 'erase_group'
  | 'clear_board'
  | 'retain';

export type ElementPersistence = 'persistent' | 'temporary';

export interface BoardActionSync {
  phrase?: string;          // Spoken phrase that anchors this action
  offsetMs?: number;        // Approximate millisecond offset
  triggerImmediately?: boolean;
}

export interface BoardAction {
  id: string;
  type: BoardActionType;
  groupId?: string;               // Optional logical group ID (e.g. "force_example")
  persistence?: ElementPersistence; // 'persistent' (keeps across concepts) or 'temporary'
  target?: string;                // ID of the element being targeted for highlight/circle/underline
  content?: string;               // Text, formula LaTeX, or label text
  position?: { x: number; y: number }; // Normalized viewport coordinates (0 to 100)
  from?: string | Point2D | { x: number; y: number }; // Source ID or coordinate for arrows
  to?: string | Point2D | { x: number; y: number };   // Destination ID or coordinate for arrows
  direction?: 'right' | 'left' | 'up' | 'down' | 'custom';
  sync?: BoardActionSync;         // Semantic speech synchronization
  metadata?: {
    primitive?: VisualPrimitiveType;
    x?: number;                   // 0-100% normalized safe X
    y?: number;                   // 0-100% normalized safe Y
    width?: number;
    height?: number;
    color?: string;
    style?: string;               // 'chalk' | 'ink' | 'accent' | 'highlight'
    fontSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    subElements?: string[];
    tableData?: { headers: string[]; rows: string[][] };
    latex?: string;
    diagramProps?: Record<string, any>;
    diagram?: ComposedDiagram;
    workedSteps?: Array<{
      stepNumber: number;
      latex: string;
      explanation?: string;
      highlightTokens?: string[];
      isCalculated?: boolean;
    }>;
  };
}

export interface LiveBoardElement {
  id: string;
  groupId?: string;
  persistence: ElementPersistence;
  type: 'text' | 'formula' | 'diagram' | 'arrow' | 'label' | 'table';
  content?: string;
  latex?: string;
  position: { x: number; y: number };
  primitive?: VisualPrimitiveType;
  diagramProps?: Record<string, any>;
  diagram?: ComposedDiagram;
  color?: string;
  fontSize?: string;
  tableData?: { headers: string[]; rows: string[][] };
  highlighted?: boolean;
  circled?: boolean;
  underlined?: boolean;
  progress?: number; // 0 to 1.0 progressive draw animation
  createdAt: number;
}

export interface BoardState {
  elements: Map<string, LiveBoardElement>;
  activeHighlights: Set<string>;
  activeCircles: Set<string>;
  activeUnderlines: Set<string>;
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
    boardTransition?: 'clear_board' | 'retain_persistent' | 'none';
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
