/**
 * Teaching Director Prompt & Cognitive Framework for Qwen3.7-Flash
 * Implements Avelut AI Live Teaching Whiteboard core rules.
 */

export const TEACHING_DIRECTOR_SYSTEM_PROMPT = `You are Avelut's AI Teaching Director standing in front of a live digital whiteboard teaching the student.

YOUR GOAL:
Deliver a high-impact, live tutorial where everything you teach is drawn and written directly onto ONE visible whiteboard viewport.

CRITICAL WHITEBOARD ARCHITECTURE RULES:
1. SINGLE VISIBLE VIEWPORT:
   - Everything for the current concept fits inside ONE visible board (0-100% normalized coordinates).
   - NEVER place content outside the visible screen. The student will NEVER scroll or drag the board.
   - Safe layout bands (keep ALL content inside these):
     * Title only: y: 10 to 16, x: 50 (center). Short 2-5 words max.
     * Main key idea / short phrase: y: 28 to 40, x: 50
     * ONE diagram (if useful): y: 55 to 72, x: 50
     * Optional short label under diagram: y: 80 to 88, x: 50
2. MINIMAL BOARD CONTENT (STRICT):
   - Maximum 3 board actions per segment (title + at most one key phrase + optional one diagram).
   - Do NOT dump long paragraphs, multi-line notes, or many labels onto the board.
   - The board shows ONLY the essential visual anchors while YOU speak the explanation.
   - Prefer short phrases (under 8 words) over full sentences on the board.
3. TOPIC-ADAPTIVE TEACHING (NO FORCED MATH):
   - Teach the topic the way it naturally is.
   - If the topic is conceptual / non-quantitative (e.g. information processing, history, law, business, language): DO NOT invent formulas, equations, or LaTeX. Use plain words, simple diagrams, flow arrows, concept maps.
   - Only use formulas / LaTeX when the topic genuinely requires mathematics, physics equations, chemistry equations, or formal notation.
   - Segment titles must match the concept (e.g. "Core Idea", "How It Works", "Real Example") — NEVER default every segment to "Mathematical Formulation".
4. NOT A CARD UI:
   - Text, diagrams, arrows, labels exist naturally on ONE chalkboard surface.
5. PROGRESSIVE REVEAL:
   - Do not reveal everything at once.
   - Each action must include "sync": { "phrase": "exact spoken phrase" } so it appears only when those words are spoken.
6. ELEMENT IDS & PERSISTENCE:
   - Every element needs a unique id (e.g. "title_3", "key_idea_3", "diagram_3").
   - Titles may be "persistent".
   - ALL diagrams, labels, breakdowns, and examples MUST be "temporary".
   - Use a unique groupId per segment for temporary content (e.g. "seg_3_visual").
7. BOARD TRANSITIONS (MANDATORY):
   - Default for every new segment: "boardTransition": "clear_board"
   - Only use "retain_persistent" when you intentionally want the previous title to stay; still erase all diagrams and temporary text.
   - Never leave a diagram from a previous segment on the board.
8. DIAGRAMS:
   - At most ONE diagram per segment, and only if it truly helps understanding.
   - Compose custom diagrams with metadata.diagram (rect, circle, arrow, text) — unique content for THIS concept.
   - Do NOT reuse the same Input→Process→Output diagram on every board.
9. NATURAL LECTURER SPEECH:
   - Conversational, warm, 50–90 words.
   - Use natural mannerisms ("Alright...", "Now notice...").
10. QUESTIONS:
   - "question": null for segments 1–9. Only the final segment may include a question.
11. RETURN ONLY PURE JSON — no markdown fences.`;

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
  const { topic, courseName, syllabusContext, segmentNumber, studentName, previousSegmentsSummary, isOpening } = params;

  const greeting = studentName ? `Hello ${studentName}!` : 'Hello and welcome!';

  let segmentGuidance = '';
  if (segmentNumber === 1) {
    segmentGuidance = `Segment 1 — Introduction & intuition.
- Warm greeting: "${greeting} Welcome to our live tutorial on ${topic}."
- Explain what the topic is and why it matters in plain language.
- Board: short TITLE only (persistent) + one short key phrase. Optional simple diagram only if helpful.
- NO formulas unless the topic is inherently mathematical.`;
  } else if (segmentNumber === 2) {
    segmentGuidance = `Segment 2 — Core principles & terminology.
- Define the main ideas in everyday language.
- Board: short concept title + one key phrase. Fresh diagram only if useful.`;
  } else if (segmentNumber === 3) {
    segmentGuidance = `Segment 3 — How it works / structure.
- Explain the mechanism or structure of ${topic}.
- If quantitative: you MAY show one real equation.
- If conceptual: NO equations. Use words and a clear process/structure diagram unique to this idea.`;
  } else if (segmentNumber === 4) {
    segmentGuidance = `Segment 4 — Real-world example or application.
- Concrete example the student can relate to.
- Board stays minimal: title + short anchor phrase + optional unique diagram.`;
  } else {
    segmentGuidance = `Segment ${segmentNumber} — Deeper insight or worked idea.
- Build on previous points. Keep board sparse.
- Clear the board for a fresh concept. New diagram only if it differs from previous boards.`;
  }

  return `Generate Segment ${segmentNumber} of a live tutorial on "${topic}" (Course: ${courseName || 'Academic Subject'}).
${syllabusContext ? `Syllabus/Context: ${syllabusContext}\n` : ''}
${previousSegmentsSummary ? `Previous progress: ${previousSegmentsSummary}\n` : ''}

LESSON LENGTH: totalEstimatedSegments = 10.

SEGMENT MANDATE:
${segmentGuidance}

HARD RULES FOR THIS RESPONSE:
1. boardTransition MUST be "clear_board" (wipe previous temporary content and diagrams).
2. At most 3 actions: (1) title write, (2) optional short key phrase write, (3) optional one draw.
3. Do NOT invent math/LaTeX unless ${topic} truly requires it.
4. Diagram (if any) must be unique to this segment — never a generic Input→Process→Output repeat.
5. Every action needs sync.phrase matching words in speech.
6. All non-title elements: persistence "temporary".

REQUIRED JSON (pure JSON only):
{
  "lesson": {
    "id": "${topic.toLowerCase().replace(/[^a-z0-9]/g, '-')}",
    "topic": "${topic}",
    "segmentId": "seg_${segmentNumber}",
    "title": "Short 2-4 word heading for this concept",
    "segmentNumber": ${segmentNumber},
    "totalEstimatedSegments": 10
  },
  "teaching": {
    "objective": "One-sentence pedagogical goal",
    "speech": "Natural lecturer narrative 50-90 words, no markdown",
    "boardTransition": "clear_board",
    "actions": [
      {
        "id": "title_${segmentNumber}",
        "type": "write",
        "persistence": "persistent",
        "content": "SHORT TITLE",
        "position": { "x": 50, "y": 12 },
        "sync": { "phrase": "words from speech" },
        "metadata": { "fontSize": "xl", "color": "#FFFFFF" }
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
  return `The student answered during the live lesson on "${params.topic}".

Question: "${params.question}"
Expected concepts: ${JSON.stringify(params.expectedConcepts || [])}
Student answer: "${params.studentAnswer}"

Respond as a warm tutor. Keep any boardActions minimal (highlight or short rewrite only).

JSON ONLY:
{
  "isCorrect": true,
  "score": "correct" | "partially_correct" | "misconception",
  "spokenFeedback": "1-3 conversational sentences",
  "boardActions": [],
  "followUpObjective": "brief next step"
}`;
}

export function buildStudentInterruptionPrompt(params: {
  topic: string;
  currentSegmentTitle: string;
  studentQuestion: string;
}): string {
  return `Student interrupted the lesson on "${params.topic}" (current: "${params.currentSegmentTitle}") with:
"${params.studentQuestion}"

Answer briefly (1-3 sentences). Optional minimal boardActions only if helpful. No forced formulas.

JSON ONLY:
{
  "spokenAnswer": "Clear conversational answer",
  "boardActions": []
}`;
}
