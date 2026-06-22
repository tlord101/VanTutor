import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

const faqs = [
    {
        question: "How does the AI Tutor differ from standard ChatGPT?",
        answer: "Avelut's AI Tutor is context-aware. When you upload your textbook, it indexes the entire document. When you ask a question, it searches the textbook specifically, answers based on your course material, and provides citations to the exact page. It also tracks your progress and adapts to your learning speed."
    },
    {
        question: "Can I use Avelut for math and science subjects?",
        answer: "Absolutely. Our Visual Solver is specifically trained to recognize complex mathematical equations, chemical structures, and scientific diagrams. Just snap a photo, and the AI will break down the problem step-by-step."
    },
    {
        question: "How does the Google Drive integration work?",
        answer: "You can securely connect your Google Drive account. Once connected, you can select PDFs, Docs, or slides directly from your Drive. Avelut securely downloads them, processes the text, and makes them instantly chat-able in your Study Guide."
    },
    {
        question: "Is there a limit to how many textbooks I can upload?",
        answer: "Free users have a generous monthly limit for processing pages. Premium users enjoy unlimited textbook uploads and priority processing speeds."
    },
    {
        question: "Are my documents kept private?",
        answer: "Yes. Your uploaded documents and chat histories are completely private to your account. We do not use your personal study materials to train our public models."
    }
];

export const FAQs: React.FC = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section className="py-24 px-6 max-w-4xl mx-auto" id="faqs">
            <div className="text-center mb-16 space-y-4">
                <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">Frequently Asked Questions</h2>
                <p className="text-lg text-slate-600 font-medium">Everything you need to know about the product and billing.</p>
            </div>

            <div className="space-y-4">
                {faqs.map((faq, index) => {
                    const isOpen = openIndex === index;
                    
                    return (
                        <div 
                            key={index} 
                            className={`border ${isOpen ? 'border-brand-500 shadow-md' : 'border-slate-200'} rounded-2xl bg-white overflow-hidden transition-all duration-300`}
                        >
                            <button
                                onClick={() => setOpenIndex(isOpen ? null : index)}
                                className="w-full flex items-center justify-between p-6 text-left focus:outline-none"
                            >
                                <span className={`text-lg font-bold ${isOpen ? 'text-brand-600' : 'text-slate-900'}`}>
                                    {faq.question}
                                </span>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isOpen ? 'bg-brand-100 text-brand-600' : 'bg-slate-50 text-slate-400'}`}>
                                    {isOpen ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
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
                                        <div className="px-6 pb-6 text-slate-600 leading-relaxed">
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
