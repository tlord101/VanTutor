import { BoardElement } from '../components/tutorial/LiveWhiteboardCanvas';
import { TimedBoardCue, ParsedLessonScript } from '../utils/lessonScriptParser';

export interface SyncEngineState {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  activeElements: BoardElement[];
  tutorPointer: { x: number; y: number; active: boolean; color?: string } | null;
  activeFocusArea: { x: number; y: number; w: number; h: number; color?: string } | null;
}

export type SyncEngineListener = (state: SyncEngineState) => void;

/**
 * Deterministic Millisecond Audio-to-Whiteboard Synchronization Engine
 */
export class LiveTutorialSyncEngine {
  private script: ParsedLessonScript | null = null;
  private audioDurationMs = 15000;
  private currentTimeMs = 0;
  private isPlaying = false;
  private animFrameId: number | null = null;
  private lastTimestamp = 0;
  private listeners: Set<SyncEngineListener> = new Set();

  private activeElements: BoardElement[] = [];
  private tutorPointer: { x: number; y: number; active: boolean; color?: string } | null = null;
  private activeFocusArea: { x: number; y: number; w: number; h: number; color?: string } | null = null;

  constructor() {}

  public loadScript(script: ParsedLessonScript, estimatedDurationMs = 20000) {
    this.script = script;
    this.audioDurationMs = estimatedDurationMs;
    this.reset();
  }

  public subscribe(listener: SyncEngineListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTimestamp = performance.now();
    this.tick(this.lastTimestamp);
  }

  public pause() {
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.notify();
  }

  public seek(targetTimeMs: number) {
    this.currentTimeMs = Math.max(0, Math.min(this.audioDurationMs, targetTimeMs));
    this.recalculateStateAtCurrentTime();
    this.notify();
  }

  public reset() {
    this.pause();
    this.currentTimeMs = 0;
    this.activeElements = [];
    this.tutorPointer = null;
    this.activeFocusArea = null;
    this.notify();
  }

  private tick = (time: number) => {
    if (!this.isPlaying) return;
    const delta = time - this.lastTimestamp;
    this.lastTimestamp = time;

    this.currentTimeMs += delta;

    if (this.currentTimeMs >= this.audioDurationMs) {
      this.currentTimeMs = this.audioDurationMs;
      this.pause();
      this.recalculateStateAtCurrentTime();
      this.notify();
      return;
    }

    this.recalculateStateAtCurrentTime();
    this.notify();

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private recalculateStateAtCurrentTime() {
    if (!this.script) return;

    const elements: BoardElement[] = [];
    let currentPointer: { x: number; y: number; active: boolean; color?: string } | null = null;
    let currentFocus: { x: number; y: number; w: number; h: number; color?: string } | null = null;

    for (const cue of this.script.cues) {
      if (cue.timeMs > this.currentTimeMs) continue;

      const timeSinceCue = this.currentTimeMs - cue.timeMs;

      if (cue.action === 'DRAW_AXES') {
        const animDuration = 1200;
        const progress = Math.min(1.0, timeSinceCue / animDuration);
        elements.push({
          id: `axes_${cue.timeMs}`,
          type: 'axes',
          originX: cue.data.originX || 80,
          originY: cue.data.originY || 280,
          width: cue.data.width || 340,
          height: cue.data.height || 220,
          xLabel: cue.data.xLabel || 'x',
          yLabel: cue.data.yLabel || 'y',
          progress,
          color: cue.data.color || '#64748B',
        });
      } else if (cue.action === 'DRAW_CURVE') {
        const animDuration = 2000;
        const progress = Math.min(1.0, timeSinceCue / animDuration);
        elements.push({
          id: `curve_${cue.timeMs}`,
          type: 'curve',
          points: cue.data.points || [],
          progress,
          color: cue.data.color || '#0066FF',
          width: cue.data.width || 3,
        });

        // Set tutor pointer at leading edge of curve during animation
        if (progress < 1.0 && cue.data.points && cue.data.points.length > 0) {
          const ptIdx = Math.floor(progress * (cue.data.points.length - 1));
          const pt = cue.data.points[ptIdx];
          if (pt) {
            currentPointer = { x: pt.x, y: pt.y, active: true, color: '#0066FF' };
          }
        }
      } else if (cue.action === 'DRAW_ARROW') {
        elements.push({
          id: `arrow_${cue.timeMs}`,
          type: 'arrow',
          from: cue.data.from,
          to: cue.data.to,
          label: cue.data.label || '',
          color: cue.data.color || '#002D62',
        });
      } else if (cue.action === 'DRAW_TABLE') {
        const animDuration = 1800;
        const progress = Math.min(1.0, timeSinceCue / animDuration);
        elements.push({
          id: `table_${cue.timeMs}`,
          type: 'table',
          x: cue.data.x || 30,
          y: cue.data.y || 40,
          width: cue.data.width || 460,
          headers: cue.data.headers || ['Category', 'Feature', 'Rule'],
          rows: cue.data.rows || [],
          progress,
          activeRowIndex: cue.data.activeRowIndex,
          color: cue.data.color || '#002D62',
        });
      } else if (cue.action === 'DRAW_TAKEAWAY') {
        elements.push({
          id: `takeaway_${cue.timeMs}`,
          type: 'takeaway',
          x: cue.data.x || 30,
          y: cue.data.y || 180,
          width: cue.data.width || 460,
          title: cue.data.title || 'Key Principle',
          keywords: cue.data.keywords || ['Definition', 'Rule'],
          summary: cue.data.summary || '',
          color: cue.data.color || '#0066FF',
        });
      } else if (cue.action === 'DRAW_FLOWCHART') {
        elements.push({
          id: `flowchart_${cue.timeMs}`,
          type: 'flowchart',
          x: cue.data.x || 30,
          y: cue.data.y || 120,
          nodes: cue.data.nodes || [],
          activeNodeIndex: cue.data.activeNodeIndex,
          color: cue.data.color || '#0066FF',
        });
      } else if (cue.action === 'DRAW_ILLUSTRATION') {
        const animDuration = 2200;
        const progress = Math.min(1.0, timeSinceCue / animDuration);
        elements.push({
          id: `illustration_${cue.timeMs}`,
          type: 'illustration',
          illustrationType: cue.data.type || 'cell_anatomy',
          x: cue.data.x || 30,
          y: cue.data.y || 30,
          width: cue.data.width || 460,
          height: cue.data.height || 280,
          progress,
          color: cue.data.color || '#0066FF',
        });
      } else if (cue.action === 'ERASE_AND_REDRAW') {
        const eraseDuration = 800;
        if (timeSinceCue < eraseDuration) {
          elements.push({
            id: `erase_${cue.timeMs}`,
            type: 'erase',
            progress: timeSinceCue / eraseDuration,
          });
        } else {
          // Board is cleanly cleared after eraser wipe finishes
          elements.length = 0;
        }
      } else if (cue.action === 'HIGHLIGHT_FOCUS') {
        const pulseLifetime = 4000;
        if (timeSinceCue < pulseLifetime) {
          currentFocus = {
            x: cue.data.x,
            y: cue.data.y,
            w: cue.data.w,
            h: cue.data.h,
            color: cue.data.color || '#0066FF',
          };
        }
      } else if (cue.action === 'CLEAR_BOARD') {
        elements.length = 0;
      }
    }

    this.activeElements = elements;
    this.tutorPointer = currentPointer;
    this.activeFocusArea = currentFocus;
  }

  private notify() {
    const state: SyncEngineState = {
      currentTimeMs: this.currentTimeMs,
      durationMs: this.audioDurationMs,
      isPlaying: this.isPlaying,
      activeElements: this.activeElements,
      tutorPointer: this.tutorPointer,
      activeFocusArea: this.activeFocusArea,
    };
    this.listeners.forEach((listener) => listener(state));
  }
}
