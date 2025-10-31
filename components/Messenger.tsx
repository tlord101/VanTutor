import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { UserProfile, PrivateChat, PrivateMessage } from '../types';
import { db } from '../firebase';
import { supabase } from '../supabase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, setDoc, addDoc, serverTimestamp, updateDoc, writeBatch, limit, getDocs, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useToast } from '../hooks/useToast';
import { SendIcon } from './icons/SendIcon';
import { PaperclipIcon } from './icons/PaperclipIcon';
import { XIcon } from './icons/XIcon';
import ReactMarkdown from 'react-markdown';
import { Avatar } from './Avatar';
import { ConfirmationModal } from './ConfirmationModal';
import { MoreHorizontalIcon } from './icons/MoreHorizontalIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';


const MicrophoneIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
);

const PlayIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.748 1.295 2.536 0 3.284L7.279 20.99c-1.25.72-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
    </svg>
);

const PauseIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 00-.75.75v12a.75.75 0 00.75.75h.75a.75.75 0 00.75-.75V6a.75.75 0 00-.75-.75H6.75zm8.25 0a.75.75 0 00-.75.75v12a.75.75 0 00.75.75h.75a.75.75 0 00.75-.75V6a.75.75 0 00-.75-.75h-.75z" clipRule="evenodd" />
    </svg>
);

const PhotoPlaceholderIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

const OneTimeViewIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );

// Fix: Define the missing PhotoOpenedIcon component.
const PhotoOpenedIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.432 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const formatLastSeen = (timestamp: number): string => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);

    if (seconds < 60) return `now`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
};

const UserStatusIndicator: React.FC<{ isOnline?: boolean; lastSeen?: number }> = ({ isOnline, lastSeen }) => {
    if (isOnline) {
        return <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>;
    }
    return <div className="w-3 h-3 bg-gray-400 rounded-full border-2 border-white"></div>;
};

// --- Sub-component: AudioPlayer ---
const AudioPlayer: React.FC<{ src: string, duration: number, theme: 'light' | 'dark' }> = ({ src, duration, theme }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(err => console.error("Audio play failed:", err));
        }
    };
    
    useEffect(() => {
        const audio = new Audio(src);
        audioRef.current = audio;

        const onPlaying = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => { setIsPlaying(false); setProgress(0); };
        const onTimeUpdate = () => {
            if (audio.duration) {
                setProgress((audio.currentTime / audio.duration) * 100);
            }
        };

        audio.addEventListener('playing', onPlaying);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('timeupdate', onTimeUpdate);
        
        return () => {
            audio.pause();
            audio.removeEventListener('playing', onPlaying);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('timeupdate', onTimeUpdate);
        };
    }, [src]);

    const formatDuration = (seconds: number) => {
        if (isNaN(seconds) || seconds === 0) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };
    
    const themeClasses = {
        light: {
            buttonBg: 'bg-black/10 hover:bg-black/20', buttonIcon: 'text-black/70',
            progressBg: 'bg-black/10', progressFg: 'bg-black/50', text: 'text-black/60',
        },
        dark: {
            buttonBg: 'bg-white/20 hover:bg-white/30', buttonIcon: 'text-white',
            progressBg: 'bg-white/20', progressFg: 'bg-white', text: 'text-white/80',
        }
    };
    const colors = theme === 'dark' ? themeClasses.dark : themeClasses.light;

    return (
        <div className="flex items-center gap-2 w-full max-w-[220px] sm:max-w-xs">
            <button onClick={togglePlay} className={`w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${colors.buttonBg} ${colors.buttonIcon}`}>
                {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
            </button>
            <div className={`w-full h-1.5 rounded-full ${colors.progressBg}`}>
                <div className={`h-full rounded-full ${colors.progressFg}`} style={{ width: `${progress}%` }}></div>
            </div>
            <span className={`text-xs font-mono w-12 text-right ${colors.text}`}>{formatDuration(duration)}</span>
        </div>
    );
};


// --- Sub-component: PrivateChatView ---
interface PrivateChatViewProps {
  chat: PrivateChat | null;
  currentUser: UserProfile;
  otherUser: { uid: string, displayName: string, photoURL?: string, isOnline?: boolean, lastSeen?: number };
  onBack: () => void;
  onOpenConfirmationModal: (options: { title: string; message: string; onConfirm: () => void; confirmText?: string }) => void;
  onDeleteMessage: (chatId: string, message: PrivateMessage) => void;
}

const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} disabled={disabled} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-lime-500 disabled:opacity-50 ${ checked ? 'bg-lime-600' : 'bg-gray-200' }`} >
      <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${ checked ? 'translate-x-6' : 'translate-x-1' }`} />
    </button>
);

const OneTimeImageViewer: React.FC<{ imageUrl: string; onClose: () => void }> = ({ imageUrl, onClose }) => {
    return (
        <div
            className="secure-view-modal fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center animate-fade-in-up"
            onClick={onClose}
        >
            <div className="relative secure-view-overlay" onClick={(e) => e.stopPropagation()}>
                <img
                    src={imageUrl}
                    alt="One-time view"
                    className="max-w-[95vw] max-h-[85vh] object-contain select-none"
                    onContextMenu={(e) => e.preventDefault()}
                />
            </div>
            <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white p-2 bg-black/50 rounded-full hover:bg-black/80"
            >
                <XIcon className="w-8 h-8" />
            </button>
            <div className="absolute bottom-4 text-center text-white/70 bg-black/50 px-4 py-2 rounded-full text-sm">
                This photo can only be viewed once. Screenshots are not allowed.
            </div>
        </div>
    );
};

const PrivateChatView: React.FC<PrivateChatViewProps> = ({ chat, currentUser, otherUser, onBack, onOpenConfirmationModal, onDeleteMessage }) => {
    const [messages, setMessages] = useState<PrivateMessage[]>([]);
    const [input, setInput] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    
    const [activeMessageMenu, setActiveMessageMenu] = useState<{ x: number, y: number, msg: PrivateMessage } | null>(null);
    const [editingMessage, setEditingMessage] = useState<PrivateMessage | null>(null);
    const [editText, setEditText] = useState('');
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ opacity: 0, pointerEvents: 'none' });
    const [isOneTime, setIsOneTime] = useState(false);
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<PrivateMessage | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<number | null>(null);
    const recordingStartRef = useRef<number>(0);
    const typingTimeoutRef = useRef<number | null>(null);
    const longPressTimer = useRef<number>();
    const micLongPressTimer = useRef<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const swipeState = useRef({ startX: 0, startY: 0, isScrolling: null as boolean | null, messageId: null as string | null });
    const messageRefs = useRef(new Map<string, HTMLDivElement>());
    const { addToast } = useToast();

    const isOtherUserTyping = chat?.typing?.includes(otherUser.uid) ?? false;

    useEffect(() => {
        const handleClickOutside = () => setActiveMessageMenu(null);
        if (activeMessageMenu) {
            window.addEventListener('click', handleClickOutside);
            window.addEventListener('contextmenu', handleClickOutside, true);

            if (menuRef.current) {
                const menu = menuRef.current;
                const { width: menuWidth, height: menuHeight } = menu.getBoundingClientRect();
                
                let finalX = activeMessageMenu.x - menuWidth - 10;
                let finalY = activeMessageMenu.y;

                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                if (finalX < 10) {
                    finalX = activeMessageMenu.x + 10;
                }
                
                if (finalX + menuWidth > viewportWidth) {
                    finalX = viewportWidth - menuWidth - 10;
                }

                if (finalY + menuHeight > viewportHeight) {
                    finalY = viewportHeight - menuHeight - 10;
                }
                if (finalY < 10) {
                    finalY = 10;
                }

                setMenuStyle({
                    top: `${finalY}px`,
                    left: `${finalX}px`,
                    opacity: 1,
                    pointerEvents: 'auto',
                    transition: 'opacity 0.1s ease-in-out'
                });
            }

        } else {
            setMenuStyle({ opacity: 0, pointerEvents: 'none' });
        }
        return () => {
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('contextmenu', handleClickOutside, true);
        };
    }, [activeMessageMenu]);

    useEffect(() => {
      if (!chat) return;
        const messagesRef = collection(db, 'privateChats', chat.id, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMessages: PrivateMessage[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                fetchedMessages.push({ id: doc.id, ...data, timestamp: data.timestamp?.toMillis() || Date.now() } as PrivateMessage);
            });
            setMessages(fetchedMessages);
        });
        return unsubscribe;
    }, [chat?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isSending, isOtherUserTyping]);

    useEffect(() => {
      if (!chat) return;
        const markAsRead = async () => {
            const chatRef = doc(db, 'privateChats', chat.id);
            const chatSnap = await getDoc(chatRef);
            if (chatSnap.exists()) {
                const chatData = chatSnap.data() as PrivateChat;
                if (chatData.lastMessage && !chatData.lastMessage.readBy.includes(currentUser.uid)) {
                    const newReadBy = [...chatData.lastMessage.readBy, currentUser.uid];
                    await updateDoc(chatRef, { 'lastMessage.readBy': newReadBy });
                }
            }
        };
        markAsRead();
    }, [chat?.id, currentUser.uid, messages]);

    const updateTypingStatus = useCallback(async (isTyping: boolean) => {
        if (!chat) return;
        const chatRef = doc(db, 'privateChats', chat.id);
        if (isTyping) {
            await updateDoc(chatRef, { typing: arrayUnion(currentUser.uid) });
        } else {
            await updateDoc(chatRef, { typing: arrayRemove(currentUser.uid) });
        }
    }, [chat?.id, currentUser.uid]);

    useEffect(() => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        if (input) {
            updateTypingStatus(true);
            typingTimeoutRef.current = window.setTimeout(() => {
                updateTypingStatus(false);
            }, 3000); // User is considered not typing after 3 seconds of inactivity
        } else {
            updateTypingStatus(false);
        }
        return () => {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, [input, updateTypingStatus]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        } else if (file) {
            addToast('Only image files are allowed.', 'error');
        }
    };
    
    const handleSend = async (text?: string, audioBlob?: Blob, audioDuration?: number) => {
        const textToSend = text !== undefined ? text : input;
        if ((!textToSend.trim() && !imageFile && !audioBlob) || isSending || isRecording || !chat) return;
        
        setIsSending(true);

        const tempInput = input;
        const tempImageFile = imageFile;
        const tempIsOneTime = isOneTime;
        const tempReplyingTo = replyingTo;
        setInput('');
        setImageFile(null);
        setImagePreview(null);
        setIsOneTime(false);
        setReplyingTo(null);
        updateTypingStatus(false);

        try {
            let imageUrl: string | undefined;
            let audioUrl: string | undefined;

            if (tempImageFile) {
                const filePath = `private-chats/${chat.id}/${Date.now()}-${tempImageFile.name}`;
                const { error } = await supabase.storage.from('private-chats').upload(filePath, tempImageFile);
                if(error) throw error;
                const { data } = supabase.storage.from('private-chats').getPublicUrl(filePath);
                imageUrl = data.publicUrl;
            } else if (audioBlob) {
                const filePath = `private-chats/${chat.id}/${Date.now()}.webm`;
                const { error } = await supabase.storage.from('private-chats').upload(filePath, audioBlob);
                if(error) throw error;
                const { data } = supabase.storage.from('private-chats').getPublicUrl(filePath);
                audioUrl = data.publicUrl;
            }

            const batch = writeBatch(db);
            const messagesRef = collection(db, 'privateChats', chat.id, 'messages');
            const newMessageRef = doc(messagesRef);

            const messageData: Partial<PrivateMessage> = {
                senderId: currentUser.uid,
                timestamp: serverTimestamp() as any,
                ...(textToSend && { text: textToSend }),
                ...(imageUrl && { imageUrl }),
                ...(audioUrl && { audioUrl, audioDuration }),
                ...(tempImageFile && tempIsOneTime && { isOneTimeView: true, viewedBy: [] }),
                ...(tempReplyingTo && {
                    replyTo: {
                        messageId: tempReplyingTo.id,
                        text: tempReplyingTo.text?.substring(0, 80),
                        imageUrl: tempReplyingTo.imageUrl,
                        audioUrl: tempReplyingTo.audioUrl,
                        senderId: tempReplyingTo.senderId
                    }
                }),
            };
            batch.set(newMessageRef, messageData);

            const chatRef = doc(db, 'privateChats', chat.id);
            const now = Date.now();
            const lastMessageText = textToSend ? textToSend : (imageUrl ? (tempIsOneTime ? 'Sent a photo' : 'Sent an image') : 'Sent a voice message');
            const lastMessageData = { text: lastMessageText, timestamp: now, senderId: currentUser.uid, readBy: [currentUser.uid] };
            
            batch.update(chatRef, { lastMessage: lastMessageData, lastActivityTimestamp: now });
            await batch.commit();

        } catch (error) {
            console.error("Error sending message:", error);
            addToast('Failed to send message.', 'error');
            setInput(tempInput); // Restore input on failure
        } finally {
            setIsSending(false);
        }
    };

    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const duration = Math.round((Date.now() - recordingStartRef.current) / 1000);
                handleSend(undefined, audioBlob, duration);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            recordingStartRef.current = Date.now();
            recordingIntervalRef.current = window.setInterval(() => setRecordingSeconds(prev => prev + 1), 1000);
        } catch (error) {
            console.error("Error starting recording:", error);
            addToast("Could not access microphone. Please check permissions.", "error");
        }
    };
    
    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if(recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
            setRecordingSeconds(0);
        }
    };
    
    const handleMicPress = () => {
        if (isRecording) return;
        micLongPressTimer.current = window.setTimeout(() => {
            handleStartRecording();
        }, 300);
    };

    const handleMicRelease = () => {
        if (micLongPressTimer.current) {
            clearTimeout(micLongPressTimer.current);
            micLongPressTimer.current = null;
        }
        if (isRecording) {
            handleStopRecording();
        } else {
            addToast("Hold to record, release to send", "info");
        }
    };

    const confirmDeleteMessage = (message: PrivateMessage) => {
        setActiveMessageMenu(null);
        if (!chat) return;
        onOpenConfirmationModal({
            title: 'Delete Message',
            message: 'Are you sure you want to permanently delete this message?',
            onConfirm: () => onDeleteMessage(chat.id, message),
            confirmText: 'Delete'
        });
    };
    
    const handleSaveEdit = async () => {
        if (!editingMessage || !editText.trim() || !chat) return;
        const msgRef = doc(db, 'privateChats', chat.id, 'messages', editingMessage.id);
        try {
            await updateDoc(msgRef, {
                text: editText.trim(),
                isEdited: true,
            });
            setEditingMessage(null);
            setEditText('');
            addToast('Message edited.', 'success');
        } catch (error) {
            console.error("Error editing message:", error);
            addToast("Could not save message.", 'error');
        }
    };
    
    const openMessageMenu = (e: React.MouseEvent | React.TouchEvent, msg: PrivateMessage) => {
        e.preventDefault();
        const touch = 'touches' in e ? e.touches[0] : null;
        setActiveMessageMenu({
            x: touch ? touch.clientX : e.clientX,
            y: touch ? touch.clientY : e.clientY,
            msg,
        });
    };
    
    const handleTouchStart = (e: React.TouchEvent, msg: PrivateMessage) => {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = window.setTimeout(() => {
            openMessageMenu(e, msg);
        }, 500); // 500ms for long press

        swipeState.current = {
            startX: e.touches[0].clientX,
            startY: e.touches[0].clientY,
            isScrolling: null,
            messageId: msg.id,
        };
        const msgEl = messageRefs.current.get(msg.id);
        if (msgEl) {
            msgEl.style.transition = 'none';
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (swipeState.current.messageId === null) return;
        const deltaX = e.touches[0].clientX - swipeState.current.startX;
        const deltaY = e.touches[0].clientY - swipeState.current.startY;
        
        if (swipeState.current.isScrolling === null) {
            const isScrolling = Math.abs(deltaY) > Math.abs(deltaX);
            swipeState.current.isScrolling = isScrolling;
            if(!isScrolling) {
                clearTimeout(longPressTimer.current);
            }
        }
        
        if (!swipeState.current.isScrolling) {
            if (e.cancelable) e.preventDefault();
            const msgEl = messageRefs.current.get(swipeState.current.messageId);
            if (!msgEl) return;
            const translateX = Math.min(Math.max(0, deltaX), 80);
            msgEl.style.transform = `translateX(${translateX}px)`;
        }
    };
    
    const handleTouchEnd = (msg: PrivateMessage) => {
        clearTimeout(longPressTimer.current);
        if (swipeState.current.messageId === null || swipeState.current.isScrolling) {
            swipeState.current = { startX: 0, startY: 0, isScrolling: null, messageId: null };
            return;
        }

        const msgEl = messageRefs.current.get(swipeState.current.messageId);
        if (!msgEl) return;

        const transform = msgEl.style.transform;
        const translateX = transform ? parseFloat(transform.split('(')[1]) : 0;
        
        msgEl.style.transition = 'transform 0.3s ease';
        msgEl.style.transform = 'translateX(0px)';

        if (translateX > 60) {
            setReplyingTo(msg);
        }

        swipeState.current = { startX: 0, startY: 0, isScrolling: null, messageId: null };
    };

    const startEditing = (msg: PrivateMessage) => {
        setEditingMessage(msg);
        setEditText(msg.text || '');
        setActiveMessageMenu(null);
    };
    
    const handleViewOneTimeImage = async (msg: PrivateMessage) => {
        if (!chat || !msg.imageUrl) return;
        setViewingImage(msg.imageUrl);
        const msgRef = doc(db, 'privateChats', chat.id, 'messages', msg.id);
        try {
            await updateDoc(msgRef, {
                viewedBy: arrayUnion(currentUser.uid)
            });
        } catch (error) {
            console.error("Failed to mark one-time view image as read:", error);
        }
    };
    
    const renderMessageContent = (msg: PrivateMessage) => {
        const isSender = msg.senderId === currentUser.uid;

        if (msg.isOneTimeView && msg.imageUrl) {
            const isViewedByCurrentUser = msg.viewedBy?.includes(currentUser.uid);

            if (isSender) {
                return (
                    <div className="flex items-center gap-2 p-3 text-white/90 italic">
                        <OneTimeViewIcon className="w-5 h-5 flex-shrink-0" />
                        <span>Photo sent (one-time)</span>
                    </div>
                );
            }

            if (isViewedByCurrentUser) {
                return (
                    <div className="flex items-center gap-2 p-3 text-gray-500 italic">
                        <PhotoOpenedIcon className="w-5 h-5" />
                        <span>Photo opened</span>
                    </div>
                );
            }

            return (
                <button
                    onClick={() => handleViewOneTimeImage(msg)}
                    className="flex items-center gap-3 p-3 bg-gray-300 hover:bg-gray-400/80 transition-colors rounded-lg"
                >
                    <PhotoPlaceholderIcon className="w-8 h-8 text-gray-700" />
                    <div>
                        <p className="font-bold text-gray-800">Photo</p>
                        <p className="text-sm text-gray-600">Tap to view</p>
                    </div>
                </button>
            );
        }
        
        const replySenderName = msg.replyTo?.senderId === currentUser.uid ? 'You' : otherUser.displayName;

        return <>
            {msg.replyTo && (
                <a href={`#message-${msg.replyTo.messageId}`} onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`message-${msg.replyTo.messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }} className={`block p-2 mb-1 rounded-md opacity-80 ${isSender ? 'bg-white/20' : 'bg-black/5'}`}>
                    <p className={`text-xs font-bold ${isSender ? 'text-white' : 'text-lime-700'}`}>
                        {replySenderName}
                    </p>
                    <p className={`text-sm mt-0.5 truncate ${isSender ? 'text-white/90' : 'text-gray-600'}`}>
                        {msg.replyTo.text || (msg.replyTo.imageUrl && 'Photo') || (msg.replyTo.audioUrl && 'Voice message')}
                    </p>
                </a>
            )}
            {msg.imageUrl && <img src={msg.imageUrl} alt="Sent attachment" className="rounded-lg mb-2 max-h-64" />}
            {msg.audioUrl && msg.audioDuration != null && <AudioPlayer src={msg.audioUrl} duration={msg.audioDuration} theme={isSender ? 'dark' : 'light'} />}
            {msg.text && <div className="text-sm whitespace-pre-wrap"><ReactMarkdown>{msg.text}</ReactMarkdown></div>}
            {msg.isEdited && <span className="text-xs opacity-70 ml-2">(edited)</span>}
        </>
    };

    if (!chat) {
      return <div className="h-full flex items-center justify-center text-gray-500">Select a chat to start messaging.</div>;
    }
    
    return (
        <div className="h-full flex flex-col bg-white">
            {viewingImage && (
                <OneTimeImageViewer
                    imageUrl={viewingImage}
                    onClose={() => setViewingImage(null)}
                />
            )}
            <header className="flex-shrink-0 flex items-center gap-3 p-3 border-b border-gray-200">
                <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-900 rounded-full">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                 <div className="relative">
                    <Avatar displayName={otherUser.displayName} photoURL={otherUser.photoURL} className="w-10 h-10" />
                    <div className="absolute -bottom-1 -right-1">
                        <UserStatusIndicator isOnline={otherUser.isOnline} />
                    </div>
                 </div>
                <div className="flex-1">
                    <h3 className="font-bold text-gray-800 leading-tight">{otherUser.displayName}</h3>
                    <p className="text-xs text-gray-500 leading-tight">{isOtherUserTyping ? 'typing...' : (otherUser.isOnline ? 'Online' : (otherUser.lastSeen ? `Active ${formatLastSeen(otherUser.lastSeen)}` : 'Offline'))}</p>
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-40 md:pb-4">
                {messages.map(msg => (
                    <div key={msg.id} id={`message-${msg.id}`} className={`flex gap-3 items-end group ${msg.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}`}>
                       <div 
                         ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                         className={`max-w-[80%] p-1 rounded-2xl disable-text-selection ${msg.senderId === currentUser.uid ? 'bg-lime-500 text-white' : 'bg-gray-200 text-gray-800'}`}
                         onContextMenu={(e) => msg.senderId === currentUser.uid && openMessageMenu(e, msg)}
                         onTouchStart={(e) => handleTouchStart(e, msg)}
                         onTouchMove={handleTouchMove}
                         onTouchEnd={() => handleTouchEnd(msg)}
                       >
                            <div className="p-2">
                                {editingMessage?.id === msg.id ? (
                                    <div>
                                        <textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); } }}
                                            className="w-full bg-white/90 text-gray-800 rounded-lg p-2 text-sm border-2 border-lime-300 focus:outline-none focus:ring-2 focus:ring-lime-400"
                                            autoFocus
                                        />
                                        <div className="flex justify-end gap-2 mt-2 text-xs">
                                            <button onClick={() => setEditingMessage(null)} className="font-semibold text-gray-200 hover:text-white">Cancel</button>
                                            <button onClick={handleSaveEdit} className="font-semibold text-white hover:underline">Save</button>
                                        </div>
                                    </div>
                                ) : (
                                    renderMessageContent(msg)
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                 {isOtherUserTyping && (
                    <div className="flex gap-3 items-end justify-start animate-fade-in-up">
                        <div className="p-3 rounded-2xl bg-gray-200 text-gray-800">
                           <div className="flex items-center space-x-2"><div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.3s]"></div><div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div></div>
                        </div>
                    </div>
                 )}
                 {isSending && <div className="flex justify-end"><div className="p-3 rounded-2xl bg-lime-300"><div className="flex items-center space-x-2"><div className="w-2 h-2 bg-white rounded-full animate-pulse [animation-delay:-0.3s]"></div><div className="w-2 h-2 bg-white rounded-full animate-pulse [animation-delay:-0.15s]"></div><div className="w-2 h-2 bg-white rounded-full animate-pulse"></div></div></div></div>}
                <div ref={messagesEndRef} />
            </div>
             {activeMessageMenu && activeMessageMenu.msg.senderId === currentUser.uid && (
                <div
                    ref={menuRef}
                    style={menuStyle}
                    className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 z-50"
                >
                    <ul className="py-1">
                        {activeMessageMenu.msg.text && (
                            <li><button onClick={() => startEditing(activeMessageMenu.msg)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"><PencilIcon className="w-4 h-4" /> Edit</button></li>
                        )}
                        <li><button onClick={() => confirmDeleteMessage(activeMessageMenu.msg)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><TrashIcon className="w-4 h-4" /> Delete</button></li>
                    </ul>
                </div>
            )}
            <footer className="md:relative fixed bottom-28 w-full md:w-auto left-0 right-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm md:backdrop-blur-none md:bg-white">
                 <div className="w-full max-w-md mx-auto">
                    {replyingTo && (
                        <div className="px-4 pt-2">
                           <div className="bg-gray-100 rounded-t-lg p-2 flex justify-between items-center border-l-4 border-lime-500 animate-fade-in-up">
                                <div>
                                    <p className="text-xs font-bold text-lime-600">
                                        Replying to {replyingTo.senderId === currentUser.uid ? 'Yourself' : otherUser.displayName}
                                    </p>
                                    <p className="text-sm text-gray-600 truncate max-w-xs sm:max-w-sm">
                                        {replyingTo.text || (replyingTo.imageUrl && 'Photo') || (replyingTo.audioUrl && 'Voice message')}
                                    </p>
                                </div>
                                <button onClick={() => setReplyingTo(null)} className="p-1 rounded-full text-gray-400 hover:bg-gray-200">
                                    <XIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                    <div className={`p-3 ${replyingTo ? 'pt-1' : ''}`}>
                      {imagePreview && (
                          <div className="relative mb-2">
                               <div className="relative w-20 h-20 p-1 border rounded"><img src={imagePreview} className="w-full h-full object-cover rounded"/><button onClick={() => {setImageFile(null); setImagePreview(null);}} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center font-bold">&times;</button></div>
                               <div className="flex items-center gap-2 mt-2 p-2 bg-gray-100 rounded-lg"><Switch checked={isOneTime} onChange={setIsOneTime} /><span className="text-sm text-gray-700">One-Time View</span></div>
                          </div>
                      )}
                      <div className="relative flex items-center">
                          <label className="p-2 cursor-pointer text-gray-500 hover:text-gray-900"><PaperclipIcon className="w-5 h-5" /><input type="file" className="hidden" onChange={handleFileChange} accept="image/*"/></label>
                          {isRecording ? (<div className="flex-1 flex items-center justify-center h-10 px-4 bg-gray-100 rounded-full text-sm"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></span>Recording... {new Date(recordingSeconds * 1000).toISOString().substr(14, 5)}</div>
                          ) : (<input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {if (e.key === 'Enter') handleSend(input)}} placeholder="Type a message..." className="w-full bg-gray-100 border-transparent rounded-full py-2 px-4 text-gray-900 placeholder-gray-500 focus:ring-lime-500 focus:border-lime-500" />)}
                          
                          {!input.trim() && !imageFile ? (
                             <button 
                              onMouseDown={handleMicPress} 
                              onMouseUp={handleMicRelease} 
                              onTouchStart={handleMicPress} 
                              onTouchEnd={handleMicRelease} 
                              disabled={isSending} 
                              className={`ml-2 rounded-full p-3 transition-transform text-white disabled:opacity-50 ${isRecording ? 'bg-red-500 scale-110 animate-pulse' : 'bg-lime-600 hover:bg-lime-700 active:scale-95'}`}
                             >
                                 <MicrophoneIcon className="w-6 h-6" />
                             </button>
                          ) : (
                             <button onClick={() => handleSend(input)} disabled={isSending || (!input.trim() && !imageFile)} className="ml-2 bg-lime-600 rounded-full p-3 text-white hover:bg-lime-700 transition-colors disabled:opacity-50 active:scale-95"><SendIcon className="w-6 h-6" /></button>
                          )}
                      </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};


// --- Main Component: Messenger ---
interface MessengerProps {
  userProfile: UserProfile;
}

export const Messenger: React.FC<MessengerProps> = ({ userProfile }) => {
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [selectedChatData, setSelectedChatData] = useState<PrivateChat | null>(null);

    const [tab, setTab] = useState<'chats' | 'discover'>('chats');
    const [chats, setChats] = useState<PrivateChat[]>([]);
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isMessageDeleting, setIsMessageDeleting] = useState(false);
    
    const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const { addToast } = useToast();
    
    useEffect(() => {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('displayName'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const usersList = snapshot.docs
                .map(doc => doc.data() as UserProfile)
                .filter(u => u.uid !== userProfile.uid);
            setAllUsers(usersList);
            setIsDataLoading(false);
        });
        return unsubscribe;
    }, [userProfile.uid]);

    useEffect(() => {
        const chatsRef = collection(db, 'privateChats');
        const q = query(chatsRef, where('members', 'array-contains', userProfile.uid));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedChats: PrivateChat[] = [];
            snapshot.forEach(doc => fetchedChats.push({ id: doc.id, ...doc.data() } as PrivateChat));
            
            fetchedChats.sort((a, b) => (b.lastActivityTimestamp || 0) - (a.lastActivityTimestamp || 0));

            setChats(fetchedChats);
            
            // Update selected chat data if it's currently open
            if (selectedChatData) {
                const updatedChat = fetchedChats.find(c => c.id === selectedChatData.id);
                if (updatedChat) {
                    setSelectedChatData(updatedChat);
                }
            }
            
            setIsDataLoading(false);
        }, (error) => {
            console.error("Error fetching chats:", error);
            addToast("Could not load your chats.", "error");
            setIsDataLoading(false);
        });
        return unsubscribe;
    }, [userProfile.uid, addToast, selectedChatData]);

    
    const handleStartChat = async (otherUser: UserProfile) => {
        const members = [userProfile.uid, otherUser.uid].sort();
        const chatId = members.join('_');
        const chatRef = doc(db, 'privateChats', chatId);

        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
            const now = Date.now();
            await setDoc(chatRef, {
                members,
                memberInfo: {
                    [userProfile.uid]: { displayName: userProfile.displayName, photoURL: userProfile.photoURL || '' },
                    [otherUser.uid]: { displayName: otherUser.displayName, photoURL: otherUser.photoURL || '' },
                },
                createdAt: now,
                lastActivityTimestamp: now,
                typing: [],
            });
        }
        const newChatData = (await getDoc(chatRef)).data() as PrivateChat;
        setSelectedChatData({ id: chatId, ...newChatData });
        setView('chat');
    };
    
    const handleSelectChat = (chat: PrivateChat) => {
        setSelectedChatData(chat);
        setView('chat');
    };

    const handleDeleteChat = async (chatId: string) => {
        setIsDeleting(true);
        try {
            // Delete Supabase storage folder
            const { data: files, error: listError } = await supabase.storage.from('private-chats').list(chatId);
            if (files && files.length > 0) {
                const filePaths = files.map(f => `${chatId}/${f.name}`);
                await supabase.storage.from('private-chats').remove(filePaths);
            }

            // Delete Firestore documents
            const batch = writeBatch(db);
            const messagesRef = collection(db, 'privateChats', chatId, 'messages');
            const messagesSnap = await getDocs(messagesRef);
            messagesSnap.forEach(doc => batch.delete(doc.ref));

            const chatRef = doc(db, 'privateChats', chatId);
            batch.delete(chatRef);
            await batch.commit();

            addToast('Chat deleted successfully.', 'success');
            if (selectedChatData?.id === chatId) {
                setView('list');
                setSelectedChatData(null);
            }
        } catch (error) {
            console.error("Error deleting chat:", error);
            addToast("Failed to delete chat.", 'error');
        } finally {
            setIsDeleting(false);
            setModalState({ ...modalState, isOpen: false });
        }
    };

    const handleDeleteMessage = async (chatId: string, message: PrivateMessage) => {
        setIsMessageDeleting(true);
        try {
            const msgRef = doc(db, 'privateChats', chatId, 'messages', message.id);
            const chatRef = doc(db, 'privateChats', chatId);
            
            const currentChatSnap = await getDoc(chatRef);
            if (!currentChatSnap.exists()) throw new Error("Chat not found");
            const chatData = currentChatSnap.data() as PrivateChat;

            const isLastMessage = chatData.lastMessage?.timestamp === message.timestamp;

            await deleteDoc(msgRef);

            if (isLastMessage) {
                const messagesQuery = query(collection(db, 'privateChats', chatId, 'messages'), orderBy('timestamp', 'desc'), limit(1));
                const newLastMessagesSnap = await getDocs(messagesQuery);

                if (!newLastMessagesSnap.empty) {
                    const newLastMessageData = newLastMessagesSnap.docs[0].data() as PrivateMessage;
                    const lastMessageText = newLastMessageData.text || 
                        (newLastMessageData.imageUrl ? (newLastMessageData.isOneTimeView ? 'Sent a photo' : 'Sent an image') 
                        : 'Sent a voice message');
                    const lastMessage = {
                        text: lastMessageText,
                        timestamp: (newLastMessageData.timestamp as any).toMillis(),
                        senderId: newLastMessageData.senderId,
                        readBy: [userProfile.uid],
                    };
                    await updateDoc(chatRef, { lastMessage });
                } else {
                    await updateDoc(chatRef, { lastMessage: null });
                }
            }
            addToast('Message deleted.', 'success');
        } catch (error) {
            console.error("Error deleting message:", error);
            addToast("Could not delete message.", 'error');
        } finally {
            setIsMessageDeleting(false);
            setModalState({ ...modalState, isOpen: false });
        }
    };

    const confirmDeleteChat = (chat: PrivateChat) => {
        const otherUserId = chat.members.find(id => id !== userProfile.uid)!;
        const otherUserName = chat.memberInfo[otherUserId]?.displayName || 'this user';
        setModalState({
            isOpen: true,
            title: 'Delete Chat',
            message: `Are you sure you want to permanently delete your conversation with ${otherUserName}? This action cannot be undone.`,
            onConfirm: () => handleDeleteChat(chat.id),
            confirmText: 'Delete'
        });
    };

    const filteredUsers = allUsers.filter(user => 
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const renderListView = () => (
        <div className="h-full flex flex-col bg-white">
            <div className="flex-shrink-0 p-4 border-b border-gray-200">
                <div className="bg-gray-100 p-1 rounded-full flex">
                    <button onClick={() => setTab('chats')} className={`flex-1 p-2 rounded-md font-semibold text-sm transition-colors ${tab === 'chats' ? 'bg-lime-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>Chats</button>
                    <button onClick={() => setTab('discover')} className={`flex-1 p-2 rounded-md font-semibold text-sm transition-colors ${tab === 'discover' ? 'bg-lime-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>Discover</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {tab === 'chats' && (
                    isDataLoading ? <div className="p-4 text-center text-gray-500">Loading chats...</div> :
                    chats.length === 0 ? <div className="p-4 text-center text-gray-500">No chats yet. Find users in the Discover tab.</div> :
                    <ul className="divide-y divide-gray-200">{chats.map(chat => {
                        const otherUserId = chat.members.find(id => id !== userProfile.uid)!;
                        const otherUserInfo = allUsers.find(u => u.uid === otherUserId);
                        const isUnread = chat.lastMessage && !chat.lastMessage.readBy?.includes(userProfile.uid);
                        const otherUserPhotoURL = otherUserInfo?.photoURL || chat.memberInfo[otherUserId]?.photoURL;
                        return <li key={chat.id} className="group p-4 hover:bg-gray-50 flex items-center gap-4 relative">
                             <div onClick={() => handleSelectChat(chat)} className="flex-1 flex items-center gap-4 cursor-pointer">
                                <div className="relative flex-shrink-0">
                                    <Avatar 
                                        displayName={chat.memberInfo[otherUserId]?.displayName} 
                                        photoURL={otherUserPhotoURL} 
                                        className={`w-12 h-12 ${isUnread ? 'ring-2 ring-lime-500 ring-offset-2' : ''}`}
                                    />
                                    <div className="absolute -bottom-1 -right-1">
                                        <UserStatusIndicator isOnline={otherUserInfo?.isOnline} />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex justify-between items-center">
                                        <p className={`font-semibold truncate ${isUnread ? 'text-gray-900' : 'text-gray-700'}`}>{chat.memberInfo[otherUserId]?.displayName}</p>
                                        <p className="text-xs text-gray-400">{chat.lastMessage ? formatLastSeen(chat.lastMessage.timestamp) : ''}</p>
                                    </div>
                                    <p className={`text-sm truncate ${isUnread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>{chat.lastMessage?.text || '...'}</p>
                                </div>
                            </div>
                            <button onClick={() => confirmDeleteChat(chat)} className="p-2 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </li>
                    })}</ul>
                )}
                {tab === 'discover' && (
                    <div className="p-4">
                        <div className="relative mb-4">
                            <input 
                                type="text" 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                placeholder="Filter users..." 
                                className="w-full bg-gray-100 border border-gray-300 rounded-full py-2.5 pl-10 pr-4 text-gray-900 focus:ring-2 focus:ring-lime-500 focus:outline-none transition-colors"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </span>
                        </div>
                        {isDataLoading ? <div className="p-4 text-center text-gray-500">Loading users...</div> :
                         filteredUsers.map(user => 
                            <div key={user.uid} onClick={() => handleStartChat(user)} className="p-3 hover:bg-gray-50 cursor-pointer flex items-center gap-4 rounded-lg">
                                <div className="relative flex-shrink-0">
                                    <Avatar displayName={user.displayName} photoURL={user.photoURL} className="w-12 h-12" />
                                    <div className="absolute -bottom-1 -right-1">
                                       <UserStatusIndicator isOnline={user.isOnline} />
                                    </div>
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-700">{user.displayName}</p>
                                    <p className="text-xs text-gray-500">{user.isOnline ? `Online` : (user.lastSeen ? `Active ${formatLastSeen(user.lastSeen)}` : 'Offline')}</p>
                                </div>
                           </div>
                         )}
                    </div>
                )}
            </div>
        </div>
    );
    
    const getOtherUser = () => {
        if (!selectedChatData) return null;
        const otherUserId = selectedChatData.members.find(id => id !== userProfile.uid)!;
        const otherUserInfo = allUsers.find(u => u.uid === otherUserId);
        return {
            uid: otherUserId,
            displayName: selectedChatData.memberInfo[otherUserId]?.displayName || 'User',
            photoURL: otherUserInfo?.photoURL || selectedChatData.memberInfo[otherUserId]?.photoURL,
            isOnline: otherUserInfo?.isOnline,
            lastSeen: otherUserInfo?.lastSeen
        };
    };

    const otherUser = getOtherUser();

    return (
        <div className="flex-1 flex flex-col w-full h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
            {view === 'list' && renderListView()}
            {view === 'chat' && otherUser && (
                <PrivateChatView 
                    chat={selectedChatData}
                    currentUser={userProfile} 
                    otherUser={otherUser} 
                    onBack={() => setView('list')} 
                    onOpenConfirmationModal={(options) => setModalState({ ...options, isOpen: true })}
                    onDeleteMessage={handleDeleteMessage}
                />
            )}
            <ConfirmationModal
                isOpen={modalState.isOpen}
                title={modalState.title}
                message={modalState.message}
                onConfirm={modalState.onConfirm}
                onCancel={() => setModalState({ ...modalState, isOpen: false })}
                confirmText={modalState.confirmText || 'Confirm'}
                isConfirming={isDeleting || isMessageDeleting}
            />
        </div>
    );
};