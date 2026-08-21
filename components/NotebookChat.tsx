import React, { useState, useEffect, useRef } from 'react';
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

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface NotebookChatProps {
  notebook: Notebook;
  chapter: NotebookChapter;
  chapterContent: string;
  userProfile: UserProfile;
  onBack: () => void;
}

export const NotebookChat: React.FC<NotebookChatProps> = ({
  notebook,
  chapter,
  chapterContent,
  userProfile,
  onBack,
}) => {
  const { settings: appSettings } = useAppSettings();
  const { addToast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'init_1',
      sender: 'assistant',
      text: `Hello ${userProfile?.display_name || 'there'}! I'm your dedicated Socratic tutor for **${chapter.title}** from *${notebook.title}*.\n\nAsk me anything about this chapter, or request an explanation of a formula, concept, or worked example!`,
      timestamp: Date.now(),
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitCost, setLimitCost] = useState(1);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || inputText).trim();
    if (!messageText || isLoading) return;

    const cost = getFeatureCost('ai_chat', appSettings);
    setLimitCost(cost);
    const hasCredits = await checkAICredits(userProfile?.uid, cost);
    if (!hasCredits) {
      setShowLimitModal(true);
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: messageText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const ai = createAvelutAI(appSettings, userProfile);
      if (!ai) throw new Error('AI is not configured. Please check App Controls.');
      const prompt = `You are a world-class academic tutor teaching a student from their uploaded textbook chapter.
Use a helpful, clear, and Socratic teaching approach. Use LaTeX notation ($...$ inline or $$...$$ block) for all mathematical expressions.

BOOK: ${notebook.title}
CHAPTER: ${chapter.title}
PAGES: ${chapter.startPage} to ${chapter.endPage}

TEXTBOOK EXCERPT:
${chapterContent.slice(0, 8000)}

CONVERSATION HISTORY:
${messages.map((m) => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n')}

STUDENT'S NEW QUESTION:
${messageText}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          temperature: 0.3,
        },
      });

      const replyText = getResponseText(response);
      const assistantMsg: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'assistant',
        text: replyText || 'I could not generate an explanation for that. Please rephrase your question.',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      void deductAICredits(userProfile?.uid, cost, 'Notebook Chat Tutor');
    } catch (err) {
      console.error('Notebook chat error:', err);
      addToast('Failed to get answer. Please check your connection.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const suggestionPills = [
    'Explain the core principle simply',
    'Walk me through a worked example',
    'Quiz me on key formulas',
  ];

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col overflow-hidden bg-[#F6F6F3] animate-fade-in">
      {/* Fixed Header */}
      <div className="shrink-0 px-3 sm:px-5 pt-3 sm:pt-4 pb-2">
        <div className="bg-white border border-[#E3E9F1] rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-2xs max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-[#F6F6F3] hover:bg-white border border-[#E3E9F1] flex items-center justify-center text-[#0F172A] transition-all cursor-pointer shrink-0"
            >
              <i className="bi bi-arrow-left text-sm font-bold"></i>
            </button>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block truncate">
                {notebook.title}
              </span>
              <h2 className="text-sm font-black text-[#0F172A] truncate">
                {chapter.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#F1F5F9] rounded-full border border-[#E3E9F1] text-[11px] font-bold text-[#0066FF] shrink-0">
            <i className="bi bi-chat-dots"></i>
            <span className="hidden sm:inline">Chapter Tutor</span>
          </div>
        </div>
      </div>

      {/* Scrollable Messages Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5">
        <div className="max-w-4xl mx-auto w-full bg-white border border-[#E3E9F1] rounded-3xl p-4 sm:p-6 space-y-4 shadow-xs">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full animate-fade-in`}
              >
                <div
                  className={`p-4 sm:p-5 rounded-2xl leading-relaxed text-sm ${
                    isUser
                      ? 'min-w-[33%] max-w-[85%] sm:max-w-[75%] bg-[#002D62] text-white'
                      : 'w-full bg-[#F6F6F3] text-[#0F172A] border border-[#E3E9F1]'
                  }`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formatLatexMath(msg.text)}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-2 p-3 bg-[#F6F6F3] rounded-2xl border border-[#E3E9F1] w-fit">
              <div className="w-2 h-2 rounded-full bg-[#0066FF] animate-ping" />
              <span className="text-xs text-[#64748B] font-medium">Tutor is formulating response...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed Bottom: Suggestions + Input — floats above bottom nav */}
      <div className="shrink-0 px-3 sm:px-5 pt-2 pb-[calc(76px+env(safe-area-inset-bottom)+8px)]">
        <div className="max-w-4xl mx-auto w-full space-y-2">
          {/* Suggestion Pills */}
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
            {suggestionPills.map((pill, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(pill)}
                className="px-3.5 py-1.5 rounded-full bg-white border border-[#E3E9F1] hover:border-[#0066FF] text-[#0F172A] text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shadow-2xs shrink-0"
              >
                <i className="bi bi-sparkles mr-1 text-[#0066FF]"></i>
                {pill}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <div className="bg-white border border-[#E3E9F1] rounded-2xl p-1.5 sm:p-2 flex items-center gap-2 shadow-2xs">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder="Ask a question about this chapter..."
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-transparent text-sm text-[#0F172A] placeholder:text-[#64748B] focus:outline-none"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isLoading}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <i className="bi bi-send-fill text-sm"></i>
            </button>
          </div>
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
};

export default NotebookChat;
