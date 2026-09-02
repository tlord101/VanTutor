/**
 * Duration-mode teaching profiles for structure + board performance prompts.
 */
import type { LessonDurationMode } from '../components/tutorial/LessonDurationModal';

export interface DurationTeachingProfile {
  minutes: LessonDurationMode;
  boardCountHint: string;
  speechWordRange: string;
  toneRules: string;
  pacingRules: string;
  structureExtra: string;
  boardExtra: string;
}

export const DURATION_PROFILES: Record<LessonDurationMode, DurationTeachingProfile> = {
  15: {
    minutes: 15,
    boardCountHint: 'Plan exactly 5 to 8 boards. Tight, efficient overview.',
    speechWordRange: '90 to 140 words per board',
    toneRules: 'Efficient coach. Minimal small talk. Clear and direct.',
    pacingRules: 'Mostly continuous; at most one short reflection pause in the whole lesson.',
    structureExtra: `STEP TYPES: prefer hook, concept, definition, worked_example, summary.
Keep visual_purpose concrete. Prefer illustration-heavy boards over text walls.`,
    boardExtra: `SPEECH: concise, high signal. Few mannerisms.
BOARD: 1 strong illustration (path commands preferred) + 1-3 short text anchors max.
pauseAfterMs: 800-2000 only when needed.`,
  },
  30: {
    minutes: 30,
    boardCountHint: 'Plan 12 to 18 boards covering intuition through application.',
    speechWordRange: '130 to 200 words per board',
    toneRules: 'Friendly university tutor. Occasional encouragement. Address the student by name occasionally.',
    pacingRules: 'Short reflection pauses after key formulas or diagrams (pauseAfterMs 1500-3500).',
    structureExtra: `Include intuition, mechanism, worked_example, misconception_check, and at least 2 question boards.
Group boards so the arc is complete in ~30 minutes of content.`,
    boardExtra: `SPEECH: clear walkthrough; light check-ins ("notice this", "keep this in mind").
BOARD: illustration-first; sparse big text; formulas large.
Use mannerism reflection_pause or check_understanding on 3-5 beats across the lesson.`,
  },
  60: {
    minutes: 60,
    boardCountHint:
      'Plan 25 to 40 boards organized into 4-6 chapters/sections. This is a full live lecture, not a speed-run.',
    speechWordRange: '160 to 320 words per board (varies — some boards are short jokes/check-ins)',
    toneRules: `REAL HUMAN LECTURER:
- Talk to the student by name.
- Make light academic jokes and asides, then continue the syllabus.
- Rhetorical questions: "Still with me?", "Why does this matter?"
- Encouragement without being cheesy.
- NEVER monologue non-stop: insert natural breaks.`,
    pacingRules: `NOT NONSTOP TEACHING:
- After major ideas, use mannerism "reflection_pause" with pauseAfterMs 8000-25000 and spoken cues like "Write that down — I'll wait a second." or "Sit with that idea for a moment."
- Every 6-10 boards, include a soft check-in board or beat.
- Humor beats are allowed; then resume the planned next concept.
- The lesson may span multiple sittings; write boards so stopping mid-chapter still makes sense.`,
    structureExtra: `REQUIRED: chapters as logical groups. Put chapter title in board titles like "[Ch 2] Net force intuition".
Sequence: hook → intuition → core law → variable anatomy → worked example setup → resolution → deep mechanism → exam trap → practice → summary.
Insert 3-6 boards whose step_type is question or misconception_check.
estimated_duration_seconds should sum near 50-65 minutes of content (pauses make wall-clock longer).`,
    boardExtra: `SPEECH BEATS (3-8):
- Mix teaching beats with attention, emphasis, reflection_pause, encouragement, check_understanding.
- On reflection_pause beats: short spoken cue + long pauseAfterMs; board stays visible.
- Jokes/asides go in speech text, then next beat continues the academic plan (do not derail the structure).
BOARD PRIORITY:
1) Illustrations via path/line/arrow/circle commands (progressive draw)
2) Secondary: title, 1-4 short bullets/definitions, or one worked line / LaTeX formula
3) NEVER paragraph walls of text on the board
Prefer draw commands over named primitives. Optional full svg_illustration only if paths cannot express the scene.`,
  },
};

export function getDurationProfile(mode: LessonDurationMode): DurationTeachingProfile {
  return DURATION_PROFILES[mode] || DURATION_PROFILES[30];
}
