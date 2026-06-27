import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { readCachedJson, writeCachedJson } from '../utils/cache';
import type { UserProfile } from '../types';
import { useToast } from '../hooks/useToast';
import { MessengerSkeleton } from './Skeleton';
import ReactMarkdown from 'react-markdown';
import { Avatar } from './Avatar';
import { VerificationBadge } from './VerificationBadge';
import { StreakBadge } from './StreakBadge';
import { db, storage, auth, onAuthStateChanged, type FirebaseUser } from '../firebase';
import { ref as dbRef, onValue, off, set, push, update, onDisconnect, get, remove, serverTimestamp as firebaseServerTimestamp, query, limitToLast, increment } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { playBubbleSound, playReceiveSound } from '../utils/sound';
import { useTheme } from '../contexts/ThemeContext';
import { Trash2, Send, Mic, FileText, Image as ImageIcon, Sticker } from 'lucide-react';

const REACTION_EMOJIS = ['🔥', '😂', '😍', '👏', '😮', '😭', '👍', '❤️'];

// ================= REPLICA ICONS =================

const DoubleCheckIcon = ({ color = "#8696a0" }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12l5 5L20 4M7 12l5 5L20 7" />
  </svg>
);

const AttachmentIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#6C757D] dark:text-gray-400">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#6C757D] dark:text-gray-400">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-red-500">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#6C757D] dark:text-gray-400">
    {locked ? (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ) : (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </>
    )}
  </svg>
);

const formatLastSeen = (value?: number) => {
  if (!value) return 'Last seen recently';
  const diffMs = Date.now() - value;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Last seen just now';
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;
  if (diffDays < 7) return `Last seen ${diffDays}d ago`;
  return `Last seen ${new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
};

const getUnreadCount = (chat: any) => Number(chat?.unreadCount || 0);

const getLastMessagePreview = (chat: any) => {
  const text = chat?.last_message?.text;
  if (typeof text === 'string' && text.trim()) return text.trim();
  return 'New message';
};

const getLastMessageSenderId = (chat: any) => chat?.last_message?.senderId || chat?.last_message?.sender_id || '';

const createFallbackChatUser = (uid = ''): UserProfile => ({
  uid,
  display_name: 'Unknown user',
  photo_url: '',
  department_id: '',
  level: '',
  current_streak: 0,
  last_activity_date: Date.now(),
  notifications_enabled: false,
});

const MESSENGER_CACHE_VERSION = 'v1';

const getMessengerCacheKey = (uid: string, suffix: string) => `avelut_messenger_${MESSENGER_CACHE_VERSION}_${uid}_${suffix}`;

// =======================================================
// FUNCTIONAL VOICE NOTE PLAYER COMPONENT
// =======================================================

const VoiceNotePlayer: React.FC<{ src: string; isMe: boolean; isUploading?: boolean }> = ({ src, isMe, isUploading = false }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (isUploading || !src || typeof src !== 'string') return;
    const audio = new Audio(src);
    audioRef.current = audio;

    const setAudioData = () => setDuration(audio.duration || 0);
    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const setAudioEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', setAudioEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', setAudioEnded);
    };
  }, [src, isUploading]);

  const togglePlay = () => {
    if (isUploading || !audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => console.error("Audio playback failed:", err));
    }
    setIsPlaying(!isPlaying);
  };

  const handleSpeedChange = () => {
    if (isUploading || !audioRef.current) return;
    let nextRate = 1;
    if (playbackRate === 1) nextRate = 1.5;
    else if (playbackRate === 1.5) nextRate = 2;
    audioRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 w-full min-w-[220px] sm:min-w-[260px] max-w-full py-1 select-none">
      <button
        type="button"
        onClick={togglePlay}
        disabled={isUploading}
        className={`w-9 h-9 flex items-center justify-center rounded-full transition shrink-0 ${isMe ? 'bg-white dark:bg-black/20 text-white hover:bg-white dark:bg-black/30' : 'bg-[#F8F9FA] dark:bg-black text-[#486380] hover:bg-[#E9ECEF]'
          } ${isUploading ? 'cursor-not-allowed' : ''}`}
      >
        {isUploading ? (
          <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : isPlaying ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1.5 justify-center pr-1 min-w-0">
        <div className="w-full flex items-center gap-[2px] h-6 relative">
          {[35, 60, 45, 75, 30, 55, 70, 40, 65, 50, 80, 35, 60, 45, 70, 40, 55, 30].map((barHeight, idx, arr) => {
            const barProgress = (idx / arr.length) * 100;
            const isPlayed = progressPercent >= barProgress;
            return (
              <div
                key={idx}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${barHeight}%`,
                  backgroundColor: isUploading
                    ? (isMe ? 'rgba(255,255,255,0.2)' : '#E9ECEF')
                    : isPlayed
                      ? (isMe ? '#FFFFFF' : '#009EE2')
                      : (isMe ? 'rgba(255,255,255,0.3)' : '#E9ECEF')
                }}
              />
            );
          })}
        </div>

        <div className={`flex justify-between items-center text-[11px] font-medium ${isMe ? 'text-white/80' : 'text-[#6C757D] dark:text-gray-400'}`}>
          <span>{isUploading ? "Uploading..." : formatTime(isPlaying ? currentTime : duration)}</span>
          <button
            type="button"
            onClick={handleSpeedChange}
            disabled={isUploading}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${isMe ? 'border-white/30 hover:bg-white dark:bg-black/10' : 'border-[#E9ECEF] dark:border-white/10 hover:bg-neutral-100'
              } ${isUploading ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};

// =======================================================
// FLOATING ZOLA THEME INPUT COMPONENT
// =======================================================

interface AvelutInputProps {
  onSend: (text: string) => void;
  startRecording: (e: any) => Promise<void>;
  handleMove: (e: React.MouseEvent | React.TouchEvent) => void;
  stopRecording: (shouldSave: boolean) => void;
  isRecording: boolean;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  recordDuration: number;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  onTyping?: () => void;
}

const AvelutMessageInput: React.FC<AvelutInputProps> = ({
  onSend,
  startRecording,
  handleMove,
  stopRecording,
  isRecording,
  isLocked,
  setIsLocked,
  recordDuration,
  onFileSelect,
  onImageSelect,
  disabled = false,
  onTyping
}) => {
  const themeColor = '#0A101F'; // navy blue

  const [message, setMessage] = useState("");
  const [showTrashAnimation, setShowTrashAnimation] = useState(false);
  const [showStickerPopup, setShowStickerPopup] = useState(false);

  const handleStickerClick = () => {
    setShowStickerPopup(true);
    setTimeout(() => setShowStickerPopup(false), 3000);
  };

  const [startY, setStartY] = useState(0);
  const [startX, setStartX] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleVoicePress = (e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked || disabled) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setStartX(clientX);
    setStartY(clientY);
    setCurrentX(clientX);
    setCurrentY(clientY);
    setIsSwiping(true);
    startRecording(e);
  };

  const handleVoiceMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isRecording || isLocked || disabled) return;
    handleMove(e);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setCurrentX(clientX);
    setCurrentY(clientY);

    const deltaY = clientY - startY;
    const deltaX = clientX - startX;
    if (deltaY < -80) {
      setIsLocked(true);
      setIsSwiping(false);
    }
    if (deltaX < -110) {
      discardVoice();
    }
  };

  const handleVoiceRelease = () => {
    if (!isSwiping || disabled) return;
    setIsSwiping(false);
    if (!isLocked) stopRecording(true);
  };

  const executeTextSend = () => {
    if (message.trim() && !disabled) {
      onSend(message);
      setMessage("");
    }
  };

  const discardVoice = () => {
    setShowTrashAnimation(true);
    setIsSwiping(false);
    stopRecording(false);
    setTimeout(() => setShowTrashAnimation(false), 1000);
  };

  const hasText = message.trim().length > 0;
  const swipeDeltaY = isSwiping ? Math.min(0, Math.max(-100, currentY - startY)) : 0;
  const swipeDeltaX = isSwiping ? Math.min(0, Math.max(-110, currentX - startX)) : 0;

  return (
    <div className={`w-full relative select-none z-40 bg-[#0A101F] pb-2 pt-2 md:w-full md:mx-auto ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <input type="file" ref={fileInputRef} onChange={onFileSelect} className="hidden" multiple accept="*/*" />
      <input type="file" ref={imageInputRef} onChange={onImageSelect} className="hidden" multiple accept="image/*" />

      {isRecording && !isLocked && (
        <div
          className="absolute right-[19px] bottom-[70px] w-[46px] h-[130px] bg-white dark:bg-black rounded-full flex flex-col items-center justify-start py-4 gap-3 shadow-md z-20"
          style={{ transform: `translateY(${Math.max(-40, swipeDeltaY * 0.15)}px)` }}
        >
          <div className="flex items-center justify-center text-slate-500 dark:text-gray-400" style={{ transform: `translateY(${Math.max(-40, swipeDeltaY * 0.5)}px)` }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 10v-3.5a6.5 6.5 0 0 0-13 0V10H4v11h16V10h-2zm-10-3.5a4.5 4.5 0 0 1 9 0V10H8V6.5z"/></svg>
          </div>
          <div className="text-slate-400 mt-2 animate-bounce">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </div>
        </div>
      )}

      <div className="w-full flex items-end gap-2 relative">
        {!isRecording && !isLocked && (
          <div className="flex-1 h-[52px] bg-[#121A2F] border border-white/10 rounded-full flex items-center px-1 shadow-sm transition-all focus-within:ring-2 focus-within:ring-[#009EE2]/20 focus-within:border-[#009EE2]">
            <div className="relative flex items-center h-full">
              <button type="button" onClick={handleStickerClick} className="hover:opacity-85 transition active:scale-90 flex items-center justify-center w-11 h-full text-[#A0ABC0]">
                 <Sticker className="w-6 h-6" />
              </button>
              {showStickerPopup && (
                <div className="absolute -top-10 left-2 bg-white text-black text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap animate-fade-in z-50">
                  Coming soon
                  <div className="absolute -bottom-1 left-4 w-2 h-2 bg-white rotate-45"></div>
                </div>
              )}
            </div>
            <div className="flex-1 h-full flex items-center min-w-0">
              <input
                type="text"
                value={message}
                onChange={(e) => { setMessage(e.target.value); onTyping?.(); }}
                onKeyDown={(e) => e.key === 'Enter' && executeTextSend()}
                placeholder="Message"
                className="w-full h-full bg-transparent text-[17px] text-white placeholder-[#80868B] outline-none border-none focus:ring-0 pl-1 pr-2"
              />
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="hover:opacity-85 transition active:scale-90 flex items-center justify-center w-10 h-full text-[#A0ABC0]">
              <FileText className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => imageInputRef.current?.click()} className="hover:opacity-85 transition active:scale-90 flex items-center justify-center w-11 h-full pr-1 text-[#A0ABC0]">
              <ImageIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {isRecording && !isLocked && (
          <div className="flex-1 h-[52px] bg-[#121A2F] rounded-full flex items-center shadow-sm relative overflow-hidden">
             <div className="flex items-center h-full w-full">
                <div className="pl-5 w-20 text-[18px] text-white tabular-nums font-normal">
                   {formatTime(recordDuration)}
                </div>
                <div className="flex-1 flex items-center justify-end pr-14 z-10 transition-transform duration-75" style={{ transform: `translateX(${swipeDeltaX * 0.8}px)` }}>
                  <span className="text-[15px] font-normal text-[#A0ABC0] flex items-center gap-1.5">
                    <span className="inline-block font-bold text-lg text-slate-400">&lt;</span> Slide to cancel
                  </span>
                </div>
             </div>
             <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-[#121A2F]/40 to-transparent w-24 pointer-events-none" />
          </div>
        )}

        {isLocked && (
            <div className="flex-1 bg-[#121A2F] rounded-3xl overflow-hidden flex flex-col justify-center py-2 px-2 h-[86px] shadow-sm relative border border-white/10">
               <div className="flex items-center justify-between mb-4 px-3 w-full">
                  <span className="text-[17px] text-white tabular-nums font-normal">{formatTime(recordDuration)}</span>
                  <div className="flex-1 mx-3 flex items-center gap-[3px]">
                      {[...Array(24)].map((_, i) => (
                          <div key={i} className="w-[3px] rounded-full bg-[#009EE2] animate-pulse" style={{ height: `${Math.max(4, Math.random() * 16)}px`, animationDelay: `${i * 0.05}s` }} />
                      ))}
                  </div>
               </div>
               <div className="flex items-center justify-between px-3 w-full">
                  <button onClick={discardVoice} className="w-7 h-7 flex items-center justify-center text-[#A0ABC0] active:scale-90 transition-transform">
                     <Trash2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => stopRecording(true)} className="w-8 h-8 rounded-full bg-[#009EE2] text-white flex items-center justify-center hover:scale-105 transition-transform">
                     <Send className="w-4 h-4 ml-1" />
                  </button>
               </div>
            </div>
        )}

        <div className={`shrink-0 ${isLocked ? 'hidden' : ''}`} style={{ transform: isSwiping ? `translate(${swipeDeltaX * 0.2}px, ${swipeDeltaY * 0.5}px)` : 'none', transition: isSwiping ? 'none' : 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
          {hasText ? (
            <button type="button" onClick={executeTextSend} className="w-[50px] h-[50px] text-white rounded-full flex items-center justify-center shadow-md transition-all hover:brightness-95 active:scale-95 duration-100 bg-[#009EE2]">
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onMouseDown={handleVoicePress}
              onTouchStart={handleVoicePress}
              onMouseMove={handleVoiceMove}
              onTouchMove={handleVoiceMove}
              onMouseUp={handleVoiceRelease}
              onMouseLeave={handleVoiceRelease}
              onTouchEnd={handleVoiceRelease}
              onTouchCancel={handleVoiceRelease}
              className={`w-[50px] h-[50px] rounded-full flex items-center justify-center shadow-md transition-all duration-100 outline-none select-none ${isRecording ? 'bg-red-500 text-white scale-110' : 'bg-[#009EE2] text-white hover:brightness-95 active:scale-95'}`}
            >
              <Mic className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MAIN UNIFORM LIGHT THEME MESSENGER
// ==========================================

export const Messenger: React.FC<{ userProfile: UserProfile; initialChatId?: string | null; onNavigate?: (tab: string) => void; setCustomHeaderConfig?: (config: any) => void }> = ({ userProfile, initialChatId = null, onNavigate, setCustomHeaderConfig }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [activeChat, setActiveChat] = useState<{ chatId: string, otherUser: UserProfile } | null>(null);
  const [chats, setChats] = useState<any[]>(() => readCachedJson<any[]>(getMessengerCacheKey(userProfile.uid, 'chats'), []));
  const [allUsers, setAllUsers] = useState<UserProfile[]>(() => readCachedJson<UserProfile[]>(getMessengerCacheKey(userProfile.uid, 'all_users'), []));
  const [messages, setMessages] = useState<any[]>(() => readCachedJson<any[]>(getMessengerCacheKey(userProfile.uid, 'messages_default'), []));
  const [isLoading, setIsLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [tab, setTab] = useState<'chats' | 'people'>('chats');
  const [peopleSearchQuery, setPeopleSearchQuery] = useState("");
  const [isAppActive, setIsAppActive] = useState(() => typeof document === 'undefined' ? true : document.visibilityState === 'visible');
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [messageActionTarget, setMessageActionTarget] = useState<{
    id: string;
    senderId?: string;
    text?: string;
    type?: string;
    isUploading?: boolean;
    reactions?: Record<string, string>;
  } | null>(null);
  const [messageActionPosition, setMessageActionPosition] = useState<{ x: number; y: number } | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<any[]>([]);
  const [fetchedUserProfiles, setFetchedUserProfiles] = useState<Record<string, UserProfile>>(() =>
    readCachedJson<Record<string, UserProfile>>(`avelut_resolved_profiles_${userProfile.uid}`, {})
  );
  const [showUserOptions, setShowUserOptions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('spam');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startYRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen to typing status for active chat
  useEffect(() => {
    if (!activeChat || !firebaseUser) return;
    const typingRef = dbRef(db, `chat_meta_data/${activeChat.chatId}/typing`);
    const unsub = onValue(typingRef, (snap) => {
      if (snap.exists()) {
        setTypingStatus(snap.val());
      } else {
        setTypingStatus({});
      }
    });
    return () => unsub();
  }, [activeChat, firebaseUser]);

  const updateTypingStatus = (status: 'typing' | 'recording' | null) => {
    if (!activeChat || !firebaseUser) return;
    const typingRef = dbRef(db, `chat_meta_data/${activeChat.chatId}/typing/${firebaseUser.uid}`);
    if (status) {
      set(typingRef, status).catch(console.error);
    } else {
      remove(typingRef).catch(console.error);
    }
  };

  const messageActionMenuRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 });

  // Study Partners contact system states
  const [studyPartners, setStudyPartners] = useState<Record<string, boolean>>(() => readCachedJson<Record<string, boolean>>(getMessengerCacheKey(userProfile.uid, 'study_partners'), {}));
  const [partnerRequests, setPartnerRequests] = useState<Record<string, any>>(() => readCachedJson<Record<string, any>>(getMessengerCacheKey(userProfile.uid, 'partner_requests'), {}));

  // Forwarding states
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardTargetContent, setForwardTargetContent] = useState('');
  const [forwardTargetType, setForwardTargetType] = useState('text');
  
  // Realtime active chats statuses (typing, recording)
  const [chatStatuses, setChatStatuses] = useState<Record<string, { isTyping?: boolean; isRecording?: boolean }>>({});
  
  // Ref for my typing timeout
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleTypingStatus = (status: 'typing' | 'recording' | 'idle') => {
      if (!firebaseUser || !activeChat) return;
      const myId = firebaseUser.uid;
      const otherId = activeChat.otherUser.uid;
      const refPath = `user_chats/${otherId}/${activeChat.chatId}`;
      if (status === 'typing') {
         update(dbRef(db, refPath), { isTyping: true, isRecording: false });
         if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
         typingTimeoutRef.current = setTimeout(() => handleTypingStatus('idle'), 3000);
      } else if (status === 'recording') {
         update(dbRef(db, refPath), { isTyping: false, isRecording: true });
      } else {
         update(dbRef(db, refPath), { isTyping: false, isRecording: false });
      }
  };


  const chatRowLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeToReplyRef = useRef<{ id: string | null; startX: number; currentX: number }>({ id: null, startX: 0, currentX: 0 });
  const suppressNextChatOpenRef = useRef(false);
  const unreadCountsRef = useRef<Record<string, number>>({});
  const lastNotificationTimestampRef = useRef<Record<string, number>>({});
  const { addToast } = useToast();

  const isBlocked = activeChat && userProfile?.blocked_users?.[activeChat.otherUser.uid];
  const isBlockingMe = activeChat && activeChat.otherUser.blocked_users?.[userProfile.uid];

  const closeMessageActions = () => {
    setMessageActionTarget(null);
    setMessageActionPosition(null);
  };

  const handleBlockUser = async () => {
    if (!firebaseUser || !activeChat) return;
    try {
      const dbRefPath = `users/${firebaseUser.uid}/blocked_users/${activeChat.otherUser.uid}`;
      await set(dbRef(db, dbRefPath), true);
      addToast("User has been blocked.", "success");
      setShowUserOptions(false);
    } catch (err) {
      console.error("Failed to block user:", err);
      addToast("Failed to block user.", "error");
    }
  };

  const handleReportSubmit = async () => {
    if (!firebaseUser || !activeChat) return;
    try {
      const reportId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
      const reportRef = dbRef(db, `reports/${reportId}`);
      await set(reportRef, {
        id: reportId,
        reporter_uid: firebaseUser.uid,
        reported_uid: activeChat.otherUser.uid,
        chat_id: activeChat.chatId,
        reason: reportReason,
        timestamp: Date.now()
      });
      addToast("Report submitted successfully. Our team will review it.", "success");
      setShowReportModal(false);
      setShowUserOptions(false);
    } catch (err) {
      console.error("Failed to report user:", err);
      addToast("Failed to submit report.", "error");
    }
  };

  const showIncomingMessageNotification = async (chat: any, summaryText: string) => {
    if (typeof window === 'undefined') return;
    if (!userProfile.notifications_enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title = chat?.otherUser?.display_name
      ? `New message from ${chat.otherUser.display_name}`
      : 'New message received';
    const options: any = {
      body: summaryText,
      icon: '/logo_icon.png',
      badge: '/badge.png',
      tag: `messenger-${chat?.id || 'chat'}`,
      renotify: true,
      data: {
        chatId: chat?.id || '',
      },
    };
    try {
      if ('serviceWorker' in navigator) {
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration = await navigator.serviceWorker.register('/service-worker.js');
        }
        if (registration?.showNotification) {
          await registration.showNotification(title, options);
          return;
        }
      }

      new Notification(title, options);
    } catch (error) {
      console.error('Failed to show messenger notification:', error);
    }
  };

  useEffect(() => {
    if (!messageActionTarget) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!messageActionMenuRef.current) return;
      if (event.target instanceof Node && !messageActionMenuRef.current.contains(event.target)) {
        closeMessageActions();
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMessageActions();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [messageActionTarget]);

  const filteredPeople = useMemo(() => {
    const partnersOnly = allUsers.filter(u => studyPartners[u.uid] === true);
    if (!peopleSearchQuery.trim()) return partnersOnly;
    const normalizedQuery = peopleSearchQuery.toLowerCase();
    return allUsers
      .filter(u => u.uid !== firebaseUser?.uid)
      .filter(u => {
        const name = (u.display_name || "").toLowerCase();
        const dept = (u.department_id || "").toLowerCase();
        return name.includes(normalizedQuery) || dept.includes(normalizedQuery);
      });
  }, [allUsers, studyPartners, peopleSearchQuery, firebaseUser]);

  const activeChats = useMemo(() => {
    return chats.filter(c => {
      const partnerId = c.otherUserId || c.otherUser?.uid;
      return studyPartners[partnerId] === true;
    });
  }, [chats, studyPartners]);

  const userMap = useMemo(() => new Map(allUsers.map(user => [user.uid, user])), [allUsers]);

  const userMapRef = useRef(userMap);
  const fetchedUserProfilesRef = useRef(fetchedUserProfiles);

  useEffect(() => {
    userMapRef.current = userMap;
  }, [userMap]);

  useEffect(() => {
    fetchedUserProfilesRef.current = fetchedUserProfiles;
  }, [fetchedUserProfiles]);

  const selectedChatUser = activeChat?.otherUser || createFallbackChatUser(activeChat?.chatId || '');

  const getUnreadCountForUser = useCallback((otherUserId: string) => {
    if (!firebaseUser) return 0;
    const chatId = [firebaseUser.uid, otherUserId].sort().join('_');
    const chat = chats.find(item => item.id === chatId);
    return chat ? getUnreadCount(chat) : 0;
  }, [chats, firebaseUser]);

  const ensureChatThreadRecord = useCallback(async (otherUser: UserProfile) => {
    if (!firebaseUser) return null;
    const chatId = [firebaseUser.uid, otherUser.uid].sort().join('_');
    const currentThreadRef = dbRef(db, `user_chats/${firebaseUser.uid}/${chatId}`);
    const recipientThreadRef = dbRef(db, `user_chats/${otherUser.uid}/${chatId}`);
    const snapshot = await get(currentThreadRef);
    const recipientSnapshot = await get(recipientThreadRef);
    const now = Date.now();

    if (!snapshot.exists()) {
      await set(currentThreadRef, {
        otherUserId: otherUser.uid,
        timestamp: now,
        unreadCount: 0,
        last_message: {
          text: 'Start a conversation',
          senderId: firebaseUser.uid,
          timestamp: now,
          type: 'text',
        },
      });
    }

    if (!recipientSnapshot.exists()) {
      await set(recipientThreadRef, {
        otherUserId: firebaseUser.uid,
        timestamp: now,
        unreadCount: 0,
        last_message: {
          text: 'Start a conversation',
          senderId: firebaseUser.uid,
          timestamp: now,
          type: 'text',
        },
      });
    }

    return chatId;
  }, [firebaseUser]);

  const openChatWithUser = useCallback((otherUser: UserProfile) => {
    if (!firebaseUser) return;

    const chatId = [firebaseUser.uid, otherUser.uid].sort().join('_');
    setActiveChat({ chatId, otherUser });
    setTab('chats');

    void ensureChatThreadRecord(otherUser);
  }, [ensureChatThreadRecord, firebaseUser]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setFirebaseUser(user);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const usersRef = dbRef(db, 'users');
    const unsubscribe = onValue(usersRef, (snap) => {
      const data = snap.val() || {};
      setAllUsers(Object.entries(data).map(([uid, u]: any) => ({
        uid,
        display_name: u.displayName || u.display_name || 'User',
        photo_url: u.photoURL || u.photo_url || '',
        is_online: u.is_online || false,
        last_seen: u.last_seen || 0,
        subscription_status: u.subscription_status || 'free',
        department_id: u.department_id || '',
        level: u.level || '',
        current_streak: u.current_streak || 0,
        last_streak_date: u.last_streak_date || '',
        last_activity_date: u.last_activity_date || 0,
        notifications_enabled: u.notifications_enabled || false,
        blocked_users: u.blocked_users || {}
      })));
    });
    return () => off(usersRef, 'value', unsubscribe);
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    const partnersRef = dbRef(db, `study_partners/${firebaseUser.uid}`);
    const unsubscribePartners = onValue(partnersRef, (snap) => {
      setStudyPartners(snap.val() || {});
    });

    const requestsRef = dbRef(db, `partner_requests/${firebaseUser.uid}`);
    const unsubscribeRequests = onValue(requestsRef, (snap) => {
      setPartnerRequests(snap.val() || {});
    });

    return () => {
      off(partnersRef, 'value', unsubscribePartners);
      off(requestsRef, 'value', unsubscribeRequests);
    };
  }, [firebaseUser]);

  useEffect(() => {
    const handleVisibilityChange = () => setIsAppActive(document.visibilityState === 'visible');
    const handleFocus = () => setIsAppActive(true);
    const handleBlur = () => setIsAppActive(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    const presenceRef = dbRef(db, `users/${firebaseUser.uid}`);
    const connectedRef = dbRef(db, '.info/connected');
    let activeConnection = false;

    const syncPresence = async (online: boolean) => {
      await update(presenceRef, {
        is_online: online,
        last_seen: firebaseServerTimestamp()
      });
    };

    const unsubscribeConnected = onValue(connectedRef, async (snapshot) => {
      const connected = snapshot.val() === true;
      activeConnection = connected;

      if (connected && isAppActive) {
        const presenceDisconnect = onDisconnect(presenceRef);
        await presenceDisconnect.update({
          is_online: false,
          last_seen: firebaseServerTimestamp()
        });
        await syncPresence(true);
      }
    });

    if (isAppActive && activeConnection) {
      syncPresence(true);
    } else if (!isAppActive) {
      syncPresence(false);
    }

    return () => {
      off(connectedRef, 'value', unsubscribeConnected);
      syncPresence(false);
    };
  }, [firebaseUser, isAppActive]);

  useEffect(() => {
    if (!firebaseUser) return;
    const userChatsRef = dbRef(db, `user_chats/${firebaseUser.uid}`);
    onValue(userChatsRef, (snap) => {
      const rawVal = snap.val() || {};
      setChats(prevChats => {
        const chatList = Object.entries(rawVal).map(([chatId, details]: any) => {
          const otherUserId = details.otherUserId || chatId;
          const existingChat = prevChats.find(c => c.id === chatId);
          let otherUser = existingChat?.otherUser;
          if (!otherUser || otherUser.display_name === 'Unknown user') {
            otherUser = userMapRef.current.get(otherUserId) || fetchedUserProfilesRef.current[otherUserId] || createFallbackChatUser(otherUserId);
          }
          return {
            id: chatId,
            ...details,
            otherUser,
            isTyping: !!details.isTyping,
            isRecording: !!details.isRecording
          };
        });

        const nextUnreadCounts: Record<string, number> = {};
        chatList.forEach((chat) => {
          const unreadCount = getUnreadCount(chat);
          nextUnreadCounts[chat.id] = unreadCount;

          const previousUnread = unreadCountsRef.current[chat.id] || 0;
          const lastMessageTimestamp = Number(chat?.last_message?.timestamp || chat?.timestamp || 0);
          const lastNotifiedTimestamp = lastNotificationTimestampRef.current[chat.id] || 0;
          const lastSenderId = getLastMessageSenderId(chat);
          const hasIncomingUnread = unreadCount > previousUnread && unreadCount > 0;

          if (
            hasIncomingUnread &&
            lastSenderId &&
            lastSenderId !== firebaseUser.uid &&
            lastMessageTimestamp > 0 &&
            lastMessageTimestamp !== lastNotifiedTimestamp
          ) {
            lastNotificationTimestampRef.current[chat.id] = lastMessageTimestamp;
            void showIncomingMessageNotification(chat, getLastMessagePreview(chat));
          }
        });
        unreadCountsRef.current = nextUnreadCounts;
        return chatList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      });
      setIsLoading(false);
    });
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    writeCachedJson(getMessengerCacheKey(userProfile.uid, 'chats'), chats);
  }, [chats, firebaseUser, userProfile.uid]);

  useEffect(() => {
    if (!firebaseUser || !allUsers.length) return;
    writeCachedJson(getMessengerCacheKey(userProfile.uid, 'all_users'), allUsers);
  }, [allUsers, firebaseUser, userProfile.uid]);

  useEffect(() => {
    if (!firebaseUser) return;
    writeCachedJson(getMessengerCacheKey(userProfile.uid, 'study_partners'), studyPartners);
  }, [studyPartners, firebaseUser, userProfile.uid]);

  useEffect(() => {
    if (!firebaseUser) return;
    writeCachedJson(getMessengerCacheKey(userProfile.uid, 'partner_requests'), partnerRequests);
  }, [partnerRequests, firebaseUser, userProfile.uid]);

  const pendingFetches = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!chats.length) return;
    chats.forEach(async (chat) => {
      const otherUserId = chat.otherUserId || chat.otherUser?.uid;
      if (!otherUserId) return;
      const resolvedUser = userMap.get(otherUserId) || fetchedUserProfiles[otherUserId];
      if (!resolvedUser && !pendingFetches.current.has(otherUserId)) {
        pendingFetches.current.add(otherUserId);
        try {
          const snapshot = await get(dbRef(db, `users/${otherUserId}`));
          if (snapshot.exists()) {
            const u = snapshot.val();
            const profile: UserProfile = {
              uid: otherUserId,
              display_name: u.displayName || u.display_name || 'Unknown User',
              photo_url: u.photoURL || u.photo_url || '',
              is_online: !!u.is_online,
              last_seen: u.last_seen || 0,
              department_id: u.department_id || '',
              level: u.level || '',
              current_streak: u.current_streak || 0,
              last_activity_date: u.last_activity_date || Date.now(),
              notifications_enabled: !!u.notifications_enabled,
              subscription_status: u.subscription_status || 'free',
              blocked_users: u.blocked_users || {}
            };
            setFetchedUserProfiles(prev => {
              const next = { ...prev, [otherUserId]: profile };
              writeCachedJson(`avelut_resolved_profiles_${userProfile.uid}`, next);
              return next;
            });
          }
        } catch (err) {
          console.error("Failed to fetch profile for user:", otherUserId, err);
        } finally {
          pendingFetches.current.delete(otherUserId);
        }
      }
    });
  }, [chats, userMap]);

  useEffect(() => {
    if (!chats.length) return;
    setChats(prevChats => prevChats.map(chat => {
      const otherUserId = chat.otherUserId || chat.otherUser?.uid;
      const resolvedUser = otherUserId ? (userMap.get(otherUserId) || fetchedUserProfiles[otherUserId]) : undefined;
      return resolvedUser ? { ...chat, otherUser: resolvedUser } : chat;
    }));
  }, [userMap, fetchedUserProfiles]);

  useEffect(() => {
    if (!initialChatId || !chats.length) return;
    const nextChat = chats.find(chat => chat.id === initialChatId);
    if (!nextChat) return;
    setActiveChat({ chatId: nextChat.id, otherUser: nextChat.otherUser });
    setTab('chats');
  }, [initialChatId, chats]);

  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }

    setMessages(readCachedJson<any[]>(getMessengerCacheKey(userProfile.uid, `messages_${activeChat.chatId}`), []));
    setOptimisticMessages([]);
    const messagesRef = dbRef(db, `messages/${activeChat.chatId}`);
    const messagesQuery = query(messagesRef, limitToLast(50));
    onValue(messagesQuery, (snap) => {
      const cloudMsgs = Object.entries(snap.val() || {}).map(([id, msg]: any) => ({ id, ...msg })).sort((a, b) => a.timestamp - b.timestamp);
      setMessages(prev => {
        if (prev.length > 0) {
            const lastPrev = prev[prev.length - 1];
            const lastNew = cloudMsgs[cloudMsgs.length - 1];
            if (lastNew && lastNew.id !== lastPrev.id && lastNew.senderId !== firebaseUser.uid && lastNew.timestamp > lastPrev.timestamp) {
                playReceiveSound();
            }
        }
        return cloudMsgs;
      });

      setOptimisticMessages(prev => prev.filter(opt => !cloudMsgs.some(cloud => cloud.timestamp === opt.timestamp)));

      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      if (firebaseUser) {
        set(dbRef(db, `user_chats/${firebaseUser.uid}/${activeChat.chatId}/unreadCount`), 0);
        
        const updates: any = {};
        let needsUpdate = false;
        let lastMsgRead = false;
        cloudMsgs.forEach((msg: any, index: number) => {
          if (msg.senderId !== firebaseUser.uid && !msg.isRead) {
            updates[`messages/${activeChat.chatId}/${msg.id}/isRead`] = true;
            needsUpdate = true;
            if (index === cloudMsgs.length - 1) lastMsgRead = true;
          }
        });
        if (lastMsgRead) {
            updates[`user_chats/${activeChat.otherUser.uid}/${activeChat.chatId}/last_message/isRead`] = true;
            updates[`user_chats/${firebaseUser.uid}/${activeChat.chatId}/last_message/isRead`] = true;
        }
        if (needsUpdate) {
          update(dbRef(db, '/'), updates).catch(console.error);
        }
      }
    });
    return () => off(messagesRef);
  }, [activeChat, firebaseUser, userProfile.uid]);

  useEffect(() => {
    if (!firebaseUser || !activeChat) return;
    writeCachedJson(getMessengerCacheKey(userProfile.uid, `messages_${activeChat.chatId}`), messages);
  }, [activeChat, firebaseUser, messages, userProfile.uid]);

  const combinedMessageStream = useMemo(() => {
    return [...messages, ...optimisticMessages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [messages, optimisticMessages]);

  const updateChatMetaFromLatestMessage = async (chatId: string, otherUserId: string) => {
    if (!firebaseUser) return;
    const latestSnapshot = await get(dbRef(db, `messages/${chatId}`));
    let summaryText = 'No messages yet';
    let latestTimestamp = Date.now();
    if (latestSnapshot.exists()) {
      const cloudMsgs = Object.entries(latestSnapshot.val() || {}).map(([, msg]: any) => msg);
      cloudMsgs.sort((a: any, b: any) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));
      const lastMessage: any = cloudMsgs[cloudMsgs.length - 1] || {};
      latestTimestamp = Number(lastMessage?.timestamp || Date.now());
      if (lastMessage?.type === 'voice') summaryText = '🎵 Voice message';
      else if (lastMessage?.type === 'image') summaryText = '📷 Image file';
      else if (lastMessage?.type === 'file') summaryText = '📄 Document file';
      else summaryText = (lastMessage?.text || 'No messages yet').toString();
    }

    const updates: any = {};
    const participantIds = Array.from(new Set([firebaseUser.uid, otherUserId]));

    participantIds.forEach((participantId) => {
      updates[`user_chats/${participantId}/${chatId}/last_message`] = { text: summaryText };
      updates[`user_chats/${participantId}/${chatId}/timestamp`] = latestTimestamp;
    });
    await update(dbRef(db), updates);
  };

  const handleDeleteChatThread = async (chat: any) => {
    if (!firebaseUser || !chat?.id || !chat?.otherUserId) return;
    const confirmed = window.confirm(`Delete this chat with ${chat.otherUser?.display_name || 'this user'}?`);
    if (!confirmed) return;
    try {
      const updates: any = {};
      updates[`user_chats/${firebaseUser.uid}/${chat.id}`] = null;
      updates[`user_chats/${chat.otherUserId}/${chat.id}`] = null;
      updates[`messages/${chat.id}`] = null;
      await update(dbRef(db), updates);
      if (activeChat?.chatId === chat.id) {
        setActiveChat(null);
        setMessages([]);
        setOptimisticMessages([]);
      }
      addToast('Chat deleted successfully.', 'success');
    } catch (error: any) {
      console.error('Failed to delete chat thread:', error);
      addToast(error?.message || 'Failed to delete chat.', 'error');
    }
  };

  const startChatRowLongPress = (chat: any) => {
    if (chatRowLongPressTimerRef.current) {
      clearTimeout(chatRowLongPressTimerRef.current);
    }
    chatRowLongPressTimerRef.current = setTimeout(() => {
      suppressNextChatOpenRef.current = true;
      void handleDeleteChatThread(chat);
    }, 520);
  };

  const clearChatRowLongPress = () => {
    if (chatRowLongPressTimerRef.current) {
      clearTimeout(chatRowLongPressTimerRef.current);
      chatRowLongPressTimerRef.current = null;
    }
  };

  const openMessageActions = (msg: any, x: number, y: number) => {
    if (msg?.isUploading) return;
    setMessageActionTarget({
      id: msg.id,
      senderId: msg.senderId,
      text: msg.text,
      type: msg.type,
      isUploading: msg.isUploading,
      reactions: msg.reactions || {}
    });
    setMessageActionPosition({ x, y });
  };

  const copyMessageContent = async () => {
    if (!messageActionTarget) return;
    const rawText = typeof messageActionTarget.text === 'string' ? messageActionTarget.text : '';
    const copiedValue = messageActionTarget.type === 'image'
      ? (rawText.match(/\((.*?)\)/)?.[1] || rawText)
      : rawText;
    if (!copiedValue) {
      addToast('Nothing to copy.', 'info');
      closeMessageActions();
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copiedValue);
        addToast('Message copied.', 'success');
      } else {
        addToast('Message copied.', 'success');
      }
    } catch (error) {
      addToast('Message copied.', 'success');
    }
    closeMessageActions();
  };

  const deleteSelectedMessage = async () => {
    if (!messageActionTarget || !activeChat || !firebaseUser) return;
    if (messageActionTarget.senderId !== firebaseUser.uid) {
      addToast('You can only delete your own messages.', 'info');
      closeMessageActions();
      return;
    }

    try {
      await remove(dbRef(db, `messages/${activeChat.chatId}/${messageActionTarget.id}`));
      await updateChatMetaFromLatestMessage(activeChat.chatId, activeChat.otherUser.uid);
      addToast('Message deleted.', 'success');
    } catch (error: any) {
      console.error('Failed to delete message:', error);
      addToast(error?.message || 'Failed to delete message.', 'error');
    }
    closeMessageActions();
  };

  const reactToMessage = async (emoji: string) => {
    if (!messageActionTarget || !activeChat || !firebaseUser) return;
    try {
      const reactionPath = dbRef(db, `messages/${activeChat.chatId}/${messageActionTarget.id}/reactions/${firebaseUser.uid}`);
      const currentReaction = messageActionTarget.reactions?.[firebaseUser.uid];
      if (currentReaction === emoji) {
        await remove(reactionPath);
      } else {
        await set(reactionPath, emoji);
        playBubbleSound();
      }
    } catch (error: any) {
      console.error('Failed to react to message:', error);
      addToast(error?.message || 'Failed to add reaction.', 'error');
    }
    closeMessageActions();
  };

  const quickReactToMessage = async (msg: any, emoji: string) => {
    if (!activeChat || !firebaseUser || !msg?.id || msg?.isUploading) return;
    try {
      const existingReactions = (msg.reactions && typeof msg.reactions === 'object') ?
        msg.reactions as Record<string, string> : {};
      const reactionPath = dbRef(db, `messages/${activeChat.chatId}/${msg.id}/reactions/${firebaseUser.uid}`);
      if (existingReactions[firebaseUser.uid] === emoji) {
        await remove(reactionPath);
        addToast('Reaction removed.', 'info');
      } else {
        await set(reactionPath, emoji);
        playBubbleSound();
        addToast('Reacted with ❤️', 'success');
      }
    } catch (error: any) {
      console.error('Failed to quick react to message:', error);
      addToast(error?.message || 'Quick reaction failed.', 'error');
    }
  };

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeChat || !e.target.files || e.target.files.length === 0 || !firebaseUser) return;
    const selectedFiles = Array.from(e.target.files);
    for (const fileItem of selectedFiles) {
      const file = fileItem as any;
      const localTimestamp = Date.now();
      const tempId = `temp_file_${localTimestamp}`;
      const fileType = file.type.startsWith('image/') ? 'image' : 'file';
      const pendingMessage = {
        id: tempId,
        senderId: firebaseUser.uid,
        text: `[📄 ${file.name}]()`,
        type: fileType,
        timestamp: localTimestamp,
        isUploading: true
      };
      setOptimisticMessages(prev => [...prev, pendingMessage]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      try {
        const cloudPath = `chat_files/${activeChat.chatId}/${localTimestamp}_${file.name}`;
        const fileBucketRef = storageRef(storage, cloudPath);
        const snapshot = await uploadBytes(fileBucketRef, file);
        const fileDownloadUrl = await getDownloadURL(snapshot.ref);
        setOptimisticMessages(prev => prev.filter((m: any) => m.id !== tempId));
        if (file.type.startsWith('image/')) {
          await sendMsg(`![${file.name}](${fileDownloadUrl})`, 'image');
        } else {
          await sendMsg(`[📄 ${file.name}](${fileDownloadUrl})`, 'file');
        }
      } catch (err) {
        addToast(`Failed to upload asset: ${file.name}`, 'error');
        setOptimisticMessages(prev => prev.filter((m: any) => m.id !== tempId));
      }
    }
  };

  const handleImageSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeChat || !e.target.files || e.target.files.length === 0 || !firebaseUser) return;
    const selectedImages = Array.from(e.target.files);
    for (const imgItem of selectedImages) {
      const img = imgItem as any;
      const localTimestamp = Date.now();
      const tempId = `temp_img_${localTimestamp}`;

      const pendingMessage = {
        id: tempId,
        senderId: firebaseUser.uid,
        text: `![Captured Image]()`,
        type: 'image',
        timestamp: localTimestamp,
        isUploading: true
      };
      setOptimisticMessages(prev => [...prev, pendingMessage]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      try {
        const cloudPath = `chat_files/${activeChat.chatId}/${localTimestamp}_camera_${img.name}`;
        const fileBucketRef = storageRef(storage, cloudPath);
        const snapshot = await uploadBytes(fileBucketRef, img);
        const fileDownloadUrl = await getDownloadURL(snapshot.ref);
        setOptimisticMessages(prev => prev.filter((m: any) => m.id !== tempId));
        await sendMsg(`![Captured Image](${fileDownloadUrl})`, 'image');
      } catch (err) {
        addToast('Failed to upload visual layout media.', 'error');
        setOptimisticMessages(prev => prev.filter((m: any) => m.id !== tempId));
      }
    }
  };

  const startRecording = async (e: any) => {
    updateTypingStatus('recording');
    setRecordingTime(0);
    recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    if (!activeChat) return;
    if (e && 'preventDefault' in e) e.preventDefault();
    startYRef.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      (recorder as any).shouldSave = true;

      recorder.onstop = async () => {
        if ((recorder as any).shouldSave && firebaseUser) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          if (blob.size > 1000) {
            const localTimestamp = Date.now();
            const tempId = `temp_vn_${localTimestamp}`;
            const blobLocalUrl = URL.createObjectURL(blob);

            const pendingMessage = {
              id: tempId,
              senderId: firebaseUser.uid,
              text: `[Voice Note](${blobLocalUrl})`,
              type: 'voice',
              timestamp: localTimestamp,
              isUploading: true
            };

            setOptimisticMessages(prev => [...prev, pendingMessage]);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

            try {
              const path = `voice_notes/${activeChat?.chatId}/${localTimestamp}.webm`;
              const url = await getDownloadURL(await uploadBytes(storageRef(storage, path), blob).then(s => s.ref));
              setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
              await sendMsg(`[Voice Note](${url})`, 'voice');
            } catch (uploadError) {
              console.error("Voice Note storage syncing failure:", uploadError);
              setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
            }
          }
        }
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordDuration(0);
      handleTypingStatus('recording');
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setRecordDuration(prev => prev + 1), 1000);
    } catch (err) {
      addToast('Mic entry parameters rejected.', 'error');
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isRecording || isLocked) return;
    const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    if (startYRef.current - currentY > 80) setIsLocked(true);
  };

  const stopRecording = (shouldSave: boolean) => {
    setIsRecording(false);
    setIsLocked(false);
    handleTypingStatus('idle');
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current) {
      (mediaRecorderRef.current as any).shouldSave = shouldSave;
      mediaRecorderRef.current.stop();
    }
  };

  const sendMsg = async (text: string, type = 'text') => {
    if ((!text.trim() && type === 'text') || !activeChat || !firebaseUser) {
      addToast('Open a chat first, then send a message.', 'info');
      return;
    }

    const msgRef = push(dbRef(db, `messages/${activeChat.chatId}`));
    const clientTimestamp = Date.now();
    const optimisticId = msgRef.key || `${clientTimestamp}`;
    const data: any = { senderId: firebaseUser.uid, text, type, timestamp: firebaseServerTimestamp() };

    if (replyingTo) {
      data.replyTo = {
        id: replyingTo.id,
        text: replyingTo.type === 'text' ? replyingTo.text : `[${replyingTo.type}]`,
        senderId: replyingTo.senderId,
        senderName: replyingTo.senderId === firebaseUser.uid ? 'You' : activeChat.otherUser.display_name
      };
      setReplyingTo(null);
    }

    const optimisticMessage = { id: optimisticId, ...data, timestamp: clientTimestamp };

    setMessages(prev => [...prev, optimisticMessage]);
    playBubbleSound();
    try {
      await set(msgRef, data);
      const updates: any = {};
      let summaryText = text;
      if (type === 'voice') summaryText = '🎵 Voice message';
      else if (type === 'image') summaryText = '📷 Image file';
      else if (type === 'file') summaryText = '📄 Document file';
      const metaTimestamp = firebaseServerTimestamp();

      const participantIds = Array.from(new Set([firebaseUser.uid, activeChat.otherUser.uid]));
      participantIds.forEach((participantId) => {
        updates[`user_chats/${participantId}/${activeChat.chatId}/last_message`] = {
          text: summaryText,
          senderId: firebaseUser.uid,
          timestamp: metaTimestamp,
          type,
        };
        updates[`user_chats/${participantId}/${activeChat.chatId}/timestamp`] = metaTimestamp;
        updates[`user_chats/${participantId}/${activeChat.chatId}/otherUserId`] = participantId === firebaseUser.uid
          ? activeChat.otherUser.uid
          : firebaseUser.uid;
      });
      updates[`user_chats/${firebaseUser.uid}/${activeChat.chatId}/unreadCount`] = 0;
      if (activeChat.otherUser.uid !== firebaseUser.uid) {
        updates[`user_chats/${activeChat.otherUser.uid}/${activeChat.chatId}/unreadCount`] = increment(1);
      }
      await update(dbRef(db), updates);
    } catch (error: any) {
      setMessages(prev => prev.filter(message => message.id !== optimisticId));
      console.error('Failed to send message:', error);
      addToast(error?.message || 'Message failed to send.', 'error');
    }
  };

  const sendPartnerRequest = async (targetUser: UserProfile) => {
    if (!firebaseUser || !userProfile) return;
    try {
      const myRequestRef = dbRef(db, `partner_requests/${firebaseUser.uid}/${targetUser.uid}`);
      const theirRequestRef = dbRef(db, `partner_requests/${targetUser.uid}/${firebaseUser.uid}`);

      const now = Date.now();
      await set(myRequestRef, {
        status: 'sent',
        senderName: userProfile.display_name || 'User',
        senderId: firebaseUser.uid,
        receiverId: targetUser.uid,
        timestamp: now
      });
      await set(theirRequestRef, {
        status: 'received',
        senderName: userProfile.display_name || 'User',
        senderId: firebaseUser.uid,
        receiverId: targetUser.uid,
        timestamp: now
      });

      const notifRef = push(dbRef(db, `notifications/${targetUser.uid}`));
      await set(notifRef, {
        id: notifRef.key,
        title: 'New Study Partner Request',
        message: `${userProfile.display_name || 'A user'} sent you a study partner request!`,
        type: 'study_partner_request',
        is_read: false,
        timestamp: now
      });
      addToast(`Study partner request sent to ${targetUser.display_name}!`, 'success');
    } catch (err: any) {
      console.error('Failed to send partner request:', err);
      addToast('Failed to send request: ' + err.message, 'error');
    }
  };

  const acceptPartnerRequest = async (targetUser: UserProfile) => {
    if (!firebaseUser || !userProfile) return;
    try {
      const myRequestRef = dbRef(db, `partner_requests/${firebaseUser.uid}/${targetUser.uid}`);
      const theirRequestRef = dbRef(db, `partner_requests/${targetUser.uid}/${firebaseUser.uid}`);
      await remove(myRequestRef);
      await remove(theirRequestRef);

      const myPartnerRef = dbRef(db, `study_partners/${firebaseUser.uid}/${targetUser.uid}`);
      const theirPartnerRef = dbRef(db, `study_partners/${targetUser.uid}/${firebaseUser.uid}`);
      await set(myPartnerRef, true);
      await set(theirPartnerRef, true);

      const notifRef = push(dbRef(db, `notifications/${targetUser.uid}`));
      await set(notifRef, {
        id: notifRef.key,
        title: 'Study Partner Request Accepted',
        message: `${userProfile.display_name || 'A user'} accepted your study partner request!`,
        type: 'study_partner_accepted',
        is_read: false,
        timestamp: Date.now()
      });
      addToast(`You are now study partners with ${targetUser.display_name}!`, 'success');
    } catch (err: any) {
      console.error('Failed to accept request:', err);
      addToast('Failed to accept request: ' + err.message, 'error');
    }
  };

  const declinePartnerRequest = async (targetUser: UserProfile) => {
    if (!firebaseUser) return;
    try {
      const myRequestRef = dbRef(db, `partner_requests/${firebaseUser.uid}/${targetUser.uid}`);
      const theirRequestRef = dbRef(db, `partner_requests/${targetUser.uid}/${firebaseUser.uid}`);
      await remove(myRequestRef);
      await remove(theirRequestRef);
      addToast(`Declined request from ${targetUser.display_name}`, 'info');
    } catch (err: any) {
      console.error('Failed to decline request:', err);
    }
  };

  const cancelPartnerRequest = async (targetUser: UserProfile) => {
    if (!firebaseUser) return;
    try {
      const myRequestRef = dbRef(db, `partner_requests/${firebaseUser.uid}/${targetUser.uid}`);
      const theirRequestRef = dbRef(db, `partner_requests/${targetUser.uid}/${firebaseUser.uid}`);
      await remove(myRequestRef);
      await remove(theirRequestRef);
      addToast(`Cancelled request to ${targetUser.display_name}`, 'info');
    } catch (err: any) {
      console.error('Failed to cancel request:', err);
    }
  };

  const forwardMessageToUsers = async (text: string, type = 'text', recipientUserIds: string[]) => {
    if (!firebaseUser) return;
    try {
      for (const recipientId of recipientUserIds) {
        const chatId = [firebaseUser.uid, recipientId].sort().join('_');
        const msgRef = push(dbRef(db, `messages/${chatId}`));
        const data = { senderId: firebaseUser.uid, text, type, timestamp: Date.now(), is_forwarded: true };
        await set(msgRef, data);
        const updates: any = {};
        let summaryText = text;
        if (type === 'voice') summaryText = '🎵 Voice message';
        else if (type === 'image') summaryText = '📷 Image file';
        else if (type === 'file') summaryText = '📄 Document file';
        const participantIds = Array.from(new Set([firebaseUser.uid, recipientId]));
        participantIds.forEach((participantId) => {
          updates[`user_chats/${participantId}/${chatId}/last_message`] = {
            text: summaryText,
            senderId: firebaseUser.uid,
            timestamp: Date.now(),
            type,
          };
          updates[`user_chats/${participantId}/${chatId}/timestamp`] = Date.now();
          updates[`user_chats/${participantId}/${chatId}/otherUserId`] = participantId === firebaseUser.uid
            ? recipientId
            : firebaseUser.uid;
        });
        updates[`user_chats/${firebaseUser.uid}/${chatId}/unreadCount`] = 0;
        if (recipientId !== firebaseUser.uid) {
          updates[`user_chats/${recipientId}/${chatId}/unreadCount`] = increment(1);
        }
        await update(dbRef(db), updates);
      }
      addToast('Message forwarded successfully!', 'success');
    } catch (err: any) {
      console.error('Failed to forward:', err);
      addToast('Failed to forward message: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    if (!setCustomHeaderConfig) return;

    if (messageActionTarget) {
      setCustomHeaderConfig({
         title: (
           <div className="flex items-center gap-4 text-xl font-medium text-[#212529] dark:text-white">
             1
           </div>
         ),
         leftActions: (
            <button onClick={closeMessageActions} className="p-3 -ml-2 text-[#212529] dark:text-white hover:bg-neutral-100 rounded-full transition-colors flex items-center justify-center">
               <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
         ),
         rightActions: (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
               <button onClick={(e) => { e.stopPropagation(); setReplyingTo(messageActionTarget); closeMessageActions(); }} className="p-3 text-[#009EE2] dark:text-[#F8F9FA] hover:bg-neutral-100 rounded-full transition-colors" aria-label="Reply">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" /></svg>
               </button>
               <button onClick={(e) => e.stopPropagation()} className="p-3 text-[#009EE2] dark:text-[#F8F9FA] hover:bg-neutral-100 rounded-full transition-colors" aria-label="Bookmark">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
               </button>
               {messageActionTarget.senderId === firebaseUser?.uid && (
               <button onClick={(e) => { e.stopPropagation(); void deleteSelectedMessage(); }} className="p-3 text-red-500 hover:bg-red-50 rounded-full transition-colors" aria-label="Delete">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
               </button>
               )}
               <button onClick={(e) => { e.stopPropagation(); void copyMessageContent(); }} className="p-3 text-[#009EE2] dark:text-[#F8F9FA] hover:bg-neutral-100 rounded-full transition-colors" aria-label="Copy">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
               </button>
               <button onClick={(e) => {
                      e.stopPropagation();
                      setForwardTargetContent(messageActionTarget.text || '');
                      setForwardTargetType(messageActionTarget.type || 'text');
                      setIsForwardModalOpen(true);
                      closeMessageActions();
                    }} className="p-3 text-[#009EE2] dark:text-[#F8F9FA] hover:bg-neutral-100 rounded-full transition-colors" aria-label="Forward">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>
               </button>
               <button onClick={(e) => e.stopPropagation()} className="p-3 text-[#009EE2] dark:text-[#F8F9FA] hover:bg-neutral-100 rounded-full transition-colors" aria-label="More">
                  <span className="font-bold text-xl leading-none block rotate-90">⋯</span>
               </button>
            </div>
         ),
         hideBottomNav: true
      });
      return;
    }

    if (activeChat?.otherUser) {
      setCustomHeaderConfig({
        title: (
          <div onClick={() => onNavigate?.(`public_profile_${activeChat.otherUser.uid}`)} className="flex-1 min-w-0 flex flex-col justify-center cursor-pointer">
            <h2 className="font-semibold text-[#212529] dark:text-white text-[16px] leading-tight truncate flex items-center gap-1.5 hover:underline">
              <span className="truncate max-w-[120px]">{(activeChat.otherUser.display_name || 'User').split(' ')[0].substring(0, 5)}</span>
              <VerificationBadge status={activeChat.otherUser.subscription_status} />
              <StreakBadge userProfile={activeChat.otherUser} size="sm" />
            </h2>
            <p className="text-[12px] text-[#6C757D] dark:text-gray-400 font-normal mt-0.5 flex items-center">
              {activeChat.otherUser.is_online ? (
                <>
                  <span className="w-1.5 h-1.5 bg-[#28A745] rounded-full mr-1 animate-pulse"></span>
                  <span className="text-[#28A745]">Online</span>
                </>
              ) : formatLastSeen(activeChat.otherUser.last_seen)}
            </p>
          </div>
        ),
        leftActions: (
          <>
            <button onClick={() => setActiveChat(null)} className="lg:hidden text-[#6C757D] dark:text-gray-400 hover:text-[#212529] dark:text-white transition p-3 mr-3 flex items-center justify-center rounded-full bg-neutral-200/50 hover:bg-neutral-200 min-w-[48px] min-h-[48px]" aria-label="Go back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button onClick={() => onNavigate?.(`public_profile_${activeChat.otherUser.uid}`)} className="mr-3 shrink-0 cursor-pointer transition hover:opacity-80">
              <Avatar className="w-9 h-9 rounded-full object-cover border border-[#E9ECEF] dark:border-white/10" photo_url={activeChat.otherUser.photo_url} display_name={activeChat.otherUser.display_name || 'User'} />
            </button>
          </>
        ),
        rightActions: (
          <div className="relative">
             <button onClick={() => setShowUserOptions(!showUserOptions)} className="p-2 text-slate-500 dark:text-gray-400 hover:bg-slate-100 rounded-full transition-colors">
                <span className="font-bold text-xl leading-none block rotate-90">⋯</span>
             </button>
             {showUserOptions && (
              <div className="absolute right-2 sm:right-0 mt-2 w-48 bg-white dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-[9999] py-1 origin-top-right">
                 <button onClick={handleBlockUser} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold">Block User</button>
                 <button onClick={() => { setShowReportModal(true); setShowUserOptions(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:bg-black font-bold">Report User</button>
              </div>
             )}
          </div>
        ),
        hideBottomNav: true
      });
    } else {
      setCustomHeaderConfig(null);
    }

    return () => {
      setCustomHeaderConfig(null);
    };
  }, [setCustomHeaderConfig, activeChat, tab, onNavigate, showUserOptions, messageActionTarget, firebaseUser]);


  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F8F9FA] dark:bg-black font-sans antialiased text-[#212529] dark:text-white">
      {/* Sidebar Pane */}
      <div className={`w-full lg:w-[380px] border-r border-[#E9ECEF] dark:border-white/10 flex flex-col ${activeChat ? 'hidden lg:flex' : 'flex'} h-full bg-white dark:bg-black relative`}>
        <div className="p-4 bg-[#F8F9FA] dark:bg-black border-b border-[#E9ECEF] dark:border-white/10 shrink-0">
          <div className="flex gap-1 bg-[#E9ECEF] p-1 rounded-xl text-sm shrink-0 mb-4">
            <button onClick={() => setTab('chats')} className={`flex-1 px-4 py-1.5 rounded-lg font-bold transition-all ${tab === 'chats' ? 'bg-white dark:bg-black text-[#212529] dark:text-white shadow-sm' : 'text-[#6C757D] dark:text-gray-400 hover:text-[#212529] dark:text-white'}`}>Chats</button>
            <button onClick={() => setTab('people')} className={`flex-1 px-4 py-1.5 rounded-lg font-bold transition-all ${tab === 'people' ? 'bg-white dark:bg-black text-[#212529] dark:text-white shadow-sm' : 'text-[#6C757D] dark:text-gray-400 hover:text-[#212529] dark:text-white'}`}>Study Mates</button>
          </div>

          {/* Search Bar */}
          {tab === 'people' && (
            <div className="relative">
              <input
                type="text"
                placeholder="Search study mates..."
                value={peopleSearchQuery}
                onChange={(e) => setPeopleSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-black text-sm text-[#212529] dark:text-white placeholder-[#80868B] px-4 py-2 rounded-full border border-[#E9ECEF] dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#009EE2]/20 focus:border-[#009EE2] transition-all shadow-sm"
              />
              {peopleSearchQuery && (
                <button onClick={() => setPeopleSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6C757D] dark:text-gray-400 text-xs hover:text-[#212529] dark:text-white">✕</button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-white dark:bg-black">
          {isLoading ? (
            <div className="p-4"><MessengerSkeleton /></div>
          ) : tab === 'chats' ?
            activeChats.map(c => (
              <div
                key={c.id}
                onClick={() => {
                  if (suppressNextChatOpenRef.current) {
                    suppressNextChatOpenRef.current = false;
                    return;
                  }
                  setActiveChat({ chatId: c.id, otherUser: c.otherUser });
                }}
                onTouchStart={() => startChatRowLongPress(c)}
                onTouchEnd={clearChatRowLongPress}
                onTouchCancel={clearChatRowLongPress}
                onTouchMove={clearChatRowLongPress}
                onContextMenu={(event) => {
                  event.preventDefault();
                  void handleDeleteChatThread(c);
                }}
                className={`flex items-center gap-3 p-4 hover:bg-[#F8F9FA] dark:bg-black cursor-pointer border-b border-[#E9ECEF] dark:border-white/10 transition ${activeChat?.chatId === c.id ? 'bg-[#F8F9FA] dark:bg-black' : ''}`}
              >
                <Avatar className="w-11 h-11 rounded-full shrink-0 object-cover border border-[#E9ECEF] dark:border-white/10" photo_url={c.otherUser?.photo_url} display_name={c.otherUser?.display_name || 'User'} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <h3 className={`text-[15px] truncate flex items-center gap-1.5 ${getUnreadCount(c) > 0 ? 'font-bold text-[#212529] dark:text-white' : 'font-medium text-[#212529] dark:text-white'}`}>
                      <span>{c.otherUser?.display_name}</span>
                      <VerificationBadge status={c.otherUser?.subscription_status} />
                      {c.otherUser && <StreakBadge userProfile={c.otherUser} size="sm" />}
                    </h3>
                    <span className="text-[12px] text-[#6C757D] dark:text-gray-400">10:16 AM</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      {c.last_message?.senderId === firebaseUser?.uid && (
                        <DoubleCheckIcon color={c.last_message?.isRead ? "#009EE2" : "#8696a0"} />
                      )}
                      
                      {c.isTyping ? (
                          <span className="text-[#009EE2] dark:text-[#F8F9FA] font-semibold flex items-center gap-1 italic"><div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-[#009EE2] animate-bounce" style={{animationDelay:'0ms'}}></div><div className="w-1 h-1 rounded-full bg-[#009EE2] animate-bounce" style={{animationDelay:'150ms'}}></div><div className="w-1 h-1 rounded-full bg-[#009EE2] animate-bounce" style={{animationDelay:'300ms'}}></div></div> typing...</span>
                      ) : c.isRecording ? (
                          <span className="text-[#009EE2] dark:text-[#F8F9FA] font-semibold flex items-center gap-1 italic">🎵 recording...</span>
                      ) : (
                          <p className={`text-[14px] truncate ${getUnreadCount(c) > 0 ? 'font-bold text-[#212529] dark:text-white' : 'text-[#6C757D] dark:text-gray-400'}`}>{getLastMessagePreview(c)}</p>
                      )}

                    </div>
                    {getUnreadCount(c) > 0 && (
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {getUnreadCount(c) > 99 ? '99+' : getUnreadCount(c)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-1 text-[#6C757D] dark:text-gray-400 font-normal">
                    {c.otherUser?.is_online ? <span className="text-[#28A745]">online</span> : formatLastSeen(c.otherUser?.last_seen)}
                  </p>
                </div>
              </div>
            )) : filteredPeople.length === 0 ? (
              <div className="text-center py-12 px-6 bg-[#F8F9FA] dark:bg-black/30 m-4 rounded-2xl border border-dashed border-[#E9ECEF] dark:border-white/10">
                <span className="text-2xl block mb-2 font-black text-[#6C757D] dark:text-gray-400">👥</span>
                <p className="text-sm font-bold text-[#212529] dark:text-white">No study mates found</p>
                <p className="text-xs text-[#6C757D] dark:text-gray-400 mt-1">
                  {peopleSearchQuery ? "No matches for your search." : "Build your network to collaborate and share chats."}
                </p>
              </div>
            ) : filteredPeople.map(u => {
              const unreadCount = getUnreadCountForUser(u.uid);
              return (
                <div key={u.uid} onClick={() => openChatWithUser(u)} className="flex items-center gap-3 p-4 hover:bg-[#F8F9FA] dark:bg-black cursor-pointer border-b border-[#E9ECEF] dark:border-white/10 transition">
                  <Avatar className="w-10 h-10 rounded-full shrink-0 object-cover border border-[#E9ECEF] dark:border-white/10" photo_url={u.photo_url} display_name={u.display_name || 'User'} />
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-[15px] truncate flex items-center gap-1.5 ${unreadCount > 0 ? 'font-bold text-[#212529] dark:text-white' : 'font-medium text-[#212529] dark:text-white'}`}>
                      <span>{u.display_name}</span>
                      <VerificationBadge status={u.subscription_status} />
                      <StreakBadge userProfile={u} size="sm" />
                    </h3>
                    <p className="text-[11px] text-[#6C757D] dark:text-gray-400 font-normal">{u.is_online ? <span className="text-[#28A745]">online</span> : formatLastSeen(u.last_seen)}</p>
                  </div>
                  {unreadCount > 0 && (
                    <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
              );
            })}
        </div>

        {/* FAB: Add Study Partner */}
        <button
          onClick={() => onNavigate?.('study_partners')}
          className="fixed md:absolute bottom-24 md:bottom-6 right-6 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-[#009EE2] to-[#0070B8] text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 border border-white/20 z-40"
          title="Add Study Partner"
        >
          <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Main Chat Viewport */}
      <div className={`flex-1 flex flex-col h-full bg-[#F8F9FA] dark:bg-black relative ${!activeChat ? 'hidden lg:flex items-center justify-center' : 'flex'}`}>
        {activeChat ? (
          <div className="flex flex-col h-full w-full relative overflow-hidden">
            {/* 2. Messages List */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-4 pb-[80px] md:py-6 bg-[#F8F9FA] dark:bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth">
              {combinedMessageStream.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center px-4">
                  <div className="w-20 h-20 bg-[#009EE2]/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-[#009EE2] dark:text-[#F8F9FA]">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-[#212529] dark:text-white mb-2 text-center">Start a Conversation</h3>
                  <p className="text-[#6C757D] dark:text-gray-400 text-center max-w-sm text-sm">
                    Say hello to {selectedChatUser.display_name}. Your first message will create the conversation.
                  </p>
                </div>
              ) : combinedMessageStream.map((msg) => {
                const isMe = msg.senderId === firebaseUser?.uid;
                const rawText = typeof msg.text === 'string' ? msg.text : '';
                const imageUrl = msg.type === 'image' ? (rawText.match(/\((.*?)\)/)?.[1] || rawText) : '';
                const reactionMap = (msg.reactions && typeof msg.reactions === 'object') ? msg.reactions as Record<string, string> : {};
                const reactionCounts = Object.values(reactionMap).reduce((acc: Record<string, number>, reactionEmoji: string) => {
                  acc[reactionEmoji] = (acc[reactionEmoji] || 0) + 1;
                  return acc;
                }, {});
                const sortedReactions = Object.entries(reactionCounts).sort((a, b) => b[1] - a[1]);

                return (
                  <div key={msg.id} className="my-4 space-y-1">
                    <div className={`flex items-end space-x-2.5 w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {!isMe && (
                        <Avatar className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-[#E9ECEF] dark:border-white/10" photo_url={selectedChatUser.photo_url} display_name={selectedChatUser.display_name || 'User'} />
                      )}

                      <div className={`py-1.5 px-3 shadow-sm w-fit max-w-[80%] md:max-w-[65%] text-[15px] relative ${messageActionTarget ? 'select-none' : 'select-text'} ${messageActionTarget?.id === msg.id ? 'ring-4 ring-[#25D366]/60 z-[60] !bg-[#25D366]/10' : ''} ${isMe
                          ? 'bg-[#0d1122] text-white rounded-2xl rounded-tr-sm border border-[#0d1122]/50'
                          : 'bg-white dark:bg-black text-[#111B21] rounded-2xl rounded-tl-sm border border-[#E9ECEF] dark:border-white/10'
                        }`}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openMessageActions(msg, event.clientX, event.clientY);
                        }}
                        onTouchStart={(event) => {
                          if (!event.touches[0]) return;
                          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                          const touch = event.touches[0];
                          swipeToReplyRef.current = { id: msg.id, startX: touch.clientX, currentX: touch.clientX };
                          longPressTimerRef.current = setTimeout(() => {
                            openMessageActions(msg, touch.clientX, touch.clientY);
                            swipeToReplyRef.current = { id: null, startX: 0, currentX: 0 };
                          }, 800);
                        }}
                        onTouchEnd={(e) => {
                          if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                          }

                          if (swipeToReplyRef.current.id === msg.id) {
                             const diffX = swipeToReplyRef.current.currentX - swipeToReplyRef.current.startX;
                             if (diffX > 60) {
                               setReplyingTo(msg);
                               e.currentTarget.style.transform = 'translateX(0px)';
                               swipeToReplyRef.current = { id: null, startX: 0, currentX: 0 };
                               return;
                             }
                             e.currentTarget.style.transform = 'translateX(0px)';
                          }
                          swipeToReplyRef.current = { id: null, startX: 0, currentX: 0 };

                          const now = Date.now();
                          const lastTap = lastTapRef.current;
                          const isDoubleTap = lastTap.id === msg.id && (now - lastTap.time) < 320;
                          if (isDoubleTap) {
                            void quickReactToMessage(msg, '❤️');
                            lastTapRef.current = { id: null, time: 0 };
                            return;
                          }

                          lastTapRef.current = { id: msg.id, time: now };
                        }}
                        onTouchMove={(e) => {
                          if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                          }
                          if (swipeToReplyRef.current.id === msg.id && e.touches[0]) {
                            const currentX = e.touches[0].clientX;
                            swipeToReplyRef.current.currentX = currentX;
                            const diffX = currentX - swipeToReplyRef.current.startX;
                            if (diffX > 0 && diffX < 100) {
                                e.currentTarget.style.transform = `translateX(${diffX}px)`;
                            }
                          }
                        }}
                        onTouchCancel={(e) => {
                          if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                          }
                          if (swipeToReplyRef.current.id === msg.id) {
                            e.currentTarget.style.transform = 'translateX(0px)';
                          }
                          swipeToReplyRef.current = { id: null, startX: 0, currentX: 0 };
                        }}
                        style={{ transition: 'transform 0.1s ease-out' }}
                      >
                        {/* Reply Snippet */}
                        {msg.is_forwarded && (
                           <div className="flex items-center gap-1 mb-1 text-[10px] text-white/70 italic" style={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)' }}>
                               <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 21l9-9-9-9v6H3v6h9z"/></svg>
                               Forwarded
                           </div>
                        )}
                        {msg.replyTo && (
                          <div className={`mb-1.5 p-2 rounded bg-black/10 text-[12px] border-l-2 ${isMe ? 'border-white/50 text-white/90' : 'border-[#009EE2]/50 text-[#111B21]/80'}`}>
                            <div className="font-bold">{msg.replyTo.senderName}</div>
                            <div className="truncate max-w-[200px] sm:max-w-[280px] opacity-80">{msg.replyTo.text}</div>
                          </div>
                        )}
                        {/* Voice Note Player */}
                        {msg.type === 'voice' ? (
                          <VoiceNotePlayer
                            src={rawText.match(/\((.*?)\)/)?.[1] || rawText}
                            isMe={isMe}
                            isUploading={msg.isUploading}
                          />
                        ) : msg.type === 'image' ? (
                          <div className="rounded-[16px] overflow-hidden max-w-[280px] sm:max-w-[340px] w-full bg-neutral-100 relative">
                            {msg.isUploading || !imageUrl ? (
                              <div className="h-[200px] w-full flex flex-col items-center justify-center text-xs text-neutral-400 gap-2 font-medium">
                                <svg className="animate-spin h-6 w-6 text-[#009EE2] dark:text-[#F8F9FA]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing Media...
                              </div>
                            ) : (
                              <img src={imageUrl} alt="Shared Layout Media" className="max-h-[260px] w-full object-cover hover:opacity-95 cursor-pointer transition-opacity" />
                            )}
                          </div>
                        ) : (
                          <div className="leading-relaxed break-words whitespace-pre-wrap tracking-wide font-sans">
                            <ReactMarkdown
                              components={{
                                p: ({ node, ...props }) => <p className="m-0 inline" {...props} />,
                                a: ({ node, ...props }) => <a className={`${isMe ? 'text-white underline font-medium' : 'text-[#009EE2] dark:text-[#F8F9FA] underline'} break-all`} target="_blank" rel="noreferrer" {...props} />
                              }}
                            >
                              {rawText}
                            </ReactMarkdown>
                          </div>
                        )}

                        {/* Meta Timestamp */}
                        <div className={`flex items-center justify-end gap-1 mt-1.5 text-[10px] select-none pointer-events-none ${isMe ? 'text-white/70' : 'text-[#6C757D] dark:text-gray-400'}`}>
                          <span className="uppercase font-normal tracking-tight">
                            {msg.isUploading ? 'Sending...' : '12:53 PM'}
                          </span>
                          {isMe && !msg.isUploading && <DoubleCheckIcon color={msg.isRead ? "#009EE2" : "#8696a0"} />}
                        </div>

                        {sortedReactions.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {sortedReactions.map(([emoji, count]) => (
                              <span key={`${msg.id}-${emoji}`} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isMe ? 'bg-white dark:bg-black/20 text-white' : 'bg-[#E9ECEF] text-[#212529] dark:text-white'}`}>
                                {emoji} {count}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {!isMe && (
                      <div className="pl-[46px] text-[13px] text-[#6C757D] dark:text-gray-400 font-normal">
                        {selectedChatUser.display_name}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* 3. Bottom Control Anchor Panel Bar */}
            <div className="p-3 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-black shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10 shrink-0">
               {replyingTo && (
                 <div className="flex items-center justify-between mb-2 p-2 bg-neutral-100 rounded-lg border-l-4 border-[#009EE2]">
                   <div className="min-w-0">
                     <p className="text-xs font-bold text-[#009EE2] dark:text-[#F8F9FA]">Replying to {replyingTo.senderId === firebaseUser?.uid ? 'You' : activeChat.otherUser.display_name}</p>
                     <p className="text-xs text-neutral-600 truncate max-w-[200px] sm:max-w-[300px]">
                       {replyingTo.type === 'text' ? replyingTo.text : `[${replyingTo.type}]`}
                     </p>
                   </div>
                   <button onClick={() => setReplyingTo(null)} className="p-1 text-neutral-400 hover:text-neutral-600 transition">
                     ✕
                   </button>
                 </div>
               )}
               {isBlocked || isBlockingMe ? (
                 <div className="p-3 text-center text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl">
                   {isBlocked ? "You have blocked this user." : "This user is unavailable."}
                 </div>
               ) : studyPartners[selectedChatUser.uid] === true || selectedChatUser.uid === firebaseUser?.uid ? (
                <AvelutMessageInput
                  onSend={(text) => sendMsg(text, 'text')}
                  startRecording={startRecording}
                  handleMove={handleMove}
                  stopRecording={stopRecording}
                  isRecording={isRecording}
                  isLocked={isLocked}
                  setIsLocked={setIsLocked}
                  recordDuration={recordDuration}
                  onFileSelect={handleFileSelection}
                  onImageSelect={handleImageSelection}
                  onTyping={() => handleTypingStatus('typing')}
                />
              ) : (
                <div className="w-[95%] mx-auto px-6 py-4 bg-amber-50/95 backdrop-blur-md border border-amber-200 rounded-2xl text-center flex flex-col items-center justify-center gap-3 shadow-lg">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#856404]">
                    <span>🔒</span>
                    <span>You can only message active Study Mates.</span>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {partnerRequests[selectedChatUser.uid]?.status === 'sent' ? (
                      <button
                        type="button"
                        onClick={() => cancelPartnerRequest(selectedChatUser)}
                        className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold rounded-xl border border-amber-200 transition-all select-none shadow-sm cursor-pointer"
                        title="Cancel Request"
                      >
                        Pending Approval (Cancel)
                      </button>
                    ) : partnerRequests[selectedChatUser.uid]?.status === 'received' ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => acceptPartnerRequest(selectedChatUser)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all select-none shadow-sm cursor-pointer"
                        >
                          Accept Request
                        </button>
                        <button
                          type="button"
                          onClick={() => declinePartnerRequest(selectedChatUser)}
                          className="px-4 py-2 bg-white dark:bg-black hover:bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded-xl transition-all select-none shadow-sm cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sendPartnerRequest(selectedChatUser)}
                        className="px-5 py-2.5 bg-[#009EE2] hover:bg-[#0070B8] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all select-none shadow-sm cursor-pointer"
                      >
                        Add Study Mate
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {messageActionTarget && (
              <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px] transition-opacity flex items-center justify-center animate-fade-in" onClick={closeMessageActions}>
                <div 
                   ref={messageActionMenuRef}
                   className="flex flex-col gap-4 items-center"
                   onClick={(e) => e.stopPropagation()}
                >
                   {/* WhatsApp-style Reaction Overlay */}
                   <div className="bg-white dark:bg-black rounded-[24px] px-3 py-2 shadow-xl flex items-center gap-1 sm:gap-2 animate-scale-in">
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => void reactToMessage(emoji)}
                          className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center text-2xl hover:scale-125 hover:-translate-y-2 transition-transform duration-200"
                        >
                          {emoji}
                        </button>
                      ))}
                      <button className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-[#F0F2F5] hover:bg-[#E9ECEF] text-xl font-medium text-[#6C757D] dark:text-gray-400 ml-2 transition-colors">
                        +
                      </button>
                   </div>
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="mx-auto max-w-md px-6 text-center select-none">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[30px] bg-white dark:bg-black shadow-sm border border-[#E9ECEF] dark:border-white/10">
              <img src="/logo_icon.png" alt="AVELUT" className="w-14 h-14 object-contain" />
            </div>
            <h2 className="mt-5 text-2xl font-black tracking-wide text-[#212529] dark:text-white">AVELUT</h2>
            <p className="mt-2 text-sm leading-6 text-[#6C757D] dark:text-gray-400">Pick a person to start a new chat and connect with them.</p>
          </div>
        )}
      </div>


      {/* Report User Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-black rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-100 animate-slide-up">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Report User</h3>
            <p className="text-sm text-slate-500 dark:text-gray-400 mb-4 font-semibold">Why are you reporting this user?</p>
            <select 
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full mb-4 p-3 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-700 bg-slate-50 dark:bg-black outline-none"
            >
              <option value="spam">Spam / Unsolicited Messages</option>
              <option value="harassment">Harassment / Bullying</option>
              <option value="inappropriate">Inappropriate Content</option>
              <option value="scam">Scam / Fraud</option>
              <option value="other">Other</option>
            </select>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowReportModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleReportSubmit} className="px-4 py-2 text-sm font-black text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Submit Report</button>
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {isForwardModalOpen && (
        <ForwardModal
          isOpen={isForwardModalOpen}
          onClose={() => {
            setIsForwardModalOpen(false);
            setForwardTargetContent('');
          }}
          messageText={forwardTargetContent}
          messageType={forwardTargetType}
          studyPartners={studyPartners}
          allUsers={allUsers}
          onForward={async (recipientIds) => {
            await forwardMessageToUsers(forwardTargetContent, forwardTargetType, recipientIds);
            setIsForwardModalOpen(false);
            setForwardTargetContent('');
          }}
        />
      )}
    </div>
  );
};

// Standalone Forward Modal component for reuse and clean scope
interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageText: string;
  messageType: string;
  studyPartners: Record<string, boolean>;
  allUsers: UserProfile[];
  onForward: (recipientIds: string[]) => Promise<void>;
}

const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  onClose,
  messageText,
  messageType,
  studyPartners,
  allUsers,
  onForward
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const partnersList = useMemo(() => {
    const list = allUsers.filter(u => studyPartners[u.uid] === true);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(u => (u.display_name || '').toLowerCase().includes(q) || (u.department_id || '').toLowerCase().includes(q));
  }, [allUsers, studyPartners, searchQuery]);
  const handleToggleSelect = (uid: string) => {
    setSelectedIds(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleForwardAction = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      await onForward(selectedIds);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-black w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-[#E9ECEF] dark:border-white/10 flex flex-col max-h-[75vh] animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-[#E9ECEF] dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#212529] dark:text-white">Forward Message</h2>
            <p className="text-[11px] text-[#6C757D] dark:text-gray-400 font-medium mt-0.5">Select one or more study partners to send this message to.</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-[#6C757D] dark:text-gray-400 text-xs font-bold transition"
          >
            ✕
          </button>
        </div>

        {/* Content preview */}
        <div className="px-5 py-3.5 bg-neutral-50 border-b border-[#E9ECEF] dark:border-white/10 text-xs font-medium text-[#6C757D] dark:text-gray-400">
          <span className="font-bold uppercase tracking-wider block text-[10px] text-[#6C757D] dark:text-gray-400 mb-1">Message Preview</span>
          <p className="truncate max-w-full italic text-neutral-600">
            {messageType === 'voice' ? '🎵 Voice message' : messageType === 'image' ? '📷 Image file' : messageText}
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[#E9ECEF] dark:border-white/10">
          <input
            type="text"
            placeholder="Search partners..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#F8F9FA] dark:bg-black text-sm text-[#212529] dark:text-white px-4 py-2 rounded-xl border border-[#E9ECEF] dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#009EE2]/20 focus:border-[#009EE2] transition shadow-inner"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {partnersList.length === 0 ? (
            <p className="text-center text-xs font-medium text-[#6C757D] dark:text-gray-400 py-8 italic">No study partners found</p>
          ) : (
            partnersList.map(u => {
              const isChecked = selectedIds.includes(u.uid);
              return (
                <div
                  key={u.uid}
                  onClick={() => handleToggleSelect(u.uid)}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer select-none ${isChecked ? 'bg-[#009EE2]/5 border-[#009EE2]' : 'bg-white dark:bg-black border-[#E9ECEF] dark:border-white/10 hover:bg-neutral-50'}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar className="w-9 h-9 rounded-full shrink-0 object-cover" photo_url={u.photo_url} display_name={u.display_name || 'User'} />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-sm text-[#212529] dark:text-white truncate">{u.display_name}</h4>
                      <p className="text-[10px] text-[#6C757D] dark:text-gray-400 font-medium truncate mt-0.5">{u.department_id || 'No Department'}</p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full border-2 transition ml-3" style={{
                    borderColor: isChecked ? '#009EE2' : '#CED4DA',
                    backgroundColor: isChecked ? '#009EE2' : 'transparent'
                  }}>
                    {isChecked && (
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#E9ECEF] dark:border-white/10 bg-[#F8F9FA] dark:bg-black flex gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 bg-white dark:bg-black hover:bg-neutral-100 border border-[#E9ECEF] dark:border-white/10 text-[#6C757D] dark:text-gray-400 font-bold text-xs uppercase tracking-wider py-3.5 rounded-xl transition cursor-pointer select-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleForwardAction}
            disabled={selectedIds.length === 0 || submitting}
            className="flex-1 bg-[#009EE2] hover:bg-[#0070B8] text-white font-black text-xs uppercase tracking-wider py-3.5 rounded-xl transition cursor-pointer select-none disabled:opacity-50 disabled:bg-neutral-300"
          >
            {submitting ? 'Forwarding...' : `Send (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};
