import React, { useState } from 'react';

export interface InteractiveMicroCheckProps {
  title?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  isDiagnostic?: boolean;
  onAnswerSelected: (isCorrect: boolean, selectedIndex: number) => void;
  onContinue: () => void;
}

export const InteractiveMicroCheck: React.FC<InteractiveMicroCheckProps> = ({
  title = 'Quick Check-In',
  question,
  options,
  correctIndex,
  explanation,
  isDiagnostic = false,
  onAnswerSelected,
  onContinue,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isAnswered = selectedIndex !== null;
  const isCorrect = selectedIndex === correctIndex;

  const handleSelect = (idx: number) => {
    if (isAnswered) return;
    setSelectedIndex(idx);
    onAnswerSelected(idx === correctIndex, idx);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-[28px] max-w-lg w-full p-6 sm:p-7 border border-[#E3E9F1] dark:border-slate-800 shadow-2xl animate-scale-in flex flex-col gap-4"
      >
        {/* Badge & Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
              isDiagnostic ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
            }`}>
              {isDiagnostic ? '⚡ 15s Diagnostic' : '🎯 Check-In Question'}
            </span>
          </div>
          <span className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
            {isDiagnostic ? 'Gauging prior knowledge' : 'Test your understanding'}
          </span>
        </div>

        {/* Question Prompt */}
        <h3 className="text-lg sm:text-xl font-bold text-[#0F172A] dark:text-white leading-snug">
          {question}
        </h3>

        {/* Options List */}
        <div className="flex flex-col gap-2.5 my-1">
          {options.map((option, idx) => {
            const isOptionSelected = selectedIndex === idx;
            const isThisCorrect = idx === correctIndex;

            let buttonStyle = 'bg-[#F6F6F3] dark:bg-slate-800/80 border-[#E3E9F1] dark:border-slate-700 text-[#0F172A] dark:text-slate-100 hover:border-[#0066FF]';

            if (isAnswered) {
              if (isThisCorrect) {
                buttonStyle = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200 font-bold';
              } else if (isOptionSelected && !isThisCorrect) {
                buttonStyle = 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-900 dark:text-rose-200 font-medium opacity-90';
              } else {
                buttonStyle = 'opacity-40 border-transparent bg-slate-100 dark:bg-slate-800 text-slate-400';
              }
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelect(idx)}
                disabled={isAnswered}
                className={`w-full text-left p-3.5 sm:p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${buttonStyle}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0 border border-slate-200 dark:border-slate-600">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-sm sm:text-base leading-relaxed">{option}</span>
                </div>

                {isAnswered && isThisCorrect && (
                  <i className="bi bi-check-circle-fill text-emerald-600 text-lg shrink-0 ml-2"></i>
                )}
                {isAnswered && isOptionSelected && !isThisCorrect && (
                  <i className="bi bi-x-circle-fill text-rose-600 text-lg shrink-0 ml-2"></i>
                )}
              </button>
            );
          })}
        </div>

        {/* Explanation Card upon answering */}
        {isAnswered && (
          <div className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed animate-fade-in ${
            isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/40' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900/40'
          }`}>
            <p className="font-bold mb-1">{isCorrect ? '✨ Great job!' : '💡 Tutor Insight:'}</p>
            <p>{explanation}</p>
          </div>
        )}

        {/* Continue Button */}
        {isAnswered && (
          <button
            type="button"
            onClick={onContinue}
            className="w-full py-3.5 bg-[#002D62] hover:bg-[#001D42] text-white rounded-2xl font-bold text-sm sm:text-base transition-all shadow-md active:scale-98 cursor-pointer mt-1 flex items-center justify-center gap-2"
          >
            <span>Continue Lesson</span>
            <i className="bi bi-arrow-right"></i>
          </button>
        )}
      </div>
    </div>
  );
};
