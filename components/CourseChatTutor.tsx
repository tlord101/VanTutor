import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { motion, AnimatePresence } from 'framer-motion';
import { formatLatexMath } from '../utils/latexFormatter';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { checkAICredits, deductAICredits, getFeatureCost } from '../utils/usage';
import { readCachedJson, writeCachedJson, clearCachedKey } from '../utils/cache';
import { LimitExceededModal } from './LimitExceededModal';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import { XIcon } from './icons/XIcon';

const PlusIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CameraOutlineIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const PhotoOutlineIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const FolderOutlineIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

export interface CourseChatTutorMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    isImage: boolean;
  }>;
}

export interface CourseChatTutorProps {
  course: Course;
  topic: Topic;
  userProfile: UserProfile;
  onBack: () => void;
  onOpenVoiceTutorial: () => void;
  setCustomHeaderConfig?: (config: any) => void;
}

export const CourseChatTutor: React.FC<CourseChatTutorProps> = ({
  course,
  topic,
  userProfile,
  onBack,
  onOpenVoiceTutorial,
  setCustomHeaderConfig,
}) => {
  const { settings: appSettings } = useAppSettings();
  const { addToast } = useToast();

  const cacheKey = `avelut_course_chat_${userProfile?.uid || 'anon'}_${course.course_id}_${topic.topic_id}`;

  const [messages, setMessages] = useState<CourseChatTutorMessage[]>(() => {
    return readCachedJson<CourseChatTutorMessage[]>(cacheKey, []);
  });

  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [streamingBotText, setStreamingBotText] = useState<string | null>(null);
  const [expandedUserMessageIds, setExpandedUserMessageIds] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitCost, setLimitCost] = useState(1);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputElementRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Hide bottom nav while inside course chat tutor
  useEffect(() => {
    if (setCustomHeaderConfig) {
      setCustomHeaderConfig({ hideBottomNav: true });
    }
    return () => {
      if (setCustomHeaderConfig) {
        setCustomHeaderConfig(null);
      }
    };
  }, [setCustomHeaderConfig]);

  const toggleUserMessageExpand = (id: string) => {
    setExpandedUserMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // WhatsApp-style instant bottom anchor on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom('instant' as ScrollBehavior);
    }, 40);
    return () => clearTimeout(timer);
  }, [scrollToBottom]);

  // Keep scrolled to bottom during streaming and on message updates
  useEffect(() => {
    if (messages.length > 0 || streamingBotText !== null) {
      scrollToBottom('smooth');
    }
  }, [messages, streamingBotText, scrollToBottom]);

  // Auto-initiate first Socratic bite-sized step if chat is empty
  useEffect(() => {
    if (messages.length === 0 && !isSending) {
      void initFirstBiteSizedStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initFirstBiteSizedStep = async () => {
    const ai = createAvelutAI(appSettings, userProfile);
    if (!ai) return;

    setIsSending(true);
    const starterPrompt = `You are AVELUT Socratic Course Tutor for "${course.course_name}" (${course.course_code || ''}).
TOPIC: "${topic.topic_name}"
TOPIC OVERVIEW: "${topic.topic_context || topic.start_point || 'Core principles of ' + topic.topic_name}"

TASK:
Begin the first bite-sized step of teaching this topic to the student.
1. Welcome the student in 1 friendly sentence.
2. Give a brief, intuitive real-world analogy introducing "${topic.topic_name}".
3. End with a 1-sentence engaging question asking if they are ready to dive into the core principle.

STRICT TOKEN CONSTRAINT: Keep total response under 100 words (< 180 tokens). Do not lecture or dump info. Format math using LaTeX ($...$).`;

    try {
      setStreamingBotText('');
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: starterPrompt,
        config: { temperature: 0.3, maxOutputTokens: 250 },
      });

      let streamedText = '';
      for await (const chunk of responseStream) {
        const chunkText = getResponseText(chunk);
        streamedText += chunkText;
        setStreamingBotText(streamedText);
      }

      const initialAiMsg: CourseChatTutorMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'assistant',
        text: streamedText || `Welcome to ${topic.topic_name}! Let's master this topic step by step. Ready to start?`,
        timestamp: Date.now(),
      };

      const updated = [initialAiMsg];
      setMessages(updated);
      writeCachedJson(cacheKey, updated, userProfile?.uid);
    } catch (err) {
      console.warn('[CourseChatTutor] Starter error:', err);
    } finally {
      setIsSending(false);
      setStreamingBotText(null);
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Clear conversation history for this topic?')) {
      setMessages([]);
      clearCachedKey(cacheKey);
      addToast('Conversation cleared.', 'info');
      void initFirstBiteSizedStep();
    }
  };

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || inputValue).trim();
    if ((!textToSend && attachments.length === 0) || isSending) return;

    const cost = getFeatureCost('chat_interaction', appSettings) || 1;
    setLimitCost(cost);
    const creditCheck = checkAICredits(userProfile, cost, appSettings);
    if (!creditCheck.allowed) {
      setShowLimitModal(true);
      return;
    }

    const processedAttachments = await Promise.all(
      attachments.map(async (file, idx) => {
        const isImage = file.type.startsWith('image/');
        const url = URL.createObjectURL(file);
        return {
          id: `att_${Date.now()}_${idx}`,
          name: file.name,
          url,
          isImage,
        };
      })
    );

    const userMsg: CourseChatTutorMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: Date.now(),
      attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputValue('');
    setAttachments([]);
    setShowAttachmentMenu(false);
    setIsSending(true);

    if (inputElementRef.current) {
      inputElementRef.current.style.height = 'auto';
    }

    try {
      const ai = createAvelutAI(appSettings, userProfile);
      if (!ai) throw new Error('AI service unavailable');

      const systemPrompt = `You are AVELUT Socratic Course Tutor for "${course.course_name}" (${course.course_code || ''}).
CURRENT TOPIC: "${topic.topic_name}"
TOPIC CONTEXT & OVERVIEW: "${topic.topic_context || topic.start_point || ''}"

TEACHING METHODOLOGY (BIT-BY-BIT MASTERCLASS):
1. Teach concept-by-concept in bite-sized, crystal-clear steps (1-2 short paragraphs max).
2. If student answers a question correctly, praise them and smoothly introduce the next concept/formula.
3. If student is confused, explain from a simpler angle with a quick concrete example.
4. Format all math and equations with KaTeX LaTeX ($...$ inline or $$...$$ block).
5. Highlight important keywords naturally.
6. End each response with a 1-sentence check-for-understanding question or prompt.

STRICT TOKEN LIMIT: Keep your response ultra-concise (< 160 words, < 350 tokens). Never dump huge walls of text.

CONVERSATION HISTORY:
${nextMessages.slice(-6).map((m) => `${m.sender === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n')}

STUDENT MESSAGE:
${textToSend || '[Student sent an attachment]'}`;

      setStreamingBotText('');
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: systemPrompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 400,
        },
      });

      let streamedText = '';
      for await (const chunk of responseStream) {
        const chunkText = getResponseText(chunk);
        streamedText += chunkText;
        setStreamingBotText(streamedText);
      }

      const assistantMsg: CourseChatTutorMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'assistant',
        text: streamedText || 'Let us continue our lesson. What would you like to explore next?',
        timestamp: Date.now(),
      };

      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      writeCachedJson(cacheKey, finalMessages, userProfile?.uid);
      void deductAICredits(userProfile?.uid, cost, 'Course Tutor Chat');
    } catch (err) {
      console.error('[CourseChatTutor] error:', err);
      addToast('Failed to get tutor reply. Check your connection.', 'error');
    } finally {
      setIsSending(false);
      setStreamingBotText(null);
    }
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setAttachments((prev) => [...prev, ...newFiles].slice(0, 4));
      setShowAttachmentMenu(false);
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  // Helper to render live streaming text with glowing dark blue active sentence
  const renderStreamingContent = (text: string) => {
    const lastPunctuationIdx = Math.max(
      text.lastIndexOf('\n'),
      text.lastIndexOf('. '),
      text.lastIndexOf('? '),
      text.lastIndexOf('! ')
    );

    const hasCompletedPart = lastPunctuationIdx !== -1 && lastPunctuationIdx < text.length - 1;
    const completedPart = hasCompletedPart ? text.slice(0, lastPunctuationIdx + (text[lastPunctuationIdx] === '\n' ? 1 : 2)) : '';
    const activePart = hasCompletedPart ? text.slice(lastPunctuationIdx + (text[lastPunctuationIdx] === '\n' ? 1 : 2)) : text;

    return (
      <div className="space-y-1">
        {hasCompletedPart && (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents(false)}
          >
            {formatLatexMath(completedPart)}
          </ReactMarkdown>
        )}
        {activePart && (
          <div className="inline-block text-[#002D62] dark:text-[#60A5FA] font-semibold tracking-normal drop-shadow-[0_0_10px_rgba(0,102,255,0.4)] animate-fade-in transition-all duration-300">
            <span>{activePart}</span>
            <span className="inline-block w-2 h-4 sm:w-2.5 sm:h-5 ml-1 bg-[#0066FF] rounded-xs animate-pulse align-middle shadow-[0_0_8px_#0066FF]" />
          </div>
        )}
      </div>
    );
  };

  const markdownComponents = (isUser: boolean) => ({
    p: ({ node, ...props }: any) => <p className="mb-3 last:mb-0 leading-relaxed" {...props} />,
    strong: ({ node, ...props }: any) => (
      <strong className={isUser ? 'font-bold text-blue-200' : 'font-bold text-[#002D62] dark:text-[#60A5FA]'} {...props} />
    ),
    code: ({ node, inline, ...props }: any) =>
      inline ? (
        <code className={`px-1.5 py-0.5 rounded-md font-mono text-xs ${isUser ? 'bg-white/20 text-white' : 'bg-blue-50 dark:bg-blue-950/50 text-[#0066FF] dark:text-blue-300 border border-blue-100 dark:border-blue-900/50'}`} {...props} />
      ) : (
        <code className="block overflow-x-auto rounded-2xl bg-[#0F172A] dark:bg-[#050711] text-slate-100 p-4 text-xs font-mono my-2.5 border border-slate-700/60" {...props} />
      ),
    blockquote: ({ node, ...props }: any) => (
      <blockquote className={`border-l-4 p-3 rounded-r-xl my-2 text-xs leading-relaxed ${isUser ? 'border-blue-300 bg-white/10 text-white' : 'border-[#0066FF] bg-blue-50/70 dark:bg-blue-950/40 text-slate-800 dark:text-slate-200'}`} {...props} />
    ),
    ul: ({ node, ...props }: any) => <ul className="mb-3 last:mb-0 list-disc pl-5 space-y-1.5 marker:text-[#0066FF]" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="mb-3 last:mb-0 list-decimal pl-5 space-y-1.5 marker:text-[#0066FF] font-medium" {...props} />,
    li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
    a: ({ node, ...props }: any) => <a className={`${isUser ? 'text-blue-200 underline' : 'text-[#0066FF] underline hover:text-[#002D62]'}`} target="_blank" rel="noopener noreferrer" {...props} />,
    table: ({ node, ...props }: any) => <div className="overflow-x-auto my-3"><table className="w-full border-collapse text-xs border border-[#E3E9F1] dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs" {...props} /></div>,
    th: ({ node, ...props }: any) => <th className="bg-[#F1F5F9] dark:bg-slate-800 text-[#002D62] dark:text-[#60A5FA] font-bold p-2.5 text-left border border-[#E3E9F1] dark:border-slate-700" {...props} />,
    td: ({ node, ...props }: any) => <td className="p-2.5 border border-[#E3E9F1] dark:border-slate-800 bg-white dark:bg-slate-900 text-[#0F172A] dark:text-slate-200" {...props} />,
  });

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#F6F6F3] dark:bg-[#0B0F17] overflow-hidden">
      {/* Hidden File Inputs */}
      <input type="file" ref={fileInputRef} onChange={handleFileSelection} multiple className="hidden" />
      <input type="file" ref={cameraInputRef} onChange={handleFileSelection} accept="image/*" capture="environment" className="hidden" />
      <input type="file" ref={photoInputRef} onChange={handleFileSelection} accept="image/*" multiple className="hidden" />

      {/* ── Fixed Header ── */}
      <header className="shrink-0 px-3 sm:px-6 pt-3 sm:pt-4 pb-2 bg-[#F6F6F3]/90 dark:bg-[#0B0F17]/90 backdrop-blur-md z-20">
        <div className="bg-white dark:bg-[#151B26] border border-[#E3E9F1] dark:border-slate-800 rounded-2xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs max-w-4xl mx-auto w-full">
          
          {/* Left: Back Button & Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#F6F6F3] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#E3E9F1] dark:border-slate-700 flex items-center justify-center text-[#0F172A] dark:text-white transition-all cursor-pointer shrink-0"
              aria-label="Back to courses"
            >
              <i className="bi bi-arrow-left text-sm font-bold"></i>
            </button>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-[#64748B] dark:text-slate-400 uppercase tracking-wider block truncate">
                {course.course_code || course.course_name}
              </span>
              <h2 className="text-sm sm:text-base font-black text-[#0F172A] dark:text-white truncate">
                {topic.topic_name}
              </h2>
            </div>
          </div>

          {/* Right: Realtime Voice Tutorial Button + Clear */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenVoiceTutorial}
              className="px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[#0066FF] hover:bg-[#0052cc] active:scale-95 text-white text-xs font-bold transition-all shadow-[0_2px_10px_rgba(0,102,255,0.3)] cursor-pointer flex items-center gap-2 shrink-0"
              title="Launch Realtime Voice & Whiteboard Tutorial"
            >
              <i className="bi bi-broadcast text-xs animate-pulse"></i>
              <span className="hidden xs:inline">Realtime Tutorial</span>
              <span className="xs:hidden">Voice</span>
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="w-8 h-8 rounded-full bg-[#F6F6F3] dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-[#E3E9F1] dark:border-slate-700 hover:border-rose-200 flex items-center justify-center text-[#64748B] hover:text-rose-600 transition-all cursor-pointer"
                title="Clear Conversation"
              >
                <i className="bi bi-trash text-xs"></i>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Scrollable Messages Area (WhatsApp-Style Bottom-Up Layout) ── */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col justify-end py-3 sm:py-4 space-y-4">
          {messages.map((message) => {
            const isUser = message.sender === 'user';
            const isLongUserMsg = isUser && (message.text.length > 220 || (message.text.match(/\n/g) || []).length >= 4);
            const isExpanded = expandedUserMessageIds.has(message.id);

            return (
              <div
                key={message.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full animate-fade-in`}
              >
                <div
                  className={`p-4 sm:p-5 rounded-2xl leading-relaxed text-sm ${
                    isUser
                      ? 'min-w-[33%] max-w-[85%] sm:max-w-[76%] rounded-3xl bg-[#002D62] text-white shadow-xs rounded-tr-none'
                      : 'w-full text-slate-800 dark:text-slate-100 bg-transparent text-[15px] sm:text-base'
                  }`}
                >
                  {/* User Attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mb-3">
                      {message.attachments.length === 1 && message.attachments[0].isImage ? (
                        <a
                          href={message.attachments[0].url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block overflow-hidden rounded-3xl border border-transparent bg-transparent transition-transform hover:scale-[1.01]"
                        >
                          <img
                            src={message.attachments[0].url}
                            alt={message.attachments[0].name}
                            className="max-h-64 sm:max-h-80 w-auto rounded-3xl object-cover border border-transparent shadow-xs"
                          />
                        </a>
                      ) : (
                        <div className={`grid gap-2 ${message.attachments.some(item => item.isImage) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                          {message.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="overflow-hidden rounded-2xl border border-transparent bg-transparent text-slate-900 dark:text-white"
                            >
                              {att.isImage ? (
                                <img src={att.url} alt={att.name} className="max-h-56 w-full object-cover rounded-2xl border border-transparent" />
                              ) : (
                                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/10 dark:bg-black/20 border border-white/10">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-[10px] font-black uppercase text-white">
                                    DOC
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">{att.name}</p>
                                    <p className="text-[10px] uppercase tracking-[0.2em] opacity-70 text-blue-200">Open attachment</p>
                                  </div>
                                </div>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isUser ? (
                    <div>
                      <div className={`relative ${isLongUserMsg && !isExpanded ? 'max-h-[125px] overflow-hidden' : ''}`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                        {isLongUserMsg && !isExpanded && (
                          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#002D62] via-[#002D62]/85 to-transparent pointer-events-none" />
                        )}
                      </div>

                      {isLongUserMsg && (
                        <div className="mt-2 flex justify-center">
                          <button
                            type="button"
                            onClick={() => toggleUserMessageExpand(message.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-full text-xs font-bold transition shadow-[0_3px_10px_rgba(0,0,0,0.3)] active:scale-95 cursor-pointer border border-white/25 backdrop-blur-xs"
                          >
                            <span>{isExpanded ? 'Show less' : 'Read full message'}</span>
                            <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'} text-xs drop-shadow-md`}></i>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={markdownComponents(false)}
                    >
                      {formatLatexMath(message.text)}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            );
          })}

          {/* Live Streaming Bot Message */}
          {streamingBotText !== null && (
            <div className="w-full my-3 px-1 sm:px-2 flex flex-col items-start animate-fade-in">
              <div className="w-full text-slate-800 dark:text-slate-100 bg-transparent text-[15px] sm:text-base leading-relaxed tracking-normal">
                {renderStreamingContent(streamingBotText)}
              </div>
            </div>
          )}

          {isSending && streamingBotText === null && (
            <div className="flex items-center gap-2 p-3 bg-white dark:bg-[#151B26] rounded-2xl border border-[#E3E9F1] dark:border-slate-800 w-fit">
              <div className="w-2 h-2 rounded-full bg-[#0066FF] animate-ping" />
              <span className="text-xs text-[#64748B] dark:text-slate-400 font-medium">Tutor is formulating response...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Fullscreen Bottom Input Bar (Bottom Nav is Hidden) ── */}
      <footer className="shrink-0 px-3 sm:px-6 pt-2 pb-[max(14px,env(safe-area-inset-bottom))] bg-[#F6F6F3]/90 dark:bg-[#0B0F17]/90 backdrop-blur-md z-20">
        <div className="max-w-4xl mx-auto w-full space-y-2">
          
          {/* Multi-Image Attachment Preview Chips */}
          {attachments.length > 0 && (
            <div className="w-full flex items-center gap-2 overflow-x-auto py-1 px-1 no-scrollbar animate-fade-in">
              {attachments.map((file, idx) => {
                const isImg = file.type.startsWith('image/');
                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-[#151B26] border border-transparent shadow-xs px-3 py-1 text-xs text-slate-800 dark:text-slate-200 shrink-0"
                  >
                    {isImg ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-5 h-5 rounded-full object-cover shrink-0 border border-transparent"
                      />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center text-[10px] font-bold shrink-0">
                        DOC
                      </span>
                    )}
                    <span className="max-w-[120px] truncate font-medium text-[11px]">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="text-slate-400 hover:text-rose-500 transition-colors p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                      title="Remove attachment"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fluid Spring Morphing Pill Container (From Avelut AI) */}
          <div className="relative w-full bg-white dark:bg-[#151B26] rounded-full flex items-center justify-between pl-3 pr-2 py-1.5 min-h-[54px] sm:min-h-[56px] border border-[#E3E9F1] dark:border-slate-800 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
            
            {/* Left: Plus Menu Button */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                disabled={isSending}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 cursor-pointer ${showAttachmentMenu ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                title="Add photo or document"
              >
                <PlusIcon />
              </button>

              {/* Plus Popup Menu */}
              {showAttachmentMenu && (
                <div className="absolute bottom-14 left-0 w-56 bg-white/95 dark:bg-[#151B26]/95 backdrop-blur-xl border border-[#E3E9F1] dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50 p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      cameraInputRef.current?.click();
                      setShowAttachmentMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-3 cursor-pointer"
                  >
                    <CameraOutlineIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                    <span>Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      photoInputRef.current?.click();
                      setShowAttachmentMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-3 cursor-pointer"
                  >
                    <PhotoOutlineIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                    <span>Photos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowAttachmentMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-3 cursor-pointer"
                  >
                    <FolderOutlineIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                    <span>Files</span>
                  </button>
                </div>
              )}
            </div>

            {/* Center: Auto-Expanding Textarea */}
            <div className="flex-1 mx-2 relative flex items-center min-h-[40px]">
              <textarea
                ref={inputElementRef}
                rows={1}
                value={inputValue}
                onChange={handleTextChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={`Ask about ${topic.topic_name}...`}
                className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[15px] sm:text-[16px] font-normal leading-relaxed focus:outline-none resize-none py-2 px-1 max-h-[140px] overflow-y-auto"
                style={{ height: 'auto' }}
              />
            </div>

            {/* Right: Send Button */}
            <button
              onClick={() => void handleSend()}
              disabled={(!inputValue.trim() && attachments.length === 0) || isSending}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0066FF] hover:bg-[#0052cc] disabled:opacity-30 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
              title="Send message"
            >
              <i className="bi bi-arrow-up text-sm sm:text-base font-bold"></i>
            </button>
          </div>
        </div>
      </footer>

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

export default CourseChatTutor;
