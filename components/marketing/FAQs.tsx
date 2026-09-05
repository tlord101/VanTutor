import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
    {
        question: "How is Avelut different from note-summarizer tools?",
        answer: "Summarizers help you compress material. Avelut is built to teach. Live Tutorial uses a real voice and a visual board so concepts form step by step. Unlimited Avelut chat lets you dig until it clicks. Quizzes explain misses — not only scores. The goal is understanding, not nicer notes alone."
    },
    {
        question: "What is Live Tutorial?",
        answer: "A private classroom session. You pick 15, 30, or 60 minutes. A lecturer-style voice walks the topic while illustrations appear on the board. You can interrupt to ask a question, get an answer on a clean board, then continue. If life interrupts, you can resume later."
    },
    {
        question: "Is Avelut AI chat really unlimited?",
        answer: "Yes — the main Avelut AI chat is unlimited on free so you can keep asking when you’re stuck. Other tools (flashcards, quizzes, scans, longer Live Tutorials) have fair free limits; Pro unlocks more Live Tutorial minutes and study tools without daily walls."
    },
    {
        question: "Can I use Avelut for math and science?",
        answer: "Yes. Live Tutorial draws diagrams and steps on the board. Scan & Solve walks through problems visually. Chat can break ideas into simpler language or worked examples when you need another angle."
    },
    {
        question: "Are my documents and chats private?",
        answer: "Yes. Your uploads, progress, and chat history stay private to your account. We don’t sell your study materials or use them as public training content."
    },
    {
        question: "Do I need a credit card to start?",
        answer: "No. Create a free account, open unlimited Avelut chat, and explore. Upgrade only when you want more Live Tutorial minutes and full study tools."
    }
];

export const FAQs: React.FC = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section className="py-24 px-6 max-w-4xl mx-auto" id="faqs">
            <div className="text-center mb-16 space-y-4">
                <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">Frequently asked questions</h2>
                <p className="text-lg text-slate-600 dark:text-slate-400 font-medium">Straight answers — no jargon.</p>
            </div>

            <div className="space-y-4">
                {faqs.map((faq, index) => {
                    const isOpen = openIndex === index;

                    return (
                        <div
                            key={index}
                            className={`border ${isOpen ? 'border-amber-500 shadow-md' : 'border-slate-200 dark:border-slate-800'} rounded-2xl bg-white dark:bg-slate-900 overflow-hidden transition-all duration-300`}
                        >
                            <button
                                onClick={() => setOpenIndex(isOpen ? null : index)}
                                className="w-full flex items-center justify-between p-6 text-left focus:outline-none cursor-pointer"
                            >
                                <span className={`text-lg font-bold ${isOpen ? 'text-amber-500' : 'text-slate-900 dark:text-white'}`}>
                                    {faq.question}
                                </span>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isOpen ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                    <i className={`bi ${isOpen ? 'bi-dash' : 'bi-plus'} text-lg font-bold`}></i>
                                </div>
                            </button>

                            <AnimatePresence>
                                {isOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3, ease: "easeInOut" }}
                                    >
                                        <div className="px-6 pb-6 text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                                            {faq.answer}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};
