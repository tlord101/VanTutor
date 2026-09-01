import React, { useRef, useEffect, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { LiveBoardElement } from '../../../types/teachingScript';
import { BoardDiagramPrimitives } from './BoardDiagramPrimitives';
import { sanitizeSvg } from '../../../utils/svgSanitizer';

export interface TeachingBoardProps {
  elements: LiveBoardElement[];
  activeHighlights?: Set<string>;
  activeCircles?: Set<string>;
  activeUnderlines?: Set<string>;
  tutorPointer?: { x: number; y: number; active: boolean; color?: string } | null;
  isAudioReady?: boolean;
  className?: string;
}

const TypedText: React.FC<{
  text: string;
  className?: string;
  style?: React.CSSProperties;
  enabled: boolean;
}> = ({ text, className, style, enabled }) => {
  const [shown, setShown] = useState(enabled ? '' : text);

  useEffect(() => {
    if (!enabled) {
      setShown(text);
      return;
    }
    setShown('');
    if (!text) return;
    let i = 0;
    const msPerChar = Math.max(16, Math.min(40, 1200 / Math.max(1, text.length)));
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, msPerChar);
    return () => window.clearInterval(id);
  }, [text, enabled]);

  return (
    <p className={className} style={style}>
      {shown}
      {enabled && shown.length < text.length && (
        <span className="inline-block w-[2px] h-[1em] ml-0.5 align-middle bg-[#38BDF8] animate-pulse" />
      )}
    </p>
  );
};

/**
 * Fixed viewport digital chalkboard:
 * - Clean title at top
 * - Concise, progressive text and formulas
 * - AI-generated custom SVG illustration visual anchor
 * - Synchronized highlight / circle overlays
 */
export const TeachingBoard: React.FC<TeachingBoardProps> = ({
  elements,
  activeHighlights = new Set(),
  activeCircles = new Set(),
  activeUnderlines = new Set(),
  tutorPointer,
  isAudioReady = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
      if (ctx) ctx.scale(dpr, dpr);
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

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
      const spacing = 32;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      for (let x = 16; x < rect.width; x += spacing) {
        for (let y = 16; y < rect.height; y += spacing) {
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
      className={`relative w-full h-full bg-[#0F172A] rounded-2xl sm:rounded-3xl border border-[#1E293B] shadow-2xl overflow-hidden select-none font-sans text-slate-100 ${className}`}
      style={{
        background: 'radial-gradient(ellipse at 50% 18%, #131E35 0%, #0B1120 55%, #070B14 100%)',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

      <div className="relative z-10 w-full h-full overflow-hidden">
        {isAudioReady &&
          elements.map((el) => {
            const posX = Math.max(10, Math.min(90, el.position?.x ?? 50));
            const posY = Math.max(6, Math.min(92, el.position?.y ?? 50));
            const isHighlighted = activeHighlights.has(el.id);
            const isCircled = activeCircles.has(el.id);
            const isUnderlined = activeUnderlines.has(el.id);
            const isTitle = el.type === 'text' && posY <= 16;
            const isKeyPoint =
              el.type === 'text' &&
              !isTitle &&
              ((el.content || '').trim().startsWith('•') ||
                (el.content || '').trim().startsWith('-') ||
                posX < 40);

            const diagramWidth = typeof window !== 'undefined' && window.innerWidth < 640 ? 300 : 420;
            const diagramHeight = typeof window !== 'undefined' && window.innerWidth < 640 ? 190 : 260;

            const safeSvg = el.type === 'svg' || el.svgContent ? sanitizeSvg(el.svgContent) : null;

            return (
              <div
                key={el.id}
                className="absolute pointer-events-none transition-all duration-300"
                style={{
                  left: `${posX}%`,
                  top: `${posY}%`,
                  transform: isKeyPoint ? 'translate(0, -50%)' : 'translate(-50%, -50%)',
                  maxWidth: isTitle
                    ? '88%'
                    : isKeyPoint
                      ? '42%'
                      : el.type === 'diagram' || el.type === 'svg'
                        ? '80%'
                        : '70%',
                  width: el.type === 'diagram' || el.type === 'svg' ? `${Math.min(80, diagramWidth / 4)}%` : undefined,
                }}
              >
                {/* SVG Illustration Element */}
                {(el.type === 'svg' || safeSvg) && safeSvg && (
                  <div className="relative flex flex-col items-center justify-center w-full max-h-[220px] sm:max-h-[300px]">
                    <div
                      className="w-full h-full flex items-center justify-center text-slate-100 [&_svg]:max-w-full [&_svg]:max-h-[220px] sm:[&_svg]:max-h-[300px] [&_svg]:w-auto [&_svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: safeSvg }}
                    />
                    {isCircled && (
                      <div className="absolute inset-0 rounded-xl ring-2 ring-[#38BDF8]/60 pointer-events-none animate-pulse" />
                    )}
                  </div>
                )}

                {/* Formula Element */}
                {(el.type === 'formula' || el.latex) && (
                  <div className="relative flex flex-col items-center justify-center px-1">
                    <div
                      className={`text-sm sm:text-xl md:text-2xl font-bold tracking-wide break-words text-center ${
                        isHighlighted ? 'text-[#38BDF8]' : 'text-white'
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
                      <svg className="w-full h-2 mt-0.5" viewBox="0 0 100 8" preserveAspectRatio="none">
                        <path d="M 0 4 Q 50 8 100 3" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                      </svg>
                    )}
                  </div>
                )}

                {/* Legacy Diagram Fallback Element */}
                {el.type === 'diagram' && !safeSvg && (
                  <div className="relative flex flex-col items-center justify-center w-full">
                    <BoardDiagramPrimitives
                      type={el.primitive || 'concept_map'}
                      diagram={el.diagram}
                      width={diagramWidth}
                      height={diagramHeight}
                      progress={el.progress ?? 1.0}
                      color={el.color || '#38BDF8'}
                      activeHighlights={activeHighlights}
                      activeCircles={activeCircles}
                      activeUnderlines={activeUnderlines}
                      metadata={el.diagramProps}
                    />
                    {isCircled && (
                      <div className="absolute inset-0 rounded-xl ring-2 ring-[#38BDF8]/60 pointer-events-none" />
                    )}
                  </div>
                )}

                {/* Arrow Element */}
                {el.type === 'arrow' && (
                  <div className="flex items-center gap-1.5 justify-center">
                    <svg width="36" height="18" viewBox="0 0 40 20">
                      <line x1="0" y1="10" x2="32" y2="10" stroke={el.color || '#38BDF8'} strokeWidth="3" strokeLinecap="round" />
                      <polygon points="30,4 40,10 30,16" fill={el.color || '#38BDF8'} />
                    </svg>
                    {el.content && (
                      <span className="text-[10px] sm:text-xs font-bold text-[#38BDF8]">{el.content}</span>
                    )}
                  </div>
                )}

                {/* Label Element */}
                {el.type === 'label' && (
                  <span className="text-[10px] sm:text-xs font-bold text-[#FACC15] block text-center px-1">
                    {el.content}
                  </span>
                )}

                {/* Text Element */}
                {el.type === 'text' && !el.latex && (
                  <div className={`relative px-1 ${isKeyPoint ? 'text-left' : 'text-center'} max-w-full`}>
                    <TypedText
                      text={el.content || ''}
                      enabled={isAudioReady}
                      className={`tracking-wide break-words leading-snug ${
                        isTitle
                          ? 'text-sm sm:text-lg md:text-xl font-black uppercase text-white border-b-2 border-[#38BDF8] pb-0.5'
                          : isKeyPoint
                            ? 'text-[11px] sm:text-sm md:text-[15px] font-semibold text-slate-200'
                            : 'text-xs sm:text-sm md:text-base font-semibold text-slate-100'
                      } ${isHighlighted ? 'text-[#38BDF8]' : ''}`}
                      style={{ color: el.color || undefined }}
                    />
                    {isUnderlined && (
                      <svg className="w-full h-1.5 mt-0.5" viewBox="0 0 100 8" preserveAspectRatio="none">
                        <path d="M 0 4 Q 50 8 100 3" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {tutorPointer && tutorPointer.active && (
          <div
            className="absolute z-30 w-3.5 h-3.5 rounded-full bg-[#38BDF8] shadow-[0_0_14px_#38BDF8] pointer-events-none -translate-x-1/2 -translate-y-1/2 animate-ping"
            style={{ left: `${tutorPointer.x}%`, top: `${tutorPointer.y}%` }}
          />
        )}
      </div>
    </div>
  );
};

export default TeachingBoard;
