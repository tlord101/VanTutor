import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { db, storage } from '../firebase';
import { ref as dbRef, onValue, push, set, update, get, serverTimestamp } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { checkAICredits, deductAICredits, getFeatureCost, getFeatureModel } from '../utils/usage';
import { LimitExceededModal } from './LimitExceededModal';
import { createAvelutAI, getResponseText } from '../utils/inference';
import type { UserProfile } from '../types';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { useAppSettings } from '../hooks/useAppSettings';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useToast } from '../hooks/useToast';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { Share } from '@capacitor/share';
import { Flag } from 'lucide-react';
// --- INLINE ICONS ---
const ErrorIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
     <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
     </svg>
);
const ArrowLeftIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
);


// --- TUTORIAL DISPLAY COMPONENT ---
interface TutorialDisplayProps {
    scannedImage: string;
    tutorialText: string;
    onClose: () => void;
    userProfile: UserProfile;
}

const TutorialDisplay: React.FC<TutorialDisplayProps> = ({ scannedImage, tutorialText, onClose, userProfile }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isSharing, setIsSharing] = useState(false);
    const { addToast } = useToast();
    const [showForwardModal, setShowForwardModal] = useState(false);
    const [studyPartners, setStudyPartners] = useState<Record<string, boolean>>({});
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (!userProfile) return;
        const partnersRef = dbRef(db, `study_partners/${userProfile.uid}`);
        const usersRef = dbRef(db, 'users');

        const unsubPartners = onValue(partnersRef, (snap) => setStudyPartners(snap.val() || {}));
        const unsubUsers = onValue(usersRef, (snap) => {
            const data = snap.val();
            if (data) {
                const list: UserProfile[] = Object.keys(data).map(key => ({
                    uid: key,
                    display_name: data[key].displayName || data[key].display_name || 'User',
                    photo_url: data[key].photoURL || data[key].photo_url || '',
                    ...data[key]
                }));
                setAllUsers(list);
            }
        });

        return () => {
            unsubPartners();
            unsubUsers();
        };
    }, [userProfile]);

    const captureImage = async (): Promise<Blob | null> => {
        if (!containerRef.current) return null;
        setIsSharing(true);

        // Temporarily reset styles to capture full scrollable content
        const originalHeight = containerRef.current.style.height;
        const originalOverflow = containerRef.current.style.overflow;
        containerRef.current.style.height = 'auto';
        containerRef.current.style.overflow = 'visible';

        try {
            // Provide specific configuration to html2canvas for better markdown support
            const canvas = await html2canvas(containerRef.current, {
                useCORS: true,
                scale: 2,
                windowWidth: containerRef.current.scrollWidth,
                windowHeight: containerRef.current.scrollHeight
            });
            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/png');
            });
        } catch (err) {
            console.error('Failed to capture image', err);
            return null;
        } finally {
            // Restore original styles
            containerRef.current.style.height = originalHeight;
            containerRef.current.style.overflow = originalOverflow;
            setIsSharing(false);
        }
    };

    const handleShareNative = async () => {
        const blob = await captureImage();
        if (!blob) {
            addToast('Failed to generate image.', 'error');
            return;
        }

        if (Capacitor.isNativePlatform()) {
            try {
                const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const b64 = (reader.result as string).split(',')[1];
                        resolve(b64);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });

                const fileName = `avelut_solution_${Date.now()}.png`;
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                });

                try {
                    await Share.share({
                        title: 'Avelut Solution',
                        text: 'Check out this solution from Avelut Visual Solver!',
                        url: savedFile.uri,
                        dialogTitle: 'Share Solution'
                    });
                } catch (shareErr: any) {
                    // Fallback to FileOpener if share is cancelled or fails
                    if (shareErr.message !== 'Share canceled') {
                        console.error('Share plugin error, falling back to FileOpener:', shareErr);
                        await FileOpener.openFile({
                            path: savedFile.uri,
                            mimeType: 'image/png'
                        });
                        addToast('Image saved! Use the menu to share.', 'success');
                    }
                }
            } catch (err) {
                console.error('Native share error:', err);
                addToast('Failed to share image.', 'error');
            }
        } else {
            const file = new File([blob], 'avelut_solution.png', { type: 'image/png' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: 'Avelut Solution',
                        text: 'Check out this solution from Avelut Visual Solver!',
                        files: [file]
                    });
                } catch (err) {
                    console.error('Error sharing', err);
                }
            } else {
                // Fallback to download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'avelut_solution.png';
                a.click();
                URL.revokeObjectURL(url);
                addToast('Image downloaded! You can now share it manually.', 'success');
            }
        }
    };

    const handleForwardToPartner = async () => {
        if (selectedIds.length === 0) return;
        setIsSending(true);
        const blob = await captureImage();
        if (!blob) {
            addToast('Failed to generate image.', 'error');
            setIsSending(false);
            return;
        }

        try {
            for (const recipientId of selectedIds) {
                const chatId = [userProfile.uid, recipientId].sort().join('_');
                const localTimestamp = Date.now();
                const cloudPath = `chat_files/${chatId}/${localTimestamp}_solution.png`;
                const fileBucketRef = storageRef(storage, cloudPath);
                const snapshot = await uploadBytes(fileBucketRef, blob);
                const fileDownloadUrl = await getDownloadURL(snapshot.ref);

                const text = `![Avelut Solution](${fileDownloadUrl})`;
                const msgRef = push(dbRef(db, `messages/${chatId}`));
                const data = { senderId: userProfile.uid, text, type: 'image', timestamp: localTimestamp, is_forwarded: true };
                await set(msgRef, data);

                const updates: any = {};
                const participantIds = [userProfile.uid, recipientId];
                participantIds.forEach((participantId) => {
                    updates[`user_chats/${participantId}/${chatId}/last_message`] = {
                        text: '📷 Solution Image',
                        senderId: userProfile.uid,
                        timestamp: localTimestamp,
                        type: 'image',
                    };
                    updates[`user_chats/${participantId}/${chatId}/timestamp`] = localTimestamp;
                    updates[`user_chats/${participantId}/${chatId}/otherUserId`] = participantId === userProfile.uid
                        ? recipientId
                        : userProfile.uid;
                });
                updates[`user_chats/${userProfile.uid}/${chatId}/unreadCount`] = 0;
                // We use get() here to increment isn't strictly necessary if we rely on update logic, but we assume it's just +1
                // Actually, increment(1) requires ServerValue.increment which we didn't import, so we fetch or just set to 1.
                // We will just do a simple update since this is optimistic.
                updates[`user_chats/${recipientId}/${chatId}/unreadCount`] = 1; // Simplify

                await update(dbRef(db), updates);
            }
            addToast('Forwarded successfully!', 'success');
            setShowForwardModal(false);
            setSelectedIds([]);
        } catch (err: any) {
            console.error('Failed to forward', err);
            addToast('Failed to forward image.', 'error');
        } finally {
            setIsSending(false);
        }
    };

    const partnersList = allUsers.filter(u => studyPartners[u.uid] === true);
    const filteredPartners = partnersList.filter(u => u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="w-full h-full flex flex-col bg-gradient-to-b from-gray-50 to-white relative">
            <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white">
                <div className="flex-shrink-0 h-[33vh] bg-gradient-to-br from-indigo-50 to-blue-50 border-b-2 border-indigo-200 shadow-sm">
                    <img src={scannedImage} alt="Scanned problem" className="w-full h-full object-contain p-2" />
                </div>
                <div className="flex-1 px-4 py-6 sm:px-8 sm:py-8 overflow-y-auto">
                    <div className="max-w-4xl mx-auto">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                                h1: ({node, ...props}: any) => <h1 className="text-3xl sm:text-4xl font-extrabold text-indigo-900 mt-10 mb-6 tracking-tight leading-tight" {...props} />,
                                h2: ({node, ...props}: any) => <h2 className="text-2xl sm:text-3xl font-bold text-indigo-800 mt-8 mb-5 tracking-tight border-b border-indigo-100 pb-2" {...props} />,
                                h3: ({node, ...props}: any) => <h3 className="text-xl sm:text-2xl font-bold text-indigo-700 mt-6 mb-4 tracking-tight" {...props} />,
                                h4: ({node, ...props}: any) => <h4 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2 mt-4" {...props} />,
                                p: ({node, ...props}: any) => <p className="mb-5 text-base sm:text-lg text-gray-700 leading-relaxed tracking-wide" {...props} />,
                                a: ({node, ...props}: any) => <a className="text-indigo-600 font-semibold hover:text-indigo-800 hover:underline decoration-indigo-300 decoration-2 transition-all" target="_blank" rel="noreferrer" {...props} />,
                                strong: ({node, ...props}: any) => <strong className="font-bold text-gray-900 dark:text-white bg-yellow-100 px-1.5 py-0.5 rounded" {...props} />,
                                em: ({node, ...props}: any) => <em className="italic text-indigo-600 font-medium" {...props} />,
                                ul: ({node, ...props}: any) => <ul className="list-none space-y-3 my-5 pl-1" {...props} />,
                                li: ({node, ...props}: any) => <li className="flex items-start gap-3 text-base sm:text-lg text-gray-700 leading-relaxed before:content-['●'] before:text-indigo-500 before:font-bold before:text-xl before:mt-0.5 before:flex-shrink-0" {...props} />,
                                ol: ({node, ...props}: any) => <ol className="list-none space-y-4 my-6 counter-reset-[step]" {...props} />,
                                code: ({node, inline, ...props}: any) => inline ? <code className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-mono text-sm border border-indigo-200" {...props} /> : <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-4 font-mono text-sm leading-relaxed border-l-4 border-indigo-500" {...props} />,
                                pre: ({node, ...props}: any) => <pre className="bg-gray-900 rounded-lg overflow-hidden my-5 shadow-lg" {...props} />,
                                blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-amber-400 bg-amber-50 pl-6 pr-4 py-4 my-5 rounded-r-lg shadow-sm" {...props} />,
                                table: ({node, ...props}: any) => <div className="overflow-x-auto my-6 shadow-md rounded-lg"><table className="min-w-full divide-y divide-gray-200 border border-gray-200 dark:border-transparent" {...props} /></div>,
                                thead: ({node, ...props}: any) => <thead className="bg-indigo-600 text-white" {...props} />,
                                tbody: ({node, ...props}: any) => <tbody className="bg-white dark:bg-black divide-y divide-gray-200" {...props} />,
                                tr: ({node, ...props}: any) => <tr className="hover:bg-gray-50 dark:bg-black transition-colors" {...props} />,
                                th: ({node, ...props}: any) => <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider" {...props} />,
                                td: ({node, ...props}: any) => <td className="px-6 py-4 text-sm text-gray-700" {...props} />,
                                hr: ({node, ...props}: any) => <hr className="my-8 border-t-2 border-gray-200 dark:border-transparent" {...props} />,
                            }}
                        >
                            {tutorialText}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>
            
            <div className="flex-shrink-0 p-4 sm:p-6 border-t-2 border-gray-200 dark:border-transparent bg-white dark:bg-black/90 backdrop-blur-md shadow-lg flex gap-3">
                <button 
                    onClick={onClose} 
                    className="flex-1 bg-neutral-200 dark:bg-gray-800 hover:bg-neutral-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2"
                >
                    <ArrowLeftIcon className="w-5 h-5" />
                    Back
                </button>
                <button 
                    onClick={handleShareNative} 
                    disabled={isSharing}
                    className="flex-1 bg-[#009EE2] hover:bg-[#0070B8] text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Share
                </button>
                <button 
                    onClick={() => setShowForwardModal(true)} 
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>
                    Forward
                </button>
                <button
                    onClick={async () => {
                        try {
                            const reportsRef = dbRef(db, 'reported_content');
                            await push(reportsRef, {
                                userId: userProfile.uid,
                                messageText: tutorialText,
                                timestamp: serverTimestamp(),
                                type: 'visual_solver_response'
                            });
                            addToast('Content reported to moderators', 'success');
                        } catch (err) {
                            console.error('Failed to report:', err);
                            addToast('Failed to report content', 'error');
                        }
                    }}
                    className="flex-1 bg-red-600/10 hover:bg-red-600/20 text-red-600 font-bold py-4 px-2 rounded-xl transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-1.5"
                    title="Report inappropriate AI content"
                >
                    <Flag className="w-5 h-5" />
                    Report
                </button>
            </div>

            {showForwardModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-black w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[75vh]">
                        <div className="p-5 border-b border-[#E9ECEF] dark:border-transparent flex items-center justify-between">
                            <h2 className="text-base font-bold text-[#212529] dark:text-white">Forward Solution</h2>
                            <button onClick={() => setShowForwardModal(false)} disabled={isSending} className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-[#6C757D] text-xs font-bold transition">✕</button>
                        </div>
                        <div className="p-4 border-b border-[#E9ECEF]">
                            <input type="text" placeholder="Search partners..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#F8F9FA] dark:bg-black text-sm px-4 py-2 rounded-xl border focus:outline-none focus:border-[#009EE2]" />
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {filteredPartners.length === 0 ? (
                                <p className="text-center text-xs font-medium text-gray-500 py-8">No partners found</p>
                            ) : (
                                filteredPartners.map(u => (
                                    <div key={u.uid} onClick={() => setSelectedIds(prev => prev.includes(u.uid) ? prev.filter(id => id !== u.uid) : [...prev, u.uid])} className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer ${selectedIds.includes(u.uid) ? 'bg-[#009EE2]/5 border-[#009EE2]' : 'border-[#E9ECEF]'}`}>
                                        <div className="font-semibold text-sm">{u.display_name}</div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedIds.includes(u.uid) ? 'border-[#009EE2] bg-[#009EE2]' : 'border-gray-300'}`}>
                                            {selectedIds.includes(u.uid) && <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="p-4 border-t bg-[#F8F9FA] dark:bg-black flex gap-3">
                            <button onClick={() => setShowForwardModal(false)} disabled={isSending} className="flex-1 bg-white border py-3.5 rounded-xl font-bold text-xs text-gray-500 uppercase">Cancel</button>
                            <button onClick={handleForwardToPartner} disabled={isSending || selectedIds.length === 0} className="flex-[2] bg-[#009EE2] text-white py-3.5 rounded-xl font-bold text-xs uppercase disabled:opacity-50 flex justify-center items-center gap-2">
                                {isSending ? 'Sending...' : `Send to ${selectedIds.length} partner${selectedIds.length !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- MAIN VISUAL SOLVER COMPONENT ---
type CameraState = 'initializing' | 'denied' | 'error' | 'ready' | 'scanning' | 'preview' | 'analyzing' | 'showingTutorial';
interface CropBox {
    x: number; y: number; width: number; height: number;
}
const MIN_CROP_SIZE = 0.2; // 20%

interface VisualSolverProps {
  userProfile: UserProfile;
  onStartChat: (image: string, tutorialText: string) => void;
  triggerScanRef?: React.MutableRefObject<(() => void) | null>;
}


export const VisualSolver: React.FC<VisualSolverProps> = ({ userProfile, onStartChat, triggerScanRef }) => {
    const [cameraState, setCameraState] = useState<CameraState>('initializing');
    const [scannedImage, setScannedImage] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [cropBox, setCropBox] = useState<CropBox>({ x: 0.05, y: 0.125, width: 0.9, height: 0.75 });
    const [customPrompt, setCustomPrompt] = useState<string>('');
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [limitModalData, setLimitModalData] = useState({ balance: 0, cost: 0 });
    
    const { addToast } = useToast();

    // Merged shared image intent logic with initializeCamera useEffect below
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const interactionRef = useRef<{
        startX: number; startY: number; initialCropBox: CropBox; videoRect: DOMRect;
        type: 'drag' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'resize-t' | 'resize-b' | 'resize-l' | 'resize-r';
    } | null>(null);


    const { attemptApiCall } = useApiLimiter();
    const { settings: appSettings } = useAppSettings();
    const geminiModel = getFeatureModel('visual_solve', appSettings);
    const aiClient = useMemo(() => createAvelutAI(appSettings, userProfile), [appSettings, userProfile]);

    const cleanupCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if(videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const handleInteractionEnd = useCallback(() => {
        interactionRef.current = null;
        document.body.style.overflow = '';
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('touchmove', handleMove, { passive: false } as any);
        window.removeEventListener('mouseup', handleInteractionEnd);
        window.removeEventListener('touchend', handleInteractionEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!interactionRef.current) return;
        if (e.cancelable) e.preventDefault();

        const { startX, startY, initialCropBox, videoRect, type } = interactionRef.current;
        const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const dx = (currentX - startX) / videoRect.width;
        const dy = (currentY - startY) / videoRect.height;

        let { x, y, width, height } = initialCropBox;

        if (type === 'drag') {
            x += dx; y += dy;
        } else {
            if (type.includes('l')) { x += dx; width -= dx; }
            if (type.includes('r')) { width += dx; }
            if (type.includes('t')) { y += dy; height -= dy; }
            if (type.includes('b')) { height += dy; }
        }
        
        if (width < 0) { x += width; width = Math.abs(width); }
        if (height < 0) { y += height; height = Math.abs(height); }

        width = Math.max(MIN_CROP_SIZE, width);
        height = Math.max(MIN_CROP_SIZE, height);

        x = Math.max(0, Math.min(x, 1 - width));
        y = Math.max(0, Math.min(y, 1 - height));
        
        if (x + width > 1) width = 1 - x;
        if (y + height > 1) height = 1 - y;

        setCropBox({ x, y, width, height });
    }, []);

    const handleInteractionStart = useCallback((
        e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
        type: NonNullable<typeof interactionRef.current>['type']
    ) => {
        e.stopPropagation();
        e.preventDefault();
        const video = videoRef.current;
        if (!video) return;

        document.body.style.overflow = 'hidden';

        interactionRef.current = {
            startX: 'touches' in e ? e.touches[0].clientX : e.clientX,
            startY: 'touches' in e ? e.touches[0].clientY : e.clientY,
            initialCropBox: cropBox,
            videoRect: video.getBoundingClientRect(),
            type,
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('mouseup', handleInteractionEnd);
        window.addEventListener('touchend', handleInteractionEnd);
    }, [cropBox, handleMove, handleInteractionEnd]);

    const initializeCamera = useCallback(async () => {
        cleanupCamera();
        setCameraState('initializing');
        setError('');

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } }
            });
            streamRef.current = mediaStream;
            setCameraState('ready');
        } catch (err) {
            console.error("Error accessing camera:", err);
            if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
                setError("Camera permission denied. Please enable camera access in your browser settings to use this feature.");
                setCameraState('denied');
            } else {
                setError("Could not access camera. It might be in use by another application or not available on this device.");
                setCameraState('error');
            }
        }
    }, [cleanupCamera]);
    
    useEffect(() => {
        if (cameraState === 'ready' && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [cameraState]);

    useEffect(() => {
        const sharedImage = localStorage.getItem('shared_image_intent');
        if (sharedImage) {
            localStorage.removeItem('shared_image_intent');
            const loadSharedImage = async () => {
                try {
                    let imageUri = sharedImage;
                    if (sharedImage.startsWith('content://') || sharedImage.startsWith('file://')) {
                        const fileData = await Filesystem.readFile({ path: sharedImage });
                        imageUri = `data:image/jpeg;base64,${fileData.data}`;
                    }
                    setScannedImage(imageUri);
                    setCameraState('preview');
                } catch (err) {
                    console.error("Failed to load shared image intent:", err);
                    addToast("Failed to load shared image.", "error");
                    initializeCamera();
                }
            };
            loadSharedImage();
        } else {
            initializeCamera();
        }
        return cleanupCamera;
    }, [initializeCamera, cleanupCamera, addToast]);

    const handleScan = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || video.readyState < 2) {
             addToast('Camera not ready. Please wait a moment.', 'error');
             setCameraState('error');
             return;
        }

        setCameraState('scanning');
        
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const videoElWidth = video.offsetWidth;
        const videoElHeight = video.offsetHeight;
        const videoAspectRatio = videoWidth / videoHeight;
        const videoElAspectRatio = videoElWidth / videoElHeight;

        let sWidth = videoWidth, sHeight = videoHeight, sX = 0, sY = 0;
        if (videoAspectRatio > videoElAspectRatio) {
            sWidth = videoHeight * videoElAspectRatio;
            sX = (videoWidth - sWidth) / 2;
        } else {
            sHeight = videoWidth / videoElAspectRatio;
            sY = (videoHeight - sHeight) / 2;
        }

        const { x: relX, y: relY, width: relW, height: relH } = cropBox;
        const cropX = sX + relX * sWidth;
        const cropY = sY + relY * sHeight;
        const cropWidth = relW * sWidth;
        const cropHeight = relH * sHeight;

        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            addToast('Could not process image.', 'error');
            setCameraState('error');
            return;
        }
        ctx.filter = 'contrast(1.5) brightness(1.1) grayscale(0.2)';
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setScannedImage(imageDataUrl);
        setTimeout(() => setCameraState('preview'), 500);
    }, [cropBox, addToast]);

    useEffect(() => {
        if (triggerScanRef) {
            triggerScanRef.current = handleScan;
        }
        return () => {
            if (triggerScanRef) {
                triggerScanRef.current = null;
            }
        };
    }, [handleScan, triggerScanRef]);

    const handleAnalyze = useCallback(async () => {
        if (!scannedImage) return;

        // Perform limit check
        const cost = getFeatureCost('visual_solve', appSettings);
        const limitCheck = checkAICredits(userProfile, cost, appSettings);
        if (!limitCheck.allowed) {
            setLimitModalData({
                balance: limitCheck.balance,
                cost: limitCheck.cost
            });
            setShowLimitModal(true);
            return;
        }

        setCameraState('analyzing');
        setError('');
        
        try {
            const result = await attemptApiCall(async () => {
                const base64Data = scannedImage.split(',')[1];
                const mimeType = scannedImage.split(';')[0].split(':')[1] || 'image/jpeg';
                if (!base64Data) throw new Error("Could not extract image data.");

                let retrievedContext = "";
                if (customPrompt) {
                    try {
                        const { searchPinecone } = await import('../utils/pinecone');
                        const searchResult = await searchPinecone(customPrompt, undefined, 3, appSettings);
                        if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                            retrievedContext = "\n\nRELEVANT TEXTBOOK EXCERPTS:\n" + searchResult.results.map((r: any) => r.text).join('\n\n');
                        }
                    } catch (err) {
                        console.warn("RAG retrieval failed:", err);
                    }
                }

                const basePrompt = `Expert AI educator. Solve the image problem fast. Use LaTeX for math ($...$, $$...$$).`;
                const customInstruction = customPrompt ? ` User instructions: ${customPrompt}` : '';
                const promptText = `${basePrompt}${customInstruction}
${retrievedContext}
# [Title]
## 📋 Summary
[Concise summary]
## 🔢 Solution
[Numbered steps with math]
## ✅ Answer
[Final Answer]`;

                if (!aiClient) throw new Error('AI client not available');
                const aiResult = await aiClient.models.generateContent({
                    model: geminiModel || 'gemini-3.1-pro',
                    config: {
                        thinkingConfig: {
                            thinkingLevel: 'HIGH',
                        },
                        temperature: 0.7,
                    },
                    contents: [{ role: 'user', parts: [
                        { inlineData: { data: base64Data, mimeType } },
                        { text: promptText }
                    ]}],
                });

                const finalResult = getResponseText(aiResult);
                if (!finalResult) throw new Error("AI returned an empty analysis.");

                setAnalysisResult(finalResult);

                // Deduct credits as soon as we have a result
                deductAICredits(userProfile.uid, cost, 'Visual Solver - Detailed', appSettings).catch(console.error);

                // Allow UI to transition immediately after we have the data
                setCameraState('showingTutorial');
                return finalResult;
            });

            if (!result.success) {
                addToast(result.message || "Failed to analyze the image. Please try again.", 'error');
                setCameraState('preview');
            }
        } catch (err: any) {
            console.error("Analysis failed:", err);
            setError(err.message || "Failed to connect to the solver.");
            setCameraState('preview');
        }
    }, [scannedImage, attemptApiCall, customPrompt, aiClient, geminiModel, userProfile, appSettings, addToast]);

    const handleQuickAnswer = useCallback(async () => {
        if (!scannedImage) return;
    
        // Perform limit check
        const cost = getFeatureCost('visual_solve', appSettings);
        const limitCheck = checkAICredits(userProfile, cost, appSettings);
        if (!limitCheck.allowed) {
            setLimitModalData({
                balance: limitCheck.balance,
                cost: limitCheck.cost
            });
            setShowLimitModal(true);
            return;
        }

        setCameraState('analyzing');
        setError('');
        
        try {
            const result = await attemptApiCall(async () => {
                const base64Data = scannedImage.split(',')[1];
                const mimeType = scannedImage.split(';')[0].split(':')[1] || 'image/jpeg';
                if (!base64Data) throw new Error("Could not extract image data.");

                const basePrompt = `Analyze the problem in the image and provide only the final answer, without any explanation or steps. Be direct and concise.`;
                const customInstruction = customPrompt ? ` ${customPrompt}` : '';
                const promptText = `${basePrompt}${customInstruction}`;
        
                if (!aiClient) throw new Error('AI client not available');
                const aiResult = await aiClient.models.generateContent({
                    model: geminiModel || 'gemini-3.1-pro',
                    config: {
                        thinkingConfig: {
                            thinkingLevel: 'HIGH',
                        },
                        temperature: 0.7,
                    },
                    contents: [{ role: 'user', parts: [
                        { inlineData: { data: base64Data, mimeType } },
                        { text: promptText }
                    ]}],
                });

                const finalResult = getResponseText(aiResult);
                if (!finalResult) throw new Error("AI returned an empty response.");

                setAnalysisResult(finalResult);
                deductAICredits(userProfile.uid, cost, 'Visual Solver - Quick Answer', appSettings).catch(console.error);
                setCameraState('showingTutorial');
                return finalResult;
            });

            if (!result.success) {
                addToast(result.message || "Failed to analyze the image. Please try again.", 'error');
                setCameraState('preview');
            }
        } catch (err: any) {
            console.error("Quick answer failed:", err);
            setError(err.message || "Failed to connect to the solver.");
            setCameraState('preview');
        }
    }, [scannedImage, attemptApiCall, customPrompt, aiClient, geminiModel, userProfile, appSettings, addToast]);

    const handleSolution = useCallback(async () => {
        if (!scannedImage) return;
    
        // Perform limit check
        const cost = getFeatureCost('visual_solve', appSettings);
        const limitCheck = checkAICredits(userProfile, cost, appSettings);
        if (!limitCheck.allowed) {
            setLimitModalData({
                balance: limitCheck.balance,
                cost: limitCheck.cost
            });
            setShowLimitModal(true);
            return;
        }

        setCameraState('analyzing');
        setError('');
        
        try {
            const result = await attemptApiCall(async () => {
                const base64Data = scannedImage.split(',')[1];
                const mimeType = scannedImage.split(';')[0].split(':')[1] || 'image/jpeg';
                if (!base64Data) throw new Error("Could not extract image data.");

                const basePrompt = `Answer the question or solve the problem shown in the image. Provide a clear, concise solution without unnecessary details or lengthy explanations. Give the answer directly as it was asked.`;
                const customInstruction = customPrompt ? ` ${customPrompt}` : '';
                const promptText = `${basePrompt}${customInstruction}`;
        
                if (!aiClient) throw new Error('AI client not available');
                const aiResult = await aiClient.models.generateContent({
                    model: geminiModel || 'gemini-3.1-pro',
                    config: {
                        thinkingConfig: {
                            thinkingLevel: 'HIGH',
                        },
                        temperature: 0.7,
                    },
                    contents: [{ role: 'user', parts: [
                        { inlineData: { data: base64Data, mimeType } },
                        { text: promptText }
                    ]}],
                });

                const finalResult = getResponseText(aiResult);
                if (!finalResult) throw new Error("AI returned an empty solution.");

                setAnalysisResult(finalResult);
                deductAICredits(userProfile.uid, cost, 'Visual Solver - Solution', appSettings).catch(console.error);
                setCameraState('showingTutorial');
                return finalResult;
            });

            if (!result.success) {
                addToast(result.message || "Failed to analyze the image. Please try again.", 'error');
                setCameraState('preview');
            }
        } catch (err: any) {
            console.error("Solution failed:", err);
            setError(err.message || "Failed to connect to the solver.");
            setCameraState('preview');
        }
    }, [scannedImage, attemptApiCall, customPrompt, aiClient, geminiModel, userProfile, appSettings, addToast]);

    const handleRetake = () => {
        setScannedImage(null);
        setAnalysisResult('');
        setError('');
        setCustomPrompt('');
        initializeCamera();
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Allow any image type
        if (file.type && !file.type.startsWith('image/')) {
            addToast('Please upload a valid image file.', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            addToast('Image must be under 5MB.', 'error');
            return;
        }

        const previewUrl = URL.createObjectURL(file);
        setScannedImage(previewUrl);
        setCameraState('preview');

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setScannedImage(dataUrl);
            URL.revokeObjectURL(previewUrl);
        };
        reader.onerror = () => {
            addToast('Could not read the file.', 'error');
        };
        reader.readAsDataURL(file);

        // Reset input so the same file can be selected again
        e.target.value = '';
    };

    const renderContent = () => {
        switch (cameraState) {
            case 'initializing':
                return <div className="flex flex-col items-center justify-center h-full"><img src="/logo_icon.png" alt="AVELUT" className="w-12 h-12 object-contain animate-pulse" /><p className="mt-4 text-gray-700">Starting camera...</p></div>;

            case 'denied':
                return <div className="flex flex-col items-center justify-center h-full text-center p-4"><ErrorIcon className="w-12 h-12 text-yellow-500 mb-4" /><h3 className="text-xl font-semibold">Camera Access Denied</h3><p className="text-gray-600 mt-2 max-w-sm">{error}</p><button onClick={initializeCamera} className="mt-6 bg-gray-200 text-gray-800 dark:text-gray-200 font-bold py-2 px-6 rounded-full hover:bg-gray-300 transition-colors">Retry</button></div>;

            case 'error':
                return <div className="flex flex-col items-center justify-center h-full text-center p-4"><ErrorIcon className="w-12 h-12 text-red-500 mb-4" /><h3 className="text-xl font-semibold">Camera Error</h3><p className="text-gray-600 mt-2 max-w-sm">{error}</p><button onClick={initializeCamera} className="mt-6 bg-gray-200 text-gray-800 dark:text-gray-200 font-bold py-2 px-6 rounded-full hover:bg-gray-300 transition-colors">Retry</button></div>;
            
            case 'ready':
            case 'scanning':
                const resizeHandles = [
                    { type: 'resize-tl', cursor: 'cursor-nwse-resize', pos: 'top-[-8px] left-[-8px] w-4 h-4' },
                    { type: 'resize-tr', cursor: 'cursor-nesw-resize', pos: 'top-[-8px] right-[-8px] w-4 h-4' },
                    { type: 'resize-bl', cursor: 'cursor-nesw-resize', pos: 'bottom-[-8px] left-[-8px] w-4 h-4' },
                    { type: 'resize-br', cursor: 'cursor-nwse-resize', pos: 'bottom-[-8px] right-[-8px] w-4 h-4' },
                    { type: 'resize-t', cursor: 'cursor-ns-resize', pos: 'top-[-5px] left-1/2 -translate-x-1/2 w-10 h-2.5' },
                    { type: 'resize-b', cursor: 'cursor-ns-resize', pos: 'bottom-[-5px] left-1/2 -translate-x-1/2 w-10 h-2.5' },
                    { type: 'resize-l', cursor: 'cursor-ew-resize', pos: 'left-[-5px] top-1/2 -translate-y-1/2 h-10 w-2.5' },
                    { type: 'resize-r', cursor: 'cursor-ew-resize', pos: 'right-[-5px] top-1/2 -translate-y-1/2 h-10 w-2.5' },
                ] as const;
                return (
                    <div className="w-full h-full flex flex-col bg-black">
                        {/* Camera View Area */}
                        <div className="flex-1 relative overflow-hidden flex items-center justify-center p-2 sm:p-4 bg-gray-900">
                            <video ref={videoRef} playsInline autoPlay muted className="w-full h-full object-contain rounded-xl shadow-lg"></video>
                            <div 
                                style={{ 
                                    left: `calc(${cropBox.x * 100}% + 8px)`, top: `calc(${cropBox.y * 100}% + 8px)`,
                                    width: `calc(${cropBox.width * 100}% - 16px)`, height: `calc(${cropBox.height * 100}% - 16px)`
                                }}
                                className={`absolute border-4 border-dashed rounded-lg cursor-move transition-colors duration-300 
                                    ${cameraState === 'scanning' ? 'border-lime-400 animate-[scan-pulse_1s_ease-in-out_infinite]' : 'border-white/80'}`}
                                onMouseDown={(e) => handleInteractionStart(e, 'drag')}
                                onTouchStart={(e) => handleInteractionStart(e, 'drag')}
                            >
                                <div className="absolute inset-0" style={{ boxShadow: '0 0 0 2000px rgba(0,0,0,0.5)' }}></div>
                                {resizeHandles.map(handle => (
                                    <div key={handle.type} 
                                        className={`absolute ${handle.pos} ${handle.cursor} z-10`}
                                        onMouseDown={(e) => handleInteractionStart(e, handle.type)}
                                        onTouchStart={(e) => handleInteractionStart(e, handle.type)}
                                    >
                                        <div className="w-full h-full bg-lime-400/80 rounded-full border-2 border-white/80"></div>
                                    </div>
                                ))}
                            </div>
                            <div className="absolute top-8 left-1/2 -translate-x-1/2 text-white bg-black/60 px-4 py-1.5 text-sm rounded-full pointer-events-none w-fit text-center shadow-md">
                                Drag and resize to frame the problem
                            </div>
                        </div>
                        {/* Shutter Button Area - Hidden Input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg, image/png, image/webp"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        {/* Floating Upload Button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            aria-label="Upload photo"
                            className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full hover:from-blue-500 hover:to-indigo-500 transition-transform active:scale-90 shadow-xl border border-white/20 z-50 animate-fade-in"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                        </button>
                    </div>
                );
            
            case 'preview':
            case 'analyzing':
                return (
                    <div className="relative w-full h-full flex flex-col items-center justify-center bg-gray-900">
                        {scannedImage && <img src={scannedImage} alt="Scanned problem" className="w-full h-full object-contain" />}
                        {cameraState === 'analyzing' && (
                            <div className="absolute inset-0 bg-white dark:bg-black/80 flex flex-col items-center justify-center text-gray-900 dark:text-white">
                                <img src="/logo_icon.png" alt="AVELUT" className="w-12 h-12 object-contain animate-pulse" />
                                <p className="mt-4 text-lg font-semibold">Analyzing...</p>
                                <p className="text-gray-600">This may take a moment.</p>
                            </div>
                        )}
                        {cameraState === 'preview' && (
                            <>
                                <div className="absolute top-4 left-4">
                                    <button onClick={handleRetake} className="flex items-center gap-1 p-2 px-3 bg-black/40 text-white rounded-lg hover:bg-black/60 transition-colors shadow backdrop-blur-sm">
                                        <ArrowLeftIcon className="w-5 h-5" />
                                        <span className="font-semibold">Back</span>
                                    </button>
                                </div>
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <div className="w-full max-w-sm space-y-3 sm:space-y-4">
                                        <div className="mb-4">
                                            <textarea
                                                value={customPrompt}
                                                onChange={(e) => setCustomPrompt(e.target.value)}
                                                placeholder="Optional: Add custom instructions (e.g., 'Explain this step by step', 'Focus on the methodology', etc.)"
                                                className="w-full bg-white/20 dark:bg-black/40 backdrop-blur-sm border-2 border-white/50 text-white placeholder-white/70 rounded-xl p-2 sm:p-3 text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-lime-400 transition-all"
                                                rows={2}
                                            />
                                        </div>
                                        <button 
                                            onClick={handleAnalyze} 
                                            className="w-full bg-emerald-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-emerald-500 transition-all text-lg flex items-center justify-center gap-2 active:scale-95"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                            </svg>
                                            Detailed Tutorial
                                        </button>
                                        <button 
                                            onClick={handleSolution} 
                                            className="w-full bg-white/20 dark:bg-gray-800 border border-white/50 dark:border-gray-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-white/30 dark:hover:bg-gray-700 transition-all text-lg flex items-center justify-center gap-2 active:scale-95"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Solution
                                        </button>
                                        <button 
                                            onClick={handleQuickAnswer} 
                                            className="w-full bg-white/20 dark:bg-gray-800 border border-white/50 dark:border-gray-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-white/30 dark:hover:bg-gray-700 transition-all text-lg flex items-center justify-center gap-2 active:scale-95"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            Quick Answer
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                );
            
            case 'showingTutorial':
                if (!scannedImage) return null;
                return <TutorialDisplay
                    scannedImage={scannedImage}
                    tutorialText={analysisResult}
                    onClose={handleRetake}
                    userProfile={userProfile}
                />;

            default:
                return null;
        }
    };

    return (
        <div className="flex-1 flex flex-col w-full">
            <div className="h-[calc(100vh-90px)] bg-gray-300 rounded-xl border border-gray-200 dark:border-transparent overflow-hidden relative">
                <canvas ref={canvasRef} className="hidden"></canvas>
                {renderContent()}
            </div>
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
        </div>
    );
};
