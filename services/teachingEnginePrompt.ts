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
   - NEVER place content outside the visible screen. The student will NEVER scroll or drag the board to see normal lesson content.
   - Coordinate layout ranges:
     * Top header / title: y: 8 to 18, x: 50 (center)
     * Main formula / law: y: 24 to 36, x: 50 (or x: 30 if paired with diagram)
     * Variable breakdown (F -> Force): y: 38 to 50, x: 25 to 50
     * Visual diagram / illustration: y: 50 to 72, x: 50 (or x: 65)
     * Worked example / numerical steps: y: 72 to 88, x: 50
2. NOT A CARD UI:
   - Do NOT think in cards, floating boxes, or slide decks.
   - Text, formulas, diagrams, arrows, labels, highlights, and examples exist naturally together on ONE whiteboard surface.
3. PROGRESSIVE WRITING & DRAWING:
   - Do not reveal everything at once.
   - Each action represents a lecturer writing a line, drawing a component, circling a symbol, or drawing an arrow while speaking.
   - In every action, set "sync": { "phrase": "exact spoken phrase" } so the visual appears at the exact moment you speak those words.
4. ELEMENT IDENTIFIERS & GROUPS:
   - Give every element a clean ID (e.g. "title_1", "law_formula", "force_arrow", "example_calc").
   - Classify persistence:
     * "persistent": Core topic title and fundamental formulas that should stay visible when transitioning.
     * "temporary": Specific numerical calculations, temporary diagrams, or intermediate examples.
   - Assign logical groupIds for related elements (e.g. "groupId": "worked_example_1").
5. CONTINUING CONCEPTS & ERASING:
   - When moving to the next concept in segment 2+, you can:
     * "boardTransition": "clear_board" (clean wipe the board)
     * "boardTransition": "retain_persistent" (keep title/core formula, erase temporary worked examples)
     * Use "erase" or "erase_group" actions for partial wipes.
   - The lesson ALWAYS continues on the SAME whiteboard viewport!
6. RICH SUBJECT PRIMITIVES:
   - Physics: "physics_block", "physics_force", "physics_pulley", "physics_spring", "physics_wave"
   - Circuits: "circuit", "circuit_resistor", "circuit_battery"
   - Chemistry: "chemistry_molecule", "chemistry_atom", "chemistry_reaction"
   - Biology: "biology_cell", "biology_dna", "biology_neuron"
   - Mathematics: "formula", "graph", "graph_axes", "geometry_triangle", "geometry_circle", "table"
7. INTERACTIVE QUESTIONS:
   - Ask a short, direct question at key teaching moments. The board remains fully visible while the student answers.
8. RETURN ONLY JSON:
   - Never output markdown codeblocks (\`\`\`json). Output pure JSON.`;

export function buildLessonSegmentPrompt(params: {
  topic: string;
  courseName?: string;
  syllabusContext?: string;
  segmentNumber: number;
  previousSegmentsSummary?: string;
  studentKnowledgeLevel?: string;
  isOpening?: boolean;
}): string {
  const { topic, courseName, syllabusContext, segmentNumber, previousSegmentsSummary, isOpening } = params;

  return `Generate Segment ${segmentNumber} of a live tutorial on "${topic}" (Course: ${courseName || 'Academic Subject'}).
${syllabusContext ? `Syllabus/Context: ${syllabusContext}\n` : ''}
${previousSegmentsSummary ? `Previous Teaching Progress: ${previousSegmentsSummary}\n` : ''}

${isOpening ? `This is Segment 1 (Opening). Start with real-world intuition before introducing formal definitions. Write the concept title and introduce the core relationship.` : `Continue the teaching sequence on the same board. Decide whether to retain persistent formulas or clear temporary examples.`}

REQUIRED JSON FORMAT (Return ONLY this JSON):
{
  "lesson": {
    "id": "${topic.toLowerCase().replace(/[^a-z0-9]/g, '-')}",
    "topic": "${topic}",
    "segmentId": "seg_${segmentNumber}",
    "title": "Short 2-4 word concept name",
    "segmentNumber": ${segmentNumber},
    "totalEstimatedSegments": 5
  },
  "teaching": {
    "objective": "Pedagogical goal for this concept",
    "speech": "Natural spoken lecturer narrative without markdown (30-60 words)",
    "boardTransition": "${isOpening ? 'clear_board' : (segmentNumber % 2 === 0 ? 'retain_persistent' : 'clear_board')}",
    "actions": [
      {
        "id": "title_${segmentNumber}",
        "type": "write",
        "persistence": "persistent",
        "content": "${topic.toUpperCase()}",
        "position": { "x": 50, "y": 10 },
        "sync": { "phrase": "exact phrase from speech" },
        "metadata": { "fontSize": "xl", "color": "#FFFFFF" }
      },
      {
        "id": "formula_${segmentNumber}",
        "type": "write",
        "persistence": "persistent",
        "content": "E = mc^2",
        "position": { "x": 50, "y": 28 },
        "sync": { "phrase": "exact phrase from speech" },
        "metadata": { "latex": "E = mc^2", "fontSize": "2xl", "color": "#38BDF8" }
      },
      {
        "id": "var_breakdown_${segmentNumber}",
        "type": "write",
        "persistence": "temporary",
        "groupId": "breakdown_${segmentNumber}",
        "content": "E -> Energy\\nm -> Mass\\nc -> Speed of Light",
        "position": { "x": 30, "y": 48 },
        "sync": { "phrase": "exact phrase from speech" },
        "metadata": { "fontSize": "md", "color": "#94A3B8" }
      },
      {
        "id": "diagram_${segmentNumber}",
        "type": "draw",
        "persistence": "temporary",
        "groupId": "visual_${segmentNumber}",
        "position": { "x": 70, "y": 55 },
        "sync": { "phrase": "exact phrase from speech" },
        "metadata": { "primitive": "physics_block", "color": "#FACC15" }
      },
      {
        "id": "highlight_${segmentNumber}",
        "type": "highlight",
        "target": "formula_${segmentNumber}",
        "sync": { "phrase": "exact phrase from speech" }
      }
    ]
  },
  "question": {
    "id": "q_${segmentNumber}",
    "type": "understanding",
    "question": "Clear single-sentence conceptual question based on what was just taught",
    "waitForAnswer": true,
    "expectedConcepts": ["mass", "energy conversion"],
    "options": ["Energy increases", "Mass decreases", "Speed remains constant"]
  },
  "next": {
    "type": "wait_for_answer",
    "suggestedNextSegment": "Next progressive concept"
  }
}`;
}

export function buildStudentAnswerEvaluationPrompt(params: {
  topic: string;
  segmentTitle: string;
  question: string;
  expectedConcepts?: string[];
  studentAnswer: string;
}): string {
  return `The student has just answered a teaching question during the live lesson on "${params.topic}".

Question Asked: "${params.question}"
Expected Key Concepts: ${JSON.stringify(params.expectedConcepts || [])}
Student's Spoken/Typed Answer: "${params.studentAnswer}"

Evaluate their response conversationally as a tutor.
- If correct: Acknowledge briefly and warmly ("Exactly, that's spot on.").
- If partially correct: Validate what is right, then bridge the gap.
- If misconception: Gently explain the misconception and correct it with an immediate board action (e.g. highlight or rewrite formula).

REQUIRED JSON SCHEMA (Return ONLY this JSON):
{
  "isCorrect": true,
  "score": "correct" | "partially_correct" | "misconception",
  "spokenFeedback": "Conversational tutor response to be spoken (1-3 sentences)",
  "boardActions": [
    {
      "id": "eval_act_1",
      "type": "highlight" | "write" | "circle",
      "target": "relevant_element",
      "content": "Correction or emphasis",
      "sync": { "phrase": "relevant words from spokenFeedback" }
    }
  ],
  "followUpObjective": "Brief note on where the lesson should proceed next"
}`;
}

export function buildStudentInterruptionPrompt(params: {
  topic: string;
  currentSegmentTitle: string;
  studentQuestion: string;
}): string {
  return `The student has just interrupted the live lesson on "${params.topic}" (Current Topic: "${params.currentSegmentTitle}") with a direct question:
Student Question: "${params.studentQuestion}"

Respond directly, warmly, and concisely as an expert lecturer (1-3 sentences).
Provide clarifying board action(s) (highlighting, rewriting a variable, or drawing a quick illustration) to resolve their confusion immediately.

REQUIRED JSON SCHEMA (Return ONLY this JSON):
{
  "spokenAnswer": "Clear, direct conversational tutor response (1-3 sentences)",
  "boardActions": [
    {
      "id": "clarify_act_1",
      "type": "write" | "highlight" | "circle" | "label",
      "target": "target_element",
      "content": "Clarification notes or formula step",
      "sync": { "phrase": "key phrase from spokenAnswer" },
      "metadata": { "x": 50, "y": 40 }
    }
  ]
}`;
}
