
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { UserProfile } from '../types';
import { useApiLimiter } from '../hooks/useApiLimiter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CameraIcon } from './icons/CameraIcon';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

type VisualSolverState = 'initializing' | 'ready' | 'analyzing' | 'result' | 'error';

export const VisualSolver: React.FC<{ userProfile: UserProfile }> = ({ userProfile }) => {
    const [currentState, setCurrentState] = useState<VisualSolverState>('initializing');
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [error, setError] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { attemptApiCall } = useApiLimiter(userProfile.plan);

    const startCamera = useCallback(async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            setCurrentState('ready');
            setError('');
        } catch (err) {
            console.error("Error accessing camera:", err);
            setError("Camera access was denied or is not available. Please check your browser permissions.");
            setCurrentState('error');
        }
    }, []);

    useEffect(() => {
        startCamera();
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [startCamera]);

    const handleAnalyze = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        setCurrentState('analyzing');
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if(!context) return;

        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const imageDataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(imageDataUrl);

        // Promise for a minimum 5-second delay for the animation
        const minDelayPromise = new Promise(resolve => setTimeout(resolve, 5000));

        let apiSuccess = false;
        let apiErrorMessage = '';

        const apiCallPromise = attemptApiCall(async () => {
            const base64Data = imageDataUrl.split(',')[1];
            if (!base64Data) {
                throw new Error("Could not extract image data.");
            }
            const imagePart = {
                inlineData: { data: base64Data, mimeType: 'image/jpeg' },
            };
            const textPart = {
                text: "You are VANTUTOR, an expert AI educator. Analyze this image and provide a detailed explanation. If it's a problem, solve it step-by-step with clear reasoning. If it's a diagram, explain its components and function. Keep the tone helpful and educational for a student at this level: " + userProfile.level
            };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, textPart] },
            });

            setAnalysisResult(response.text);
        }).then(result => {
            apiSuccess = result.success;
            if (!result.success) {
                apiErrorMessage = result.message;
            }
        });

        // Wait for both the minimum delay and the API call to complete
        await Promise.all([minDelayPromise, apiCallPromise]);
        
        if (apiSuccess) {
            setCurrentState('result');
        } else {
            setError(apiErrorMessage || "Failed to analyze the image. Please try again.");
            setCurrentState('error');
        }
    };

    const handleReset = () => {
        setCapturedImage(null);
        setAnalysisResult('');
        setError('');
        setCurrentState('ready');
    };

    const renderCameraView = () => (
        <div className="absolute inset-0 flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30"></div>
            <div className="absolute inset-8 border-4 border-dashed border-white/50 rounded-2xl flex flex-col items-center justify-center p-4">
                 <p className="text-white font-bold text-lg text-center drop-shadow-lg">Position the problem inside the frame</p>
                 <p className="text-white/80 text-sm text-center drop-shadow-md mt-1">Ensure good lighting for the best results.</p>
            </div>
        </div>
    );
    
    const renderAnalysisView = () => (
        <div className="absolute inset-0 flex items-center justify-center">
            <img src={capturedImage || ''} alt="Captured problem" className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
                 <div className="w-12 h-12 border-4 border-t-lime-500 border-gray-600 rounded-full animate-spin mb-4"></div>
                 <p className="text-lg font-semibold">Analyzing Image...</p>
                 <p className="text-sm text-gray-300">The AI tutor is examining your query.</p>
            </div>
            <div className="scanner-animation absolute inset-0 overflow-hidden"></div>
        </div>
    );

    const renderResultView = () => (
        <div className="flex-1 flex flex-col lg:flex-row h-full">
            <div className="w-full lg:w-1/2 bg-black/20 p-4 flex items-center justify-center">
                <img src={capturedImage || ''} alt="Analyzed problem" className="max-w-full max-h-full object-contain rounded-lg" />
            </div>
            <div className="w-full lg:w-1/2 p-6 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <h3 className="text-xl font-bold mb-4 bg-gradient-to-r from-lime-300 to-teal-400 text-transparent bg-clip-text">Analysis Result</h3>
                <div className="prose prose-invert prose-sm text-gray-300">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                            strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1 my-2" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1 my-2" {...props} />,
                        }}
                    >
                        {analysisResult}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );

    const renderMessageView = (icon: React.ReactNode, title: string, message: string) => (
         <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 text-white">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">{icon}</div>
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="text-gray-400 mt-2">{message}</p>
        </div>
    );

    const renderContent = () => {
        switch (currentState) {
            case 'initializing':
                return renderMessageView(<div className="w-8 h-8 border-4 border-t-lime-500 border-gray-600 rounded-full animate-spin"></div>, "Initializing Camera", "Please wait...");
            case 'ready':
                return renderCameraView();
            case 'analyzing':
                return renderAnalysisView();
            case 'result':
                return renderResultView();
            case 'error':
                 return renderMessageView(
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                    "An Error Occurred",
                     error
                 );
            default:
                return null;
        }
    }

    return (
        <div className="flex-1 flex flex-col h-full w-full">
            <style>{`
                .scanner-animation::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 4px;
                    background: linear-gradient(90deg, transparent, rgba(163, 230, 53, 0.7), transparent);
                    box-shadow: 0 0 10px 2px rgba(163, 230, 53, 0.5);
                    animation: scan 3s ease-in-out infinite;
                    border-radius: 2px;
                }

                @keyframes scan {
                    0% { top: 0; }
                    50% { top: calc(100% - 4px); }
                    100% { top: 0; }
                }
            `}</style>

            <div className="flex-1 bg-gradient-to-br from-white/[.07] to-white/0 backdrop-blur-lg rounded-xl border border-white/10 flex flex-col overflow-hidden">
                <div className="flex-1 relative">
                    {renderContent()}
                </div>
                <div className="flex-shrink-0 p-4 border-t border-white/10 bg-black/20 flex items-center justify-center">
                    {currentState === 'ready' && (
                        <button onClick={handleAnalyze} className="bg-lime-600 text-white font-bold py-3 px-6 rounded-full hover:bg-lime-700 transition-colors flex items-center gap-2">
                            <CameraIcon className="w-5 h-5" />
                            <span>Capture & Analyze</span>
                        </button>
                    )}
                    {(currentState === 'result' || currentState === 'error') && (
                         <button onClick={handleReset} className="bg-white/10 text-white font-bold py-3 px-6 rounded-full hover:bg-white/20 transition-colors">
                            Scan Another
                        </button>
                    )}
                     {currentState === 'analyzing' && (
                         <button disabled className="bg-gray-500 text-white font-bold py-3 px-6 rounded-full cursor-not-allowed">
                            Analyzing...
                        </button>
                    )}
                </div>
            </div>
            <canvas ref={canvasRef} className="hidden"></canvas>
        </div>
    );
};
