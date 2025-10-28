import React, { useState, useEffect, useRef } from 'react';
import { ReactIcon } from './icons/ReactIcon';
import { FirebaseIcon } from './icons/FirebaseIcon';
import { ApiIcon } from './icons/ApiIcon';
import { StackIcon } from './icons/StackIcon';
import { CopyIcon } from './icons/CopyIcon';
import { CheckIcon } from './icons/CheckIcon';

// Custom hook for scrollspy functionality
const useScrollSpy = (sectionIds: string[], options: IntersectionObserverInit) => {
    const [activeSection, setActiveSection] = useState<string>(sectionIds[0] || '');
    const observer = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        if (observer.current) {
            observer.current.disconnect();
        }

        observer.current = new IntersectionObserver((entries) => {
            const visibleSection = entries.find((entry) => entry.isIntersecting)?.target;
            if (visibleSection) {
                setActiveSection(visibleSection.id);
            }
        }, options);

        const { current: currentObserver } = observer;
        sectionIds.forEach((id) => {
            const element = document.getElementById(id);
            if (element) {
                currentObserver.observe(element);
            }
        });

        return () => currentObserver.disconnect();
    }, [sectionIds, options]);

    return activeSection;
};


const CodeBlock: React.FC<{ code: string; language?: string; title?: string }> = ({ code, language = 'json', title }) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    return (
        <div className="bg-gray-800 rounded-lg overflow-hidden my-4 border border-gray-700">
            <div className="flex justify-between items-center bg-gray-900 px-4 py-2">
                <span className="text-xs font-semibold text-gray-400 uppercase">{title || language}</span>
                <button onClick={handleCopy} className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2">
                    {isCopied ? <CheckIcon className="w-4 h-4 text-lime-400" /> : <CopyIcon className="w-4 h-4" />}
                    {isCopied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-600">
                <code className={`language-${language} text-white`}>
                    {code}
                </code>
            </pre>
        </div>
    );
};

const Section: React.FC<{ id: string, title: string, icon: React.ReactNode, children: React.ReactNode }> = ({ id, title, icon, children }) => (
    <section id={id} className="scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
            <span className="w-10 h-10 flex items-center justify-center bg-lime-100 text-lime-600 rounded-lg">{icon}</span>
            <h2 className="text-3xl font-bold text-gray-800">{title}</h2>
        </div>
        <div className="pl-12 space-y-4 text-gray-700">{children}</div>
    </section>
);

const SubSectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-xl font-semibold text-gray-700 mt-6 mb-3">{children}</h3>
);

const Help: React.FC = () => {
    const navItems = [
        { id: 'introduction', label: 'Introduction' },
        { id: 'frontend', label: 'Frontend Architecture' },
        { id: 'backend', label: 'Backend & Database' },
        { id: 'apis', label: 'API Integrations' },
        { id: 'tech_stack', label: 'Technology Stack' },
    ];
    const sectionIds = navItems.map(item => item.id);
    const activeSection = useScrollSpy(sectionIds, { rootMargin: '-20% 0px -80% 0px' });
    
    return (
        <div className="flex h-full w-full bg-white">
            {/* Desktop Sidebar Navigation */}
            <nav className="hidden md:block w-64 flex-shrink-0 border-r border-gray-200 p-4">
                <div className="sticky top-4">
                    <h3 className="font-semibold text-gray-800 mb-3 px-2">On this page</h3>
                    <ul className="space-y-1">
                        {navItems.map(item => (
                            <li key={item.id}>
                                <a 
                                    href={`#${item.id}`} 
                                    className={`relative block text-sm py-1.5 px-2 rounded-md transition-colors ${activeSection === item.id ? 'text-lime-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}
                                >
                                    {activeSection === item.id && <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 h-5 w-1 bg-lime-500 rounded-r-full"></div>}
                                    {item.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            </nav>

            <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
                    <header className="mb-12">
                        <h1 className="text-5xl font-extrabold bg-gradient-to-r from-lime-600 to-teal-600 text-transparent bg-clip-text pb-2">
                            VANTUTOR Docs
                        </h1>
                        <p className="text-lg text-gray-600">A comprehensive developer guide to the VANTUTOR application architecture.</p>
                    </header>
                    
                    {/* Mobile Navigation Dropdown */}
                    <div className="md:hidden mb-8">
                        <label htmlFor="toc-select" className="block text-sm font-medium text-gray-700 mb-2">Table of Contents</label>
                        <select 
                            id="toc-select"
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg py-2 px-3 text-gray-900 focus:ring-2 focus:ring-lime-500 focus:outline-none"
                            onChange={(e) => {
                                const element = document.getElementById(e.target.value);
                                if (element) element.scrollIntoView({ behavior: 'smooth' });
                            }}
                            value={activeSection}
                        >
                            {navItems.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                    </div>

                    <div className="space-y-16">
                        <Section id="introduction" title="Introduction" icon={<div className="text-2xl">👋</div>}>
                            <p>This document provides an exhaustive overview of the VANTUTOR application, covering its architecture, technology stack, and core functionalities. It is intended to serve as a comprehensive guide for understanding how the app is built and operates.</p>
                        </Section>

                        <Section id="frontend" title="Frontend" icon={<ReactIcon />}>
                             <p>The frontend is a single-page application (SPA) built with React and TypeScript, styled with Tailwind CSS.</p>
                            <SubSectionTitle>Component-Based Structure</SubSectionTitle>
                            <p>The UI is broken down into reusable components in the <code>/components</code> directory. <code>App.tsx</code> is the root component, managing user state, profile data, and top-level navigation, passing state down to children via props.</p>
                            <SubSectionTitle>State Management & UI</SubSectionTitle>
                            <p>State is managed via React Hooks. Global user state is synced in real-time using Firestore's <code>onSnapshot</code> listeners. Styling is handled by <strong>Tailwind CSS</strong>, with a responsive, mobile-first design and a clean, "dark glass" aesthetic characterized by semi-transparent, blurred elements.</p>
                        </Section>

                        <Section id="backend" title="Backend & Database" icon={<FirebaseIcon />}>
                            <p>The backend is powered by Google Firebase, providing authentication, database, and other serverless functionalities.</p>
                            <SubSectionTitle>Firestore Database Structure</SubSectionTitle>
                            <p>Firestore is our NoSQL database. The structure is designed for scalability and efficient querying, with denormalized data in <code>leaderboardOverall</code> and <code>leaderboardWeekly</code> for fast reads.</p>
                            <CodeBlock title="Firestore Data Model" code={`
users/{userId}
  ├─ profile (doc) - UserProfile data
  ├─ progress/{topicId} (collection) - Tracks topic completion
  ├─ examHistory/{examId} (collection) - Stores results of completed exams
  ├─ xpHistory/{date} (collection) - Stores daily total XP for charts
  ├─ notifications/{notificationId} (collection) - User-specific notifications
  └─ chatConversations/{convoId} (collection)
      └─ messages/{messageId} (collection) - Messages for a specific chat

leaderboardOverall/{userId} (collection)
leaderboardWeekly/{userId} (collection)

artifacts/{appId}/public/data/courses/{courseId} (collection)
`.trim()} language="text" />
                             <SubSectionTitle>Common Database Calls</SubSectionTitle>
                            <p>The app uses various Firestore methods: <code>getDoc</code> (fetch single docs), <code>onSnapshot</code> (real-time listeners), <code>runTransaction</code> (atomic operations like updating XP and leaderboards), and <code>writeBatch</code> (multiple writes at once).</p>
                        </Section>
                        
                        <Section id="apis" title="API Integrations" icon={<ApiIcon />}>
                           <p>We integrate with external APIs to provide core AI and payment functionalities.</p>
                           <SubSectionTitle>Google Gemini API</SubSectionTitle>
                           <p>We use the <code>@google/genai</code> library to interact with Gemini models. <code>gemini-2.5-flash</code> is used for real-time chat, and <code>gemini-2.5-pro</code> for high-quality JSON generation for exams. The custom <code>useApiLimiter</code> hook controls API call frequency based on the user's subscription plan to manage costs and prevent abuse.</p>
                           <SubSectionTitle>Paystack API</SubSectionTitle>
                           <p>Used for subscription payments via the <code>PaystackPop</code> inline JS library. In production, transaction verification must be performed on a secure backend server to be secure.</p>
                        </Section>

                        <Section id="tech_stack" title="Technology Stack" icon={<StackIcon />}>
                            <p>A summary of the key libraries and technologies used in VANTUTOR.</p>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Technology</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        <tr><td className="px-6 py-4 font-semibold">React</td><td className="px-6 py-4">Core UI library for building the component-based interface.</td></tr>
                                        <tr><td className="px-6 py-4 font-semibold">TypeScript</td><td className="px-6 py-4">Adds static typing to JavaScript for improved code quality.</td></tr>
                                        <tr><td className="px-6 py-4 font-semibold">Firebase</td><td className="px-6 py-4">Backend-as-a-Service (BaaS) for Authentication, Firestore Database, etc.</td></tr>
                                        <tr><td className="px-6 py-4 font-semibold">Tailwind CSS</td><td className="px-6 py-4">Utility-first CSS framework for rapid UI development.</td></tr>
                                        <tr><td className="px-6 py-4 font-semibold">@google/genai</td><td className="px-6 py-4">Official SDK for interacting with the Google Gemini API.</td></tr>
                                        <tr><td className="px-6 py-4 font-semibold">React Markdown + Plugins</td><td className="px-6 py-4">Renders Markdown from the AI, with plugins (remark-gfm, remark-math, rehype-katex) for tables and LaTeX math support.</td></tr>
                                        <tr><td className="px-6 py-4 font-semibold">Paystack JS</td><td className="px-6 py-4">Handles subscription payments via the inline checkout iframe.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Help;