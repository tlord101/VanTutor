import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { BrainCircuit, BookOpen, Layers, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';

const features = [
    {
        id: 'tutor',
        title: 'Context-Aware AI Tutor',
        description: 'Chat with an AI that has literally read your textbook. It knows your syllabus, your department, and exactly what you need to know for the exam.',
        icon: <BrainCircuit className="w-8 h-8" />,
        color: 'from-brand-500 to-brand-700',
        videoUrl: '/iPhone-13-PRO-www.avelut.xyz-zclw-hoy-qiyjc.webm'
    },
    {
        id: 'scanner',
        title: 'Visual Problem Scanner',
        description: 'Stuck on a problem? Snap a photo. The AI extracts the text, math, and context instantly and provides step-by-step guidance.',
        icon: <BookOpen className="w-8 h-8" />,
        color: 'from-sky-500 to-sky-700',
        videoUrl: '/iPhone-13-PRO-www.avelut.xyz-kjfr-gop_rjqvc.webm'
    },
    {
        id: 'import',
        title: 'Cloud Document Import',
        description: 'Import textbooks directly from Google Drive. We parse it, chunk it, and index it into your personal study environment in seconds.',
        icon: <Layers className="w-8 h-8" />,
        color: 'from-emerald-500 to-emerald-700',
        videoUrl: '/iPhone-13-PRO-www.avelut.xyz-hsejqaztogs47d.webm'
    },
    {
        id: 'messenger',
        title: 'Real-Time Peer Messenger',
        description: 'Collaborate with your classmates, share notes, and discuss complex topics in dedicated course channels instantly.',
        icon: <MessageSquare className="w-8 h-8" />,
        color: 'from-purple-500 to-purple-700',
        videoUrl: '' // No mockup for this yet, will just use a colored placeholder
    }
];

export const FeatureCarousel: React.FC = () => {
    const [currentIndex, setCurrentIndex] = useState(0);

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % features.length);
    };

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev - 1 + features.length) % features.length);
    };

    const handlers = useSwipeable({
        onSwipedLeft: handleNext,
        onSwipedRight: handlePrev,
        preventScrollOnSwipe: true,
        trackMouse: true
    });

    return (
        <section className="py-24 px-6 max-w-7xl mx-auto overflow-hidden" id="features">
            <div className="text-center mb-16 space-y-4">
                <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">An Ecosystem of Intelligence</h2>
                <p className="text-lg text-slate-600 font-medium max-w-2xl mx-auto">
                    Everything you need to demolish your coursework, built into one seamless, blazingly fast platform. Swipe to explore.
                </p>
            </div>

            <div className="relative h-[600px] w-full max-w-5xl mx-auto flex items-center justify-center" {...handlers}>
                <AnimatePresence initial={false}>
                    {features.map((feature, index) => {
                        const offset = index - currentIndex;
                        const isCenter = offset === 0;
                        const isLeft = offset === -1 || (currentIndex === 0 && index === features.length - 1);
                        const isRight = offset === 1 || (currentIndex === features.length - 1 && index === 0);
                        
                        // If it's not the center, immediate left, or immediate right, don't render it (or hide it)
                        if (!isCenter && !isLeft && !isRight) return null;

                        const rotateY = isLeft ? 45 : isRight ? -45 : 0;
                        const translateX = isLeft ? '-60%' : isRight ? '60%' : '0%';
                        const zIndex = isCenter ? 20 : 10;
                        const opacity = isCenter ? 1 : 0.6;
                        const scale = isCenter ? 1 : 0.85;

                        return (
                            <motion.div
                                key={feature.id}
                                className="absolute w-full max-w-[340px] md:max-w-[400px] aspect-[9/16] bg-white rounded-[32px] shadow-2xl border border-slate-100 cursor-pointer overflow-hidden flex flex-col"
                                initial={false}
                                animate={{
                                    rotateY,
                                    x: translateX,
                                    z: isCenter ? 100 : 0,
                                    zIndex,
                                    opacity,
                                    scale
                                }}
                                transition={{
                                    type: "spring",
                                    stiffness: 200,
                                    damping: 25,
                                    mass: 1
                                }}
                                onClick={() => {
                                    if (isLeft) handlePrev();
                                    if (isRight) handleNext();
                                }}
                                style={{ transformStyle: "preserve-3d" }}
                            >
                                {/* Card Header / Icon */}
                                <div className={`h-1/3 bg-gradient-to-br ${feature.color} p-6 flex flex-col justify-end relative overflow-hidden`}>
                                    <div className="absolute top-[-20%] right-[-10%] w-[150px] h-[150px] bg-white/20 rounded-full blur-[30px]" />
                                    <div className="text-white z-10 mb-2">
                                        {feature.icon}
                                    </div>
                                    <h3 className="text-2xl font-black text-white z-10">{feature.title}</h3>
                                </div>
                                
                                {/* Card Body */}
                                <div className="p-6 flex-1 bg-white relative flex flex-col justify-between">
                                    <p className="text-slate-600 font-medium leading-relaxed">
                                        {feature.description}
                                    </p>
                                    
                                    <div className="mt-4 w-full h-[180px] rounded-2xl bg-slate-100 overflow-hidden relative shadow-inner">
                                        {feature.videoUrl ? (
                                            <video 
                                                autoPlay loop muted playsInline 
                                                className="w-full h-full object-cover object-top"
                                            >
                                                <source src={feature.videoUrl} type="video/webm" />
                                            </video>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 font-bold">
                                                Coming Soon
                                            </div>
                                        )}
                                        {/* Overlay to prevent interactions with the video inside the card */}
                                        <div className="absolute inset-0 z-10" />
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* Controls */}
                <div className="absolute bottom-[-60px] left-1/2 -translate-x-1/2 flex items-center gap-6">
                    <button 
                        onClick={handlePrev}
                        className="w-12 h-12 rounded-full bg-white shadow-lg border border-slate-100 flex items-center justify-center text-slate-600 hover:text-brand-600 hover:scale-110 transition"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="flex gap-2">
                        {features.map((_, i) => (
                            <div 
                                key={i} 
                                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i === currentIndex ? 'bg-brand-600 w-6' : 'bg-slate-300'}`} 
                            />
                        ))}
                    </div>
                    <button 
                        onClick={handleNext}
                        className="w-12 h-12 rounded-full bg-white shadow-lg border border-slate-100 flex items-center justify-center text-slate-600 hover:text-brand-600 hover:scale-110 transition"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </section>
    );
};
