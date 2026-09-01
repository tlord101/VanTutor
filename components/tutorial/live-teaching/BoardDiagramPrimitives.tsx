import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ComposedDiagram, DiagramSubElement } from '../../../types/teachingScript';

export interface DiagramPrimitiveProps {
  type?: string;
  diagram?: ComposedDiagram;
  width?: number;
  height?: number;
  progress?: number; // 0.0 to 1.0 progressive build
  color?: string;
  activeHighlights?: Set<string>;
  activeCircles?: Set<string>;
  activeUnderlines?: Set<string>;
  metadata?: any;
}

/**
 * Generic Primitive Vector Diagram Renderer.
 * Renders custom AI-composed diagrams built from primitive elements (rect, circle, arrow, line, path, text, etc.),
 * or falls back to preset discipline primitives.
 */
export const BoardDiagramPrimitives: React.FC<DiagramPrimitiveProps> = ({
  type = 'custom',
  diagram: directDiagram,
  width = 360,
  height = 240,
  progress = 1.0,
  color = '#38BDF8',
  activeHighlights = new Set(),
  activeCircles = new Set(),
  activeUnderlines = new Set(),
  metadata,
}) => {
  const p = Math.min(1.0, Math.max(0.05, progress));
  const activeDiagram: ComposedDiagram | undefined = directDiagram || metadata?.diagram;

  // Render sub-elements recursively from Qwen's composed diagram JSON schema
  const renderSubElement = (el: DiagramSubElement): React.ReactNode => {
    const isHighlighted = activeHighlights.has(el.id);
    const isCircled = activeCircles.has(el.id);
    const isUnderlined = activeUnderlines.has(el.id);

    const strokeColor = isHighlighted ? '#38BDF8' : (el.stroke || el.color || color || '#38BDF8');
    const fillColor = el.fill || (el.type === 'circle' || el.type === 'rect' ? 'rgba(56, 189, 248, 0.08)' : 'none');
    const strokeWidth = el.strokeWidth || (isHighlighted ? 3.5 : 2.5);

    switch (el.type) {
      case 'rect': {
        const x = (el.position?.x ?? 10) * 3.6;
        const y = (el.position?.y ?? 10) * 2.4;
        const w = (el.size?.width ?? 20) * 3.6;
        const h = (el.size?.height ?? 20) * 2.4;

        return (
          <g key={el.id} className="transition-all duration-300">
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={6}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={el.strokeDasharray}
            />
            {el.label && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 5}
                textAnchor="middle"
                fill={isHighlighted ? '#38BDF8' : '#FFFFFF'}
                fontSize={el.fontSize || 12}
                fontWeight="600"
              >
                {el.label}
              </text>
            )}
            {isCircled && (
              <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2 + 10} ry={h / 2 + 10} fill="none" stroke="#38BDF8" strokeWidth="2" strokeDasharray="4 2" />
            )}
          </g>
        );
      }

      case 'circle': {
        const cx = (el.position?.x ?? 50) * 3.6;
        const cy = (el.position?.y ?? 50) * 2.4;
        const r = (el.radius ?? 15) * 2.0;

        return (
          <g key={el.id} className="transition-all duration-300">
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={el.strokeDasharray}
            />
            {el.label && (
              <text
                x={cx}
                y={cy + r + 14}
                textAnchor="middle"
                fill={isHighlighted ? '#38BDF8' : '#FFFFFF'}
                fontSize={el.fontSize || 11}
                fontWeight="600"
              >
                {el.label}
              </text>
            )}
            {isCircled && (
              <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="#38BDF8" strokeWidth="2" strokeDasharray="4 2" />
            )}
          </g>
        );
      }

      case 'ellipse': {
        const cx = (el.position?.x ?? 50) * 3.6;
        const cy = (el.position?.y ?? 50) * 2.4;
        const rx = (el.rx ?? 20) * 3.6;
        const ry = (el.ry ?? 12) * 2.4;

        return (
          <g key={el.id} className="transition-all duration-300">
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            {el.label && (
              <text x={cx} y={cy + 4} textAnchor="middle" fill="#FFFFFF" fontSize={el.fontSize || 11} fontWeight="600">
                {el.label}
              </text>
            )}
          </g>
        );
      }

      case 'line':
      case 'arrow':
      case 'connector': {
        const fromX = typeof el.from === 'object' ? el.from.x * 3.6 : (el.position?.x ?? 10) * 3.6;
        const fromY = typeof el.from === 'object' ? el.from.y * 2.4 : (el.position?.y ?? 50) * 2.4;
        const toX = typeof el.to === 'object' ? el.to.x * 3.6 : ((el.position?.x ?? 10) + (el.size?.width ?? 30)) * 3.6;
        const toY = typeof el.to === 'object' ? el.to.y * 2.4 : (el.position?.y ?? 50) * 2.4;

        const isArrow = el.type === 'arrow' || el.type === 'connector';
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;

        return (
          <g key={el.id} className="transition-all duration-300">
            <line
              x1={fromX}
              y1={fromY}
              x2={toX}
              y2={toY}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={el.strokeDasharray}
              markerEnd={isArrow ? `url(#arrow-head-${el.id})` : undefined}
            />
            {isArrow && (
              <defs>
                <marker
                  id={`arrow-head-${el.id}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
                </marker>
              </defs>
            )}
            {el.label && (
              <text
                x={midX}
                y={midY - 8}
                textAnchor="middle"
                fill={isHighlighted ? '#38BDF8' : '#FACC15'}
                fontSize={el.fontSize || 11}
                fontWeight="700"
              >
                {el.label}
              </text>
            )}
          </g>
        );
      }

      case 'path': {
        return (
          <path
            key={el.id}
            d={el.d || ''}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={el.strokeDasharray}
          />
        );
      }

      case 'text': {
        const x = (el.position?.x ?? 50) * 3.6;
        const y = (el.position?.y ?? 50) * 2.4;

        return (
          <text
            key={el.id}
            x={x}
            y={y}
            textAnchor="middle"
            fill={isHighlighted ? '#38BDF8' : (el.color || '#FFFFFF')}
            fontSize={el.fontSize || 12}
            fontWeight="bold"
          >
            {el.content || el.label}
          </text>
        );
      }

      case 'formula': {
        const x = (el.position?.x ?? 50) * 3.6;
        const y = (el.position?.y ?? 50) * 2.4;

        let renderedHtml = '';
        try {
          renderedHtml = katex.renderToString(el.latex || el.content || '', { throwOnError: false });
        } catch {
          renderedHtml = el.content || '';
        }

        return (
          <foreignObject key={el.id} x={x - 80} y={y - 20} width={160} height={40}>
            <div
              className={`text-center text-xs sm:text-sm font-bold ${isHighlighted ? 'text-[#38BDF8]' : 'text-white'}`}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </foreignObject>
        );
      }

      case 'group': {
        return (
          <g key={el.id}>
            {(el.elements || []).map((sub) => renderSubElement(sub))}
          </g>
        );
      }

      default:
        return null;
    }
  };

  // If a composed diagram is supplied by Qwen, render it directly
  if (activeDiagram && activeDiagram.elements && activeDiagram.elements.length > 0) {
    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        {activeDiagram.elements.map((subEl) => renderSubElement(subEl))}
      </svg>
    );
  }

  // Fallback preset primitives
  switch (type) {
    case 'physics_force_vectors':
    case 'physics_block':
    case 'physics_force':
    case 'physics_pulley':
    case 'physics_spring':
    case 'physics_wave':
    case 'force_vector':
    case 'newton_second_law': {
      const showF = p >= 0.3;
      const showN = p >= 0.6;
      const showW = p >= 0.8;
      const showA = p >= 0.95;

      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          <defs>
            <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#38BDF8" />
            </marker>
            <marker id="arrow-yellow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#FACC15" />
            </marker>
          </defs>

          <line x1="20" y1="160" x2="340" y2="160" stroke="#475569" strokeWidth="2.5" strokeDasharray="4 4" />
          {[40, 80, 120, 160, 200, 240, 280, 320].map((hx) => (
            <line key={hx} x1={hx} y1="160" x2={hx - 10} y2="175" stroke="#334155" strokeWidth="1.5" />
          ))}

          <rect x="130" y="95" width="100" height="65" rx="8" fill="#1E293B" stroke="#94A3B8" strokeWidth="2.5" />
          <text x="180" y="134" textAnchor="middle" fill="#FFFFFF" fontSize="16" fontWeight="700">Mass (m)</text>

          {showF && (
            <g>
              <line x1="230" y1="127" x2="320" y2="127" stroke="#FACC15" strokeWidth="3" markerEnd="url(#arrow-yellow)" />
              <text x="280" y="115" fill="#FACC15" fontSize="14" fontWeight="bold">Force (F) →</text>
            </g>
          )}

          {showN && (
            <g>
              <line x1="180" y1="95" x2="180" y2="25" stroke="#38BDF8" strokeWidth="2.5" markerEnd="url(#arrow-cyan)" />
              <text x="190" y="45" fill="#38BDF8" fontSize="13" fontWeight="bold">Normal (N)</text>
            </g>
          )}

          {showW && (
            <g>
              <line x1="180" y1="160" x2="180" y2="210" stroke="#F87171" strokeWidth="2.5" markerEnd="url(#arrow-cyan)" />
              <text x="190" y="200" fill="#F87171" fontSize="13" fontWeight="bold">W = mg</text>
            </g>
          )}

          {showA && (
            <g>
              <rect x="235" y="40" width="105" height="34" rx="6" fill="#064E3B" stroke="#34D399" strokeWidth="1.5" />
              <text x="287" y="62" textAnchor="middle" fill="#34D399" fontSize="12" fontWeight="bold">a = F / m ➔</text>
            </g>
          )}
        </svg>
      );
    }

    case 'circuit':
    case 'circuit_schematic':
    case 'ohms_law': {
      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          <path d="M 60 110 L 60 40 L 140 40 M 220 40 L 300 40 L 300 180 L 60 180 L 60 130" fill="none" stroke="#94A3B8" strokeWidth="3" />
          <g transform="translate(45, 95)">
            <line x1="0" y1="10" x2="30" y2="10" stroke="#FACC15" strokeWidth="4" />
            <line x1="6" y1="25" x2="24" y2="25" stroke="#94A3B8" strokeWidth="2.5" />
            <text x="-25" y="14" fill="#FACC15" fontSize="14" fontWeight="bold">+ V -</text>
          </g>
          <path d="M 140 40 L 147 25 L 160 55 L 173 25 L 186 55 L 199 25 L 212 55 L 220 40" fill="none" stroke="#38BDF8" strokeWidth="3.5" />
          <text x="180" y="16" textAnchor="middle" fill="#38BDF8" fontSize="14" fontWeight="bold">Resistor (R)</text>
        </svg>
      );
    }

    default: {
      return (
        <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
          <rect x="20" y="20" width="320" height="180" rx="12" fill="none" stroke="#38BDF8" strokeWidth="2" strokeDasharray="4 4" />
          <text x="180" y="115" textAnchor="middle" fill="#38BDF8" fontSize="14" fontWeight="bold">Interactive Whiteboard Diagram</text>
        </svg>
      );
    }
  }
};
