import React, { useRef, useEffect, useState } from 'react';
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

/** Character-by-character typing for board text while the lecturer speaks */
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
    const msPerChar = Math.max(18, Math.min(45, 1400 / Math.max(1, text.length)));
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
 * FIXED SINGLE VIEWPORT WHITEBOARD
 * - Absolute placement in 0-100% safe bounds
 * - No scroll for lesson content
 * - Content only when isAudioReady
 * - Typing animation for text
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
      className={`relative w-full h-full bg-[#0F172A] rounded-2xl sm:rounded-3xl border border-[#1E293B] shadow-2xl overflow-hidden select-none font-sans text-slate-100 ${className}`}
      style={{
        background: 'radial-gradient(ellipse at 50% 20%, #131E35 0%, #0B1120 60%, #070B14 100%)',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

      <div className="relative z-10 w-full h-full overflow-hidden">
        {isAudioReady &&
          elements.map((el) => {
            const posX = Math.max(12, Math.min(88, el.position?.x ?? 50));
            const posY = Math.max(8, Math.min(90, el.position?.y ?? 50));
            const isHighlighted = activeHighlights.has(el.id);
            const isCircled = activeCircles.has(el.id);
            const isUnderlined = activeUnderlines.has(el.id);
            const isTitle = el.type === 'text' && posY <= 18;

            return (
              <div
                key={el.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${posX}%`,
                  top: `${posY}%`,
                  transform: 'translate(-50%, -50%)',
                  maxWidth: isTitle ? '84%' : '78%',
                  width: el.type === 'diagram' ? 'min(78%, 340px)' : undefined,
                }}
              >
                {(el.type === 'formula' || el.latex) && (
                  <div className="relative flex flex-col items-center justify-center px-2">
                    <div
                      className={`text-base sm:text-xl md:text-2xl font-bold tracking-wide break-words text-center ${
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
                      <svg className="w-full h-2.5 mt-1" viewBox="0 0 100 8" preserveAspectRatio="none">
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

                {el.type === 'diagram' && (
                  <div className="relative flex flex-col items-center justify-center w-full">
                    <BoardDiagramPrimitives
                      type={el.primitive || 'custom'}
                      diagram={el.diagram}
                      width={300}
                      height={180}
                      progress={el.progress ?? 1.0}
                      color={el.color || '#38BDF8'}
                      activeHighlights={activeHighlights}
                      activeCircles={activeCircles}
                      activeUnderlines={activeUnderlines}
                      metadata={el.diagramProps}
                    />
                  </div>
                )}

                {el.type === 'arrow' && (
                  <div className="flex items-center gap-2 justify-center">
                    <svg width="40" height="20" viewBox="0 0 40 20">
                      <line x1="0" y1="10" x2="32" y2="10" stroke={el.color || '#38BDF8'} strokeWidth="3" strokeLinecap="round" />
                      <polygon points="30,4 40,10 30,16" fill={el.color || '#38BDF8'} />
                    </svg>
                    {el.content && (
                      <span className="text-xs sm:text-sm font-bold text-[#38BDF8] whitespace-nowrap">
                        {el.content}
                      </span>
                    )}
                  </div>
                )}

                {el.type === 'label' && (
                  <span className="text-xs sm:text-sm font-bold text-[#38BDF8] block text-center px-2">
                    {el.content}
                  </span>
                )}

                {el.type === 'text' && !el.latex && (
                  <div className="relative text-center px-2 max-w-full">
                    <TypedText
                      text={el.content || ''}
                      enabled={isAudioReady}
                      className={`font-semibold tracking-wide break-words ${
                        isTitle
                          ? 'text-sm sm:text-lg md:text-xl font-black uppercase text-white border-b-2 border-[#38BDF8] pb-1'
                          : 'text-xs sm:text-sm md:text-base text-slate-100'
                      } ${isHighlighted ? 'text-[#38BDF8]' : ''}`}
                      style={{ color: el.color || undefined }}
                    />
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

        {tutorPointer && tutorPointer.active && (
          <div
            className="absolute z-30 w-3.5 h-3.5 rounded-full bg-[#38BDF8] shadow-[0_0_14px_#38BDF8] pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${tutorPointer.x}%`, top: `${tutorPointer.y}%` }}
          />
        )}
      </div>
    </div>
  );
};

export default TeachingBoard;
