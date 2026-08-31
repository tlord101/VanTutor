import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../../../../firebase';
import { ref as dbRef, get, update } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Type, createAvelutAI } from '../../../../utils/inference';
import { useToast } from '../../../../hooks/useToast';
import { useAppSettings } from '../../../../hooks/useAppSettings';
import { InlineEditableText } from '../../primitives/InlineEditableText';
import { BreadcrumbNavigation } from '../../primitives/BreadcrumbNavigation';
import { TopicPurgeManager } from '../../primitives/TopicPurgeManager';
import { ScopeSelectionModal } from '../../primitives/ScopeSelectionModal';
import {
    Building2,
    GraduationCap,
    BookOpen,
    UploadCloud,
    FileText,
    Plus,
    Trash2,
    MoveUp,
    MoveDown,
    Undo2,
    Sparkles,
    ChevronRight,
    ListTree
} from 'lucide-react';
import type { Course, Topic } from '../../../../types';

interface ExtendedTopic extends Topic {
    estimated_hours?: string;
    subtopics?: Array<{ topic_id: string; topic_name: string }>;
}

interface Level4CourseStudioProps {
    schoolId: string;
    deptId: string;
    courseId: string;
    schoolsData: Record<string, any>;
    allDepartments: any[];
    onNavigate: (path: string) => void;
    refreshData: () => Promise<void>;
}

type ExtractionStage = 'idle' | 'uploading' | 'analyzing' | 'extracting' | 'populating' | 'complete' | 'error';

export const Level4CourseStudio: React.FC<Level4CourseStudioProps> = ({
    schoolId,
    deptId,
    courseId,
    schoolsData,
    allDepartments,
    onNavigate,
    refreshData,
}) => {
    const { addToast } = useToast();
    const { settings: appSettings } = useAppSettings();

    const school = schoolsData[schoolId] || { name: schoolId };
    const department = allDepartments.find((d) => d.id === deptId) || { department_name: deptId };
    const collegeId = department.collegeId;
    const college = collegeId ? school.colleges?.[collegeId] || { name: collegeId } : null;

    const [course, setCourse] = useState<Course | null>(null);
    const [topics, setTopics] = useState<ExtendedTopic[]>([]);
    const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string; extracted: boolean }>>([]);
    const [isLoading, setIsLoading] = useState(true);

    // AI Extraction Pipeline state
    const [extractionStage, setExtractionStage] = useState<ExtractionStage>('idle');
    const [extractionProgress, setExtractionProgress] = useState<number>(0);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Scope selection for material upload
    const [isUploadScopeModalOpen, setIsUploadScopeModalOpen] = useState(false);
    const [pendingExtractedTopics, setPendingExtractedTopics] = useState<ExtendedTopic[] | null>(null);

    // Manual Topic Creator state
    const [newTopicTitle, setNewCourseTopicTitle] = useState('');
    const [newEstimatedHours, setNewEstimatedHours] = useState('');
    const [activeSubtopicParentId, setActiveSubtopicParentId] = useState<string | null>(null);
    const [newSubtopicTitle, setNewSubtopicTitle] = useState('');

    // Optimistic Undo state
    const [deletedTopicBackup, setDeletedTopicBackup] = useState<{ topic: ExtendedTopic; index: number } | null>(null);
    const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Batch Selection state
    const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());

    const toggleTopicSelection = (topicId: string) => {
        setSelectedTopicIds((prev) => {
            const next = new Set(prev);
            if (next.has(topicId)) next.delete(topicId);
            else next.add(topicId);
            return next;
        });
    };

    const toggleSelectAllTopics = () => {
        if (selectedTopicIds.size === topics.length && topics.length > 0) {
            setSelectedTopicIds(new Set());
        } else {
            setSelectedTopicIds(new Set(topics.map((t) => t.topic_id)));
        }
    };

    const handleBatchDeleteTopics = async () => {
        if (selectedTopicIds.size === 0) return;
        if (!window.confirm(`Are you sure you want to permanently delete ${selectedTopicIds.size} selected topic(s)?`)) return;

        const nextTopics = topics.filter((t) => !selectedTopicIds.has(t.topic_id));
        setTopics(nextTopics);
        setSelectedTopicIds(new Set());
        await saveTopicsToDatabase(nextTopics);
        addToast(`Successfully deleted ${selectedTopicIds.size} topic(s).`, 'success');
    };

    const geminiApiKey = appSettings.gemini_api_key?.trim() || '';
    const aiClient = useRef<any>(null);
    useEffect(() => {
        if (geminiApiKey) {
            aiClient.current = createAvelutAI(appSettings);
        }
    }, [geminiApiKey, appSettings]);

    const loadCourseData = async () => {
        setIsLoading(true);
        try {
            const snap = await get(dbRef(db, `departments_data/${deptId}`));
            if (snap.exists()) {
                const data = snap.val();
                const rawList = data?.course_list;
                let list: Course[] = [];
                if (Array.isArray(rawList)) list = rawList;
                else if (rawList && typeof rawList === 'object') list = Object.values(rawList);

                const found = list.find((c) => c.course_id === courseId || c.course_code === courseId);
                if (found) {
                    setCourse(found);
                    setTopics((found.topics as ExtendedTopic[]) || []);
                    if (found.textbook_urls?.length) {
                        setUploadedFiles(
                            found.textbook_urls.map((url, idx) => ({
                                name: `syllabus_material_${idx + 1}.pdf`,
                                url,
                                extracted: true,
                            }))
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Error loading course studio data:', error);
            addToast('Failed to load course details.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadCourseData();
    }, [deptId, courseId]);

    const saveTopicsToDatabase = async (updatedTopics: ExtendedTopic[], isGlobalSync = false) => {
        try {
            const updates: Record<string, any> = {};
            const linkedDepts = course?.linked_departments && course.linked_departments.length > 0
                ? course.linked_departments
                : [deptId];

            if (isGlobalSync) {
                for (const dId of linkedDepts) {
                    const snap = await get(dbRef(db, `departments_data/${dId}`));
                    if (snap.exists()) {
                        const data = snap.val();
                        const rawList = data?.course_list;
                        let list: Course[] = Array.isArray(rawList) ? rawList : Object.values(rawList || {});

                        const nextList = list.map((c) => {
                            if (c.course_id === courseId || c.course_code === courseId) {
                                return { ...c, topics: updatedTopics };
                            }
                            return c;
                        });
                        updates[`departments_data/${dId}/course_list`] = nextList;
                    }
                }
                updates[`global_courses/${courseId}/topics`] = updatedTopics;
            } else {
                const snap = await get(dbRef(db, `departments_data/${deptId}`));
                if (snap.exists()) {
                    const data = snap.val();
                    const rawList = data?.course_list;
                    let list: Course[] = Array.isArray(rawList) ? rawList : Object.values(rawList || {});

                    const nextList = list.map((c) => {
                        if (c.course_id === courseId || c.course_code === courseId) {
                            return { ...c, topics: updatedTopics };
                        }
                        return c;
                    });
                    updates[`departments_data/${deptId}/course_list`] = nextList;
                }
            }

            await update(dbRef(db), updates);
            await refreshData();
        } catch (error: any) {
            console.error('Error saving topics:', error);
            addToast('Failed to sync topics to database.', 'error');
        }
    };

    // AI Syllabus Extraction Pipeline
    const processFileForAIExtraction = async (file: File) => {
        if (!aiClient.current) {
            addToast('Avelut AI API key is not configured in App Controls.', 'error');
            return;
        }

        setExtractionStage('uploading');
        setExtractionProgress(20);

        try {
            // 1. Upload to Firebase Storage
            const uploadToken = `${Date.now()}_${file.name}`;
            const fRef = storageRef(storage, `syllabi/${deptId}/${courseId}/${uploadToken}`);
            const uploadResult = await uploadBytes(fRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);

            setExtractionStage('analyzing');
            setExtractionProgress(45);

            // 2. Read File Data URL for Gemini AI
            const reader = new FileReader();
            reader.readAsDataURL(file);
            const base64Data = await new Promise<string>((resolve) => {
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
            });

            setExtractionStage('extracting');
            setExtractionProgress(70);

            const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
            const prompt = `Analyze this course syllabus / textbook document for course "${course?.course_name || courseId}".
Extract all main topics and subtopics into a structured syllabus.
RULES:
1. Output ONLY a JSON object.
2. Structure:
{
  "topics": [
    {
      "topic_name": "Introduction to Topic",
      "estimated_hours": "3 hrs",
      "subtopics": [
        { "topic_name": "Subtopic Detail" }
      ]
    }
  ]
}`;

            const modelName = appSettings.alibaba_model || appSettings.primary_gemini_model || 'qwen-plus';
            const response = await aiClient.current.models.generateContent({
                model: modelName,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType, data: base64Data } },
                        ],
                    },
                ],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            topics: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        topic_name: { type: Type.STRING },
                                        estimated_hours: { type: Type.STRING },
                                        subtopics: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    topic_name: { type: Type.STRING },
                                                },
                                                required: ['topic_name'],
                                            },
                                        },
                                    },
                                    required: ['topic_name'],
                                },
                            },
                        },
                        required: ['topics'],
                    },
                },
            });

            setExtractionStage('populating');
            setExtractionProgress(90);

            const responseText = (response as any).text || '';
            const parsedData = JSON.parse(responseText);
            const extractedTopicsRaw = Array.isArray(parsedData.topics) ? parsedData.topics : [];

            const formattedExtractedTopics: ExtendedTopic[] = extractedTopicsRaw.map((t: any, idx: number) => {
                const topicName = t.topic_name || `Topic ${idx + 1}`;
                const topicId = topicName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
                return {
                    topic_id: topicId,
                    topic_name: topicName,
                    topic_context: topicName,
                    estimated_hours: t.estimated_hours || '2 hrs',
                    subtopics: Array.isArray(t.subtopics)
                        ? t.subtopics.map((sub: any) => ({
                              topic_id: (sub.topic_name || '').toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, ''),
                              topic_name: sub.topic_name || 'Subtopic',
                          }))
                        : [],
                };
            });

            const mergedTopics = [...topics, ...formattedExtractedTopics];
            setTopics(mergedTopics);

            setUploadedFiles((prev) => [
                ...prev,
                { name: file.name, url: downloadURL, extracted: true },
            ]);

            setExtractionStage('complete');
            setExtractionProgress(100);

            if (course?.linked_departments && course.linked_departments.length > 1) {
                setPendingExtractedTopics(mergedTopics);
                setIsUploadScopeModalOpen(true);
            } else {
                await saveTopicsToDatabase(mergedTopics, false);
            }

            addToast(`Successfully extracted ${formattedExtractedTopics.length} topics from "${file.name}"!`, 'success');
            setTimeout(() => setExtractionStage('idle'), 3000);
        } catch (error: any) {
            console.error('Error during AI extraction:', error);
            setExtractionStage('error');
            addToast('AI extraction failed: ' + error.message, 'error');
        }
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            void processFileForAIExtraction(e.dataTransfer.files[0]);
        }
    };

    // Manual Topic Management Actions
    const handleAddTopicManually = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedTitle = newTopicTitle.trim();
        if (!trimmedTitle) return;

        const topicId = trimmedTitle.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
        const newTopic: ExtendedTopic = {
            topic_id: topicId,
            topic_name: trimmedTitle,
            topic_context: trimmedTitle,
            estimated_hours: newEstimatedHours.trim() || '2 hrs',
            subtopics: [],
        };

        const nextTopics = [...topics, newTopic];
        setTopics(nextTopics);
        setNewCourseTopicTitle('');
        setNewEstimatedHours('');
        await saveTopicsToDatabase(nextTopics);
        addToast(`Topic "${trimmedTitle}" added!`, 'success');
    };

    const handleAddSubtopic = async (parentTopicId: string) => {
        const trimmedTitle = newSubtopicTitle.trim();
        if (!trimmedTitle) return;

        const subtopicId = trimmedTitle.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
        const nextTopics = topics.map((t) => {
            if (t.topic_id === parentTopicId) {
                const existingSubtopics = t.subtopics || [];
                return {
                    ...t,
                    subtopics: [...existingSubtopics, { topic_id: subtopicId, topic_name: trimmedTitle }],
                };
            }
            return t;
        });

        setTopics(nextTopics);
        setNewSubtopicTitle('');
        setActiveSubtopicParentId(null);
        await saveTopicsToDatabase(nextTopics);
        addToast(`Subtopic added!`, 'success');
    };

    const handleDeleteTopicOptimistic = (topic: ExtendedTopic, index: number) => {
        setDeletedTopicBackup({ topic, index });
        const nextTopics = topics.filter((_, idx) => idx !== index);
        setTopics(nextTopics);

        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

        undoTimerRef.current = setTimeout(async () => {
            setDeletedTopicBackup(null);
            await saveTopicsToDatabase(nextTopics);
        }, 5000);
    };

    const handleUndoDeleteTopic = () => {
        if (!deletedTopicBackup) return;
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

        const restoredTopics = [...topics];
        restoredTopics.splice(deletedTopicBackup.index, 0, deletedTopicBackup.topic);

        setTopics(restoredTopics);
        setDeletedTopicBackup(null);
        addToast('Topic deletion undone!', 'info');
    };

    const handleMoveTopic = async (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= topics.length) return;

        const nextTopics = [...topics];
        const temp = nextTopics[index];
        nextTopics[index] = nextTopics[targetIndex];
        nextTopics[targetIndex] = temp;

        setTopics(nextTopics);
        await saveTopicsToDatabase(nextTopics);
    };

    const handleRenameTopic = async (topicId: string, newName: string) => {
        const nextTopics = topics.map((t) => (t.topic_id === topicId ? { ...t, topic_name: newName } : t));
        setTopics(nextTopics);
        await saveTopicsToDatabase(nextTopics);
    };

    if (isLoading) {
        return <div className="py-16 text-center text-sm font-bold text-slate-400">Loading Course Studio...</div>;
    }

    const breadcrumbItems = [
        {
            label: school.name || schoolId,
            path: `/admin/schools/${encodeURIComponent(schoolId)}`,
            icon: <Building2 className="w-3.5 h-3.5 text-amber-500" />,
        },
    ];

    if (collegeId) {
        breadcrumbItems.push({
            label: college?.name || collegeId,
            path: `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(collegeId)}`,
            icon: <GraduationCap className="w-3.5 h-3.5 text-amber-500" />,
        });
    }

    const deptPath = collegeId
        ? `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(collegeId)}/${encodeURIComponent(deptId)}`
        : `/admin/schools/${encodeURIComponent(schoolId)}/${encodeURIComponent(deptId)}`;

    breadcrumbItems.push({
        label: department.department_name || deptId,
        path: deptPath,
        icon: <BookOpen className="w-3.5 h-3.5 text-amber-500" />,
    });

    breadcrumbItems.push({
        label: course?.course_code || course?.course_name || courseId,
        path: `${deptPath}/${encodeURIComponent(courseId)}`,
        icon: <ListTree className="w-3.5 h-3.5 text-amber-500" />,
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Breadcrumb Navigation */}
            <BreadcrumbNavigation items={breadcrumbItems} onNavigate={onNavigate} />

            {/* Header */}
            <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                <div className="flex items-center gap-2 text-xs font-black text-amber-500 uppercase tracking-widest">
                    <Sparkles className="w-4 h-4" />
                    <span>Level 4 Course Studio</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                    {course?.course_code ? `${course.course_code}: ` : ''}
                    {course?.course_name || courseId}
                </h2>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Extract syllabus topics with Gemini AI or build and reorder the syllabus topic tree manually.
                </p>
            </div>

            {/* Scope Selection Modal for Material Upload */}
            {isUploadScopeModalOpen && pendingExtractedTopics && (
                <ScopeSelectionModal
                    isOpen={isUploadScopeModalOpen}
                    title="Select Scope for Material Upload"
                    description={`Choose whether extracted topics and materials should be synced globally across all ${course?.linked_departments?.length} departments offering ${course?.course_code || course?.course_name} or isolated locally.`}
                    courseCode={course?.course_code}
                    linkedDeptsCount={course?.linked_departments?.length || 1}
                    onSelectScope={async (isGlobalSync) => {
                        await saveTopicsToDatabase(pendingExtractedTopics, isGlobalSync);
                        setIsUploadScopeModalOpen(false);
                        setPendingExtractedTopics(null);
                        addToast(`Upload scope synced (${isGlobalSync ? 'Global Sync' : 'Local Override'}).`, 'success');
                    }}
                    onClose={() => {
                        setIsUploadScopeModalOpen(false);
                        setPendingExtractedTopics(null);
                    }}
                />
            )}

            {/* Dual Panel Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* PANEL A: Materials & AI Upload */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <div>
                        <h3 className="font-black text-xl text-slate-900 dark:text-white flex items-center gap-2">
                            <UploadCloud className="w-5 h-5 text-amber-500" />
                            PANEL A: Materials & AI Upload
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Drop syllabus PDFs or images to auto-populate the topic tree with AI.
                        </p>
                    </div>

                    {/* Drag & Drop Zone */}
                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragOver(true);
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleFileDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                            isDragOver
                                ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 scale-[1.01]'
                                : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    void processFileForAIExtraction(e.target.files[0]);
                                }
                            }}
                            className="hidden"
                        />
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-500 flex items-center justify-center shadow-inner">
                            <UploadCloud className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                            <p className="font-bold text-sm text-slate-900 dark:text-white">
                                Drag & drop syllabus PDF / Images
                            </p>
                            <p className="text-xs text-slate-400">Supports .pdf, .png, .jpg, .jpeg (Up to 50MB)</p>
                        </div>
                    </div>

                    {/* Multi-Stage AI Extraction Progress */}
                    {extractionStage !== 'idle' && (
                        <div className="p-5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 space-y-3 animate-in fade-in">
                            <div className="flex items-center justify-between text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                                <span className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 animate-spin text-amber-500" />
                                    {extractionStage === 'uploading' && 'Uploading File...'}
                                    {extractionStage === 'analyzing' && 'Analyzing Document Structure...'}
                                    {extractionStage === 'extracting' && 'Extracting Topics with AI...'}
                                    {extractionStage === 'populating' && 'Populating Syllabus...'}
                                    {extractionStage === 'complete' && 'Extraction Complete!'}
                                    {extractionStage === 'error' && 'Extraction Error'}
                                </span>
                                <span>{extractionProgress}%</span>
                            </div>

                            <div className="w-full h-2 rounded-full bg-amber-200/50 dark:bg-amber-900/40 overflow-hidden">
                                <div
                                    className="h-full bg-amber-500 transition-all duration-300"
                                    style={{ width: `${extractionProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Uploaded Files List */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Uploaded Reference Files ({uploadedFiles.length})
                        </h4>
                        {uploadedFiles.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No reference files uploaded yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {uploadedFiles.map((f, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs font-semibold"
                                    >
                                        <div className="flex items-center gap-2.5 overflow-hidden">
                                            <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                                            <span className="truncate text-slate-800 dark:text-slate-200">{f.name}</span>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase shrink-0">
                                            Extracted
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* PANEL B: Topic Tree & Syllabus */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="font-black text-xl text-slate-900 dark:text-white flex items-center gap-2">
                                <ListTree className="w-5 h-5 text-amber-500" />
                                PANEL B: Topic Tree & Syllabus
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {topics.length} topic{topics.length !== 1 ? 's' : ''} in syllabus tree.
                            </p>
                        </div>

                        {topics.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                                {course && (
                                    <TopicPurgeManager
                                        course={course}
                                        deptId={deptId}
                                        topics={topics}
                                        onTopicsUpdated={(newTopics) => setTopics(newTopics)}
                                    />
                                )}
                                {selectedTopicIds.size > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleBatchDeleteTopics}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-100 transition-colors border border-rose-500/30"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Delete ({selectedTopicIds.size})</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={toggleSelectAllTopics}
                                    className="text-xs font-bold text-slate-500 hover:text-amber-500 px-2 py-1 rounded-lg transition-colors"
                                >
                                    {selectedTopicIds.size === topics.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Manual Add Topic Creator */}
                    <form onSubmit={handleAddTopicManually} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            + Add Topic Manually
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={newTopicTitle}
                                onChange={(e) => setNewCourseTopicTitle(e.target.value)}
                                placeholder="Topic Title (e.g. Introduction to Stress Analysis)"
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold outline-none focus:border-amber-500 transition-all"
                            />
                            <input
                                type="text"
                                value={newEstimatedHours}
                                onChange={(e) => setNewEstimatedHours(e.target.value)}
                                placeholder="Est. Hours (e.g. 3 hrs)"
                                className="w-full sm:w-32 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold outline-none focus:border-amber-500 transition-all"
                            />
                            <button
                                type="submit"
                                disabled={!newTopicTitle.trim()}
                                className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-90 disabled:opacity-40 transition shrink-0"
                            >
                                Add
                            </button>
                        </div>
                    </form>

                    {/* Optimistic Undo Toast Notification Banner */}
                    {deletedTopicBackup && (
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
                            <span>Topic "{deletedTopicBackup.topic.topic_name}" removed.</span>
                            <button
                                type="button"
                                onClick={handleUndoDeleteTopic}
                                className="flex items-center gap-1 bg-slate-950 text-white px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-slate-900 transition"
                            >
                                <Undo2 className="w-3.5 h-3.5" />
                                <span>Undo</span>
                            </button>
                        </div>
                    )}

                    {/* Interactive Topic Tree */}
                    {topics.length === 0 ? (
                        <div className="py-12 text-center text-xs font-bold text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                            Syllabus is empty. Upload a syllabus PDF or add topics manually.
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {topics.map((t, idx) => (
                                <div
                                    key={t.topic_id || idx}
                                    className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-3 group hover:border-amber-500/50 transition-all"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2 flex-1">
                                            <input
                                                type="checkbox"
                                                checked={selectedTopicIds.has(t.topic_id)}
                                                onChange={() => toggleTopicSelection(t.topic_id)}
                                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer shrink-0"
                                            />
                                            <span className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 font-black text-xs flex items-center justify-center shrink-0">
                                                {idx + 1}
                                            </span>
                                            <InlineEditableText
                                                value={t.topic_name}
                                                onSave={(newName) => handleRenameTopic(t.topic_id, newName)}
                                                className="font-bold text-sm text-slate-900 dark:text-white"
                                            />
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleMoveTopic(idx, 'up')}
                                                disabled={idx === 0}
                                                className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 transition-colors"
                                                title="Move Up"
                                            >
                                                <MoveUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleMoveTopic(idx, 'down')}
                                                disabled={idx === topics.length - 1}
                                                className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 transition-colors"
                                                title="Move Down"
                                            >
                                                <MoveDown className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteTopicOptimistic(t, idx)}
                                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                                title="Delete Topic"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Subtopics List */}
                                    {t.subtopics && t.subtopics.length > 0 && (
                                        <div className="pl-8 space-y-1.5 border-l-2 border-slate-100 dark:border-slate-700 ml-3">
                                            {t.subtopics.map((sub, sIdx) => (
                                                <div
                                                    key={sub.topic_id || sIdx}
                                                    className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 py-1"
                                                >
                                                    <span className="flex items-center gap-1.5">
                                                        <ChevronRight className="w-3 h-3 text-slate-400" />
                                                        {sub.topic_name}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add Subtopic inline toggle */}
                                    {activeSubtopicParentId === t.topic_id ? (
                                        <div className="pl-8 flex items-center gap-2 pt-2 animate-in fade-in">
                                            <input
                                                type="text"
                                                value={newSubtopicTitle}
                                                onChange={(e) => setNewSubtopicTitle(e.target.value)}
                                                placeholder="Subtopic Title"
                                                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold outline-none focus:border-amber-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleAddSubtopic(t.topic_id)}
                                                className="px-3 py-1.5 bg-amber-500 text-slate-950 font-bold text-[11px] uppercase rounded-lg"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="pl-8 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setActiveSubtopicParentId(t.topic_id)}
                                                className="text-[11px] font-bold text-amber-500 hover:text-amber-600 flex items-center gap-1"
                                            >
                                                <Plus className="w-3 h-3" />
                                                <span>Add Subtopic</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
