import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TeachingSegment, BoardAction, TeachingQuestion, StudentAnswerEvaluation, LiveBoardElement } from '../../types/teachingScript';
import { TeachingEngineService } from '../../services/teachingEngineService';
import { BoardStateManager } from '../../services/boardStateManager';
import { TeachingHeader } from './live-teaching/TeachingHeader';
import { TeachingBoard } from './live-teaching/TeachingBoard';
import { QuestionOverlay } from './live-teaching/QuestionOverlay';
import { LecturerAskModal } from './live-teaching/LecturerAskModal';
import { LiveTutorialVoiceSelectorModal } from './LiveTutorialVoiceSelectorModal';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useToast } from '../../hooks/useToast';

export interface TeachingEngineSessionViewProps {
  topicTitle: string;
  courseName?: string;
  syllabusContext?: string;
  initialVoice?: string;
  onClose?: () => void;
}

/**
 * PURE LIVE TEACHING WHITEBOARD
 * Features:
 * - App Header + Fullscreen Whiteboard Surface (No bottom text block).
 * - Floating Circular "Ask AI" button with Liquid Glass design (transparent white glass, no gradients).
 * - Automatic Board Continuity (seamlessly transitions to next concept after speech/answer).
 * - Natural spoken lecturer mannerisms.
 */
export const TeachingEngineSessionView: React.FC<TeachingEngineSessionViewProps> = ({
  topicTitle,
  courseName = 'Academic Course',
  syllabusContext,
  initialVoice = 'Jennifer',
  onClose,
}) => {
  const { settings: appSettings } = useAppSettings();
  const { addToast } = useToast();

  // Engine & Session State
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
  const [totalEstimatedSegments, setTotalEstimatedSegments] = useState(5);
  const [isLoadingSegment, setIsLoadingSegment] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Whiteboard State
  const [boardElements, setBoardElements] = useState<LiveBoardElement[]>([]);
  const [activeHighlights, setActiveHighlights] = useState<Set<string>>(new Set());
  const [activeCircles, setActiveCircles] = useState<Set<string>>(new Set());
  const [activeUnderlines, setActiveUnderlines] = useState<Set<string>>(new Set());
  const [tutorPointer, setTutorPointer] = useState<{ x: number; y: number; active: boolean; color?: string } | null>(null);

  // Question & Interactivity State
  const [activeQuestion, setActiveQuestion] = useState<TeachingQuestion | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [evaluationFeedback, setEvaluationFeedback] = useState<StudentAnswerEvaluation | null>(null);
  const [completedSegmentsSummary, setCompletedSegmentsSummary] = useState<string[]>([]);

  // Refs for stable callbacks
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

  // Subscribe to BoardStateManager changes
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

  // Proceed to Next Segment (Stable callback using refs)
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

  // Initialize Teaching Engine Service ONCE per topic session
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
        if (segment.lesson.totalEstimatedSegments) {
          setTotalEstimatedSegments(segment.lesson.totalEstimatedSegments);
        }

        // Apply concept board transition if specified
        if (segment.teaching.boardTransition === 'clear_board') {
          manager.applyAction({ id: 'trans_clear', type: 'clear_board' });
        } else if (segment.teaching.boardTransition === 'retain_persistent') {
          manager.applyAction({ id: 'trans_retain', type: 'retain' });
        }

        // Auto-play speech and schedule synchronized actions
        engine.playSegmentSpeech(segment);
      },
      onAudioPlaybackStateChanged: (playing) => {
        setIsSpeaking(playing);

        // Auto-continue when speech finishes if no active blocking question
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
        setActiveQuestion(question);
        setEvaluationFeedback(null);
      },
      onAnswerEvaluated: (evalResult) => {
        setEvaluationFeedback(evalResult);
        setIsSubmittingAnswer(false);

        // After feedback, auto-continue to next concept after short pause
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

    // Start Segment 1
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
        engineRef.current.playSegmentSpeech(currentSegment);
      }
    }
    addToast(`Lecturer voice switched to ${newVoice}`, 'success');
  };

  // Submit Answer to Engine
  const handleSubmitAnswer = async (answerToSubmit: string) => {
    if (!answerToSubmit.trim() || isSubmittingAnswer || !engineRef.current) return;

    setIsSubmittingAnswer(true);
    await engineRef.current.evaluateStudentAnswer({
      topic: topicTitle,
      studentAnswer: answerToSubmit.trim(),
    });
  };

  // Handle "Ask the Lecturer" Interruption
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

  return (
    <div className="flex flex-col h-full w-full bg-[#070B14] text-white select-none overflow-hidden relative">
      {/* ── 1. MINIMAL APP HEADER ── */}
      <TeachingHeader
        topicTitle={topicTitle}
        courseName={courseName}
        segmentNumber={segmentNumber}
        totalSegments={totalEstimatedSegments}
        isSpeaking={isSpeaking}
        currentVoice={currentVoice}
        onOpenVoiceSelector={() => setShowVoiceModal(true)}
        onClose={handleCloseSession}
      />

      {/* ── 2. HERO WHITEBOARD SURFACE (occupies the entire screen below header) ── */}
      <main className="flex-1 relative flex flex-col min-h-0 w-full overflow-hidden p-1.5 sm:p-3">
        <TeachingBoard
          elements={boardElements}
          activeHighlights={activeHighlights}
          activeCircles={activeCircles}
          activeUnderlines={activeUnderlines}
          tutorPointer={tutorPointer}
        />

        {/* Loading Concept Indicator */}
        {isLoadingSegment && (
          <div className="absolute inset-0 bg-[#070B14]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30 animate-in fade-in">
            <div className="w-10 h-10 border-3 border-[#38BDF8] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs sm:text-sm font-bold text-slate-200 tracking-wide">
              Lecturer is writing on the board...
            </p>
          </div>
        )}

        {/* Floating Question Comprehension Overlay (bottom docked) */}
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

        {/* ── 3. FLOATING CIRCULAR "ASK AI" BUTTON (LIQUID GLASS DESIGN) ── */}
        <button
          onClick={() => setShowAskModal(true)}
          type="button"
          className="absolute bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/25 shadow-2xl backdrop-blur-xl flex items-center justify-center text-white transition-all cursor-pointer z-30 ring-1 ring-white/15"
          title="Ask Lecturer"
        >
          <i className="bi bi-mic-fill text-xl sm:text-2xl text-white"></i>
        </button>
      </main>

      {/* Voice Switcher Modal */}
      <LiveTutorialVoiceSelectorModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onSelectVoiceAndStart={handleVoiceChange}
        topicTitle={topicTitle}
        initialVoice={currentVoice}
      />

      {/* Ask the Lecturer Interruption Modal */}
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
