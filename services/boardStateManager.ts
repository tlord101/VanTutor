/**
 * Live Board State Manager
 * - Fixed viewport positions
 * - Hard clear between concepts; diagrams always temporary
 * - Preserves composed diagram JSON from AI
 */

import { BoardAction, LiveBoardElement, BoardState } from '../types/teachingScript';

export class BoardStateManager {
  private elements: Map<string, LiveBoardElement> = new Map();
  private activeHighlights: Set<string> = new Set();
  private activeCircles: Set<string> = new Set();
  private activeUnderlines: Set<string> = new Set();
  private listeners: Set<(state: BoardState) => void> = new Set();

  constructor(initialElements: LiveBoardElement[] = []) {
    initialElements.forEach((el) => this.elements.set(el.id, el));
  }

  public subscribe(listener: (state: BoardState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): BoardState {
    return {
      elements: new Map(this.elements),
      activeHighlights: new Set(this.activeHighlights),
      activeCircles: new Set(this.activeCircles),
      activeUnderlines: new Set(this.activeUnderlines),
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  private clearOverlays() {
    this.activeHighlights.clear();
    this.activeCircles.clear();
    this.activeUnderlines.clear();
  }

  private clearAllDiagrams() {
    for (const [id, el] of this.elements.entries()) {
      if (el.type === 'diagram' || el.type === 'arrow' || el.type === 'label') {
        this.elements.delete(id);
        this.activeHighlights.delete(id);
        this.activeCircles.delete(id);
        this.activeUnderlines.delete(id);
      }
    }
  }

  public applyAction(action: BoardAction): void {
    const actionId = action.id || `act_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    switch (action.type) {
      case 'clear_board': {
        this.elements.clear();
        this.clearOverlays();
        break;
      }

      case 'retain': {
        for (const [id, el] of this.elements.entries()) {
          if (el.persistence !== 'persistent' || el.type === 'diagram' || el.type === 'arrow' || el.type === 'label') {
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

        for (const [existingId, existingEl] of this.elements.entries()) {
          if (
            existingEl.content === action.content ||
            (isLatex && existingEl.latex === (action.metadata?.latex || action.content))
          ) {
            this.elements.delete(existingId);
          }
        }

        // Near-position dedupe for non-key-point text only
        const content = action.content || '';
        const isBullet = content.trim().startsWith('•') || content.trim().startsWith('-');
        if (!isBullet) {
          for (const [existingId, existingEl] of this.elements.entries()) {
            if (
              (existingEl.type === 'text' || existingEl.type === 'formula') &&
              Math.abs((existingEl.position?.y ?? 0) - posY) < 6 &&
              Math.abs((existingEl.position?.x ?? 0) - posX) < 12
            ) {
              this.elements.delete(existingId);
            }
          }
        }

        const newEl: LiveBoardElement = {
          id: action.id || actionId,
          groupId: action.groupId,
          persistence: isTitle ? 'persistent' : action.persistence || 'temporary',
          type: isLatex ? 'formula' : 'text',
          content,
          latex: action.metadata?.latex,
          position: {
            x: Math.max(10, Math.min(90, posX)),
            y: Math.max(6, Math.min(92, posY)),
          },
          fontSize: action.metadata?.fontSize || (isLatex ? '2xl' : isTitle ? 'xl' : 'md'),
          color: action.metadata?.color || (isLatex ? '#38BDF8' : '#FFFFFF'),
          progress: 1.0,
          createdAt: Date.now(),
        };
        this.elements.set(newEl.id, newEl);
        break;
      }

      case 'draw': {
        const posX = action.position?.x ?? action.metadata?.x ?? 60;
        const posY = action.position?.y ?? action.metadata?.y ?? 62;

        this.clearAllDiagrams();

        const composed = action.metadata?.diagram;
        const newEl: LiveBoardElement = {
          id: action.id || actionId,
          groupId: action.groupId,
          persistence: 'temporary',
          type: 'diagram',
          primitive: action.metadata?.primitive || 'concept_map',
          diagramProps: {
            ...(action.metadata?.diagramProps || {}),
            diagram: composed,
          },
          diagram: composed,
          position: {
            x: Math.max(35, Math.min(75, posX)),
            y: Math.max(45, Math.min(78, posY)),
          },
          color: action.metadata?.color || '#38BDF8',
          progress: 1.0,
          createdAt: Date.now(),
        };
        this.elements.set(newEl.id, newEl);
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
          fontSize: 'sm',
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

  public reset() {
    this.elements.clear();
    this.clearOverlays();
    this.notify();
  }
}
