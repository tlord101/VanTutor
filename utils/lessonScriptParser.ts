import { BoardElement } from '../components/tutorial/LiveWhiteboardCanvas';

export interface TimedBoardCue {
  timeMs: number;
  action:
    | 'DRAW_AXES'
    | 'DRAW_CURVE'
    | 'DRAW_ARROW'
    | 'DRAW_STROKE'
    | 'DRAW_TABLE'
    | 'DRAW_TAKEAWAY'
    | 'DRAW_FLOWCHART'
    | 'DRAW_ILLUSTRATION'
    | 'ERASE_AND_REDRAW'
    | 'WRITE_LATEX'
    | 'HIGHLIGHT_FOCUS'
    | 'CLEAR_BOARD';
  data: any;
}

export interface ParsedLessonScript {
  speechText: string;
  topicTitle: string;
  stepNumber: number;
  totalSteps: number;
  mode: 'understanding' | 'exam';
  cues: TimedBoardCue[];
  diagnosticQuestion?: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

/**
 * Parses raw AI tutorial responses into clean spoken narrative and synchronized timed board action cues.
 */
export const parseLessonScript = (rawContent: string): ParsedLessonScript => {
  try {
    // Check if JSON payload is enclosed in markdown code blocks
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : rawContent;
    const parsed = JSON.parse(jsonString);

    return {
      speechText: parsed.speechText || parsed.speech || '',
      topicTitle: parsed.topicTitle || 'Live Tutorial',
      stepNumber: parsed.stepNumber || 1,
      totalSteps: parsed.totalSteps || 3,
      mode: parsed.mode || 'understanding',
      cues: Array.isArray(parsed.cues || parsed.board_actions) ? (parsed.cues || parsed.board_actions) : [],
      diagnosticQuestion: parsed.diagnosticQuestion || undefined,
    };
  } catch (err) {
    // Fallback: convert markdown text into a sequential spoken explanation with auto-timed cues
    const cleanText = rawContent.replace(/```[\s\S]*?```/g, '').trim();
    return {
      speechText: cleanText,
      topicTitle: 'Live Tutorial',
      stepNumber: 1,
      totalSteps: 1,
      mode: 'understanding',
      cues: [
        {
          timeMs: 0,
          action: 'WRITE_LATEX',
          data: { latex: '\\text{Visualizing Concept...}', x: 50, y: 50 }
        }
      ]
    };
  }
};
