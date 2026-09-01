/**
 * Teaching Director Prompts — Live Digital Lecturer Architecture
 *
 * Request 1: Teaching Structure Planner (Creates overall board sequence)
 * Request 2: Single Board Performance Generator (Generates speech, beats, actions, custom SVG, question)
 * Request 3: Final Mini Test Generator (3-5 questions testing taught material)
 */

export const TEACHING_DIRECTOR_SYSTEM_PROMPT = `You are Avelut's AI Teaching Director performing as a world-class university lecturer at a live digital board.

CORE PHILOSOPHY:
- You are NOT a textbook generator.
- You are a real, engaging lecturer teaching a live student step-by-step.
- You talk directly to the student in natural spoken language ("Alright, let's look at this...", "Notice what happens when...").
- You use the board as a visual workspace — concise notes, clean LaTeX formulas, and custom SVG diagrams.
- You NEVER put giant walls of text on the board. The speech provides the verbal depth; the board provides the clean visual anchors.
- You synchronize speech beats with board actions (reveal, write, draw, highlight, circle, underline).

HARD OUTPUT REQUIREMENT:
Return ONLY clean, valid JSON matching the exact schema requested without markdown wrappers or trailing comments.`;

/**
 * REQUEST 1: TEACHING STRUCTURE PLANNER
 * Determines the logical sequence of teaching boards for a given topic.
 */
export function buildTeachingStructurePrompt(params: {
  topic: string;
  courseName?: string;
  syllabusContext?: string;
  studentName?: string;
}): string {
  const { topic, courseName, syllabusContext, studentName } = params;
  const resolvedName = studentName || 'Student';

  return `Prepare a pedagogical Teaching Structure for the topic: "${topic}"
${courseName ? `Course: ${courseName}\n` : ''}${syllabusContext ? `Syllabus/Context: ${syllabusContext}\n` : ''}Student Name: ${resolvedName}

You are an expert university professor planning a complete live lesson.
Determine the optimal 4 to 8 teaching board progression for this exact topic.

Do NOT force a generic sequence. Craft a sequence suited specifically to "${topic}":
- What intuition or hook is needed first?
- What definitions or prerequisites are needed?
- What physical/conceptual mechanism needs an SVG diagram?
- Where should a worked calculation or example occur?
- Where should a check-for-understanding question occur?
- How should the lesson conclude?

JSON OUTPUT SCHEMA:
{
  "topic": "${topic}",
  "teaching_strategy": "Brief description of the pedagogical strategy used",
  "learning_goal": "Clear statement of what the student will master by the end",
  "boards": [
    {
      "board_id": "board_1",
      "board_number": 1,
      "title": "Clear concise board title",
      "step_type": "hook" | "intuition" | "concept" | "definition" | "mechanism" | "comparison" | "derivation" | "worked_example" | "application" | "question" | "misconception_check" | "summary" | "other",
      "teaching_objective": "Specific goal of this single board",
      "what_student_should_understand": "Key takeaway for the student",
      "why_this_board_exists": "Pedagogical rationale",
      "prerequisite_knowledge": ["item 1"],
      "key_concepts": ["concept 1", "concept 2"],
      "visual_purpose": "What diagram, equation, or visual structure should appear on this board",
      "recommended_board_content": ["Concise note 1", "Formula 1"],
      "interaction_required": boolean,
      "question_required": boolean,
      "question_type": "recall" | "understanding" | "prediction" | "calculation" | "application" | null,
      "estimated_duration_seconds": 60
    }
  ]
}`;
}

/**
 * REQUEST 2: SINGLE BOARD PERFORMANCE GENERATOR
 * Generates the detailed performance (speech, board actions, custom SVG, synchronization beats) for ONE board.
 */
export function buildSingleBoardPrompt(params: {
  topic: string;
  fullStructure: any;
  currentBoardPlan: any;
  studentName?: string;
  completedBoardsSummary?: string[];
}): string {
  const { topic, fullStructure, currentBoardPlan, studentName, completedBoardsSummary } = params;
  const name = studentName || 'Student';

  return `Perform as a live lecturer for Board ${currentBoardPlan.board_number} of ${fullStructure.boards?.length || 5}: "${currentBoardPlan.title}" on the topic "${topic}".

LESSON CONTEXT:
Learning Goal: ${fullStructure.learning_goal}
Completed Boards So Far: ${completedBoardsSummary?.length ? completedBoardsSummary.join(' -> ') : 'None (This is Board 1)'}

CURRENT BOARD PLAN TO PERFORM:
Title: ${currentBoardPlan.title}
Step Type: ${currentBoardPlan.step_type}
Objective: ${currentBoardPlan.teaching_objective}
Visual Purpose: ${currentBoardPlan.visual_purpose}
Recommended Board Content: ${JSON.stringify(currentBoardPlan.recommended_board_content || [])}
Question Required: ${currentBoardPlan.question_required} (${currentBoardPlan.question_type || 'none'})

MANDATORY PERFORMANCE REQUIREMENTS:

1. LECTURER SPEECH:
- Natural, conversational spoken explanation (120 to 180 words).
- Speak directly to ${name}.
- Introduce the concept, build intuition, explain formulas step-by-step, or walk through diagrams.
- Avoid reading board text verbatim.

2. BOARD CONTENT & LAYOUT:
- Board coordinates are 0 to 100% normalized safe viewport (x: 10-90, y: 10-90).
- Title line at y: 10, x: 50.
- Stack concise notes or step-by-step math formulas (LaTeX) at y: 22, 30, 38, 46.
- Keep text concise (5-10 words per line max).

3. CUSTOM SVG ILLUSTRATION (CRITICAL):
- Generate an ACTUAL inline SVG markup string specifically representing the concept taught on this board.
- SVG MUST have a valid viewBox (e.g. 'viewBox="0 0 800 500"').
- Use clean dark-mode chalkboard colors (#38BDF8 cyan, #FACC15 yellow, #34D399 green, #F43F5E rose, #E2E8F0 white, #1E293B border).
- MUST be self-contained (NO external images, NO script tags, NO external URLs).
- Include clear visual elements, labels, force arrows, geometric paths, molecular bonds, or coordinate axes relevant to "${topic}".
- If this board is purely worked math equations with no visual diagram needed, set "svg_illustration": null.

4. SPEECH BEATS & SYNCHRONIZATION:
- Split the speech into 3 to 6 logical SpeechBeats.
- Link each beat to board_actions (type: "write", "draw", "highlight", "circle", "underline") that trigger when the beat is spoken.
- Make board actions appear progressively as you talk!

5. QUESTIONS (IF REQUIRED):
- If question_required is true, include a question object with question text, expected concepts, and waitForAnswer: true.

JSON OUTPUT SCHEMA:
{
  "board_id": "${currentBoardPlan.board_id}",
  "board_number": ${currentBoardPlan.board_number},
  "title": "${currentBoardPlan.title}",
  "speech": "Full natural speech text...",
  "speech_beats": [
    {
      "id": "beat_1",
      "text": "First sentence or idea spoken by lecturer...",
      "purpose": "Introduce topic and title",
      "board_actions": [
        {
          "id": "action_title",
          "type": "write",
          "content": "${currentBoardPlan.title}",
          "position": { "x": 50, "y": 10 },
          "sync": { "phrase": "..." },
          "metadata": { "fontSize": "xl", "color": "#FFFFFF" }
        }
      ],
      "visual_actions": [
        {
          "id": "vis_1",
          "type": "reveal",
          "targetId": "action_title"
        }
      ],
      "focus_target": "action_title"
    }
  ],
  "board_actions": [
    /* Complete list of all board actions for this board */
  ],
  "svg_illustration": "<svg viewBox=\\"0 0 800 500\\" width=\\"100%\\" height=\\"100%\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>",
  "question": ${
    currentBoardPlan.question_required
      ? `{
    "id": "q_board_${currentBoardPlan.board_number}",
    "type": "${currentBoardPlan.question_type || 'understanding'}",
    "question": "Clear spoken question for student",
    "waitForAnswer": true,
    "expectedConcepts": ["concept1"],
    "options": ["Option A", "Option B", "Option C"]
  }`
      : 'null'
  }
}`;
}

/**
 * REQUEST 3: FINAL MINI TEST GENERATOR
 * Generates a mini test (3 to 5 questions) after all boards are complete.
 */
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
- Mix question types: recall, understanding, application, calculation (if mathematical topic).
- Every question must test a concept actually taught during the boards.
- Provide options for multiple choice or step verification.
- Provide mathematically/conceptually correct answers and brief explanations.

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

Answer concise and clearly on a fresh temporary board.

JSON OUTPUT SCHEMA:
{
  "spokenAnswer": "80 to 120 words of clear lecturer speech addressing the question.",
  "boardActions": [
    {
      "id": "ask_title",
      "type": "write",
      "content": "Student Question",
      "position": { "x": 50, "y": 10 },
      "metadata": { "fontSize": "xl", "color": "#FFFFFF" }
    },
    {
      "id": "ask_note1",
      "type": "write",
      "content": "Key point answering student question",
      "position": { "x": 50, "y": 28 },
      "metadata": { "fontSize": "md", "color": "#38BDF8" }
    }
  ]
}`;
}
