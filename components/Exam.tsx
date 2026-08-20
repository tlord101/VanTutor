import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { readCachedJson, writeCachedJson } from '../utils/cache';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { Type } from '@google/genai';
import { FlashcardsUI } from './FlashcardsUI';
import { db } from '../firebase';
import { ref as dbRef, onValue, off, set, push, get, serverTimestamp } from 'firebase/database';
import type { UserProfile, Question, ExamHistoryItem, ExamQuestionResult, UserProgress, Course, AppSettings } from '../types';
import { saveToHistory } from '../utils/history';
import { awardDailyStreak } from '../utils/streaks';
import { checkAICredits, deductAICredits, getFeatureCost, getFeatureModel } from '../utils/usage';
import { LimitExceededModal } from './LimitExceededModal';
import { useToast } from '../hooks/useToast';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { useAppSettings } from '../hooks/useAppSettings';
import { saveLocalExam, getLocalExams, bulkUpsertRemoteExams } from '../services/examStorageService';
import { saveLocalFlashcardDeck } from '../services/flashcardStorageService';
import { saveLocalPastQuestions, getLocalPastQuestions, saveLocalPQSubjects, getLocalPQSubjects } from '../services/pastQuestionsStorageService';
import { GraduationCapIcon } from './icons/GraduationCapIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { CheckIcon } from './icons/CheckIcon';
import { XIcon } from './icons/XIcon';
import { ListIcon } from './icons/ListIcon';
declare var __app_id: string;

const TIME_PER_QUESTION_SECONDS = 30;

const mockCourses = [
  { id: 'math_algebra_1', name: 'Math - Algebra 1' },
  { id: 'science_biology', name: 'Science - Biology' },
  { id: 'history_us', name: 'History - U.S. History' },
];

const getCourseNameById = (id: string) => {
    return mockCourses.find(c => c.id === id)?.name || 'your department';
}

const sanitizePromptInput = (value: string): string =>
  value.replace(/[^a-zA-Z0-9 ,.\-_/()]/g, ' ').replace(/\s+/g, ' ').trim();

const LoadingSpinner: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <img src="/logo_icon.png" alt="Loading..." className="w-12 h-12 object-contain animate-pulse" />
    <p className="mt-4 text-gray-600">{text}</p>
  </div>
);

const normalizeCourse = (course: any, fallbackCourseId = '', fallbackLevel = ''): Course | null => {
    if (!course || typeof course !== 'object') return null;
    const course_name = (course.course_name || '').toString().trim();
    if (!course_name) return null;
    const course_id = (course.course_id || fallbackCourseId || course_name.toLowerCase().replace(/\s+/g, '_')).toString();
    return {
        ...course,
        course_id,
        course_name,
        level: (course.level || fallbackLevel || '').toString(),
        topics: Array.isArray(course.topics) ? course.topics : [],
    } as Course;
};

const extractCoursesFromDepartmentData = (departmentData: any): Course[] => {
    if (!departmentData || typeof departmentData !== 'object') return [];
    if (Array.isArray(departmentData.course_list)) {
        return departmentData.course_list.map((course: any) => normalizeCourse(course)).filter((course: Course | null): course is Course => course !== null);
    }
    if (departmentData.course_list && typeof departmentData.course_list === 'object') {
        return Object.entries(departmentData.course_list).map(([courseId, course]) => normalizeCourse(course, courseId)).filter((course: Course | null): course is Course => course !== null);
    }
    if (departmentData.levels && typeof departmentData.levels === 'object') {
        return Object.entries(departmentData.levels).flatMap(([levelKey, levelValue]: [string, any]) => {
            const courseMap = levelValue?.courses;
            if (!courseMap || typeof courseMap !== 'object') return [];
            return Object.entries(courseMap).map(([courseId, course]) => normalizeCourse(course, courseId, levelKey)).filter((course: Course | null): course is Course => course !== null);
        });
    }
    return [];
};



const ExamHistory: React.FC<{ userProfile: UserProfile, onReview: (exam: ExamHistoryItem) => void }> = ({ userProfile, onReview }) => {
    const [history, setHistory] = useState<ExamHistoryItem[]>(() => {
        const firebaseCached = readCachedJson<ExamHistoryItem[]>(`avelut_exam_history_${userProfile.uid}`, []);
        const offlineCached = readCachedJson<ExamHistoryItem[]>(`avelut_offline_exams_${userProfile.uid}`, []);
        const merged = [...firebaseCached, ...offlineCached];
        const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
        unique.sort((a, b) => b.timestamp - a.timestamp);
        return unique;
    });
    const [isLoading, setIsLoading] = useState(() => {
        const cached = readCachedJson<ExamHistoryItem[]>(`avelut_exam_history_${userProfile.uid}`, []);
        return cached.length === 0;
    });

    useEffect(() => {
        // 1. Instantly load from local SQLite (zero latency offline)
        getLocalExams(userProfile.uid).then(localExams => {
            if (localExams && localExams.length > 0) {
                setHistory(localExams);
                setIsLoading(false);
            }
        }).catch(console.warn);

        // 2. Listen to Firebase Realtime Database and synchronize down into SQLite
        const historyRef = dbRef(db, `exam_history/${userProfile.uid}`);
        const cacheKey = `avelut_exam_history_${userProfile.uid}`;
        const cached = readCachedJson<ExamHistoryItem[]>(cacheKey, []);
        if (cached.length === 0) {
            setIsLoading(true);
        }
        const unsubscribe = onValue(historyRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const firebaseList: ExamHistoryItem[] = Object.keys(data).map(key => ({
                    ...data[key],
                    id: key
                }));
                writeCachedJson(cacheKey, firebaseList, userProfile.uid);
                bulkUpsertRemoteExams(userProfile.uid, firebaseList).catch(console.warn);
                getLocalExams(userProfile.uid).then(updated => {
                    setHistory(updated);
                }).catch(() => {
                    setHistory(firebaseList);
                });
            } else {
                getLocalExams(userProfile.uid).then(local => {
                    setHistory(local);
                }).catch(() => setHistory([]));
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching exam history: ", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [userProfile.uid]);

    if (isLoading) {
        return <LoadingSpinner text="Loading exam history..." />;
    }

    if (history.length === 0) {
        return <p className="text-gray-500 dark:text-gray-400 text-center">You haven't completed any exams yet.</p>;
    }

    return (
        <div className="space-y-3">
            {history.map(exam => {
                const percentage = Math.round((exam.score / exam.total_questions) * 100);
                return (
                <div key={exam.id} className="group bg-white dark:bg-black p-5 rounded-2xl border border-gray-200 flex justify-between items-center transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-[#0b1120]">
                    <div className="flex gap-4 items-center">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${percentage >= 80 ? 'bg-lime-100 text-lime-600' : percentage >= 50 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                             <GraduationCapIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{getCourseNameById(exam.department_id)}</p>
                            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-0.5">
                                {new Date(exam.timestamp).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                    <div className="text-right flex items-center gap-5">
                        <div className="flex flex-col items-end">
                             <p className={`font-black text-lg leading-none ${percentage >= 80 ? 'text-lime-600' : percentage >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{percentage}%</p>
                             <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">{exam.score}/{exam.total_questions} Correct</p>
                        </div>
                        <button 
                            onClick={() => onReview(exam)} 
                            className="p-3 rounded-xl bg-gray-50 dark:bg-black text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 transition-all duration-200 active:scale-95"
                        >
                            <ChevronDownIcon className="w-5 h-5 -rotate-90" />
                        </button>
                    </div>
                </div>
                );
            })}
        </div>
    );
};


interface ExamProps {
  userProfile: UserProfile;
  userProgress: UserProgress;
  onOpenSidebar?: () => void;
}


export const Exam: React.FC<ExamProps> = ({ userProfile, userProgress, onOpenSidebar }) => {
  const [activeTab, setActiveTab] = useState<'ai_exam' | 'flashcards' | 'past_qa'>('ai_exam');
  const [pqSearchTerm, setPqSearchTerm] = useState('');
  const [availablePQYears, setAvailablePQYears] = useState<{year: string, course_id: string, course_name: string}[]>([]);
  const [isPQLoading, setIsPQLoading] = useState(false);
  const [examState, setExamState] = useState<'start' | 'generating' | 'in_progress' | 'completed' | 'history' | 'review' | 'flashcards'>('start');
  const [examMode, setExamMode] = useState<'ai' | 'pq'>('ai');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [flashcards, setFlashcards] = useState<{front: string; back: string}[]>([]);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [score, setScore] = useState(0);
  const [reviewExam, setReviewExam] = useState<ExamHistoryItem | null>(null);
  const [currentExamId, setCurrentExamId] = useState<string>('');

  
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [examFormat, setExamFormat] = useState<'objective' | 'theory'>('objective');
  const [isEvaluatingTheory, setIsEvaluatingTheory] = useState(false);
  const [availablePQSubjects, setAvailablePQSubjects] = useState<string[]>(() => {
    return readCachedJson<string[]>(`avelut_pq_subjects_${userProfile.department_id}_${userProfile.level}`, []);
  });
  const [selectedPQSubject, setSelectedPQSubject] = useState<string>('');
  const [isTopicDataLoading, setIsTopicDataLoading] = useState(() => {
    const cached = readCachedJson<Course[]>(`avelut_exam_courses_${userProfile.uid}`, []);
    return cached.length === 0;
  });
  const [timeLeft, setTimeLeft] = useState(0);
  const { addToast } = useToast();
  const { attemptApiCall } = useApiLimiter();
  const { settings: appSettings } = useAppSettings();

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitModalData, setLimitModalData] = useState({ balance: 0, cost: 0 });
  const geminiModel = getFeatureModel('ai_quiz_generation', appSettings);
  const ai = useMemo(() => createAvelutAI(appSettings, userProfile), [appSettings, userProfile]);
  const isAvelutConfigured = Boolean(ai);

  useEffect(() => {
    const cacheKey = `avelut_pq_subjects_${userProfile.department_id}_${userProfile.level}`;
    
    // Load from local SQLite cache first for instant offline access
    getLocalPQSubjects(userProfile.department_id || '', userProfile.level || '').then(({ subjects, years }) => {
        if (subjects && subjects.length > 0) {
            setAvailablePQSubjects(subjects);
            setAvailablePQYears(years);
        }
    }).catch(console.warn);

    const pqRef = dbRef(db, `past_questions/${userProfile.department_id}/${userProfile.level}`);
    setIsPQLoading(true);
    get(pqRef).then(snap => {
        if(snap.exists()) {
            const data = snap.val();
            const subjects = Object.keys(data);
            setAvailablePQSubjects(subjects);
            writeCachedJson(cacheKey, subjects, userProfile.uid);
            
            // Build all available PQs
            const allPQs: {year: string, course_id: string, course_name: string}[] = [];
            Object.keys(data).forEach(courseId => {
                const yearsData = data[courseId];
                if (yearsData) {
                    Object.keys(yearsData).forEach(year => {
                        allPQs.push({
                            year,
                            course_id: courseId,
                            course_name: courseId
                        });
                    });
                }
            });
            const sortedYears = allPQs.sort((a,b) => parseInt(b.year) - parseInt(a.year));
            setAvailablePQYears(sortedYears);
            saveLocalPQSubjects(userProfile.department_id || '', userProfile.level || '', subjects, sortedYears).catch(console.warn);
        } else {
            setAvailablePQSubjects([]);
            setAvailablePQYears([]);
            writeCachedJson(cacheKey, [], userProfile.uid);
        }
    }).catch(err => {
        console.error("Failed to fetch PQ subjects:", err);
    }).finally(() => {
        setIsPQLoading(false);
    });
  }, [userProfile.department_id, userProfile.level, userProfile.uid]);

  const userAnswersRef = useRef(userAnswers);
  useEffect(() => { userAnswersRef.current = userAnswers; }, [userAnswers]);
  
  const scoreRef = useRef(score);
  useEffect(() => { scoreRef.current = score; }, [score]);

  useEffect(() => {
    const fetchCourses = async () => {
        const cached = readCachedJson<Course[]>(`avelut_exam_courses_${userProfile.uid}`, []);
        if (cached && cached.length > 0) {
            setAvailableCourses(cached);
        }

        try {
            // Always fetch from departments_data — the canonical course store.
            // schools_data only has dept metadata (name, levels), NOT courses.
            const snapshot = await get(dbRef(db, `departments_data/${userProfile.department_id}`));
            let departmentData = snapshot.val();

            if (!departmentData && userProfile.school_id && userProfile.college_id) {
                // Legacy fallback
                const legacySnap = await get(dbRef(db, `schools_data/${userProfile.school_id}/colleges/${userProfile.college_id}/departments/${userProfile.department_id}`));
                departmentData = legacySnap.val();
            }

            if (departmentData) {
                const courses = extractCoursesFromDepartmentData(departmentData);
                // Filter by level
                const normalizedLevel = (userProfile.level || '').toLowerCase().replace(/\s+/g, '').replace('lvl', '').replace('level', '');
                let levelCourses = courses.filter(c => {
                    const cLevel = (c.level || '').toLowerCase().replace(/\s+/g, '').replace('lvl', '').replace('level', '');
                    return cLevel === normalizedLevel || cLevel.includes(normalizedLevel) || normalizedLevel.includes(cLevel);
                });
                if (levelCourses.length === 0) levelCourses = courses; // fallback to all
                setAvailableCourses(levelCourses);
                writeCachedJson(`avelut_exam_courses_${userProfile.uid}`, levelCourses);
            }
        } catch (error) {
            console.error("Error fetching department data for exam generation:", error);
            addToast("Could not load course data.", 'error');
        } finally {
            setIsTopicDataLoading(false);
        }
    };

    fetchCourses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile.department_id, userProfile.level, userProfile.uid, addToast]);


  const startPQExam = async (courseId: string, year: string) => {
    setExamState('generating');
    try {
        // 1. Try to load from SQLite for offline practice
        let allQuestions = await getLocalPastQuestions(
            userProfile.department_id || '',
            userProfile.level || '',
            courseId,
            year
        );

        if (!allQuestions || allQuestions.length === 0) {
            // 2. Fetch from Firebase and cache into SQLite for future offline use
            const pqRef = dbRef(db, `past_questions/${userProfile.department_id}/${userProfile.level}/${courseId}/${year}`);
            const snapshot = await get(pqRef);
            if(!snapshot.exists()) throw new Error("No questions found for this course.");
            
            const questionsData = snapshot.val();
            allQuestions = Object.values(questionsData);
            if (allQuestions && allQuestions.length > 0) {
                saveLocalPastQuestions(
                    userProfile.uid,
                    userProfile.department_id || '',
                    userProfile.level || '',
                    courseId,
                    year,
                    allQuestions
                ).catch(console.warn);
            }
        }

        if(!allQuestions || allQuestions.length === 0) throw new Error("Question bank is empty.");

        // Randomly pick 10 questions
        const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 10);
        
        setQuestions(selected);
        setUserAnswers(new Array(selected.length).fill(''));
        setCurrentQuestionIndex(0);
        setScore(0);
        setTimeLeft(selected.length * 60); // 1 min per question
        setExamState('in_progress');
        setExamMode('pq');
    } catch (err: any) {
        console.error("Failed to start PQ exam:", err);
        addToast(err.message || "Failed to load past questions.", 'error');
        setExamState('start');
    }
  };


  // The specific course PQ fetch has been merged into the global PQ fetch on mount.

  const finishExam = useCallback(async () => {
      setExamState(currentState => {
          if (currentState !== 'in_progress') {
              return currentState; // Prevent multiple submissions
          }

          const currentScore = scoreRef.current;
          const currentAnswers = userAnswersRef.current;
          
          const filledUserAnswers = [...currentAnswers];
          while (filledUserAnswers.length < questions.length) {
              filledUserAnswers.push("Unanswered");
          }

          // Define a robust correct check for mapping
          const checkIsCorrectMapping = (opt: string, corr: string) => {
              if (!opt || !corr) return false;
              const cleanOpt = opt.toLowerCase().trim();
              const cleanCorr = corr.toLowerCase().trim();
              if (cleanOpt === cleanCorr) return true;
              let optLetter = '';
              let optText = cleanOpt;
              const match = cleanOpt.match(/^\(([a-z])\)\s*(.*)/);
              if (match) { optLetter = match[1]; optText = match[2].trim(); }
              if (optText && cleanCorr === optText) return true;
              if (optText && cleanCorr.replace(/^[a-z]\s*=\s*/, '') === optText) return true;
              if (optLetter) {
                  const corrLetterOnly = cleanCorr.replace(/[^a-z]/g, '');
                  if (corrLetterOnly === optLetter) return true;
                  if (cleanCorr === `(${optLetter})`) return true;
                  if (cleanCorr.includes(`option ${optLetter}`)) return true;
                  if (cleanCorr.startsWith(`(${optLetter})`)) return true;
              }
              if (cleanOpt.includes(cleanCorr) && cleanCorr.length > 0) {
                   if (cleanOpt.endsWith(cleanCorr)) return true;
              }
              if (optText && cleanCorr.includes(optText)) {
                   const regex = new RegExp(`\\b${optText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
                   if (regex.test(cleanCorr)) return true;
              }
              return false;
          };

          const examResult: ExamHistoryItem = {
              id: currentExamId || `exam_${Date.now()}`,
              user_id: userProfile.uid,
              department_id: userProfile.department_id || '',
              examType: examFormat,
              score: currentScore,
              total_questions: questions.length,
              timestamp: Date.now(),
              questions: questions.map((q, i) => ({
                  ...q,
                  userAnswer: filledUserAnswers[i],
                  isCorrect: examFormat === 'theory' 
                                ? (filledUserAnswers[i] !== 'Unanswered' && filledUserAnswers[i] !== '' && filledUserAnswers[i] !== undefined ? true : false)
                                : checkIsCorrectMapping(filledUserAnswers[i], q.correctAnswer),
              })),
          };

          // Save directly into SQLite exams table for offline access and cloud sync
          saveLocalExam(userProfile.uid, examResult, true).catch(console.error);

          const saveResults = async () => {
              try {
                  const examHistoryRef = push(dbRef(db, `exam_history/${userProfile.uid}`));
                  set(examHistoryRef, examResult).catch(console.error);

                  const notificationRef = push(dbRef(db, `notifications/${userProfile.uid}`));
                  const notificationData = {
                      type: 'exam_reminder',
                      title: 'Exam Finished!',
                      message: `You scored ${currentScore}/${questions.length}!`,
                      is_read: false,
                      timestamp: serverTimestamp(),
                  };
                  set(notificationRef, notificationData).catch(console.error);
              } catch (error) {
                  console.error("Failed to save exam results:", error);
                  addToast("Could not save your exam results to server (saved offline in SQLite).", 'info');
              }
          };

          saveResults();
          setFeedback(null);
          setSelectedOption(null);
          
          return 'completed';
      });
  }, [questions, userProfile.department_id, userProfile.uid, currentExamId, examFormat, addToast]);

  useEffect(() => {
      if (examState !== 'in_progress' || timeLeft <= 0) {
          return;
      }
      const timerId = setInterval(() => {
          setTimeLeft(prevTime => prevTime - 1);
      }, 1000);
      return () => clearInterval(timerId);
  }, [examState, timeLeft]);

  useEffect(() => {
      if (timeLeft <= 0 && examState === 'in_progress') {
          finishExam();
      }
  }, [timeLeft, examState, finishExam]);


  const generateFlashcards = async () => {
    const cost = getFeatureCost('flashcard_generation', appSettings);
    const limitCheck = checkAICredits(userProfile, cost, appSettings);
    if (!limitCheck.allowed) {
      setLimitModalData({
        balance: limitCheck.balance,
        cost: limitCheck.cost
      });
      setShowLimitModal(true);
      return;
    }

    setExamState('generating');
    try {
      if (!ai) throw new Error('Avelut AI is not configured in App Controls.');
      const courseObj = availableCourses.find(c => c.course_id === selectedCourseId);
      const safeCourseName = courseObj ? sanitizePromptInput(courseObj.course_name) : getCourseNameById(userProfile.department_id || '');
      const safeDepartment = sanitizePromptInput(getCourseNameById(userProfile.department_id || ''));
      const safeLevel = sanitizePromptInput(userProfile.level || '');

      const result = await attemptApiCall(async () => {
        let retrievedContext = "";
        try {
            const { searchPinecone } = await import('../utils/pinecone');
            const searchQuery = `Flashcards for ${safeCourseName}`;
            const searchResult = await searchPinecone(searchQuery, userProfile.department_id, 5, appSettings);
            if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                retrievedContext = "\n\nRELEVANT TEXTBOOK EXCERPTS:\n" + searchResult.results.map((r: any) => r.text).join('\n\n');
            }
        } catch (err) {
            console.warn("RAG retrieval failed:", err);
        }

        const promptText = `Generate 10 flashcards for a student studying "${safeCourseName}" at a "${safeLevel}" level. Provide a front (concept/question) and a back (definition/answer). ${retrievedContext}`;

        const aiResponse = await ai.models.generateContent({
          model: getFeatureModel('flashcard_generation', appSettings),
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                flashcards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      front: { type: Type.STRING },
                      back: { type: Type.STRING }
                    },
                    required: ['front', 'back']
                  }
                }
              }
            }
          }
        });

        const text = getResponseText(aiResponse);
        if (!text) throw new Error('AI returned an empty response while generating flashcards.');
        const responseData = JSON.parse(text);
        if (!(responseData.flashcards && responseData.flashcards.length > 0)) throw new Error("Failed to generate valid flashcards from AI response.");
        setFlashcards(responseData.flashcards);
        setFlashcardIndex(0);
        setIsFlipped(false);
        deductAICredits(userProfile.uid, cost, 'Flashcard Generation', appSettings).catch(console.error);
        
        // Save into SQLite flashcards table
        saveLocalFlashcardDeck(userProfile.uid, {
            title: `${safeCourseName} Flashcards`,
            course_id: selectedCourseId,
            department_id: userProfile.department_id || '',
            level: userProfile.level || '',
            cards: responseData.flashcards,
        }).catch(console.error);

        // Save into SQLite history materials table
        saveToHistory(userProfile.uid, {
            type: 'flashcards',
            title: `${safeCourseName} Flashcards`,
            data: responseData.flashcards
        }).catch(console.error);

        setExamState('flashcards');
      });

      if (!result.success) addToast(result.message, 'error');
    } catch (error: any) {
      console.error(error);
      addToast(error.message, 'error');
      setExamState('start');
    }
  };

  const generateQuestions = async () => {
    // Check credits for exam generation
    const cost = getFeatureCost('ai_quiz_generation', appSettings);
    const limitCheck = checkAICredits(userProfile, cost, appSettings);
    if (!limitCheck.allowed) {
      setLimitModalData({
        balance: limitCheck.balance,
        cost: limitCheck.cost
      });
      setShowLimitModal(true);
      return;
    }

    setExamState('generating');
    try {
      if (!ai) {
        throw new Error('Avelut AI is not configured in App Controls.');
      }
      
      const courseObj = availableCourses.find(c => c.course_id === selectedCourseId);
      const safeCourseName = courseObj ? sanitizePromptInput(courseObj.course_name) : getCourseNameById(userProfile.department_id || '');
      const safeLevel = sanitizePromptInput(userProfile.level || '');

      const result = await attemptApiCall(async () => {
        let retrievedContext = "";
        try {
            const { searchPinecone } = await import('../utils/pinecone');
            const searchQuery = `Exam questions for ${safeCourseName}`;
            const searchResult = await searchPinecone(searchQuery, userProfile.department_id, 5, appSettings);
            if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                retrievedContext = "\n\nRELEVANT TEXTBOOK EXCERPTS:\n" + searchResult.results.map((r: any) => r.text).join('\n\n');
            }
        } catch (err) {
            console.warn("RAG retrieval failed:", err);
        }

        let promptText = "";
        let schemaType = null;
        
        if (examFormat === 'objective') {
             promptText = `Generate 20 multiple-choice questions for a student studying "${safeCourseName}" at a "${safeLevel}" level. Ensure the options are distinct and the correct answer is exactly one of the options. Provide an explanation for the answer. ${retrievedContext}`;
             schemaType = {
                  type: Type.OBJECT,
                  properties: {
                    questions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          question: { type: Type.STRING },
                          options: { type: Type.ARRAY, items: { type: Type.STRING } },
                          correctAnswer: { type: Type.STRING },
                          explanation: { type: Type.STRING }
                        },
                        required: ['question', 'options', 'correctAnswer', 'explanation']
                      }
                    }
                  }
             };
        } else {
            promptText = `Generate 20 theory (short answer) questions for a student studying "${safeCourseName}" at a "${safeLevel}" level. The questions should test understanding and require a text response. Provide a model answer or explanation for reference. ${retrievedContext}`;
            schemaType = {
                  type: Type.OBJECT,
                  properties: {
                    questions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          question: { type: Type.STRING },
                          explanation: { type: Type.STRING } // Model answer
                        },
                        required: ['question', 'explanation']
                      }
                    }
                  }
             };
        }

        const aiResponse = await ai.models.generateContent({
          model: geminiModel,
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: schemaType
          }
        });

        const text = getResponseText(aiResponse);
        if (!text) {
          throw new Error('AI returned an empty response while generating exam questions.');
        }
        const responseData = JSON.parse(text);
        if (!(responseData.questions && responseData.questions.length > 0)) {
          throw new Error("Failed to generate valid questions from AI response.");
        }
        const newQuestions = responseData.questions;

        // Deduct credits
        deductAICredits(userProfile.uid, cost, 'Mock Exam Generation', appSettings).catch(console.error);

        saveToHistory(userProfile.uid, {
            type: 'exam',
            title: `${safeCourseName} Mock Exam (${examFormat})`,
            data: newQuestions
        }).catch(console.error);

        const offlineId = `offline_${Date.now()}`;
        setCurrentExamId(offlineId);
        const offlineExam: ExamHistoryItem = {
            id: offlineId,
            user_id: userProfile.uid,
            department_id: userProfile.department_id || '',
            examType: examFormat,
            score: 0,
            total_questions: newQuestions.length,
            timestamp: Date.now(),
            questions: newQuestions.map((q: any) => ({ ...q, userAnswer: '', isCorrect: false })),
        };
        
        // Save into SQLite exams table for full offline test readiness
        saveLocalExam(userProfile.uid, offlineExam, true).catch(console.error);

        setQuestions(newQuestions);
        setTimeLeft(newQuestions.length * TIME_PER_QUESTION_SECONDS);
        setExamState('in_progress');
      });

      if (!result.success) {
        addToast(result.message, 'error');
        setExamState('start');
        return;
      }
    } catch (error: any) {
      console.error("Error generating exam questions:", error);
      addToast(error.message || "Sorry, we couldn't create an exam for you right now. Please try again in a moment.", 'error');
      setExamState('start');
    }
  };
  
  const resetExam = () => {
    setQuestions([]);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setFeedback(null);
    setScore(0);
    setExamState('start');
    setTimeLeft(0);
  };

  const handleAnswerSubmit = async () => {
    if (feedback) return;
    if (examFormat === 'theory') {
       if (!selectedOption || selectedOption.trim() === '') return;
       setIsEvaluatingTheory(true);
       try {
           if (!ai) throw new Error("AI not configured.");
           const currentQuestion = questions[currentQuestionIndex];
           const courseObj = availableCourses.find(c => c.course_id === selectedCourseId);
           const safeCourseName = courseObj ? sanitizePromptInput(courseObj.course_name) : getCourseNameById(userProfile.department_id || '');
           
           const promptText = `Given the theory question: "${currentQuestion.question}" for a university student taking "${safeCourseName}". The model answer/reference is: "${currentQuestion.explanation}". The student answered: "${selectedOption}". Evaluate if the student's answer is correct or sufficiently accurate. Provide a boolean isCorrect and a short, encouraging explanation of why.`;
           
           const evalResponse = await ai.models.generateContent({
                model: geminiModel,
                contents: [{ role: 'user', parts: [{ text: promptText }] }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            isCorrect: { type: Type.BOOLEAN },
                            explanation: { type: Type.STRING }
                        },
                        required: ['isCorrect', 'explanation']
                    }
                }
           });
           
           const text = getResponseText(evalResponse);
           if (!text) throw new Error("Empty eval response.");
           const responseData = JSON.parse(text);
           
           setUserAnswers(prev => [...prev, selectedOption]);
           if (responseData.isCorrect) setScore(prev => prev + 1);
           setFeedback({ isCorrect: responseData.isCorrect, explanation: responseData.explanation });
       } catch (err: any) {
           addToast("Failed to evaluate answer. " + err.message, "error");
       } finally {
           setIsEvaluatingTheory(false);
       }
    } else {
        if (!selectedOption) return;

        const currentQuestion = questions[currentQuestionIndex];
        
        const checkIsCorrect = (opt: string, corr: string) => {
            if (!opt || !corr) return false;
            
            const cleanOpt = opt.toLowerCase().trim();
            const cleanCorr = corr.toLowerCase().trim();
            if (cleanOpt === cleanCorr) return true;
            
            let optLetter = '';
            let optText = cleanOpt;
            const match = cleanOpt.match(/^\(([a-z])\)\s*(.*)/);
            if (match) {
                optLetter = match[1];
                optText = match[2].trim();
            }
            
            if (optText && cleanCorr === optText) return true;
            // Handle cases where AI returns "n=9" or "x=9"
            if (optText && cleanCorr.replace(/^[a-z]\s*=\s*/, '') === optText) return true;
            
            if (optLetter) {
                const corrLetterOnly = cleanCorr.replace(/[^a-z]/g, '');
                if (corrLetterOnly === optLetter) return true;
                if (cleanCorr === `(${optLetter})`) return true;
                if (cleanCorr.includes(`option ${optLetter}`)) return true;
                if (cleanCorr.startsWith(`(${optLetter})`)) return true;
            }
            
            // if cleanCorr is embedded in cleanOpt (e.g. opt is "(b) 9" and corr is "9")
            if (cleanOpt.includes(cleanCorr) && cleanCorr.length > 0) {
                 if (cleanOpt.endsWith(cleanCorr)) return true;
            }
            // if optText is embedded in cleanCorr (e.g. corr is "the answer is 9" and optText is "9")
            if (optText && cleanCorr.includes(optText)) {
                 const regex = new RegExp(`\\b${optText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
                 if (regex.test(cleanCorr)) return true;
            }
            
            return false;
        };

        const isCorrect = checkIsCorrect(selectedOption, currentQuestion.correctAnswer);
        
        setUserAnswers(prev => [...prev, selectedOption]);

        if (isCorrect) {
          setScore(prev => prev + 1);
        }
        setFeedback({ isCorrect, explanation: currentQuestion.explanation });
    }
  };
  
  const handleNextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setFeedback(null);
      setSelectedOption(null);
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      finishExam();
    }
  };

  const renderContent = () => {
    switch (examState) {
      case 'generating':
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="relative mb-12">
                    <div className="absolute inset-0 bg-lime-400 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                    <LoadingSpinner text="" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter mb-2">Assembling your Exam...</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse text-center max-w-xs">Avelut is selecting questions based on your mastery</p>
            </div>
        );
      
      case 'flashcards':
        return (
          <FlashcardsUI
            flashcards={flashcards}
            onClose={() => setExamState('start')}
            onFinish={() => {
              setScore(flashcards.length); // Max score for finishing deck
              setExamState('completed');
            }}
          />
        );

      case 'in_progress':
        const currentQuestion = questions[currentQuestionIndex];
        if (!currentQuestion) return null;
        return (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-black/60 backdrop-blur-md p-6 rounded-[2rem] border border-gray-200/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 h-1.5 bg-gray-100 w-full">
                    <div 
                        className="h-full bg-gradient-to-r from-lime-400 to-lime-600 transition-all duration-500 ease-out"
                        style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                    />
                </div>
                <div className="flex justify-between items-center mt-2">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Question</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter">
                            {currentQuestionIndex + 1} <span className="text-gray-300 mx-1 text-xl">/</span> <span className="text-gray-400 text-xl">{questions.length}</span>
                        </p>
                    </div>
                    
                    <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl border ${timeLeft < 30 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-lime-50/50 border-lime-100 text-lime-700'}`}>
                        <div className={`w-2 h-2 rounded-full ${timeLeft < 30 ? 'bg-red-500' : 'bg-lime-500'}`}></div>
                        <span className="font-black tracking-widest tabular-nums">
                            {Math.floor(timeLeft / 60)}:{('0' + (timeLeft % 60)).slice(-2)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <h3 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white leading-[1.25] tracking-tight">{currentQuestion.question}</h3>
                
                {examFormat === 'theory' ? (
                    <div className="w-full relative group">
                        <textarea
                            className="w-full min-h-[180px] p-6 rounded-[2rem] border-2 border-gray-200/60 focus:border-lime-500 focus:ring-4 focus:ring-lime-500/10 transition-all resize-y text-gray-900 dark:text-white bg-white dark:bg-black/50 backdrop-blur-sm shadow-inner text-base md:text-lg"
                            placeholder="Construct your response here..."
                            value={selectedOption || ''}
                            onChange={(e) => !feedback && setSelectedOption(e.target.value)}
                            disabled={!!feedback || isEvaluatingTheory}
                        />
                        <div className="absolute top-4 right-4 text-gray-300 group-focus-within:text-lime-400 transition-colors pointer-events-none">
                             <GraduationCapIcon className="w-6 h-6 opacity-30" />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                    {(currentQuestion.options || []).map((option, index) => {
                        const isSelected = selectedOption === option;
                        const checkIsCorrectDisplay = (opt: string, corr: string) => {
                            if (!opt || !corr) return false;
                            
                            const cleanOpt = opt.toLowerCase().trim();
                            const cleanCorr = corr.toLowerCase().trim();
                            if (cleanOpt === cleanCorr) return true;
                            
                            let optLetter = '';
                            let optText = cleanOpt;
                            const match = cleanOpt.match(/^\(([a-z])\)\s*(.*)/);
                            if (match) {
                                optLetter = match[1];
                                optText = match[2].trim();
                            }
                            
                            if (optText && cleanCorr === optText) return true;
                            if (optText && cleanCorr.replace(/^[a-z]\s*=\s*/, '') === optText) return true;
                            
                            if (optLetter) {
                                const corrLetterOnly = cleanCorr.replace(/[^a-z]/g, '');
                                if (corrLetterOnly === optLetter) return true;
                                if (cleanCorr === `(${optLetter})`) return true;
                                if (cleanCorr.includes(`option ${optLetter}`)) return true;
                                if (cleanCorr.startsWith(`(${optLetter})`)) return true;
                            }
                            
                            if (cleanOpt.includes(cleanCorr) && cleanCorr.length > 0) {
                                 if (cleanOpt.endsWith(cleanCorr)) return true;
                            }
                            if (optText && cleanCorr.includes(optText)) {
                                 const regex = new RegExp(`\\b${optText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
                                 if (regex.test(cleanCorr)) return true;
                            }
                            
                            return false;
                        };
                        const isCorrect = checkIsCorrectDisplay(option, currentQuestion.correctAnswer);
                        
                        let variantClasses = "bg-white dark:bg-black/80 backdrop-blur-sm border-gray-200/60 hover:border-lime-300 hover:bg-lime-50/50 hover:shadow-md";
                        let indicatorClasses = "bg-gray-100 text-gray-400 group-hover:bg-lime-200 group-hover:text-lime-700";

                        if (feedback) {
                            if (isCorrect) {
                                variantClasses = "bg-lime-50 border-lime-500 text-lime-900 ring-4 ring-lime-500/20 shadow-lg shadow-lime-500/10 scale-[1.02] z-10";
                                indicatorClasses = "bg-lime-500 text-white";
                            }
                            else if (isSelected) {
                                variantClasses = "bg-red-50 border-red-400 text-red-900 ring-4 ring-red-500/10 shadow-md";
                                indicatorClasses = "bg-red-400 text-white";
                            }
                            else variantClasses = "bg-white dark:bg-black/50 border-gray-100 opacity-50 grayscale";
                        } else if (isSelected) {
                            variantClasses = "bg-gradient-to-r from-lime-600 to-lime-500 border-lime-500 text-white shadow-xl shadow-lime-500/30 scale-[1.02] z-10";
                            indicatorClasses = "bg-white dark:bg-black/20 text-white";
                        }

                        return (
                            <button
                            key={index}
                            onClick={() => !feedback && setSelectedOption(option)}
                            className={`group w-full text-left p-3 sm:p-4 rounded-[1rem] border-2 transition-all duration-300 flex items-center gap-3 ${variantClasses}`}
                            disabled={!!feedback}
                            >
                            <div className={`w-6 h-6 rounded-[10px] flex items-center justify-center shrink-0 font-black text-xs transition-colors ${indicatorClasses}`}>
                                {String.fromCharCode(65 + index)}
                            </div>
                            <span className={`font-bold text-xs md:text-sm leading-snug ${isSelected && !feedback ? 'text-white' : ''}`}>{option}</span>
                            </button>
                        );
                    })}
                    </div>
                )}
            </div>

            {feedback && (
                <div className={`p-8 rounded-3xl animate-in slide-in-from-bottom-4 duration-500 border ${feedback.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-4 mb-4">
                        <div className={`p-3 rounded-2xl shadow-inner ${feedback.isCorrect ? 'bg-lime-500 text-white shadow-lime-600/50' : 'bg-red-500 text-white shadow-red-600/50'}`}>
                            {feedback.isCorrect ? <CheckIcon className="w-6 h-6" /> : <XIcon className="w-6 h-6" />}
                        </div>
                        <h4 className={`text-2xl font-black tracking-tight ${feedback.isCorrect ? 'text-lime-700' : 'text-red-700'}`}>
                            {feedback.isCorrect ? 'Brilliant!' : 'Not Quite...'}
                        </h4>
                    </div>
                    <div className="bg-white dark:bg-black p-6 rounded-2xl border border-gray-200">
                        <p className="text-sm font-bold leading-relaxed text-gray-700">{feedback.explanation}</p>
                    </div>
                </div>
            )}

            <div className="pt-4">
                {feedback ? (
                    <button 
                        onClick={handleNextQuestion} 
                        className="w-full flex items-center justify-center gap-3 bg-blue-600 text-white font-black py-5 rounded-2xl hover:bg-blue-700 transition-all active:translate-y-0 text-sm uppercase tracking-widest"
                    >
                        {currentQuestionIndex < questions.length - 1 ? 'Next Challenge' : 'See Results'}
                        <ChevronDownIcon className="w-5 h-5 -rotate-90" />
                    </button>
                ) : (
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            if (!feedback) handleAnswerSubmit();
                        }} 
                        disabled={!selectedOption || isEvaluatingTheory || !!feedback} 
                        className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl hover:bg-blue-700 transition-all active:translate-y-0 disabled:opacity-50 disabled:hover:bg-blue-600 text-sm uppercase tracking-widest flex justify-center items-center gap-3"
                    >
                        {isEvaluatingTheory ? <LoadingSpinner text="Analyzing Response..." /> : 'Submit Answer'}
                    </button>
                )}
            </div>
          </div>
        );
      
      case 'completed':
          const xpEarned = score * 10;
          const percentage = Math.round((score / questions.length) * 100);
          const circumference = 2 * Math.PI * 80;
          const strokeDashoffset = circumference - (percentage / 100) * circumference;
          
        return (
          <div className="max-w-md mx-auto text-center space-y-10 py-10 animate-in zoom-in-95 duration-700 relative">
            <div className="relative inline-flex items-center justify-center">
                <svg className="w-56 h-56 transform -rotate-90 relative z-10" viewBox="0 0 200 200">
                    <circle 
                        className="text-gray-100" 
                        strokeWidth="12" 
                        stroke="currentColor" 
                        fill="transparent" 
                        r="80" 
                        cx="100" 
                        cy="100" 
                    />
                    <circle 
                        className={`transition-all duration-1000 ease-out drop-shadow-lg ${percentage >= 80 ? 'text-lime-500' : percentage >= 50 ? 'text-yellow-400' : 'text-red-400'}`}
                        strokeWidth="12" 
                        strokeDasharray={circumference} 
                        strokeDashoffset={strokeDashoffset} 
                        strokeLinecap="round" 
                        stroke="currentColor" 
                        fill="transparent" 
                        r="80" 
                        cx="100" 
                        cy="100" 
                    />
                </svg>
                <div className="absolute flex flex-col items-center justify-center inset-0 z-20">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Score</p>
                    <p className="text-6xl font-black text-gray-900 dark:text-white tracking-tighter tabular-nums">{percentage}<span className="text-2xl text-gray-400">%</span></p>
                    <div className="h-px w-12 bg-gray-200 my-2"></div>
                    <p className={`text-xs font-black uppercase tracking-widest ${percentage >= 80 ? 'text-lime-600' : percentage >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {score} / {questions.length}
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter">
                    {percentage >= 80 ? 'Masterfully Done.' : percentage >= 50 ? 'Solid Effort.' : 'Keep Training.'}
                </h3>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full border border-blue-200 text-blue-700">
                    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                    <p className="text-xs font-black uppercase tracking-widest">+{xpEarned} XP Earned</p>
                </div>
            </div>

            <div className="flex flex-col gap-3 mt-4">
                <button onClick={resetExam} className="w-full bg-black text-white font-black py-5 rounded-2xl hover:bg-gray-900 transition-all text-sm uppercase tracking-widest">
                    Start New Training
                </button>
                <button onClick={() => setExamState('history')} className="w-full bg-white dark:bg-black text-gray-600 dark:text-gray-300 font-black py-5 rounded-2xl border border-gray-200 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-[#0b1120] transition-all text-sm uppercase tracking-widest">
                    View Performance History
                </button>
            </div>
          </div>
        );

      case 'history':
          return (
              <div className="max-w-3xl mx-auto space-y-8 py-8 animate-in fade-in duration-500">
                  <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter leading-none mb-2">Exam History</h3>
                        <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Your previous performance</p>
                      </div>
                      <button 
                        onClick={resetExam} 
                        className="p-4 rounded-2xl bg-white dark:bg-black text-lime-600 border border-gray-100 shadow-sm hover:bg-lime-50 transition-all active:scale-95"
                      >
                         <XIcon className="w-5 h-5" />
                      </button>
                  </div>
                  <ExamHistory userProfile={userProfile} onReview={(exam) => { setReviewExam(exam); setExamState('review'); }} />
              </div>
          );

      case 'review':
        if (!reviewExam) return null;
          return (
              <div className="max-w-3xl mx-auto space-y-10 py-8 animate-in slide-in-from-right-8 duration-500">
                  <div className="relative overflow-hidden flex justify-between items-center bg-black text-white p-8 rounded-3xl border border-gray-800">
                      <div className="relative z-10">
                        <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.3em] mb-2">Performance Report</p>
                        <h3 className="text-3xl font-black tracking-tighter leading-none">{getCourseNameById(reviewExam.department_id)}</h3>
                        <div className="flex items-center gap-3 mt-4">
                            <span className="px-3 py-1 bg-white dark:bg-black/10 rounded-lg text-xs font-bold text-white/80 uppercase tracking-widest backdrop-blur-sm">{new Date(reviewExam.timestamp).toLocaleDateString()}</span>
                            <span className="px-3 py-1 bg-lime-500/20 text-lime-400 rounded-lg text-xs font-bold uppercase tracking-widest backdrop-blur-sm">Score: {reviewExam.score}/{reviewExam.total_questions}</span>
                        </div>
                      </div>
                                            <button 
                        onClick={() => setExamState('history')} 
                                                className="relative z-10 bg-white text-black hover:bg-gray-100 p-4 rounded-2xl transition-all duration-200"
                      >
                        <XIcon className="w-5 h-5" />
                      </button>
                  </div>

                  <div className="space-y-6">
                      {reviewExam.questions.map((q, index) => (
                          <div key={index} className="group bg-white dark:bg-black p-8 rounded-3xl border border-gray-200 hover:border-gray-300 transition-all duration-200">
                              <div className="flex justify-between items-start mb-6">
                                  <div>
                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Observation {index + 1}</p>
                                      <h4 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white leading-tight pr-8">{q.question}</h4>
                                  </div>
                                  <div className={`p-3 rounded-2xl shrink-0 shadow-sm ${q.isCorrect ? 'bg-lime-100 text-lime-600 border border-lime-200/50' : 'bg-red-100 text-red-600 border border-red-200/50'}`}>
                                      {q.isCorrect ? <CheckIcon className="w-6 h-6" /> : <XIcon className="w-6 h-6" />}
                                  </div>
                              </div>
                              
                              <div className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className={`p-6 rounded-2xl border ${q.isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                          <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${q.isCorrect ? 'text-lime-600/70' : 'text-red-600/70'}`}>Your Response</p>
                                          <p className={`text-base font-black ${q.isCorrect ? 'text-lime-800' : 'text-red-800'}`}>{q.userAnswer}</p>
                                      </div>
                                      {!q.isCorrect && (
                                          <div className="p-6 rounded-2xl bg-gray-50 dark:bg-black border border-gray-200">
                                              <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Model Answer</p>
                                              <p className="text-base font-black text-gray-900 dark:text-white">{q.correctAnswer}</p>
                                          </div>
                                      )}
                                  </div>
                                  
                                  <div className="bg-gray-50 dark:bg-black p-6 rounded-2xl border border-gray-200">
                                      <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Analysis</p>
                                      <p className="text-sm font-bold text-gray-700 leading-relaxed">{q.explanation}</p>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          );
      
      
      default: // 'start'
        if (isTopicDataLoading) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <LoadingSpinner text="" />
                    <p className="mt-8 text-xs font-black text-gray-400 uppercase tracking-widest animate-pulse">Syncing topic data...</p>
                </div>
            );
        }
        
        const filteredCourses = availableCourses.filter(c => c.course_name.toLowerCase().includes(pqSearchTerm.toLowerCase()) || c.course_id.toLowerCase().includes(pqSearchTerm.toLowerCase()));
        
        return (
          <div className="max-w-5xl mx-auto w-full space-y-8 animate-in fade-in zoom-in-95 duration-700 relative pb-12">
            {/* Tabs */}
            <div className="flex items-center gap-4 flex-wrap justify-center md:justify-start mb-8">
                <div className="flex flex-wrap gap-2 md:gap-4 flex-1">
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-full max-w-lg mx-auto border border-gray-200">
                <button onClick={() => setActiveTab('ai_exam')} className={`flex-1 py-2 text-[11px] font-black rounded-xl transition-all ${activeTab === 'ai_exam' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
                    AI Exam
                </button>
                <button onClick={() => setActiveTab('flashcards')} className={`flex-1 py-2 text-[11px] font-black rounded-xl transition-all ${activeTab === 'flashcards' ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
                    Flash Cards
                </button>
                <button onClick={() => setActiveTab('past_qa')} className={`flex-1 py-2 text-[11px] font-black rounded-xl transition-all ${activeTab === 'past_qa' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
                    Past Q&A
                </button>
            </div>
            </div>
            </div>
            
            {/* Tab Contents */}
            <div className="mt-8">
              {activeTab === 'ai_exam' && (
                  <div className="group relative bg-white dark:bg-black border border-gray-200 rounded-3xl p-7 sm:p-8 transition-all duration-200 max-w-2xl mx-auto overflow-hidden">
                      <div className="relative z-10 text-center">
                          <div className="w-16 h-16 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-center text-blue-600 mb-6 font-black text-2xl mx-auto">AI</div>
                          <h4 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Custom Exam Generator</h4>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">Generate a full 20-question exam for a specific course.</p>
                      </div>

                      <div className="mt-6 sm:mt-8 space-y-5 relative z-10 text-left">
                          <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Select Course</label>
                              <select className="w-full px-4 py-3 bg-white dark:bg-black border border-gray-200 rounded-2xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all" value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}>
                                  <option value="" disabled>Choose your subject...</option>
                                  {availableCourses.map(c => <option key={c.course_id} value={c.course_id}>{c.course_code || c.course_id} ({c.course_name})</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Exam Format</label>
                              <div className="flex gap-2 bg-gray-50 p-1 rounded-2xl border border-gray-200">
                                  <button onClick={() => setExamFormat('objective')} className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all ${examFormat === 'objective' ? 'bg-white text-blue-700 shadow-sm border border-blue-100' : 'text-gray-500 hover:text-gray-700'}`}>Objective</button>
                                  <button onClick={() => setExamFormat('theory')} className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all ${examFormat === 'theory' ? 'bg-white text-blue-700 shadow-sm border border-blue-100' : 'text-gray-500 hover:text-gray-700'}`}>Theory</button>
                              </div>
                          </div>
                          <button onClick={generateQuestions} disabled={!isAvelutConfigured || !selectedCourseId} className="w-full bg-blue-600 text-white font-black py-3.5 rounded-2xl hover:bg-blue-700 transition-all disabled:opacity-50 text-xs uppercase tracking-widest">
                              {isAvelutConfigured ? 'Start Exam' : 'Unavailable'}
                          </button>
                      </div>
                  </div>
              )}

              {activeTab === 'flashcards' && (
                  <div className="group relative bg-white dark:bg-black border border-gray-200 rounded-3xl p-7 sm:p-8 transition-all duration-200 max-w-2xl mx-auto overflow-hidden">
                      <div className="relative z-10 text-center">
                          <div className="w-16 h-16 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-center text-sky-600 mb-6 font-black mx-auto"><ListIcon className="w-8 h-8"/></div>
                          <h4 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">AI Flash Cards</h4>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">Generate 10 rapid-fire flashcards to test your definitions.</p>
                      </div>

                      <div className="mt-6 sm:mt-8 space-y-5 relative z-10 text-left">
                          <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Select Course</label>
                              <select className="w-full px-4 py-3 bg-white dark:bg-black border border-gray-200 rounded-2xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-4 focus:ring-sky-500/10 focus:border-sky-400 transition-all" value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}>
                                  <option value="" disabled>Choose your subject...</option>
                                  {availableCourses.map(c => <option key={c.course_id} value={c.course_id}>{c.course_code || c.course_id} ({c.course_name})</option>)}
                              </select>
                          </div>
                          <button onClick={generateFlashcards} disabled={!isAvelutConfigured || !selectedCourseId} className="w-full bg-sky-600 text-white font-black py-3.5 rounded-2xl hover:bg-sky-700 transition-all disabled:opacity-50 text-xs uppercase tracking-widest">
                              {isAvelutConfigured ? 'Generate Flashcards' : 'Unavailable'}
                          </button>
                      </div>
                  </div>
              )}

              {activeTab === 'past_qa' && (
                  <div className="space-y-8">
                      <div className="max-w-2xl mx-auto relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input 
                              type="text" 
                              placeholder="Search for a course..." 
                              value={pqSearchTerm} 
                              onChange={(e) => setPqSearchTerm(e.target.value)}
                              className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-black border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                          />
                      </div>

                      {true && (
                          <div className="max-w-4xl mx-auto pt-6 border-t border-gray-100">
                              <h3 className="text-lg sm:text-xl font-black text-left mb-5 flex items-center gap-3">
                                  <GraduationCapIcon className="w-6 h-6 text-blue-600"/> Available Past Questions
                              </h3>
                              {isPQLoading ? (
                                  <div className="py-12"><LoadingSpinner text="Loading past questions..." /></div>
                              ) : availablePQYears.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 text-left mt-6 sm:mt-8">
                                      {availablePQYears
                                          .filter(pq => {
                                              if (pqSearchTerm && !pq.course_id.toLowerCase().includes(pqSearchTerm.toLowerCase()) && !(availableCourses.find(c => c.course_id === pq.course_id)?.course_name || '').toLowerCase().includes(pqSearchTerm.toLowerCase())) return false;
                                              return true;
                                          })
                                          .map((pq, idx) => {
                                          const cName = availableCourses.find(c => c.course_id === pq.course_id)?.course_name || pq.course_id;
                                          return (
                                          <button key={pq.course_id + pq.year + idx} onClick={() => startPQExam(pq.course_id, pq.year)} className="group bg-white dark:bg-black border border-gray-200 rounded-3xl overflow-hidden hover:border-blue-300 transition-all duration-200 text-left flex flex-col active:scale-95">
                                              <div className="h-28 sm:h-32 bg-sky-50 w-full relative overflow-hidden flex items-center justify-center border-b border-gray-100">
                                                  <GraduationCapIcon className="w-10 h-10 sm:w-12 sm:h-12 text-sky-200 absolute -bottom-2 -right-2 transform group-hover:scale-110 transition-transform" />
                                                  <span className="text-2xl sm:text-3xl font-black text-sky-700 tracking-tighter">{pq.year}</span>
                                              </div>
                                              <div className="p-4 sm:p-5">
                                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{pq.course_id}</p>
                                                  <h4 className="text-base sm:text-lg font-black text-gray-900 dark:text-white leading-tight">{cName}</h4>
                                                  <p className="text-xs sm:text-sm font-bold text-blue-600 mt-3 flex items-center gap-2 group-hover:text-blue-700">Start Mock Exam &rarr;</p>
                                              </div>
                                          </button>
                                          );
                                      })}
                                  </div>
                              ) : (
                                  <div className="bg-gray-50 dark:bg-black border border-dashed border-gray-200 rounded-3xl p-12 text-center">
                                      <p className="text-gray-500 dark:text-gray-400 font-medium">No past questions have been uploaded for this course yet.</p>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full bg-white dark:bg-black p-4 sm:p-6 rounded-xl border border-gray-200">
      {renderContent()}


      <LimitExceededModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        userProfile={userProfile}
        appSettings={appSettings}
        cost={limitModalData.cost}
        balance={limitModalData.balance}
        addToast={addToast}
        onSuccessPurchase={() => {}}
      />
    </div>
  );
};
