import React, { useEffect, useState, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface EquationStepAnimatorProps {
  latex: string;
  progress?: number; // 0.0 to 1.0 (or step index)
  title?: string;
  stepNumber?: number;
  highlightTokens?: string[];
  isPulsing?: boolean;
  className?: string;
}

/**
 * Step-by-step LaTeX derivation animator with smooth progressive character reveal,
 * active token highlighting, and KaTeX compilation.
 */
export const EquationStepAnimator: React.FC<EquationStepAnimatorProps> = ({
  latex,
  progress = 1.0,
  title,
  stepNumber,
  highlightTokens = [],
  isPulsing = false,
  className = '',
}) => {
  // Compute progressive substring of LaTeX string based on progress percentage
  const visibleLatex = useMemo(() => {
    if (progress >= 1.0) return latex;
    if (progress <= 0) return '';
    const length = Math.max(1, Math.floor(latex.length * progress));
    let sub = latex.slice(0, length);

    // Balance unclosed braces if cut off mid-equation
    const openBraces = (sub.match(/\{/g) || []).length;
    const closeBraces = (sub.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      sub += '}'.repeat(openBraces - closeBraces);
    }
    return sub;
  }, [latex, progress]);

  // Compile LaTeX to KaTeX HTML
  const katexHtml = useMemo(() => {
    if (!visibleLatex) return '';
    try {
      return katex.renderToString(visibleLatex, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<span class="text-slate-800 font-mono">${visibleLatex}</span>`;
    }
  }, [visibleLatex]);

  return (
    <div
      className={`rounded-2xl bg-white dark:bg-slate-900 border border-[#E3E9F1] dark:border-slate-800 p-4 sm:p-5 shadow-xs transition-all duration-300 ${
        isPulsing ? 'ring-2 ring-[#0066FF] shadow-md bg-blue-50/30 dark:bg-blue-950/20' : ''
      } ${className}`}
    >
      {(stepNumber !== undefined || title) && (
        <div className="flex items-center gap-2 mb-2">
          {stepNumber !== undefined && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#002D62] text-white text-xs font-bold">
              {stepNumber}
            </span>
          )}
          {title && <h4 className="text-sm font-bold text-[#0F172A] dark:text-white">{title}</h4>}
        </div>
      )}

      <div
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-1 text-center text-[#0F172A] dark:text-slate-100 text-lg sm:text-xl font-medium tracking-wide"
        dangerouslySetInnerHTML={{ __html: katexHtml }}
      />
    </div>
  );
};
