/**
 * Live Board State Manager
 * - Handles fixed viewport board elements (text, formulas, custom SVG, diagrams, labels)
 * - Managed runtime state machine (IDLE, PREPARING, RENDERING, SPEAKING, WAITING_FOR_ANSWER, etc.)
 * - Provides clean clearBoard() operation resetting text, formulas, SVG, highlights, pointers, question elements, and focus state.
 */

import { BoardAction, LiveBoardElement, BoardState, TeachingRuntimeState } from '../types/teachingScript';
import { sanitizeSvg } from '../utils/svgSanitizer';

export class BoardStateManager {
  private elements: Map<string, LiveBoardElement> = new Map();
  private activeHighlights: Set<string> = new Set();
  private activeCircles: Set<string> = new Set();
  private activeUnderlines: Set<string> = new Set();
  private focusedElementId: string | null = null;
  private runtimeState: TeachingRuntimeState = 'IDLE';
  private listeners: Set<(state: BoardState & { runtimeState: TeachingRuntimeState }) => void> = new Set();

  constructor(initialElements: LiveBoardElement[] = []) {
    initialElements.forEach((el) => this.elements.set(el.id, el));
  }

  public subscribe(listener: (state: BoardState & { runtimeState: TeachingRuntimeState }) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): BoardState & { runtimeState: TeachingRuntimeState } {
    return {
      elements: new Map(this.elements),
      activeHighlights: new Set(this.activeHighlights),
      activeCircles: new Set(this.activeCircles),
      activeUnderlines: new Set(this.activeUnderlines),
      focusedElementId: this.focusedElementId,
      runtimeState: this.runtimeState,
    };
  }

  public setRuntimeState(newState: TeachingRuntimeState) {
    if (this.runtimeState !== newState) {
      this.runtimeState = newState;
      this.notify();
    }
  }

  public getRuntimeState(): TeachingRuntimeState {
    return this.runtimeState;
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  public clearOverlays() {
    this.activeHighlights.clear();
    this.activeCircles.clear();
    this.activeUnderlines.clear();
    this.focusedElementId = null;
  }

  public clearBoard() {
    this.elements.clear();
    this.clearOverlays();
    this.notify();
  }

  public applyAction(action: BoardAction): void {
    const actionId = action.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    switch (action.type) {
      case 'clear':
      case 'clear_board': {
        this.clearBoard();
        break;
      }

      case 'retain': {
        for (const [id, el] of this.elements.entries()) {
          if (
            el.persistence !== 'persistent' ||
            el.type === 'diagram' ||
            el.type === 'svg' ||
            el.type === 'arrow' ||
            el.type === 'label'
          ) {
            this.elements.delete(id);
          }
        }
        this.clearOverlays();
        break;
      }

      case 'erase': {
        if (action.target) {
          this.elements.delete(action.target);
          this.activeHighlights.delete(action.target);
          this.activeCircles.delete(action.target);
          this.activeUnderlines.delete(action.target);
        } else if (action.id) {
          this.elements.delete(action.id);
        }
        break;
      }

      case 'erase_group': {
        const targetGroup = action.groupId || action.target;
        if (targetGroup) {
          for (const [id, el] of this.elements.entries()) {
            if (el.groupId === targetGroup) {
              this.elements.delete(id);
              this.activeHighlights.delete(id);
              this.activeCircles.delete(id);
              this.activeUnderlines.delete(id);
            }
          }
        }
        break;
      }

      case 'reveal':
      case 'write': {
        const posX = action.position?.x ?? action.metadata?.x ?? 50;
        const posY = action.position?.y ?? action.metadata?.y ?? 28;
        const isTitle = posY <= 16 && !action.content?.includes('\n') && (action.content?.length || 0) < 60;
        const isLatex = Boolean(action.metadata?.latex);

        if (isTitle) {
          for (const [existingId, existingEl] of this.elements.entries()) {
            if (existingEl.position && existingEl.position.y <= 16 && existingEl.type === 'text') {
              this.elements.delete(existingId);
            }
          }
        }

        const newEl: LiveBoardElement = {
          id: action.id || actionId,
          groupId: action.groupId,
          persistence: isTitle ? 'persistent' : action.persistence || 'temporary',
          type: isLatex ? 'formula' : 'text',
          content: action.content || '',
          latex: action.metadata?.latex,
          position: {
            x: Math.max(10, Math.min(90, posX)),
            y: Math.max(6, Math.min(92, posY)),
          },
          fontSize: action.metadata?.fontSize || (isLatex ? '3xl' : isTitle ? '2xl' : 'xl'),
          color: action.metadata?.color || (isLatex ? '#38BDF8' : '#FFFFFF'),
          progress: 1.0,
          createdAt: Date.now(),
        };
        this.elements.set(newEl.id, newEl);
        break;
      }

      case 'draw': {
        const posX = action.position?.x ?? action.metadata?.x ?? 50;
        const posY = action.position?.y ?? action.metadata?.y ?? 60;

        const rawSvg = action.metadata?.svgContent || (typeof action.content === 'string' && action.content.includes('<svg') ? action.content : null);
        const cleanSvg = sanitizeSvg(rawSvg);

        if (cleanSvg) {
          const svgEl: LiveBoardElement = {
            id: action.id || actionId,
            groupId: action.groupId,
            persistence: 'temporary',
            type: 'svg',
            svgContent: cleanSvg,
            primitive: 'custom_svg',
            position: {
              x: Math.max(15, Math.min(85, posX)),
              y: Math.max(25, Math.min(85, posY)),
            },
            progress: 1.0,
            createdAt: Date.now(),
          };
          this.elements.set(svgEl.id, svgEl);
        } else if ((action.metadata as any)?.drawType) {
          const meta = action.metadata as any;
          const pathEl: LiveBoardElement = {
            id: action.id || actionId,
            groupId: action.groupId,
            persistence: 'temporary',
            type: 'diagram',
            primitive: 'custom',
            diagramProps: {
              drawType: meta.drawType,
              d: meta.d,
              x1: meta.x1,
              y1: meta.y1,
              x2: meta.x2,
              y2: meta.y2,
              cx: meta.cx,
              cy: meta.cy,
              r: meta.r,
              label: meta.label || action.content,
              strokeWidth: meta.strokeWidth || 2.5,
              durationMs: meta.durationMs || 900,
              fill: meta.fill,
            },
            position: {
              x: Math.max(10, Math.min(90, posX)),
              y: Math.max(15, Math.min(90, posY)),
            },
            color: action.metadata?.color || '#38BDF8',
            progress: 0,
            createdAt: Date.now(),
          };
          this.elements.set(pathEl.id, pathEl);
          const elId = pathEl.id;
          const dur = meta.durationMs || 900;
          const start = Date.now();
          const tick = () => {
            const el = this.elements.get(elId);
            if (!el) return;
            const t = Math.min(1, (Date.now() - start) / dur);
            el.progress = t;
            this.elements.set(elId, { ...el });
            this.notify();
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        } else {
          const composed = action.metadata?.diagram;
          const diagramEl: LiveBoardElement = {
            id: action.id || actionId,
            groupId: action.groupId,
            persistence: 'temporary',
            type: 'diagram',
            primitive: action.metadata?.primitive || 'custom_svg',
            diagramProps: {
              ...(action.metadata?.diagramProps || {}),
              diagram: composed,
            },
            diagram: composed,
            position: {
              x: Math.max(25, Math.min(75, posX)),
              y: Math.max(35, Math.min(80, posY)),
            },
            color: action.metadata?.color || '#38BDF8',
            progress: 1.0,
            createdAt: Date.now(),
          };
          this.elements.set(diagramEl.id, diagramEl);
        }
        break;
      }

      case 'arrow': {
        const posX = action.position?.x ?? action.metadata?.x ?? 50;
        const posY = action.position?.y ?? action.metadata?.y ?? 50;
        const newEl: LiveBoardElement = {
          id: action.id || actionId,
          groupId: action.groupId,
          persistence: 'temporary',
          type: 'arrow',
          content: action.content || '',
          position: {
            x: Math.max(10, Math.min(90, posX)),
            y: Math.max(10, Math.min(90, posY)),
          },
          color: action.metadata?.color || '#FACC15',
          progress: 1.0,
          createdAt: Date.now(),
        };
        this.elements.set(newEl.id, newEl);
        break;
      }

      case 'label': {
        const posX = action.position?.x ?? action.metadata?.x ?? 55;
        const posY = action.position?.y ?? action.metadata?.y ?? 86;
        const newEl: LiveBoardElement = {
          id: action.id || actionId,
          groupId: action.groupId,
          persistence: 'temporary',
          type: 'label',
          content: action.content || '',
          position: {
            x: Math.max(10, Math.min(90, posX)),
            y: Math.max(10, Math.min(92, posY)),
          },
          color: action.metadata?.color || '#FACC15',
          fontSize: 'lg',
          progress: 1.0,
          createdAt: Date.now(),
        };
        this.elements.set(newEl.id, newEl);
        break;
      }

      case 'highlight': {
        if (action.target) this.activeHighlights.add(action.target);
        break;
      }

      case 'circle': {
        if (action.target) this.activeCircles.add(action.target);
        break;
      }

      case 'underline': {
        if (action.target) this.activeUnderlines.add(action.target);
        break;
      }

      default:
        break;
    }

    this.notify();
  }

  public setFocusedElement(elementId: string | null) {
    this.focusedElementId = elementId;
    this.notify();
  }

  public reset() {
    this.elements.clear();
    this.clearOverlays();
    this.runtimeState = 'IDLE';
    this.notify();
  }
}
