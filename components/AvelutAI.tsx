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
import { LimitExceededModal } from './LimitExceededModal';
import { checkAICredits, deductAICredits, getFeatureCost, getFeatureModel } from '../utils/usage';
import {
  getLocalConversations,
  getLocalMessages,
  saveLocalMessage,
  saveLocalConversation,
  deleteLocalConversation,
  renameLocalConversation,
} from '../services/chatStorageService';
import { getCachedAIResponse, setCachedAIResponse } from '../services/aiCacheService';
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

const InlineMarkdownText = React.memo<{ text: string; className?: string }>(({ text, className = '' }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      p: ({ node, ...props }: any) => <span className={`whitespace-normal ${className}`} {...props} />,
      strong: ({ node, ...props }: any) => <strong className="font-semibold text-emerald-600 dark:text-emerald-400" {...props} />,
      em: ({ node, ...props }: any) => <em className="italic" {...props} />,
      code: ({ node, inline, ...props }: any) =>
        inline ? (
          <code className="rounded bg-emerald-100 dark:bg-emerald-950/50 px-1 py-0.5 text-[0.8em] font-mono text-emerald-800 dark:text-emerald-300" {...props} />
        ) : (
          <code className="block overflow-x-auto rounded-2xl bg-slate-950 p-3 text-sm text-white" {...props} />
        ),
      a: ({ node, ...props }: any) => <a className="underline decoration-emerald-400 underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />,
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

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    resolve(result.includes(',') ? result.split(',')[1] : result);
  };
  reader.onerror = () => reject(new Error(`Failed to read attachment: ${reader.error?.message || 'Unknown error'}`));
  reader.readAsDataURL(file);
});

const uploadChatAttachment = (
  userId: string,
  conversationId: string,
  file: File,
  index: number,
  onProgress?: (progress: number) => void
): Promise<AssistantAttachment> => {
  return new Promise((resolve, reject) => {
    const attachmentToken = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}_${index}`;
    const safeName = sanitizeFileName(file.name);
    const path = `assistant_attachments/${userId}/${conversationId}/${attachmentToken}_${safeName}`;
    const fileRef = storageRef(storage, path);
    const uploadTask = uploadBytesResumable(fileRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes > 0 ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 : 0;
        if (onProgress) {
          onProgress(Math.round(progress));
        }
      },
      (error) => {
        reject(error);
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            id: attachmentToken,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            url,
            isImage: isImageMimeType(file.type, file.name),
          });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
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

export default function AvelutAI({ userProfile, onNavigate, setCustomHeaderConfig }: AvelutAIProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
  const recognitionRef = useRef<any>(null);
  const liveClientRef = useRef<GeminiLiveVoiceClient | null>(null);

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
        setMessages(localMsgs.map(m => ({
          id: m.id,
          sender: mapSender(m.sender),
          text: m.text,
          timestamp: m.timestamp,
          attachments: m.attachments_json ? JSON.parse(m.attachments_json) : undefined,
          image_url: m.image_url || undefined,
        })));
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
        setMessages(nextMessages);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [activeHistoryId]);

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

  useEffect(() => {
    if (setCustomHeaderConfig) {
      setCustomHeaderConfig({
        leftActions: (
          <div className="flex items-center gap-3">
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
            <div className="flex flex-col justify-center">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">AVELUT AI</h1>
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
            <PlusIcon />
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
  }, [setCustomHeaderConfig, conversationSummary, onNavigate]);

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
    const prompt = (messageText || inputValue).trim();
    const filesToSend = overrideFiles !== undefined ? overrideFiles : (messageText ? [] : [...attachments]);
    if ((!prompt && filesToSend.length === 0) || isSending) return;

    // Check message limits
    const featureCost = getFeatureCost('chat_interaction', appSettings);
    const limitCheck = checkAICredits(userProfile, featureCost, appSettings);
    if (!limitCheck.allowed) {
      setLimitModalData({
        balance: limitCheck.balance,
        cost: limitCheck.cost
      });
      setShowLimitModal(true);
      return;
    }

    const primaryAttachment = filesToSend[0] || null;
    const userText = prompt || getHistoryFallbackTitle(prompt, primaryAttachment);

    // Create local optimistic attachments to render in the user's bubble immediately
    const optimisticAttachments = filesToSend.map((file, index) => ({
      id: `optimistic-${Date.now()}-${index}`,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      url: URL.createObjectURL(file),
      isImage: isImageMimeType(file.type, file.name),
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

        await set(newConversationRef, {
          title: 'New Chat',
          created_at: now,
          last_updated_at: now,
        });
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
        setUploadProgress(`Uploading ${prefix}${file.name} (0%)...`);
        setStatusText(`Uploading ${prefix}${file.name} (0%)...`);

        const storedAttachment = await uploadChatAttachment(
          userProfile.uid,
          conversationId,
          file,
          index,
          (percent) => {
            const msg = `Uploading ${prefix}${file.name} (${percent}%)...`;
            setUploadProgress(msg);
            setStatusText(msg);
          }
        );
        storedAttachments.push(storedAttachment);

        if (isSupportedInlineMimeType(mimeType, file.name)) {
          const data = await fileToBase64(file);
          attachmentParts.push({
            inlineData: {
              data,
              mimeType,
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
            const data = await fileToBase64(file);
            attachmentParts.push({
              inlineData: { data, mimeType }
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
            const data = await fileToBase64(file);
            attachmentParts.push({
              inlineData: { data, mimeType }
            });
          }
        } else {
          const data = await fileToBase64(file);
          attachmentParts.push({
            inlineData: {
              data,
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

      const storedUserMessage = {
        text: userText,
        sender: 'user',
        timestamp: serverTimestamp(),
        attachments: storedAttachments,
      };
      await push(messagesRef, storedUserMessage);

      const assistantMsgId = createMessageId();
      const initialAssistantMessage: AssistantMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        text: '',
        timestamp: Date.now(),
      };
      setMessages([...nextMessages, initialAssistantMessage]);

      let responseText = '';
      const aiResult = await attemptApiCall(async () => {
        setStreamingBotText('');
        // Optimize payload: preserve system instructions but only send last 5 messages for context
        const contextMessages = nextMessages.slice(-5);

        // 💡 RAG: Retrieve relevant textbook and department course context from Pinecone (utilizes SQLite semantic cache)
        let retrievedContext = "";
        try {
          const { searchPinecone } = await import('../utils/pinecone');
          const searchResult = await searchPinecone(prompt, userProfile.department_id || undefined, 4, appSettings);
          
          if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
            retrievedContext = "\n\nRELEVANT DEPARTMENT & COURSE KNOWLEDGE (PINECONE RETRIEVAL):\n" +
              searchResult.results.map((r: any) => `[From ${r.course_name || 'Department Curriculum'}]: ${r.text}`).join('\n\n');
          }
        } catch (searchErr) {
          console.warn("Pinecone RAG retrieval note:", searchErr);
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

        const responseStream = await ai.models.generateContentStream({
          model: geminiModel || 'gemini-3.1-flash-lite',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: [
                    'You are AVELUT AI, an advanced, highly engaging, empathetic personal academic tutor.',
                    'CRITICAL LAYERED TUTORING & ENGAGEMENT PROTOCOL:',
                    '1. FIRST ANSWER IS BITE-SIZED & PUNCHY: Keep your direct answer concise (2-4 clear sentences max). Do NOT overwhelm the student with long walls of text.',
                    '2. CLEAR LATEX & KATEX FORMATTING: Whenever formulas, equations, or math symbols appear, format them cleanly using inline $...$ (e.g. $x^2 + y^2 = r^2$) and display $$...$$ (e.g. $$\\int f(x)dx$$).',
                    '3. GROUNDED IN DEPARTMENT CURRICULUM: Use the provided COURSE CONTEXT and PINECONE RETRIEVAL to ground all explanations in the student\'s department syllabus.',
                    '4. STEP-BY-STEP TUTORING OFFER: At the end of the initial concise answer, warmly ask the student if they would like a bite-sized step-by-step breakdown or interactive tutorial.',
                    '5. MULTI-IMAGE ANALYSIS: If the student attached multiple images (up to 5), synthesize information across all images to give a coherent explanation.',
                    '6. If the concept would benefit from a visual diagram or graph, add: [VisualHint: Double tap this message to view a visual explanation].',
                    '7. INTERACTIVE SUGGESTION PILLS: At the absolute end of every response, provide 3 to 4 expected follow-up responses formatted exactly on a new line as: [Suggestions: Continue | Next step | Explain with example | I don\'t understand]',
                    tutorialInstructions,
                    courseContext ? `COURSE CONTEXT:\n${courseContext}` : '',
                    retrievedContext,
                    storedAttachments?.length ? `ATTACHMENTS: ${storedAttachments.map(i => i.name).join(', ')}` : '',
                    '',
                    `Conversation so far:\n${contextMessages.map(msg => `${msg.sender.toUpperCase()}: ${msg.text}`).join('\n\n')}`,
                  ].filter(Boolean).join('\n'),
                },
                ...attachmentParts,
              ],
            },
          ],
        });

        try {
          for await (const chunk of responseStream) {
            const chunkText = getResponseText(chunk);
            responseText += chunkText;
            setStreamingBotText(responseText);
          }
        } catch (streamError) {
          console.error('Error during response streaming:', streamError);
          throw streamError;
        }

        if (!responseText) {
          throw new Error('Avelut AI returned an empty response.');
        }

        return responseText.trim();
      });

      if (!aiResult.success) {
        console.error('Avelut assistant error:', aiResult.message);
        setStatusText('Unable to respond right now.');
        setMessages(prev => [
            ...prev,
            {
              id: createMessageId(),
              sender: 'assistant',
              text: 'Sorry, I ran into a problem generating that reply. Please try again.',
              timestamp: Date.now(),
            },
          ]);
        return;
      }

      const finalResponseText = aiResult.data || 'I could not generate a response right now. Please try again.';
      
      // Deduct credits
      deductAICredits(userProfile.uid, featureCost, 'AI Assistant Chat', appSettings).catch(console.error);

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
        },
      ]);
      setStatusText('Unable to respond right now.');
    } finally {
      setIsSending(false);
      setStreamingBotText(null);
      setUploadProgress(null);
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
    <div className="h-full min-h-0 overflow-hidden bg-slate-50 dark:bg-black pt-0">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl overflow-hidden bg-white dark:bg-black/90 backdrop-blur md:rounded-[2rem] md:border md:border-slate-200 dark:border-white/10 md:shadow-[0_20px_80px_rgba(0,0,0,0.08)]">
        
        {/* Modern Replica Sidebar Drawer (Exact layout from uploaded image) */}
        <aside
          className={`${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } fixed inset-y-0 left-0 z-50 w-[84vw] max-w-[310px] border-r border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#121212] flex flex-col shadow-2xl transition-transform duration-300 md:static md:z-auto md:w-76 md:translate-x-0 md:shadow-none`}
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

          {/* Top Half: Quick Action Navigation Items (Exact styling from uploaded image) */}
          <div className="px-3 py-2 space-y-1">
            <button
              type="button"
              onClick={() => {
                onNavigate?.('study_guide');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-[15px] font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-98 text-left cursor-pointer"
            >
              <LibraryDrawerIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              <span>Study Guide</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigate?.('exam');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-[15px] font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-98 text-left cursor-pointer"
            >
              <ProjectsDrawerIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              <span>Assessments</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigate?.('messenger');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-[15px] font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-98 text-left cursor-pointer"
            >
              <MessengerDrawerIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              <span>Messenger</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigate?.('leaderboard');
                setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-[15px] font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-98 text-left cursor-pointer"
            >
              <PluginsDrawerIcon className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              <span>Leaderboard</span>
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
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
            aria-label="Close menu overlay"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-black">

          {isLiveVoiceMode ? (
            /* Live Voice Immersive Mode (Exact Replica of ChatGPT Voice Moon UI) */
            <div className="relative flex-1 flex flex-col justify-between w-full h-full p-4 sm:p-6 overflow-hidden animate-fade-in">
              {/* Top Floating Header Controls */}
              <div className="w-full flex items-center justify-between z-20 pt-1">
                {/* Top Left Menu Button */}
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="w-11 h-11 rounded-full bg-white dark:bg-[#1E1E1E] shadow-sm border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition active:scale-95 cursor-pointer"
                  aria-label="Open menu"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
                    <line x1="4" y1="9" x2="20" y2="9" />
                    <line x1="4" y1="15" x2="14" y2="15" />
                  </svg>
                </button>

                {/* Top Right Equalizer Settings Button */}
                <button
                  type="button"
                  onClick={() => addToast("Multimodal 2-Way Gemini Live Audio streaming active", "info")}
                  className="w-11 h-11 rounded-full bg-white dark:bg-[#1E1E1E] shadow-sm border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition active:scale-95 cursor-pointer"
                  aria-label="Voice settings"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <circle cx="15" cy="6" r="2.5" fill="currentColor" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                    <circle cx="9" cy="18" r="2.5" fill="currentColor" />
                  </svg>
                </button>
              </div>

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
            <section ref={sectionRef} className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[100px] md:pb-5 sm:px-6 scroll-smooth">
              {messages.length === 0 ? (
                <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-6 py-16 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-600 text-white shadow-lg">
                    <ChatIcon className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Ask AVELUT anything</h2>
                    <p className="mt-2 max-w-xl text-slate-500 dark:text-gray-400">
                      Get step-by-step answers with clean LaTeX for equations, formulas, and proofs.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
                  {messages.map((message, idx) => {
                    // If this is the last bot message and it's redundant with streaming, hide it temporarily
                    if (streamingBotText !== null &&
                        message.sender === 'assistant' &&
                        idx === messages.length - 1 &&
                        message.text.length >= (streamingBotText?.length || 0)) {
                      return null;
                    }

                    const { cleanText, suggestions } = parseMessageSuggestions(message.text || '');
                    const { cleanText: cleanVisualText, visualHintText } = parseVisualHint(cleanText);
                    const shouldShowVisualCue = message.sender === 'assistant' && (Boolean(visualHintText) || shouldHighlightForVisual(cleanVisualText));

                    return (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`px-4 py-3 shadow-sm ${
                          message.sender === 'user'
                            ? 'max-w-[76%] rounded-3xl bg-emerald-600 text-white'
                            : `w-[90%] max-w-[90%] rounded-3xl border border-slate-200 dark:border-white/20 bg-white dark:bg-[#0b1120] text-slate-800 dark:text-slate-200 ${generatingMessageIds.has(message.id) || viewingImageIds.has(message.id) ? 'ring-1 ring-amber-200' : ''}`
                        }`}
                        onDoubleClick={() => {
                          if (message.sender === 'assistant') {
                            void handleMessageDoubleTap(message);
                          }
                        }}
                        onTouchEnd={(event) => {
                          if (message.sender !== 'assistant') return;
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
                        {message.attachments && message.attachments.length > 0 && (
                          <div className={`mb-3 grid gap-2 ${message.attachments.some(item => item.isImage) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                            {message.attachments.map(attachmentItem => (
                              <a
                                key={attachmentItem.id}
                                href={attachmentItem.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`overflow-hidden rounded-2xl border ${message.sender === 'user' ? 'border-white/20 bg-white dark:bg-black/10 text-slate-900 dark:text-white' : 'border-slate-200 dark:border-white/10 bg-slate-100 text-slate-600'}`}
                              >
                                {attachmentItem.isImage ? (
                                  <img src={attachmentItem.url} alt={attachmentItem.name} className="max-h-56 w-full object-cover" />
                                ) : (
                                  <div className="flex items-center gap-3 px-4 py-3">
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${message.sender === 'user' ? 'bg-white dark:bg-black/15' : 'bg-slate-50 dark:bg-black'} text-[10px] font-black uppercase`}>
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
                        {message.sender === 'assistant' ? (
                          <>
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
                                  p: ({ node, ...props }: any) => <p className="mb-3 last:mb-0 leading-relaxed text-slate-800 dark:text-slate-200" {...props} />,
                                  ul: ({ node, ...props }: any) => <ul className="mb-3 list-disc space-y-1 pl-5 text-slate-800 dark:text-slate-200" {...props} />,
                                  ol: ({ node, ...props }: any) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-slate-800 dark:text-slate-200" {...props} />,
                                  li: ({ node, ...props }: any) => <li className="leading-relaxed text-slate-800 dark:text-slate-200" {...props} />,
                                  strong: ({ node, ...props }: any) => <strong className="font-semibold text-emerald-400" {...props} />,
                                  pre: ({ node, ...props }: any) => <pre className="mb-3 overflow-x-auto rounded-2xl bg-[#050711] p-4 text-sm text-slate-900 dark:text-white border border-slate-200 dark:border-white/10" {...props} />,
                                }}
                              >
                                {formatLatexMath(cleanVisualText)}
                              </ReactMarkdown>
                            )}
                            {suggestions.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {suggestions.map((suggestion, index) => (
                                  <button
                                    key={`${suggestion}-${index}`}
                                    type="button"
                                    onClick={() => void handleSend(suggestion)}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                  >
                                    <InlineMarkdownText text={suggestion} />
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="mt-4 flex justify-end border-t border-slate-200 dark:border-white/10 pt-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                      await navigator.clipboard.writeText(message.text);
                                      addToast('Copied to clipboard', 'success');
                                    } else {
                                      addToast('Copied to clipboard', 'success');
                                    }
                                  } catch (err) {
                                    addToast('Copied to clipboard', 'success');
                                  }
                                }}
                                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 transition hover:bg-slate-100 hover:text-emerald-400 active:scale-95"
                                aria-label="Copy message"
                                title="Copy message"
                              >
                                <CopyIcon className="h-3.5 w-3.5" />
                                Copy
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
                                    addToast('Response reported to moderators', 'success');
                                  } catch (err) {
                                    console.error('Failed to report:', err);
                                    addToast('Failed to report response', 'error');
                                  }
                                }}
                                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 transition hover:bg-slate-100 hover:text-red-400 active:scale-95 ml-2"
                                aria-label="Report message"
                                title="Report inappropriate content"
                              >
                                <FlagIcon className="h-3.5 w-3.5" />
                                Report
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap leading-relaxed">{cleanText}</p>
                        )}
                      </div>
                    </div>
                  ); })}

                  {isSending && streamingBotText === null && (
                    <div className="flex justify-start mt-2 mb-2">
                      {uploadProgress ? (
                        <div className="max-w-[85%] rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black px-4 py-3 shadow-sm sm:max-w-[75%] rounded-tl-sm flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span>{uploadProgress}</span>
                        </div>
                      ) : (
                        <TypingIndicator />
                      )}
                    </div>
                  )}

                  {streamingBotText !== null && (
                    <div className="flex justify-start">
                      <div className="w-[90%] max-w-[90%] rounded-3xl border border-slate-200 dark:border-white/20 bg-white dark:bg-[#0b1120] text-slate-800 dark:text-slate-200 px-4 py-3 shadow-sm">
                        {(() => {
                          const { cleanText: cleanStreamingText, suggestions: streamingSuggestions } = parseMessageSuggestions(streamingBotText);
                          const { cleanText: cleanVisualStreamingText, visualHintText: streamingVisualHintText } = parseVisualHint(cleanStreamingText);
                          const shouldShowStreamingVisualCue = Boolean(streamingVisualHintText) || shouldHighlightForVisual(cleanVisualStreamingText);
                          return (
                            <>
                              {shouldShowStreamingVisualCue && (
                                <div className="mb-3 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                                  Double-tap for a visual
                                </div>
                              )}
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={{
                                  p: ({ node, ...props }: any) => <p className="mb-3 last:mb-0 leading-relaxed text-slate-800 dark:text-slate-200" {...props} />,
                                  ul: ({ node, ...props }: any) => <ul className="mb-3 list-disc space-y-1 pl-5 text-slate-800 dark:text-slate-200" {...props} />,
                                  ol: ({ node, ...props }: any) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-slate-800 dark:text-slate-200" {...props} />,
                                  li: ({ node, ...props }: any) => <li className="leading-relaxed text-slate-800 dark:text-slate-200" {...props} />,
                                  strong: ({ node, ...props }: any) => <strong className="font-semibold text-emerald-400" {...props} />,
                                  pre: ({ node, ...props }: any) => <pre className="mb-3 overflow-x-auto rounded-2xl bg-[#050711] p-4 text-sm text-slate-900 dark:text-white border border-slate-200 dark:border-white/10" {...props} />,
                                }}
                              >
                                {formatLatexMath(cleanVisualStreamingText)}
                              </ReactMarkdown>
                              {streamingSuggestions.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {streamingSuggestions.map((suggestion, index) => (
                                    <button
                                      key={`${suggestion}-${index}`}
                                      type="button"
                                      onClick={() => void handleSend(suggestion)}
                                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                    >
                                      <InlineMarkdownText text={suggestion} />
                                    </button>
                                  ))}
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
                  {/* Left: Plus Icon Button */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                      disabled={isSending}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 transition-all active:scale-95 disabled:opacity-40 cursor-pointer ${showAttachmentMenu ? 'bg-slate-100 dark:bg-white/10' : ''}`}
                      aria-label="Upload attachment"
                      title="Upload attachment"
                    >
                      <PlusIcon />
                    </button>

                    {/* Plus Attachment Popup Menu (Camera, Photos, Files) */}
                    {showAttachmentMenu && (
                      <div className="absolute bottom-14 left-0 w-56 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50 p-1.5">
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
