import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { awardDailyStreak } from '../utils/streaks';
import { readCachedJson, writeCachedJson, clearCachedKey } from '../utils/cache';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { get, onValue, push, ref as dbRef, serverTimestamp, set, update, remove } from 'firebase/database';
import { getDownloadURL, ref as storageRef, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { formatLatexMath } from '../utils/latexFormatter';
// @ts-ignore: Allow importing third-party CSS without type declarations
import 'katex/dist/katex.min.css';
import { db, storage } from '../firebase';
import type { Course, UserProfile } from '../types';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import { Avatar } from './Avatar';
import { LimitExceededModal } from './LimitExceededModal';
import { checkAICredits, deductAICredits, getFeatureCost, getFeatureModel, isPaidSubscriber } from '../utils/usage';
import {
  getLocalConversations,
  getLocalMessages,
  saveLocalMessage,
  saveLocalConversation,
  deleteLocalConversation,
  renameLocalConversation,
} from '../services/chatStorageService';
import { getCachedAIResponse, setCachedAIResponse } from '../services/aiCacheService';
import { uploadToR2, deleteFromR2, isR2Configured } from '../services/cloudflareR2Service';
import { GeminiLiveVoiceClient } from '../services/voice/GeminiLiveVoiceClient';
import { ChatIcon } from './icons/ChatIcon';
import { XIcon } from './icons/XIcon';
import { TrashIcon } from './icons/TrashIcon';
import { CopyIcon } from './icons/CopyIcon';
import { TypingIndicator } from './TypingIndicator';

type AssistantSender = 'user' | 'assistant';

interface AssistantAttachment {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  isImage: boolean;
}

interface AssistantMessage {
  id: string;
  sender: AssistantSender;
  text: string;
  timestamp?: number;
  attachments?: AssistantAttachment[];
  image_url?: string;
}

interface HistoryItem {
  id: string;
  title: string;
  lastUpdatedAt: number;
}

interface AvelutAIProps {
  userProfile: UserProfile;
  onNavigate?: (tab: string) => void;
  setCustomHeaderConfig?: (config: any) => void;
  unreadMessagesCount?: number;
}

const createMessageId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

const dataUrlToFile = (dataUrl: string, filename = 'scanned_problem.jpg'): File => {
  if (!dataUrl.includes(',')) {
    const byteString = atob(dataUrl);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new File([ab], filename, { type: 'image/jpeg' });
  }
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const byteString = atob(arr[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new File([ab], filename, { type: mime });
};

const createUniqueId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const truncateTitle = (text: string) => {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Chat';
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trim()}...` : cleaned;
};

const normalizeTitle = (text: string) => {
  const cleaned = text
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateTitle(cleaned || 'New Chat');
};

const parseMessageSuggestions = (text: string): { cleanText: string; suggestions: string[] } => {
  if (!text) return { cleanText: '', suggestions: [] };

  const regex = /\[Suggestions?:\s*(.*?)\]/i;
  const match = text.match(regex);
  if (match) {
    const rawOptions = match[1] || '';
    const suggestions = rawOptions
      .split(/\||,/)
      .map(option => option.trim())
      .filter(Boolean);
    return {
      cleanText: text.replace(regex, '').trim(),
      suggestions: suggestions.length > 0 ? suggestions : ['Continue', 'Next step', 'Explain with example', "I don't understand"],
    };
  }

  return { 
    cleanText: text, 
    suggestions: ['Continue', 'Next step', 'Explain with example', "I don't understand"] 
  };
};

const parseVisualHint = (text: string): { cleanText: string; visualHintText: string | null } => {
  if (!text) return { cleanText: '', visualHintText: null };

  const regex = /\[VisualHint:\s*(.*?)\]/i;
  const match = text.match(regex);
  if (match) {
    return {
      cleanText: text.replace(regex, '').trim(),
      visualHintText: match[1]?.trim() || null,
    };
  }

  return { cleanText: text, visualHintText: null };
};

const shouldHighlightForVisual = (text: string) => {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return /(diagram|graph|illustration|process|cycle|structure|formula|equation|timeline|map|flow|drawing|visual|example)/i.test(normalized);
};

const deduplicateAssistantMessages = (rawList: AssistantMessage[]): AssistantMessage[] => {
  const seenIds = new Set<string>();
  const cleaned: AssistantMessage[] = [];

  for (const msg of rawList) {
    if (!msg || (!msg.text && (!msg.attachments || msg.attachments.length === 0))) continue;
    if (seenIds.has(msg.id)) continue;

    // Check if another message with same sender and same text exists
    const isDuplicate = cleaned.some(
      prev =>
        prev.sender === msg.sender &&
        prev.text.trim() === msg.text.trim() &&
        (Math.abs((prev.timestamp || 0) - (msg.timestamp || 0)) < 25000 || !prev.timestamp || !msg.timestamp)
    );

    if (!isDuplicate) {
      seenIds.add(msg.id);
      cleaned.push(msg);
    }
  }

  return cleaned;
};

const InlineMarkdownText = React.memo<{ text: string; className?: string }>(({ text, className = '' }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      p: ({ node, ...props }: any) => <span className={`whitespace-normal ${className}`} {...props} />,
      strong: ({ node, ...props }: any) => <strong className="font-semibold text-[#002D62] dark:text-[#60A5FA]" {...props} />,
      em: ({ node, ...props }: any) => <em className="italic" {...props} />,
      code: ({ node, inline, ...props }: any) =>
        inline ? (
          <code className="rounded bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 text-[0.8em] font-mono text-[#0066FF] dark:text-blue-300 border border-blue-100 dark:border-blue-900/50" {...props} />
        ) : (
          <code className="block overflow-x-auto rounded-2xl bg-[#0F172A] p-3 text-sm text-white border border-slate-700/60" {...props} />
        ),
      a: ({ node, ...props }: any) => <a className="text-[#0066FF] underline decoration-[#0066FF]/60 underline-offset-2 hover:text-[#002D62]" target="_blank" rel="noopener noreferrer" {...props} />,
    }}
  >
    {formatLatexMath(text)}
  </ReactMarkdown>
));

const getHistoryFallbackTitle = (prompt: string, attachment: File | null) => (
  prompt || (attachment ? `Attachment: ${attachment.name}` : 'New Chat')
);

const isImageMimeType = (mimeType?: string, fileName?: string) => (
  Boolean(mimeType?.startsWith('image/')) || Boolean(fileName?.match(/\.(png|jpe?g|gif|webp|bmp|svg)$/i))
);

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

const compressImageToDataUrl = (file: File, maxWidth = 1280, quality = 0.75): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(objectUrl);

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image compression failed'));
  });
};

const prepareLocalChatAttachment = async (
  file: File,
  index: number
): Promise<{ attachment: AssistantAttachment; base64Data: string; mimeType: string }> => {
  const attachmentToken = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now()}_${index}`;
  const isImage = isImageMimeType(file.type, file.name);

  let dataUrl = '';
  if (isImage) {
    dataUrl = await compressImageToDataUrl(file);
  } else {
    dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const mimeType = isImage ? 'image/jpeg' : (file.type || 'application/octet-stream');

  return {
    attachment: {
      id: attachmentToken,
      name: file.name,
      mimeType,
      url: dataUrl, // Local Base64 URI saved directly on the client device
      isImage,
    },
    base64Data,
    mimeType,
  };
};

const getMimeType = (file: File): string => {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'mp3': return 'audio/mp3';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'txt': return 'text/plain';
    case 'html': return 'text/html';
    case 'css': return 'text/css';
    case 'js': return 'text/javascript';
    case 'json': return 'application/json';
    default: return 'application/octet-stream';
  }
};

const isSupportedInlineMimeType = (mimeType: string, fileName: string) => {
  const lowerName = fileName.toLowerCase();
  if (mimeType.startsWith('image/') || lowerName.match(/\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i)) {
    return true;
  }
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return true;
  }
  if (mimeType.startsWith('audio/') || lowerName.match(/\.(mp3|wav|aiff|aac|ogg|flac|m4a)$/i)) {
    return true;
  }
  if (mimeType.startsWith('video/') || lowerName.match(/\.(mp4|mpeg|mov|avi|flv|webm|3gp)$/i)) {
    return true;
  }
  return false;
};

const isTextFile = (mimeType: string, fileName: string) => {
  const lowerName = fileName.toLowerCase();
  const textExtensions = ['.txt', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.html', '.css', '.json', '.xml', '.csv', '.md', '.yaml', '.yml', '.ini', '.conf'];
  return mimeType.startsWith('text/') || textExtensions.some(ext => lowerName.endsWith(ext));
};

const readTextFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

const readCourseText = (courses: Course[], userLevel: string) => {
  if (!courses.length) return '';

  const lines: string[] = ['COURSE ACCESS:'];
  courses.forEach((course, index) => {
    const topicLines = (course.topics || []).slice(0, 20).map(topic => {
      const parts = [topic.topic_name, topic.topic_context, topic.start_point, topic.end_point].filter(Boolean);
      return `  - ${parts.join(' | ')}`;
    });

    lines.push([
      `Course ${index + 1}: ${course.course_code || course.course_id || course.course_name}`,
      `Title: ${course.course_name}`,
      `Level: ${course.level || userLevel}`,
      `Semester: ${course.semester || 'first'}`,
      topicLines.length ? `Topics:\n${topicLines.join('\n')}` : 'Topics: none recorded yet',
    ].join('\n'));
  });

  return lines.join('\n\n');
};

const mapSender = (sender: string | undefined): AssistantSender => {
  if (sender === 'user') return 'user';
  if (sender === 'assistant' || sender === 'ai' || sender === 'bot') return 'assistant';
  if (sender) console.warn('Unexpected chat sender value:', { sender, context: 'message mapping' });
  return 'assistant';
};

// Custom SVG Icons
const MenuIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const UpArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px]">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const VoiceWaveformIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
    <rect x="4.5" y="8" width="2.2" height="8" rx="1.1" />
    <rect x="9" y="4.5" width="2.2" height="15" rx="1.1" />
    <rect x="13.5" y="6" width="2.2" height="12" rx="1.1" />
    <rect x="18" y="8" width="2.2" height="8" rx="1.1" />
  </svg>
);

const MicMuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const CloseXIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const LibraryDrawerIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M8 6h8" />
    <path d="M8 10h6" />
  </svg>
);

const ProjectsDrawerIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const MessengerDrawerIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const PluginsDrawerIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="m4.93 4.93 4.24 4.24" />
    <path d="m14.83 9.17 4.24-4.24" />
    <path d="m14.83 14.83 4.24 4.24" />
    <path d="m9.17 14.83-4.24 4.24" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);

const SettingsDrawerIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CameraOutlineIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const PhotosOutlineIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
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

const FlagIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

interface AnimatedMoonOrbProps {
  isListening?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  audioLevel?: number;
}

const AnimatedMoonOrb: React.FC<AnimatedMoonOrbProps> = ({
  isListening = true,
  isSpeaking = false,
  isMuted = false,
  audioLevel = 0,
}) => {
  // Dynamically calculate pulse amplification from raw PCM audio RMS level
  const energyMultiplier = isMuted ? 0 : Math.min(1, audioLevel);
  const dynamicScale = isMuted ? 0.94 : 1 + (energyMultiplier * 0.28);
  const ringAuraScale = isMuted ? 1 : 1.12 + (energyMultiplier * 0.5);
  const ringOpacity = isMuted ? 0.08 : Math.min(0.9, 0.28 + (energyMultiplier * 0.55));

  return (
    <div className="relative flex-1 w-full flex items-center justify-center select-none pointer-events-none px-4 py-8">
      {/* Outer Ethereal Sound Wave Rings (Aura) */}
      <motion.div
        animate={
          isMuted
            ? { scale: 1, opacity: 0.1 }
            : {
                scale: isSpeaking ? [1, 1.42 * ringAuraScale, 1.08, 1.5 * ringAuraScale, 1] : [1, 1.18 * ringAuraScale, 1.02, 1.25 * ringAuraScale, 1],
                opacity: [ringOpacity * 0.6, ringOpacity, ringOpacity * 0.7, ringOpacity * 0.95, ringOpacity * 0.6],
              }
        }
        transition={{
          duration: isSpeaking ? 1.5 : 3.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute w-72 h-72 sm:w-96 sm:h-96 md:w-[420px] md:h-[420px] rounded-full bg-gradient-to-tr from-blue-400/30 via-sky-300/25 to-indigo-300/30 blur-3xl"
      />

      <motion.div
        animate={
          isMuted
            ? { scale: 1, opacity: 0.08 }
            : {
                scale: [1.02 * ringAuraScale, 1.26 * ringAuraScale, 1.04, 1.32 * ringAuraScale, 1.02 * ringAuraScale],
                opacity: [ringOpacity * 0.5, ringOpacity * 0.85, ringOpacity * 0.6, ringOpacity * 0.9, ringOpacity * 0.5],
              }
        }
        transition={{
          duration: 2.8,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.2,
        }}
        className="absolute w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-full bg-gradient-to-b from-sky-400/25 via-blue-200/30 to-white/45 blur-2xl"
      />

      {/* Main Celestial Fluid "Moon" Orb Sphere */}
      <motion.div
        animate={
          isMuted
            ? { scale: 0.94 }
            : isSpeaking
            ? {
                scale: [dynamicScale, dynamicScale * 1.1, dynamicScale * 0.97, dynamicScale * 1.14, dynamicScale],
                rotate: [0, 5, -4, 4, 0],
              }
            : {
                scale: [dynamicScale, dynamicScale * 1.05, dynamicScale * 0.99, dynamicScale * 1.07, dynamicScale],
                rotate: [0, 3, -2, 2, 0],
              }
        }
        transition={{
          duration: isSpeaking ? 1.4 : 3.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="relative w-64 h-64 sm:w-76 sm:h-76 md:w-88 md:h-88 rounded-full overflow-hidden shadow-[0_20px_80px_rgba(96,165,250,0.4)] dark:shadow-[0_20px_80px_rgba(96,165,250,0.25)] border border-white/40 dark:border-white/10"
        style={{
          background: 'radial-gradient(circle at 50% 20%, #4A88FF 0%, #68A0FA 25%, #A3C7FC 50%, #EEF5FF 75%, #FFFFFF 100%)',
        }}
      >
        {/* Layer 1: Ethereal Top Blue Sky Gradient Mask */}
        <div 
          className="absolute inset-0 rounded-full opacity-95"
          style={{
            background: 'linear-gradient(180deg, #4A88FF 0%, #68A0FA 22%, #A3C7FC 45%, #EEF5FF 70%, #FFFFFF 100%)',
          }}
        />

        {/* Layer 2: Animated Internal Floating Cloud Vapor Texture */}
        <motion.div
          animate={{
            x: ['-6%', '6%', '-4%', '5%', '-6%'],
            y: ['-5%', '5%', '-3%', '4%', '-5%'],
            scale: [1, 1.08, 1.02, 1.12, 1],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -inset-10 opacity-75 blur-md pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 45% 35%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.65) 40%, rgba(147,197,253,0.3) 70%, transparent 100%)',
          }}
        />

        {/* Layer 3: Rotating Harmonic Light Shimmer */}
        <motion.div
          animate={{
            rotate: [0, 360],
          }}
          transition={{
            duration: 26,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute -inset-8 opacity-40 mix-blend-overlay blur-lg pointer-events-none"
          style={{
            background: 'conic-gradient(from 0deg at 50% 50%, #4A88FF 0deg, #93C5FD 120deg, #FFFFFF 220deg, #60A5FA 360deg)',
          }}
        />

        {/* Layer 4: Soft Milky Bottom Glow */}
        <div 
          className="absolute inset-x-0 bottom-0 h-1/2 opacity-95 blur-xs pointer-events-none"
          style={{
            background: 'linear-gradient(0deg, #FFFFFF 20%, rgba(255,255,255,0.85) 50%, transparent 100%)',
          }}
        />
      </motion.div>
    </div>
  );
};

export default function AvelutAI({ userProfile, onNavigate, setCustomHeaderConfig, unreadMessagesCount = 0 }: AvelutAIProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch && touch.clientX < 80) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (touch) {
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      if (deltaX > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        setIsSidebarOpen(true);
      }
    }
    touchStartRef.current = null;
  };

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [streamingBotText, setStreamingBotText] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(() => {
    return readCachedJson<string | null>(`avelut_ai_active_chat_id_${userProfile.uid}`, null);
  });

  useEffect(() => {
    if (activeHistoryId) {
      writeCachedJson(`avelut_ai_active_chat_id_${userProfile.uid}`, activeHistoryId, userProfile.uid);
    } else {
      clearCachedKey(`avelut_ai_active_chat_id_${userProfile.uid}`);
    }
  }, [activeHistoryId, userProfile.uid]);

  const [expandedUserMessageIds, setExpandedUserMessageIds] = useState<Set<string>>(new Set());

  const toggleUserMessageExpand = (id: string) => {
    setExpandedUserMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [attachments, setAttachments] = useState<File[]>([]);
  const [courseContext, setCourseContext] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [statusText, setStatusText] = useState('Ready to help with math, science, and study plans.');
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitModalData, setLimitModalData] = useState({ balance: 0, cost: 0 });

  const { attemptApiCall } = useApiLimiter();
  const { settings: appSettings } = useAppSettings();
  const { addToast } = useToast();
  const geminiModel = getFeatureModel('chat_interaction', appSettings);

  const ai = useMemo(() => createAvelutAI(appSettings, userProfile), [appSettings, userProfile]);
  
  // Custom Input Bar States: 1 (Default), 2 (Typing)
  const [inputState, setInputState] = useState<number>(1);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState<boolean>(false);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAttachmentMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
        setShowAttachmentMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachmentMenu]);
  const [isContextAware, setIsContextAware] = useState<boolean>(false);
  const [viewingImageIds, setViewingImageIds] = useState<Set<string>>(new Set());
  const [generatingMessageIds, setGeneratingMessageIds] = useState<Set<string>>(new Set());
  const lastTapRef = useRef<Record<string, number>>({});
  const lastToggleRef = useRef<Record<string, number>>({});

  const sectionRef = useRef<HTMLElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputElementRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isLiveVoiceMode, setIsLiveVoiceMode] = useState<boolean>(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [liveAudioLevel, setLiveAudioLevel] = useState<number>(0);
  const [isLiveSpeaking, setIsLiveSpeaking] = useState<boolean>(false);
  const isSendingRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const liveClientRef = useRef<GeminiLiveVoiceClient | null>(null);

  const displayMessages = useMemo(() => deduplicateAssistantMessages(messages), [messages]);

  const activeSuggestions = useMemo(() => {
    if (streamingBotText !== null) {
      const { suggestions } = parseMessageSuggestions(streamingBotText);
      if (suggestions && suggestions.length > 0) return suggestions.slice(0, 3);
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'assistant' && messages[i].text) {
        const { suggestions } = parseMessageSuggestions(messages[i].text);
        if (suggestions && suggestions.length > 0) {
          return suggestions.slice(0, 3);
        }
      }
    }
    return [];
  }, [streamingBotText, messages]);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addToast("Voice recognition is not supported in this browser.", "info");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setInputValue(transcript);
        setInputState(transcript ? 2 : 1);
        if (inputElementRef.current) {
          inputElementRef.current.style.height = 'auto';
          inputElementRef.current.style.height = `${Math.min(inputElementRef.current.scrollHeight, 180)}px`;
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Could not start speech recognition:', err);
      setIsListening(false);
    }
  };

  const startLiveVoiceMode = async () => {
    setIsLiveVoiceMode(true);
    setIsVoiceMuted(false);

    // Stop basic browser STT if running
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsListening(false);

    // Extract user metadata for Gemini Live API setup
    const studentName = userProfile.display_name || 'Student';
    const department = userProfile.department_id || 'Academic Studies';
    const institution = userProfile.school_id || 'University';
    const level = userProfile.level || 'Higher Education';

    const apiKey = userProfile.use_personal_token && userProfile.personal_api_key?.trim()
      ? userProfile.personal_api_key.trim()
      : (appSettings?.gemini_api_key?.trim() || (import.meta as any).env?.VITE_GEMINI_API_KEY || '');

    if (!apiKey) {
      addToast("Gemini API key is required for Live Voice Mode.", "error");
      return;
    }

    try {
      if (liveClientRef.current) {
        liveClientRef.current.disconnect();
      }

      const client = new GeminiLiveVoiceClient({
        apiKey,
        model: 'models/gemini-3.1-flash-live-preview',
        voiceName: 'Aoede',
        userMetadata: {
          displayName: studentName,
          departmentName: department,
          institutionName: institution,
          level: level,
          courseContext: courseContext,
        },
        onOpen: () => {
          setStatusText(`Gemini Live connected for ${studentName}.`);
        },
        onSpeakingStateChange: (speaking) => {
          setIsLiveSpeaking(speaking);
        },
        onOutputAudioLevel: (lvl) => {
          setLiveAudioLevel(lvl);
        },
        onInputAudioLevel: (lvl) => {
          if (!isLiveSpeaking) {
            setLiveAudioLevel(lvl);
          }
        },
        onInterrupted: () => {
          setIsLiveSpeaking(false);
        },
        onError: (err) => {
          console.warn('[GeminiLive] Connection notice:', err);
        },
        onClose: () => {
          setIsLiveSpeaking(false);
          setLiveAudioLevel(0);
        }
      });

      liveClientRef.current = client;
      await client.connect();
    } catch (err) {
      console.warn('Gemini Live fallback initialization:', err);
    }
  };

  const exitLiveVoiceMode = () => {
    setIsLiveVoiceMode(false);
    setIsVoiceMuted(false);
    setIsLiveSpeaking(false);
    setLiveAudioLevel(0);

    if (liveClientRef.current) {
      liveClientRef.current.disconnect();
      liveClientRef.current = null;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsListening(false);
    }
  };

  const toggleVoiceMute = () => {
    const nextMuted = !isVoiceMuted;
    setIsVoiceMuted(nextMuted);
    if (liveClientRef.current) {
      liveClientRef.current.setMute(nextMuted);
    }
    if (nextMuted) {
      setLiveAudioLevel(0);
    }
  };

  useEffect(() => {
    return () => {
      if (liveClientRef.current) {
        liveClientRef.current.disconnect();
        liveClientRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (sectionRef.current) {
      sectionRef.current.scrollTop = sectionRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  useEffect(() => {
    let isMounted = true;
    setIsHistoryLoading(true);

    // 0ms instant local SQLite fetch
    getLocalConversations(userProfile.uid).then(localConvos => {
      if (isMounted && localConvos.length > 0) {
        setHistory(localConvos.map(c => ({
          id: c.id,
          title: normalizeTitle(c.title || 'New Chat'),
          lastUpdatedAt: c.last_updated_at || c.created_at || 0
        })));
        setIsHistoryLoading(false);
      }
    }).catch(() => {});

    const conversationsRef = dbRef(db, `chat_conversations/${userProfile.uid}`);
    const unsubscribe = onValue(conversationsRef, snapshot => {
      if (!snapshot.exists()) {
        if (isMounted) {
          setHistory([]);
          setActiveHistoryId(null);
          setIsHistoryLoading(false);
        }
        return;
      }

      const nextHistory: HistoryItem[] = [];
      snapshot.forEach(child => {
        const value = child.val() || {};
        nextHistory.push({
          id: child.key || '',
          title: normalizeTitle(value.title || 'New Chat'),
          lastUpdatedAt: Number(value.last_updated_at || value.created_at || 0),
        });
      });

      nextHistory.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
      if (isMounted) {
        setHistory(nextHistory);
        setIsHistoryLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [userProfile.uid]);

  useEffect(() => {
    let isMounted = true;

    const loadCourseContext = async () => {
      try {
        // Always fetch from departments_data — the canonical course store.
        // schools_data only has dept metadata (name, levels), NOT courses.
        const departmentSnapshot = await get(dbRef(db, `departments_data/${userProfile.department_id}`));
        let departmentData = departmentSnapshot.val();
        if (!departmentData && userProfile.school_id && userProfile.college_id) {
            // Fallback: try schools_data (legacy path, unlikely to have courses)
            const snapshot = await get(dbRef(db, `schools_data/${userProfile.school_id}/colleges/${userProfile.college_id}/departments/${userProfile.department_id}`));
            departmentData = snapshot.val();
        }

        const levelKey = userProfile.level as keyof NonNullable<typeof departmentData>['levels'];
      const courses: Course[] = departmentData?.levels?.[levelKey]?.courses
            ? Object.values(departmentData.levels[levelKey].courses) as Course[]
            : (departmentData?.course_list
                ? (Array.isArray(departmentData.course_list) ? departmentData.course_list : Object.values(departmentData.course_list)).filter((c: any) => c.level === userProfile.level)
                : []);
        const contextParts: string[] = [];

        contextParts.push(`STUDENT DEPARTMENT: ${userProfile.department_id}`);
        contextParts.push(`STUDENT LEVEL: ${userProfile.level}`);


        const sharedKeys = Array.from(new Set(courses.map(course => (course as Course & { textbook_shared_key?: string }).textbook_shared_key).filter(Boolean)));
        for (const sharedKey of sharedKeys) {
          const sharedSnapshot = await get(dbRef(db, `textbook_contexts/shared/${sharedKey}`));
          if (!sharedSnapshot.exists()) continue;
          const sharedData = sharedSnapshot.val();
          contextParts.push([
            `SHARED TEXTBOOK: ${(sharedData.course_name || sharedKey).toString()}`,
            `Level: ${sharedData.level || userProfile.level}`,
            `Syllabus: ${JSON.stringify(sharedData.syllabus || [])}`,
          ].join('\n'));
        }

        if (isMounted) {
          setCourseContext(contextParts.filter(Boolean).join('\n\n'));
        }
      } catch (error) {
        console.error('Failed to load assistant course context:', error);
        if (isMounted) setCourseContext('');
      }
    };

    void loadCourseContext();
    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile.department_id, userProfile.level]);

  useEffect(() => {
    if (!activeHistoryId) {
      setMessages([]);
      return;
    }

    let isMounted = true;

    // 0ms instant local SQLite fetch
    getLocalMessages(activeHistoryId).then(localMsgs => {
      if (isMounted && localMsgs.length > 0) {
        setMessages(deduplicateAssistantMessages(localMsgs.map(m => ({
          id: m.id,
          sender: mapSender(m.sender),
          text: m.text,
          timestamp: m.timestamp,
          attachments: m.attachments_json ? JSON.parse(m.attachments_json) : undefined,
          image_url: m.image_url || undefined,
        }))));
      }
    }).catch(() => {});

    const messagesRef = dbRef(db, `chat_messages/${activeHistoryId}`);
    const unsubscribe = onValue(messagesRef, snapshot => {
      if (!snapshot.exists()) {
        return;
      }

      const nextMessages: AssistantMessage[] = [];
      snapshot.forEach(child => {
        const value = child.val() || {};
        const rawAttachments = value.attachments;
        let attachments: AssistantAttachment[] | undefined;

        if (rawAttachments) {
          attachments = Array.isArray(rawAttachments)
            ? rawAttachments
            : Object.values(rawAttachments) as AssistantAttachment[];
        }

        nextMessages.push({
          id: child.key || createMessageId(),
          sender: mapSender(value.sender),
          text: value.text || '',
          timestamp: Number(value.timestamp || 0),
          attachments,
          image_url: value.image_url || undefined,
        });
      });

      nextMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      if (isMounted) {
        setMessages(prev => {
          // Build map of existing local/optimistic attachment URLs for fallback
          const localAttachmentUrlMap = new Map<string, string>();
          prev.forEach(pMsg => {
            pMsg.attachments?.forEach(att => {
              if (att.url) localAttachmentUrlMap.set(att.name || att.id, att.url);
            });
          });

          const mergedMessages = nextMessages.map(nMsg => {
            if (!nMsg.attachments || nMsg.attachments.length === 0) return nMsg;
            const restoredAttachments = nMsg.attachments.map(att => {
              if (!att.url || att.url === '') {
                const fallback = localAttachmentUrlMap.get(att.name || att.id) || '';
                return { ...att, url: fallback };
              }
              return att;
            });
            return { ...nMsg, attachments: restoredAttachments };
          });

          return deduplicateAssistantMessages(mergedMessages);
        });
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [activeHistoryId]);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (sectionRef.current) {
      sectionRef.current.scrollTo({
        top: sectionRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // WhatsApp-style instant bottom anchor when opening or switching conversation
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('instant' as ScrollBehavior);
      const timer = setTimeout(() => {
        scrollToBottom('instant' as ScrollBehavior);
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [activeHistoryId, scrollToBottom]);

  // Smooth scroll when new messages stream or complete
  useEffect(() => {
    if (messages.length > 0 || streamingBotText !== null) {
      scrollToBottom('smooth');
    }
  }, [messages.length, streamingBotText, isSending, scrollToBottom]);

  const conversationSummary = useMemo(() => {
    if (activeHistoryId) {
      const active = history.find((item: HistoryItem) => item.id === activeHistoryId);
      if (active) return active.title;
    }

    return messages.length > 0 ? 'Current chat' : 'New chat';
  }, [activeHistoryId, history, messages.length]);

  const preparePendingPrompt = useMemo(() => {
    const stored = readCachedJson<{ id?: string; source?: string; prompt: string; image?: string; customPrompt?: string; tutorialText?: string } | null>('avelut_pending_tutorial_prompt', null);
    if (!stored) return null;
    return stored;
  }, []);

  useEffect(() => {
    if (!preparePendingPrompt) return;
    clearCachedKey('avelut_pending_tutorial_prompt');
    setActiveHistoryId(null);
    setMessages([]);
    setInputValue('');
    clearAttachment();
    setStatusText('Opening AI tutor for your problem...');
    setInputState(1);

    const payload = preparePendingPrompt;
    const promptText = typeof payload === 'string' ? payload : (payload.prompt || 'Teach me this problem step by step');
    const imageUri = typeof payload === 'object' ? payload.image : undefined;
    const isTutorial = typeof payload === 'object' && (payload.id === 'visual_solver_detailed_tutorial' || payload.source === 'visual_solver');

    const timer = window.setTimeout(() => {
      let filesToSend: File[] = [];
      if (imageUri) {
        try {
          const file = dataUrlToFile(imageUri, 'scanned_problem.jpg');
          filesToSend = [file];
        } catch (err) {
          console.error('Failed to convert scanned image to file:', err);
        }
      }

      void handleSend(
        promptText,
        filesToSend,
        {
          id: typeof payload === 'object' ? (payload.id || 'visual_solver_detailed_tutorial') : 'visual_solver_detailed_tutorial',
          source: typeof payload === 'object' ? (payload.source || 'visual_solver') : 'visual_solver',
          isDetailedTutorial: isTutorial,
          customPrompt: typeof payload === 'object' ? payload.customPrompt : undefined,
          tutorialText: typeof payload === 'object' ? payload.tutorialText : undefined,
        }
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [preparePendingPrompt]);

  const handleNewChat = () => {
    setActiveHistoryId(null);
    setMessages([]);
    setStreamingBotText(null);
    setIsSidebarOpen(false);
    clearAttachment();
  };

  // Free users see an Upgrade CTA in the chat header — shown regardless of
  // how many pay-as-you-go credits they currently have on their account.
  const isFreeUser = !isPaidSubscriber(userProfile);

  const handleUpgradeFromChat = async () => {
    if (onNavigate) {
      onNavigate('billing');
      return;
    }
    const baseUrl = window.location.origin;
    window.location.href = `${baseUrl}/plans`;
  };

  useEffect(() => {
    if (setCustomHeaderConfig) {
      setCustomHeaderConfig({
        hideProfileAvatar: false,
        leftActions: (
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 rounded-full bg-white dark:bg-[#1E1E1E] shadow-xs border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition active:scale-95 cursor-pointer"
              aria-label="Open menu"
              title="Open menu"
            >
              <svg viewBox="0 0 24 24" width="19" height="19" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
                <line x1="4" y1="9" x2="20" y2="9" />
                <line x1="4" y1="15" x2="14" y2="15" />
              </svg>
            </button>
            <div className="flex flex-col justify-center min-w-0">
              {isFreeUser ? (
                <button
                  type="button"
                  onClick={handleUpgradeFromChat}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full bg-gradient-to-r from-[#0066FF] to-[#002D62] text-white text-[11px] sm:text-xs font-extrabold shadow-md shadow-blue-500/25 hover:shadow-lg active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  title="Upgrade to Weekly Plan — ₦1,200/week"
                >
                  <i className="bi bi-stars text-xs"></i>
                  <span>Upgrade ₦1,200</span>
                </button>
              ) : (
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">AVELUT AI</h1>
              )}
            </div>
          </div>
        ),
        rightActions: (
          <button
            type="button"
            onClick={handleNewChat}
            className="w-10 h-10 rounded-full bg-white dark:bg-[#1E1E1E] shadow-xs border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition active:scale-95 cursor-pointer"
            aria-label="New chat"
            title="New chat"
          >
            <i className="bi bi-pencil-square text-base"></i>
          </button>
        ),
        className: 'bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200/60 dark:border-white/5'
      });
    }
    
    return () => {
      if (setCustomHeaderConfig) {
        setCustomHeaderConfig(null);
      }
    };
  }, [setCustomHeaderConfig, conversationSummary, onNavigate, isFreeUser]);

  const clearAttachment = () => {
    setAttachments([]);
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  };

  const handleAttachmentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachments(files);
      setInputState(1);
    }
  };

  const startNewChat = () => {
    setActiveHistoryId(null);
    setMessages([]);
    setInputValue('');
    clearAttachment();
    setStatusText('Started a new chat.');
    setIsSidebarOpen(false);
    setInputState(1);
  };

  const generateChatTitle = async (prompt: string, responseText: string) => {
    const fallbackTitle = normalizeTitle(prompt);
    if (!ai) return fallbackTitle;

    try {
      const result = await ai.models.generateContent({
        model: getFeatureModel('title_generation', appSettings),
        contents: [{
          role: 'user',
          parts: [{
            text: [
              'Create a short, simple, readable chat title for this tutoring conversation.',
              'Rules: maximum 6 words, no markdown, no quotes, no emojis, no trailing punctuation unless needed.',
              `Student message: ${prompt}`,
              `Assistant reply: ${responseText}`,
            ].join('\n'),
          }],
        }],
      });
      const titleText = getResponseText(result);
      return normalizeTitle((titleText || '').split('\n')[0] || fallbackTitle);
    } catch (error) {
      console.error('Failed to generate chat title:', error);
      return fallbackTitle;
    }
  };

  const handleGenerateIllustration = async (promptText: string, messageId: string) => {
    if (!promptText) return;
    if (!ai) {
      addToast('Avelut AI is not configured in App Controls.', 'error');
      return;
    }

    setGeneratingMessageIds(prev => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
    setViewingImageIds(prev => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
    addToast('Creating a visualization for you...', 'info');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: `Create a simple educational illustration for this explanation. Keep it minimal, readable, and focused on the core concept.\n\nContext:\n${promptText}`,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '1K',
          },
        },
      });

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.[0];
      if (!part?.inlineData?.data) {
        throw new Error('No image was returned.');
      }

      const mimeType = part.inlineData.mimeType || 'image/png';
      const imageBlob = base64ToBlob(part.inlineData.data, mimeType);
      const uniqueImageId = createUniqueId();
      const fileExtension = mimeType.split('/')[1] || 'png';
      const fileRef = storageRef(storage, `${userProfile.uid}/assistant-visuals/${uniqueImageId}.${fileExtension}`);
      const uploadResult = await uploadBytes(fileRef, imageBlob);
      const publicUrl = await getDownloadURL(uploadResult.ref);

      if (activeHistoryId) {
        await update(dbRef(db, `chat_messages/${activeHistoryId}/${messageId}`), { image_url: publicUrl });
      }

      setMessages(prev => prev.map(message => message.id === messageId ? { ...message, image_url: publicUrl } : message));
      setViewingImageIds(prev => {
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });
    } catch (error) {
      console.error('Assistant illustration error:', error);
      addToast('Failed to generate the visual.', 'error');
    } finally {
      setGeneratingMessageIds(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const handleMessageDoubleTap = async (message: AssistantMessage) => {
    if (message.sender !== 'assistant' || !message.text) return;

    const nowToggle = Date.now();
    const lastToggle = lastToggleRef.current[message.id] || 0;
    if (nowToggle - lastToggle < 600) {
      return;
    }
    lastToggleRef.current[message.id] = nowToggle;

    if (generatingMessageIds.has(message.id)) {
      setGeneratingMessageIds(prev => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
      setViewingImageIds(prev => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
      return;
    }

    if (message.image_url) {
      setViewingImageIds(prev => {
        const next = new Set(prev);
        if (next.has(message.id)) next.delete(message.id);
        else next.add(message.id);
        return next;
      });
      return;
    }

    setGeneratingMessageIds(prev => {
      const next = new Set(prev);
      next.add(message.id);
      return next;
    });
    setViewingImageIds(prev => {
      const next = new Set(prev);
      next.add(message.id);
      return next;
    });

    void handleGenerateIllustration(message.text, message.id);
  };

  const handleSend = async (
    messageText?: string,
    overrideFiles?: File[],
    additionalContext?: { id?: string; source?: string; isDetailedTutorial?: boolean; customPrompt?: string; tutorialText?: string }
  ) => {
    if (isSendingRef.current) return;
    const prompt = (messageText || inputValue).trim();
    const filesToSend = overrideFiles !== undefined ? overrideFiles : (messageText ? [] : [...attachments]);
    if (!prompt && filesToSend.length === 0) return;

    const cost = getFeatureCost('chat_interaction', appSettings);
    const creditCheck = checkAICredits(userProfile, cost, appSettings);
    if (!creditCheck.allowed) {
      addToast('Insufficient credits. Top up your balance to continue using Avelut AI.', 'error');
      setLimitModalData({ balance: creditCheck.balance, cost: creditCheck.cost });
      setShowLimitModal(true);
      return;
    }

    isSendingRef.current = true;
    setIsSending(true);

    const primaryAttachment = filesToSend[0] || null;
    const userText = prompt || getHistoryFallbackTitle(prompt, primaryAttachment);

    // Create local optimistic attachments to render in the user's bubble immediately
    const optimisticAttachments = await Promise.all(filesToSend.map(async (file, index) => {
      const isImg = isImageMimeType(file.type, file.name);
      let url = '';
      try {
        if (isImg) {
          url = await compressImageToDataUrl(file);
        } else {
          url = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
        }
      } catch {
        url = URL.createObjectURL(file);
      }
      return {
        id: `optimistic-${Date.now()}-${index}`,
        name: file.name,
        mimeType: isImg ? 'image/jpeg' : (file.type || 'application/octet-stream'),
        url,
        isImage: isImg,
      };
    }));

    const userMessage: AssistantMessage = {
      id: createMessageId(),
      sender: 'user',
      text: userText,
      timestamp: Date.now(),
      attachments: optimisticAttachments,
    };
    const nextMessages = [...messages, userMessage];
    const isNewConversation = !activeHistoryId;
    const activeConversation = history.find(item => item.id === activeHistoryId);

    // Count ONLY user messages to determine if this is the first interaction
    const previousUserMessagesCount = messages.filter(m => m.sender === 'user').length;
    const shouldGenerateTitle = previousUserMessagesCount === 0 ||
                               isNewConversation ||
                               !activeConversation ||
                               activeConversation.title === 'New Chat' ||
                               activeConversation.title === 'Current chat';

    setMessages(nextMessages);
    setInputValue('');
    if (inputElementRef.current) {
      inputElementRef.current.style.height = 'auto';
    }
    clearAttachment(); // Clear immediately from the composer input bar!
    setIsSending(true);
    setStatusText('Thinking...');
    setInputState(1);
    const ephemeralR2Keys: string[] = [];

    try {
      if (!ai) {
        setMessages(prev => [
          ...prev,
          {
            id: createMessageId(),
            sender: 'assistant',
            text: 'Avelut AI is not configured yet. Ask an admin to configure the API key in App Controls.',
          },
        ]);
        setStatusText('API key missing.');
        setIsSending(false);
        return;
      }

      let conversationId = activeHistoryId;
      const now = Date.now();
      if (!conversationId) {
        const conversationsRef = dbRef(db, `chat_conversations/${userProfile.uid}`);
        const newConversationRef = push(conversationsRef);
        conversationId = newConversationRef.key;

        if (!conversationId) {
          throw new Error('Failed to create conversation: Firebase push() returned no key.');
        }

        // Save conversation to SQLite immediately
        void saveLocalConversation({
          id: conversationId,
          user_id: userProfile.uid,
          title: 'New Chat',
          created_at: now,
          last_updated_at: now,
        });

        // Fire-and-forget push to Firebase Realtime Database
        set(newConversationRef, {
          title: 'New Chat',
          created_at: now,
          last_updated_at: now,
        }).catch(err => console.warn('Cloud conversation creation sync note:', err));

        setActiveHistoryId(conversationId);
        // Award streak for starting a new AI chat
        void awardDailyStreak(userProfile.uid);
      }

      const messagesRef = dbRef(db, `chat_messages/${conversationId}`);
      const storedAttachments: AssistantAttachment[] = [];
      const attachmentParts: any[] = [];

      for (let index = 0; index < filesToSend.length; index += 1) {
        const file = filesToSend[index];
        const mimeType = getMimeType(file);
        
        const prefix = filesToSend.length > 1 ? `[File ${index + 1}/${filesToSend.length}] ` : '';
        setUploadProgress(`Processing ${prefix}${file.name}...`);
        setStatusText(`Processing ${prefix}${file.name}...`);

        // If Cloudflare R2 is configured, upload ephemeral file to R2
        if (isR2Configured()) {
          try {
            const r2Upload = await uploadToR2(file, {
              burnAfterDownload: true,
              fileName: file.name,
              contentType: mimeType,
              userId: userProfile.uid,
            });
            if (r2Upload.key) {
              ephemeralR2Keys.push(r2Upload.key);
            }
          } catch (r2Err) {
            console.warn('[AvelutAI] R2 ephemeral upload note:', r2Err);
          }
        }

        const { attachment, base64Data } = await prepareLocalChatAttachment(file, index);
        storedAttachments.push(attachment);

        if (isSupportedInlineMimeType(mimeType, file.name)) {
          attachmentParts.push({
            inlineData: {
              data: base64Data,
              mimeType: attachment.mimeType,
            },
          });
        } else if (isTextFile(mimeType, file.name)) {
          setUploadProgress(`Reading ${file.name}...`);
          try {
            const textContent = await readTextFile(file);
            attachmentParts.push({
              text: `[Content of attached file: ${file.name}]\n\n${textContent}`
            });
          } catch (readErr) {
            console.error(`Failed to read text file ${file.name}:`, readErr);
            attachmentParts.push({
              inlineData: { data: base64Data, mimeType }
            });
          }
        } else if (file.name.toLowerCase().endsWith('.docx')) {
          setUploadProgress(`Extracting text from ${file.name}...`);
          try {
            const mammoth = await import('mammoth');
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            attachmentParts.push({
              text: `[Content of attached file: ${file.name}]\n\n${result.value}`
            });
          } catch (docxErr) {
            console.error(`Failed to parse docx file ${file.name}:`, docxErr);
            attachmentParts.push({
              inlineData: { data: base64Data, mimeType }
            });
          }
        } else {
          attachmentParts.push({
            inlineData: {
              data: base64Data,
              mimeType,
            },
          });
        }
      }

      setUploadProgress(null);

      // 1. Save user message to SQLite immediately (0ms)
      void saveLocalMessage({
        id: userMessage.id,
        conversation_id: conversationId,
        user_id: userProfile.uid,
        sender: 'user',
        text: userText,
        attachments_json: storedAttachments.length > 0 ? JSON.stringify(storedAttachments) : null,
        timestamp: Date.now()
      });

      // Sanitize attachments for Firebase RTDB by stripping large inline base64 URLs
      // to avoid 'Data too large' or transaction errors in cloud RTDB payload
      const cloudAttachments = storedAttachments.map(att => ({
        id: att.id,
        name: att.name,
        mimeType: att.mimeType,
        url: att.url.startsWith('data:') ? '' : att.url,
        isImage: att.isImage,
      }));

      const storedUserMessage = {
        text: userText,
        sender: 'user',
        timestamp: serverTimestamp(),
        attachments: cloudAttachments,
      };
      // Fire-and-forget push to Firebase
      push(messagesRef, storedUserMessage).catch(err => console.warn('Cloud message sync note:', err));

      const assistantMsgId = createMessageId();
      let responseText = '';
      const aiResult = await attemptApiCall(async () => {
        setStreamingBotText('');
        // Optimize payload: preserve system instructions but only send last 5 messages for context
        const contextMessages = nextMessages.slice(-5);

        // 💡 Check if prompt is a greeting / casual chat vs academic question
        const cleanPrompt = prompt.trim();
        const isGreetingOrCasual = /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|sup|how are you|who are you|what('s| is) your name)[\s!.,?]*$/i.test(cleanPrompt);

        // On-demand local SQLite context search (ONLY when student context mode is active)
        let retrievedContext = "";
        if (isContextAware && !isGreetingOrCasual && cleanPrompt.length > 3) {
          try {
            const { runQuery } = await import('../lib/sqlite/sqliteService');
            const searchWords = cleanPrompt
              .toLowerCase()
              .replace(/[^\w\s]/g, '')
              .split(/\s+/)
              .filter(w => w.length > 3)
              .slice(0, 4);

            if (searchWords.length > 0) {
              const likeClauses = searchWords.map(() => `content LIKE ?`).join(' OR ');
              const params = searchWords.map(w => `%${w}%`);
              const rows = await runQuery<{ chapter_title: string; content: string }>(
                `SELECT chapter_title, content FROM notebook_chunks WHERE ${likeClauses} LIMIT 3;`,
                params
              );
              if (rows && rows.length > 0) {
                retrievedContext = "\n\nRELEVANT MATERIAL FROM STUDENT'S NOTEBOOKS (SQLITE):\n" +
                  rows.map((r: any) => `[From Chapter: ${r.chapter_title}]: ${r.content.slice(0, 600)}`).join('\n\n');
              }
            }
          } catch (sqliteErr) {
            console.warn("SQLite context search note:", sqliteErr);
          }
        }

        // Check if there is a cached response for exact prompt when no files attached
        if (filesToSend.length === 0) {
          const cachedReply = await getCachedAIResponse(prompt, geminiModel || 'gemini-3.1-flash-lite', courseContext);
          if (cachedReply) {
            return cachedReply;
          }
        }

        const isTutorialMode = Boolean(additionalContext?.isDetailedTutorial || additionalContext?.id === 'visual_solver_detailed_tutorial');

        const tutorialInstructions = isTutorialMode ? [
          '*** SPECIAL MODE: VISUAL SOLVER DETAILED TUTORIAL (ID: visual_solver_detailed_tutorial) ***',
          'The student scanned a problem image in Visual Solver and pressed "Detailed Tutorial".',
          'YOUR PRIMARY OBJECTIVE: Act as an engaging, friendly 1-on-1 personal AI tutor and teach the student how to solve this exact problem IN DETAIL, STEP BY STEP, BIT BY BIT.',
          'CRITICAL TUTORING RULES:',
          '1. NEVER dump the whole solution or entire derivation all at once. The student wants to understand each step progressively.',
          '2. In this FIRST response:',
          '   - Warmly greet the student and state what is given in the problem and what goal we are solving for.',
          '   - Teach ONLY Step 1 in full detail: write out the core formula/concept using clean LaTeX formatting ($$...$$) and explain the logic clearly in simple, friendly terms.',
          '   - Conclude by asking the student a simple question or check-in to confirm they understand Step 1 before proceeding to Step 2.',
          '3. In subsequent user replies, praise their progress and guide them through the next step bit by bit until the full solution is mastered.',
          '4. Always maintain a warm, patient, and encouraging demeanor.',
        ].join('\n') : '';

        const studentName = userProfile?.display_name?.split(' ')[0] || (userProfile as any)?.first_name || 'there';
        const studentInfo = isContextAware 
          ? `Student Name: ${studentName}${userProfile?.department_id ? `, Department: ${userProfile.department_id}` : ''}${userProfile?.level ? `, Level: ${userProfile.level}` : ''}`
          : '';

        const systemInstructions = isContextAware ? [
          `You are AVELUT AI, an intelligent, concise, and natural academic tutor and problem-solver assisting ${studentName}.`,
          studentInfo ? `STUDENT CONTEXT: ${studentInfo}` : '',
          'CRITICAL BEHAVIOR GUIDELINES:',
          '1. CONCISE & PRECISE: Answer questions directly and precisely without unnecessary filler, repetitive preamble, or unsolicited info dumps.',
          '2. NATURAL ON GREETINGS: If the user sends a greeting (e.g. "hi", "hello", "good morning"), reply warmly, naturally, and simply (e.g., "Hello ' + studentName + '! How can I help you today?"). Do NOT dump paragraphs of context, lists of capabilities, or unsolicited academic overviews on simple casual greetings.',
          '3. EXPAND ONLY WHEN REQUESTED: Provide detailed step-by-step breakdowns, comprehensive derivations, or worked examples ONLY when the student explicitly asks for an explanation, tutorial, problem breakdown, or study assistance.',
          '4. LATEX & COLOR FORMATTING: Format mathematical equations and variables cleanly using LaTeX ($...$ inline or $$...$$ block). Use clean structured markdown.',
          '5. SUGGESTIONS: At the very end of your response, output 3 helpful follow-up suggestions on a new line formatted as: [Suggestions: Option 1 | Option 2 | Option 3]',
          tutorialInstructions,
          courseContext ? `STUDENT'S ACTIVE COURSE CONTEXT:\n${courseContext}` : '',
          retrievedContext,
          storedAttachments?.length ? `ATTACHMENTS: ${storedAttachments.map(i => i.name).join(', ')}` : '',
          '',
          `Conversation history:\n${contextMessages.map(msg => `${msg.sender.toUpperCase()}: ${msg.text}`).join('\n\n')}`,
        ].filter(Boolean).join('\n') : [
          'You are AVELUT AI, a powerful, versatile, concise, and natural general AI assistant.',
          'CRITICAL BEHAVIOR GUIDELINES:',
          '1. CONCISE & PRECISE: Provide direct, accurate, and concise answers to the user\'s prompts and questions without filler or unsolicited paragraphs.',
          '2. NATURAL ON GREETINGS: If the user sends a casual greeting (like "hi", "hello"), reply warmly, naturally, and simply (e.g., "Hello! How can I help you today?").',
          '3. EXPAND ONLY WHEN REQUESTED: Provide extensive multi-step explanations or comprehensive derivations ONLY when the user explicitly asks for help or deep analysis.',
          '4. LATEX FORMATTING: Use LaTeX ($...$ or $$...$$) for mathematical expressions whenever relevant.',
          '5. SUGGESTIONS: At the very end of your response, output 3 helpful follow-up suggestions on a new line formatted as: [Suggestions: Option 1 | Option 2 | Option 3]',
          tutorialInstructions,
          storedAttachments?.length ? `ATTACHMENTS: ${storedAttachments.map(i => i.name).join(', ')}` : '',
          '',
          `Conversation history:\n${contextMessages.map(msg => `${msg.sender.toUpperCase()}: ${msg.text}`).join('\n\n')}`,
        ].filter(Boolean).join('\n');

        // Initialize empty assistant bubble in UI for live streaming / response
        setMessages([
          ...nextMessages,
          {
            id: assistantMsgId,
            sender: 'assistant',
            text: '',
            timestamp: Date.now(),
          },
        ]);

        try {
          const responseStream = await ai.models.generateContentStream({
            model: geminiModel || 'gemini-3.1-flash-lite',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: systemInstructions,
                  },
                  ...attachmentParts,
                ],
              },
            ],
          });

          for await (const chunk of responseStream) {
            const chunkText = getResponseText(chunk);
            responseText += chunkText;
            setStreamingBotText(responseText);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, text: responseText } : m))
            );
          }
        } catch (streamError) {
          console.warn('Streaming failed, falling back to generateContent:', streamError);
          const nonStreamResult = await ai.models.generateContent({
            model: geminiModel || 'gemini-3.1-flash-lite',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: systemInstructions,
                  },
                  ...attachmentParts,
                ],
              },
            ],
          });
          responseText = getResponseText(nonStreamResult);
          setStreamingBotText(responseText);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, text: responseText } : m))
          );
        }

        if (!responseText) {
          throw new Error('Avelut AI returned an empty response.');
        }

        return responseText.trim();
      });

      if (!aiResult.success) {
        console.error('Avelut assistant error:', aiResult.message);
        setStatusText('Unable to respond right now.');
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === assistantMsgId);
          if (exists) {
            return prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, text: 'Sorry, I ran into a problem generating that reply. Please try again.' }
                : m
            );
          }
          return [
            ...prev,
            {
              id: assistantMsgId,
              sender: 'assistant',
              text: 'Sorry, I ran into a problem generating that reply. Please try again.',
              timestamp: Date.now(),
            },
          ];
        });
        return;
      }

      const finalResponseText = aiResult.data || 'I could not generate a response right now. Please try again.';
      
      // Update messages with the completed assistant response
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, text: finalResponseText } : m))
      );

      // Deduct AI credits for Avelut AI Chat
      void deductAICredits(userProfile.uid, cost, 'Avelut AI Chat', appSettings);

      // Save assistant response to SQLite instantly
      void saveLocalMessage({
        id: assistantMsgId,
        conversation_id: conversationId,
        user_id: userProfile.uid,
        sender: 'assistant',
        text: finalResponseText,
        timestamp: Date.now()
      });

      // Cache AI response for future zero-latency repeat queries
      if (filesToSend.length === 0) {
        void setCachedAIResponse(prompt, geminiModel || 'gemini-3.1-flash-lite', courseContext, finalResponseText);
      }

      push(messagesRef, {
        text: finalResponseText,
        sender: 'assistant',
        timestamp: serverTimestamp(),
      }).catch(console.error);

      if (shouldGenerateTitle) {
        generateChatTitle(userText, finalResponseText).then(title => {
          void renameLocalConversation(conversationId!, title, userProfile.uid);
          update(dbRef(db, `chat_conversations/${userProfile.uid}/${conversationId}`), {
            title,
            last_updated_at: Date.now()
          }).catch(console.error);
        });
      } else {
        update(dbRef(db, `chat_conversations/${userProfile.uid}/${conversationId}`), {
          last_updated_at: Date.now()
        }).catch(console.error);
      }

      setStatusText('Response ready.');
    } catch (error) {
      console.error('Avelut assistant error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: createMessageId(),
          sender: 'assistant',
          text: 'Sorry, I ran into a problem generating that reply. Please try again.',
          timestamp: Date.now(),
        },
      ]);
      setStatusText('Unable to respond right now.');
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
      setStreamingBotText(null);
      setUploadProgress(null);

      // Programmatically purge any ephemeral files from Cloudflare R2 after AI processing
      if (ephemeralR2Keys && ephemeralR2Keys.length > 0) {
        ephemeralR2Keys.forEach(key => void deleteFromR2(key));
      }
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (val.length > 0) {
      setInputState(2);
    } else {
      setInputState(1);
    }

    // Auto-expand height
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 180)}px`;
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setAttachments(prev => {
      const combined = [...prev, ...files];
      if (combined.length > 5) {
        addToast("You can upload up to 5 images/files at once.", "info");
        return combined.slice(0, 5);
      }
      return combined;
    });
    setStatusText(`${files.length} attachment${files.length !== 1 ? 's' : ''} ready.`);
    event.target.value = '';
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-white dark:bg-black pt-0">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl overflow-hidden bg-white dark:bg-black md:rounded-[2rem] md:border md:border-slate-200/80 dark:border-white/10 md:shadow-[0_20px_80px_rgba(0,0,0,0.08)]">
        
        {/* Modern Replica Sidebar Drawer (Exact layout from uploaded image) */}
        <aside
          className={`${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } fixed inset-y-0 left-0 z-[120] w-[84vw] max-w-[310px] border-r border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#121212] flex flex-col shadow-2xl transition-transform duration-300 md:static md:z-auto md:w-76 md:translate-x-0 md:shadow-none`}
        >
          {/* Drawer Top Header / New Chat */}
          <div className="p-4 pb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                startNewChat();
                setIsSidebarOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-95 cursor-pointer border border-slate-200/80 dark:border-white/10 shadow-xs"
            >
              <PlusIcon />
              <span>New chat</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 dark:text-slate-400 md:hidden cursor-pointer"
              aria-label="Close menu"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Top Half: Quick Action Navigation Items with Clean Colored Badges & Bootstrap Icons */}
          <div className="px-3 py-2 space-y-1.5">
            {/* 1. My Notebooks */}
            <button
              type="button"
              onClick={() => {
                onNavigate?.('study_guide');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-[14px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-98 text-left cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100/80 dark:border-blue-800/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 group-hover:scale-105 transition-transform">
                <i className="bi bi-journal-bookmark-fill text-sm"></i>
              </div>
              <span className="truncate">My Notebooks</span>
            </button>

            {/* 3. Visual Solver */}
            <button
              type="button"
              onClick={() => {
                onNavigate?.('visual_solver');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-[14px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-98 text-left cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-100/80 dark:border-violet-800/40 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0 group-hover:scale-105 transition-transform">
                <i className="bi bi-camera-fill text-sm"></i>
              </div>
              <span className="truncate">Visual Solver</span>
            </button>

            {/* 4. Messenger */}
            <button
              type="button"
              onClick={() => {
                onNavigate?.('messenger');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-2xl text-[14px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-98 text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100/80 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:scale-105 transition-transform">
                  <i className="bi bi-chat-dots-fill text-sm"></i>
                </div>
                <span className="truncate">Messenger</span>
              </div>
              {unreadMessagesCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white shadow-xs">
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </span>
              )}
            </button>

            {/* 5. Leaderboard */}
            <button
              type="button"
              onClick={() => {
                onNavigate?.('leaderboard');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-[14px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-98 text-left cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100/80 dark:border-rose-800/40 flex items-center justify-center text-rose-500 dark:text-rose-400 shrink-0 group-hover:scale-105 transition-transform">
                <i className="bi bi-trophy-fill text-sm"></i>
              </div>
              <span className="truncate">Leaderboard</span>
            </button>
          </div>

          {/* Section Divider & Recents Header */}
          <div className="px-5 pt-4 pb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Recents</h3>
          </div>

          {/* Bottom Half: Chat History List */}
          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1 no-scrollbar">
            {isHistoryLoading ? (
              <div className="px-3 py-4 text-xs text-slate-400 dark:text-gray-500">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="px-3 py-6 text-xs text-slate-400 dark:text-gray-500 text-center">No recent conversations yet.</div>
            ) : (
              history.map(item => {
                const isActive = activeHistoryId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`group flex items-center justify-between rounded-xl px-3 py-2.5 transition text-sm cursor-pointer ${
                      isActive
                        ? 'bg-slate-100 dark:bg-white/10 font-semibold text-slate-900 dark:text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                    onClick={() => {
                      setActiveHistoryId(item.id);
                      setIsSidebarOpen(false);
                    }}
                  >
                    <span className="truncate flex-1 pr-2 text-left">{item.title}</span>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Delete "${item.title}"?`)) return;
                        try {
                          void deleteLocalConversation(item.id, userProfile.uid);
                          await remove(dbRef(db, `chat_conversations/${userProfile.uid}/${item.id}`));
                          await remove(dbRef(db, `chat_messages/${item.id}`));
                          if (activeHistoryId === item.id) {
                            setActiveHistoryId(null);
                            setMessages([]);
                          }
                          setStatusText(`Deleted ${item.title}.`);
                        } catch (err) {
                          console.error('Failed to delete history item:', err);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition-opacity"
                      aria-label="Delete chat"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Drawer Bottom Footer (User Profile & Settings) */}
          <div className="p-3 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onNavigate?.('user_profile');
                setIsSidebarOpen(false);
              }}
              className="flex items-center gap-2.5 min-w-0 flex-1 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition text-left cursor-pointer"
            >
              {userProfile.photo_url ? (
                <img src={userProfile.photo_url} alt={userProfile.display_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {userProfile.display_name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{userProfile.display_name || 'Student'}</p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400 truncate">{userProfile.department_id || 'Academic Student'}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigate?.('settings');
                setIsSidebarOpen(false);
              }}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              aria-label="Settings"
              title="Settings"
            >
              <SettingsDrawerIcon className="w-5 h-5" />
            </button>
          </div>
        </aside>

        {isSidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-xs md:hidden"
            aria-label="Close menu overlay"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <main 
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-black"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isLiveVoiceMode ? (
            /* Live Voice Immersive Mode (Exact Replica of ChatGPT Voice Moon UI) */
            <div className="relative flex-1 flex flex-col justify-center items-center w-full h-full p-4 sm:p-6 overflow-hidden animate-fade-in">
              {/* Center Heartbeat Animated Celestial Moon Orb */}
              <AnimatedMoonOrb
                isListening={isListening || !isVoiceMuted}
                isSpeaking={isLiveSpeaking || isSending}
                isMuted={isVoiceMuted}
                audioLevel={liveAudioLevel}
              />
            </div>
          ) : (
            <>
              {/* Messages List Container */}
            <section ref={sectionRef} className="relative flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[100px] md:pb-5 sm:px-6 scroll-smooth">
              {messages.length === 0 ? (
                /* Faded Black/White Watermark Center Graphic - Clean & Minimal */
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                  <img
                    src="/logo_icon_black_glyph.png"
                    alt="AVELUT"
                    className="w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 opacity-[0.12] dark:hidden object-contain"
                  />
                  <img
                    src="/logo_icon_white_glyph.png"
                    alt="AVELUT"
                    className="w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 opacity-[0.18] hidden dark:block object-contain"
                  />
                </div>
              ) : (
                <div className="relative z-10 mx-auto flex w-full max-w-6xl min-h-full flex-col justify-end gap-4">
                  {displayMessages.map((message, idx) => {
                    // If this is the last bot message and it's redundant with streaming, hide it temporarily
                    if (streamingBotText !== null &&
                        message.sender === 'assistant' &&
                        idx === displayMessages.length - 1 &&
                        message.text.length >= (streamingBotText?.length || 0)) {
                      return null;
                    }

                    const { cleanText, suggestions } = parseMessageSuggestions(message.text || '');
                    const { cleanText: cleanVisualText, visualHintText } = parseVisualHint(cleanText);
                    const shouldShowVisualCue = message.sender === 'assistant' && (Boolean(visualHintText) || shouldHighlightForVisual(cleanVisualText));

                    if (message.sender === 'user') {
                      const isLongUserMsg = cleanText.length > 220 || (cleanText.match(/\n/g) || []).length >= 4;
                      const isExpanded = expandedUserMessageIds.has(message.id);

                      return (
                        <div key={message.id} className="flex justify-end my-3">
                          <div className="min-w-[33%] max-w-[85%] sm:max-w-[76%] rounded-3xl bg-[#002D62] text-white px-4 py-3 shadow-xs rounded-tr-none">
                            {message.attachments && message.attachments.length > 0 && (
                              <div className="mb-3">
                                {message.attachments.length === 1 && message.attachments[0].isImage ? (
                                  <a
                                    href={message.attachments[0].url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-block overflow-hidden rounded-[20px] border border-transparent bg-transparent transition-transform hover:scale-[1.01]"
                                  >
                                    <img
                                      src={message.attachments[0].url}
                                      alt={message.attachments[0].name}
                                      className="max-h-[360px] sm:max-h-[460px] w-full rounded-[20px] object-cover border border-transparent shadow-xs"
                                    />
                                  </a>
                                ) : (
                                  <div className={`grid gap-2.5 ${message.attachments.some(item => item.isImage) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                                    {message.attachments.map(attachmentItem => (
                                      <a
                                        key={attachmentItem.id}
                                        href={attachmentItem.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="overflow-hidden rounded-2xl border border-transparent bg-transparent text-slate-900 dark:text-white"
                                      >
                                        {attachmentItem.isImage ? (
                                          <img src={attachmentItem.url} alt={attachmentItem.name} className="max-h-72 w-full object-cover rounded-2xl border border-transparent" />
                                        ) : (
                                          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/10 dark:bg-black/20 border border-white/10">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 dark:bg-black/30 text-[10px] font-black uppercase text-white">
                                              DOC
                                            </div>
                                            <div className="min-w-0">
                                              <p className="truncate text-sm font-semibold text-white">{attachmentItem.name}</p>
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
                            <div className={`relative ${isLongUserMsg && !isExpanded ? 'max-h-[125px] overflow-hidden' : ''}`}>
                              <p className="whitespace-pre-wrap leading-relaxed text-sm sm:text-[15px]">{cleanText}</p>
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
                        </div>
                      );
                    }

                    // Avelut Assistant reply: takes full width, seamless with chat background (no bubble border, no card shadow)
                    return (
                      <div
                        key={message.id}
                        className="w-full my-3 px-1 sm:px-2 flex flex-col items-start"
                        onDoubleClick={() => void handleMessageDoubleTap(message)}
                        onTouchEnd={(event) => {
                          const now = Date.now();
                          const lastTap = lastTapRef.current[message.id] || 0;
                          if (now - lastTap < 300) {
                            event.preventDefault();
                            void handleMessageDoubleTap(message);
                            lastTapRef.current[message.id] = 0;
                          } else {
                            lastTapRef.current[message.id] = now;
                          }
                        }}
                      >
                        <div className="w-full text-slate-800 dark:text-slate-100 bg-transparent text-[17px] sm:text-[18px] leading-relaxed tracking-normal">
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
                                  {message.attachments.map(attachmentItem => (
                                    <a
                                      key={attachmentItem.id}
                                      href={attachmentItem.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="overflow-hidden rounded-2xl border border-transparent bg-transparent text-slate-600 dark:text-slate-300"
                                    >
                                      {attachmentItem.isImage ? (
                                        <img src={attachmentItem.url} alt={attachmentItem.name} className="max-h-56 w-full object-cover rounded-2xl border border-transparent" />
                                      ) : (
                                        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 dark:bg-black text-[10px] font-black uppercase">
                                            DOC
                                          </div>
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold">{attachmentItem.name}</p>
                                            <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Open attachment</p>
                                          </div>
                                        </div>
                                      )}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {shouldShowVisualCue && (
                            <div className="mb-3 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                              Double-tap for a visual
                            </div>
                          )}

                          {generatingMessageIds.has(message.id) || (viewingImageIds.has(message.id) && message.image_url) ? (
                            <div className="min-h-[180px] rounded-2xl border border-slate-200 bg-slate-50 p-2">
                              {generatingMessageIds.has(message.id) ? (
                                <div className="flex h-full min-h-[160px] items-center justify-center rounded-xl bg-slate-100 text-sm font-medium text-slate-500">
                                  Creating the visual...
                                </div>
                              ) : (
                                message.image_url && (
                                  <img src={message.image_url} alt="Assistant visual explanation" className="h-full w-full rounded-xl object-contain" />
                                )
                              )}
                            </div>
                          ) : (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                h1: ({ node, ...props }: any) => (
                                  <h1 className="text-2xl sm:text-3xl font-black text-[#0F172A] dark:text-white mt-5 mb-3 tracking-tight" {...props} />
                                ),
                                h2: ({ node, ...props }: any) => (
                                  <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white mt-4 mb-2 tracking-tight border-b border-[#E3E9F1] dark:border-slate-800 pb-1.5" {...props} />
                                ),
                                h3: ({ node, ...props }: any) => (
                                  <h3 className="text-lg sm:text-xl font-bold text-[#002D62] dark:text-[#60A5FA] mt-3.5 mb-1.5" {...props} />
                                ),
                                h4: ({ node, ...props }: any) => (
                                  <h4 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-white mt-3 mb-1" {...props} />
                                ),
                                p: ({ node, ...props }: any) => <p className="mb-4 last:mb-0 text-[17px] sm:text-[18px] leading-relaxed text-slate-800 dark:text-slate-100" {...props} />,
                                ul: ({ node, ...props }: any) => <ul className="mb-4 list-disc space-y-2 pl-5 text-[17px] sm:text-[18px] text-slate-800 dark:text-slate-100 marker:text-[#0066FF]" {...props} />,
                                ol: ({ node, ...props }: any) => <ol className="mb-4 list-decimal space-y-2 pl-5 text-[17px] sm:text-[18px] text-slate-800 dark:text-slate-100 marker:text-[#0066FF] font-medium" {...props} />,
                                li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
                                strong: ({ node, ...props }: any) => <strong className="font-bold text-[#0F172A] dark:text-white" {...props} />,
                                code: ({ node, inline, ...props }: any) =>
                                  inline ? (
                                    <code className="rounded-md bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 text-[0.9em] font-mono text-[#0066FF] dark:text-blue-300 border border-blue-100 dark:border-blue-900/50" {...props} />
                                  ) : (
                                    <code className="block overflow-x-auto rounded-2xl bg-[#0F172A] dark:bg-[#050711] p-4 text-sm font-mono text-slate-100 border border-slate-700/60 dark:border-white/10 my-3" {...props} />
                                  ),
                                pre: ({ node, ...props }: any) => <pre className="my-3 overflow-x-auto rounded-2xl bg-[#0F172A] dark:bg-[#050711] p-4 text-sm font-mono text-slate-100 border border-slate-700/60 dark:border-white/10" {...props} />,
                                blockquote: ({ node, ...props }: any) => <blockquote className="border-l-4 border-[#0066FF] bg-blue-50/60 dark:bg-blue-950/40 p-3.5 rounded-r-xl my-3 text-slate-800 dark:text-slate-200 text-base sm:text-[17px]" {...props} />,
                                a: ({ node, ...props }: any) => <a className="text-[#0066FF] hover:text-[#002D62] dark:hover:text-[#93C5FD] underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
                                table: ({ node, ...props }: any) => (
                                  <div className="w-full my-3.5 overflow-x-auto [scrollbar-width:thin] rounded-2xl border border-[#E3E9F1] dark:border-slate-800 shadow-2xs">
                                    <table className="min-w-full border-collapse text-xs sm:text-sm text-left" {...props} />
                                  </div>
                                ),
                                thead: ({ node, ...props }: any) => (
                                  <thead className="bg-[#F1F5F9] dark:bg-slate-800/90 text-[#002D62] dark:text-[#60A5FA] border-b border-[#E3E9F1] dark:border-slate-700 font-bold" {...props} />
                                ),
                                th: ({ node, ...props }: any) => (
                                  <th className="p-3 font-bold border-r last:border-r-0 border-[#E3E9F1] dark:border-slate-700 whitespace-nowrap" {...props} />
                                ),
                                td: ({ node, ...props }: any) => (
                                  <td className="p-3 border-t border-r last:border-r-0 border-[#E3E9F1] dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" {...props} />
                                ),
                              }}
                            >
                              {formatLatexMath(cleanVisualText)}
                            </ReactMarkdown>
                          )}

                          {/* Mini action buttons for copying and flagging at the end of response */}
                          <div className="mt-3.5 flex items-center gap-1 text-slate-400 dark:text-slate-500">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  if (navigator.clipboard && navigator.clipboard.writeText) {
                                    await navigator.clipboard.writeText(cleanVisualText || message.text);
                                    addToast('Copied to clipboard', 'success');
                                  } else {
                                    addToast('Copied to clipboard', 'success');
                                  }
                                } catch {
                                  addToast('Copied to clipboard', 'success');
                                }
                              }}
                              className="flex items-center gap-1 rounded-lg p-1.5 text-xs text-slate-400 hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200 transition active:scale-95 cursor-pointer"
                              aria-label="Copy message"
                              title="Copy message"
                            >
                              <CopyIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const reportsRef = dbRef(db, 'reported_content');
                                  await push(reportsRef, {
                                    userId: userProfile.uid,
                                    messageText: message.text,
                                    messageId: message.id,
                                    timestamp: serverTimestamp(),
                                    type: 'ai_chat_response'
                                  });
                                  addToast('Response flagged for review', 'success');
                                } catch (err) {
                                  console.error('Failed to report:', err);
                                  addToast('Failed to report response', 'error');
                                }
                              }}
                              className="flex items-center gap-1 rounded-lg p-1.5 text-xs text-slate-400 hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-rose-500 transition active:scale-95 cursor-pointer"
                              aria-label="Flag message"
                              title="Flag inappropriate content"
                            >
                              <FlagIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {isSending && streamingBotText === null && (
                    <div className="flex justify-start mt-2 mb-2 animate-fade-in">
                      <div className="max-w-[85%] rounded-3xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-black px-4 py-3 shadow-2xs sm:max-w-[75%] rounded-tl-sm flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <TypingIndicator />
                        <div className="flex items-center gap-1 font-semibold text-[#0066FF] dark:text-blue-400">
                          <span>{uploadProgress || 'Thinking'}</span>
                          <span className="inline-block animate-pulse">...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {streamingBotText !== null && (
                    <div className="w-full my-3 px-1 sm:px-2 flex flex-col items-start animate-fade-in">
                      <div className="w-full text-slate-800 dark:text-slate-100 bg-transparent text-[15px] sm:text-base leading-relaxed tracking-normal">
                        {(() => {
                          const { cleanText: cleanStreamingText } = parseMessageSuggestions(streamingBotText);
                          const { cleanText: cleanVisualStreamingText, visualHintText: streamingVisualHintText } = parseVisualHint(cleanStreamingText);
                          const shouldShowStreamingVisualCue = Boolean(streamingVisualHintText) || shouldHighlightForVisual(cleanVisualStreamingText);
                          const text = cleanVisualStreamingText;

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
                            <>
                              {shouldShowStreamingVisualCue && (
                                <div className="mb-3 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                                  Double-tap for a visual
                                </div>
                              )}
                              {hasCompletedPart && (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeKatex]}
                                  components={{
                                    h1: ({ node, ...props }: any) => (
                                      <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] dark:text-white mt-4 mb-2 tracking-tight" {...props} />
                                    ),
                                    h2: ({ node, ...props }: any) => (
                                      <h2 className="text-lg sm:text-xl font-bold text-[#0F172A] dark:text-white mt-3.5 mb-1.5 tracking-tight border-b border-[#E3E9F1] dark:border-slate-800 pb-1" {...props} />
                                    ),
                                    h3: ({ node, ...props }: any) => (
                                      <h3 className="text-base sm:text-lg font-bold text-[#002D62] dark:text-[#60A5FA] mt-3 mb-1" {...props} />
                                    ),
                                    h4: ({ node, ...props }: any) => (
                                      <h4 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-white mt-2.5 mb-1" {...props} />
                                    ),
                                    p: ({ node, ...props }: any) => <p className="mb-3.5 last:mb-0 leading-relaxed text-slate-800 dark:text-slate-100" {...props} />,
                                    ul: ({ node, ...props }: any) => <ul className="mb-3.5 list-disc space-y-1.5 pl-5 text-slate-800 dark:text-slate-100 marker:text-[#0066FF]" {...props} />,
                                    ol: ({ node, ...props }: any) => <ol className="mb-3.5 list-decimal space-y-1.5 pl-5 text-slate-800 dark:text-slate-100 marker:text-[#0066FF] font-medium" {...props} />,
                                    li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
                                    strong: ({ node, ...props }: any) => <strong className="font-bold text-[#0F172A] dark:text-white" {...props} />,
                                    code: ({ node, inline, ...props }: any) =>
                                      inline ? (
                                        <code className="rounded-md bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 text-[0.85em] font-mono text-[#0066FF] dark:text-blue-300 border border-blue-100 dark:border-blue-900/50" {...props} />
                                      ) : (
                                        <code className="block overflow-x-auto rounded-2xl bg-[#0F172A] dark:bg-[#050711] p-4 text-xs font-mono text-slate-100 border border-slate-700/60 dark:border-white/10 my-3" {...props} />
                                      ),
                                    pre: ({ node, ...props }: any) => <pre className="my-3 overflow-x-auto rounded-2xl bg-[#0F172A] dark:bg-[#050711] p-4 text-xs font-mono text-slate-100 border border-slate-700/60 dark:border-white/10" {...props} />,
                                    blockquote: ({ node, ...props }: any) => <blockquote className="border-l-4 border-[#0066FF] bg-blue-50/60 dark:bg-blue-950/40 p-3 rounded-r-xl my-3 text-slate-800 dark:text-slate-200 text-sm" {...props} />,
                                    a: ({ node, ...props }: any) => <a className="text-[#0066FF] hover:text-[#002D62] dark:hover:text-[#93C5FD] underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
                                    table: ({ node, ...props }: any) => (
                                      <div className="w-full my-3.5 overflow-x-auto [scrollbar-width:thin] rounded-2xl border border-[#E3E9F1] dark:border-slate-800 shadow-2xs">
                                        <table className="min-w-full border-collapse text-xs sm:text-sm text-left" {...props} />
                                      </div>
                                    ),
                                    thead: ({ node, ...props }: any) => (
                                      <thead className="bg-[#F1F5F9] dark:bg-slate-800/90 text-[#002D62] dark:text-[#60A5FA] border-b border-[#E3E9F1] dark:border-slate-700 font-bold" {...props} />
                                    ),
                                    th: ({ node, ...props }: any) => (
                                      <th className="p-3 font-bold border-r last:border-r-0 border-[#E3E9F1] dark:border-slate-700 whitespace-nowrap" {...props} />
                                    ),
                                    td: ({ node, ...props }: any) => (
                                      <td className="p-3 border-t border-r last:border-r-0 border-[#E3E9F1] dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200" {...props} />
                                    ),
                                  }}
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
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Scroll anchor handled by container ref */}
                </div>
              )}
            </section>
          </>
        )}

          {/* Integrated AVELUT Input Layout Panel - Fluid Water-Splitting Live Voice Transition */}
          <footer className="fixed bottom-0 left-0 right-0 z-[100] md:relative w-full shrink-0 bg-transparent pb-3 px-3 sm:px-4 md:pb-5 md:px-6 flex justify-center mb-[env(safe-area-inset-bottom,0px)]">
            <div className="w-full max-w-3xl transition-all duration-300">

              {/* Three Suggestion Pills on Top of Message Input Bar */}
              {activeSuggestions.length > 0 && !isLiveVoiceMode && (
                <div className="mb-2.5 w-full flex items-center gap-2 overflow-x-auto py-1 px-1 no-scrollbar animate-fade-in">
                  {activeSuggestions.slice(0, 3).map((suggestion, idx) => (
                    <button
                      key={`sug-bar-${idx}`}
                      type="button"
                      onClick={() => void handleSend(suggestion)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-[#1E242B] border border-slate-200/90 dark:border-slate-700/80 px-3.5 py-1.5 shadow-2xs text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-[#0066FF] hover:text-[#0066FF] dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition active:scale-95 shrink-0 cursor-pointer"
                    >
                      <span className="text-[#0066FF] text-xs">✨</span>
                      <InlineMarkdownText text={suggestion} />
                    </button>
                  ))}
                </div>
              )}
              
              {/* Multi-Image / File Attachment Previews (Pill shaped with thumbnail & remove icon) */}
              {attachments.length > 0 && (
                <div className="mb-2.5 w-full flex items-center gap-2 overflow-x-auto py-1 px-1 no-scrollbar animate-fade-in">
                  {attachments.map((file, idx) => {
                    const isImg = isImageMimeType(file.type, file.name);
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-[#1f2329] border border-slate-200/90 dark:border-white/10 px-2.5 py-1.5 shadow-sm text-xs text-slate-800 dark:text-slate-200 shrink-0"
                      >
                        {isImg ? (
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="w-5 h-5 rounded-full object-cover shrink-0 border border-slate-300 dark:border-white/20"
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
                          aria-label={`Remove ${file.name}`}
                          title="Remove attachment"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Active Student Context Badge Pill */}
              {isContextAware && !isLiveVoiceMode && (
                <div className="mb-2 w-full flex items-center justify-start animate-fade-in">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0066FF]/10 dark:bg-[#0066FF]/20 border border-[#0066FF]/30 px-3 py-1 text-xs font-bold text-[#0066FF] shadow-2xs">
                    <span>🎓 Student Context Active</span>
                    <button
                      type="button"
                      onClick={() => setIsContextAware(false)}
                      className="p-0.5 hover:bg-[#0066FF]/20 rounded-full cursor-pointer ml-0.5"
                      title="Turn off student context"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Fluid Spring Morphing Container (Liquid / Water-Droplet Separation) */}
              <motion.div 
                layout
                transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.8 }}
                className="w-full flex items-center gap-2.5 sm:gap-3"
              >
                
                {/* 1. Main Input Pill */}
                <motion.div
                  layout
                  transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.8 }}
                  className="relative flex-1 min-w-0 bg-white dark:bg-[#212121] rounded-full flex items-center justify-between pl-3.5 pr-2.5 py-1.5 min-h-[56px] sm:min-h-[58px] border border-slate-200/90 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
                >
                  {/* Left: Plus Icon Attachment Button */}
                  <div ref={attachmentMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowAttachmentMenu(prev => !prev)}
                      disabled={isSending}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/20 transition-all active:scale-95 disabled:opacity-40 cursor-pointer ${showAttachmentMenu ? 'bg-slate-200 dark:bg-white/20' : ''}`}
                      aria-label="Upload attachment"
                      title="Upload attachment"
                    >
                      <PlusIcon />
                    </button>

                    {/* Plus Attachment Popup Menu (Camera, Photos, Files, Student Context) */}
                    {showAttachmentMenu && (
                      <div className="absolute bottom-14 left-0 w-60 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50 p-1.5">
                        {/* 1. Camera */}
                        <button
                          type="button"
                          onClick={() => {
                            cameraInputRef.current?.click();
                            setShowAttachmentMenu(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3 cursor-pointer"
                        >
                          <CameraOutlineIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                          <span>Camera</span>
                        </button>

                        {/* 2. Photos / Images */}
                        <button
                          type="button"
                          onClick={() => {
                            imageInputRef.current?.click();
                            setShowAttachmentMenu(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3 cursor-pointer"
                        >
                          <PhotosOutlineIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                          <span>Photos</span>
                        </button>

                        {/* 3. Files */}
                        <button
                          type="button"
                          onClick={() => {
                            fileInputRef.current?.click();
                            setShowAttachmentMenu(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3 cursor-pointer"
                        >
                          <FolderOutlineIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                          <span>Files</span>
                        </button>

                        {/* 4. Student Context Aware Toggle */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsContextAware(prev => !prev);
                            setShowAttachmentMenu(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors flex items-center justify-between border-t border-slate-100 dark:border-white/10 mt-1 pt-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-base">🎓</span>
                            <span>Student Context</span>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            isContextAware 
                              ? 'bg-[#0066FF] text-white' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}>
                            {isContextAware ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Center: Textarea Input */}
                  <div className="flex-1 mx-2 relative flex items-center min-h-[42px]">
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
                      placeholder="Ask Avelut AI"
                      className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-[16px] sm:text-[17px] font-normal leading-relaxed focus:outline-none resize-none py-2 px-1 max-h-[160px] overflow-y-auto"
                      style={{ height: 'auto' }}
                    />
                  </div>

                  {/* Right inside pill (Shown when NOT in Live Voice Mode) */}
                  <AnimatePresence>
                    {!isLiveVoiceMode && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ type: "spring", stiffness: 450, damping: 28 }}
                        className="flex items-center gap-1.5 shrink-0"
                      >
                        {/* Microphone Icon Button */}
                        <button
                          type="button"
                          onClick={toggleListening}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                            isListening 
                              ? 'text-rose-500 bg-rose-50 dark:bg-rose-950/40 animate-pulse' 
                              : 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10'
                          }`}
                          aria-label="Dictate message"
                          title={isListening ? "Listening... click to stop" : "Voice input"}
                        >
                          <MicIcon />
                        </button>

                        {/* Solid Blue Circle Action Button (Waveform when empty, Arrow when typing) */}
                        <button
                          type="button"
                          onClick={() => {
                            if ((inputValue.trim() || attachments.length > 0) && !isSending) {
                              void handleSend();
                            } else if (!inputValue.trim() && !isSending) {
                              startLiveVoiceMode();
                            }
                          }}
                          disabled={isSending}
                          className={`w-10 h-10 rounded-full flex items-center justify-center bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-sm transition-all active:scale-95 cursor-pointer shrink-0 ${
                            isSending ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          aria-label={(inputValue.trim() || attachments.length > 0) ? "Send message" : "Live voice mode"}
                          title={(inputValue.trim() || attachments.length > 0) ? "Send message" : "Live voice mode"}
                        >
                          {(inputValue.trim() || attachments.length > 0) ? (
                            <UpArrowIcon />
                          ) : (
                            <VoiceWaveformIcon />
                          )}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </motion.div>

                {/* 2 & 3: Floating Detached Water-Drop Circles (Only when Live Voice Mode is active) */}
                <AnimatePresence>
                  {isLiveVoiceMode && (
                    <>
                      {/* Detached Circle 1: White Mute/Unmute Mic Button */}
                      <motion.button
                        key="voice-mute-btn"
                        layout
                        initial={{ scale: 0.2, opacity: 0, x: -20 }}
                        animate={{ scale: 1, opacity: 1, x: 0 }}
                        exit={{ scale: 0.2, opacity: 0, x: -20 }}
                        transition={{ type: "spring", stiffness: 450, damping: 26, mass: 0.7 }}
                        type="button"
                        onClick={toggleVoiceMute}
                        title={isVoiceMuted ? "Unmute microphone" : "Mute microphone"}
                        aria-label={isVoiceMuted ? "Unmute microphone" : "Mute microphone"}
                        className={`w-[54px] h-[54px] sm:w-[58px] sm:h-[58px] rounded-full bg-white dark:bg-[#212121] border border-slate-200/90 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] flex items-center justify-center text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer active:scale-95 transition-all shrink-0 ${
                          !isVoiceMuted && isListening ? 'ring-2 ring-blue-500/40 text-blue-600 dark:text-blue-400' : ''
                        }`}
                      >
                        {isVoiceMuted ? (
                          <MicMuteIcon />
                        ) : (
                          <MicIcon />
                        )}
                      </motion.button>

                      {/* Detached Circle 2: Black Solid Close (X) Button */}
                      <motion.button
                        key="voice-close-btn"
                        layout
                        initial={{ scale: 0.2, opacity: 0, x: -32 }}
                        animate={{ scale: 1, opacity: 1, x: 0 }}
                        exit={{ scale: 0.2, opacity: 0, x: -32 }}
                        transition={{ type: "spring", stiffness: 450, damping: 26, mass: 0.7, delay: 0.02 }}
                        type="button"
                        onClick={exitLiveVoiceMode}
                        title="End live voice mode"
                        aria-label="End live voice mode"
                        className="w-[54px] h-[54px] sm:w-[58px] sm:h-[58px] rounded-full bg-black dark:bg-[#111111] border border-black/80 dark:border-white/15 text-white shadow-xl flex items-center justify-center hover:bg-neutral-900 dark:hover:bg-neutral-800 cursor-pointer active:scale-95 transition-all shrink-0"
                      >
                        <CloseXIcon />
                      </motion.button>
                    </>
                  )}
                </AnimatePresence>

              </motion.div>

            </div>
          </footer>
        </main>
      </div>

      {/* Hidden system file pickers (Observing Google Play Storage Access Framework policies) */}
      <input 
        type="file" 
        className="hidden" 
        ref={cameraInputRef} 
        accept="image/*" 
        capture="environment"
        onClick={(e: any) => { e.target.value = null; }}
        onChange={handleAttachmentChange} 
      />
      <input 
        type="file" 
        className="hidden" 
        ref={imageInputRef} 
        accept="image/*" 
        multiple
        onClick={(e: any) => { e.target.value = null; }}
        onChange={handleAttachmentChange} 
      />
      <input 
        type="file" 
        className="hidden" 
        ref={fileInputRef} 
        accept=".pdf,.doc,.docx,.txt,.csv,.json,.epub,application/pdf" 
        multiple
        onClick={(e: any) => { e.target.value = null; }}
        onChange={handleAttachmentChange} 
      />
      <input 
        type="file" 
        className="hidden" 
        ref={attachmentInputRef} 
        onClick={(e: any) => { e.target.value = null; }}
        onChange={handleAttachmentChange} 
        multiple 
      />

      <LimitExceededModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        userProfile={userProfile}
        appSettings={appSettings}
        cost={limitModalData.cost}
        balance={limitModalData.balance}
        addToast={addToast}
        onSuccessPurchase={() => {}}
      />

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}
