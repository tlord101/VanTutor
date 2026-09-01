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
 * Renders AI-composed diagrams (rect/circle/arrow/text/...) or rich preset fallbacks.
 * Never shows an empty dashed placeholder box.
 */
export const BoardDiagramPrimitives: React.FC<DiagramPrimitiveProps> = ({
  type = 'custom',
  diagram: directDiagram,
  width = 380,
  height = 260,
  progress = 1.0,
  color = '#38BDF8',
  activeHighlights = new Set(),
  activeCircles = new Set(),
  activeUnderlines = new Set(),
  metadata,
}) => {
  const p = Math.min(1.0, Math.max(0.05, progress));
  const activeDiagram: ComposedDiagram | undefined = directDiagram || metadata?.diagram;

  const renderSubElement = (el: DiagramSubElement): React.ReactNode => {
    const isHighlighted = activeHighlights.has(el.id);
    const isCircled = activeCircles.has(el.id);

    const strokeColor = isHighlighted ? '#38BDF8' : (el.stroke || el.color || color || '#38BDF8');
    const fillColor =
      el.fill ||
      (el.type === 'circle' || el.type === 'rect' || el.type === 'ellipse'
        ? 'rgba(56, 189, 248, 0.12)'
        : 'none');
    const strokeWidth = el.strokeWidth || (isHighlighted ? 3.5 : 2.2);

    switch (el.type) {
      case 'rect': {
        const x = (el.position?.x ?? 10) * 3.6;
        const y = (el.position?.y ?? 10) * 2.4;
        const w = (el.size?.width ?? 22) * 3.6;
        const h = (el.size?.height ?? 14) * 2.4;
        return (
          <g key={el.id}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={7}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={el.strokeDasharray}
            />
            {el.label && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 4}
                textAnchor="middle"
                fill={isHighlighted ? '#38BDF8' : '#F8FAFC'}
                fontSize={Number(el.fontSize) || 11}
                fontWeight={700}
              >
                {el.label}
              </text>
            )}
            {isCircled && (
              <ellipse
                cx={x + w / 2}
                cy={y + h / 2}
                rx={w / 2 + 8}
                ry={h / 2 + 8}
                fill="none"
                stroke="#38BDF8"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            )}
          </g>
        );
      }

      case 'circle': {
        const cx = (el.position?.x ?? 50) * 3.6;
        const cy = (el.position?.y ?? 50) * 2.4;
        const r = (el.radius ?? 10) * 2.0;
        return (
          <g key={el.id}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={fillColor === 'none' ? 'rgba(56,189,248,0.2)' : fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            {el.label && (
              <text
                x={cx}
                y={cy + r + 13}
                textAnchor="middle"
                fill={isHighlighted ? '#38BDF8' : '#F8FAFC'}
                fontSize={Number(el.fontSize) || 10}
                fontWeight={600}
              >
                {el.label}
              </text>
            )}
            {isCircled && (
              <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="#38BDF8" strokeWidth={2} strokeDasharray="4 2" />
            )}
          </g>
        );
      }

      case 'ellipse': {
        const cx = (el.position?.x ?? 50) * 3.6;
        const cy = (el.position?.y ?? 50) * 2.4;
        const rx = (el.rx ?? 18) * 3.6;
        const ry = (el.ry ?? 10) * 2.4;
        return (
          <g key={el.id}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
            {el.label && (
              <text x={cx} y={cy + 4} textAnchor="middle" fill="#F8FAFC" fontSize={Number(el.fontSize) || 11} fontWeight={600}>
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
        const toX =
          typeof el.to === 'object'
            ? el.to.x * 3.6
            : ((el.position?.x ?? 10) + (el.size?.width ?? 30)) * 3.6;
        const toY = typeof el.to === 'object' ? el.to.y * 2.4 : (el.position?.y ?? 50) * 2.4;
        const isArrow = el.type === 'arrow' || el.type === 'connector';
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        const markerId = `ah-${el.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

        return (
          <g key={el.id}>
            {isArrow && (
              <defs>
                <marker
                  id={markerId}
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
            <line
              x1={fromX}
              y1={fromY}
              x2={toX}
              y2={toY}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={el.strokeDasharray}
              markerEnd={isArrow ? `url(#${markerId})` : undefined}
            />
            {el.label && (
              <text x={midX} y={midY - 6} textAnchor="middle" fill="#FACC15" fontSize={10} fontWeight={700}>
                {el.label}
              </text>
            )}
          </g>
        );
      }

      case 'path':
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

      case 'text': {
        const x = (el.position?.x ?? 50) * 3.6;
        const y = (el.position?.y ?? 50) * 2.4;
        return (
          <text
            key={el.id}
            x={x}
            y={y}
            textAnchor="middle"
            fill={isHighlighted ? '#38BDF8' : el.color || '#FFFFFF'}
            fontSize={Number(el.fontSize) || 12}
            fontWeight={700}
          >
            {el.content || el.label}
          </text>
        );
      }

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
            <div
              className={`text-center text-xs font-bold ${isHighlighted ? 'text-[#38BDF8]' : 'text-white'}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </foreignObject>
        );
      }

      case 'group':
        return <g key={el.id}>{(el.elements || []).map((sub) => renderSubElement(sub))}</g>;

      default:
        return null;
    }
  };

  // Prefer AI-composed diagram
  if (activeDiagram?.elements && activeDiagram.elements.length > 0) {
    return (
      <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
        {activeDiagram.elements.map((subEl) => renderSubElement(subEl))}
      </svg>
    );
  }

  // Rich preset fallbacks (never empty box)
  const t = (type || '').toLowerCase();

  if (t.includes('flow') || t.includes('process') || t.includes('sequence')) {
    return (
      <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
        <defs>
          <marker id="flow-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#34D399" />
          </marker>
        </defs>
        <rect x="15" y="85" width="90" height="48" rx="10" fill="rgba(56,189,248,0.12)" stroke="#38BDF8" strokeWidth={2.5} />
        <text x="60" y="113" textAnchor="middle" fill="#F8FAFC" fontSize={12} fontWeight={700}>
          Stage 1
        </text>
        {p >= 0.35 && (
          <>
            <line x1="105" y1="109" x2="130" y2="109" stroke="#34D399" strokeWidth={2.5} markerEnd="url(#flow-arr)" />
            <rect x="135" y="85" width="90" height="48" rx="10" fill="rgba(250,204,21,0.12)" stroke="#FACC15" strokeWidth={2.5} />
            <text x="180" y="113" textAnchor="middle" fill="#F8FAFC" fontSize={12} fontWeight={700}>
              Stage 2
            </text>
          </>
        )}
        {p >= 0.7 && (
          <>
            <line x1="225" y1="109" x2="250" y2="109" stroke="#34D399" strokeWidth={2.5} markerEnd="url(#flow-arr)" />
            <rect x="255" y="85" width="90" height="48" rx="10" fill="rgba(52,211,153,0.15)" stroke="#34D399" strokeWidth={2.5} />
            <text x="300" y="113" textAnchor="middle" fill="#34D399" fontSize={12} fontWeight={700}>
              Outcome
            </text>
          </>
        )}
      </svg>
    );
  }

  if (t.includes('cycle') || t.includes('loop')) {
    return (
      <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
        <path d="M 180 35 A 70 70 0 0 1 245 145" fill="none" stroke="#38BDF8" strokeWidth={3} strokeDasharray="5 3" />
        <path d="M 245 145 A 70 70 0 0 1 115 145" fill="none" stroke="#FACC15" strokeWidth={3} strokeDasharray="5 3" />
        <path d="M 115 145 A 70 70 0 0 1 180 35" fill="none" stroke="#34D399" strokeWidth={3} strokeDasharray="5 3" />
        <circle cx="180" cy="35" r="22" fill="#1E293B" stroke="#38BDF8" strokeWidth={2} />
        <text x="180" y="39" textAnchor="middle" fill="#FFF" fontSize={10} fontWeight={700}>
          Stage 1
        </text>
        {p >= 0.5 && (
          <>
            <circle cx="245" cy="145" r="22" fill="#1E293B" stroke="#FACC15" strokeWidth={2} />
            <text x="245" y="149" textAnchor="middle" fill="#FFF" fontSize={10} fontWeight={700}>
              Stage 2
            </text>
          </>
        )}
        {p >= 0.8 && (
          <>
            <circle cx="115" cy="145" r="22" fill="#1E293B" stroke="#34D399" strokeWidth={2} />
            <text x="115" y="149" textAnchor="middle" fill="#FFF" fontSize={10} fontWeight={700}>
              Stage 3
            </text>
          </>
        )}
      </svg>
    );
  }

  if (t.includes('venn') || t.includes('compare')) {
    return (
      <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
        <circle cx="140" cy="110" r="72" fill="rgba(56,189,248,0.18)" stroke="#38BDF8" strokeWidth={2.5} />
        <text x="100" y="114" textAnchor="middle" fill="#38BDF8" fontSize={12} fontWeight={700}>
          Set A
        </text>
        {p >= 0.45 && (
          <>
            <circle cx="220" cy="110" r="72" fill="rgba(250,204,21,0.15)" stroke="#FACC15" strokeWidth={2.5} />
            <text x="260" y="114" textAnchor="middle" fill="#FACC15" fontSize={12} fontWeight={700}>
              Set B
            </text>
          </>
        )}
        {p >= 0.85 && (
          <text x="180" y="114" textAnchor="middle" fill="#FFF" fontSize={11} fontWeight={700}>
            Shared
          </text>
        )}
      </svg>
    );
  }

  if (t.includes('table')) {
    return (
      <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
        <rect x="30" y="30" width="300" height="160" rx="8" fill="rgba(15,23,42,0.6)" stroke="#38BDF8" strokeWidth={2} />
        <rect x="30" y="30" width="300" height="36" fill="rgba(56,189,248,0.2)" />
        <text x="105" y="54" textAnchor="middle" fill="#38BDF8" fontSize={12} fontWeight={700}>
          Aspect
        </text>
        <text x="255" y="54" textAnchor="middle" fill="#38BDF8" fontSize={12} fontWeight={700}>
          Detail
        </text>
        <line x1="180" y1="30" x2="180" y2="190" stroke="#334155" strokeWidth={1.5} />
        <line x1="30" y1="90" x2="330" y2="90" stroke="#334155" strokeWidth={1} />
        <line x1="30" y1="140" x2="330" y2="140" stroke="#334155" strokeWidth={1} />
        <text x="105" y="120" textAnchor="middle" fill="#E2E8F0" fontSize={11}>
          Feature A
        </text>
        <text x="255" y="120" textAnchor="middle" fill="#94A3B8" fontSize={11}>
          Rule / property
        </text>
        {p >= 0.6 && (
          <>
            <text x="105" y="168" textAnchor="middle" fill="#E2E8F0" fontSize={11}>
              Feature B
            </text>
            <text x="255" y="168" textAnchor="middle" fill="#94A3B8" fontSize={11}>
              Contrast
            </text>
          </>
        )}
      </svg>
    );
  }

  if (t.includes('physics') || t.includes('force') || t.includes('newton')) {
    return (
      <svg viewBox="0 0 360 220" width={width} height={height} className="overflow-visible select-none">
        <defs>
          <marker id="ph-y" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#FACC15" />
          </marker>
          <marker id="ph-c" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38BDF8" />
          </marker>
        </defs>
        <line x1="20" y1="160" x2="340" y2="160" stroke="#475569" strokeWidth={2.5} strokeDasharray="4 4" />
        <rect x="130" y="95" width="100" height="65" rx="8" fill="#1E293B" stroke="#94A3B8" strokeWidth={2.5} />
        <text x="180" y="134" textAnchor="middle" fill="#FFF" fontSize={15} fontWeight={700}>
          Mass (m)
        </text>
        {p >= 0.3 && (
          <>
            <line x1="230" y1="127" x2="320" y2="127" stroke="#FACC15" strokeWidth={3} markerEnd="url(#ph-y)" />
            <text x="275" y="115" fill="#FACC15" fontSize={13} fontWeight={700}>
              F →
            </text>
          </>
        )}
        {p >= 0.6 && (
          <>
            <line x1="180" y1="95" x2="180" y2="30" stroke="#38BDF8" strokeWidth={2.5} markerEnd="url(#ph-c)" />
            <text x="190" y="50" fill="#38BDF8" fontSize={12} fontWeight={700}>
              N
            </text>
          </>
        )}
      </svg>
    );
  }

  // Default: concept mind-map (never empty box)
  return (
    <svg viewBox="0 0 360 240" width={width} height={height} className="overflow-visible select-none">
      <defs>
        <marker id="cm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B" />
        </marker>
      </defs>
      <rect x="120" y="18" width="120" height="40" rx="10" fill="rgba(56,189,248,0.18)" stroke="#38BDF8" strokeWidth={2.5} />
      <text x="180" y="43" textAnchor="middle" fill="#F8FAFC" fontSize={13} fontWeight={700}>
        Core Concept
      </text>
      {p >= 0.35 && (
        <>
          <line x1="150" y1="58" x2="70" y2="100" stroke="#64748B" strokeWidth={2} markerEnd="url(#cm-arr)" />
          <line x1="180" y1="58" x2="180" y2="100" stroke="#64748B" strokeWidth={2} markerEnd="url(#cm-arr)" />
          <line x1="210" y1="58" x2="290" y2="100" stroke="#64748B" strokeWidth={2} markerEnd="url(#cm-arr)" />
          <rect x="20" y="105" width="100" height="36" rx="8" fill="rgba(250,204,21,0.12)" stroke="#FACC15" strokeWidth={2} />
          <text x="70" y="127" textAnchor="middle" fill="#FACC15" fontSize={11} fontWeight={700}>
            Branch A
          </text>
          <rect x="130" y="105" width="100" height="36" rx="8" fill="rgba(52,211,153,0.12)" stroke="#34D399" strokeWidth={2} />
          <text x="180" y="127" textAnchor="middle" fill="#34D399" fontSize={11} fontWeight={700}>
            Branch B
          </text>
          <rect x="240" y="105" width="100" height="36" rx="8" fill="rgba(192,132,252,0.12)" stroke="#C084FC" strokeWidth={2} />
          <text x="290" y="127" textAnchor="middle" fill="#C084FC" fontSize={11} fontWeight={700}>
            Branch C
          </text>
        </>
      )}
      {p >= 0.75 && (
        <>
          <circle cx="70" cy="185" r="14" fill="#FACC15" opacity={0.85} />
          <circle cx="180" cy="185" r="14" fill="#34D399" opacity={0.85} />
          <circle cx="290" cy="185" r="14" fill="#C084FC" opacity={0.85} />
          <line x1="70" y1="141" x2="70" y2="171" stroke="#64748B" strokeWidth={1.5} />
          <line x1="180" y1="141" x2="180" y2="171" stroke="#64748B" strokeWidth={1.5} />
          <line x1="290" y1="141" x2="290" y2="171" stroke="#64748B" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
};
