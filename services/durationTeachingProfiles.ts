/**
 * Duration-mode teaching profiles — illustration-first on every mode.
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

const SHARED_ILLUSTRATION = `ILLUSTRATION-FIRST (always):
- At least one progressive figure when the idea is visual (most boards).
- 2-5 path/line/arrow/circle draws building with speech beats.
- Text: title top + at most 3 short bullets margin OR one formula — never paragraphs.
- Figure sits in center band; speech carries the depth.`;

export const DURATION_PROFILES: Record<LessonDurationMode, DurationTeachingProfile> = {
  15: {
    minutes: 15,
    boardCountHint: 'Plan exactly 5 to 8 boards. Tight, efficient overview.',
    speechWordRange: '90 to 140 words per board',
    toneRules: 'Efficient coach. Minimal small talk. Clear and direct.',
    pacingRules: 'Mostly continuous; at most one short reflection pause in the whole lesson.',
    structureExtra: `STEP TYPES: prefer hook, concept, definition, worked_example, summary.
Every board needs a concrete visual_purpose (what is drawn).
${SHARED_ILLUSTRATION}`,
    boardExtra: `SPEECH: concise, high signal.
BOARD: 1 strong progressive illustration (2-4 path strokes) + title + optional 1 formula or 2 bullets max.
pauseAfterMs: 800-2000 only when needed.
${SHARED_ILLUSTRATION}`,
  },
  30: {
    minutes: 30,
    boardCountHint: 'Plan 12 to 18 boards covering intuition through application.',
    speechWordRange: '130 to 200 words per board',
    toneRules: 'Friendly university tutor. Occasional encouragement. Address the student by name occasionally.',
    pacingRules: 'Short reflection pauses after key diagrams or formulas (pauseAfterMs 1500-3500).',
    structureExtra: `Include intuition, mechanism, worked_example, misconception_check, and at least 2 question boards.
visual_purpose must describe a drawable figure for almost every board.
${SHARED_ILLUSTRATION}`,
    boardExtra: `SPEECH: clear walkthrough; light check-ins.
BOARD: draw base -> draw relation -> optional highlight; sparse big text.
Use mannerism reflection_pause or check_understanding sparingly.
${SHARED_ILLUSTRATION}`,
  },
  60: {
    minutes: 60,
    boardCountHint:
      'Plan 25 to 40 boards organized into 4-6 chapters/sections. Full live lecture, not a speed-run.',
    speechWordRange: '160 to 320 words per board (some boards are short jokes/check-ins)',
    toneRules: `REAL HUMAN LECTURER:
- Talk to the student by name.
- Light academic jokes and asides, then continue the syllabus.
- Rhetorical questions: "Still with me?", "Why does this matter?"
- NEVER monologue non-stop: insert natural breaks.`,
    pacingRules: `NOT NONSTOP:
- After major ideas, mannerism "reflection_pause" with pauseAfterMs 8000-25000.
- Every 6-10 boards, soft check-in.
- Humor then resume the planned next concept.`,
    structureExtra: `REQUIRED: chapters. Put chapter in titles like "[Ch 2] Net force intuition".
Sequence: hook -> intuition -> core -> worked example -> trap -> practice -> summary.
3-6 question or misconception_check boards.
${SHARED_ILLUSTRATION}`,
    boardExtra: `SPEECH BEATS (3-8): teaching + attention/emphasis/reflection_pause.
BOARD: progressive path draws first; secondary title/bullets/formula only.
${SHARED_ILLUSTRATION}`,
  },
};

export function getDurationProfile(mode: LessonDurationMode): DurationTeachingProfile {
  return DURATION_PROFILES[mode] || DURATION_PROFILES[30];
}
