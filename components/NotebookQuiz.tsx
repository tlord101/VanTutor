import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { formatLatexMath } from '../utils/latexFormatter';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { checkAICredits, deductAICredits, getFeatureCost } from '../utils/usage';
import { LimitExceededModal } from './LimitExceededModal';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import type { UserProfile } from '../types';
import type { Notebook, NotebookChapter } from '../services/notebookStorageService';

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface NotebookQuizProps {
  notebook: Notebook;
  chapter: NotebookChapter;
  chapterContent: string;
  userProfile: UserProfile;
  onBack: () => void;
}

export const NotebookQuiz: React.FC<NotebookQuizProps> = ({
  notebook,
  chapter,
  chapterContent,
  userProfile,
  onBack,
}) => {
  const { settings: appSettings } = useAppSettings();
  const { addToast } = useToast();

  // Configuration State
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'standard' | 'challenging'>('standard');

  // Quiz Execution State
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(15 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitCost, setLimitCost] = useState(1);

  const timerRef = useRef<any>(null);

  // Timer Tick
  useEffect(() => {
    if (isTimerRunning && timeLeftSeconds > 0 && !isSubmitted) {
      timerRef.current = setInterval(() => {
        setTimeLeftSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setIsSubmitted(true);
            addToast('Time is up! Quiz submitted automatically.', 'info');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, timeLeftSeconds, isSubmitted, addToast]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate Questions via AI
  const handleStartQuiz = async () => {
    const cost = getFeatureCost('exam_generate', appSettings);
    setLimitCost(cost);
    const hasCredits = await checkAICredits(userProfile?.uid, cost);
    if (!hasCredits) {
      setShowLimitModal(true);
      return;
    }

    setIsGenerating(true);
    setIsConfiguring(false);

    try {
      const ai = createAvelutAI(appSettings, userProfile);
      if (!ai) throw new Error('AI is not configured. Please check App Controls.');
      const prompt = `You are an expert academic examiner. Based ONLY on the following textbook chapter excerpt, generate exactly ${questionCount} high-quality, professional multiple-choice questions.

CHAPTER TITLE: ${chapter.title}
BOOK: ${notebook.title}
CONTENT EXCERPT:
${chapterContent.slice(0, 7000)}

RULES:
1. Ensure all mathematical expressions and formulas are formatted in valid LaTeX with $...$ for inline or $$...$$ for blocks.
2. Provide exactly 4 clear options (A, B, C, D) per question.
3. Include a comprehensive step-by-step academic explanation for why the correct option is right.
4. Output strictly valid JSON matching this schema:
[
  {
    "id": 1,
    "question": "Question text with LaTeX if applicable",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Detailed step-by-step academic explanation"
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const responseText = getResponseText(response);
      const parsed = JSON.parse(responseText.replace(/```(?:json)?/gi, '').trim());

      if (Array.isArray(parsed) && parsed.length > 0) {
        setQuestions(parsed);
        setTimeLeftSeconds(selectedMinutes * 60);
        setIsTimerRunning(true);
        void deductAICredits(userProfile?.uid, cost, 'Notebook Quiz Generation');
      } else {
        throw new Error('Invalid question format received');
      }
    } catch (err) {
      console.error('Quiz generation error:', err);
      addToast('Failed to generate quiz from chapter. Please retry.', 'error');
      setIsConfiguring(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectOption = (optionIndex: number) => {
    if (isSubmitted) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentIndex]: optionIndex,
    }));
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctIndex) {
        score++;
      }
    });
    return score;
  };

  // 1. Configuration Screen
  if (isConfiguring) {
    return (
      <div className="flex-1 w-full max-w-2xl mx-auto p-4 sm:p-6 flex flex-col justify-center animate-fade-in">
        <div className="bg-white border border-[#E3E9F1] rounded-3xl p-6 sm:p-8 shadow-xs">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[#E3E9F1] pb-5 mb-6">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0F172A] transition-all cursor-pointer"
            >
              <i className="bi bi-arrow-left text-sm"></i>
            </button>
            <div>
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                {notebook.title}
              </span>
              <h2 className="text-xl font-black text-[#0F172A] tracking-tight">
                {chapter.title} — Quiz Setup
              </h2>
            </div>
          </div>

          {/* Time Limit Setting */}
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-2.5">
                <i className="bi bi-clock mr-1.5 text-[#0066FF]"></i> Global Quiz Timer
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 30].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setSelectedMinutes(mins)}
                    className={`py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                      selectedMinutes === mins
                        ? 'bg-[#002D62] text-white border-2 border-[#0066FF]'
                        : 'bg-[#F6F6F3] text-[#0F172A] border border-[#E3E9F1] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    {mins} Mins
                  </button>
                ))}
              </div>
            </div>

            {/* Question Count Setting */}
            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-2.5">
                <i className="bi bi-list-ol mr-1.5 text-[#0066FF]"></i> Question Count
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 15].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setQuestionCount(cnt)}
                    className={`py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                      questionCount === cnt
                        ? 'bg-[#002D62] text-white border-2 border-[#0066FF]'
                        : 'bg-[#F6F6F3] text-[#0F172A] border border-[#E3E9F1] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    {cnt} Questions
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty Setting */}
            <div>
              <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-2.5">
                <i className="bi bi-sliders mr-1.5 text-[#0066FF]"></i> Difficulty Level
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'challenging'] as const).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setDifficulty(diff)}
                    className={`py-3 rounded-2xl text-xs font-bold capitalize transition-all cursor-pointer ${
                      difficulty === diff
                        ? 'bg-[#002D62] text-white border-2 border-[#0066FF]'
                        : 'bg-[#F6F6F3] text-[#0F172A] border border-[#E3E9F1] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartQuiz}
              className="w-full py-4 bg-[#0066FF] hover:bg-[#0052cc] active:scale-98 text-white font-bold text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 mt-4"
            >
              <span>Generate & Start Quiz</span>
              <i className="bi bi-arrow-right"></i>
            </button>
          </div>
        </div>

        <LimitExceededModal
          isOpen={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          userProfile={userProfile}
          appSettings={appSettings}
          cost={limitCost}
          balance={userProfile?.credits_balance || 0}
          addToast={addToast}
        />
      </div>
    );
  }

  // 2. Generating State
  if (isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in max-w-md mx-auto">
        <div className="w-14 h-14 rounded-full border-3 border-[#E3E9F1] border-t-[#0066FF] animate-spin mb-4" />
        <h3 className="text-lg font-black text-[#0F172A] tracking-tight">
          Formulating Academic Quiz...
        </h3>
        <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
          Extracting key principles, theorems, and worked problems from "{chapter.title}".
        </p>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(selectedAnswers).length;

  // 3. Results Screen
  if (isSubmitted) {
    const finalScore = calculateScore();
    const percent = Math.round((finalScore / totalQuestions) * 100);

    return (
      <div className="flex-1 w-full max-w-3xl mx-auto p-4 sm:p-6 overflow-y-auto space-y-6 animate-fade-in">
        {/* Score Summary Banner */}
        <div className="bg-white border border-[#E3E9F1] rounded-3xl p-6 sm:p-8 text-center">
          <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Quiz Completed</span>
          <h2 className="text-3xl font-black text-[#0F172A] mt-1">
            {percent >= 70 ? 'Excellent Mastery!' : percent >= 50 ? 'Good Effort' : 'Needs Review'}
          </h2>
          <div className="inline-flex items-baseline gap-1 mt-3 px-6 py-2.5 bg-[#F1F5F9] rounded-2xl border border-[#E3E9F1]">
            <span className="text-4xl font-black text-[#0066FF]">{finalScore}</span>
            <span className="text-lg font-bold text-[#64748B]">/ {totalQuestions}</span>
            <span className="text-sm font-semibold text-[#64748B] ml-2">({percent}%)</span>
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => {
                setIsSubmitted(false);
                setSelectedAnswers({});
                setCurrentIndex(0);
                setIsConfiguring(true);
              }}
              className="px-6 py-3 rounded-2xl bg-[#0066FF] hover:bg-[#0052cc] text-white font-bold text-xs transition-all cursor-pointer"
            >
              Take Another Quiz
            </button>
            <button
              onClick={onBack}
              className="px-6 py-3 rounded-2xl bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] text-[#0F172A] font-bold text-xs transition-all cursor-pointer"
            >
              Back to Chapters
            </button>
          </div>
        </div>

        {/* Detailed Solutions Review */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider px-1">
            Question Review & Solutions
          </h3>

          {questions.map((q, idx) => {
            const userAns = selectedAnswers[idx];
            const isCorrect = userAns === q.correctIndex;

            return (
              <div
                key={q.id || idx}
                className={`bg-white border rounded-2xl p-5 sm:p-6 transition-all ${
                  isCorrect ? 'border-emerald-200' : 'border-rose-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="text-xs font-bold text-[#64748B] uppercase">
                    Question {idx + 1}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      isCorrect
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                </div>

                <div className="text-sm font-medium text-[#0F172A] leading-relaxed mb-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formatLatexMath(q.question)}
                  </ReactMarkdown>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = userAns === optIdx;
                    const isRightAnswer = optIdx === q.correctIndex;

                    let btnClass = 'bg-[#F6F6F3] border-[#E3E9F1] text-[#0F172A]';
                    if (isRightAnswer) {
                      btnClass = 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold';
                    } else if (isSelected && !isRightAnswer) {
                      btnClass = 'bg-rose-50 border-rose-400 text-rose-900 line-through';
                    }

                    return (
                      <div
                        key={optIdx}
                        className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${btnClass}`}
                      >
                        <span className="font-bold opacity-70">
                          {String.fromCharCode(65 + optIdx)}.
                        </span>
                        <div className="flex-1">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {formatLatexMath(opt)}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                <div className="p-3.5 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-xs text-[#334155] leading-relaxed">
                  <span className="font-bold text-[#0F172A] block mb-1">
                    <i className="bi bi-info-circle mr-1 text-[#0066FF]"></i> Solution Explanation:
                  </span>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formatLatexMath(q.explanation)}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 4. Live Quiz View
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto p-4 sm:p-6 flex flex-col justify-between animate-fade-in">
      {/* Top Bar with Timer and Progress */}
      <div className="bg-white border border-[#E3E9F1] rounded-2xl p-4 flex items-center justify-between mb-4">
        {/* Global Timer Top-Left */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F6F6F3] border border-[#E3E9F1] rounded-xl">
          <i
            className={`bi bi-stopwatch text-sm ${
              timeLeftSeconds < 120 ? 'text-rose-600 animate-pulse' : 'text-[#0066FF]'
            }`}
          ></i>
          <span
            className={`font-mono text-sm font-bold ${
              timeLeftSeconds < 120 ? 'text-rose-600 font-black' : 'text-[#0F172A]'
            }`}
          >
            {formatTimer(timeLeftSeconds)}
          </span>
        </div>

        {/* Question Counter */}
        <div className="text-xs font-bold text-[#64748B]">
          Question <span className="text-[#0F172A] font-black">{currentIndex + 1}</span> of {totalQuestions}
        </div>

        {/* End / Submit Early Button */}
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to submit the quiz now?')) {
              setIsSubmitted(true);
            }
          }}
          className="px-3.5 py-1.5 rounded-xl border border-[#E3E9F1] bg-[#F6F6F3] hover:bg-white text-xs font-bold text-[#0F172A] transition-all cursor-pointer"
        >
          Submit Quiz
        </button>
      </div>

      {/* Main Question Card */}
      {currentQ && (
        <div className="flex-1 bg-white border border-[#E3E9F1] rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xs mb-4">
          <div>
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              {chapter.title}
            </span>
            <div className="text-base sm:text-lg font-bold text-[#0F172A] leading-relaxed mt-2 mb-6">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {formatLatexMath(currentQ.question)}
              </ReactMarkdown>
            </div>

            {/* Options List */}
            <div className="space-y-3">
              {currentQ.options.map((option, idx) => {
                const isSelected = selectedAnswers[currentIndex] === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectOption(idx)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'bg-[#F1F5F9] border-[#0066FF] text-[#0066FF] font-bold'
                        : 'bg-[#F6F6F3] border-[#E3E9F1] text-[#0F172A] hover:bg-white'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-[#0066FF] text-white'
                          : 'bg-white border border-[#E3E9F1] text-[#64748B]'
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <div className="flex-1 text-sm">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{ p: ({ node, ...props }) => <span {...props} /> }}
                      >
                        {formatLatexMath(option)}
                      </ReactMarkdown>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nav Buttons Inside Question Card */}
          <div className="flex items-center justify-between pt-6 border-t border-[#E3E9F1] mt-6">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] text-[#0F172A] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            >
              <i className="bi bi-arrow-left text-sm"></i>
            </button>

            <span className="text-xs font-semibold text-[#64748B]">
              {answeredCount} of {totalQuestions} answered
            </span>

            {currentIndex < totalQuestions - 1 ? (
              <button
                onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                className="flex items-center justify-center w-11 h-11 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] text-[#0F172A] transition-all cursor-pointer"
              >
                <i className="bi bi-arrow-right text-sm"></i>
              </button>
            ) : (
              <button
                onClick={() => setIsSubmitted(true)}
                className="px-5 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold transition-all cursor-pointer"
              >
                Finish Quiz
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebookQuiz;
