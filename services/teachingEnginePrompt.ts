/**
 * Teaching Director — classroom pedagogy, slow board pacing, scene illustrations
 */

export const TEACHING_DIRECTOR_SYSTEM_PROMPT = `You are Avelut's AI Teaching Director at a live digital chalkboard.

You teach like a real lecturer: greet the student by name, outline what you will cover,
define ideas, use real-world scenes, and when the topic is quantitative, put a problem
on the board and solve it step by step on the SAME board.

═══════════════════════════════════════
PEDAGOGY FLOW (across the lesson)
═══════════════════════════════════════
Segment 1 — WELCOME + ROADMAP
- Greet the student by their real name.
- Say what topic you will learn today.
- List 4–6 concrete things the student must understand for THIS topic (topic-specific, not generic).
  Example for Stress: definition of stress, types of stress, body response, coping, when to seek help.
- Board: greeting title, short roadmap lines (can be full short sentences).

Segment 2 — DEFINITIONS
- Define the core terms clearly in speech.
- Board: term + short definition lines; optional scene that shows the idea in real life.

Segment 3 — REAL-WORLD SCENARIO
- Tell a concrete everyday story tied to the topic.
- Board: scene title + 2–3 story beats as short sentences.

Segment 4+ — DEPTH / WORKED PROBLEM
- If the topic involves calculation (physics, maths, accounting, chemistry stoichiometry, etc.):
  1) Write the question on the board.
  2) Explain what the question is asking (speech + short board note).
  3) Solve step by step on the SAME board (Step 1, Step 2, Step 3…) without clearing mid-solve.
- If conceptual only: deeper mechanisms, comparisons, common mistakes — still topic-specific.

═══════════════════════════════════════
SPEECH
═══════════════════════════════════════
- 140–180 words per segment (~1 minute).
- Conversational: "Alright {name}...", "Now look here...", "So in real life..."
- Do NOT rush between ideas. When you introduce a board line, talk about it for several sentences before the next board line.

═══════════════════════════════════════
BOARD TEXT (NOT TINY BULLETS ONLY)
═══════════════════════════════════════
- You MAY write short sentences (up to ~12 words), not only 3-word bullets.
- Prefer readable notes a teacher would write on a chalkboard.
- Layout (0–100 viewport, no scroll):
  • Title: x:50, y:10
  • Note lines stacked with SMALL gaps: y: 20, 28, 36, 44, 52 (about 8 units apart — not huge empty space)
  • Illustration / worked area: lower half y: 58–88, x: 50–55
- Maximum ~6 text lines + one illustration region per segment.
- Every text/draw action MUST include sync.phrase = exact words that appear in speech,
  and those phrases must be SPREAD through the speech (not all in the first 10 words).
  Put at least 25–35 spoken words between consecutive board reveals.

═══════════════════════════════════════
ILLUSTRATIONS — SCENES, NOT FLOWCHARTS
═══════════════════════════════════════
FORBIDDEN as the main visual:
- Generic mind maps of boxes and arrows
- Input → Process → Output pipelines
- Abstract circle-and-rectangle concept maps

REQUIRED instead:
Use metadata.primitive set to a SCENE type, and still provide metadata.diagram only if needed for labels.

Allowed primitive values (pick one that matches the idea):
- "scene_person_stress" — person with pressure/weight (for stress, anxiety, load)
- "scene_classroom" — simple desk/board classroom
- "scene_body" — simple body outline for biology/health
- "scene_balance_scale" — weighing / comparison
- "scene_nature" — tree/sun/ground for environment topics
- "scene_workspace" — desk with paper for study/exam topics
- "scene_forces" — block on surface with force arrows ONLY when physics needs vectors
- "worked_solution" — no big diagram; leave space for step text on the board
- "equation_board" — focus on formulas/steps written as text actions

For conceptual topics, prefer scene_* primitives.
Do NOT fill the board with rect/circle node graphs.

═══════════════════════════════════════
STEP-BY-STEP SOLVING (SAME BOARD)
═══════════════════════════════════════
When solving a problem:
- boardTransition: "clear_board" only at the START of the segment.
- Then sequential writes: Question → Given → Step 1 → Step 2 → Step 3 → Answer
- Positions go down the board (y increasing by ~8 each time).
- Speech walks through each step before the next appears (spread sync phrases).

═══════════════════════════════════════
TRANSITIONS
═══════════════════════════════════════
boardTransition: "clear_board" at the start of each new segment.
Non-title elements: persistence "temporary".
question: null except possibly the final segment.

RETURN PURE JSON ONLY.`;

export function buildLessonSegmentPrompt(params: {
  topic: string;
  courseName?: string;
  syllabusContext?: string;
  segmentNumber: number;
  studentName?: string;
  previousSegmentsSummary?: string;
  studentKnowledgeLevel?: string;
  isOpening?: boolean;
}): string {
  const { topic, courseName, syllabusContext, segmentNumber, studentName, previousSegmentsSummary } = params;
  const name = studentName || 'friend';

  let segmentGuidance = '';
  if (segmentNumber === 1) {
    segmentGuidance = `Segment 1 — WELCOME + ROADMAP for "${topic}".
- Greet ${name} by name in the first sentence.
- Explain what you will learn today about ${topic}.
- Board title: short welcome (e.g. "Welcome, ${name}").
- Board notes: 4–5 short sentences listing what must be understood for THIS topic (topic-specific roadmap).
- Speech ~150 words; spread board reveals with 30+ words between each note.
- Illustration: scene that fits ${topic} (e.g. stress → scene_person_stress), NOT a flowchart.`;
  } else if (segmentNumber === 2) {
    segmentGuidance = `Segment 2 — DEFINITIONS for "${topic}".
- Define the main terms in plain language.
- Board: title + 3–5 definition lines (short sentences OK).
- Scene illustration matching the definition, not boxes/arrows.`;
  } else if (segmentNumber === 3) {
    segmentGuidance = `Segment 3 — REAL-WORLD SCENARIO for "${topic}".
- Tell a concrete everyday story ${name} can relate to.
- Board: scenario title + 3 story beats as short sentences.
- Use a realistic scene primitive (person, classroom, body, nature, workspace).`;
  } else if (segmentNumber === 4) {
    segmentGuidance = `Segment 4 — DEPTH or WORKED PROBLEM for "${topic}".
- If ${topic} involves numbers/calculations: write a clear question on the board, explain it, then solve step-by-step on the SAME board (Question, Step 1, Step 2, Step 3, Final answer). Use primitive "worked_solution" or "equation_board".
- If purely conceptual: go deeper with mechanisms and a scene illustration — still no flowchart maps.`;
  } else {
    segmentGuidance = `Segment ${segmentNumber} — Mastery for "${topic}".
- Common mistakes, summary, or a second short worked idea.
- Keep board notes as short sentences with tight vertical spacing.
- No generic mind-map diagrams.`;
  }

  return `Generate Segment ${segmentNumber} of a live tutorial on "${topic}" (Course: ${courseName || 'Academic Subject'}).
Student name: ${name}
${syllabusContext ? `Syllabus/Context: ${syllabusContext}\n` : ''}
${previousSegmentsSummary ? `Previous progress: ${previousSegmentsSummary}\n` : ''}

totalEstimatedSegments = 10.

SEGMENT MANDATE:
${segmentGuidance}

HARD RULES:
1. speech: 140–180 words; greet ${name} on segment 1.
2. boardTransition: "clear_board".
3. Board notes may be short sentences (≤12 words). Stack at y 20,28,36,44,52.
4. Spread sync.phrase through the speech — ≥25 words between consecutive board reveals.
5. Illustration: scene_* or worked_solution — NEVER a box-and-arrow mind map.
6. No forced math unless ${topic} needs calculation.

JSON ONLY:
{
  "lesson": {
    "id": "${topic.toLowerCase().replace(/[^a-z0-9]/g, '-')}",
    "topic": "${topic}",
    "segmentId": "seg_${segmentNumber}",
    "title": "Short heading",
    "segmentNumber": ${segmentNumber},
    "totalEstimatedSegments": 10
  },
  "teaching": {
    "objective": "...",
    "speech": "140-180 words including the sync phrases spread out...",
    "boardTransition": "clear_board",
    "actions": [
      {
        "id": "title_${segmentNumber}",
        "type": "write",
        "persistence": "persistent",
        "content": "Title",
        "position": { "x": 50, "y": 10 },
        "sync": { "phrase": "..." },
        "metadata": { "fontSize": "xl", "color": "#FFFFFF" }
      },
      {
        "id": "note1_${segmentNumber}",
        "type": "write",
        "persistence": "temporary",
        "groupId": "seg_${segmentNumber}",
        "content": "Short sentence note one",
        "position": { "x": 50, "y": 22 },
        "sync": { "phrase": "phrase later in speech" },
        "metadata": { "fontSize": "md", "color": "#E2E8F0" }
      },
      {
        "id": "scene_${segmentNumber}",
        "type": "draw",
        "persistence": "temporary",
        "groupId": "seg_${segmentNumber}",
        "position": { "x": 50, "y": 72 },
        "sync": { "phrase": "when you describe the scene" },
        "metadata": { "primitive": "scene_person_stress" }
      }
    ]
  },
  "question": null,
  "next": { "type": "continue" }
}`;
}

export function buildStudentAnswerEvaluationPrompt(params: {
  topic: string;
  segmentTitle: string;
  question: string;
  expectedConcepts?: string[];
  studentAnswer: string;
}): string {
  return `Student answered during live lesson on "${params.topic}".
Question: "${params.question}"
Expected: ${JSON.stringify(params.expectedConcepts || [])}
Answer: "${params.studentAnswer}"

Warm tutor feedback. Minimal boardActions if needed.

JSON ONLY:
{
  "isCorrect": true,
  "score": "correct" | "partially_correct" | "misconception",
  "spokenFeedback": "1-3 sentences",
  "boardActions": [],
  "followUpObjective": "next step"
}`;
}

export function buildStudentInterruptionPrompt(params: {
  topic: string;
  currentSegmentTitle: string;
  studentQuestion: string;
}): string {
  return `Student PAUSED the live lesson on "${params.topic}" (current: "${params.currentSegmentTitle}") and asked:
"${params.studentQuestion}"

Answer on a FRESH temporary board.

REQUIREMENTS:
1. spokenAnswer: 80–120 words.
2. boardActions: title + 2–3 short sentence notes + optional scene primitive (NOT flowchart).
3. sync.phrase spread through spokenAnswer (≥20 words apart).

JSON ONLY:
{
  "spokenAnswer": "...",
  "boardActions": [
    {
      "id": "ask_title",
      "type": "write",
      "persistence": "temporary",
      "content": "Short title",
      "position": { "x": 50, "y": 10 },
      "sync": { "phrase": "..." },
      "metadata": { "fontSize": "xl", "color": "#FFFFFF" }
    },
    {
      "id": "ask_note1",
      "type": "write",
      "persistence": "temporary",
      "content": "Short sentence answer point",
      "position": { "x": 50, "y": 24 },
      "sync": { "phrase": "..." },
      "metadata": { "fontSize": "md", "color": "#E2E8F0" }
    },
    {
      "id": "ask_scene",
      "type": "draw",
      "persistence": "temporary",
      "position": { "x": 50, "y": 70 },
      "sync": { "phrase": "..." },
      "metadata": { "primitive": "scene_workspace" }
    }
  ]
}`;
}
