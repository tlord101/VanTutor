import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';

const features = [
    {
        id: 'live',
        title: 'Live Tutorial',
        description: 'A private classroom: voice that teaches like a lecturer, illustrations that draw on the board as the idea forms, and room to ask questions mid-lesson. 15, 30, or 60 minutes — resume anytime.',
        icon: <i className="bi bi-easel2 text-3xl"></i>,
        bgImage: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80'
    },
    {
        id: 'chat',
        title: 'Unlimited Avelut AI Chat',
        description: 'Stuck at any hour? Ask again and again. Main Avelut chat stays unlimited so you can dig into the hard part until it clicks — no daily message wall on the core tutor chat.',
        icon: <i className="bi bi-chat-square-text text-3xl"></i>,
        bgImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80'
    },
    {
        id: 'scanner',
        title: 'Scan & Solve',
        description: 'Snap a problem or diagram. Get a clear, step-by-step walkthrough instead of a one-line answer you can’t use on the exam.',
        icon: <i className="bi bi-camera text-3xl"></i>,
        bgImage: 'https://images.unsplash.com/photo-1516383740770-fbcc5ccbece0?auto=format&fit=crop&w=800&q=80'
    },
    {
        id: 'guides',
        title: 'Study Guides & Notebooks',
        description: 'Turn messy material into structured guides. Keep notebooks, flashcards, and quizzes in one home so revision actually happens.',
        icon: <i className="bi bi-journal-bookmark text-3xl"></i>,
        bgImage: 'https://images.unsplash.com/photo-1456513080880-7d93aaa2ba29?auto=format&fit=crop&w=800&q=80'
    },
    {
        id: 'practice',
        title: 'Quizzes that explain',
        description: 'Timed practice with explanations for every miss — not just a score. Focus the next hour where it actually moves your grade.',
        icon: <i className="bi bi-ui-checks-grid text-3xl"></i>,
        bgImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80'
    },
    {
        id: 'messenger',
        title: 'Study with peers',
        description: 'Messenger and course spaces so you can share what’s working — without leaving the app that already holds your lessons.',
        icon: <i className="bi bi-people text-3xl"></i>,
        bgImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80'
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
                <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">Built to teach — not only summarize</h2>
                <p className="text-lg text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto">
                    Live lessons, unlimited chat, practice that explains, and notebooks in one place. Swipe to explore.
                </p>
            </div>

            <div className="relative h-[600px] w-full max-w-5xl mx-auto flex items-center justify-center" {...handlers}>
                <AnimatePresence initial={false}>
                    {features.map((feature, index) => {
                        const offset = index - currentIndex;
                        const isCenter = offset === 0;
                        const isLeft = offset === -1 || (currentIndex === 0 && index === features.length - 1);
                        const isRight = offset === 1 || (currentIndex === features.length - 1 && index === 0);

                        if (!isCenter && !isLeft && !isRight) return null;

                        const rotateY = isLeft ? 45 : isRight ? -45 : 0;
                        const translateX = isLeft ? '-60%' : isRight ? '60%' : '0%';
                        const zIndex = isCenter ? 20 : 10;
                        const opacity = isCenter ? 1 : 0.6;
                        const scale = isCenter ? 1 : 0.85;

                        return (
                            <motion.div
                                key={feature.id}
                                className="absolute w-full max-w-[340px] md:max-w-[400px] aspect-[9/16] bg-slate-900 rounded-[32px] shadow-2xl border border-slate-100 cursor-pointer overflow-hidden flex flex-col group"
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
                                <div className="absolute inset-0 z-0 bg-slate-900">
                                    <img src={feature.bgImage} alt={feature.title} className="w-full h-full object-cover opacity-30 group-hover:scale-110 transition duration-700" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                                </div>

                                <div className="relative z-10 flex-1 p-8 flex flex-col justify-end">
                                    <div className="text-white mb-6 bg-white/15 w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30 shadow-lg">
                                        {feature.icon}
                                    </div>
                                    <h3 className="text-3xl font-black text-white mb-4 leading-tight">{feature.title}</h3>
                                    <p className="text-lg text-white/80 font-medium leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                <div className="absolute bottom-[-60px] left-1/2 -translate-x-1/2 flex items-center gap-6">
                    <button
                        onClick={handlePrev}
                        className="w-12 h-12 rounded-full bg-white dark:bg-slate-900 shadow-md border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-amber-500 hover:scale-110 transition cursor-pointer"
                    >
                        <i className="bi bi-chevron-left text-lg"></i>
                    </button>
                    <div className="flex gap-2">
                        {features.map((_, i) => (
                            <div
                                key={i}
                                className={`h-2.5 rounded-full transition-all duration-300 ${i === currentIndex ? 'bg-amber-500 w-6' : 'bg-slate-300 dark:bg-slate-700 w-2.5'}`}
                            />
                        ))}
                    </div>
                    <button
                        onClick={handleNext}
                        className="w-12 h-12 rounded-full bg-white dark:bg-slate-900 shadow-md border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-amber-500 hover:scale-110 transition cursor-pointer"
                    >
                        <i className="bi bi-chevron-right text-lg"></i>
                    </button>
                </div>
            </div>
        </section>
    );
};
