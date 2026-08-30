import React, { useState, useEffect, useRef } from 'react';
import { TeachingQuestion, StudentAnswerEvaluation } from '../../../types/teachingScript';

export interface QuestionOverlayProps {
  question: TeachingQuestion;
  evaluationFeedback: StudentAnswerEvaluation | null;
  isSubmittingAnswer: boolean;
  onSubmitAnswer: (answer: string) => void;
  onDismiss?: () => void;
}

/**
 * Lightweight floating classroom question overlay.
 * Appears seamlessly over the board with voice answering, text input, quick chips, and conversational feedback.
 */
export const QuestionOverlay: React.FC<QuestionOverlayProps> = ({
  question,
  evaluationFeedback,
  isSubmittingAnswer,
  onSubmitAnswer,
  onDismiss,
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Voice recognition support
  const handleToggleVoice = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((res: any) => res[0].transcript)
          .join(' ');
        setInputText(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSubmit = (ans?: string) => {
    const finalAns = ans || inputText.trim();
    if (!finalAns || isSubmittingAnswer) return;
    onSubmitAnswer(finalAns);
  };

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 w-11/12 max-w-lg z-40 animate-in fade-in zoom-in-95 duration-300">
      <div className="rounded-3xl bg-[#0F172A]/95 backdrop-blur-xl border-2 border-[#38BDF8]/40 p-5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)] text-white">
        {/* Header Badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-[#FACC15] text-[#0A0F1D] flex items-center justify-center text-xs font-black">
              Q
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
              Think About It
            </span>
          </div>

          {onDismiss && (
            <button
              onClick={onDismiss}
              type="button"
              className="text-slate-400 hover:text-white text-xs p-1 rounded-full hover:bg-white/10"
              title="Minimize question"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>

        {/* Question Text */}
        <h3 className="text-sm sm:text-base font-bold text-white leading-relaxed mb-4">
          {question.question}
        </h3>

        {/* Quick Options (if present) */}
        {question.options && question.options.length > 0 && !evaluationFeedback && (
          <div className="flex flex-wrap gap-2 mb-4">
            {question.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleSubmit(option)}
                disabled={isSubmittingAnswer}
                type="button"
                className="px-3.5 py-2 rounded-xl bg-[#1E293B] hover:bg-[#0066FF] border border-[#334155] hover:border-blue-400 text-xs sm:text-sm font-semibold text-slate-100 transition-all active:scale-95 cursor-pointer text-left"
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {/* Input Controls (Voice + Text) */}
        {!evaluationFeedback && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Speak or type your answer..."
              disabled={isSubmittingAnswer}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#1E293B] border border-[#334155] focus:border-[#38BDF8] focus:outline-none text-xs sm:text-sm text-white placeholder-slate-400 font-medium"
            />

            <button
              onClick={handleToggleVoice}
              type="button"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] border border-[#334155]'
              }`}
              title="Speak answer aloud"
            >
              <i className={`bi ${isListening ? 'bi-mic-fill' : 'bi-mic'}`}></i>
            </button>

            <button
              onClick={() => handleSubmit()}
              disabled={!inputText.trim() || isSubmittingAnswer}
              type="button"
              className="px-4 py-2.5 rounded-xl bg-[#0066FF] hover:bg-blue-600 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              {isSubmittingAnswer ? '...' : 'Send'}
            </button>
          </div>
        )}

        {/* Conversational Evaluation Feedback */}
        {evaluationFeedback && (
          <div className="mt-2 p-3.5 rounded-2xl bg-[#1E293B] border border-[#334155] animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-1.5">
              <i
                className={`bi ${
                  evaluationFeedback.isCorrect
                    ? 'bi-check-circle-fill text-[#34D399]'
                    : 'bi-info-circle-fill text-[#FACC15]'
                } text-base`}
              ></i>
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                {evaluationFeedback.isCorrect ? 'Spot On!' : 'Tutor Insight:'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
              {evaluationFeedback.spokenFeedback}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
