import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

const testimonials = [
    {
        id: 1,
        name: "Sarah Jenkins",
        university: "Stanford University",
        text: "Avelut completely changed how I study for Organic Chemistry. The Visual Solver broke down complex reaction mechanisms that I had been struggling with for weeks.",
        rating: 5,
        avatar: "SJ"
    },
    {
        id: 2,
        name: "David Chen",
        university: "MIT",
        text: "The context-aware AI tutor is mind-blowing. I uploaded my 800-page physics textbook, and it instantly knew how to explain concepts using the exact terminology my professor uses.",
        rating: 5,
        avatar: "DC"
    },
    {
        id: 3,
        name: "Emily Rodriguez",
        university: "NYU",
        text: "I used to spend hours searching through PDFs for specific answers. Now, Avelut's study guide finds it in seconds and tests my knowledge before the exam.",
        rating: 5,
        avatar: "ER"
    },
    {
        id: 4,
        name: "Michael Thompson",
        university: "University of Michigan",
        text: "The peer messenger integration with the AI is genius. My study group can chat about a problem, and pull the AI into the conversation to settle debates.",
        rating: 5,
        avatar: "MT"
    }
];

export const Testimonials: React.FC = () => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % testimonials.length);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    return (
        <section className="py-24 px-6 bg-slate-900 text-white overflow-hidden" id="testimonials">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16 space-y-4">
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight">Wall of Love</h2>
                    <p className="text-lg text-slate-400 font-medium">Join thousands of students achieving academic excellence.</p>
                </div>

                <div className="relative h-[300px] w-full max-w-4xl mx-auto flex items-center justify-center perspective-[1000px]">
                    <AnimatePresence mode="popLayout">
                        {testimonials.map((t, index) => {
                            if (index !== currentIndex) return null;

                            return (
                                <motion.div
                                    key={t.id}
                                    initial={{ opacity: 0, x: 100, scale: 0.9, rotateY: -10 }}
                                    animate={{ opacity: 1, x: 0, scale: 1, rotateY: 0 }}
                                    exit={{ opacity: 0, x: -100, scale: 0.9, rotateY: 10 }}
                                    transition={{ duration: 0.6, ease: "easeInOut" }}
                                    className="absolute w-full px-4"
                                >
                                    <div className="bg-slate-800/50 backdrop-blur-md border border-slate-700 p-8 md:p-12 rounded-[32px] text-center relative max-w-3xl mx-auto">
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-brand-600 rounded-full flex items-center justify-center shadow-lg shadow-brand-600/30 border-4 border-slate-900">
                                            <Quote className="w-6 h-6 text-white fill-white" />
                                        </div>
                                        
                                        <div className="flex justify-center gap-1 mb-6 mt-4">
                                            {[...Array(t.rating)].map((_, i) => (
                                                <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                                            ))}
                                        </div>

                                        <p className="text-xl md:text-2xl text-slate-200 leading-relaxed font-medium mb-8">
                                            "{t.text}"
                                        </p>

                                        <div className="flex items-center justify-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center font-bold text-lg">
                                                {t.avatar}
                                            </div>
                                            <div className="text-left">
                                                <div className="font-bold text-white">{t.name}</div>
                                                <div className="text-brand-400 text-sm">{t.university}</div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
                
                <div className="flex justify-center gap-3 mt-12">
                    {testimonials.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentIndex(index)}
                            className={`w-3 h-3 rounded-full transition-all duration-300 ${index === currentIndex ? 'bg-brand-500 w-8' : 'bg-slate-700 hover:bg-slate-600'}`}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};
