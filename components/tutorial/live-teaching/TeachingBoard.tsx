import React, { useRef, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { LiveBoardElement } from '../../../types/teachingScript';
import { BoardDiagramPrimitives } from './BoardDiagramPrimitives';

export interface TeachingBoardProps {
  elements: LiveBoardElement[];
  activeHighlights?: Set<string>;
  activeCircles?: Set<string>;
  activeUnderlines?: Set<string>;
  tutorPointer?: { x: number; y: number; active: boolean; color?: string } | null;
  isAudioReady?: boolean;
  className?: string;
}

/**
 * FIXED SINGLE VIEWPORT WHITEBOARD SURFACE
 * Features:
 * - Single visible board viewport (0-100% normalized safe coordinates). No page scrolling.
 * - Every board element sits directly on the chalkboard canvas without card-like background wrappers.
 * - Progressive reveal synchronized with spoken lecture audio position.
 */
export const TeachingBoard: React.FC<TeachingBoardProps> = ({
  elements,
  activeHighlights = new Set(),
  activeCircles = new Set(),
  activeUnderlines = new Set(),
  tutorPointer,
  isAudioReady = true,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Resize canvas to fixed container bounds
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Canvas background chalk grid
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      // Subtle grid dots
      const dotSpacing = 32;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      for (let x = 16; x < rect.width; x += dotSpacing) {
        for (let y = 16; y < rect.height; y += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-[#0F172A] rounded-2xl sm:rounded-3xl border border-[#1E293B] shadow-2xl overflow-hidden select-none font-sans text-slate-100 flex flex-col ${className}`}
      style={{
        background: 'radial-gradient(ellipse at 50% 20%, #131E35 0%, #0B1120 60%, #070B14 100%)',
      }}
    >
      {/* 1. Underlying Canvas for Chalk Grid */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* 2. Fixed Viewport Area (0-100% Normalized Placement) */}
      <div className="relative z-10 w-full h-full overflow-hidden">
        {isAudioReady &&
          elements.map((el) => {
            const posX = Math.max(5, Math.min(95, el.position?.x ?? 50));
            const posY = Math.max(5, Math.min(95, el.position?.y ?? 50));

            const isHighlighted = activeHighlights.has(el.id);
            const isCircled = activeCircles.has(el.id);
            const isUnderlined = activeUnderlines.has(el.id);

            return (
              <div
                key={el.id}
                className="absolute transition-all duration-300 animate-in fade-in zoom-in-95 pointer-events-auto"
                style={{
                  left: `${posX}%`,
                  top: `${posY}%`,
                  transform: 'translate(-50%, -50%)',
                  maxWidth: '90%',
                }}
              >
                {/* ── A. FORMULA ELEMENT ── */}
                {(el.type === 'formula' || el.latex) && (
                  <div className="relative flex flex-col items-center justify-center">
                    <div
                      className={`text-lg sm:text-2xl md:text-3xl font-bold tracking-wide ${
                        isHighlighted ? 'text-[#38BDF8] scale-105' : 'text-white'
                      }`}
                      style={{ color: el.color || '#38BDF8' }}
                      dangerouslySetInnerHTML={{
                        __html: katex.renderToString(el.latex || el.content || '', {
                          displayMode: true,
                          throwOnError: false,
                        }),
                      }}
                    />
                    {isUnderlined && (
                      <svg className="w-full h-2.5 mt-1 overflow-visible" viewBox="0 0 100 8" preserveAspectRatio="none">
                        <path d="M 0 4 Q 50 8 100 3" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                      </svg>
                    )}
                    {isCircled && (
                      <svg className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] pointer-events-none" viewBox="0 0 120 60" preserveAspectRatio="none">
                        <path d="M 10 30 Q 15 5 60 5 Q 110 5 110 30 Q 110 55 58 55 Q 8 55 12 28" fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeDasharray="4 2" />
                      </svg>
                    )}
                  </div>
                )}

                {/* ── B. DIAGRAM ELEMENT ── */}
                {el.type === 'diagram' && (
                  <div className="relative flex flex-col items-center justify-center">
                    <BoardDiagramPrimitives
                      type={el.primitive || 'custom'}
                      diagram={el.diagram}
                      width={320}
                      height={200}
                      progress={el.progress ?? 1.0}
                      color={el.color || '#38BDF8'}
                      activeHighlights={activeHighlights}
                      activeCircles={activeCircles}
                      activeUnderlines={activeUnderlines}
                      metadata={el.diagramProps}
                    />
                    {isCircled && (
                      <svg className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] pointer-events-none" viewBox="0 0 120 60" preserveAspectRatio="none">
                        <path d="M 10 30 Q 15 5 60 5 Q 110 5 110 30 Q 110 55 58 55 Q 8 55 12 28" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                      </svg>
                    )}
                  </div>
                )}

                {/* ── C. ARROW ELEMENT ── */}
                {el.type === 'arrow' && (
                  <div className="flex items-center gap-2">
                    <svg width="40" height="20" viewBox="0 0 40 20" className="overflow-visible">
                      <line x1="0" y1="10" x2="32" y2="10" stroke={el.color || '#38BDF8'} strokeWidth="3" strokeLinecap="round" />
                      <polygon points="30,4 40,10 30,16" fill={el.color || '#38BDF8'} />
                    </svg>
                    {el.content && (
                      <span className="text-xs sm:text-sm font-bold text-[#38BDF8]">
                        {el.content}
                      </span>
                    )}
                  </div>
                )}

                {/* ── D. LABEL ELEMENT ── */}
                {el.type === 'label' && (
                  <span className="text-xs sm:text-sm font-bold text-[#38BDF8]">
                    {el.content}
                  </span>
                )}

                {/* ── E. TEXT ELEMENT ── */}
                {el.type === 'text' && (
                  <div className="relative text-center">
                    <p
                      className={`font-semibold tracking-wide transition-all ${
                        posY <= 18
                          ? 'text-base sm:text-xl md:text-2xl font-black uppercase text-white border-b-2 border-[#38BDF8] pb-1'
                          : 'text-xs sm:text-base text-slate-100'
                      } ${isHighlighted ? 'text-[#38BDF8] scale-105' : ''}`}
                      style={{ color: el.color || undefined }}
                    >
                      {el.content}
                    </p>
                    {isUnderlined && (
                      <svg className="w-full h-2 mt-1" viewBox="0 0 100 8" preserveAspectRatio="none">
                        <path d="M 0 4 Q 50 8 100 3" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {/* 3. Lecturer Pointer Indicator */}
        {tutorPointer && tutorPointer.active && (
          <div
            className="absolute z-30 w-4 h-4 rounded-full bg-[#38BDF8] shadow-[0_0_16px_#38BDF8] transition-all duration-300 pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${tutorPointer.x}%`,
              top: `${tutorPointer.y}%`,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default TeachingBoard;
