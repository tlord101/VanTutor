import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TeachingSegment, BoardAction, TeachingQuestion, StudentAnswerEvaluation } from '../../types/teachingScript';
import { TeachingEngineService } from '../../services/teachingEngineService';
import { BoardElement } from './LiveWhiteboardCanvas';
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
 * Full-screen interactive classroom where the AI Lecturer teaches on an expansive whiteboard.
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

  const [currentSegment, setCurrentSegment] = useState<TeachingSegment | null>(null);
  const [segmentNumber, setSegmentNumber] = useState(1);
  const [totalEstimatedSegments, setTotalEstimatedSegments] = useState(5);
  const [isLoadingSegment, setIsLoadingSegment] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Whiteboard Hero Canvas State
  const [boardElements, setBoardElements] = useState<BoardElement[]>([]);
  const [tutorPointer, setTutorPointer] = useState<{ x: number; y: number; active: boolean; color?: string } | null>(null);
  const [activeFocusArea, setActiveFocusArea] = useState<{ x: number; y: number; w: number; h: number; color?: string } | null>(null);
  const [activeWorkedEquation, setActiveWorkedEquation] = useState<{
    latex: string;
    stepNumber?: number;
    title?: string;
    progress: number;
    highlightTokens?: string[];
  } | null>(null);

  // Question & Interactivity State
  const [activeQuestion, setActiveQuestion] = useState<TeachingQuestion | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [evaluationFeedback, setEvaluationFeedback] = useState<StudentAnswerEvaluation | null>(null);
  const [completedSegmentsSummary, setCompletedSegmentsSummary] = useState<string[]>([]);

  // Apply whiteboard action to canvas
  const applyBoardAction = useCallback((action: BoardAction) => {
    const elementId = action.id || `el_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    if (action.type === 'clear') {
      setBoardElements([]);
      setActiveFocusArea(null);
      setActiveWorkedEquation(null);
      return;
    }

    if (action.type === 'erase' && action.target) {
      setBoardElements((prev) => prev.filter((el) => el.id !== action.target));
      return;
    }

    // 1. Target Circle Action
    if (action.type === 'circle' && action.target) {
      const newEl: BoardElement = {
        id: elementId,
        type: 'target_circle',
        target: action.target,
        color: '#FACC15',
      };
      setBoardElements((prev) => [...prev, newEl]);
      return;
    }

    // 2. Target Arrow Action
    if (action.type === 'arrow' && action.from && action.to) {
      const newEl: BoardElement = {
        id: elementId,
        type: 'target_arrow',
        fromTarget: action.from,
        toTarget: action.to,
        label: action.content,
        color: '#38BDF8',
      };
      setBoardElements((prev) => [...prev, newEl]);
      return;
    }

    // 3. Target Label Action
    if (action.type === 'label') {
      const newEl: BoardElement = {
        id: elementId,
        type: 'target_label',
        target: action.target || 'center',
        text: action.content || 'Key Point',
        color: '#FACC15',
      };
      setBoardElements((prev) => [...prev, newEl]);
      return;
    }

    // 4. Highlight Action
    if (action.type === 'highlight') {
      const targetX = action.metadata?.x ?? 50;
      const targetY = action.metadata?.y ?? 50;
      setActiveFocusArea({
        x: targetX,
        y: targetY,
        w: 140,
        h: 50,
        color: '#38BDF8',
      });
      setTutorPointer({ x: targetX, y: targetY, active: true, color: '#38BDF8' });
      return;
    }

    // 5. Worked Step / Step-by-Step Equation Action
    if (action.metadata?.workedSteps && action.metadata.workedSteps.length > 0) {
      const steps = action.metadata.workedSteps;
      const lastStep = steps[steps.length - 1];
      setActiveWorkedEquation({
        latex: lastStep.latex,
        stepNumber: lastStep.stepNumber,
        title: lastStep.explanation,
        progress: 1.0,
        highlightTokens: lastStep.highlightTokens,
      });
      return;
    }

    // 6. Formula / LaTeX Write Action
    if (action.type === 'write') {
      const formulaText = action.content || action.metadata?.latex || topicTitle;
      const newEl: BoardElement = {
        id: elementId,
        type: 'latex',
        x: action.metadata?.x ?? 50,
        y: action.metadata?.y ?? 50,
        text: formulaText,
        opacity: 1,
        color: '#FFFFFF',
      };
      setBoardElements((prev) => {
        const filtered = prev.filter((e) => !(e.type === 'latex' && Math.abs((e.x || 0) - (newEl.x || 0)) < 5 && Math.abs((e.y || 0) - (newEl.y || 0)) < 5));
        return [...filtered, newEl];
      });
      setTutorPointer({ x: newEl.x, y: newEl.y, active: true, color: '#38BDF8' });

      // Animate LaTeX Step Card
      setActiveWorkedEquation({
        latex: formulaText,
        progress: 1.0,
        title: action.sync?.phrase || 'Formula Step',
      });
      return;
    }

    // 7. Draw Primitives Action (Physics, Circuits, Cell, Atom, Economics, CPU, Graph, Table)
    if (action.type === 'draw') {
      const primitive = action.metadata?.primitive || 'physics_force_vectors';
      if (primitive === 'table' && action.metadata?.tableData) {
        const newEl: BoardElement = {
          id: elementId,
          type: 'table',
          x: action.metadata.x ?? 50,
          y: action.metadata.y ?? 40,
          width: 340,
          headers: action.metadata.tableData.headers,
          rows: action.metadata.tableData.rows,
          activeRowIndex: 0,
        };
        setBoardElements((prev) => [...prev, newEl]);
      } else {
        const newEl: BoardElement = {
          id: elementId,
          type: 'illustration',
          illustrationType: (primitive as any),
          x: action.metadata?.x ?? 50,
          y: action.metadata?.y ?? 35,
          width: 360,
          height: 230,
          progress: 1.0,
        };
        setBoardElements((prev) => [...prev, newEl]);
      }
    }
  }, [topicTitle]);

  // Initialize Teaching Engine Service
  useEffect(() => {
    const engine = new TeachingEngineService(appSettings, null, currentVoice);
    engineRef.current = engine;

    const unsubscribe = engine.subscribe({
      onSegmentLoaded: (segment) => {
        setCurrentSegment(segment);
        setIsLoadingSegment(false);
        if (segment.lesson.totalEstimatedSegments) {
          setTotalEstimatedSegments(segment.lesson.totalEstimatedSegments);
        }
        // Auto-play speech and schedule synchronized actions
        engine.playSegmentSpeech(segment);
      },
      onAudioPlaybackStateChanged: (playing) => {
        setIsSpeaking(playing);
      },
      onBoardActionTriggered: (action) => {
        applyBoardAction(action);
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
  }, [topicTitle, courseName, syllabusContext, appSettings, applyBoardAction]);

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
      <main className="flex-1 relative flex flex-col min-h-0 w-full overflow-hidden">
        <TeachingBoard
          elements={boardElements}
          tutorPointer={tutorPointer}
          activeFocusArea={activeFocusArea}
          activeWorkedEquation={activeWorkedEquation}
        />

        {/* Loading Concept Indicator */}
        {isLoadingSegment && (
          <div className="absolute inset-0 bg-[#070B14]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30 animate-in fade-in">
            <div className="w-10 h-10 border-3 border-[#38BDF8] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs sm:text-sm font-bold text-slate-200 tracking-wide">
              Lecturer is preparing the board...
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
