import React, { useState, useEffect } from 'react';
import type { UserProfile, UserProgress } from '../types';
import MyNotebooks from './MyNotebooks';

export interface StudyGuideProps {
  userProfile: UserProfile;
  userProgress?: UserProgress;
  onNavigate?: (tab: string) => void;
  setCustomHeaderConfig?: (config: any) => void;
}

export const formatLastVisited = (timestamp?: number | null): string | null => {
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) return null;
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return 'Visited just now';
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Visited just now';
  if (diffMinutes < 60) return `Visited ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Visited ${diffHours}h ago`;
  return `Visited ${Math.floor(diffHours / 24)}d ago`;
};

/**
 * Study Guide — B&W shell.
 * Notebooks pane is fully restyled (MyNotebooks).
 * Courses pane temporarily shows a clean placeholder while the full course
 * list is re-synced from the last good commit (file size limited push path).
 */
const StudyGuideContent: React.FC<StudyGuideProps> = ({
  userProfile,
  onNavigate,
  setCustomHeaderConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'courses' | 'notebooks'>('notebooks');

  useEffect(() => {
    if (!setCustomHeaderConfig) return;
    setCustomHeaderConfig({
      leftActions: (
        <button
          type="button"
          onClick={() => onNavigate?.('dashboard')}
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-black text-sm font-bold active:scale-95 cursor-pointer transition-all shrink-0"
          aria-label="Back"
        >
          <i className="bi bi-arrow-left text-sm font-bold text-black"></i>
        </button>
      ),
      title: (
        <div className="inline-flex items-center p-1 bg-neutral-100 rounded-2xl border border-neutral-200">
          <button
            type="button"
            onClick={() => setActiveTab('courses')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'courses' ? 'bg-white text-black shadow-xs' : 'text-neutral-500 hover:text-black'
            }`}
          >
            <i className="bi bi-mortarboard text-sm"></i>
            <span>Study Guide</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notebooks')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'notebooks' ? 'bg-white text-black shadow-xs' : 'text-neutral-500 hover:text-black'
            }`}
          >
            <i className="bi bi-journal-bookmark text-sm"></i>
            <span>My Notebooks</span>
          </button>
        </div>
      ),
      hideTitle: true,
      hideDefaultRightActions: true,
      hideBottomNav: false,
      className: 'bg-white/95 border-b border-neutral-200 backdrop-blur-md',
    });
    return () => setCustomHeaderConfig(null);
  }, [activeTab, setCustomHeaderConfig, onNavigate]);

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-0 bg-white overflow-hidden">
      <div className="flex-1 min-h-0 w-full overflow-hidden relative">
        <div
          className={`absolute inset-0 w-full h-full flex flex-col overflow-auto transition-all duration-300 ${
            activeTab === 'courses' ? 'translate-x-0 opacity-100 z-10' : '-translate-x-full opacity-0 pointer-events-none z-0'
          }`}
        >
          <div className="max-w-4xl mx-auto w-full px-6 py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-black text-2xl mx-auto mb-4">
              <i className="bi bi-mortarboard"></i>
            </div>
            <h2 className="text-2xl font-black text-black tracking-tight">Academic Study Guide</h2>
            <p className="text-sm text-neutral-500 mt-2 max-w-md mx-auto font-medium">
              Course list is being restored. Open <span className="font-semibold text-black">My Notebooks</span> for offline PDFs,
              or pull the latest full Study Guide from commit e6e7387 if you need courses right away.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('notebooks')}
              className="mt-6 px-5 py-2.5 rounded-xl bg-black hover:bg-neutral-800 text-white text-sm font-bold transition-colors"
            >
              Go to My Notebooks
            </button>
          </div>
        </div>

        <div
          className={`absolute inset-0 w-full h-full flex flex-col overflow-auto transition-all duration-300 ${
            activeTab === 'notebooks' ? 'translate-x-0 opacity-100 z-10' : 'translate-x-full opacity-0 pointer-events-none z-0'
          }`}
        >
          <MyNotebooks
            userProfile={userProfile}
            onNavigate={onNavigate}
            setCustomHeaderConfig={setCustomHeaderConfig}
          />
        </div>
      </div>
    </div>
  );
};

export const StudyGuide: React.FC<StudyGuideProps> = (props) => <StudyGuideContent {...props} />;

export default StudyGuide;
