import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { formatLatexMath } from '../utils/latexFormatter';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { checkAICredits, deductAICredits, getFeatureCost } from '../utils/usage';
import { getChapterGeneration, saveChapterGeneration, deleteChapterGeneration } from '../services/notebookStorageService';
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitCost, setLimitCost] = useState(1);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // Restore saved chapter conversation thread from SQLite on mount
  useEffect(() => {
    let isMounted = true;
    getChapterGeneration<ChatMessage[]>(notebook.id, chapter.id, 'chat')
      .then((saved) => {
        if (isMounted && saved && Array.isArray(saved) && saved.length > 0) {
          setMessages(saved);
          // WhatsApp style instant scroll to bottom on mount
          setTimeout(() => scrollToBottom('instant' as ScrollBehavior), 30);
        }
      })
      .catch((err) => console.warn('[NotebookChat] Error restoring chat history:', err));
    return () => {
      isMounted = false;
    };
  }, [notebook.id, chapter.id, scrollToBottom]);

  // Keep scrolled to bottom during live streaming or on new messages
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('smooth');
    }
  }, [messages, isLoading, scrollToBottom]);

  const handleClearHistory = async () => {
    if (window.confirm('Clear conversation history for this chapter?')) {
      setMessages([]);
      await deleteChapterGeneration(notebook.id, chapter.id, 'chat');
      addToast('Conversation history cleared.', 'info');
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || inputText).trim();
    if (!messageText || isLoading) return;

    const cost = getFeatureCost('chat_interaction', appSettings);
    setLimitCost(cost);
    const creditCheck = checkAICredits(userProfile, cost, appSettings);
    if (!creditCheck.allowed) {
      setShowLimitModal(true);
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: messageText,
      timestamp: Date.now(),
    };

    const nextMessagesWithUser = [...messages, userMsg];
    setMessages(nextMessagesWithUser);
    setInputText('');
    setIsLoading(true);

    try {
      const ai = createAvelutAI(appSettings, userProfile);
      if (!ai) throw new Error('AI is not configured. Please check App Controls.');
      const prompt = `You are an expert, precise, and encouraging academic tutor helping a student understand their material: "${chapter.title}" from "${notebook.title}".

CRITICAL TUTORING RULES:
- BE DIRECT & CONCISE: Answer the student's question accurately without unnecessary fluff, filler, or repeating their question back to them.
- If the student sends a casual greeting (like "hi" or "hello"), reply warmly, simply, and naturally (e.g. "Hello! What can I help you with in this chapter?").
- EXPLAIN CLEARLY: Break down complex concepts simply. Use relatable examples and intuitive steps only when explaining or solving a problem.
- COLOR & MATH FORMATTING: Format all math, formulas, and variables with LaTeX ($...$ inline or $$...$$ block). Use clean markdown formatting.

BOOK: ${notebook.title}
CHAPTER: ${chapter.title}
PAGES: ${chapter.startPage} to ${chapter.endPage}

TEXTBOOK EXCERPT:
${chapterContent.slice(0, 8000)}

CONVERSATION HISTORY:
${nextMessagesWithUser.map((m) => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n')}

STUDENT'S QUESTION:
${messageText}`;

      const assistantMsgId = `msg_ai_${Date.now()}`;
      // Initialize empty assistant bubble for live streaming
      setMessages([...nextMessagesWithUser, {
        id: assistantMsgId,
        sender: 'assistant',
        text: '',
        timestamp: Date.now(),
      }]);

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          temperature: 0.3,
        },
      });

      let streamedText = '';
      for await (const chunk of responseStream) {
        const chunkText = getResponseText(chunk);
        streamedText += chunkText;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, text: streamedText } : m))
        );
      }

      const finalMessages = [
        ...nextMessagesWithUser,
        {
          id: assistantMsgId,
          sender: 'assistant' as const,
          text: streamedText || 'I could not generate an explanation for that. Please rephrase your question.',
          timestamp: Date.now(),
        },
      ];

      // Persist full thread to SQLite
      await saveChapterGeneration(notebook.id, chapter.id, userProfile?.uid || 'local', 'chat', finalMessages);
      void deductAICredits(userProfile?.uid, cost, 'Notebook Chat Tutor');
    } catch (err) {
      console.error('Notebook chat error:', err);
      addToast('Failed to get answer. Please check your connection.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const suggestionPills = [
    'Explain the main concept simply',
    'Summarize key takeaways from this chapter',
    'Give me a practical example',
    'Quiz me on this chapter',
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
              aria-label="Go back"
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

          <div className="flex items-center gap-2 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="w-8 h-8 rounded-full bg-[#F6F6F3] hover:bg-rose-50 border border-[#E3E9F1] hover:border-rose-200 flex items-center justify-center text-[#64748B] hover:text-rose-600 transition-all cursor-pointer"
                title="Clear Conversation History"
              >
                <i className="bi bi-trash text-xs"></i>
              </button>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#F1F5F9] rounded-full border border-[#E3E9F1] text-[11px] font-bold text-[#0066FF]">
              <i className="bi bi-chat-dots"></i>
              <span className="hidden sm:inline">Chapter Tutor</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Messages Area — WhatsApp-style bottom upwards loading */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 scroll-smooth"
      >
        <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col justify-end py-3 sm:py-4">
          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center text-center p-6 sm:p-8 bg-white border border-[#E3E9F1] rounded-3xl shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-[#0066FF]/10 text-[#0066FF] flex items-center justify-center text-2xl mb-3.5 shadow-2xs">
                <i className="bi bi-chat-heart-fill"></i>
              </div>
              <h3 className="text-base font-bold text-[#0F172A]">Socratic Tutor for {chapter.title}</h3>
              <p className="text-xs text-[#64748B] max-w-md mt-1 mb-4 leading-relaxed">
                Ask any question, clarify a tricky concept, or get step-by-step worked examples directly from your material.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
                {suggestionPills.map((pill, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(pill)}
                    className="px-3.5 py-1.5 rounded-full bg-[#F6F6F3] hover:bg-blue-50 border border-[#E3E9F1] hover:border-[#0066FF]/40 text-[#0F172A] hover:text-[#0066FF] text-xs font-semibold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <span className="text-[#0066FF] text-xs">✦</span>
                    <span>{pill}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E3E9F1] rounded-3xl p-4 sm:p-6 space-y-4 shadow-xs">
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
                          ? 'min-w-[33%] max-w-[85%] sm:max-w-[75%] bg-[#002D62] text-white shadow-xs rounded-tr-none'
                          : 'w-full bg-[#F6F6F3] text-[#0F172A] border border-[#E3E9F1] rounded-tl-none shadow-2xs'
                      }`}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          p: ({ node, ...props }: any) => <p className="mb-3 last:mb-0 leading-relaxed" {...props} />,
                          strong: ({ node, ...props }: any) => (
                            <strong className={isUser ? 'font-bold text-blue-200' : 'font-bold text-[#002D62]'} {...props} />
                          ),
                          code: ({ node, inline, ...props }: any) =>
                            inline ? (
                              <code className={`px-1.5 py-0.5 rounded font-mono text-xs ${isUser ? 'bg-white/20 text-white' : 'bg-blue-50 text-[#0066FF] border border-blue-100'}`} {...props} />
                            ) : (
                              <code className="block overflow-x-auto rounded-2xl bg-[#0F172A] text-slate-100 p-4 text-xs font-mono my-2.5 border border-slate-700/60" {...props} />
                            ),
                          blockquote: ({ node, ...props }: any) => (
                            <blockquote className={`border-l-4 p-3 rounded-r-xl my-2 text-xs leading-relaxed ${isUser ? 'border-blue-300 bg-white/10 text-white' : 'border-[#0066FF] bg-blue-50/70 text-slate-800'}`} {...props} />
                          ),
                          ul: ({ node, ...props }: any) => <ul className="mb-3 last:mb-0 list-disc pl-5 space-y-1.5 marker:text-[#0066FF]" {...props} />,
                          ol: ({ node, ...props }: any) => <ol className="mb-3 last:mb-0 list-decimal pl-5 space-y-1.5 marker:text-[#0066FF] font-medium" {...props} />,
                          li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
                          a: ({ node, ...props }: any) => <a className={`${isUser ? 'text-blue-200 underline' : 'text-[#0066FF] underline hover:text-[#002D62]'}`} target="_blank" rel="noopener noreferrer" {...props} />,
                          table: ({ node, ...props }: any) => <div className="overflow-x-auto my-3"><table className="w-full border-collapse text-xs border border-[#E3E9F1] rounded-xl overflow-hidden shadow-2xs" {...props} /></div>,
                          th: ({ node, ...props }: any) => <th className="bg-[#F1F5F9] text-[#002D62] font-bold p-2.5 text-left border border-[#E3E9F1]" {...props} />,
                          td: ({ node, ...props }: any) => <td className="p-2.5 border border-[#E3E9F1] bg-white text-[#0F172A]" {...props} />,
                        }}
                      >
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
          )}
        </div>
      </div>

      {/* Fixed Bottom: Suggestions + Input — floats above bottom nav */}
      <div className="shrink-0 px-3 sm:px-5 pt-2 pb-[calc(76px+env(safe-area-inset-bottom)+8px)]">
        <div className="max-w-4xl mx-auto w-full space-y-2">
          {/* Suggestion Pills */}
          {messages.length > 0 && (
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
          )}

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
              aria-label="Send message"
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
        balance={userProfile?.ai_credits_balance ?? 0}
        addToast={addToast}
      />
    </div>
  );
};

export default NotebookChat;
