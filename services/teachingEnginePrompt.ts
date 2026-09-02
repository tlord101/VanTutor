/**
 * Teaching Director Prompts — Live Digital Lecturer Architecture
 * Duration modes: 15 / 30 / 60 with distinct mechanisms.
 * Board: illustration-first via path commands; text secondary; large readable type.
 */

import type { LessonDurationMode } from '../components/tutorial/LessonDurationModal';
import { getDurationProfile } from './durationTeachingProfiles';

export const TEACHING_DIRECTOR_SYSTEM_PROMPT = `You are Avelut's AI Teaching Director performing as a world-class university lecturer at a live digital chalkboard.

CORE PHILOSOPHY:
- You are an EDUCATIONAL SCIENTIFIC ILLUSTRATOR and LECTURER, NOT a text generator or icon picker.
- You talk directly to the student in natural spoken language.
- BOARD PRIORITY: illustrations first (drawn with path/line/arrow/circle commands). Text is secondary — short titles, bullets, definitions, or one worked line/formula.
- NEVER put giant walls of text on the board. Speech carries verbal depth.
- Do NOT use predefined diagram primitives (no physics_block, scene_classroom, etc.). Compose scenes from path commands or optional full SVG.
- Synchronize speech beats with progressive board drawing.

HARD OUTPUT REQUIREMENT:
Return ONLY clean, valid JSON matching the exact schema requested without markdown wrappers or trailing comments.`;

export function buildTeachingStructurePrompt(params: {
  topic: string;
  courseName?: string;
  syllabusContext?: string;
  studentName?: string;
  durationMode?: LessonDurationMode;
}): string {
  const { topic, courseName, syllabusContext, studentName, durationMode = 30 } = params;
  const resolvedName = studentName || 'Student';
  const profile = getDurationProfile(durationMode);

  return `Prepare a pedagogical Teaching Structure for the topic: "${topic}"
${courseName ? `Course: ${courseName}\n` : ''}${syllabusContext ? `Syllabus/Context: ${syllabusContext}\n` : ''}Student Name: ${resolvedName}
TARGET DURATION MODE: ${durationMode} minutes

You are an expert university professor planning a live lesson for ~${durationMode} minutes of content.

BOARD COUNT: ${profile.boardCountHint}

Do NOT force a generic sequence. Craft a sequence suited specifically to "${topic}".

${profile.structureExtra}

${durationMode === 60 ? `For 60-minute mode: organize boards into chapters (put chapter in titles). Include natural break-friendly boards. The student may pause and resume later.` : ''}

JSON OUTPUT SCHEMA:
{
  "topic": "${topic}",
  "teaching_strategy": "Brief description including duration mode ${durationMode}m",
  "learning_goal": "Clear statement of what the student will master by the end",
  "duration_minutes": ${durationMode},
  "chapters": ["optional chapter titles for 30/60 mode"],
  "boards": [
    {
      "board_id": "board_1",
      "board_number": 1,
      "title": "Clear concise board title",
      "chapter": "optional chapter name",
      "step_type": "hook" | "intuition" | "concept" | "definition" | "mechanism" | "comparison" | "derivation" | "worked_example" | "application" | "question" | "misconception_check" | "summary" | "other",
      "teaching_objective": "Specific goal of this single board",
      "what_student_should_understand": "Key takeaway for the student",
      "why_this_board_exists": "Pedagogical rationale",
      "prerequisite_knowledge": ["item 1"],
      "key_concepts": ["concept 1", "concept 2"],
      "visual_purpose": "What should be DRAWN with paths/arrows on this board",
      "recommended_board_content": ["Short note or formula only"],
      "interaction_required": boolean,
      "question_required": boolean,
      "question_type": "recall" | "understanding" | "prediction" | "calculation" | "application" | null,
      "estimated_duration_seconds": 60
    }
  ]
}`;
}

export function buildSingleBoardPrompt(params: {
  topic: string;
  fullStructure: any;
  currentBoardPlan: any;
  studentName?: string;
  completedBoardsSummary?: string[];
  durationMode?: LessonDurationMode;
}): string {
  const {
    topic,
    fullStructure,
    currentBoardPlan,
    studentName,
    completedBoardsSummary,
    durationMode = 30,
  } = params;
  const name = studentName || 'Student';
  const profile = getDurationProfile(durationMode);

  return `Perform as a live university lecturer for Board ${currentBoardPlan.board_number} of ${fullStructure.boards?.length || 5}: "${currentBoardPlan.title}" on the topic "${topic}".

DURATION MODE: ${durationMode} minutes
TONE: ${profile.toneRules}
PACING: ${profile.pacingRules}
SPEECH LENGTH: ${profile.speechWordRange}

LESSON CONTEXT:
Learning Goal: ${fullStructure.learning_goal}
Completed Boards So Far: ${completedBoardsSummary?.length ? completedBoardsSummary.join(' -> ') : 'None (This is Board 1)'}

CURRENT BOARD PLAN TO PERFORM:
Title: ${currentBoardPlan.title}
Chapter: ${currentBoardPlan.chapter || 'n/a'}
Step Type: ${currentBoardPlan.step_type}
Objective: ${currentBoardPlan.teaching_objective}
Visual Purpose: ${currentBoardPlan.visual_purpose}
Recommended Board Content: ${JSON.stringify(currentBoardPlan.recommended_board_content || [])}
Question Required: ${currentBoardPlan.question_required} (${currentBoardPlan.question_type || 'none'})

MANDATORY PERFORMANCE REQUIREMENTS:

1. LECTURER SPEECH:
- Natural speech (${profile.speechWordRange}).
- Address ${name} when appropriate.
- Explain step-by-step; do NOT read board text verbatim.
${profile.boardExtra}

2. BOARD CONTENT — ILLUSTRATION FIRST, TEXT SECONDARY:
- Coordinates 0 to 100% viewport (x: 10-90, y: 8-90).
- PRIMARY: draw with path/line/arrow/circle board_actions (progressive strokes).
- SECONDARY text only: title, short bullets/definitions, or one worked formula.
- Use LARGE fontSize metadata: titles "2xl" or "3xl", body "xl" or "2xl", formulas "3xl".
- NO predefined primitives (no physics_block, scene_*, etc.).

3. PATH DRAWING LANGUAGE (preferred over full SVG):
board_actions type "draw" with metadata:
{
  "drawType": "path" | "line" | "circle" | "arrow",
  "d": "M20 50 L40 50 L40 70 L20 70 Z",  // for path, normalized 0-100 coords in path numbers
  "x1","y1","x2","y2": numbers,  // for line/arrow
  "cx","cy","r": numbers,       // for circle
  "label": "optional",
  "color": "#38BDF8",
  "strokeWidth": 2.5,
  "durationMs": 800,
  "fill": "optional"
}
Optional svg_illustration full SVG only if a complex scene cannot be expressed as paths.
Give progressive reveals via speech_beats board_actions order (illustration before or after text as teaching needs).

4. SPEECH BEATS:
- Break speech into beats with board_actions attached (draw/write/highlight).
- mannerism: attention | emphasis | transition | reflection_pause | encouragement | check_understanding | null
- pauseAfterMs for reflection (especially ${durationMode === 60 ? '8000-25000 on 60m mode' : '1000-4000'})

JSON OUTPUT SCHEMA:
{
  "board_id": "${currentBoardPlan.board_id}",
  "board_number": ${currentBoardPlan.board_number},
  "title": "${currentBoardPlan.title}",
  "speech": "Full natural speech...",
  "speech_beats": [
    {
      "id": "beat_1",
      "text": "First spoken chunk...",
      "purpose": "...",
      "mannerism": "attention",
      "pauseAfterMs": 2000,
      "board_actions": [
        {
          "id": "draw_main",
          "type": "draw",
          "position": { "x": 50, "y": 55 },
          "sync": { "phrase": "..." },
          "metadata": {
            "drawType": "path",
            "d": "M30 40 L70 40 L70 70 L30 70 Z",
            "color": "#E2E8F0",
            "durationMs": 900
          }
        }
      ],
      "visual_actions": [],
      "focus_target": null
    }
  ],
  "board_actions": [],
  "svg_illustration": null,
  "question": ${currentBoardPlan.question_required
    ? `{
    "id": "q_board_${currentBoardPlan.board_number}",
    "type": "${currentBoardPlan.question_type || 'understanding'}",
    "question": "Clear spoken question",
    "waitForAnswer": true,
    "expectedConcepts": ["concept1"],
    "options": ["Option A", "Option B", "Option C"]
  }`
    : 'null'}
}`;
}

export function buildFinalTestPrompt(params: {
  topic: string;
  teachingStructure: any;
}): string {
  const { topic, teachingStructure } = params;

  return `Generate a final mini assessment for the topic "${topic}" based strictly on the material taught in the lesson structure:
Learning Goal: ${teachingStructure.learning_goal}
Boards Taught: ${JSON.stringify(teachingStructure.boards?.map((b: any) => b.title) || [])}

RULES:
- Generate 3 to 5 clear, high-quality questions.
- Mix question types: recall, understanding, application, calculation.
- Provide multiple-choice options with correct answers and brief explanations.

JSON OUTPUT SCHEMA:
{
  "topic": "${topic}",
  "questions": [
    {
      "id": "test_q1",
      "type": "understanding" | "recall" | "application" | "calculation",
      "question": "Question text...",
      "options": ["A) Choice 1", "B) Choice 2", "C) Choice 3", "D) Choice 4"],
      "correctAnswer": "A) Choice 1",
      "explanation": "Clear explanation of why this answer is correct."
    }
  ]
}`;
}

export function buildStudentAnswerEvaluationPrompt(params: {
  topic: string;
  boardTitle: string;
  question: string;
  expectedConcepts?: string[];
  studentAnswer: string;
}): string {
  return `Student answered a question during live lesson on "${params.topic}" (Board: "${params.boardTitle}").
Question: "${params.question}"
Expected Concepts: ${JSON.stringify(params.expectedConcepts || [])}
Student's Answer: "${params.studentAnswer}"

Provide encouraging, concise lecturer feedback.

JSON OUTPUT SCHEMA:
{
  "isCorrect": boolean,
  "score": "correct" | "partially_correct" | "misconception",
  "spokenFeedback": "1 to 3 warm lecturer sentences addressing the student's answer",
  "boardActions": [],
  "followUpObjective": "brief next step"
}`;
}

export function buildStudentInterruptionPrompt(params: {
  topic: string;
  currentBoardTitle: string;
  studentQuestion: string;
}): string {
  return `Student asked a question while pausing live lesson on "${params.topic}" (Board: "${params.currentBoardTitle}"):
"${params.studentQuestion}"

Answer concise and clearly on a fresh temporary board. Prefer short text + simple path draws if helpful.

JSON OUTPUT SCHEMA:
{
  "spokenAnswer": "80 to 120 words of clear lecturer speech addressing the question.",
  "boardActions": [
    {
      "id": "ask_title",
      "type": "write",
      "content": "Student Question",
      "position": { "x": 50, "y": 10 },
      "metadata": { "fontSize": "2xl", "color": "#FFFFFF" }
    }
  ]
}`;
}
