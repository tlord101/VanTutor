/**
 * Live Board State Manager
 * Coordinates the live whiteboard surface state:
 * - Elements (Text, Formulas, Diagrams, Illustrations, Arrows, Labels)
 * - Progressive step-by-step rendering
 * - Persistent vs Temporary lifecycle management
 * - Group and individual erasing
 * - Single-viewport containment (0-100% normalized safe coordinates)
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

  /**
   * Applies an action to the whiteboard state
   */
  public applyAction(action: BoardAction): void {
    const actionId = action.id || `act_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    switch (action.type) {
      case 'clear_board': {
        this.elements.clear();
        this.activeHighlights.clear();
        this.activeCircles.clear();
        this.activeUnderlines.clear();
        break;
      }

      case 'retain': {
        // Erase all temporary elements, keep persistent ones
        for (const [id, el] of this.elements.entries()) {
          if (el.persistence !== 'persistent') {
            this.elements.delete(id);
          }
        }
        this.activeHighlights.clear();
        this.activeCircles.clear();
        this.activeUnderlines.clear();
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
        const posY = action.position?.y ?? action.metadata?.y ?? 30;

        const isLatex = Boolean(action.metadata?.latex || action.content?.includes('\\') || action.content?.includes('=') && !action.content?.includes('->'));
        
        const newEl: LiveBoardElement = {
          id: action.id || actionId,
          groupId: action.groupId,
          persistence: action.persistence || 'temporary',
          type: isLatex ? 'formula' : 'text',
          content: action.content || '',
          latex: action.metadata?.latex || (isLatex ? action.content : undefined),
          position: {
            x: Math.max(5, Math.min(95, posX)),
            y: Math.max(5, Math.min(95, posY)),
          },
          fontSize: action.metadata?.fontSize || (isLatex ? '2xl' : 'lg'),
          color: action.metadata?.color || (isLatex ? '#38BDF8' : '#FFFFFF'),
          progress: 1.0,
          createdAt: Date.now(),
        };
        this.elements.set(newEl.id, newEl);
        break;
      }

      case 'draw': {
        const posX = action.position?.x ?? action.metadata?.x ?? 50;
        const posY = action.position?.y ?? action.metadata?.y ?? 55;

        const newEl: LiveBoardElement = {
          id: action.id || actionId,
          groupId: action.groupId,
          persistence: action.persistence || 'temporary',
          type: 'diagram',
          primitive: action.metadata?.primitive || 'physics_block',
          diagramProps: action.metadata?.diagramProps || {},
          position: {
            x: Math.max(10, Math.min(90, posX)),
            y: Math.max(15, Math.min(85, posY)),
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
          persistence: action.persistence || 'temporary',
          type: 'arrow',
          content: action.content || '',
          position: { x: posX, y: posY },
          color: action.metadata?.color || '#FACC15',
          progress: 1.0,
          createdAt: Date.now(),
        };
        this.elements.set(newEl.id, newEl);
        break;
      }

      case 'label': {
        const posX = action.position?.x ?? action.metadata?.x ?? 50;
        const posY = action.position?.y ?? action.metadata?.y ?? 50;

        const newEl: LiveBoardElement = {
          id: action.id || actionId,
          groupId: action.groupId,
          persistence: action.persistence || 'temporary',
          type: 'label',
          content: action.content || '',
          position: { x: posX, y: posY },
          color: action.metadata?.color || '#FACC15',
          fontSize: 'sm',
          progress: 1.0,
          createdAt: Date.now(),
        };
        this.elements.set(newEl.id, newEl);
        break;
      }

      case 'highlight': {
        if (action.target) {
          this.activeHighlights.add(action.target);
        }
        break;
      }

      case 'circle': {
        if (action.target) {
          this.activeCircles.add(action.target);
        }
        break;
      }

      case 'underline': {
        if (action.target) {
          this.activeUnderlines.add(action.target);
        }
        break;
      }

      default:
        break;
    }

    this.notify();
  }

  public reset() {
    this.elements.clear();
    this.activeHighlights.clear();
    this.activeCircles.clear();
    this.activeUnderlines.clear();
    this.notify();
  }
}
