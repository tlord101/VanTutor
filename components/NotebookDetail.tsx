import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { UserProfile, Topic, Course } from '../types';
import type { Notebook, NotebookChapter } from '../services/notebookStorageService';
import { getChapterContent } from '../services/notebookStorageService';
import NotebookQuiz from './NotebookQuiz';
import NotebookFlashcards from './NotebookFlashcards';
import NotebookChat from './NotebookChat';
import VoiceTutorialPage, { VoiceTutorialSessionData } from './VoiceTutorialPage';
import { useAppSettings } from '../hooks/useAppSettings';

interface NotebookDetailProps {
  notebook: Notebook;
  userProfile: UserProfile;
  onBack: () => void;
  onNavigate?: (tab: string) => void;
  setCustomHeaderConfig?: (config: any) => void;
}

type StudyMode = 'none' | 'quiz' | 'flashcards' | 'chat' | 'voice';

export const NotebookDetail: React.FC<NotebookDetailProps> = ({
  notebook,
  userProfile,
  onBack,
  onNavigate,
  setCustomHeaderConfig,
}) => {
  const { settings: appSettings } = useAppSettings();

  const [selectedChapter, setSelectedChapter] = useState<NotebookChapter | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [activeMode, setActiveMode] = useState<StudyMode>('none');
  const [chapterFullContent, setChapterFullContent] = useState<string>('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const handleOpenChapterActions = async (chapter: NotebookChapter) => {
    setSelectedChapter(chapter);
    setShowActionModal(true);
    setIsLoadingContent(true);
    try {
      const content = await getChapterContent(notebook.id, chapter.id);
      setChapterFullContent(content);
    } catch (err) {
      console.warn('Error loading chapter content:', err);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleSelectMode = (mode: StudyMode) => {
    setShowActionModal(false);
    setActiveMode(mode);
  };

  // 1. Render Active Mode: Quiz
  if (activeMode === 'quiz' && selectedChapter) {
    return (
      <NotebookQuiz
        notebook={notebook}
        chapter={selectedChapter}
        chapterContent={chapterFullContent}
        userProfile={userProfile}
        onBack={() => setActiveMode('none')}
      />
    );
  }

  // 2. Render Active Mode: Flashcards
  if (activeMode === 'flashcards' && selectedChapter) {
    return (
      <NotebookFlashcards
        notebook={notebook}
        chapter={selectedChapter}
        chapterContent={chapterFullContent}
        userProfile={userProfile}
        onBack={() => setActiveMode('none')}
      />
    );
  }

  // 3. Render Active Mode: Chat Tutorial
  if (activeMode === 'chat' && selectedChapter) {
    return (
      <NotebookChat
        notebook={notebook}
        chapter={selectedChapter}
        chapterContent={chapterFullContent}
        userProfile={userProfile}
        onBack={() => setActiveMode('none')}
      />
    );
  }

  // 4. Render Active Mode: Voice & Visual Tutorial
  if (activeMode === 'voice' && selectedChapter) {
    const syntheticCourse: Course = {
      course_id: notebook.id,
      course_name: notebook.title,
      level: 'General',
      topics: [],
    };

    const syntheticTopic: Topic = {
      topic_id: selectedChapter.id,
      topic_name: selectedChapter.title,
      topic_context: chapterFullContent.slice(0, 5000),
    };

    const voiceSession: VoiceTutorialSessionData = {
      course: syntheticCourse,
      topic: syntheticTopic,
      syllabusContext: `Textbook: ${notebook.title}. Chapter: ${selectedChapter.title}`,
    };

    return (
      <VoiceTutorialPage
        userProfile={userProfile}
        appSettings={appSettings}
        initialSessionData={voiceSession}
        onBack={() => {
          setActiveMode('none');
          if (setCustomHeaderConfig) setCustomHeaderConfig(null);
        }}
        onNavigate={onNavigate}
        setCustomHeaderConfig={setCustomHeaderConfig}
      />
    );
  }

  // 5. Main Chapter Listing View
  return (
    <div className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 pb-[calc(76px+env(safe-area-inset-bottom)+20px)] overflow-y-auto space-y-4 animate-fade-in">
      {/* Top Banner Header */}
      <div className="bg-white border border-[#E3E9F1] rounded-3xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-3.5 mb-4">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0F172A] transition-all cursor-pointer shrink-0"
          >
            <i className="bi bi-arrow-left text-sm"></i>
          </button>
          <div>
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              Extracted Textbook Material
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
              {notebook.title}
            </h2>
          </div>
        </div>

        {/* Metadata Pills */}
        <div className="flex items-center gap-2.5 flex-wrap text-xs text-[#64748B] pt-2 border-t border-[#E3E9F1]">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F6F6F3] rounded-full border border-[#E3E9F1]">
            <i className="bi bi-file-earmark-text text-[#0066FF]"></i>
            {notebook.total_pages} {notebook.total_pages === 1 ? 'Page' : 'Pages'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F6F6F3] rounded-full border border-[#E3E9F1]">
            <i className="bi bi-bookmark text-[#0066FF]"></i>
            {notebook.chapter_count} {notebook.chapter_count === 1 ? 'Chapter' : 'Chapters'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F6F6F3] rounded-full border border-[#E3E9F1]">
            <i className="bi bi-hdd text-[#0066FF]"></i>
            {(notebook.file_size / (1024 * 1024)).toFixed(1)} MB
          </span>
        </div>
      </div>

      {/* Chapters Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider">
            Chapters in this Material
          </h3>
          <span className="text-xs text-[#64748B]">Select a chapter to study</span>
        </div>

        {notebook.chapters.map((ch, idx) => (
          <div
            key={ch.id}
            onClick={() => handleOpenChapterActions(ch)}
            className="w-full flex items-center justify-between p-4 sm:p-5 bg-white border border-[#E3E9F1] rounded-2xl hover:border-[#0066FF]/50 transition-all cursor-pointer group shadow-2xs gap-3"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#F6F6F3] border border-[#E3E9F1] flex items-center justify-center text-[#0F172A] font-bold text-sm shrink-0 group-hover:bg-[#002D62] group-hover:text-white transition-colors">
                {idx + 1}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[#0F172A] truncate group-hover:text-[#0066FF] transition-colors">
                  {ch.title}
                </h4>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-[#64748B]">
                  <span>Pages {ch.startPage}–{ch.endPage}</span>
                  <span>•</span>
                  <span>{ch.wordCount.toLocaleString()} words</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-block text-xs font-bold text-[#0066FF] opacity-0 group-hover:opacity-100 transition-opacity">
                Study Chapter
              </span>
              <div className="w-8 h-8 rounded-full bg-[#F6F6F3] border border-[#E3E9F1] flex items-center justify-center text-[#0F172A] group-hover:bg-[#0066FF] group-hover:text-white transition-all">
                <i className="bi bi-chevron-right text-xs"></i>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Modal (6 Study Options) — Rendered via createPortal to escape transformed parent bounds */}
      {showActionModal && selectedChapter && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs cursor-pointer animate-fade-in"
            onClick={() => setShowActionModal(false)}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-lg bg-white border border-[#E3E9F1] rounded-3xl p-5 sm:p-7 shadow-2xl z-10 animate-fade-in space-y-5 max-h-[90vh] overflow-y-auto text-[#0F172A]">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#E3E9F1] pb-3.5">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                  Choose Study Mode
                </span>
                <h3 className="text-base sm:text-lg font-black text-[#0F172A] truncate mt-0.5">
                  {selectedChapter.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowActionModal(false)}
                className="w-8 h-8 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0F172A] transition-all cursor-pointer shrink-0"
              >
                <i className="bi bi-x-lg text-xs font-bold"></i>
              </button>
            </div>

            {/* 6 Study Action Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* 1. Chat Based Tutorial */}
              <button
                type="button"
                onClick={() => handleSelectMode('chat')}
                disabled={isLoadingContent}
                className="flex items-center gap-3 p-3.5 bg-[#F6F6F3] hover:bg-[#F1F5F9] border border-[#E3E9F1] hover:border-[#0066FF]/50 rounded-2xl text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0066FF] shrink-0 shadow-2xs">
                  <i className="bi bi-chat-dots text-base"></i>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-[#0F172A] group-hover:text-[#0066FF] truncate">Chat Tutorial</h4>
                  <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">Socratic 1-on-1 tutor</p>
                </div>
              </button>

              {/* 2. Flashcards */}
              <button
                type="button"
                onClick={() => handleSelectMode('flashcards')}
                disabled={isLoadingContent}
                className="flex items-center gap-3 p-3.5 bg-[#F6F6F3] hover:bg-[#F1F5F9] border border-[#E3E9F1] hover:border-[#0066FF]/50 rounded-2xl text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0066FF] shrink-0 shadow-2xs">
                  <i className="bi bi-card-text text-base"></i>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-[#0F172A] group-hover:text-[#0066FF] truncate">Flashcards</h4>
                  <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">Interactive 3D cards</p>
                </div>
              </button>

              {/* 3. Quiz Test */}
              <button
                type="button"
                onClick={() => handleSelectMode('quiz')}
                disabled={isLoadingContent}
                className="flex items-center gap-3 p-3.5 bg-[#F6F6F3] hover:bg-[#F1F5F9] border border-[#E3E9F1] hover:border-[#0066FF]/50 rounded-2xl text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0066FF] shrink-0 shadow-2xs">
                  <i className="bi bi-check2-square text-base"></i>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-[#0F172A] group-hover:text-[#0066FF] truncate">Quiz Test</h4>
                  <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">Timed test & timer</p>
                </div>
              </button>

              {/* 4. Visual & Voice Tutorial */}
              <button
                type="button"
                onClick={() => handleSelectMode('voice')}
                disabled={isLoadingContent}
                className="flex items-center gap-3 p-3.5 bg-[#F6F6F3] hover:bg-[#F1F5F9] border border-[#E3E9F1] hover:border-[#0066FF]/50 rounded-2xl text-left transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0066FF] shrink-0 shadow-2xs">
                  <i className="bi bi-mic text-base"></i>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-[#0F172A] group-hover:text-[#0066FF] truncate">Voice Tutorial</h4>
                  <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">Blackboard voice lesson</p>
                </div>
              </button>

              {/* 5. Infographics (Coming Soon) */}
              <div className="flex items-center gap-3 p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-left opacity-80 relative">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E3E9F1] flex items-center justify-center text-[#64748B] shrink-0">
                  <i className="bi bi-graph-up text-base"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#0F172A] truncate">Infographics</h4>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-[#E2E8F0] text-[#475569] rounded-full shrink-0">
                      Soon
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">Visual concept summary</p>
                </div>
              </div>

              {/* 6. Podcast (Coming Soon) */}
              <div className="flex items-center gap-3 p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-left opacity-80 relative">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E3E9F1] flex items-center justify-center text-[#64748B] shrink-0">
                  <i className="bi bi-headphones text-base"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#0F172A] truncate">Podcast</h4>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-[#E2E8F0] text-[#475569] rounded-full shrink-0">
                      Soon
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">Audio overview episode</p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default NotebookDetail;
