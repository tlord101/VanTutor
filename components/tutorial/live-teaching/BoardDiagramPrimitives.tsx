import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ComposedDiagram, DiagramSubElement } from '../../../types/teachingScript';

export interface DiagramPrimitiveProps {
  type?: string;
  diagram?: ComposedDiagram;
  width?: number;
  height?: number;
  progress?: number;
  color?: string;
  activeHighlights?: Set<string>;
  activeCircles?: Set<string>;
  activeUnderlines?: Set<string>;
  metadata?: any;
}

/**
 * Scene-first chalkboard illustrations.
 * Prefer realistic chalk scenes over box/arrow flowcharts.
 */
export const BoardDiagramPrimitives: React.FC<DiagramPrimitiveProps> = ({
  type = 'custom',
  diagram: directDiagram,
  width = 380,
  height = 240,
  progress = 1.0,
  color = '#38BDF8',
  activeHighlights = new Set(),
  activeCircles = new Set(),
  metadata,
}) => {
  const p = Math.min(1.0, Math.max(0.05, progress));
  const activeDiagram: ComposedDiagram | undefined = directDiagram || metadata?.diagram;
  const t = (type || metadata?.primitive || 'scene_workspace').toLowerCase();

  // Scene primitives take priority over abstract composed graphs
  const isScene =
    t.startsWith('scene_') ||
    t.includes('worked') ||
    t.includes('equation') ||
    t.includes('person') ||
    t.includes('stress') ||
    t.includes('body') ||
    t.includes('classroom') ||
    t.includes('nature') ||
    t.includes('workspace') ||
    t.includes('balance') ||
    t.includes('scale');

  // ---------- SCENE: person under stress / pressure ----------
  if (t.includes('stress') || t.includes('person_stress') || t === 'scene_person_stress') {
    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        {/* ground */}
        <line x1="40" y1="200" x2="320" y2="200" stroke="#475569" strokeWidth={2} />
        {/* body */}
        <circle cx="180" cy="70" r="22" fill="#1E293B" stroke="#E2E8F0" strokeWidth={2.5} />
        <line x1="180" y1="92" x2="180" y2="145" stroke="#E2E8F0" strokeWidth={3} />
        <line x1="180" y1="110" x2="145" y2="135" stroke="#E2E8F0" strokeWidth={2.5} />
        <line x1="180" y1="110" x2="215" y2="135" stroke="#E2E8F0" strokeWidth={2.5} />
        <line x1="180" y1="145" x2="155" y2="190" stroke="#E2E8F0" strokeWidth={2.5} />
        <line x1="180" y1="145" x2="205" y2="190" stroke="#E2E8F0" strokeWidth={2.5} />
        {/* worried brows */}
        <path d="M 168 64 Q 175 60 180 64" fill="none" stroke="#F87171" strokeWidth={2} />
        <path d="M 180 64 Q 185 60 192 64" fill="none" stroke="#F87171" strokeWidth={2} />
        {p >= 0.4 && (
          <>
            {/* weight blocks above head */}
            <rect x="150" y="18" width="60" height="18" rx={3} fill="#334155" stroke="#FACC15" strokeWidth={2} />
            <text x="180" y="31" textAnchor="middle" fill="#FACC15" fontSize={10} fontWeight={700}>
              Pressure
            </text>
            <line x1="180" y1="36" x2="180" y2="48" stroke="#F87171" strokeWidth={2} strokeDasharray="3 2" />
          </>
        )}
        {p >= 0.75 && (
          <>
            <path d="M 120 55 Q 100 40 110 25" fill="none" stroke="#38BDF8" strokeWidth={2} />
            <text x="95" y="22" fill="#38BDF8" fontSize={10} fontWeight={600}>
              Tension
            </text>
            <path d="M 240 55 Q 260 40 250 25" fill="none" stroke="#38BDF8" strokeWidth={2} />
            <text x="255" y="22" fill="#38BDF8" fontSize={10} fontWeight={600}>
              Load
            </text>
          </>
        )}
      </svg>
    );
  }

  // ---------- SCENE: simple body ----------
  if (t.includes('body') || t === 'scene_body') {
    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        <ellipse cx="180" cy="48" rx="20" ry="24" fill="none" stroke="#E2E8F0" strokeWidth={2.5} />
        <path
          d="M 160 70 Q 140 100 145 150 Q 150 190 180 200 Q 210 190 215 150 Q 220 100 200 70"
          fill="rgba(56,189,248,0.08)"
          stroke="#E2E8F0"
          strokeWidth={2.5}
        />
        {p >= 0.4 && (
          <>
            <ellipse cx="180" cy="110" rx="28" ry="18" fill="rgba(248,113,113,0.2)" stroke="#F87171" strokeWidth={2} />
            <text x="180" y="114" textAnchor="middle" fill="#F87171" fontSize={11} fontWeight={700}>
              Core
            </text>
          </>
        )}
        {p >= 0.75 && (
          <text x="240" y="100" fill="#38BDF8" fontSize={11} fontWeight={600}>
            Response
          </text>
        )}
      </svg>
    );
  }

  // ---------- SCENE: classroom ----------
  if (t.includes('classroom') || t === 'scene_classroom') {
    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        <rect x="50" y="30" width="260" height="120" rx={6} fill="#0F172A" stroke="#38BDF8" strokeWidth={2} />
        <text x="180" y="95" textAnchor="middle" fill="#64748B" fontSize={14} fontWeight={600}>
          Board
        </text>
        {p >= 0.35 && (
          <>
            <rect x="100" y="170" width="70" height="28" rx={4} fill="#1E293B" stroke="#94A3B8" strokeWidth={2} />
            <rect x="190" y="170" width="70" height="28" rx={4} fill="#1E293B" stroke="#94A3B8" strokeWidth={2} />
            <circle cx="135" cy="160" r="10" fill="none" stroke="#E2E8F0" strokeWidth={2} />
            <circle cx="225" cy="160" r="10" fill="none" stroke="#E2E8F0" strokeWidth={2} />
          </>
        )}
        {p >= 0.7 && (
          <text x="180" y="55" textAnchor="middle" fill="#FACC15" fontSize={12} fontWeight={700}>
            Learn together
          </text>
        )}
      </svg>
    );
  }

  // ---------- SCENE: balance scale ----------
  if (t.includes('balance') || t.includes('scale')) {
    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        <line x1="180" y1="50" x2="180" y2="160" stroke="#94A3B8" strokeWidth={3} />
        <line x1="80" y1="90" x2="280" y2="90" stroke="#E2E8F0" strokeWidth={3} />
        <line x1="150" y1="160" x2="210" y2="160" stroke="#475569" strokeWidth={4} />
        <path d="M 80 90 L 60 130 L 100 130 Z" fill="rgba(56,189,248,0.15)" stroke="#38BDF8" strokeWidth={2} />
        <path d="M 280 90 L 260 130 L 300 130 Z" fill="rgba(250,204,21,0.15)" stroke="#FACC15" strokeWidth={2} />
        {p >= 0.5 && (
          <>
            <text x="80" y="150" textAnchor="middle" fill="#38BDF8" fontSize={11} fontWeight={700}>
              Side A
            </text>
            <text x="280" y="150" textAnchor="middle" fill="#FACC15" fontSize={11} fontWeight={700}>
              Side B
            </text>
          </>
        )}
      </svg>
    );
  }

  // ---------- SCENE: nature ----------
  if (t.includes('nature')) {
    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        <line x1="30" y1="190" x2="330" y2="190" stroke="#334155" strokeWidth={2} />
        <circle cx="280" cy="55" r="22" fill="rgba(250,204,21,0.25)" stroke="#FACC15" strokeWidth={2} />
        <line x1="120" y1="190" x2="120" y2="120" stroke="#78716C" strokeWidth={4} />
        <ellipse cx="120" cy="100" rx="40" ry="30" fill="rgba(52,211,153,0.25)" stroke="#34D399" strokeWidth={2} />
        {p >= 0.5 && (
          <path d="M 40 190 Q 80 150 100 190" fill="rgba(56,189,248,0.15)" stroke="#38BDF8" strokeWidth={2} />
        )}
        {p >= 0.8 && (
          <text x="200" y="140" fill="#E2E8F0" fontSize={12} fontWeight={600}>
            Environment
          </text>
        )}
      </svg>
    );
  }

  // ---------- SCENE: workspace / study ----------
  if (t.includes('workspace') || t.includes('study') || t === 'scene_workspace') {
    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        <rect x="40" y="150" width="280" height="14" rx={2} fill="#334155" />
        <rect x="70" y="70" width="120" height="80" rx={4} fill="#0F172A" stroke="#E2E8F0" strokeWidth={2} />
        <line x1="85" y1="95" x2="175" y2="95" stroke="#64748B" strokeWidth={1.5} />
        <line x1="85" y1="110" x2="165" y2="110" stroke="#64748B" strokeWidth={1.5} />
        <line x1="85" y1="125" x2="170" y2="125" stroke="#64748B" strokeWidth={1.5} />
        {p >= 0.4 && (
          <>
            <rect x="210" y="100" width="70" height="50" rx={4} fill="#1E293B" stroke="#38BDF8" strokeWidth={2} />
            <text x="245" y="130" textAnchor="middle" fill="#38BDF8" fontSize={11} fontWeight={700}>
              Notes
            </text>
          </>
        )}
        {p >= 0.75 && (
          <text x="130" y="55" textAnchor="middle" fill="#FACC15" fontSize={12} fontWeight={700}>
            Focus
          </text>
        )}
      </svg>
    );
  }

  // ---------- Worked solution: minimal frame (text does the work) ----------
  if (t.includes('worked') || t.includes('equation')) {
    return (
      <svg viewBox="0 0 360 120" width={width} height={Math.min(height, 120)} className="overflow-visible select-none">
        <rect
          x="20"
          y="20"
          width="320"
          height="80"
          rx={10}
          fill="rgba(15,23,42,0.5)"
          stroke="#334155"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <text x="180" y="65" textAnchor="middle" fill="#64748B" fontSize={12} fontWeight={600}>
          Worked steps on the board →
        </text>
      </svg>
    );
  }

  // Physics forces only when explicitly requested
  if (t.includes('force') || t.includes('physics') || t.includes('newton')) {
    return (
      <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
        <defs>
          <marker id="ph-y" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#FACC15" />
          </marker>
        </defs>
        <line x1="20" y1="160" x2="340" y2="160" stroke="#475569" strokeWidth={2.5} strokeDasharray="4 4" />
        <rect x="130" y="95" width="100" height="65" rx={8} fill="#1E293B" stroke="#94A3B8" strokeWidth={2.5} />
        <text x="180" y="134" textAnchor="middle" fill="#FFF" fontSize={15} fontWeight={700}>
          Mass (m)
        </text>
        {p >= 0.35 && (
          <>
            <line x1="230" y1="127" x2="320" y2="127" stroke="#FACC15" strokeWidth={3} markerEnd="url(#ph-y)" />
            <text x="275" y="115" fill="#FACC15" fontSize={13} fontWeight={700}>
              F →
            </text>
          </>
        )}
      </svg>
    );
  }

  // Composed diagram only if it does not look like a generic 3-box flow
  if (!isScene && activeDiagram?.elements && activeDiagram.elements.length > 0) {
    const renderSubElement = (el: DiagramSubElement): React.ReactNode => {
      const strokeColor = activeHighlights.has(el.id) ? '#38BDF8' : el.stroke || color;
      switch (el.type) {
        case 'text': {
          const x = (el.position?.x ?? 50) * 3.6;
          const y = (el.position?.y ?? 50) * 2.4;
          return (
            <text key={el.id} x={x} y={y} textAnchor="middle" fill="#F8FAFC" fontSize={Number(el.fontSize) || 12} fontWeight={700}>
              {el.content || el.label}
            </text>
          );
        }
        case 'path':
          return <path key={el.id} d={el.d || ''} fill={el.fill || 'none'} stroke={strokeColor} strokeWidth={2} />;
        case 'formula': {
          const x = (el.position?.x ?? 50) * 3.6;
          const y = (el.position?.y ?? 50) * 2.4;
          let html = '';
          try {
            html = katex.renderToString(el.latex || el.content || '', { throwOnError: false });
          } catch {
            html = el.content || '';
          }
          return (
            <foreignObject key={el.id} x={x - 80} y={y - 18} width={160} height={36}>
              <div className="text-center text-xs font-bold text-white" dangerouslySetInnerHTML={{ __html: html }} />
            </foreignObject>
          );
        }
        default:
          return null;
      }
    };

    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        {activeDiagram.elements.map((subEl) => renderSubElement(subEl))}
      </svg>
    );
  }

  // Default: workspace scene (never a flow map)
  return (
    <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
      <rect x="40" y="150" width="280" height="14" rx={2} fill="#334155" />
      <rect x="90" y="60" width="180" height="90" rx={6} fill="#0F172A" stroke="#38BDF8" strokeWidth={2} />
      <line x1="110" y1="90" x2="250" y2="90" stroke="#475569" strokeWidth={1.5} />
      <line x1="110" y1="110" x2="230" y2="110" stroke="#475569" strokeWidth={1.5} />
      <line x1="110" y1="130" x2="240" y2="130" stroke="#475569" strokeWidth={1.5} />
      <text x="180" y="50" textAnchor="middle" fill="#94A3B8" fontSize={12} fontWeight={600}>
        On the board
      </text>
    </svg>
  );
};
