import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const testimonials = [
    {
        id: 1,
        name: "Sarah Jenkins",
        university: "Stanford University",
        text: "Avelut completely changed how I study for Organic Chemistry. The Visual Solver broke down complex reaction mechanisms that I had been struggling with for weeks.",
        rating: 5,
        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80"
    },
    {
        id: 2,
        name: "David Chen",
        university: "MIT",
        text: "The context-aware AI tutor is mind-blowing. I uploaded my 800-page physics textbook, and it instantly knew how to explain concepts using the exact terminology my professor uses.",
        rating: 5,
        avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=150&q=80"
    },
    {
        id: 3,
        name: "Emily Rodriguez",
        university: "NYU",
        text: "I used to spend hours searching through PDFs for specific answers. Now, Avelut's study guide finds it in seconds and tests my knowledge before the exam.",
        rating: 5,
        avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80"
    },
    {
        id: 4,
        name: "Michael Thompson",
        university: "University of Michigan",
        text: "The peer messenger integration with the AI is genius. My study group can chat about a problem, and pull the AI into the conversation to settle debates.",
        rating: 5,
        avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
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
        <section className="py-24 px-6 bg-slate-950 text-white overflow-hidden" id="testimonials">
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
                                    <div className="bg-slate-900 border border-slate-800 p-8 md:p-12 rounded-[32px] text-center relative max-w-3xl mx-auto shadow-xl">
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-amber-500 rounded-full flex items-center justify-center shadow-lg border-4 border-slate-950 text-slate-950 text-xl">
                                            <i className="bi bi-quote"></i>
                                        </div>
                                        
                                        <div className="flex justify-center gap-1.5 mb-6 mt-4">
                                            {[...Array(t.rating)].map((_, i) => (
                                                <i key={i} className="bi bi-star-fill text-amber-400 text-sm"></i>
                                            ))}
                                        </div>

                                        <p className="text-xl md:text-2xl text-slate-200 leading-relaxed font-medium mb-8">
                                            "{t.text}"
                                        </p>

                                        <div className="flex items-center justify-center gap-4">
                                            <img 
                                                src={t.avatar} 
                                                alt={t.name}
                                                className="w-12 h-12 rounded-full object-cover border-2 border-slate-700 shadow-sm"
                                            />
                                            <div className="text-left">
                                                <div className="font-bold text-white">{t.name}</div>
                                                <div className="text-amber-400 text-sm">{t.university}</div>
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
                            className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${index === currentIndex ? 'bg-amber-500 w-8' : 'bg-slate-800 hover:bg-slate-700 w-2.5'}`}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};
