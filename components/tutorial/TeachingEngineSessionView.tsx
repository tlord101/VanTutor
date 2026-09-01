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
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showAskModal, setShowAskModal] = useState(false);
  const [isProcessingAsk, setIsProcessingAsk] = useState(false);
  const [isAnsweringOnBoard, setIsAnsweringOnBoard] = useState(false);

  const engineRef = useRef<TeachingEngineService | null>(null);
  const boardManagerRef = useRef<BoardStateManager>(new BoardStateManager());
  const autoContinueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSegmentLoadingRef = useRef(false);
  /** Snapshot of lesson board while we answer a side question */
  const savedBoardRef = useRef<LiveBoardElement[] | null>(null);

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
  const boardElementsRef = useRef(boardElements);
  boardElementsRef.current = boardElements;

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
        setIsAudioReady(false);

        if (segment.lesson.totalEstimatedSegments) {
          setTotalEstimatedSegments(segment.lesson.totalEstimatedSegments);
        }

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
        if (playing) setIsAudioReady(true);

        // After interruption answer speech ends → restore lesson board & resume
        if (!playing && isAnsweringOnBoard) {
          setIsAnsweringOnBoard(false);
          const snap = savedBoardRef.current;
          savedBoardRef.current = null;
          manager.applyAction({ id: 'restore_clear', type: 'clear_board' });
          if (snap && snap.length) {
            snap.forEach((el) => {
              if (el.type === 'diagram') {
                manager.applyAction({
                  id: el.id,
                  type: 'draw',
                  persistence: el.persistence || 'temporary',
                  groupId: el.groupId,
                  position: el.position,
                  metadata: {
                    primitive: el.primitive,
                    diagram: el.diagram,
                    diagramProps: el.diagramProps,
                    color: el.color,
                  },
                });
              } else if (el.type === 'text' || el.type === 'formula') {
                manager.applyAction({
                  id: el.id,
                  type: 'write',
                  persistence: el.persistence || 'temporary',
                  groupId: el.groupId,
                  content: el.content,
                  position: el.position,
                  metadata: {
                    latex: el.latex,
                    fontSize: el.fontSize,
                    color: el.color,
                  },
                });
              } else if (el.type === 'label') {
                manager.applyAction({
                  id: el.id,
                  type: 'label',
                  content: el.content,
                  position: el.position,
                  groupId: el.groupId,
                });
              }
            });
          }
          setIsAudioReady(true);
          // Resume lesson segment audio from current segment
          setTimeout(() => engineRef.current?.resumeLesson(), 600);
          return;
        }

        if (!playing && !activeQuestionRef.current && !isSegmentLoadingRef.current && !showAskModal) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Mic FAB → pause lesson, open wave modal */
  const handleOpenAsk = () => {
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }
    engineRef.current?.pauseLesson();
    setIsSpeaking(false);
    setShowAskModal(true);
  };

  const handleCloseAsk = () => {
    setShowAskModal(false);
    // User cancelled — resume without wiping board
    engineRef.current?.resumeLesson();
  };

  const handleAskLecturer = async (studentQuestion: string, _imageDataUrl?: string | null) => {
    if ((!studentQuestion.trim() && !_imageDataUrl) || !engineRef.current) return;
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }

    setIsProcessingAsk(true);

    // Snapshot current board, then wipe for a fresh answer board
    savedBoardRef.current = boardElementsRef.current.map((el) => ({ ...el }));
    boardManagerRef.current.applyAction({ id: 'ask_clear', type: 'clear_board' });
    setIsAnsweringOnBoard(true);
    setIsAudioReady(true);
    setShowAskModal(false);

    addToast('Answering on a fresh board…', 'info');

    await engineRef.current.askLecturerQuestion({
      topic: topicTitle,
      studentQuestion: studentQuestion.trim() || 'Please explain based on the image I shared.',
    });

    setIsProcessingAsk(false);
    // Restore + resume happens in onAudioPlaybackStateChanged when answer speech ends
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
            >
              <i className="bi bi-arrow-left text-sm sm:text-base"></i>
            </button>
            <div className="min-w-0 flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate max-w-[150px] sm:max-w-md">
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
              title={`Lecturer: ${currentVoice}`}
            >
              <i className="bi bi-person-voice text-xs"></i>
              <span className="hidden sm:inline">{currentVoice}</span>
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#131E32] border border-[#1E293B]">
              <span
                className={`w-2 h-2 rounded-full transition-all ${
                  isSpeaking ? 'bg-[#34D399] shadow-[0_0_8px_#34D399] animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span className="text-[10px] sm:text-xs font-bold text-slate-200 tracking-wider">
                {isAnsweringOnBoard ? 'ANSWER' : isSpeaking ? 'LIVE' : showAskModal ? 'PAUSED' : 'READY'}
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
  }, [
    setCustomHeaderConfig,
    topicTitle,
    segmentNumber,
    totalEstimatedSegments,
    isSpeaking,
    currentVoice,
    handleCloseSession,
    isAnsweringOnBoard,
    showAskModal,
  ]);

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

        {/* Startup / load indicator so blank wait feels intentional */}
        {(isLoadingSegment || (!isAudioReady && !showAskModal && !isAnsweringOnBoard)) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full border-2 border-[#38BDF8]/30 border-t-[#38BDF8] animate-spin mb-3" />
            <p className="text-xs font-semibold text-slate-400 tracking-wide">
              {isLoadingSegment ? 'Preparing lesson…' : 'Starting lecturer…'}
            </p>
          </div>
        )}

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
          onClick={handleOpenAsk}
          type="button"
          className="absolute bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/25 shadow-2xl backdrop-blur-xl flex items-center justify-center text-white transition-all cursor-pointer z-30 ring-1 ring-white/15"
          title="Ask Lecturer (pauses lesson)"
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
        onClose={handleCloseAsk}
        onSubmitQuestion={handleAskLecturer}
        isProcessing={isProcessingAsk}
        topicTitle={topicTitle}
      />
    </div>
  );
};

export default TeachingEngineSessionView;
