import React, { useState } from 'react';

export type LessonDurationMode = 15 | 30 | 60;

export interface LessonDurationOption {
  minutes: LessonDurationMode;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  creditHint: string;
}

export const LESSON_DURATION_OPTIONS: LessonDurationOption[] = [
  {
    minutes: 15,
    title: 'Quick',
    subtitle: '~15 minutes',
    description: 'Fast overview — core idea, one key visual, short checks.',
    icon: 'bi-lightning-charge-fill',
    creditHint: '~150 credits',
  },
  {
    minutes: 30,
    title: 'Standard',
    subtitle: '~30 minutes',
    description: 'Full concept walkthrough with examples and understanding checks.',
    icon: 'bi-book-fill',
    creditHint: '~250–300 credits',
  },
  {
    minutes: 60,
    title: 'Full lecture',
    subtitle: '~60 minutes',
    description:
      'Real lecturer style — jokes, pauses, talk to you, chapters you can resume anytime.',
    icon: 'bi-mortarboard-fill',
    creditHint: 'Progressive / higher',
  },
];

export interface LessonDurationModalProps {
  isOpen: boolean;
  topicTitle?: string;
  onClose: () => void;
  onConfirm: (mode: LessonDurationMode) => void;
  initialMode?: LessonDurationMode;
  resumeAvailable?: boolean;
  resumeLabel?: string;
  onResume?: () => void;
}

export const LessonDurationModal: React.FC<LessonDurationModalProps> = ({
  isOpen,
  topicTitle = 'Live Tutorial',
  onClose,
  onConfirm,
  initialMode = 30,
  resumeAvailable = false,
  resumeLabel,
  onResume,
}) => {
  const [selected, setSelected] = useState<LessonDurationMode>(initialMode);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#FFFFFF] border border-[#E3E9F1] rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col text-[#0F172A]"
      >
        <div className="p-6 bg-[#F6F6F3] border-b border-[#E3E9F1] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0066FF] text-white flex items-center justify-center shadow-md shadow-[#0066FF]/20">
              <i className="bi bi-clock-history text-lg"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">How long should this lesson be?</h2>
              <p className="text-xs text-[#64748B]">Each length uses a different teaching style</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-[#FFFFFF] border border-[#E3E9F1] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors"
          >
            <i className="bi bi-x-lg text-sm"></i>
          </button>
        </div>

        <div className="px-6 py-3 bg-[#FFFFFF] border-b border-[#E3E9F1]">
          <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">Topic</span>
          <span className="text-xs font-bold text-[#002D62] truncate block max-w-full">{topicTitle}</span>
        </div>

        {resumeAvailable && onResume && (
          <div className="px-6 pt-4">
            <button
              type="button"
              onClick={onResume}
              className="w-full p-4 rounded-2xl border-2 border-[#34D399]/50 bg-[#ECFDF5] text-left hover:border-[#34D399] transition-all"
            >
              <div className="flex items-center gap-2">
                <i className="bi bi-play-circle-fill text-[#059669] text-lg"></i>
                <div>
                  <p className="text-sm font-bold text-[#065F46]">Continue where you left off</p>
                  <p className="text-xs text-[#047857]">{resumeLabel || 'Resume saved lecture progress'}</p>
                </div>
              </div>
            </button>
          </div>
        )}

        <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto">
          {LESSON_DURATION_OPTIONS.map((opt) => {
            const isSelected = selected === opt.minutes;
            return (
              <div
                key={opt.minutes}
                onClick={() => setSelected(opt.minutes)}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#0066FF] bg-blue-50/40 shadow-sm'
                    : 'border-[#E3E9F1] bg-[#FFFFFF] hover:border-[#0066FF]/40 hover:bg-[#F6F6F3]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-[#0066FF] text-white' : 'bg-[#F1F5F9] text-[#002D62] border border-[#E3E9F1]'
                    }`}
                  >
                    <i className={`bi ${opt.icon} text-lg`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[#0F172A]">{opt.title}</span>
                      <span className="text-[10px] font-semibold text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-md">
                        {opt.subtitle}
                      </span>
                      {opt.minutes === 60 && (
                        <span className="text-[10px] font-bold text-[#0066FF] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                          Lecturer style
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#64748B] mt-1 leading-relaxed">{opt.description}</p>
                    <p className="text-[10px] font-semibold text-[#94A3B8] mt-1.5">{opt.creditHint}</p>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                      isSelected ? 'border-[#0066FF] bg-[#0066FF] text-white' : 'border-[#CBD5E1] bg-white'
                    }`}
                  >
                    {isSelected && <i className="bi bi-check text-sm font-bold"></i>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-6 bg-[#F6F6F3] border-t border-[#E3E9F1] flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            type="button"
            className="px-5 py-2.5 rounded-xl border border-[#E3E9F1] bg-[#FFFFFF] hover:bg-[#F1F5F9] text-xs font-bold text-[#64748B] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            type="button"
            className="px-6 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold flex items-center space-x-2 transition-transform active:scale-95 shadow-md shadow-[#0066FF]/20"
          >
            <span>Continue</span>
            <i className="bi bi-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessonDurationModal;
