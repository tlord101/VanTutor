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
 * LIVE TEACHING WHITEBOARD SURFACE
 * Features:
 * - Anti-clustering responsive vertical flow layout.
 * - Smooth downward scrolling for extensive derivations & notes.
 * - Auto-scrolls downwards when new elements/derivations are written.
 * - Rich KaTeX math & SVG scientific diagram primitives.
 * - Clean academic chalkboard texture without distracting yellow laser glow.
 */
export const TeachingBoard: React.FC<TeachingBoardProps> = ({
  elements,
  activeHighlights = new Set(),
  activeCircles = new Set(),
  activeUnderlines = new Set(),
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
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

  // Canvas background chalk grid (No yellow laser pointer glow)
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

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  // Auto-scroll downwards smoothly as new elements are written
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [elements.length]);

  // Separate title element from content body elements
  const { titleElements, bodyElements } = useMemo(() => {
    const titles: LiveBoardElement[] = [];
    const bodies: LiveBoardElement[] = [];

    // Sort by sequential order or vertical position
    const sorted = [...elements].sort((a, b) => {
      if (a.position && b.position) {
        return a.position.y - b.position.y;
      }
      return 0;
    });

    for (const el of sorted) {
      if (el.type === 'text' && el.position && el.position.y <= 15 && !(el.content || '').includes('\n')) {
        titles.push(el);
      } else {
        bodies.push(el);
      }
    }

    return { titleElements: titles, bodyElements: bodies };
  }, [elements]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-[#0F172A] rounded-2xl sm:rounded-3xl border border-[#1E293B] shadow-2xl overflow-hidden select-none font-sans text-slate-100 flex flex-col ${className}`}
      style={{
        background: 'radial-gradient(ellipse at 50% 20%, #131E35 0%, #0B1120 60%, #070B14 100%)',
      }}
    >
      {/* 1. Underlying Canvas for Background Grid */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* 2. Scrollable Board Body (Allows student to scroll downwards seamlessly) */}
      <div
        ref={scrollAreaRef}
        className="relative z-10 flex-1 w-full overflow-y-auto overflow-x-hidden p-4 sm:p-8 space-y-6 sm:space-y-8 scroll-smooth"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#1E293B transparent',
        }}
      >
        {/* Top Board Titles */}
        {titleElements.map((el) => {
          const isHighlighted = activeHighlights.has(el.id);
          const isUnderlined = activeUnderlines.has(el.id);
          return (
            <div key={el.id} className="text-center py-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <h2
                className={`inline-block text-lg sm:text-2xl md:text-3xl font-black tracking-widest uppercase pb-1.5 transition-all ${
                  isHighlighted ? 'text-[#38BDF8] scale-105' : 'text-white'
                }`}
                style={{
                  borderBottom: `2px solid ${isHighlighted ? '#38BDF8' : '#0066FF'}`,
                  color: el.color || '#FFFFFF',
                }}
              >
                {el.content}
              </h2>
              {isUnderlined && (
                <svg className="w-48 mx-auto h-2 mt-1" viewBox="0 0 100 8" preserveAspectRatio="none">
                  <path d="M 0 4 Q 50 8 100 3" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                </svg>
              )}
            </div>
          );
        })}

        {/* Structured Blackboard Flow Area */}
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6 sm:gap-8 min-h-[60%] justify-center">
          {bodyElements.map((el) => {
            const isHighlighted = activeHighlights.has(el.id);
            const isCircled = activeCircles.has(el.id);
            const isUnderlined = activeUnderlines.has(el.id);

            // ── A. FORMULA ELEMENT ──
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
                  className={`relative flex flex-col items-center justify-center p-3 sm:p-5 rounded-2xl transition-all duration-300 animate-in fade-in zoom-in-95 max-w-full overflow-x-auto ${
                    isHighlighted
                      ? 'bg-[#38BDF8]/10 ring-2 ring-[#38BDF8]/50 shadow-[0_0_24px_rgba(56,189,248,0.25)]'
                      : 'bg-black/25 border border-white/5 shadow-inner'
                  }`}
                >
                  <div
                    className={`text-xl sm:text-3xl md:text-4xl font-bold tracking-wide select-none ${
                      isHighlighted ? 'text-[#38BDF8]' : 'text-white'
                    }`}
                    style={{ color: el.color || '#38BDF8' }}
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />

                  {/* Chalk Underline */}
                  {isUnderlined && (
                    <svg className="w-full h-3 mt-2 overflow-visible" viewBox="0 0 100 10" preserveAspectRatio="none">
                      <path d="M 0 5 Q 50 10 100 4" fill="none" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}

                  {/* Hand-Drawn Chalk Circle */}
                  {isCircled && (
                    <svg className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] pointer-events-none animate-in zoom-in" viewBox="0 0 120 60" preserveAspectRatio="none">
                      <path d="M 10 30 Q 15 5 60 5 Q 110 5 110 30 Q 110 55 58 55 Q 8 55 12 28" fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeDasharray="4 2" />
                    </svg>
                  )}
                </div>
              );
            }

            // ── B. DIAGRAM ELEMENT ──
            if (el.type === 'diagram') {
              return (
                <div
                  key={el.id}
                  className={`relative p-3 sm:p-5 rounded-2xl bg-black/25 border border-white/5 shadow-inner transition-all duration-300 animate-in zoom-in-95 flex flex-col items-center ${
                    isHighlighted ? 'ring-2 ring-[#38BDF8] shadow-[0_0_24px_rgba(56,189,248,0.25)]' : ''
                  }`}
                >
                  <BoardDiagramPrimitives
                    type={el.primitive || 'physics_block'}
                    width={340}
                    height={200}
                    progress={el.progress ?? 1.0}
                    color={el.color || '#38BDF8'}
                    metadata={el.diagramProps}
                  />

                  {isCircled && (
                    <svg className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] pointer-events-none animate-in zoom-in" viewBox="0 0 120 60" preserveAspectRatio="none">
                      <path d="M 10 30 Q 15 5 60 5 Q 110 5 110 30 Q 110 55 58 55 Q 8 55 12 28" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                    </svg>
                  )}
                </div>
              );
            }

            // ── C. ARROW & RELATION ELEMENT ──
            if (el.type === 'arrow') {
              return (
                <div
                  key={el.id}
                  className="flex items-center gap-3 py-1 animate-in fade-in duration-300"
                >
                  <svg width="48" height="24" viewBox="0 0 48 24" className="overflow-visible">
                    <line x1="0" y1="12" x2="40" y2="12" stroke={el.color || '#38BDF8'} strokeWidth="3" strokeLinecap="round" />
                    <polygon points="38,6 48,12 38,18" fill={el.color || '#38BDF8'} />
                  </svg>
                  {el.content && (
                    <span className="text-xs sm:text-sm font-bold text-[#38BDF8] tracking-wide">
                      {el.content}
                    </span>
                  )}
                </div>
              );
            }

            // ── D. LABEL ELEMENT ──
            if (el.type === 'label') {
              return (
                <div
                  key={el.id}
                  className="animate-in fade-in duration-300"
                >
                  <span className="text-xs sm:text-sm font-bold text-[#38BDF8] bg-[#38BDF8]/10 border border-[#38BDF8]/30 px-3.5 py-1.5 rounded-full shadow-sm">
                    {el.content}
                  </span>
                </div>
              );
            }

            // ── E. TEXT / DERIVATION / MULTI-LINE NOTES ──
            const isMultiline = (el.content || '').includes('\n');

            return (
              <div
                key={el.id}
                className={`relative w-full max-w-2xl transition-all duration-300 animate-in fade-in ${
                  isHighlighted ? 'bg-[#38BDF8]/10 p-4 rounded-2xl ring-1 ring-[#38BDF8]' : ''
                }`}
              >
                {isMultiline ? (
                  <div className="font-mono text-xs sm:text-sm text-slate-200 leading-relaxed space-y-1.5 bg-black/30 p-4 sm:p-5 rounded-2xl border border-white/10 shadow-inner">
                    {el.content?.split('\n').map((line, idx) => (
                      <p key={idx} className="whitespace-pre-wrap">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p
                    className="text-sm sm:text-lg font-medium text-slate-100 tracking-wide text-center leading-relaxed"
                    style={{ color: el.color || '#F1F5F9' }}
                  >
                    {el.content}
                  </p>
                )}

                {/* Chalk Underline */}
                {isUnderlined && (
                  <svg className="w-3/4 mx-auto h-2.5 mt-2" viewBox="0 0 100 8" preserveAspectRatio="none">
                    <path d="M 0 4 Q 50 8 100 3" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                  </svg>
                )}

                {/* Hand-Drawn Chalk Circle */}
                {isCircled && (
                  <svg className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] pointer-events-none animate-in zoom-in" viewBox="0 0 120 60" preserveAspectRatio="none">
                    <path d="M 10 30 Q 15 5 60 5 Q 110 5 110 30 Q 110 55 58 55 Q 8 55 12 28" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TeachingBoard;
