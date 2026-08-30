import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { BoardElement } from '../LiveWhiteboardCanvas';
import { BoardDiagramPrimitives } from './BoardDiagramPrimitives';
import { Point2D, renderStrokeToContext } from '../../../utils/canvasVectorPrimitives';

export interface TeachingBoardProps {
  elements: BoardElement[];
  tutorPointer?: { x: number; y: number; active: boolean; color?: string } | null;
  activeFocusArea?: { x: number; y: number; w: number; h: number; color?: string } | null;
  activeWorkedEquation?: {
    latex: string;
    stepNumber?: number;
    title?: string;
    progress: number;
    highlightTokens?: string[];
  } | null;
  className?: string;
}

/**
 * HERO COMPONENT: 95% Fullscreen AI Lecturer Interactive Whiteboard.
 * Designed on deep blackboard canvas with semantic chalk-style colors.
 * Supports smooth Pan & Pinch Zoom, KaTeX equations, progressive diagrams, and vector annotations.
 */
export const TeachingBoard: React.FC<TeachingBoardProps> = ({
  elements,
  tutorPointer,
  activeFocusArea,
  activeWorkedEquation,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan & Zoom Spatial Transform State
  const [transform, setTransform] = useState<{ scale: number; x: number; y: number }>({
    scale: 1,
    x: 0,
    y: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef<{ x: number; y: number; originX: number; originY: number }>({ x: 0, y: 0, originX: 0, originY: 0 });
  const touchDistRef = useRef<number | null>(null);

  // Reset zoom & pan to default
  const handleResetView = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  // Zoom In / Out
  const handleZoom = (delta: number) => {
    setTransform((prev) => {
      const newScale = Math.min(2.5, Math.max(0.6, prev.scale + delta));
      return { ...prev, scale: newScale };
    });
  };

  // High-DPI Canvas Resizing
  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, []);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [updateCanvasSize]);

  // 60 FPS Canvas Render Loop (Background Grid + Freehand Strokes + Laser Pointer)
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
      ctx.restore();

      ctx.save();
      ctx.scale(dpr, dpr);

      // Apply Pan & Zoom to Canvas
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);

      // 1. Subtle Academic Dot Grid
      ctx.fillStyle = '#1E293B';
      const dotSpacing = 32;
      const startX = -1000;
      const endX = rect.width + 1000;
      const startY = -1000;
      const endY = rect.height + 1000;

      for (let x = startX; x < endX; x += dotSpacing) {
        for (let y = startY; y < endY; y += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Render Freehand Strokes
      elements.forEach((el) => {
        if (el.type === 'stroke') {
          renderStrokeToContext(ctx, el.points, el.color || '#38BDF8', el.size || 4);
        }
      });

      // 3. Render Laser Pointer Glow
      if (tutorPointer?.active) {
        const px = (tutorPointer.x / 100) * rect.width;
        const py = (tutorPointer.y / 100) * rect.height;

        ctx.save();
        // Pulsing outer halo
        const gradient = ctx.createRadialGradient(px, py, 2, px, py, 24);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
        gradient.addColorStop(0.5, 'rgba(0, 102, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 102, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, 24, 0, Math.PI * 2);
        ctx.fill();

        // Solid core
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [elements, tutorPointer, transform]);

  // Mouse & Touch Pan / Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsPanning(true);
    startPanRef.current = { x: e.clientX, y: e.clientY, originX: transform.x, originY: transform.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - startPanRef.current.x;
    const dy = e.clientY - startPanRef.current.y;
    setTransform((prev) => ({
      ...prev,
      x: startPanRef.current.originX + dx,
      y: startPanRef.current.originY + dy,
    }));
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta);
  };

  // Touch Handlers for Pinch Zoom and 1-finger Pan
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      const touch = e.touches[0];
      startPanRef.current = { x: touch.clientX, y: touch.clientY, originX: transform.x, originY: transform.y };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isPanning) {
      const touch = e.touches[0];
      const dx = touch.clientX - startPanRef.current.x;
      const dy = touch.clientY - startPanRef.current.y;
      setTransform((prev) => ({
        ...prev,
        x: startPanRef.current.originX + dx,
        y: startPanRef.current.originY + dy,
      }));
    } else if (e.touches.length === 2 && touchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchDistRef.current;
      touchDistRef.current = dist;
      setTransform((prev) => ({
        ...prev,
        scale: Math.min(2.5, Math.max(0.6, prev.scale * factor)),
      }));
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    touchDistRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full h-full flex-1 overflow-hidden bg-[#0A0F1D] cursor-grab active:cursor-grabbing select-none ${className}`}
    >
      {/* 1. Canvas Layer (Grid dots, strokes, laser pointer) */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

      {/* 2. Scalable Spatial Vector & KaTeX Overlay Layer */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none transition-transform duration-75 ease-out origin-top-left"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        {/* Render Vector Elements */}
        {elements.map((el) => {
          if (el.type === 'illustration') {
            const posX = `${el.x ?? 30}%`;
            const posY = `${el.y ?? 25}%`;

            return (
              <div
                key={el.id}
                style={{ left: posX, top: posY }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-all duration-500 animate-in zoom-in-95"
              >
                <BoardDiagramPrimitives
                  type={el.illustrationType}
                  width={el.width || 360}
                  height={el.height || 220}
                  progress={el.progress ?? 1.0}
                  color={el.color || '#38BDF8'}
                />
              </div>
            );
          }

          if (el.type === 'latex') {
            const posX = `${el.x ?? 50}%`;
            const posY = `${el.y ?? 50}%`;

            let renderedHtml = '';
            try {
              renderedHtml = katex.renderToString(el.text, {
                displayMode: true,
                throwOnError: false,
              });
            } catch {
              renderedHtml = `<span style="color: #FFFFFF;">${el.text}</span>`;
            }

            return (
              <div
                key={el.id}
                style={{ left: posX, top: posY }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto animate-in fade-in zoom-in duration-300"
              >
                <div className="px-5 py-3 rounded-2xl bg-[#0F172A]/90 border border-[#38BDF8]/40 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md">
                  <div
                    className="text-white text-xl sm:text-2xl font-bold tracking-wide select-none"
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                </div>
              </div>
            );
          }

          if (el.type === 'table') {
            const posX = `${el.x ?? 30}%`;
            const posY = `${el.y ?? 40}%`;

            return (
              <div
                key={el.id}
                style={{ left: posX, top: posY }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto animate-in fade-in duration-300 max-w-md"
              >
                <div className="rounded-2xl bg-[#0F172A]/90 border border-[#1E293B] shadow-2xl overflow-hidden backdrop-blur-md">
                  <table className="w-full text-left text-xs text-slate-200">
                    <thead className="bg-[#1E293B] text-[#38BDF8] font-bold border-b border-[#334155]">
                      <tr>
                        {el.headers.map((h, i) => (
                          <th key={i} className="px-3.5 py-2.5 uppercase tracking-wider text-[11px]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {el.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={rIdx === el.activeRowIndex ? 'bg-[#0066FF]/20 font-bold text-white' : ''}
                        >
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3.5 py-2">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }

          if (el.type === 'target_label') {
            return (
              <div
                key={el.id}
                className="absolute left-1/2 top-12 -translate-x-1/2 pointer-events-auto animate-in fade-in"
              >
                <span className="px-3 py-1 rounded-full bg-[#FACC15] text-[#0A0F1D] text-xs font-extrabold shadow-lg">
                  {el.text}
                </span>
              </div>
            );
          }

          return null;
        })}

        {/* Step-by-Step KaTeX Equation Derivation Box (if active) */}
        {activeWorkedEquation && (
          <div className="absolute top-8 right-8 pointer-events-auto max-w-sm w-80 animate-in slide-in-from-right-4 duration-300">
            <div className="rounded-2xl bg-[#0F172A]/90 border border-[#FACC15]/40 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-md">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[#FACC15] text-[#0A0F1D] text-[11px] font-black flex items-center justify-center">
                  {activeWorkedEquation.stepNumber || 1}
                </span>
                <h4 className="text-xs font-bold text-white truncate">
                  {activeWorkedEquation.title || 'Equation Step'}
                </h4>
              </div>
              <div
                className="text-white text-base sm:text-lg font-bold text-center py-1 overflow-x-auto [scrollbar-width:none]"
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(activeWorkedEquation.latex, {
                    displayMode: true,
                    throwOnError: false,
                  }),
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Floating Board Zoom / Center Controls */}
      <div className="absolute bottom-5 right-5 flex items-center gap-1.5 p-1.5 rounded-full bg-[#0F172A]/80 border border-[#1E293B] backdrop-blur-md shadow-lg z-20">
        <button
          onClick={() => handleZoom(0.15)}
          type="button"
          className="w-8 h-8 rounded-full bg-[#1E293B] hover:bg-[#334155] text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
          title="Zoom In"
        >
          <i className="bi bi-zoom-in"></i>
        </button>
        <button
          onClick={() => handleZoom(-0.15)}
          type="button"
          className="w-8 h-8 rounded-full bg-[#1E293B] hover:bg-[#334155] text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
          title="Zoom Out"
        >
          <i className="bi bi-zoom-out"></i>
        </button>
        <button
          onClick={handleResetView}
          type="button"
          className="w-8 h-8 rounded-full bg-[#1E293B] hover:bg-[#334155] text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-all cursor-pointer"
          title="Reset View"
        >
          <i className="bi bi-arrows-fullscreen"></i>
        </button>
      </div>
    </div>
  );
};
