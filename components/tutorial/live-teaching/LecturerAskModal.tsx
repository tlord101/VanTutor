import React, { useState, useRef } from 'react';

export interface LecturerAskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitQuestion: (question: string) => void;
  isProcessing: boolean;
  topicTitle: string;
}

/**
 * "Ask the Lecturer" Interruption Modal.
 * Allows student to interrupt and ask "Explain that again", "What does this variable mean?", etc.
 */
export const LecturerAskModal: React.FC<LecturerAskModalProps> = ({
  isOpen,
  onClose,
  onSubmitQuestion,
  isProcessing,
  topicTitle,
}) => {
  const [questionText, setQuestionText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  if (!isOpen) return null;

  const quickPrompts = [
    'Wait, can you explain that again more simply?',
    'What does this formula symbol represent?',
    'Could you give a real-world numerical example?',
    'How does this relate to the previous step?',
  ];

  const handleToggleVoice = () => {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => setIsRecording(true);
      rec.onresult = (event: any) => {
        const text = Array.from(event.results)
          .map((res: any) => res[0].transcript)
          .join(' ');
        setQuestionText(text);
      };
      rec.onerror = () => setIsRecording(false);
      rec.onend = () => setIsRecording(false);

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsRecording(false);
    }
  };

  const handleSend = (textToSend?: string) => {
    const q = textToSend || questionText.trim();
    if (!q || isProcessing) return;
    onSubmitQuestion(q);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl bg-[#0F172A] border border-[#1E293B] p-6 shadow-2xl text-white animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8]">
              <i className="bi bi-person-raised-hand text-xl"></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Ask the Lecturer</h3>
              <p className="text-xs text-slate-400 truncate max-w-xs">{topicTitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <i className="bi bi-x-lg text-sm"></i>
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="space-y-1.5 mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Quick Inquiries:
          </span>
          <div className="flex flex-col gap-1.5">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                disabled={isProcessing}
                type="button"
                className="text-left px-3.5 py-2 rounded-xl bg-[#1E293B] hover:bg-[#0066FF] border border-[#334155] hover:border-blue-400 text-xs text-slate-200 hover:text-white transition-all active:scale-98 cursor-pointer"
              >
                "{prompt}"
              </button>
            ))}
          </div>
        </div>

        {/* Input Row */}
        <div className="flex items-center gap-2 pt-2">
          <input
            type="text"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your question or speak aloud..."
            disabled={isProcessing}
            className="flex-1 px-4 py-3 rounded-xl bg-[#1E293B] border border-[#334155] focus:border-[#38BDF8] focus:outline-none text-xs sm:text-sm text-white placeholder-slate-400"
          />

          <button
            onClick={handleToggleVoice}
            type="button"
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] border border-[#334155]'
            }`}
            title="Ask via voice"
          >
            <i className={`bi ${isRecording ? 'bi-mic-fill' : 'bi-mic'} text-lg`}></i>
          </button>

          <button
            onClick={() => handleSend()}
            disabled={!questionText.trim() || isProcessing}
            type="button"
            className="px-5 py-3 rounded-xl bg-[#0066FF] hover:bg-blue-600 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
          >
            {isProcessing ? 'Thinking...' : 'Ask'}
          </button>
        </div>
      </div>
    </div>
  );
};
