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
    const source = input instanceof Blob ? input : new Blob([input as any], { type: (input as any).type || 'image/jpeg' });
    const mimeType = inferImageMimeType((input instanceof File ? input.name : ''), (source as Blob).type);

    try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Could not read image file.'));
            reader.readAsDataURL(source);
        });
        if (dataUrl.startsWith('data:image/')) {
            const detectedMime = dataUrl.split(';')[0].split(':')[1] || mimeType;
            // Some mobile cameras produce HEIC/HEIF images which many browsers cannot render
            // from a data URL. If we detect HEIC/HEIF, fall back to canvas conversion path
            // to produce a JPEG data URL for reliable display.
            if (detectedMime.includes('heic') || detectedMime.includes('heif')) {
                // fall through to object URL -> canvas conversion below
            } else {
                return { dataUrl, mimeType: detectedMime };
            }
        }
    } catch (error) {
        console.warn('Falling back to canvas conversion for image input:', error);
    }

    const objectUrl = URL.createObjectURL(source);
    if (fallbackType && fallbackType.startsWith('image/')) return fallbackType;
    if (normalizedName.endsWith('.png')) return 'image/png';
    if (normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) return 'image/jpeg';
    if (normalizedName.endsWith('.webp')) return 'image/webp';
    if (normalizedName.endsWith('.gif')) return 'image/gif';
    if (normalizedName.endsWith('.bmp')) return 'image/bmp';
    if (normalizedName.endsWith('.heic') || normalizedName.endsWith('.heif')) return 'image/heic';
    return 'image/jpeg';
};

const readImageAsDataUrl = async (input: File | Blob | string): Promise<{ dataUrl: string; mimeType: string }> => {
    if (typeof input === 'string') {
        if (input.startsWith('data:')) {
            const mimeType = input.split(';')[0].split(':')[1] || 'image/jpeg';
            return { dataUrl: input, mimeType };
        }

        if (input.startsWith('blob:')) {
            const response = await fetch(input);
            const blob = await response.blob();
            return readImageAsDataUrl(blob);
        }

        if (input.startsWith('content://') || input.startsWith('file://')) {
            try {
                const rawPath = input.replace(/^file:\/\//, '').replace(/^content:\/\//, '');
                const fileData = await Filesystem.readFile({ path: rawPath });
                return {
                    dataUrl: `data:image/jpeg;base64,${fileData.data}`,
                    mimeType: 'image/jpeg'
                };
            } catch (error) {
                console.warn('Unable to read shared image path:', error);
                throw error;
            }
        }
    }

<<<<<<< HEAD
    const source = input instanceof Blob ? input : new Blob([input], { type: input.type || 'image/jpeg' });
    const mimeType = inferImageMimeType((input instanceof File ? input.name : ''), source.type);
=======
    const source = input instanceof Blob ? input : new Blob([input as any], { type: (input as any).type || 'image/jpeg' });
    const mimeType = inferImageMimeType((input instanceof File ? input.name : ''), (source as Blob).type);
>>>>>>> 17b08d4 (Visual Solver: HEIC->JPEG fallback and clipboard-image prompt on app open)

    try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Could not read image file.'));
            reader.readAsDataURL(source);
        });
        if (dataUrl.startsWith('data:image/')) {
<<<<<<< HEAD
            return { dataUrl, mimeType: dataUrl.split(';')[0].split(':')[1] || mimeType };
=======
            const detectedMime = dataUrl.split(';')[0].split(':')[1] || mimeType;
            // Some mobile cameras produce HEIC/HEIF images which many browsers cannot render
            // from a data URL. If we detect HEIC/HEIF, fall back to canvas conversion path
            // to produce a JPEG data URL for reliable display.
            if (detectedMime.includes('heic') || detectedMime.includes('heif')) {
                // fall through to object URL -> canvas conversion below
            } else {
                return { dataUrl, mimeType: detectedMime };
            }
>>>>>>> 17b08d4 (Visual Solver: HEIC->JPEG fallback and clipboard-image prompt on app open)
        }
    } catch (error) {
        console.warn('Falling back to canvas conversion for image input:', error);
    }

    const objectUrl = URL.createObjectURL(source);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Image could not be decoded.'));
            img.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not prepare canvas for image conversion.');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const outputMime = mimeType.includes('png') ? 'image/png' : mimeType.includes('webp') ? 'image/webp' : 'image/jpeg';
        return {
            dataUrl: canvas.toDataURL(outputMime, 0.92),
            mimeType: outputMime
        };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

const sliceCanvasIntoBlobs = async (canvas: HTMLCanvasElement): Promise<Blob[]> => {
    if (canvas.height <= MAX_CAPTURE_SLICE_HEIGHT) {
        const blob = await canvasToBlob(canvas);
        return blob ? [blob] : [];
    }

    const blobs: Blob[] = [];
    const sliceWidth = canvas.width;
    const sliceHeight = MAX_CAPTURE_SLICE_HEIGHT;
    const step = Math.max(1, sliceHeight - CAPTURE_SLICE_OVERLAP);

    for (let sourceY = 0; sourceY < canvas.height; sourceY += step) {
        const currentSliceHeight = Math.min(sliceHeight, canvas.height - sourceY);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = sliceWidth;
        sliceCanvas.height = currentSliceHeight;

        const sliceCtx = sliceCanvas.getContext('2d');
        if (!sliceCtx) continue;

        sliceCtx.drawImage(
            canvas,
            0,
            sourceY,
            sliceWidth,
            currentSliceHeight,
            0,
            0,
            sliceWidth,
            currentSliceHeight
        );

        const blob = await canvasToBlob(sliceCanvas);
        if (blob) blobs.push(blob);
    }

    return blobs;
};


// --- TUTORIAL DISPLAY COMPONENT ---
interface TutorialDisplayProps {
    scannedImage: string;
    tutorialText: string;
    onClose: () => void;
    userProfile: UserProfile;
}

const TutorialDisplay: React.FC<TutorialDisplayProps> = ({ scannedImage, tutorialText, onClose, userProfile }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContentRef = useRef<HTMLDivElement>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ y: number; initialOffset: number; allowClose: boolean } | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const { addToast } = useToast();
    const [showForwardModal, setShowForwardModal] = useState(false);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const [studyPartners, setStudyPartners] = useState<Record<string, boolean>>({});
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [dragOffsetY, setDragOffsetY] = useState(0);
    const [isClosing, setIsClosing] = useState(false);

    const closeSheet = useCallback(() => {
        setIsClosing(true);
        window.setTimeout(() => {
            setIsClosing(false);
            setShareMenuOpen(false);
            setDragOffsetY(0);
            onClose();
        }, 180);
    }, [onClose]);

    const handleDragStart = (clientY: number) => {
        const sheetTop = sheetRef.current?.getBoundingClientRect().top ?? window.innerHeight;
        const allowClose = clientY <= sheetTop + 60;
        dragStartRef.current = { y: clientY, initialOffset: dragOffsetY, allowClose };
    };

    const handleDragMove = (clientY: number) => {
        if (!dragStartRef.current || !dragStartRef.current.allowClose) return;
        const delta = clientY - dragStartRef.current.y;
        if (delta <= 0) {
            setDragOffsetY(0);
            return;
        }
        setDragOffsetY(Math.min(220, Math.max(0, dragStartRef.current.initialOffset + delta)));
    };

    const handleDragEnd = () => {
        if (dragOffsetY > 140) {
            closeSheet();
        } else {
            setDragOffsetY(0);
        }
        dragStartRef.current = null;
    };

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

    const captureImages = async (): Promise<Blob[]> => {
        if (!containerRef.current) return null;
        setIsSharing(true);

        // Temporarily reset styles to capture full scrollable content
        const originalHeight = containerRef.current.style.height;
        const originalOverflow = containerRef.current.style.overflow;
        const scrollContent = scrollContentRef.current;
        const originalScrollHeight = scrollContent?.style.height;
        const originalScrollOverflow = scrollContent?.style.overflow;
        const originalScrollMaxHeight = scrollContent?.style.maxHeight;
        containerRef.current.style.height = 'auto';
        containerRef.current.style.overflow = 'visible';
        if (scrollContent) {
            scrollContent.style.height = 'auto';
            scrollContent.style.overflow = 'visible';
            scrollContent.style.maxHeight = 'none';
        }

        try {
            // Provide specific configuration to html2canvas for better markdown support
            const canvas = await html2canvas(containerRef.current, {
                useCORS: true,
                scale: 2,
                backgroundColor: '#ffffff',
                windowWidth: containerRef.current.scrollWidth,
                windowHeight: containerRef.current.scrollHeight
            });
            return await sliceCanvasIntoBlobs(canvas);
        } catch (err) {
            console.error('Failed to capture image', err);
            return [];
        } finally {
            // Restore original styles
            containerRef.current.style.height = originalHeight;
            containerRef.current.style.overflow = originalOverflow;
            if (scrollContent) {
                scrollContent.style.height = originalScrollHeight || '';
                scrollContent.style.overflow = originalScrollOverflow || '';
                scrollContent.style.maxHeight = originalScrollMaxHeight || '';
            }
            setIsSharing(false);
        }
    };

    const handleShareNative = async () => {
        setShareMenuOpen(false);
        setIsSharing(true);
        try {
            const blobs = await captureImages();
            if (!blobs.length) {
                addToast('Failed to generate image.', 'error');
                return;
            }

            if (Capacitor.isNativePlatform()) {
                try {
                    const savedFiles = [] as { uri: string }[];
                    for (let index = 0; index < blobs.length; index++) {
                        const blob = blobs[index];
                        const base64Data = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const b64 = (reader.result as string).split(',')[1];
                                resolve(b64);
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });

                        const fileName = `avelut_solution_${Date.now()}_${index + 1}.png`;
                        const savedFile = await Filesystem.writeFile({
                            path: fileName,
                            data: base64Data,
                            directory: Directory.Cache
                        });
                        savedFiles.push({ uri: savedFile.uri });
                    }

                    try {
                        await Share.share({
                            title: 'Avelut Solution',
                            text: 'Check out this solution from Avelut Visual Solver!',
                            files: savedFiles.map(file => file.uri),
                            dialogTitle: 'Share Solution'
                        });
                    } catch (shareErr: any) {
                        if (shareErr.message !== 'Share canceled') {
                            console.error('Share plugin error, falling back to FileOpener:', shareErr);
                            await FileOpener.openFile({
                                path: savedFiles[0].uri,
                                mimeType: 'image/png'
                            });
                            addToast(blobs.length > 1 ? 'Images saved! Use the menu to share them.' : 'Image saved! Use the menu to share.', 'success');
                        }
                    }
                } catch (err) {
                    console.error('Native share error:', err);
                    addToast('Failed to share image.', 'error');
                }
            } else {
                const files = blobs.map((blob, index) => new File([blob], `avelut_solution_${index + 1}.png`, { type: 'image/png' }));
                if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
                    try {
                        await navigator.share({
                            title: 'Avelut Solution',
                            text: 'Check out this solution from Avelut Visual Solver!',
                            files
                        });
                    } catch (err) {
                        console.error('Error sharing', err);
                    }
                } else {
                    blobs.forEach((blob, index) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `avelut_solution_${index + 1}.png`;
                        a.click();
                        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                    });
                    addToast(blobs.length > 1 ? 'Images downloaded! You can share them manually.' : 'Image downloaded! You can now share it manually.', 'success');
                }
            }
        } finally {
            setIsSharing(false);
        }
    };

    const handleShareNativeLegacy = async () => {
        const blobs = await captureImages();
        if (!blobs.length) {
            addToast('Failed to generate image.', 'error');
            return;
        }

        if (Capacitor.isNativePlatform()) {
            try {
                const savedFiles = [] as { uri: string }[];
                for (let index = 0; index < blobs.length; index++) {
                    const blob = blobs[index];
                    const base64Data = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const b64 = (reader.result as string).split(',')[1];
                            resolve(b64);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });

                    const fileName = `avelut_solution_${Date.now()}_${index + 1}.png`;
                    const savedFile = await Filesystem.writeFile({
                        path: fileName,
                        data: base64Data,
                        directory: Directory.Cache
                    });
                    savedFiles.push({ uri: savedFile.uri });
                }

                try {
                    await Share.share({
                        title: 'Avelut Solution',
                        text: 'Check out this solution from Avelut Visual Solver!',
                        files: savedFiles.map(file => file.uri),
                        dialogTitle: 'Share Solution'
                    });
                } catch (shareErr: any) {
                    // Fallback to FileOpener if share is cancelled or fails
                    if (shareErr.message !== 'Share canceled') {
                        console.error('Share plugin error, falling back to FileOpener:', shareErr);
                        await FileOpener.openFile({
                            path: savedFiles[0].uri,
                            mimeType: 'image/png'
                        });
                        addToast(blobs.length > 1 ? 'Images saved! Use the menu to share them.' : 'Image saved! Use the menu to share.', 'success');
                    }
                }
            } catch (err) {
                console.error('Native share error:', err);
                addToast('Failed to share image.', 'error');
            }
        } else {
            const files = blobs.map((blob, index) => new File([blob], `avelut_solution_${index + 1}.png`, { type: 'image/png' }));
            if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
                try {
                    await navigator.share({
                        title: 'Avelut Solution',
                        text: 'Check out this solution from Avelut Visual Solver!',
                        files
                    });
                } catch (err) {
                    console.error('Error sharing', err);
                }
            } else {
                // Fallback to downloading each slice
                blobs.forEach((blob, index) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `avelut_solution_${index + 1}.png`;
                    a.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                });
                addToast(blobs.length > 1 ? 'Images downloaded! You can share them manually.' : 'Image downloaded! You can now share it manually.', 'success');
            }
        }
    };

    const handleForwardToPartner = async () => {
        if (selectedIds.length === 0) return;
        setShareMenuOpen(false);
        setIsSending(true);
        const blobs = await captureImages();
        if (!blobs.length) {
            addToast('Failed to generate image.', 'error');
            setIsSending(false);
            return;
        }

        try {
            for (const recipientId of selectedIds) {
                const chatId = [userProfile.uid, recipientId].sort().join('_');
                const participantIds = [userProfile.uid, recipientId];
                const updates: any = {};

                for (let sliceIndex = 0; sliceIndex < blobs.length; sliceIndex++) {
                    const blob = blobs[sliceIndex];
                    const localTimestamp = Date.now() + sliceIndex;
                    const cloudPath = `chat_files/${chatId}/${localTimestamp}_solution_${sliceIndex + 1}.png`;
                    const fileBucketRef = storageRef(storage, cloudPath);
                    const snapshot = await uploadBytes(fileBucketRef, blob);
                    const fileDownloadUrl = await getDownloadURL(snapshot.ref);

                    const text = `![Avelut Solution ${sliceIndex + 1}](${fileDownloadUrl})`;
                    const msgRef = push(dbRef(db, `messages/${chatId}`));
                    const data = {
                        senderId: userProfile.uid,
                        text,
                        type: 'image',
                        timestamp: localTimestamp,
                        is_forwarded: true,
                        partIndex: sliceIndex + 1,
                        totalParts: blobs.length,
                    };
                    await set(msgRef, data);

                    participantIds.forEach((participantId) => {
                        updates[`user_chats/${participantId}/${chatId}/last_message`] = {
                            text: blobs.length > 1 ? `📷 Solution Image (${sliceIndex + 1}/${blobs.length})` : '📷 Solution Image',
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
                    updates[`user_chats/${recipientId}/${chatId}/unreadCount`] = 1;
                }

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
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-slate-950/40 backdrop-blur-sm p-0 sm:p-2">
            <div
                ref={sheetRef}
                className={`w-full max-w-5xl rounded-t-[32px] border border-slate-200 bg-white shadow-[0_-18px_60px_rgba(15,23,42,0.18)] transition-transform duration-300 ${isClosing ? 'translate-y-full' : 'translate-y-0'}`}
                style={{ transform: `translateY(${dragOffsetY}px)` }}
                onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
                onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
                onTouchEnd={handleDragEnd}
                onMouseDown={(e) => handleDragStart(e.clientY)}
                onMouseMove={(e) => handleDragMove(e.clientY)}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
            >
                <div className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing">
                    <div className="h-1.5 w-16 rounded-full bg-slate-300" />
                </div>

                <div className="flex items-start justify-between px-4 pb-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-emerald-600">Visual tutorial</p>
                        <h3 className="text-lg font-semibold text-slate-900">Step-by-step guide</h3>
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShareMenuOpen(prev => !prev)}
                            disabled={isSharing || isSending}
                            className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:scale-105 disabled:opacity-60"
                            aria-label="More actions"
                        >
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="5" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="19" r="1.5" />
                            </svg>
                        </button>
                        {shareMenuOpen && (
                            <div className="absolute right-0 bottom-14 z-10 flex min-w-[180px] flex-col rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                                <button onClick={() => { setShowForwardModal(true); setShareMenuOpen(false); }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700">↪ Forward</button>
                                <button onClick={() => { void handleShareNative(); }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700">{isSharing ? 'Preparing share…' : 'Share'}</button>
                                <button onClick={async () => { setShareMenuOpen(false); try { const reportsRef = dbRef(db, 'reported_content'); await push(reportsRef, { userId: userProfile.uid, messageText: tutorialText, timestamp: serverTimestamp(), type: 'visual_solver_response' }); addToast('Content reported to moderators', 'success'); } catch (err) { console.error('Failed to report:', err); addToast('Failed to report content', 'error'); } }} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700">⚑ Report</button>
                            </div>
                        )}
                    </div>
                </div>

                <div ref={containerRef} className="max-h-[64vh] overflow-y-auto bg-white px-4 pb-24 sm:px-6">
                    <div className="mb-4 overflow-hidden rounded-[24px] border border-slate-200 bg-gradient-to-br from-indigo-50 via-sky-50 to-white">
                        <img src={scannedImage} alt="Scanned problem" className="h-44 w-full object-contain p-3" />
                    </div>
                    <div ref={scrollContentRef} className="max-w-4xl mx-auto pb-8">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                                h1: ({node, ...props}: any) => <h1 className="text-3xl sm:text-4xl font-extrabold text-indigo-900 mt-10 mb-6 tracking-tight leading-tight" {...props} />,
                                h2: ({node, ...props}: any) => <h2 className="text-2xl sm:text-3xl font-bold text-indigo-800 mt-8 mb-5 tracking-tight border-b border-indigo-100 pb-2" {...props} />,
                                h3: ({node, ...props}: any) => <h3 className="text-xl sm:text-2xl font-bold text-indigo-700 mt-6 mb-4 tracking-tight" {...props} />,
                                h4: ({node, ...props}: any) => <h4 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2 mt-4" {...props} />,
                                p: ({node, ...props}: any) => <p className="mb-5 text-base sm:text-lg text-gray-700 leading-relaxed tracking-wide" {...props} />,
                                a: ({node, ...props}: any) => <a className="text-indigo-600 font-semibold hover:text-indigo-800 hover:underline decoration-indigo-300 decoration-2 transition-all" target="_blank" rel="noreferrer" {...props} />,
                                strong: ({node, ...props}: any) => <strong className="font-bold text-gray-900 bg-yellow-100 px-1.5 py-0.5 rounded" {...props} />,
                                em: ({node, ...props}: any) => <em className="italic text-indigo-600 font-medium" {...props} />,
                                ul: ({node, ...props}: any) => <ul className="list-none space-y-3 my-5 pl-1" {...props} />,
                                li: ({node, ...props}: any) => <li className="flex items-start gap-3 text-base sm:text-lg text-gray-700 leading-relaxed before:content-['●'] before:text-indigo-500 before:font-bold before:text-xl before:mt-0.5 before:flex-shrink-0" {...props} />,
                                ol: ({node, ...props}: any) => <ol className="list-none space-y-4 my-6 counter-reset-[step]" {...props} />,
                                code: ({node, inline, ...props}: any) => inline ? <code className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-mono text-sm border border-indigo-200" {...props} /> : <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-4 font-mono text-sm leading-relaxed border-l-4 border-indigo-500" {...props} />,
                                pre: ({node, ...props}: any) => <pre className="bg-gray-900 rounded-lg overflow-hidden my-5 shadow-lg" {...props} />,
                                blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-amber-400 bg-amber-50 pl-6 pr-4 py-4 my-5 rounded-r-lg shadow-sm" {...props} />,
                                table: ({node, ...props}: any) => <div className="overflow-x-auto my-6 shadow-md rounded-lg"><table className="min-w-full divide-y divide-gray-200 border border-gray-200" {...props} /></div>,
                                thead: ({node, ...props}: any) => <thead className="bg-indigo-600 text-white" {...props} />,
                                tbody: ({node, ...props}: any) => <tbody className="bg-white divide-y divide-gray-200" {...props} />,
                                tr: ({node, ...props}: any) => <tr className="hover:bg-gray-50 transition-colors" {...props} />,
                                th: ({node, ...props}: any) => <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider" {...props} />,
                                td: ({node, ...props}: any) => <td className="px-6 py-4 text-sm text-gray-700" {...props} />,
                                hr: ({node, ...props}: any) => <hr className="my-8 border-t-2 border-gray-200" {...props} />,
                            }}
                        >
                            {tutorialText}
                        </ReactMarkdown>
                    </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
                    <button onClick={closeSheet} className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-200">Back</button>
                    <button onClick={() => { setShowForwardModal(true); setShareMenuOpen(false); }} disabled={isSending} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">Forward</button>
                    <button onClick={() => { void handleShareNative(); }} disabled={isSharing} className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60">{isSharing ? 'Preparing…' : 'Share'}</button>
                </div>
            </div>

            {showForwardModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#E9ECEF] p-5">
                            <h2 className="text-base font-bold text-[#212529]">Forward Solution</h2>
                            <button onClick={() => setShowForwardModal(false)} disabled={isSending} className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-[#6C757D] transition hover:bg-neutral-200">✕</button>
                        </div>
                        <div className="border-b border-[#E9ECEF] p-4">
                            <input type="text" placeholder="Search partners..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-[#F8F9FA] px-4 py-2 text-sm focus:border-[#009EE2] focus:outline-none" />
                        </div>
                        <div className="flex-1 space-y-2 overflow-y-auto p-4">
                            {filteredPartners.length === 0 ? (
                                <p className="py-8 text-center text-xs font-medium text-gray-500">No partners found</p>
                            ) : (
                                filteredPartners.map(u => (
                                    <div key={u.uid} onClick={() => setSelectedIds(prev => prev.includes(u.uid) ? prev.filter(id => id !== u.uid) : [...prev, u.uid])} className={`flex items-center justify-between rounded-2xl border p-3 cursor-pointer ${selectedIds.includes(u.uid) ? 'border-[#009EE2] bg-[#009EE2]/5' : 'border-[#E9ECEF]'}`}>
                                        <div className="text-sm font-semibold">{u.display_name}</div>
                                        <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${selectedIds.includes(u.uid) ? 'border-[#009EE2] bg-[#009EE2]' : 'border-gray-300'}`}>
                                            {selectedIds.includes(u.uid) && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex gap-3 border-t bg-[#F8F9FA] p-4">
                            <button onClick={() => setShowForwardModal(false)} disabled={isSending} className="flex-1 rounded-xl border border-slate-200 bg-white py-3.5 text-xs font-bold uppercase tracking-wide text-gray-500">Cancel</button>
                            <button onClick={handleForwardToPartner} disabled={isSending || selectedIds.length === 0} className="flex-[2] rounded-xl bg-[#009EE2] py-3.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50">
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
                        const normalized = await readImageAsDataUrl(sharedImage);
                        imageUri = normalized.dataUrl;
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
                    model: geminiModel || 'gemini-3.1-flash-lite',
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

                onStartChat?.(
                    `Teach me this scanned problem step by step in a friendly tutor style. Use simple language, explain the concept clearly, and include a small visual hint if useful.\n\nScanned problem context:\n${finalResult}`,
                    finalResult
                );

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
    }, [scannedImage, attemptApiCall, customPrompt, aiClient, geminiModel, userProfile, appSettings, addToast, onStartChat]);

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
                    model: geminiModel || 'gemini-3.1-flash-lite',
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
                    model: geminiModel || 'gemini-3.1-flash-lite',
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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isImageLike = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|gif|bmp|webp|heic|heif)$/i.test(file.name);
        if (!isImageLike) {
            addToast('Please upload a valid image file.', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            addToast('Image must be under 10MB.', 'error');
            return;
        }

        try {
            setCameraState('preview');
            const { dataUrl } = await readImageAsDataUrl(file);
            setScannedImage(dataUrl);
            setError('');
        } catch (error) {
            console.error('Could not process uploaded image:', error);
            addToast('Could not read the image. Please try another photo.', 'error');
        } finally {
            e.target.value = '';
        }
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
                            accept="image/*"
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
