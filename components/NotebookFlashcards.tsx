import React, { useState, useEffect } from 'react';
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

interface FlashcardItem {
  id: number;
  front: string;
  back: string;
  hint?: string;
}

interface NotebookFlashcardsProps {
  notebook: Notebook;
  chapter: NotebookChapter;
  chapterContent: string;
  userProfile: UserProfile;
  onBack: () => void;
}

export const NotebookFlashcards: React.FC<NotebookFlashcardsProps> = ({
  notebook,
  chapter,
  chapterContent,
  userProfile,
  onBack,
}) => {
  const { appSettings } = useAppSettings();
  const { addToast } = useToast();

  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitCost, setLimitCost] = useState(1);
  const [ratings, setRatings] = useState<Record<number, 'hard' | 'good' | 'easy'>>({});

  const generateCards = async () => {
    const cost = getFeatureCost('flashcards_generate', appSettings);
    setLimitCost(cost);
    const hasCredits = await checkAICredits(userProfile?.uid, cost);
    if (!hasCredits) {
      setShowLimitModal(true);
      return;
    }

    setIsGenerating(true);

    try {
      const ai = createAvelutAI();
      const prompt = `You are a master educator creating high-retention flashcards.
Based on the following textbook chapter excerpt, generate exactly 10 high-value flashcards covering key definitions, formulas, concepts, and principles.

CHAPTER: ${chapter.title}
CONTENT:
${chapterContent.slice(0, 7000)}

RULES:
1. "front": Clear prompt, concept query, or equation setup.
2. "back": Concise, precise explanation or breakdown with LaTeX ($...$).
3. "hint": Short memory anchor or mnemonic.
4. Output strictly valid JSON array:
[
  {
    "id": 1,
    "front": "Front question/concept in LaTeX",
    "back": "Back concise definition/solution in LaTeX",
    "hint": "Brief memory clue"
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const responseText = getResponseText(response);
      const parsed = JSON.parse(responseText.replace(/```(?:json)?/gi, '').trim());

      if (Array.isArray(parsed) && parsed.length > 0) {
        setCards(parsed);
        void deductAICredits(userProfile?.uid, cost, 'Notebook Flashcard Generation');
      } else {
        throw new Error('Invalid flashcards format received');
      }
    } catch (err) {
      console.error('Flashcard error:', err);
      addToast('Failed to generate flashcards. Please retry.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    void generateCards();
  }, []);

  const handleRate = (rating: 'hard' | 'good' | 'easy') => {
    setRatings((prev) => ({ ...prev, [currentIndex]: rating }));
    setIsFlipped(false);
    setShowHint(false);
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  if (isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in max-w-md mx-auto">
        <div className="w-14 h-14 rounded-full border-3 border-[#E3E9F1] border-t-[#0066FF] animate-spin mb-4" />
        <h3 className="text-lg font-black text-[#0F172A] tracking-tight">
          Generating Flashcards...
        </h3>
        <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
          Distilling essential concepts from "{chapter.title}".
        </p>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto p-4 sm:p-6 flex flex-col justify-between animate-fade-in">
      {/* Header */}
      <div className="bg-white border border-[#E3E9F1] rounded-2xl p-4 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0F172A] transition-all cursor-pointer"
          >
            <i className="bi bi-arrow-left text-sm"></i>
          </button>
          <div>
            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
              {notebook.title}
            </span>
            <h2 className="text-sm font-black text-[#0F172A] truncate max-w-[200px] sm:max-w-xs">
              {chapter.title}
            </h2>
          </div>
        </div>

        <span className="text-xs font-bold text-[#64748B]">
          Card <span className="text-[#0F172A] font-black">{currentIndex + 1}</span> of {cards.length}
        </span>
      </div>

      {/* 3D Flashcard Flip Surface */}
      {currentCard && (
        <div
          onClick={() => setIsFlipped(!isFlipped)}
          className="flex-1 min-h-[300px] sm:min-h-[360px] bg-white border border-[#E3E9F1] rounded-3xl p-6 sm:p-8 flex flex-col justify-between cursor-pointer transition-all hover:border-[#0066FF]/40 mb-4 select-none"
        >
          {/* Card Label */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              {isFlipped ? 'Answer / Explanation' : 'Question / Concept'}
            </span>
            <span className="text-[11px] font-bold text-[#0066FF] flex items-center gap-1">
              <i className="bi bi-arrow-repeat text-xs"></i>
              <span>Tap to flip</span>
            </span>
          </div>

          {/* Card Text Content */}
          <div className="my-auto py-4 text-center">
            <div className="text-base sm:text-xl font-bold text-[#0F172A] leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {formatLatexMath(isFlipped ? currentCard.back : currentCard.front)}
              </ReactMarkdown>
            </div>

            {showHint && currentCard.hint && !isFlipped && (
              <div className="mt-4 p-3 bg-[#F1F5F9] rounded-2xl border border-[#E3E9F1] text-xs text-[#64748B] inline-block animate-fade-in">
                <i className="bi bi-lightbulb mr-1 text-amber-500"></i>
                {currentCard.hint}
              </div>
            )}
          </div>

          {/* Bottom Hint Toggle */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E3E9F1]/60">
            {currentCard.hint && !isFlipped ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHint(!showHint);
                }}
                className="text-xs font-bold text-[#64748B] hover:text-[#0066FF] flex items-center gap-1 transition-colors"
              >
                <i className="bi bi-lightbulb"></i>
                <span>{showHint ? 'Hide Hint' : 'Show Hint'}</span>
              </button>
            ) : <div />}

            <span className="text-[11px] text-[#64748B]">
              {ratings[currentIndex] ? `Rated: ${ratings[currentIndex].toUpperCase()}` : 'Unrated'}
            </span>
          </div>
        </div>
      )}

      {/* Bottom Rating / Navigation Bar */}
      <div className="bg-white border border-[#E3E9F1] rounded-2xl p-4 flex items-center justify-between gap-2">
        <button
          onClick={() => {
            setIsFlipped(false);
            setShowHint(false);
            setCurrentIndex((prev) => Math.max(0, prev - 1));
          }}
          disabled={currentIndex === 0}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] text-[#0F172A] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shrink-0"
        >
          <i className="bi bi-arrow-left text-sm"></i>
        </button>

        <div className="flex items-center gap-2 flex-1 justify-center max-w-xs">
          <button
            onClick={() => handleRate('hard')}
            className="flex-1 py-2.5 bg-[#F6F6F3] hover:bg-rose-50 border border-[#E3E9F1] hover:border-rose-200 text-rose-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Hard
          </button>
          <button
            onClick={() => handleRate('good')}
            className="flex-1 py-2.5 bg-[#F6F6F3] hover:bg-amber-50 border border-[#E3E9F1] hover:border-amber-200 text-amber-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Good
          </button>
          <button
            onClick={() => handleRate('easy')}
            className="flex-1 py-2.5 bg-[#F6F6F3] hover:bg-emerald-50 border border-[#E3E9F1] hover:border-emerald-200 text-emerald-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Easy
          </button>
        </div>

        <button
          onClick={() => {
            setIsFlipped(false);
            setShowHint(false);
            setCurrentIndex((prev) => Math.min(cards.length - 1, prev + 1));
          }}
          disabled={currentIndex === cards.length - 1}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] text-[#0F172A] disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shrink-0"
        >
          <i className="bi bi-arrow-right text-sm"></i>
        </button>
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
};

export default NotebookFlashcards;
