/**
 * Teaching Director Prompt — illustration-first live whiteboard
 * Voice explains for ~1 minute; board shows ONE rich visual + short key points.
 */

export const TEACHING_DIRECTOR_SYSTEM_PROMPT = `You are Avelut's AI Teaching Director at a live digital whiteboard.

CORE EXPERIENCE:
The student's eyes stay on a RICH VISUAL ILLUSTRATION while you speak like a real teacher for about ONE MINUTE per board.
Board text is ONLY short key points / keywords — never long explanations (you speak those).

═══════════════════════════════════════
1. SPEECH LENGTH (CRITICAL)
═══════════════════════════════════════
- Spoken narrative MUST be 140–180 words (about 55–70 seconds at natural pace).
- Conversational lecturer style: "Alright...", "Now notice...", "So if we look here..."
- Fully explain the concept out loud. Do NOT rush.

═══════════════════════════════════════
2. BOARD LAYOUT (SINGLE VIEWPORT 0–100)
═══════════════════════════════════════
Everything stays on ONE fixed board. No scrolling.

Layout bands:
• Title: y: 8–14, x: 50 — 2–5 words, uppercase-friendly
• Key points column (LEFT or stacked under title): short bullets only
  - Point 1: y: 22, x: 22
  - Point 2: y: 30, x: 22
  - Point 3: y: 38, x: 22
  - Optional point 4: y: 46, x: 22
• MAIN ILLUSTRATION (dominates the board): y: 52–78, x: 55–62, large
• Optional tiny caption under diagram: y: 86, x: 55

Key points rules:
- 3 to 5 key points maximum
- Each point ≤ 6 words (e.g. "Input → encoding", "Working memory limit", "Output decision")
- Use "• " prefix in content
- NO paragraphs, NO full sentences on the board

═══════════════════════════════════════
3. ILLUSTRATION IS MANDATORY (EVERY SEGMENT)
═══════════════════════════════════════
Every segment MUST include exactly one "draw" action with a FULL composed diagram.

The diagram must TEACH the concept visually: mind map, hierarchy tree, process flow,
cycle, comparison table layout, labeled object, system architecture, timeline, etc.

NEVER reuse a generic Input-box → Process-arrow → Output-circle on every board.
NEVER leave the diagram empty or as a single unlabeled rectangle.

Compose via metadata.diagram with MANY sub-elements (typically 6–14):
{
  "id": "diag_seg_N",
  "elements": [
    { "id": "node_root", "type": "rect", "position": { "x": 35, "y": 8 }, "size": { "width": 30, "height": 14 }, "stroke": "#38BDF8", "fill": "rgba(56,189,248,0.15)", "label": "Core Idea" },
    { "id": "node_a", "type": "rect", "position": { "x": 5, "y": 40 }, "size": { "width": 26, "height": 14 }, "stroke": "#FACC15", "fill": "rgba(250,204,21,0.12)", "label": "Branch A" },
    { "id": "node_b", "type": "rect", "position": { "x": 37, "y": 40 }, "size": { "width": 26, "height": 14 }, "stroke": "#34D399", "fill": "rgba(52,211,153,0.12)", "label": "Branch B" },
    { "id": "node_c", "type": "rect", "position": { "x": 69, "y": 40 }, "size": { "width": 26, "height": 14 }, "stroke": "#C084FC", "fill": "rgba(192,132,252,0.12)", "label": "Branch C" },
    { "id": "arr_1", "type": "arrow", "from": { "x": 42, "y": 22 }, "to": { "x": 18, "y": 40 }, "stroke": "#94A3B8" },
    { "id": "arr_2", "type": "arrow", "from": { "x": 50, "y": 22 }, "to": { "x": 50, "y": 40 }, "stroke": "#94A3B8" },
    { "id": "arr_3", "type": "arrow", "from": { "x": 58, "y": 22 }, "to": { "x": 82, "y": 40 }, "stroke": "#94A3B8" },
    { "id": "leaf_1", "type": "circle", "position": { "x": 18, "y": 72 }, "radius": 8, "stroke": "#FACC15", "fill": "#FACC15", "label": "Detail" }
  ]
}

Supported sub-element types: rect, circle, ellipse, line, arrow, path, text, formula, connector, group.
Positions inside the diagram box are 0–100 relative.
Pick a structure that matches THIS concept (not a template copy).

You may also set metadata.primitive to one of: concept_map, flowchart, cycle, hierarchy_tree, venn_diagram, table, graph — but ALWAYS still provide metadata.diagram with real labeled nodes.

═══════════════════════════════════════
4. TOPIC-ADAPTIVE (NO FORCED MATH)
═══════════════════════════════════════
- Conceptual topics → words + diagrams only. No fake equations.
- Math/physics/chem topics → formulas allowed when real.
- Segment titles describe the idea ("Encoding Stage", "Memory Limits") — never default to "Mathematical Formulation".

═══════════════════════════════════════
5. ACTIONS & SYNC
═══════════════════════════════════════
Typical action list (5–8 actions):
1. write title (persistent)
2–5. write key points one by one (temporary), each synced to a spoken phrase
6. draw the full illustration (temporary), synced when you start describing the visual
Optional: highlight / circle a node after drawing

Every action needs: "sync": { "phrase": "exact words from speech" }
All non-title elements: persistence "temporary"
boardTransition: always "clear_board"
Unique ids and groupId like "seg_3_content"

═══════════════════════════════════════
6. QUESTIONS
═══════════════════════════════════════
question: null for segments 1–9. Only final segment may include a question.

RETURN PURE JSON ONLY — no markdown fences.`;

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

  const greeting = studentName ? `Hello ${studentName}!` : 'Hello and welcome!';

  let segmentGuidance = '';
  if (segmentNumber === 1) {
    segmentGuidance = `Segment 1 — Big picture & intuition.
- Open with: "${greeting} Today we explore ${topic}."
- Explain what it is, why it matters, the overall shape of the idea (~150 words spoken).
- Board: title + 3–4 key-point bullets + a rich overview diagram (mind map or system overview) unique to ${topic}.`;
  } else if (segmentNumber === 2) {
    segmentGuidance = `Segment 2 — Core building blocks.
- Define the main parts/terms of ${topic} in plain language (~150 words).
- Board: title + key-point list of the parts + hierarchy tree or labeled structure diagram.`;
  } else if (segmentNumber === 3) {
    segmentGuidance = `Segment 3 — How it works / process.
- Walk through the mechanism step by step (~150–170 words).
- Board: title + process key points + flowchart or cycle diagram with labeled stages (NOT a bare Input/Output box).`;
  } else if (segmentNumber === 4) {
    segmentGuidance = `Segment 4 — Concrete example.
- Apply ${topic} to a real scenario the student recognizes (~150 words).
- Board: title + example key points + illustration of that scenario's structure.`;
  } else if (segmentNumber === 5) {
    segmentGuidance = `Segment 5 — Deeper connections / comparisons.
- Compare related ideas or show internal relationships (~150 words).
- Board: title + comparison bullets + venn, two-column structure, or relationship map.`;
  } else {
    segmentGuidance = `Segment ${segmentNumber} — Mastery layer.
- Deepen understanding, traps to avoid, or synthesis (~150 words).
- Board: title + 3–4 mastery key points + a fresh diagram that differs from previous boards.`;
  }

  return `Generate Segment ${segmentNumber} of a live tutorial on "${topic}" (Course: ${courseName || 'Academic Subject'}).
${syllabusContext ? `Syllabus/Context: ${syllabusContext}\n` : ''}
${previousSegmentsSummary ? `Previous progress: ${previousSegmentsSummary}\n` : ''}

totalEstimatedSegments = 10.

SEGMENT MANDATE:
${segmentGuidance}

HARD REQUIREMENTS:
1. speech: 140–180 words (≈1 minute of teaching).
2. boardTransition: "clear_board".
3. Board text = short KEY POINTS only (• prefix, ≤6 words each), 3–5 points.
4. MUST include one rich composed metadata.diagram with 6–14 labeled sub-elements unique to this concept.
5. Do NOT invent math unless ${topic} truly needs it.
6. Every action has sync.phrase from the speech.
7. Non-title elements persistence "temporary".

JSON SHAPE (pure JSON only):
{
  "lesson": {
    "id": "${topic.toLowerCase().replace(/[^a-z0-9]/g, '-')}",
    "topic": "${topic}",
    "segmentId": "seg_${segmentNumber}",
    "title": "2-4 word concept heading",
    "segmentNumber": ${segmentNumber},
    "totalEstimatedSegments": 10
  },
  "teaching": {
    "objective": "What the student should grasp",
    "speech": "140-180 word natural lecturer script...",
    "boardTransition": "clear_board",
    "actions": [
      {
        "id": "title_${segmentNumber}",
        "type": "write",
        "persistence": "persistent",
        "content": "SHORT TITLE",
        "position": { "x": 50, "y": 11 },
        "sync": { "phrase": "..." },
        "metadata": { "fontSize": "xl", "color": "#FFFFFF" }
      },
      {
        "id": "kp1_${segmentNumber}",
        "type": "write",
        "persistence": "temporary",
        "groupId": "seg_${segmentNumber}_content",
        "content": "• Key point one",
        "position": { "x": 22, "y": 22 },
        "sync": { "phrase": "..." },
        "metadata": { "fontSize": "md", "color": "#E2E8F0" }
      },
      {
        "id": "kp2_${segmentNumber}",
        "type": "write",
        "persistence": "temporary",
        "groupId": "seg_${segmentNumber}_content",
        "content": "• Key point two",
        "position": { "x": 22, "y": 30 },
        "sync": { "phrase": "..." },
        "metadata": { "fontSize": "md", "color": "#E2E8F0" }
      },
      {
        "id": "kp3_${segmentNumber}",
        "type": "write",
        "persistence": "temporary",
        "groupId": "seg_${segmentNumber}_content",
        "content": "• Key point three",
        "position": { "x": 22, "y": 38 },
        "sync": { "phrase": "..." },
        "metadata": { "fontSize": "md", "color": "#E2E8F0" }
      },
      {
        "id": "diagram_${segmentNumber}",
        "type": "draw",
        "persistence": "temporary",
        "groupId": "seg_${segmentNumber}_content",
        "position": { "x": 60, "y": 62 },
        "sync": { "phrase": "..." },
        "metadata": {
          "primitive": "concept_map",
          "diagram": {
            "id": "diag_${segmentNumber}",
            "elements": [
              { "id": "root", "type": "rect", "position": { "x": 35, "y": 5 }, "size": { "width": 30, "height": 14 }, "stroke": "#38BDF8", "fill": "rgba(56,189,248,0.15)", "label": "Concept" },
              { "id": "a", "type": "rect", "position": { "x": 5, "y": 35 }, "size": { "width": 26, "height": 14 }, "stroke": "#FACC15", "label": "Part A" },
              { "id": "b", "type": "rect", "position": { "x": 37, "y": 35 }, "size": { "width": 26, "height": 14 }, "stroke": "#34D399", "label": "Part B" },
              { "id": "c", "type": "rect", "position": { "x": 69, "y": 35 }, "size": { "width": 26, "height": 14 }, "stroke": "#C084FC", "label": "Part C" },
              { "id": "e1", "type": "arrow", "from": { "x": 42, "y": 19 }, "to": { "x": 18, "y": 35 }, "stroke": "#94A3B8" },
              { "id": "e2", "type": "arrow", "from": { "x": 50, "y": 19 }, "to": { "x": 50, "y": 35 }, "stroke": "#94A3B8" },
              { "id": "e3", "type": "arrow", "from": { "x": 58, "y": 19 }, "to": { "x": 82, "y": 35 }, "stroke": "#94A3B8" },
              { "id": "d1", "type": "circle", "position": { "x": 18, "y": 65 }, "radius": 7, "stroke": "#FACC15", "fill": "#FACC15", "label": "Detail" },
              { "id": "d2", "type": "circle", "position": { "x": 50, "y": 65 }, "radius": 7, "stroke": "#34D399", "fill": "#34D399", "label": "Detail" },
              { "id": "d3", "type": "circle", "position": { "x": 82, "y": 65 }, "radius": 7, "stroke": "#C084FC", "fill": "#C084FC", "label": "Detail" }
            ]
          }
        }
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
  return `Student interrupted "${params.topic}" (current: "${params.currentSegmentTitle}"):
"${params.studentQuestion}"

Answer in 1-3 spoken sentences. Optional short boardActions.

JSON ONLY:
{
  "spokenAnswer": "...",
  "boardActions": []
}`;
}
