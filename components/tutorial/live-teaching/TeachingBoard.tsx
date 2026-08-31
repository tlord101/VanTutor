import React, { useRef, useEffect, useMemo } from 'react';
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
  className?: string;
}

/**
 * 95% FULLSCREEN LIVE TEACHING WHITEBOARD
 * Replaces card-based UIs with a unified lecturer blackboard surface.
 * All text, formulas, diagrams, arrows, annotations, and examples exist directly
 * on this single viewport without requiring scrolling or panning.
 */
export const TeachingBoard: React.FC<TeachingBoardProps> = ({
  elements,
  activeHighlights = new Set(),
  activeCircles = new Set(),
  activeUnderlines = new Set(),
  tutorPointer,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Resize canvas to container
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

  // Canvas background grid & tutor laser pointer
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

      // Subtle chalk grid dots
      const dotSpacing = 32;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      for (let x = 16; x < rect.width; x += dotSpacing) {
        for (let y = 16; y < rect.height; y += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Tutor Laser Pointer Glow (if active)
      if (tutorPointer?.active) {
        const px = (tutorPointer.x / 100) * rect.width;
        const py = (tutorPointer.y / 100) * rect.height;

        const rad = ctx.createRadialGradient(px, py, 2, px, py, 32);
        rad.addColorStop(0, 'rgba(250, 204, 21, 0.9)');
        rad.addColorStop(0.4, 'rgba(250, 204, 21, 0.3)');
        rad.addColorStop(1, 'rgba(250, 204, 21, 0)');

        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(px, py, 32, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [tutorPointer]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-[#0F172A] rounded-2xl sm:rounded-3xl border border-[#1E293B] shadow-2xl overflow-hidden select-none font-sans text-slate-100 flex items-center justify-center ${className}`}
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, #17233D 0%, #0B1120 70%, #070B14 100%)',
      }}
    >
      {/* 1. Underlying Canvas for Background Grid & Pointer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* 2. Unified Teaching Surface (Everything placed in 0-100% Normalized Safe Viewport) */}
      <div className="absolute inset-0 w-full h-full pointer-events-none z-10">
        {elements.map((el) => {
          const posX = `${el.position.x}%`;
          const posY = `${el.position.y}%`;
          const isHighlighted = activeHighlights.has(el.id);
          const isCircled = activeCircles.has(el.id);
          const isUnderlined = activeUnderlines.has(el.id);

          // ── A. FORMULA ELEMENT (KaTeX directly on the board) ──
          if (el.type === 'formula' || el.latex) {
            let renderedHtml = '';
            try {
              renderedHtml = katex.renderToString(el.latex || el.content || '', {
                displayMode: true,
                throwOnError: false,
              });
            } catch {
              renderedHtml = `<span>${el.content}</span>`;
            }

            return (
              <div
                key={el.id}
                style={{ left: posX, top: posY }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-all duration-500 animate-in fade-in zoom-in-95 ${
                  isHighlighted ? 'scale-105 filter drop-shadow-[0_0_16px_rgba(56,189,248,0.8)]' : ''
                }`}
              >
                <div className="relative flex flex-col items-center">
                  <div
                    className={`text-2xl sm:text-3xl font-bold tracking-wider select-none ${
                      isHighlighted ? 'text-[#38BDF8]' : 'text-white'
                    }`}
                    style={{ color: el.color || '#38BDF8' }}
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />

                  {/* Chalk Underline */}
                  {isUnderlined && (
                    <svg className="w-full h-3 mt-1 overflow-visible animate-in fade-in" viewBox="0 0 100 10" preserveAspectRatio="none">
                      <path d="M 0 5 Q 50 10 100 4" fill="none" stroke="#FACC15" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}

                  {/* Hand-Drawn Chalk Circle */}
                  {isCircled && (
                    <svg className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] pointer-events-none animate-in zoom-in" viewBox="0 0 120 60" preserveAspectRatio="none">
                      <path d="M 10 30 Q 15 5 60 5 Q 110 5 110 30 Q 110 55 58 55 Q 8 55 12 28" fill="none" stroke="#FACC15" strokeWidth="2.5" strokeDasharray="3 1" />
                    </svg>
                  )}
                </div>
              </div>
            );
          }

          // ── B. DIAGRAM ELEMENT (Direct SVG Vector Illustration) ──
          if (el.type === 'diagram') {
            return (
              <div
                key={el.id}
                style={{ left: posX, top: posY }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-all duration-500 animate-in zoom-in-95 ${
                  isHighlighted ? 'filter drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]' : ''
                }`}
              >
                <div className="relative">
                  <BoardDiagramPrimitives
                    type={el.primitive || 'physics_block'}
                    width={320}
                    height={200}
                    progress={el.progress ?? 1.0}
                    color={el.color || '#38BDF8'}
                    metadata={el.diagramProps}
                  />

                  {isCircled && (
                    <svg className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] pointer-events-none animate-in zoom-in" viewBox="0 0 120 60" preserveAspectRatio="none">
                      <path d="M 10 30 Q 15 5 60 5 Q 110 5 110 30 Q 110 55 58 55 Q 8 55 12 28" fill="none" stroke="#FACC15" strokeWidth="2.5" />
                    </svg>
                  )}
                </div>
              </div>
            );
          }

          // ── C. ARROW & RELATION ELEMENT ──
          if (el.type === 'arrow') {
            return (
              <div
                key={el.id}
                style={{ left: posX, top: posY }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto animate-in fade-in duration-300"
              >
                <div className="flex items-center gap-2">
                  <svg width="48" height="24" viewBox="0 0 48 24" className="overflow-visible">
                    <line x1="0" y1="12" x2="40" y2="12" stroke={el.color || '#FACC15'} strokeWidth="3" strokeLinecap="round" />
                    <polygon points="38,6 48,12 38,18" fill={el.color || '#FACC15'} />
                  </svg>
                  {el.content && (
                    <span className="text-xs sm:text-sm font-bold text-[#FACC15] tracking-wide whitespace-nowrap">
                      {el.content}
                    </span>
                  )}
                </div>
              </div>
            );
          }

          // ── D. LABEL ELEMENT (Variable breakdowns: F → Force) ──
          if (el.type === 'label') {
            return (
              <div
                key={el.id}
                style={{ left: posX, top: posY }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto animate-in fade-in duration-300"
              >
                <span className="text-xs sm:text-sm font-bold text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
                  {el.content}
                </span>
              </div>
            );
          }

          // ── E. TEXT / TITLE / WORKED EXAMPLE ELEMENT ──
          const isTitle = el.position.y < 20;
          const isMultline = (el.content || '').includes('\n');

          return (
            <div
              key={el.id}
              style={{ left: posX, top: posY }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-all duration-300 animate-in fade-in ${
                isHighlighted ? 'filter drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]' : ''
              }`}
            >
              <div className="flex flex-col items-center">
                {isTitle ? (
                  <h2 className="text-lg sm:text-2xl font-black text-white tracking-widest uppercase text-center border-b-2 border-[#0066FF] pb-1">
                    {el.content}
                  </h2>
                ) : isMultline ? (
                  <div className="font-mono text-xs sm:text-sm text-slate-300 leading-relaxed space-y-1 text-left bg-black/20 p-2.5 rounded-xl border border-white/5">
                    {el.content?.split('\n').map((line, idx) => (
                      <p key={idx} className="whitespace-pre">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p
                    className="text-sm sm:text-base font-semibold text-slate-200 tracking-wide text-center"
                    style={{ color: el.color || '#E2E8F0' }}
                  >
                    {el.content}
                  </p>
                )}

                {/* Chalk Underline */}
                {isUnderlined && !isTitle && (
                  <svg className="w-full h-2 mt-0.5" viewBox="0 0 100 8" preserveAspectRatio="none">
                    <path d="M 0 4 Q 50 8 100 3" fill="none" stroke="#FACC15" strokeWidth="2.5" />
                  </svg>
                )}

                {/* Hand-Drawn Chalk Circle */}
                {isCircled && (
                  <svg className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] pointer-events-none animate-in zoom-in" viewBox="0 0 120 60" preserveAspectRatio="none">
                    <path d="M 10 30 Q 15 5 60 5 Q 110 5 110 30 Q 110 55 58 55 Q 8 55 12 28" fill="none" stroke="#FACC15" strokeWidth="2.5" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
