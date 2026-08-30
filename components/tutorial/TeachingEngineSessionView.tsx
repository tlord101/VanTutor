import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TeachingSegment, BoardAction, TeachingQuestion, StudentAnswerEvaluation } from '../../types/teachingScript';
import { TeachingEngineService } from '../../services/teachingEngineService';
import { LiveWhiteboardCanvas, BoardElement } from './LiveWhiteboardCanvas';
import { EquationStepAnimator } from './EquationStepAnimator';
import { LiveTutorialVoiceSelectorModal } from './LiveTutorialVoiceSelectorModal';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useToast } from '../../hooks/useToast';
import { auth } from '../../firebase';

export interface TeachingEngineSessionViewProps {
  topicTitle: string;
  courseName?: string;
  syllabusContext?: string;
  initialVoice?: string;
  onClose?: () => void;
}

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
  const engineRef = useRef<TeachingEngineService | null>(null);
  const [currentSegment, setCurrentSegment] = useState<TeachingSegment | null>(null);
  const [segmentNumber, setSegmentNumber] = useState(1);
  const [totalEstimatedSegments, setTotalEstimatedSegments] = useState(5);
  const [isLoadingSegment, setIsLoadingSegment] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Whiteboard Canvas State
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

  // Question & Interaction State
  const [activeQuestion, setActiveQuestion] = useState<TeachingQuestion | null>(null);
  const [studentInput, setStudentInput] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [evaluationFeedback, setEvaluationFeedback] = useState<StudentAnswerEvaluation | null>(null);
  const [completedSegmentsSummary, setCompletedSegmentsSummary] = useState<string[]>([]);
  const speechRecognitionRef = useRef<any>(null);

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
        // Auto-play speech
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
        addToast('Lesson transition note: Loading next concept...', 'info');
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
  }, [topicTitle, courseName, syllabusContext, appSettings, addToast]);

  const handleVoiceChange = (newVoice: string) => {
    setCurrentVoice(newVoice);
    setShowVoiceModal(false);
    if (engineRef.current) {
      engineRef.current.setVoice(newVoice);
      if (currentSegment) {
        engineRef.current.playSegmentSpeech(currentSegment);
      }
    }
    addToast(`Lecturer voice changed to ${newVoice}`, 'success');
  };

  // Apply whiteboard action to canvas
  const applyBoardAction = useCallback((action: BoardAction) => {
    const elementId = action.id || `el_${Date.now()}`;

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
        color: '#0066FF',
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
        color: '#0066FF',
      };
      setBoardElements((prev) => [...prev, newEl]);
      return;
    }

    // 3. Target Label Action
    if (action.type === 'label' && action.target) {
      const newEl: BoardElement = {
        id: elementId,
        type: 'target_label',
        target: action.target,
        text: action.content || 'Label',
        color: '#0066FF',
      };
      setBoardElements((prev) => [...prev, newEl]);
      return;
    }

    // 4. Target Underline Action
    if (action.type === 'underline' && action.target) {
      const newEl: BoardElement = {
        id: elementId,
        type: 'target_underline',
        target: action.target,
        color: '#0066FF',
      };
      setBoardElements((prev) => [...prev, newEl]);
      return;
    }

    // 5. Highlight Action
    if (action.type === 'highlight') {
      const targetX = action.metadata?.x ?? 45;
      const targetY = action.metadata?.y ?? 45;
      setActiveFocusArea({
        x: targetX,
        y: targetY,
        w: 140,
        h: 50,
        color: '#0066FF',
      });
      setTutorPointer({ x: targetX, y: targetY, active: true, color: '#0066FF' });
      return;
    }

    // 6. Worked Step / Step-by-Step Equation Action
    if (action.metadata?.workedSteps && action.metadata.workedSteps.length > 0) {
      const steps = action.metadata.workedSteps;
      const newEl: BoardElement = {
        id: elementId,
        type: 'worked_step',
        x: action.metadata.x ?? 30,
        y: action.metadata.y ?? 40,
        width: 340,
        steps,
        activeStepIndex: steps.length - 1,
      };
      setBoardElements((prev) => [...prev, newEl]);

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

    // 7. Formula / LaTeX Write Action
    if (action.type === 'write') {
      const formulaText = action.content || action.metadata?.latex || topicTitle;
      const newEl: BoardElement = {
        id: elementId,
        type: 'latex',
        x: action.metadata?.x ?? 40,
        y: action.metadata?.y ?? 50,
        text: formulaText,
        opacity: 1,
        color: '#0F172A',
      };
      setBoardElements((prev) => [...prev, newEl]);
      setTutorPointer({ x: newEl.x, y: newEl.y, active: true, color: '#0066FF' });

      // Animate LaTeX Step Card
      setActiveWorkedEquation({
        latex: formulaText,
        progress: 1.0,
        title: action.sync?.phrase || 'Formula Step',
      });
      return;
    }

    // 8. Draw Primitives Action
    if (action.type === 'draw') {
      const primitive = action.metadata?.primitive || 'illustration';
      if (primitive === 'table' && action.metadata?.tableData) {
        const newEl: BoardElement = {
          id: elementId,
          type: 'table',
          x: action.metadata.x ?? 30,
          y: action.metadata.y ?? 40,
          width: 320,
          headers: action.metadata.tableData.headers,
          rows: action.metadata.tableData.rows,
          activeRowIndex: 0,
        };
        setBoardElements((prev) => [...prev, newEl]);
      } else {
        const newEl: BoardElement = {
          id: elementId,
          type: 'illustration',
          illustrationType: (primitive as any) || 'circuit_schematic',
          x: action.metadata?.x ?? 30,
          y: action.metadata?.y ?? 30,
          width: 300,
          height: 180,
          progress: 1.0,
        };
        setBoardElements((prev) => [...prev, newEl]);
      }
    }
  }, [topicTitle]);

  // Voice Input via Web Speech API
  const handleToggleVoiceInput = () => {
    if (isListeningVoice) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsListeningVoice(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addToast('Voice input is not supported in this browser. Please type your answer.', 'info');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListeningVoice(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((res: any) => res[0].transcript)
          .join(' ');
        setStudentInput(transcript);
      };
      recognition.onerror = () => setIsListeningVoice(false);
      recognition.onend = () => setIsListeningVoice(false);

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('SpeechRecognition failed:', err);
      setIsListeningVoice(false);
    }
  };

  // Submit Answer to Engine
  const handleSubmitAnswer = async (answerToSubmit?: string) => {
    const finalAnswer = answerToSubmit || studentInput.trim();
    if (!finalAnswer || isSubmittingAnswer || !engineRef.current) return;

    setIsSubmittingAnswer(true);
    await engineRef.current.evaluateStudentAnswer({
      topic: topicTitle,
      studentAnswer: finalAnswer,
    });
  };

  // Proceed to Next Segment
  const handleContinueNextSegment = async () => {
    if (!engineRef.current) return;
    const nextSegNum = segmentNumber + 1;
    setSegmentNumber(nextSegNum);
    setIsLoadingSegment(true);
    setActiveQuestion(null);
    setEvaluationFeedback(null);
    setStudentInput('');

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
    <div className="flex flex-col h-full w-full bg-[#F6F6F3] text-[#0F172A] select-none overflow-hidden">
      {/* ── TOP NAV BAR ── */}
      <header className="h-16 px-5 border-b border-[#E3E9F1] bg-[#FFFFFF] flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#F1F5F9] hover:bg-[#E3E9F1] flex items-center justify-center text-[#0F172A] transition-colors"
            title="Leave Tutorial"
          >
            <i className="bi bi-arrow-left text-lg"></i>
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0066FF] bg-[#F1F5F9] px-2 py-0.5 rounded-md">
                Live Teaching
              </span>
              <h1 className="text-sm md:text-base font-bold text-[#0F172A] truncate max-w-[200px] md:max-w-md">
                {topicTitle}
              </h1>
            </div>
            <p className="text-xs text-[#64748B] truncate">
              {courseName} • Segment {segmentNumber} of {totalEstimatedSegments}
            </p>
          </div>
        </div>

        {/* Voice Selector, Progress Dots & Live Badge */}
        <div className="flex items-center space-x-3">
          {/* Voice Switcher Button */}
          <button
            onClick={() => setShowVoiceModal(true)}
            className="flex items-center space-x-1.5 bg-[#F1F5F9] hover:bg-[#E3E9F1] border border-[#E3E9F1] px-3 py-1.5 rounded-full text-xs font-bold text-[#002D62] transition-colors cursor-pointer"
            title="Change Instructor Voice (Aiden, Jennifer, Kai, Andre)"
          >
            <i className="bi bi-person-voice text-[#0066FF] text-sm"></i>
            <span>{currentVoice}</span>
            <i className="bi bi-chevron-down text-[10px] text-[#64748B]"></i>
          </button>

          <div className="hidden sm:flex items-center space-x-1.5 bg-[#F1F5F9] px-3 py-1.5 rounded-full border border-[#E3E9F1]">
            {Array.from({ length: totalEstimatedSegments }).map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i + 1 === segmentNumber
                    ? 'bg-[#0066FF] ring-4 ring-[#0066FF]/20 scale-110'
                    : i + 1 < segmentNumber
                    ? 'bg-[#002D62]'
                    : 'bg-[#E3E9F1]'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center space-x-2 bg-[#F1F5F9] px-3 py-1.5 rounded-full border border-[#E3E9F1]">
            <span className={`w-2.5 h-2.5 rounded-full ${isSpeaking ? 'bg-[#0066FF] animate-ping' : 'bg-[#64748B]'}`} />
            <span className="text-xs font-semibold text-[#0F172A]">
              {isSpeaking ? 'Lecturer Speaking' : 'Listening / Ready'}
            </span>
          </div>
        </div>
      </header>

      {/* ── MAIN TUTORIAL SPLIT LAYOUT ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* LEFT / TOP: LIVE WHITEBOARD CANVAS */}
        <div className="flex-1 flex flex-col p-4 relative min-h-[300px] lg:min-h-0">
          <div className="flex-1 rounded-2xl bg-[#FFFFFF] border border-[#E3E9F1] shadow-sm relative overflow-hidden flex flex-col">
            {/* Whiteboard Header info */}
            <div className="h-10 px-4 bg-[#FFFFFF] border-b border-[#E3E9F1] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <i className="bi bi-easel2-fill text-[#0066FF] text-sm"></i>
                <span className="text-xs font-bold text-[#002D62]">
                  {currentSegment?.lesson.title || 'Whiteboard Presentation'}
                </span>
              </div>
              <span className="text-[11px] text-[#64748B]">Interactive Vector Canvas</span>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 relative bg-[#FFFFFF]">
              <LiveWhiteboardCanvas
                elements={boardElements}
                tutorPointer={tutorPointer}
                activeFocusArea={activeFocusArea}
                gridStyle="dots"
                className="w-full h-full"
              />

              {isLoadingSegment && (
                <div className="absolute inset-0 bg-[#FFFFFF]/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 z-30">
                  <div className="w-8 h-8 border-3 border-[#0066FF] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-semibold text-[#002D62]">Lecturer is preparing the next concept...</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT / BOTTOM: SPOKEN NARRATIVE & INTERACTIVE QUESTION DOCK */}
        <div className="w-full lg:w-[420px] bg-[#FFFFFF] border-t lg:border-t-0 lg:border-l border-[#E3E9F1] flex flex-col shrink-0 shadow-lg z-10">
          {/* Spoken Explanation Panel */}
          <div className="p-5 border-b border-[#E3E9F1] bg-[#F6F6F3]">
            <div className="flex items-center space-x-2 mb-2">
              <i className="bi bi-chat-quote-fill text-[#0066FF]"></i>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#002D62]">
                Lecturer Explanation
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-[#0F172A] font-medium bg-[#FFFFFF] p-3.5 rounded-xl border border-[#E3E9F1] shadow-xs">
              {currentSegment?.teaching.speech || 'Welcome to the live lesson. Connecting with lecturer...'}
            </p>

            {/* Step-by-Step KaTeX Equation Animator */}
            {activeWorkedEquation && (
              <div className="mt-3">
                <EquationStepAnimator
                  latex={activeWorkedEquation.latex}
                  stepNumber={activeWorkedEquation.stepNumber}
                  title={activeWorkedEquation.title}
                  progress={activeWorkedEquation.progress}
                  highlightTokens={activeWorkedEquation.highlightTokens}
                  isPulsing={true}
                />
              </div>
            )}
          </div>

          {/* Interactive Question & Feedback Area */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {activeQuestion ? (
              <div className="bg-[#FFFFFF] border-2 border-[#0066FF]/30 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-full bg-[#0066FF] text-white flex items-center justify-center text-xs font-bold">
                    Q
                  </span>
                  <h3 className="text-xs font-bold text-[#002D62] uppercase tracking-wider">
                    Comprehension Check
                  </h3>
                </div>

                <p className="text-sm font-semibold text-[#0F172A]">
                  {activeQuestion.question}
                </p>

                {/* Quick select chips if options exist */}
                {activeQuestion.options && activeQuestion.options.length > 0 && !evaluationFeedback && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {activeQuestion.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleSubmitAnswer(opt)}
                        disabled={isSubmittingAnswer}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[#E3E9F1] bg-[#F1F5F9] hover:bg-[#0066FF] hover:text-white text-[#0F172A] font-medium transition-colors"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Freeform Voice / Text Answer Input */}
                {!evaluationFeedback && (
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={studentInput}
                        onChange={(e) => setStudentInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                        placeholder="Speak or type your answer..."
                        disabled={isSubmittingAnswer}
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-[#E3E9F1] focus:outline-none focus:border-[#0066FF] bg-[#FFFFFF] text-[#0F172A]"
                      />
                      <button
                        onClick={handleToggleVoiceInput}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                          isListeningVoice ? 'bg-red-500 text-white animate-pulse' : 'bg-[#F1F5F9] text-[#0066FF] hover:bg-[#E3E9F1]'
                        }`}
                        title="Answer via Voice"
                      >
                        <i className={`bi ${isListeningVoice ? 'bi-mic-fill' : 'bi-mic'}`}></i>
                      </button>
                      <button
                        onClick={() => handleSubmitAnswer()}
                        disabled={!studentInput.trim() || isSubmittingAnswer}
                        className="px-3.5 py-2 bg-[#0066FF] hover:bg-[#0052cc] text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {isSubmittingAnswer ? '...' : 'Submit'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Conversational Evaluation Feedback */}
                {evaluationFeedback && (
                  <div className="mt-3 p-3 rounded-lg bg-[#F1F5F9] border border-[#E3E9F1] space-y-2">
                    <div className="flex items-center space-x-2">
                      <i className={`bi ${evaluationFeedback.isCorrect ? 'bi-check-circle-fill text-green-600' : 'bi-info-circle-fill text-[#0066FF]'}`}></i>
                      <span className="text-xs font-bold text-[#0F172A]">
                        {evaluationFeedback.isCorrect ? 'Great understanding!' : 'Good effort! Let us clarify:'}
                      </span>
                    </div>
                    <p className="text-xs text-[#0F172A] leading-relaxed">
                      {evaluationFeedback.spokenFeedback}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 bg-[#F6F6F3] rounded-xl border border-dashed border-[#E3E9F1]">
                <i className="bi bi-lightbulb text-2xl text-[#0066FF] mb-2"></i>
                <p className="text-xs text-[#64748B] font-medium">
                  Watch the whiteboard explanation. Questions will appear as concepts unfold.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Controls */}
          <div className="p-4 border-t border-[#E3E9F1] bg-[#FFFFFF] flex items-center justify-between">
            <button
              onClick={() => engineRef.current?.playSegmentSpeech(currentSegment!)}
              disabled={!currentSegment}
              className="text-xs font-semibold text-[#002D62] hover:text-[#0066FF] flex items-center space-x-1"
            >
              <i className="bi bi-arrow-repeat"></i>
              <span>Replay Audio</span>
            </button>

            <button
              onClick={handleContinueNextSegment}
              disabled={isLoadingSegment}
              className="px-5 py-2.5 bg-[#0066FF] hover:bg-[#0052cc] text-white rounded-xl text-xs font-bold flex items-center space-x-2 transition-transform active:scale-95 shadow-md shadow-[#0066FF]/20"
            >
              <span>{segmentNumber >= totalEstimatedSegments ? 'Finish Lesson' : 'Next Concept'}</span>
              <i className="bi bi-arrow-right"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Voice Selector Modal */}
      <LiveTutorialVoiceSelectorModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onSelectVoiceAndStart={handleVoiceChange}
        topicTitle={topicTitle}
        initialVoice={currentVoice}
      />
    </div>
  );
};
