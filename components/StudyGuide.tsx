import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { readCachedJson, writeCachedJson } from '../utils/cache';
import { createAvelutAI, getResponseText } from '../utils/inference';
import { Type } from '@google/genai';
import { db } from '../firebase';
import { ref as dbRef, update, get } from 'firebase/database';
import type { UserProfile, Course, Topic, UserProgress } from '../types';
import { useApiLimiter } from '../hooks/useApiLimiter';
import { useAppSettings } from '../hooks/useAppSettings';
import { useToast } from '../hooks/useToast';
import { Search, UploadCloud, BookOpen, Clock, Pin, Sparkles, X, ChevronRight, CheckCircle2 } from 'lucide-react';
import { LimitExceededModal } from './LimitExceededModal';
import { checkAICredits, deductAICredits, getFeatureCost, getFeatureModel } from '../utils/usage';
import { useSharedTextbookUpload, getCourseMergeKey } from '../hooks/useSharedTextbookUpload';
import VoiceTutorialPage, { VoiceTutorialSessionData } from './VoiceTutorialPage';

// --- UTILITIES ---
const normalizeLevelValue = (value?: string): string => {
    if (!value) return '';
    return value.toLowerCase().replace(/\s+/g, '').replace(/level/g, '').replace(/lvl/g, '');
};

const normalizeDepartmentValue = (value?: string): string => {
    if (!value) return '';
    return value.toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/[^\w_]/g, '');
};

const normalizeTopicId = (value: string) => value.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');

const sanitizeTopicMetadata = (topic: any, index: number): Topic => {
    const topicName = (topic?.topic_name || topic?.name || '').toString().trim() || `Topic ${index + 1}`;
    const rawTopicId = (topic?.topic_id || '').toString().trim();
    return {
        topic_name: topicName,
        topic_id: rawTopicId || normalizeTopicId(topicName),
        topic_context: (topic?.topic_context || topic?.context || '').toString().trim(),
        start_point: (topic?.start_point || topic?.start || '').toString().trim(),
        end_point: (topic?.end_point || topic?.end || '').toString().trim(),
        is_complete: Boolean(topic?.is_complete),
    };
};

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

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                const base64 = reader.result.split(',')[1];
                if (base64) return resolve(base64);
                return reject(new Error('Failed to parse base64 data'));
            }
            reject(new Error('Failed to read file'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0m';
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
};

// --- SKELETON LOADER ---
const StudyGuideSkeleton: React.FC = () => (
    <div className="w-full max-w-4xl mx-auto space-y-4 p-4 animate-pulse">
        <div className="h-20 bg-slate-200 dark:bg-slate-800/60 rounded-2xl w-full" />
        <div className="h-20 bg-slate-200 dark:bg-slate-800/60 rounded-2xl w-full" />
        <div className="h-20 bg-slate-200 dark:bg-slate-800/60 rounded-2xl w-full" />
    </div>
);

// --- COURSE HEADER CARD ---
interface CourseHeaderProps {
    course: Course;
    onClick: () => void;
    userProgress?: any;
    onUpload?: (files: FileList | File[]) => void;
    isUploading?: boolean;
    uploadProgress?: { status: string; percent: number } | null;
}

const CourseHeader: React.FC<CourseHeaderProps> = ({
    course,
    onClick,
    userProgress,
    onUpload,
    isUploading,
    uploadProgress,
}) => {
    const courseLabel = course.course_code || course.course_id || course.course_name;
    const timeSpent = userProgress?.course_time_spent?.[course.course_id] || 0;
    const topicCount = Array.isArray(course.topics) ? course.topics.length : 0;

    return (
        <div className="w-full max-w-4xl mx-auto py-1.5">
            <div
                onClick={onClick}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-200 cursor-pointer gap-3 group"
            >
                <div className="flex-1 flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform shrink-0">
                        <BookOpen className="w-6 h-6" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                {courseLabel}
                            </span>
                            {topicCount > 0 && (
                                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/40">
                                    {topicCount} {topicCount === 1 ? 'topic' : 'topics'}
                                </span>
                            )}
                        </div>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {course.course_name}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    {timeSpent > 0 && (
                        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 rounded-full border border-slate-200/60 dark:border-slate-700/60 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            <Clock className="w-3.5 h-3.5 text-emerald-500" />
                            <span>{formatDuration(timeSpent)}</span>
                        </div>
                    )}

                    {onUpload && (
                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            {isUploading ? (
                                <div className="flex flex-col gap-1 w-28">
                                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold truncate">
                                        {uploadProgress?.status || 'Uploading...'}
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                            style={{ width: `${uploadProgress?.percent || 0}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <label
                                    className="cursor-pointer p-2.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 border border-slate-200/80 dark:border-slate-800 transition-colors shadow-xs"
                                    title="Upload Syllabus / Textbook"
                                >
                                    <UploadCloud className="w-5 h-5" />
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                onUpload(e.target.files);
                                            }
                                            e.target.value = '';
                                        }}
                                    />
                                </label>
                            )}
                        </div>
                    )}

                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/60 transition-all">
                        <ChevronRight className="w-4 h-4" />
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- PROPS & ERROR BOUNDARY ---
export interface StudyGuideProps {
    userProfile: UserProfile;
    userProgress?: UserProgress;
    onNavigate?: (tab: string) => void;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any; info?: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }

    componentDidCatch(error: any, info: any) {
        console.error('ErrorBoundary caught error:', error, info);
        this.setState({ error, info });
    }

    reset = () => this.setState({ hasError: false, error: null, info: null });

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-center max-w-xl mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Something went wrong</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Could not load Study Guide. Please retry.</p>
                    <button onClick={this.reset} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-md hover:bg-emerald-500 transition-colors">
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- MAIN CONTENT ---
const StudyGuideContent: React.FC<StudyGuideProps> = ({ userProfile, userProgress, onNavigate }) => {
    const [courses, setCourses] = useState<Course[]>(() => {
        const key = `avelut_courses_${userProfile?.uid || 'anon'}`;
        return readCachedJson<Course[]>(key, []);
    });

    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [topicPickerCourse, setTopicPickerCourse] = useState<Course | null>(null);
    const [topicToOpen, setTopicToOpen] = useState<Topic | null>(null);
    const [activeExternalSession, setActiveExternalSession] = useState<VoiceTutorialSessionData | null>(() => (
        readCachedJson<VoiceTutorialSessionData | null>('avelut_active_voice_tutorial', null)
    ));
    const [pinnedTopics, setPinnedTopics] = useState<Array<any>>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Check for incoming voice tutorial session (e.g. from Visual Scanner Detailed Tutorial)
    useEffect(() => {
        const cachedSession = readCachedJson<VoiceTutorialSessionData | null>('avelut_active_voice_tutorial', null);
        if (cachedSession) {
            setActiveExternalSession(cachedSession);
        }
    }, []);

    const [filter, setFilter] = useState(() => ({
        searchTerm: '',
        semester: (userProfile?.default_semester_tab || 'second') as 'all' | 'first' | 'second',
    }));

    const { addToast } = useToast();
    const { uploadTextbook, uploadProgress, isUploadingCourseKey } = useSharedTextbookUpload();
    const { settings: appSettings } = useAppSettings();

    const [showLimitModal, setShowLimitModal] = useState(false);
    const [limitModalData, setLimitModalData] = useState({ balance: 0, cost: 0 });
    const { attemptApiCall } = useApiLimiter({ userProfile, addToast, setShowLimitModal, setLimitModalData });

    const [isExtractingCourses, setIsExtractingCourses] = useState(false);
    const [manualCourseCode, setManualCourseCode] = useState('');
    const [isSavingManual, setIsSavingManual] = useState(false);
    const [isManualMode, setIsManualMode] = useState(false);

    // Load pinned topics
    useEffect(() => {
        if (!userProfile) return;
        const loaded = readCachedJson<Array<any>>(`pinned_topics_${userProfile.uid}`, []);
        setPinnedTopics(loaded);
    }, [userProfile]);

    const savePinnedTopics = (next: Array<any>) => {
        if (userProfile?.uid) {
            writeCachedJson(`pinned_topics_${userProfile.uid}`, next, userProfile.uid);
        }
        setPinnedTopics(next);
    };

    const togglePinTopic = (course: Course, topic: Topic) => {
        const key = `${course.course_id}::${topic.topic_id}`;
        const exists = pinnedTopics.find(p => p.key === key);
        if (exists) {
            savePinnedTopics(pinnedTopics.filter(p => p.key !== key));
            return;
        }
        const next = [
            {
                key,
                course_id: course.course_id,
                course_name: course.course_name,
                topic_id: topic.topic_id,
                topic_name: topic.topic_name,
                topic_context: topic.topic_context,
            },
            ...pinnedTopics,
        ];
        savePinnedTopics(next.slice(0, 20));
    };

    const handleSaveManualCourse = async () => {
        if (!manualCourseCode.trim()) {
            addToast('Please enter a course code/name', 'error');
            return;
        }
        if (!userProfile.school_id || !userProfile.college_id || !userProfile.department_id || !userProfile.level) {
            return addToast('Please complete your profile (School, College, Department, Level) first.', 'error');
        }

        setIsSavingManual(true);
        try {
            const ai = createAvelutAI(appSettings, userProfile);
            if (!ai) throw new Error('Avelut AI is not configured in App Controls.');
            const geminiModel = getFeatureModel('study_guide_extraction', appSettings) || 'gemini-3.1-flash-lite';

            const prompt = `Based on this course code/name: "${manualCourseCode}", generate a short, one-line professional course description. Return a JSON object with 'course_name' (guessed full name if possible, else the code), 'course_code' (standardized uppercase code), and 'description'.`;

            const aiResponse = await attemptApiCall(() => ai.models.generateContent({
                model: geminiModel,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            course_name: { type: Type.STRING },
                            course_code: { type: Type.STRING },
                            description: { type: Type.STRING }
                        },
                        required: ['course_name', 'course_code', 'description']
                    }
                }
            }), getFeatureCost('study_guide_extraction', appSettings) || 0);

            if (!aiResponse) throw new Error("Failed to generate course info");
            const text = getResponseText(aiResponse);
            if (!text) throw new Error("Failed to get response");
            const data = JSON.parse(text) as Partial<{ course_name: unknown; course_code: unknown; description: unknown }>;

            const courseName = typeof data.course_name === 'string' ? data.course_name.trim() : '';
            const courseCode = typeof data.course_code === 'string' ? data.course_code.trim() : '';
            const description = typeof data.description === 'string' ? data.description.trim() : '';

            if (!courseName || !courseCode || !description) {
                throw new Error('AI returned invalid course data. Please try again.');
            }

            const courseId = courseCode.toLowerCase().replace(/\s+/g, '');
            const courseData = {
                course_id: courseId,
                course_name: courseName,
                course_code: courseCode.toUpperCase(),
                description,
                level: userProfile.level,
                semester: filter.semester === 'all' ? 'first' : filter.semester,
                course_status: 'active'
            };

            const updates: any = {};
            const deptPath = `${userProfile.school_id}/colleges/${userProfile.college_id}/departments/${userProfile.department_id}`;
            updates[`schools_data/${deptPath}/levels/${userProfile.level}/courses/${courseId}`] = courseData;
            updates[`departments_data/${userProfile.department_id}/course_list/${courseId}`] = courseData;

            await update(dbRef(db), updates);
            addToast(`Added ${courseData.course_code} successfully!`, 'success');
            setManualCourseCode('');
            setIsManualMode(false);
        } catch (err: any) {
            console.error("Error saving manual course:", err);
            addToast(err.message || "Failed to save course", "error");
        } finally {
            setIsSavingManual(false);
        }
    };

    const handleExtractCourses = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return addToast('Please upload a PDF file.', 'error');
        if (!userProfile.school_id || !userProfile.college_id || !userProfile.department_id || !userProfile.level) {
            return addToast('Please complete your profile (School, College, Department, Level) first.', 'error');
        }

        setIsExtractingCourses(true);
        try {
            const ai = createAvelutAI(appSettings, userProfile);
            const geminiModel = getFeatureModel('study_guide_extraction', appSettings) || 'gemini-3.1-flash-lite';
            const base64Chunk = await fileToBase64(file);
            const prompt = `Analyze this PDF document. Extract all course names and course codes. Return a JSON object with a 'courses' array, where each item has 'course_name' and 'course_code'.`;

            const aiResponse = await attemptApiCall(() => ai.models.generateContent({
                model: geminiModel,
                contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'application/pdf', data: base64Chunk } }] }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            courses: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { course_name: { type: Type.STRING }, course_code: { type: Type.STRING } },
                                    required: ['course_name', 'course_code']
                                }
                            }
                        },
                        required: ['courses']
                    }
                },
            }), getFeatureCost('study_guide_extraction', appSettings));

            if (!aiResponse) throw new Error("Failed to get response from AI");
            const text = getResponseText(aiResponse);
            if (!text) throw new Error("Failed to get response from AI");
            const data = JSON.parse(text);

            if (data.courses && Array.isArray(data.courses) && data.courses.length > 0) {
                const updates: any = {};
                const deptPath = `${userProfile.school_id}/colleges/${userProfile.college_id}/departments/${userProfile.department_id}`;
                data.courses.forEach((c: any) => {
                    const courseId = c.course_code.trim().toLowerCase().replace(/\s+/g, '');
                    const courseData = {
                        course_id: courseId,
                        course_name: c.course_name.trim(),
                        course_code: c.course_code.trim().toUpperCase(),
                        level: userProfile.level,
                        semester: filter.semester === 'all' ? 'first' : filter.semester,
                        course_status: 'active'
                    };
                    updates[`schools_data/${deptPath}/levels/${userProfile.level}/courses/${courseId}`] = courseData;
                    updates[`departments_data/${userProfile.department_id}/course_list/${courseId}`] = courseData;
                });
                await update(dbRef(db), updates);
                addToast(`Successfully extracted and saved ${data.courses.length} courses!`, 'success');
            } else {
                throw new Error("No courses found in the document");
            }
        } catch (err: any) {
            console.error(err);
            addToast(err.message || 'Failed to extract courses', 'error');
        } finally {
            setIsExtractingCourses(false);
            if (e.target) e.target.value = '';
        }
    };

    useEffect(() => {
        const fetchCourses = async () => {
            const cached = readCachedJson<Course[]>(`avelut_courses_${userProfile.uid}`, []);
            if (cached && cached.length > 0) {
                setIsLoading(false);
            } else {
                setIsLoading(true);
            }
            try {
                const normalizedUserDepartment = normalizeDepartmentValue(userProfile.department_id);
                const normalizedUserLevel = normalizeLevelValue(userProfile.level);

                if (!normalizedUserDepartment) {
                    setCourses([]);
                    setIsLoading(false);
                    return;
                }

                let resolvedDepartmentData: any = null;
                const deptCoursesSnap = await get(dbRef(db, `departments_data/${userProfile.department_id}`));
                if (deptCoursesSnap.exists()) {
                    resolvedDepartmentData = deptCoursesSnap.val();
                }

                const allDepartmentCourses: any[] = resolvedDepartmentData?.course_list
                    ? (Array.isArray(resolvedDepartmentData.course_list)
                        ? resolvedDepartmentData.course_list
                        : Object.values(resolvedDepartmentData.course_list))
                    : [];
                const coursesForLevel = allDepartmentCourses.filter((course) => (
                    normalizeLevelValue(course.level) === normalizedUserLevel
                ));

                const enrichedCourses: Course[] = await Promise.all(
                    coursesForLevel.map(async (course) => {
                        try {
                            if (course.textbook_shared_key) {
                                const sharedRef = dbRef(db, `textbook_contexts/shared/${course.textbook_shared_key}`);
                                const sharedSnap = await get(sharedRef);
                                if (sharedSnap.exists()) {
                                    const sharedVal = sharedSnap.val();
                                    const syllabus = Array.isArray(sharedVal.syllabus) ? sharedVal.syllabus.map((t: any, i: number) => sanitizeTopicMetadata(t, i)) : [];
                                    return { ...course, topics: syllabus };
                                }
                            }

                            const perDeptRef = dbRef(db, `textbook_contexts/${userProfile.department_id}/${course.level}/${course.course_name}`);
                            const perDeptSnap = await get(perDeptRef);
                            if (perDeptSnap.exists()) {
                                const val = perDeptSnap.val();
                                const syllabus = Array.isArray(val.syllabus) ? val.syllabus.map((t: any, i: number) => sanitizeTopicMetadata(t, i)) : [];
                                return { ...course, topics: syllabus };
                            }

                            return course;
                        } catch (e) {
                            console.error('Error enriching course with textbook syllabus:', e);
                            return course;
                        }
                    })
                );

                setCourses(enrichedCourses);
                writeCachedJson(`avelut_courses_${userProfile.uid}`, enrichedCourses);
            } catch (err) {
                console.error("Error fetching courses:", err);
                addToast("Could not load study materials.", 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchCourses();
    }, [userProfile.department_id, userProfile.level, addToast, userProfile.uid]);

    const filteredCourses = courses.filter(course => {
        if (filter.semester !== 'all' && course.semester !== filter.semester) {
            return false;
        }

        const searchTerm = filter.searchTerm.trim().toLowerCase();
        if (!searchTerm) {
            return true;
        }

        return [course.course_name, course.course_code, course.course_id]
            .filter(Boolean)
            .some(value => value!.toLowerCase().includes(searchTerm));
    });

    // ── ACTIVE TUTORIAL VIEW (VOICE & BLACKBOARD LEARNING) ──
    if (activeExternalSession || selectedCourse) {
        const activeSessionData: VoiceTutorialSessionData = activeExternalSession || {
            course: selectedCourse!,
            topic: topicToOpen || (Array.isArray(selectedCourse!.topics) && selectedCourse!.topics.length > 0 ? selectedCourse!.topics[0] : {
                topic_id: 'core_principles',
                topic_name: 'Core Principles & Overview',
                topic_context: `Overview and principles of ${selectedCourse!.course_name}`,
            }),
            syllabusContext: '',
        };

        return (
            <VoiceTutorialPage
                userProfile={userProfile}
                appSettings={appSettings}
                initialSessionData={activeSessionData}
                onBack={() => {
                    setSelectedCourse(null);
                    setTopicToOpen(null);
                    setActiveExternalSession(null);
                    writeCachedJson('avelut_active_voice_tutorial', null);
                }}
                onNavigate={onNavigate}
            />
        );
    }

    // ── TOPIC PICKER MODAL ──
    const renderTopicPicker = () => {
        if (!topicPickerCourse) return null;
        const topics = Array.isArray(topicPickerCourse.topics) ? topicPickerCourse.topics : [];
        const coursePinned = pinnedTopics.filter(p => p.course_id === topicPickerCourse.course_id);

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div 
                    className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer" 
                    onClick={(e) => {
                        e.stopPropagation();
                        setTopicPickerCourse(null);
                    }} 
                />
                
                <div 
                    className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-50 flex flex-col max-h-[85vh] animate-scale-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
                        <div className="pr-3">
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                                {topicPickerCourse.course_code || topicPickerCourse.course_name}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Select a topic to start interactive tutorial
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setTopicPickerCourse(null);
                            }}
                            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                            aria-label="Close modal"
                            title="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-4 overflow-y-auto space-y-3 flex-1 [scrollbar-width:thin]">
                        {coursePinned.length > 0 && (
                            <div className="space-y-2 mb-4">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                    <Pin className="w-3.5 h-3.5" />
                                    <span>Pinned Topics</span>
                                </div>
                                {coursePinned.map((p) => (
                                    <div
                                        key={p.key}
                                        onClick={() => {
                                            setSelectedCourse(topicPickerCourse);
                                            setTopicToOpen({
                                                topic_id: p.topic_id,
                                                topic_name: p.topic_name,
                                                topic_context: p.topic_context,
                                            });
                                            setTopicPickerCourse(null);
                                        }}
                                        className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-emerald-100 dark:border-emerald-950 bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm text-slate-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                                {p.topic_name}
                                            </div>
                                            {p.topic_context && (
                                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                    {p.topic_context}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedCourse(topicPickerCourse);
                                                    setTopicToOpen({
                                                        topic_id: p.topic_id,
                                                        topic_name: p.topic_name,
                                                        topic_context: p.topic_context,
                                                    });
                                                    setTopicPickerCourse(null);
                                                }}
                                                className="w-9 h-9 flex items-center justify-center bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-full shadow-sm shadow-emerald-600/20 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                                                title="Start Topic Tutorial"
                                            >
                                                <ChevronRight className="w-4 h-4 stroke-[3]" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    togglePinTopic(topicPickerCourse, {
                                                        topic_id: p.topic_id,
                                                        topic_name: p.topic_name,
                                                        topic_context: p.topic_context,
                                                    });
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                                title="Unpin topic"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {topics.length === 0 ? (
                            <div className="p-8 text-center flex flex-col items-center justify-center">
                                <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    No syllabus extracted yet
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                                    Upload a textbook/syllabus PDF or start the introductory lesson directly.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                    Course Syllabus ({topics.length} topics)
                                </div>
                                {topics.map((t: Topic, idx: number) => {
                                    const isPinned = pinnedTopics.some(p => p.key === `${topicPickerCourse.course_id}::${t.topic_id}`);
                                    return (
                                        <div
                                            key={t.topic_id || idx}
                                            onClick={() => {
                                                setSelectedCourse(topicPickerCourse);
                                                setTopicToOpen(t);
                                                setTopicPickerCourse(null);
                                            }}
                                            className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 hover:border-emerald-200 dark:hover:border-emerald-800/60 transition-all cursor-pointer group"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-slate-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                                        {t.topic_name}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            togglePinTopic(topicPickerCourse, t);
                                                        }}
                                                        className={`text-xs p-1 rounded-md transition-colors cursor-pointer ${
                                                            isPinned
                                                                ? 'text-emerald-500 font-bold'
                                                                : 'text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'
                                                        }`}
                                                        title={isPinned ? 'Unpin' : 'Pin topic'}
                                                    >
                                                        <Pin className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                {t.topic_context && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                        {t.topic_context}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedCourse(topicPickerCourse);
                                                    setTopicToOpen(t);
                                                    setTopicPickerCourse(null);
                                                }}
                                                className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-emerald-600 text-slate-600 hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-600 dark:hover:text-white rounded-full transition-all shrink-0 active:scale-95 cursor-pointer shadow-xs group-hover:bg-emerald-600 group-hover:text-white"
                                                title="Start Topic Tutorial"
                                            >
                                                <ChevronRight className="w-4 h-4 stroke-[3]" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedCourse(topicPickerCourse);
                                setTopicToOpen(null);
                                setTopicPickerCourse(null);
                            }}
                            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl py-3 text-sm font-extrabold shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <span>Start Full Course</span>
                            <ChevronRight className="w-4 h-4 stroke-[3]" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setTopicPickerCourse(null);
                            }}
                            className="px-5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl py-3 text-sm font-bold transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 flex flex-col w-full bg-slate-50/50 dark:bg-[#030712] overflow-hidden rounded-2xl">
            {/* Top Roadmap Header */}
            <div className="flex-shrink-0 px-6 sm:px-10 py-8 sm:py-10 bg-white dark:bg-slate-950 border-b border-slate-200/80 dark:border-slate-800/80 shadow-xs">
                <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-xs font-black uppercase tracking-wider mb-3 border border-emerald-200/60 dark:border-emerald-800/40">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Interactive Voice & Visual Curriculum</span>
                    </div>
                    <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                        Academic Study Guide
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-lg mt-2 font-medium">
                        Select any topic to start a bit-by-bit pedagogical blackboard lesson with voice narration and LaTeX equations.
                    </p>

                    {/* Search and Filter */}
                    <div className="mt-6 w-full flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative group">
                            <input
                                type="text"
                                placeholder="Search courses or topics..."
                                value={filter.searchTerm}
                                onChange={(e) => setFilter(f => ({ ...f, searchTerm: e.target.value }))}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none text-sm transition-all"
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-emerald-500 transition-colors">
                                <Search className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl flex border border-slate-200/80 dark:border-slate-800 shrink-0">
                            <button
                                onClick={() => setFilter(f => ({ ...f, semester: 'first' }))}
                                className={`px-4 sm:px-5 py-2 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all ${
                                    filter.semester === 'first'
                                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                            >
                                1st Sem
                            </button>
                            <button
                                onClick={() => setFilter(f => ({ ...f, semester: 'second' }))}
                                className={`px-4 sm:px-5 py-2 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all ${
                                    filter.semester === 'second'
                                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                            >
                                2nd Sem
                            </button>
                            <button
                                onClick={() => setFilter(f => ({ ...f, semester: 'all' }))}
                                className={`px-4 sm:px-5 py-2 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all ${
                                    filter.semester === 'all'
                                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                            >
                                All
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Courses List */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
                {isLoading ? (
                    <StudyGuideSkeleton />
                ) : filteredCourses.length > 0 ? (
                    <div className="max-w-4xl mx-auto space-y-3">
                        {filteredCourses.map(course => (
                            <CourseHeader
                                key={course.course_id}
                                course={course}
                                onClick={() => setTopicPickerCourse(course)}
                                userProgress={userProgress}
                                onUpload={(files) => uploadTextbook(course, getCourseMergeKey(course) || course.course_name, files, false, userProfile.department_id)}
                                isUploading={isUploadingCourseKey === (getCourseMergeKey(course) || course.course_name)}
                                uploadProgress={uploadProgress}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center max-w-lg mx-auto">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-3xl flex items-center justify-center mb-4 text-slate-400 shadow-inner">
                            <Search className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">No courses found</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                            {filter.searchTerm ? 'Try adjusting your search query.' : 'Upload your course registration PDF or add your course codes.'}
                        </p>

                        {!filter.searchTerm && (
                            <div className="w-full bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Add Courses</h4>
                                    {isManualMode && (
                                        <button
                                            onClick={() => setIsManualMode(false)}
                                            className="text-xs text-emerald-600 dark:text-emerald-400 font-bold"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>

                                {isManualMode ? (
                                    <div className="flex flex-col gap-3">
                                        <div className="relative flex items-center">
                                            <input
                                                type="text"
                                                value={manualCourseCode}
                                                onChange={(e) => setManualCourseCode(e.target.value.toUpperCase())}
                                                placeholder="e.g. MTH101, PHY201"
                                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                disabled={isSavingManual}
                                            />
                                            <button
                                                onClick={handleSaveManualCourse}
                                                disabled={isSavingManual || !manualCourseCode.trim()}
                                                className="absolute right-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-xs"
                                            >
                                                {isSavingManual ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2.5">
                                        <label className={`flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-tr from-emerald-600 to-teal-600 text-white rounded-2xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-emerald-600/20 hover:scale-[1.01] active:scale-95 ${isExtractingCourses ? 'opacity-70 pointer-events-none' : ''}`}>
                                            <UploadCloud className="w-4 h-4" />
                                            <span>{isExtractingCourses ? 'Extracting courses...' : 'Upload Course Form PDF'}</span>
                                            <input type="file" accept=".pdf" className="hidden" onChange={handleExtractCourses} disabled={isExtractingCourses} />
                                        </label>
                                        <button
                                            onClick={() => setIsManualMode(true)}
                                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-bold transition-all"
                                        >
                                            Manually Enter Course Code
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <LimitExceededModal
                isOpen={showLimitModal}
                onClose={() => setShowLimitModal(false)}
                userProfile={userProfile}
                appSettings={appSettings}
                cost={limitModalData.cost}
                balance={limitModalData.balance}
                addToast={addToast}
                onSuccessPurchase={() => { }}
            />

            {renderTopicPicker()}
        </div>
    );
};

export const StudyGuide: React.FC<StudyGuideProps> = (props) => (
    <ErrorBoundary>
        <StudyGuideContent {...props} />
    </ErrorBoundary>
);

export default StudyGuide;
