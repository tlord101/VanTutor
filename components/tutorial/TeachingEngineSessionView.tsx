/**
 * TEMPORARY SHELL — full file was truncated by a large push limit.
 * Restore immediately on your machine:
 *
 *   git fetch origin
 *   git show 6a8809d609cebee2ad22be83a2f79d3b0714c51a:components/tutorial/TeachingEngineSessionView.tsx > components/tutorial/TeachingEngineSessionView.tsx
 *   git add components/tutorial/TeachingEngineSessionView.tsx && git commit -m "restore TeachingEngineSessionView" && git push
 *
 * Quota wiring (after restore): pass userProfile into LessonDurationModal and call
 * evaluateLiveTutorialStart / commitLiveTutorialStart / deductAICredits on confirm.
 * See utils/liveTutorialQuota.ts and components/tutorial/LessonDurationModal.tsx.
 */
export { LessonDurationModal, type LessonDurationMode } from './LessonDurationModal';

import React from 'react';

export interface TeachingEngineSessionViewProps {
  topicTitle: string;
  courseName?: string;
  syllabusContext?: string;
  initialVoice?: string;
  initialDurationMode?: 15 | 30 | 60;
  userId?: string;
  userProfile?: any;
  onClose?: () => void;
  setCustomHeaderConfig?: (config: any) => void;
}

export const TeachingEngineSessionView: React.FC<TeachingEngineSessionViewProps> = ({
  topicTitle,
  onClose,
}) => (
  <div className="flex flex-col h-full w-full items-center justify-center bg-white text-black p-8 text-center gap-4">
    <div className="w-14 h-14 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-2xl">
      <i className="bi bi-exclamation-triangle"></i>
    </div>
    <h2 className="text-lg font-black">Live classroom needs a one-line restore</h2>
    <p className="text-sm text-neutral-500 max-w-md">
      The full TeachingEngineSessionView was truncated during a large deploy. Run the git show command in the file header comment to restore, then redeploy.
    </p>
    <p className="text-xs text-neutral-400 font-mono">{topicTitle}</p>
    {onClose && (
      <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-black text-white text-xs font-bold">
        Go back
      </button>
    )}
  </div>
);

export default TeachingEngineSessionView;
