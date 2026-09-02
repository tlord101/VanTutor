/**
 * Illustration-first board layout rules (production).
 * Hierarchy: figure center → formula near figure → title top → bullets margin.
 */

export const ILLUSTRATION_COLORS = {
  chalk: '#E2E8F0',
  accent: '#38BDF8',
  warn: '#FACC15',
  soft: '#94A3B8',
  white: '#FFFFFF',
} as const;

export const MAX_BOARD_TEXT_CHARS = 90;
export const MAX_TEXT_ELEMENTS = 4;

export interface LayoutClamp {
  x: number;
  y: number;
}

export function clampTitlePosition(x?: number, y?: number): LayoutClamp {
  return {
    x: Math.max(15, Math.min(85, x ?? 50)),
    y: Math.max(6, Math.min(14, y ?? 10)),
  };
}

export function clampTextPosition(x?: number, y?: number): LayoutClamp {
  const rawX = x ?? 22;
  const rawY = y ?? 82;
  const useLeft = rawX < 45;
  if (useLeft) {
    return {
      x: Math.max(12, Math.min(38, rawX)),
      y: Math.max(22, Math.min(88, rawY)),
    };
  }
  return {
    x: Math.max(20, Math.min(80, rawX)),
    y: Math.max(78, Math.min(92, rawY)),
  };
}

export function clampFormulaPosition(x?: number, y?: number): LayoutClamp {
  return {
    x: Math.max(20, Math.min(80, x ?? 50)),
    y: Math.max(18, Math.min(42, y ?? 28)),
  };
}

export function clampIllustrationPosition(x?: number, y?: number): LayoutClamp {
  return {
    x: Math.max(28, Math.min(72, x ?? 50)),
    y: Math.max(38, Math.min(72, y ?? 55)),
  };
}

export function truncateBoardText(content: string, max = MAX_BOARD_TEXT_CHARS): string {
  const t = (content || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '\u2026';
}

export const ILLUSTRATION_FIRST_PROMPT_BLOCK = `BOARD PRIORITY (STRICT \u2014 illustration-first):
1) ILLUSTRATION is the main content. Compose with path/line/circle/arrow draws (2\u20135 progressive strokes).
2) TEXT is secondary only: one short title (top), \u22643 short bullets (left or bottom margin), OR one formula near the figure.
3) NEVER paragraph walls of text. If muted audio, the board figure alone must still show the idea.
4) ONE main visual idea per board. Build it beat-by-beat with speech.
5) Layout zones (0\u2013100 coords):
   - Title: y 6\u201312, x ~50
   - Figure: x 28\u201372, y 38\u201372 (CENTER \u2014 largest visual)
   - Formula: near figure, y 18\u201340
   - Bullets: left x 12\u201335 OR bottom y 78\u201390
6) Progressive timing: Beat1 speak \u2192 DRAW base; Beat2 speak \u2192 DRAW arrow; Beat3 \u2192 HIGHLIGHT/label.
7) Colors: #E2E8F0 chalk, #38BDF8 accent, #FACC15 labels.
8) No predefined primitives. Optional svg_illustration only if paths cannot express the scene.
9) fontSize: titles 2xl|3xl, bullets xl|2xl, formulas 3xl.`;
