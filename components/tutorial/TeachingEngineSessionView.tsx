import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TeachingSegment, TeachingQuestion, StudentAnswerEvaluation, LiveBoardElement } from '../../types/teachingScript';
import { TeachingEngineService } from '../../services/teachingEngineService';
import { BoardStateManager } from '../../services/boardStateManager';
import { TeachingBoard } from './live-teaching/TeachingBoard';
import { QuestionOverlay } from './live-teaching/QuestionOverlay';
import { LecturerAskModal } from './live-teaching/LecturerAskModal';
import { LiveTutorialVoiceSelectorModal } from './LiveTutorialVoiceSelectorModal';
import { unifiedVoiceRouter } from '../../services/voice/UnifiedVoiceRouter';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useToast } from '../../hooks/useToast';

export interface TeachingEngineSessionViewProps {
  topicTitle: string;
  courseName?: string;
  syllabusContext?: string;
  initialVoice?: string;
  onClose?: () => void;
  setCustomHeaderConfig?: (config: any) => void;
}

export const TeachingEngineSessionView: React.FC<TeachingEngineSessionViewProps> = ({
  topicTitle,
  courseName = 'Academic Course',
  syllabusContext,
  initialVoice = 'Altair',
  onClose,
  setCustomHeaderConfig,
}) => {
  const { settings: appSettings } = useAppSettings();
  const { addToast } = useToast();

  const [currentVoice, setCurrentVoice] = useState<string>(initialVoice);
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [showAskModal, setShowAskModal] = useState<boolean>(false);
  const [isProcessingAsk, setIsProcessingAsk] = useState<boolean>(false);

  const engineRef = useRef<TeachingEngineService | null>(null);
  const boardManagerRef = useRef<BoardStateManager>(new BoardStateManager());
  const autoContinueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSegmentLoadingRef = useRef<boolean>(false);

  const [currentSegment, setCurrentSegment] = useState<TeachingSegment | null>(null);
  const [segmentNumber, setSegmentNumber] = useState(1);
  const [totalEstimatedSegments, setTotalEstimatedSegments] = useState(10);
  const [isLoadingSegment, setIsLoadingSegment] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);

  const [boardElements, setBoardElements] = useState<LiveBoardElement[]>([]);
  const [activeHighlights, setActiveHighlights] = useState<Set<string>>(new Set());
  const [activeCircles, setActiveCircles] = useState<Set<string>>(new Set());
  const [activeUnderlines, setActiveUnderlines] = useState<Set<string>>(new Set());
  const [tutorPointer, setTutorPointer] = useState<{ x: number; y: number; active: boolean; color?: string } | null>(null);

  const [activeQuestion, setActiveQuestion] = useState<TeachingQuestion | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [evaluationFeedback, setEvaluationFeedback] = useState<StudentAnswerEvaluation | null>(null);
  const [completedSegmentsSummary, setCompletedSegmentsSummary] = useState<string[]>([]);

  const segmentNumberRef = useRef(segmentNumber);
  segmentNumberRef.current = segmentNumber;
  const totalSegmentsRef = useRef(totalEstimatedSegments);
  totalSegmentsRef.current = totalEstimatedSegments;
  const currentSegmentRef = useRef(currentSegment);
  currentSegmentRef.current = currentSegment;
  const completedSummaryRef = useRef(completedSegmentsSummary);
  completedSummaryRef.current = completedSegmentsSummary;
  const activeQuestionRef = useRef(activeQuestion);
  activeQuestionRef.current = activeQuestion;

  useEffect(() => {
    const manager = boardManagerRef.current;
    const unsub = manager.subscribe((state) => {
      setBoardElements(Array.from(state.elements.values()));
      setActiveHighlights(new Set(state.activeHighlights));
      setActiveCircles(new Set(state.activeCircles));
      setActiveUnderlines(new Set(state.activeUnderlines));
    });
    return unsub;
  }, []);

  const handleContinueNextSegment = useCallback(async () => {
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }

    if (!engineRef.current || isSegmentLoadingRef.current) return;

    const nextSegNum = segmentNumberRef.current + 1;
    if (nextSegNum > totalSegmentsRef.current) {
      addToast('Lesson complete! Well done.', 'success');
      onClose?.();
      return;
    }

    isSegmentLoadingRef.current = true;
    setSegmentNumber(nextSegNum);
    setIsLoadingSegment(true);
    setActiveQuestion(null);
    setEvaluationFeedback(null);
    setIsAudioReady(false);

    // Hard wipe before next concept loads so previous diagram/text cannot stick
    boardManagerRef.current.applyAction({ id: 'pre_clear', type: 'clear_board' });

    const prevSeg = currentSegmentRef.current;
    if (prevSeg) {
      setCompletedSegmentsSummary((prev) => [...prev, prevSeg.lesson.title]);
    }

    const summaryHistory = prevSeg
      ? [...completedSummaryRef.current, prevSeg.lesson.title].join(' -> ')
      : completedSummaryRef.current.join(' -> ');

    await engineRef.current.loadSegment({
      topic: topicTitle,
      courseName,
      syllabusContext,
      segmentNumber: nextSegNum,
      previousSegmentsSummary: summaryHistory,
    });
  }, [topicTitle, courseName, syllabusContext, onClose, addToast]);

  const handleContinueRef = useRef(handleContinueNextSegment);
  handleContinueRef.current = handleContinueNextSegment;

  useEffect(() => {
    const engine = new TeachingEngineService(appSettings, null, currentVoice);
    engineRef.current = engine;
    const manager = boardManagerRef.current;
    isSegmentLoadingRef.current = true;

    const unsubscribe = engine.subscribe({
      onSegmentLoaded: (segment) => {
        isSegmentLoadingRef.current = false;
        setCurrentSegment(segment);
        setIsLoadingSegment(false);
        setIsAudioReady(false); // stay blank until voice starts

        if (segment.lesson.totalEstimatedSegments) {
          setTotalEstimatedSegments(segment.lesson.totalEstimatedSegments);
        }

        // Always clear (or retain only persistent titles). Never leave old diagrams.
        const transition = segment.teaching.boardTransition || 'clear_board';
        if (transition === 'retain_persistent') {
          manager.applyAction({ id: 'trans_retain', type: 'retain' });
        } else {
          manager.applyAction({ id: 'trans_clear', type: 'clear_board' });
        }

        engine.playSegmentSpeech(segment);
      },
      onAudioPlaybackStateChanged: (playing) => {
        setIsSpeaking(playing);
        if (playing) {
          setIsAudioReady(true);
        }

        if (!playing && !activeQuestionRef.current && !isSegmentLoadingRef.current) {
          if (autoContinueTimerRef.current) clearTimeout(autoContinueTimerRef.current);
          autoContinueTimerRef.current = setTimeout(() => {
            handleContinueRef.current();
          }, 2400);
        }
      },
      onBoardActionTriggered: (action) => {
        manager.applyAction(action);
        if (action.position) {
          setTutorPointer({ x: action.position.x, y: action.position.y, active: true, color: '#38BDF8' });
          setTimeout(() => {
            setTutorPointer((prev) => (prev ? { ...prev, active: false } : null));
          }, 1200);
        }
      },
      onQuestionAsked: (question) => {
        if (autoContinueTimerRef.current) {
          clearTimeout(autoContinueTimerRef.current);
          autoContinueTimerRef.current = null;
        }
        if (segmentNumberRef.current >= totalSegmentsRef.current) {
          setActiveQuestion(question);
          setEvaluationFeedback(null);
        } else {
          autoContinueTimerRef.current = setTimeout(() => {
            handleContinueRef.current();
          }, 2400);
        }
      },
      onAnswerEvaluated: (evalResult) => {
        setEvaluationFeedback(evalResult);
        setIsSubmittingAnswer(false);
        if (autoContinueTimerRef.current) clearTimeout(autoContinueTimerRef.current);
        autoContinueTimerRef.current = setTimeout(() => {
          handleContinueRef.current();
        }, 3400);
      },
      onError: (err) => {
        console.error('[TeachingEngineView] Error:', err);
        isSegmentLoadingRef.current = false;
        setIsLoadingSegment(false);
      },
    });

    engine.loadSegment({
      topic: topicTitle,
      courseName,
      syllabusContext,
      segmentNumber: 1,
    });

    return () => {
      if (autoContinueTimerRef.current) clearTimeout(autoContinueTimerRef.current);
      unsubscribe();
      engine.destroy();
      unifiedVoiceRouter.stopAll();
    };
  }, [topicTitle, courseName, syllabusContext]);

  const handleCloseSession = useCallback(() => {
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    unifiedVoiceRouter.stopAll();
    onClose?.();
  }, [onClose]);

  const handleVoiceChange = (newVoice: string) => {
    setCurrentVoice(newVoice);
    setShowVoiceModal(false);
    if (engineRef.current) {
      engineRef.current.setVoice(newVoice);
      if (currentSegment) {
        setIsAudioReady(false);
        engineRef.current.playSegmentSpeech(currentSegment);
      }
    }
    addToast(`Lecturer voice switched to ${newVoice}`, 'success');
  };

  const handleSubmitAnswer = async (answerToSubmit: string) => {
    if (!answerToSubmit.trim() || isSubmittingAnswer || !engineRef.current) return;
    setIsSubmittingAnswer(true);
    await engineRef.current.evaluateStudentAnswer({
      topic: topicTitle,
      studentAnswer: answerToSubmit.trim(),
    });
  };

  const handleAskLecturer = async (studentQuestion: string) => {
    if (!studentQuestion.trim() || !engineRef.current) return;
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }
    setIsProcessingAsk(true);
    await engineRef.current.askLecturerQuestion({
      topic: topicTitle,
      studentQuestion,
    });
    setIsProcessingAsk(false);
    setShowAskModal(false);
    addToast('Lecturer answering your question on the board...', 'info');
  };

  useEffect(() => {
    if (setCustomHeaderConfig) {
      setCustomHeaderConfig({
        leftActions: (
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={handleCloseSession}
              type="button"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#131E32] hover:bg-[#1E2E4A] border border-[#1E293B] flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer shrink-0"
              title="Exit Classroom"
              aria-label="Exit Classroom"
            >
              <i className="bi bi-arrow-left text-sm sm:text-base"></i>
            </button>
            <div className="min-w-0 flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate max-w-[150px] xs:max-w-[200px] sm:max-w-md md:max-w-xl">
                {topicTitle}
              </h1>
            </div>
          </div>
        ),
        rightActions: (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#131E32] border border-[#1E293B] text-[10px] sm:text-xs font-mono text-slate-300">
              <span className="text-[#38BDF8] font-bold">{String(segmentNumber).padStart(2, '0')}</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">{String(totalEstimatedSegments).padStart(2, '0')}</span>
            </div>
            <button
              onClick={() => setShowVoiceModal(true)}
              type="button"
              className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#131E32] hover:bg-[#1E2E4A] border border-[#1E293B] text-[11px] font-bold text-[#60A5FA] transition-colors cursor-pointer"
              title={`Lecturer: ${currentVoice} (Click to change)`}
            >
              <i className="bi bi-person-voice text-xs"></i>
              <span className="hidden sm:inline">{currentVoice}</span>
              <i className="bi bi-chevron-down text-[9px] opacity-70"></i>
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#131E32] border border-[#1E293B]">
              <span
                className={`w-2 h-2 rounded-full transition-all ${
                  isSpeaking ? 'bg-[#34D399] shadow-[0_0_8px_#34D399] animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span className="text-[10px] sm:text-xs font-bold text-slate-200 tracking-wider">
                {isSpeaking ? 'LIVE' : 'READY'}
              </span>
            </div>
          </div>
        ),
        hideBottomNav: true,
        className: 'bg-[#070B14] border-b border-[#1E293B]',
      });
    }

    return () => {
      if (setCustomHeaderConfig) setCustomHeaderConfig(null);
    };
  }, [setCustomHeaderConfig, topicTitle, segmentNumber, totalEstimatedSegments, isSpeaking, currentVoice, handleCloseSession]);

  return (
    <div className="flex flex-col h-full w-full bg-[#070B14] text-white select-none overflow-hidden relative">
      <main className="flex-1 relative flex flex-col min-h-0 w-full overflow-hidden p-1.5 sm:p-3">
        <TeachingBoard
          elements={boardElements}
          activeHighlights={activeHighlights}
          activeCircles={activeCircles}
          activeUnderlines={activeUnderlines}
          tutorPointer={tutorPointer}
          isAudioReady={isAudioReady}
        />

        {activeQuestion && (
          <QuestionOverlay
            question={activeQuestion}
            evaluationFeedback={evaluationFeedback}
            isSubmittingAnswer={isSubmittingAnswer}
            onSubmitAnswer={handleSubmitAnswer}
            onDismiss={() => {
              setActiveQuestion(null);
              handleContinueNextSegment();
            }}
          />
        )}

        <button
          onClick={() => setShowAskModal(true)}
          type="button"
          className="absolute bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/25 shadow-2xl backdrop-blur-xl flex items-center justify-center text-white transition-all cursor-pointer z-30 ring-1 ring-white/15"
          title="Ask Lecturer"
        >
          <i className="bi bi-mic-fill text-xl sm:text-2xl text-white"></i>
        </button>
      </main>

      <LiveTutorialVoiceSelectorModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onSelectVoiceAndStart={handleVoiceChange}
        topicTitle={topicTitle}
        initialVoice={currentVoice}
      />

      <LecturerAskModal
        isOpen={showAskModal}
        onClose={() => setShowAskModal(false)}
        onSubmitQuestion={handleAskLecturer}
        isProcessing={isProcessingAsk}
        topicTitle={topicTitle}
      />
    </div>
  );
};

export default TeachingEngineSessionView;
