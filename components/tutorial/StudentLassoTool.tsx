import React from 'react';

export interface StudentLassoToolProps {
  activeMode: 'none' | 'draw' | 'lasso';
  onModeChange: (mode: 'none' | 'draw' | 'lasso') => void;
  onMicClick: () => void;
  isRecordingVoice?: boolean;
  className?: string;
}

/**
 * Interactive floating whiteboard toolbar for students:
 * Draw, Lasso-to-Ask, and Manual Mic Click-to-Ask.
 */
export const StudentLassoTool: React.FC<StudentLassoToolProps> = ({
  activeMode,
  onModeChange,
  onMicClick,
  isRecordingVoice = false,
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center gap-1.5 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-[#E3E9F1] dark:border-slate-800 rounded-full shadow-lg z-30 transition-all ${className}`}
    >
      {/* 1. Pointer / Passive Mode */}
      <button
        type="button"
        onClick={() => onModeChange('none')}
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer ${
          activeMode === 'none'
            ? 'bg-[#002D62] text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title="View mode"
      >
        <i className="bi bi-cursor-fill"></i>
      </button>

      {/* 2. Stylus / Draw on Board Mode */}
      <button
        type="button"
        onClick={() => onModeChange(activeMode === 'draw' ? 'none' : 'draw')}
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer ${
          activeMode === 'draw'
            ? 'bg-[#0066FF] text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title="Draw on whiteboard"
      >
        <i className="bi bi-pencil-fill"></i>
      </button>

      {/* 3. Lasso & Ask ("Circle to inquire") */}
      <button
        type="button"
        onClick={() => onModeChange(activeMode === 'lasso' ? 'none' : 'lasso')}
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer ${
          activeMode === 'lasso'
            ? 'bg-amber-500 text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title="Circle any element and ask what it means"
      >
        <i className="bi bi-circle"></i>
      </button>

      <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />

      {/* 4. Manual Mic Button ("Click to speak your question") */}
      <button
        type="button"
        onClick={onMicClick}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
          isRecordingVoice
            ? 'bg-rose-500 text-white animate-pulse shadow-md'
            : 'bg-blue-50 dark:bg-blue-950/40 text-[#0066FF] hover:bg-blue-100 dark:hover:bg-blue-900/40'
        }`}
        title="Click to speak your question to the tutor"
      >
        <i className={`bi ${isRecordingVoice ? 'bi-mic-fill animate-bounce' : 'bi-mic-fill'}`}></i>
        <span>{isRecordingVoice ? 'Listening...' : 'Ask Question'}</span>
      </button>
    </div>
  );
};
