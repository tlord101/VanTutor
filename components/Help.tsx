
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
        { id: 'admin_panel', label: 'Admin Panel Guide' },
        { id: 'tech_stack', label: 'Technology Stack' },
    ];
    const sectionIds = navItems.map(item => item.id);
    const activeSection = useScrollSpy(sectionIds, { rootMargin: '-20% 0px -80% 0px' });
    
    return (
        <div className="flex-1 flex w-full bg-white">
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

            <div className="flex-1 min-w-0">
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

                            <SubSectionTitle>Data Fetching & Writing Examples</SubSectionTitle>
                            <p>This section provides practical examples of how the application interacts with Firestore to read and write data for core features.</p>

                            <h4 className="text-lg font-semibold text-gray-700 mt-6 mb-2">User Profiles</h4>
                            <p>User profiles store essential information about the learner. They are stored in the <code>users</code> collection, with the document ID matching the user's Firebase Auth UID.</p>
                            <CodeBlock title="Function: Fetch a User's Profile" language="javascript" code={`
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

async function getUserProfile(userId) {
  const userRef = doc(db, 'users', userId);
  const docSnap = await getDoc(userRef);

  if (docSnap.exists()) {
    console.log("User data:", docSnap.data());
    return docSnap.data(); // Returns UserProfile object
  } else {
    console.log("No such user profile!");
    return null;
  }
}
`.trim()} />

                            <p>Updating a user profile can be done using <code>updateDoc</code>. For more complex operations that involve multiple documents (like updating a display name on leaderboards), a transaction is used to ensure data consistency.</p>
                            <CodeBlock title="Function: Update a User's Profile" language="javascript" code={`
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

async function updateUserProfile(userId, dataToUpdate) {
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, dataToUpdate);
    console.log("Profile updated successfully");
    return { success: true };
  } catch (error) {
    console.error("Error updating profile: ", error);
    return { success: false, error };
  }
}
`.trim()} />

                            <h4 className="text-lg font-semibold text-gray-700 mt-6 mb-2">Courses, Subjects & Topics</h4>
                            <p>Course data is considered public artifact data. It's structured to hold all subjects and topics for different levels within a single course document.</p>
                            <CodeBlock title="Function: Fetch Subjects for a User's Level" language="javascript" code={`
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Assume __app_id is available globally
declare var __app_id: string;

async function getSubjectsForLevel(courseId, userLevel) {
    const courseDocRef = doc(db, 'artifacts', __app_id, 'public', 'data', 'courses', courseId);
    const docSnap = await getDoc(courseDocRef);

    if (docSnap.exists()) {
        const allSubjects = docSnap.data().subjectList || [];
        // Filter subjects that match the user's current level
        const subjectsForLevel = allSubjects.filter(subject => subject.level === userLevel);
        return subjectsForLevel;
    } else {
        console.log("Course not found!");
        return [];
    }
}
`.trim()} />

                            <h4 className="text-lg font-semibold text-gray-700 mt-6 mb-2">Experience Points (XP)</h4>
                            <p>Awarding XP is a critical operation that must update multiple documents atomically to prevent data inconsistencies. This is the perfect use case for a Firestore <code>runTransaction</code>. A transaction reads all necessary documents first, then performs all writes in a single, atomic operation. If any part fails, the entire transaction is rolled back.</p>
                            <p>The following function updates four different locations in the database: the user's profile, their daily XP log, the overall leaderboard, and the weekly leaderboard.</p>
                            <CodeBlock title="Function: Award XP using a Transaction" language="javascript" code={`
import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

// Helper to get a consistent week ID string (e.g., "2024-27")
const getWeekId = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return \`\${d.getUTCFullYear()}-\${weekNo}\`;
};

async function awardXP(userId, displayName, xpAmount, type = 'lesson') {
  const today = new Date().toISOString().split('T')[0];
  const weekId = getWeekId(new Date());

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Define references to all documents that will be changed.
      const userRef = doc(db, 'users', userId);
      const xpHistoryRef = doc(db, 'users', userId, 'xpHistory', today);
      const overallLeadRef = doc(db, 'leaderboardOverall', userId);
      const weeklyLeadRef = doc(db, 'leaderboardWeekly', userId);

      // 2. Read the current state of documents within the transaction.
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error("User does not exist!");
      
      const currentProfile = userSnap.data();
      const xpHistorySnap = await transaction.get(xpHistoryRef);
      const weeklyLeadSnap = await transaction.get(weeklyLeadRef);

      // 3. Perform all write operations.
      // a) Update the user's total XP on their profile.
      const xpField = type === 'test' ? 'totalTestXP' : 'totalXP';
      transaction.update(userRef, { [xpField]: currentProfile[xpField] + xpAmount });

      // b) Update the daily XP log for charting.
      const currentDailyXP = xpHistorySnap.exists() ? xpHistorySnap.data().xp : 0;
      transaction.set(xpHistoryRef, { date: today, xp: currentDailyXP + xpAmount }, { merge: true });

      // c) Update the overall leaderboard.
      const newOverallXP = (currentProfile.totalXP + currentProfile.totalTestXP) + xpAmount;
      transaction.set(overallLeadRef, { uid: userId, displayName, xp: newOverallXP }, { merge: true });
      
      // d) Update the weekly leaderboard, resetting if it's a new week.
      let newWeeklyXP = xpAmount;
      if (weeklyLeadSnap.exists() && weeklyLeadSnap.data().weekId === weekId) {
        newWeeklyXP += weeklyLeadSnap.data().xp;
      }
      transaction.set(weeklyLeadRef, { uid: userId, displayName, weekId, xp: newWeeklyXP }, { merge: true });
    });
    console.log(\`Successfully awarded \${xpAmount} XP to \${displayName}\`);
  } catch (error) {
    console.error("Transaction failed: ", error);
  }
}
`.trim()} />
                        </Section>
                        
                        <Section id="apis" title="API Integrations" icon={<ApiIcon />}>
                           <p>We integrate with external APIs to provide core AI functionalities.</p>
                           <SubSectionTitle>Google Gemini API</SubSectionTitle>
                           <p>We use the <code>@google/genai</code> library to interact with Gemini models. <code>gemini-2.5-flash</code> is used for real-time chat and visual analysis, and <code>gemini-2.5-pro</code> for high-quality JSON generation for exams. The custom <code>useApiLimiter</code> hook controls API call frequency to manage costs and prevent abuse.</p>
                        </Section>

                        <Section id="admin_panel" title="Building an Admin Panel" icon={<StackIcon />}>
                            <p>This section provides guidance for developers on how to perform administrative tasks like managing users and course content. These operations should be performed from a secure admin panel or a backend environment.</p>
                            
                            <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800">
                                <strong className="font-bold">Security Warning:</strong> All administrative actions must be protected. Implement security rules in Firestore or use Firebase Cloud Functions with authentication checks to ensure only authorized admins can modify data. Do not expose these functions directly on the public client application.
                            </div>

                            <SubSectionTitle>User Management</SubSectionTitle>
                            <p>User profiles are stored in the <code>users/&#123;userId&#125;</code> documents. You can edit user details such as their display name. Note that if you update a user's <code>displayName</code>, you must also update it in the <code>leaderboardOverall/&#123;userId&#125;</code> and <code>leaderboardWeekly/&#123;userId&#125;</code> documents to maintain consistency.</p>
                            
                            <SubSectionTitle>Course Management</SubSectionTitle>
                            <p>Course content is stored in Firestore under the path <code>{'artifacts/{__app_id}/public/data/courses/{courseId}'}</code>.</p>
                            <p>To add a new subject, you must read the entire <code>subjectList</code>, append your new subject object, and write the modified array back to the document.</p>
                            <CodeBlock title="Example: Add a New Subject" language="javascript" code={`
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase'; // Your firebase config

// Assume __app_id is available
declare var __app_id: string;

async function addSubjectToCourse(courseId, newSubjectName, level) {
  const courseRef = doc(db, 'artifacts', __app_id, 'public', 'data', 'courses', courseId);
  try {
    const courseSnap = await getDoc(courseRef);
    if (!courseSnap.exists()) {
      throw new Error('Course document not found!');
    }

    const courseData = courseSnap.data();
    const existingSubjects = courseData.subjectList || [];

    const newSubject = {
      subjectId: \`subj_\${Date.now()}\`, // Generate a unique ID
      subjectName: newSubjectName,
      level: level, // Assign the subject to a specific level
      topics: [] // Initialize with an empty topics array
    };

    const updatedSubjects = [...existingSubjects, newSubject];

    await updateDoc(courseRef, {
      subjectList: updatedSubjects
    });
    console.log('New subject added successfully.');
  } catch (error) {
    console.error('Error adding new subject: ', error);
  }
}
`.trim()} />
                            <p>Adding a topic to an existing subject follows a similar pattern. You read the array, find the specific subject to modify, add the new topic to its <code>topics</code> array, and then update the document with the modified <code>subjectList</code>.</p>
                            <CodeBlock title="Example: Add a New Topic to a Subject" language="javascript" code={`
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase'; // Your firebase config

// Assume __app_id is available
declare var __app_id: string;

async function addTopicToSubject(courseId, subjectId, newTopicName) {
  const courseRef = doc(db, 'artifacts', __app_id, 'public', 'data', 'courses', courseId);
  try {
    const courseSnap = await getDoc(courseRef);
    if (!courseSnap.exists()) {
        throw new Error('Course document not found!');
    }

    const courseData = courseSnap.data();
    const subjects = courseData.subjectList || [];

    const updatedSubjects = subjects.map(subject => {
      if (subject.subjectId === subjectId) {
        const newTopic = {
          topicId: \`topic_\${Date.now()}\`, // Generate a unique ID
          topicName: newTopicName
        };
        return {
          ...subject,
          topics: [...(subject.topics || []), newTopic]
        };
      }
      return subject;
    });

    await updateDoc(courseRef, {
      subjectList: updatedSubjects
    });
    console.log('New topic added successfully.');
  } catch (error) {
    console.error('Error adding new topic: ', error);
  }
}
`.trim()} />
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
