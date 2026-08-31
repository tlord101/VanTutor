import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TeachingSegment, BoardAction, TeachingQuestion, StudentAnswerEvaluation, LiveBoardElement } from '../../types/teachingScript';
import { TeachingEngineService } from '../../services/teachingEngineService';
import { BoardStateManager } from '../../services/boardStateManager';
import { TeachingHeader } from './live-teaching/TeachingHeader';
import { TeachingBoard } from './live-teaching/TeachingBoard';
import { TeachingControls } from './live-teaching/TeachingControls';
import { QuestionOverlay } from './live-teaching/QuestionOverlay';
import { LecturerAskModal } from './live-teaching/LecturerAskModal';
import { LiveTranscriptSubtitles } from './live-teaching/LiveTranscriptSubtitles';
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
 * REDESIGNED LIVE TEACHING HERO EXPERIENCE
 * Full-screen unified whiteboard where the AI Lecturer teaches inside a single 95% viewport.
 * Top bar ~2.5% | Teaching Board ~95% | Bottom bar ~2.5%
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

  // Initialize Teaching Engine Service
  useEffect(() => {
    const engine = new TeachingEngineService(appSettings, null, currentVoice);
    engineRef.current = engine;
    const manager = boardManagerRef.current;

    const unsubscribe = engine.subscribe({
      onSegmentLoaded: (segment) => {
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
        setActiveQuestion(question);
        setEvaluationFeedback(null);
      },
      onAnswerEvaluated: (evalResult) => {
        setEvaluationFeedback(evalResult);
        setIsSubmittingAnswer(false);
      },
      onError: (err) => {
        console.error('[TeachingEngineView] Error:', err);
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
      unsubscribe();
      engine.destroy();
    };
  }, [topicTitle, courseName, syllabusContext, appSettings]);

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

    setIsProcessingAsk(true);
    await engineRef.current.askLecturerQuestion({
      topic: topicTitle,
      studentQuestion,
    });
    setIsProcessingAsk(false);
    setShowAskModal(false);
    addToast('Lecturer answering your question on the board...', 'info');
  };

  // Proceed to Next Segment
  const handleContinueNextSegment = async () => {
    if (!engineRef.current) return;
    const nextSegNum = segmentNumber + 1;

    if (nextSegNum > totalEstimatedSegments) {
      addToast('Lesson complete! Well done.', 'success');
      onClose?.();
      return;
    }

    setSegmentNumber(nextSegNum);
    setIsLoadingSegment(true);
    setActiveQuestion(null);
    setEvaluationFeedback(null);

    if (currentSegment) {
      setCompletedSegmentsSummary((prev) => [...prev, currentSegment.lesson.title]);
    }

    await engineRef.current.loadSegment({
      topic: topicTitle,
      courseName,
      syllabusContext,
      segmentNumber: nextSegNum,
      previousSegmentsSummary: completedSegmentsSummary.join(' -> '),
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#070B14] text-white select-none overflow-hidden relative">
      {/* ── 1. MINIMAL TOP BAR (~2.5% HEIGHT) ── */}
      <TeachingHeader
        topicTitle={topicTitle}
        courseName={courseName}
        segmentNumber={segmentNumber}
        totalSegments={totalEstimatedSegments}
        isSpeaking={isSpeaking}
        currentVoice={currentVoice}
        onOpenVoiceSelector={() => setShowVoiceModal(true)}
        onClose={onClose}
      />

      {/* ── 2. HERO INTERACTIVE TEACHING WHITEBOARD (~95% FULL-SCREEN) ── */}
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

        {/* Subtle Live Transcript Subtitles */}
        <LiveTranscriptSubtitles
          speechText={currentSegment?.teaching.speech || ''}
          isSpeaking={isSpeaking}
          objective={currentSegment?.teaching.objective}
        />

        {/* Floating Question Comprehension Overlay */}
        {activeQuestion && (
          <QuestionOverlay
            question={activeQuestion}
            evaluationFeedback={evaluationFeedback}
            isSubmittingAnswer={isSubmittingAnswer}
            onSubmitAnswer={handleSubmitAnswer}
            onDismiss={() => setActiveQuestion(null)}
          />
        )}
      </main>

      {/* ── 3. MINIMAL BOTTOM BAR (~2.5% HEIGHT) ── */}
      <TeachingControls
        isSpeaking={isSpeaking}
        isLoadingSegment={isLoadingSegment}
        isAskingActive={!!activeQuestion}
        onReplayAudio={() => currentSegment && engineRef.current?.playSegmentSpeech(currentSegment)}
        onOpenAskModal={() => setShowAskModal(true)}
        onNextSegment={handleContinueNextSegment}
        isLastSegment={segmentNumber >= totalEstimatedSegments}
      />

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
