import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { db } from '../firebase';
import { ref as dbRef, onValue, off, set, push, get, remove, serverTimestamp, update } from 'firebase/database';
import type { UserProfile, Message, ChatConversation } from '../types';
import { useToast } from '../hooks/useToast';
import { checkAICredits, deductAICredits, getFeatureCost, getFeatureModel } from '../utils/usage';
import { LimitExceededModal } from './LimitExceededModal';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { useAppSettings } from '../hooks/useAppSettings';
import {
  getLocalConversations,
  getLocalMessages,
  saveLocalMessage,
  saveLocalConversation,
  renameLocalConversation,
  deleteLocalConversation,
  generateLocalId,
} from '../services/chatStorageService';
import { getCachedAIResponse, setCachedAIResponse } from '../services/aiCacheService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Avatar } from './Avatar';
import { ConfirmationModal } from './ConfirmationModal';

export type ChatMode = 'context' | 'fast' | 'deep' | 'exam';

export interface ChatModeOption {
  id: ChatMode;
  label: string;
  description: string;
}

const CHAT_MODES: ChatModeOption[] = [
  { id: 'context', label: 'Context Aware', description: 'Uses courses & progress context' },
  { id: 'fast', label: 'Fast', description: 'Short & concise answers' },
  { id: 'deep', label: 'Deep', description: 'Step-by-step detailed explanations' },
  { id: 'exam', label: 'Exam Mode', description: 'Practice exam question style' },
];

const timeAgo = (timestamp: number): string => {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// --- GROK-STYLE INPUT COMPOSER ---
const GrokChatComposer: React.FC<{
  input: string;
  setInput: (val: string) => void;
  isLoading: boolean;
  selectedMode: ChatMode;
  onSelectMode: (mode: ChatMode) => void;
  voiceStatus: 'idle' | 'listening' | 'processing';
  onToggleVoice: () => void;
  onAttach: () => void;
  onSend: () => void;
}> = ({
  input,
  setInput,
  isLoading,
  selectedMode,
  onSelectMode,
  voiceStatus,
  onToggleVoice,
  onAttach,
  onSend,
}) => {
  const [isModeDropupOpen, setIsModeDropupOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeModeObj = CHAT_MODES.find((m) => m.id === selectedMode) || CHAT_MODES[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsModeDropupOpen(false);
      }
    };
    if (isModeDropupOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModeDropupOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-3 sm:pb-5 pt-2 relative">
      <div className="relative flex items-center gap-2 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-neutral-200 dark:border-white/10 shadow-lg px-3 py-2 transition-all focus-within:ring-2 focus-within:ring-black/10 dark:focus-within:ring-white/20">
        {/* Dropup menu for modes */}
        {isModeDropupOpen && (
          <div
            ref={menuRef}
            className="absolute bottom-full mb-3 right-16 sm:right-20 z-50 bg-white dark:bg-[#2C2C2E] rounded-2xl shadow-2xl border border-neutral-200 dark:border-white/10 p-1.5 w-60 animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <div className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase px-3 py-1.5">
              Response Mode
            </div>
            {CHAT_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  onSelectMode(mode.id);
                  setIsModeDropupOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl transition-colors flex flex-col gap-0.5 ${
                  selectedMode === mode.id
                    ? 'bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white font-medium'
                    : 'hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between text-[13px] font-medium">
                  <span>{mode.label}</span>
                  {selectedMode === mode.id && (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal leading-tight">
                  {mode.description}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 1. Attach button */}
        <button
          type="button"
          onClick={onAttach}
          className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors shrink-0"
          title="Attach file"
          aria-label="Attach file"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>

        {/* 2. Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything"
          rows={1}
          className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 text-[15px] resize-none max-h-32 py-1.5 px-1 leading-normal"
        />

        {/* 3. Mode Pill */}
        <button
          type="button"
          onClick={() => setIsModeDropupOpen(!isModeDropupOpen)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-800 dark:text-neutral-200 text-xs font-medium transition-colors shrink-0"
        >
          {/* Lightning icon */}
          <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 2L3 14h7v8l10-12h-7V2z" />
          </svg>
          <span className="hidden sm:inline">{activeModeObj.label}</span>
          <span className="sm:hidden">{activeModeObj.label.split(' ')[0]}</span>
          {/* Chevron up/down */}
          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isModeDropupOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* 4. Mic button */}
        <button
          type="button"
          onClick={onToggleVoice}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            voiceStatus !== 'idle'
              ? 'text-red-500 bg-red-100 dark:bg-red-500/20 animate-pulse'
              : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10'
          }`}
          title="Voice input"
          aria-label="Voice input"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* 5. Black Circular Send button with UP arrow */}
        <button
          type="button"
          onClick={onSend}
          disabled={!input.trim() || isLoading}
          className="w-9 h-9 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shrink-0 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all shadow-md"
          aria-label="Send message"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

// --- CHAT INTERFACE ---
interface ChatProps {
  userProfile: UserProfile;
  onNavigate?: (tab: string) => void;
  onOpenMenu?: () => void;
}

export const Chat: React.FC<ChatProps> = ({ userProfile, onNavigate, onOpenMenu }) => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ChatMode>('context');
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [courseContext, setCourseContext] = useState<string>('');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [isDeleting, setIsDeleting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();
  const { attemptApiCall } = useApiLimiter();
  const { settings: appSettings } = useAppSettings();

  const geminiModel = getFeatureModel('chat_interaction', appSettings);
  const ai = useMemo(() => createAvelutAI(appSettings, userProfile), [appSettings, userProfile]);

  // Load user conversations
  useEffect(() => {
    let isMounted = true;
    getLocalConversations(userProfile.uid).then((localConvos) => {
      if (isMounted && localConvos.length > 0) {
        setConversations(
          localConvos.map((c) => ({
            id: c.id,
            title: c.title || 'New Chat',
            created_at: c.created_at || 0,
            last_updated_at: c.last_updated_at || c.created_at || 0,
          }))
        );
      }
    }).catch(() => {});

    const conversationsRef = dbRef(db, `chat_conversations/${userProfile.uid}`);
    const unsubscribe = onValue(conversationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data: any[] = [];
        snapshot.forEach((child) => {
          data.push({ id: child.key, ...child.val() });
        });
        const sorted = data.sort((a, b) => b.last_updated_at - a.last_updated_at);
        if (isMounted) setConversations(sorted as ChatConversation[]);
      } else {
        if (isMounted) setConversations([]);
      }
    });

    return () => {
      isMounted = false;
      off(conversationsRef);
    };
  }, [userProfile.uid]);

  // Fetch student course context for grounding
  useEffect(() => {
    const fetchCourseContext = async () => {
      try {
        const progressRef = dbRef(db, `user_progress/${userProfile.uid}`);
        const progressSnap = await get(progressRef);
        let contextText = `STUDENT LEVEL: ${userProfile.level}\nDEPARTMENT: ${userProfile.department_id}\n\n`;

        if (progressSnap.exists()) {
          contextText += 'STUDENT PROGRESS DATA:\n';
          const progressData = progressSnap.val();
          Object.keys(progressData).forEach((courseId) => {
            const courses = progressData[courseId];
            contextText += `- ${courseId}: ${Object.keys(courses).filter((k) => courses[k].status === 'completed').join(', ')}\n`;
          });
        }

        setCourseContext(contextText);
      } catch (err) {
        console.error('Error fetching course context:', err);
      }
    };
    fetchCourseContext();
  }, [userProfile.uid, userProfile.department_id, userProfile.level]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    getLocalMessages(activeConversationId).then((localMsgs) => {
      if (isMounted && localMsgs.length > 0) {
        setMessages(
          localMsgs.map((m) => ({
            id: m.id,
            text: m.text,
            sender: m.sender === 'user' ? 'user' : 'bot',
            timestamp: m.timestamp,
          }))
        );
      }
    }).catch(() => {});

    const messagesRef = dbRef(db, `chat_messages/${activeConversationId}`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data: any[] = [];
        snapshot.forEach((child) => {
          data.push({ id: child.key, ...child.val() });
        });
        const sorted = data.sort((a, b) => a.timestamp - b.timestamp);
        if (isMounted) setMessages(sorted as Message[]);
      } else {
        if (isMounted) setMessages([]);
      }
    });

    return () => {
      isMounted = false;
      off(messagesRef);
    };
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    const cost = getFeatureCost('chat_interaction', appSettings);
    const creditCheck = checkAICredits(userProfile, cost, appSettings);
    if (!creditCheck.allowed) {
      setShowLimitModal(true);
      return;
    }

    const currentInput = textToSend;
    setInput('');
    setIsLoading(true);

    try {
      let currentConvoId = activeConversationId;
      const now = Date.now();

      if (!currentConvoId) {
        currentConvoId = generateLocalId('conv');
        const titleSnippet = currentInput.slice(0, 30);
        void saveLocalConversation({
          id: currentConvoId,
          user_id: userProfile.uid,
          title: titleSnippet,
          created_at: now,
          last_updated_at: now,
        });

        const conversationsRef = dbRef(db, `chat_conversations/${userProfile.uid}/${currentConvoId}`);
        await set(conversationsRef, {
          title: titleSnippet,
          created_at: now,
          last_updated_at: now,
        });
        setActiveConversationId(currentConvoId);
      }

      const userMsgId = generateLocalId('msg');
      void saveLocalMessage({
        id: userMsgId,
        conversation_id: currentConvoId,
        user_id: userProfile.uid,
        sender: 'user',
        text: currentInput,
        timestamp: now,
      });

      setMessages((prev) => [...prev, { id: userMsgId, text: currentInput, sender: 'user', timestamp: now }]);

      const messagesRef = dbRef(db, `chat_messages/${currentConvoId}`);
      push(messagesRef, {
        text: currentInput,
        sender: 'user',
        timestamp: serverTimestamp(),
      }).catch(console.error);

      update(dbRef(db, `chat_conversations/${userProfile.uid}/${currentConvoId}`), { last_updated_at: Date.now() });

      // Build prompt based on mode
      let systemModifier = '';
      if (selectedMode === 'fast') {
        systemModifier = 'Provide a brief, direct, and concise response.';
      } else if (selectedMode === 'deep') {
        systemModifier = 'Provide a detailed, step-by-step thorough explanation with examples.';
      } else if (selectedMode === 'exam') {
        systemModifier = 'Format response as practice exam questions with explanation and key takeaways.';
      } else {
        systemModifier = 'Use the student context provided to deliver an accurate answer.';
      }

      const promptPayload = `${systemModifier}\n\n${courseContext}\n\nUser Question: ${currentInput}`;

      const cachedReply = await getCachedAIResponse(promptPayload, geminiModel, courseContext);
      let responseText = cachedReply || '';

      if (!responseText) {
        if (!ai) {
          addToast('Avelut AI is not configured in settings.', 'error');
          return;
        }

        const aiResult = await attemptApiCall(async () => {
          const result = await ai.models.generateContent({
            model: geminiModel,
            contents: [{ role: 'user', parts: [{ text: promptPayload }] }],
          });
          const resText = getResponseText(result);
          if (!resText) throw new Error('Avelut AI returned an empty response.');
          return resText;
        });

        if (!aiResult.success) {
          addToast(aiResult.message, 'error');
          return;
        }

        responseText = (aiResult.data || '').trim();
        void setCachedAIResponse(promptPayload, geminiModel, courseContext, responseText);
      }

      const aiMsgId = generateLocalId('msg');
      void saveLocalMessage({
        id: aiMsgId,
        conversation_id: currentConvoId,
        user_id: userProfile.uid,
        sender: 'assistant',
        text: responseText,
        timestamp: Date.now(),
      });

      setMessages((prev) => [...prev, { id: aiMsgId, text: responseText, sender: 'bot', timestamp: Date.now() }]);

      push(messagesRef, {
        text: responseText,
        sender: 'ai',
        timestamp: serverTimestamp(),
      }).catch(console.error);

      void deductAICredits(userProfile.uid, cost, 'AI Chat Assistant', appSettings);
    } catch (err) {
      console.error('Error in chat:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoice = () => {
    if (voiceStatus === 'idle') {
      setVoiceStatus('listening');
      setTimeout(() => setVoiceStatus('idle'), 4000);
    } else {
      setVoiceStatus('idle');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-white dark:bg-[#121212] overflow-hidden text-neutral-900 dark:text-white">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-md border-b border-neutral-100 dark:border-white/5 sticky top-0 z-20 shrink-0">
        {/* Left: Hamburger (mobile) */}
        <button
          type="button"
          onClick={() => onOpenMenu?.()}
          className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 md:hidden"
          aria-label="Open sidebar menu"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 9h16M4 15h16" />
          </svg>
        </button>

        {/* Center tabs: Ask | Tutor | Study */}
        <div className="flex items-center gap-6 text-[15px] font-semibold">
          <button
            type="button"
            className="text-neutral-900 dark:text-white relative py-1 focus:outline-none"
          >
            Ask
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900 dark:bg-white rounded-full" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('voice_tutorial')}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 py-1 transition-colors"
          >
            Tutor
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('study_guide')}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 py-1 transition-colors"
          >
            Study
          </button>
        </div>

        {/* Right: New Chat Icon (square + pencil/edit style) */}
        <button
          type="button"
          onClick={handleNewChat}
          className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
          title="New chat"
          aria-label="New chat"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </button>
      </div>

      {/* MESSAGES / EMPTY STATE AREA */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 max-w-lg mx-auto min-h-[50vh]">
            <div className="w-16 h-16 rounded-3xl bg-neutral-100 dark:bg-white/10 flex items-center justify-center mb-5 shadow-sm">
              <img src="/logo_icon.png" alt="Avelut" className="w-10 h-10 object-contain" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-2">
              What do you want to learn today?
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-sm">
              Ask anything, get course-grounded solutions, step-by-step tutorials, or exam practice.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                'Explain Quantum Mechanics simply',
                'Help me prepare for GST101',
                'Summarize my department syllabus',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSendMessage(suggestion)}
                  className="text-xs px-3.5 py-2 rounded-full border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] sm:max-w-[75%] flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Avatar
                    display_name={msg.sender === 'user' ? userProfile.display_name : 'Avelut'}
                    photo_url={msg.sender === 'user' ? userProfile.photo_url : null}
                    className="w-8 h-8 shrink-0 mt-0.5"
                  />
                  <div className={`min-w-0 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                        {msg.sender === 'user' ? 'You' : 'Avelut AI'}
                      </span>
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
                        {timeAgo(msg.timestamp)}
                      </span>
                    </div>
                    <div
                      className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                        msg.sender === 'user'
                          ? 'bg-neutral-900 text-white dark:bg-white dark:text-black rounded-tr-none'
                          : 'bg-neutral-100 dark:bg-[#1E1E20] text-neutral-900 dark:text-white border border-neutral-200/50 dark:border-white/5 rounded-tl-none'
                      }`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start max-w-3xl mx-auto">
                <div className="flex gap-3 items-center">
                  <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center p-1.5 shrink-0">
                    <img src="/logo_icon.png" alt="Avelut" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-neutral-100 dark:bg-[#1E1E20]">
                    <div className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce [animation-delay:-0.2s]" />
                    <div className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce [animation-delay:-0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        )}
      </div>

      {/* INPUT BAR (Grok-style) */}
      <GrokChatComposer
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        selectedMode={selectedMode}
        onSelectMode={setSelectedMode}
        voiceStatus={voiceStatus}
        onToggleVoice={toggleVoice}
        onAttach={() => {}}
        onSend={() => handleSendMessage()}
      />

      <LimitExceededModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        userProfile={userProfile}
        appSettings={appSettings}
        cost={getFeatureCost('chat_interaction', appSettings)}
        balance={userProfile?.ai_credits_balance ?? 0}
        addToast={addToast}
      />

      <ConfirmationModal
        {...modalState}
        onCancel={() => setModalState((s) => ({ ...s, isOpen: false }))}
        isConfirming={isDeleting}
      />
    </div>
  );
};
