import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { UserProfile } from '../types';
import { useApiLimiter } from '../hooks/useApiLimiter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// --- INLINE ICONS ---
const ShutterIcon: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <circle cx="32" cy="32" r="30" fill="white" fillOpacity="0.2" />
        <circle cx="32" cy="32" r="26" stroke="white" strokeWidth="4" />
    </svg>
);
const ErrorIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
     <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
     </svg>
);

type CameraState = 'initializing' | 'denied' | 'error' | 'ready' | 'scanning' | 'preview' | 'analyzing' | 'result';

export const VisualSolver: React.FC<{ userProfile: UserProfile }> = ({ userProfile }) => {
    const [cameraState, setCameraState] = useState<CameraState>('initializing');
    const [scannedImage, setScannedImage] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [error, setError] = useState<string>('');
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const guideFrameRef = useRef<HTMLDivElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const { attemptApiCall } = useApiLimiter(userProfile.plan);

    const cleanupCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if(videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const initializeCamera = useCallback(async () => {
        cleanupCamera();
        setCameraState('initializing');
        setError('');

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            streamRef.current = mediaStream;
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
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
        initializeCamera();
        return cleanupCamera;
    }, [initializeCamera, cleanupCamera]);

    const handleScan = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const guideFrame = guideFrameRef.current;

        if (!video || !canvas || !guideFrame || video.readyState < 2) {
             setError('Camera not ready. Please wait a moment.');
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

        let sWidth = videoWidth;
        let sHeight = videoHeight;
        let sX = 0;
        let sY = 0;

        if (videoAspectRatio > videoElAspectRatio) {
            sWidth = videoHeight * videoElAspectRatio;
            sX = (videoWidth - sWidth) / 2;
        } else {
            sHeight = videoWidth / videoElAspectRatio;
            sY = (videoHeight - sHeight) / 2;
        }

        const guideRect = guideFrame.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();

        const relativeX = (guideRect.left - videoRect.left) / videoElWidth;
        const relativeY = (guideRect.top - videoRect.top) / videoElHeight;
        const relativeWidth = guideRect.width / videoElWidth;
        const relativeHeight = guideRect.height / videoElHeight;

        const cropX = sX + relativeX * sWidth;
        const cropY = sY + relativeY * sHeight;
        const cropWidth = relativeWidth * sWidth;
        const cropHeight = relativeHeight * sHeight;

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setError('Could not process image.');
            setCameraState('error');
            return;
        }

        ctx.filter = 'contrast(1.5) brightness(1.1) grayscale(0.2)';
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setScannedImage(imageDataUrl);

        setTimeout(() => setCameraState('preview'), 500);

    }, []);

    const handleAnalyze = useCallback(async () => {
        if (!scannedImage) return;

        setCameraState('analyzing');
        
        const apiCallPromise = attemptApiCall(async () => {
            const base64Data = scannedImage.split(',')[1];
            if (!base64Data) throw new Error("Could not extract image data.");
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [
                    { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
                    { text: `You are VANTUTOR, an expert AI educator. Analyze this image of a problem and provide a detailed, step-by-step solution. Explain the reasoning clearly for a student at this level: ${userProfile.level}. If it is not a solvable problem, describe what you see in an educational context. Format your response using Markdown, including LaTeX for any mathematical equations.` }
                ]},
            });

            setAnalysisResult(response.text);
        });

        const result = await apiCallPromise;
        
        if (result.success) {
            setCameraState('result');
        } else {
            setError(result.message || "Failed to analyze the image. Please try again.");
            setCameraState('preview');
        }
    }, [scannedImage, attemptApiCall, userProfile.level]);

    const handleRetake = () => {
        setScannedImage(null);
        setAnalysisResult('');
        setError('');
        initializeCamera();
    };

    const renderContent = () => {
        switch (cameraState) {
            case 'initializing':
                return <div className="flex flex-col items-center justify-center h-full"><div className="w-8 h-8 border-4 border-t-lime-500 border-gray-600 rounded-full animate-spin"></div><p className="mt-4 text-gray-300">Starting camera...</p></div>;

            case 'denied':
                return <div className="flex flex-col items-center justify-center h-full text-center p-4"><ErrorIcon className="w-12 h-12 text-yellow-400 mb-4" /><h3 className="text-xl font-semibold">Camera Access Denied</h3><p className="text-gray-400 mt-2 max-w-sm">{error}</p><button onClick={initializeCamera} className="mt-6 bg-white/10 text-white font-bold py-2 px-6 rounded-full hover:bg-white/20 transition-colors">Retry</button></div>;

            case 'error':
                return <div className="flex flex-col items-center justify-center h-full text-center p-4"><ErrorIcon className="w-12 h-12 text-red-400 mb-4" /><h3 className="text-xl font-semibold">Camera Error</h3><p className="text-gray-400 mt-2 max-w-sm">{error}</p><button onClick={initializeCamera} className="mt-6 bg-white/10 text-white font-bold py-2 px-6 rounded-full hover:bg-white/20 transition-colors">Retry</button></div>;

            case 'ready':
            case 'scanning':
                return (
                    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            onCanPlay={() => setCameraState('ready')}
                            className="w-full h-full object-cover" 
                        />
                        <div className="absolute inset-0 bg-black/30"></div>
                        <div ref={guideFrameRef} className={`absolute w-[90%] h-[70%] max-w-3xl max-h-[50vh] border-4 border-dashed border-white/50 rounded-2xl transition-all duration-300 pointer-events-none ${cameraState === 'scanning' ? 'border-solid border-lime-400 scale-105 animate-[scan-pulse_1.5s_ease-in-out_infinite]' : ''}`}>
                            <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                            <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                            <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                            <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-xl"></div>
                             <div className="absolute inset-0 flex items-center justify-center">
                                <p className="text-white bg-black/50 px-3 py-1 rounded-md text-sm">Position document in frame</p>
                            </div>
                        </div>
                    </div>
                );

            case 'preview':
            case 'analyzing':
                return (
                    <div className="w-full h-full flex items-center justify-center p-4 bg-black/50 relative">
                        <img src={scannedImage || ''} alt="Scanned document" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                        {cameraState === 'analyzing' && 
                             <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
                                 <div className="w-12 h-12 border-4 border-t-lime-500 border-gray-600 rounded-full animate-spin mb-4"></div>
                                 <p className="text-lg font-semibold">Analyzing Image...</p>
                                 <p className="text-sm text-gray-400">This may take a moment.</p>
                             </div>
                        }
                    </div>
                );

            case 'result':
                return (
                    <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden">
                        <div className="w-full lg:w-1/2 bg-black/20 p-4 flex items-center justify-center flex-shrink-0"><img src={scannedImage || ''} alt="Analyzed problem" className="max-w-full max-h-full object-contain rounded-lg" /></div>
                        <div className="w-full lg:w-1/2 p-6 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><h3 className="text-xl font-bold mb-4 bg-gradient-to-r from-lime-300 to-teal-400 text-transparent bg-clip-text">Step-by-Step Solution</h3><div className="prose prose-invert prose-sm text-gray-300 max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{analysisResult}</ReactMarkdown></div></div>
                    </div>
                );
        }
    };
    
    const renderControls = () => {
         switch (cameraState) {
            case 'ready':
                return <button onClick={handleScan} aria-label="Scan Document" className="p-2 text-white rounded-full transition-transform active:scale-90 animate-[glow-pulse_2.5s_ease-in-out_infinite]"><ShutterIcon /></button>;
            case 'scanning':
                return <button disabled aria-label="Scanning" className="p-2 text-white rounded-full cursor-not-allowed"><ShutterIcon className="w-16 h-16 opacity-50" /></button>;
            case 'preview':
                return (
                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
                        {error && <p className="text-red-400 text-sm order-first sm:order-none">{error}</p>}
                        <div className="flex items-center gap-4">
                             <button onClick={handleRetake} className="bg-white/10 text-white font-bold py-3 px-8 rounded-full hover:bg-white/20 transition-colors">Retake</button>
                             <button onClick={handleAnalyze} className="bg-lime-600 text-white font-bold py-3 px-8 rounded-full hover:bg-lime-700 transition-colors flex items-center gap-2">Analyze</button>
                        </div>
                    </div>
                );
            case 'analyzing':
                 return <button disabled className="bg-gray-500 text-white font-bold py-3 px-8 rounded-full cursor-not-allowed">Analyzing...</button>;
            case 'result':
                 return <button onClick={handleRetake} className="bg-white/10 text-white font-bold py-3 px-8 rounded-full hover:bg-white/20 transition-colors">Scan Another</button>;
            default:
                return null;
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full">
            <div className="flex-1 bg-gradient-to-br from-white/[.07] to-white/0 backdrop-blur-lg rounded-xl border border-white/10 flex flex-col overflow-hidden">
                <div className="flex-1 relative">
                    {renderContent()}
                </div>
                <div className="flex-shrink-0 p-4 border-t border-white/10 bg-black/20 flex items-center justify-center h-24">
                    {renderControls()}
                </div>
            </div>
            <canvas ref={canvasRef} className="hidden"></canvas>
        </div>
    );
};