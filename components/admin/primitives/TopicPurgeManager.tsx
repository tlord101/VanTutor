import React, { useState, useRef } from 'react';
import { db } from '../../../firebase';
import { ref as dbRef, get, update } from 'firebase/database';
import { Type } from '../../../utils/inference';
import { useToast } from '../../../hooks/useToast';
import { useAppSettings } from '../../../hooks/useAppSettings';
import { MergeReviewModal, SuggestedMerge } from './MergeReviewModal';
import { ScopeSelectionModal } from './ScopeSelectionModal';
import { Sparkles, Loader2, Layers } from 'lucide-react';
import type { Course, Topic } from '../../../types';

interface ExtendedTopic extends Topic {
    estimated_hours?: string;
    subtopics?: Array<{ topic_id: string; topic_name: string }>;
}

export interface TopicPurgeManagerProps {
    course: Course;
    deptId: string;
    topics: ExtendedTopic[];
    onTopicsUpdated: (newTopics: ExtendedTopic[]) => Promise<void> | void;
}

export const TopicPurgeManager: React.FC<TopicPurgeManagerProps> = ({
    course,
    deptId,
    topics,
    onTopicsUpdated,
}) => {
    const { addToast } = useToast();
    const { settings: appSettings } = useAppSettings();

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [suggestedMerges, setSuggestedMerges] = useState<SuggestedMerge[]>([]);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
    const [approvedMergesToExecute, setApprovedMergesToExecute] = useState<SuggestedMerge[]>([]);
    const [isExecutingMerge, setIsExecutingMerge] = useState(false);

    const geminiApiKey = appSettings.gemini_api_key.trim();
    const aiClient = useRef<GoogleGenAI | null>(null);

    if (geminiApiKey && !aiClient.current) {
        aiClient.current = new GoogleGenAI({ apiKey: geminiApiKey });
    }

    // Trigger AI Topic Analysis
    const handleTriggerCleanTopics = async () => {
        if (topics.length < 2) {
            addToast('At least 2 topics are required for deduplication.', 'info');
            return;
        }

        if (!aiClient.current) {
            addToast('Avelut AI API key is missing in App Controls.', 'error');
            return;
        }

        setIsAnalyzing(true);
        addToast('✨ Avelut AI is analyzing topic structure & detecting redundancies...', 'info');

        try {
            const topicListStr = topics.map((t, idx) => `${idx + 1}. ${t.topic_name}`).join('\n');
            const prompt = `Analyze this list of syllabus topics for course "${course.course_name || course.course_id}".
Find redundant, duplicate, or overlapping topics that should be merged into a single comprehensive topic.

Topic List:
${topicListStr}

Rules:
1. Identify groups of 2 or more topics that mean essentially the same thing or are direct duplicates.
2. Provide a single unified targetTopicName for each group.
3. Suggest estimatedHours (e.g. "4 hrs").
4. Output ONLY valid JSON:
{
  "merges": [
    {
      "targetTopicName": "Buckling & Stress Analysis",
      "originalTopics": ["Buckling", "Buckling and stress"],
      "estimatedHours": "4 hrs"
    }
  ]
}`;

            const modelName = appSettings.alibaba_model || appSettings.primary_gemini_model || 'qwen-plus';
            const response = await aiClient.current.models.generateContent({
                model: modelName,
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }],
                    },
                ],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            merges: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        targetTopicName: { type: Type.STRING },
                                        originalTopics: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING },
                                        },
                                        estimatedHours: { type: Type.STRING },
                                    },
                                    required: ['targetTopicName', 'originalTopics'],
                                },
                            },
                        },
                        required: ['merges'],
                    },
                },
            });

            const responseText = (response as any).text || '';
            const parsed = JSON.parse(responseText);
            const mergesRaw = Array.isArray(parsed.merges) ? parsed.merges : [];

            const formattedMerges: SuggestedMerge[] = mergesRaw.map((m: any, idx: number) => ({
                id: `merge_${idx}_${Date.now()}`,
                targetTopicName: m.targetTopicName || 'Merged Topic',
                originalTopics: Array.isArray(m.originalTopics) ? m.originalTopics : [],
                estimatedHours: m.estimatedHours || '3 hrs',
            })).filter((m) => m.originalTopics.length >= 2);

            setSuggestedMerges(formattedMerges);
            setIsMergeModalOpen(true);

            if (formattedMerges.length === 0) {
                addToast('No redundant topics found in syllabus!', 'success');
            } else {
                addToast(`AI found ${formattedMerges.length} potential merge suggestion(s).`, 'success');
            }
        } catch (error: any) {
            console.error('Error analyzing topics with Gemini AI:', error);
            addToast('AI topic analysis failed: ' + error.message, 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Confirm Merges in Review Modal -> Pre-Merge Scope Check
    const handleConfirmMergesInReview = (approvedMerges: SuggestedMerge[]) => {
        if (approvedMerges.length === 0) {
            setIsMergeModalOpen(false);
            return;
        }

        setApprovedMergesToExecute(approvedMerges);
        setIsMergeModalOpen(false);
        setIsScopeModalOpen(true);
    };

    // Execute Batched RTDB Merge
    const handleExecuteScopeMerge = async (isGlobalSync: boolean) => {
        setIsExecutingMerge(true);

        try {
            // Build map of original topic names to replace
            const originalToTargetMap = new Map<string, SuggestedMerge>();
            approvedMergesToExecute.forEach((m) => {
                m.originalTopics.forEach((orig) => {
                    originalToTargetMap.set(orig.trim().toLowerCase(), m);
                });
            });

            // Re-process current topic list
            const processedTopics: ExtendedTopic[] = [];
            const addedMergeIds = new Set<string>();

            for (const t of topics) {
                const normName = t.topic_name.trim().toLowerCase();
                const mergeObj = originalToTargetMap.get(normName);

                if (mergeObj) {
                    if (!addedMergeIds.has(mergeObj.id)) {
                        addedMergeIds.add(mergeObj.id);
                        const newId = mergeObj.targetTopicName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '');
                        processedTopics.push({
                            topic_id: newId,
                            topic_name: mergeObj.targetTopicName,
                            topic_context: mergeObj.targetTopicName,
                            estimated_hours: mergeObj.estimatedHours || '3 hrs',
                            subtopics: t.subtopics || [],
                        });
                    }
                } else {
                    processedTopics.push(t);
                }
            }

            const updates: Record<string, any> = {};
            const linkedDepts = course.linked_departments && course.linked_departments.length > 0
                ? course.linked_departments
                : [deptId];

            if (isGlobalSync) {
                // Multi-path update across all linked departments AND global_courses
                for (const dId of linkedDepts) {
                    const deptSnap = await get(dbRef(db, `departments_data/${dId}`));
                    if (deptSnap.exists()) {
                        const data = deptSnap.val();
                        const rawList = data?.course_list;
                        let list: Course[] = Array.isArray(rawList) ? rawList : Object.values(rawList || {});

                        const updatedList = list.map((c) => {
                            if (c.course_id === course.course_id) {
                                return { ...c, topics: processedTopics };
                            }
                            return c;
                        });

                        updates[`departments_data/${dId}/course_list`] = updatedList;
                    }
                }

                // Update global master document
                updates[`global_courses/${course.course_id}/topics`] = processedTopics;
            } else {
                // Local override only
                const deptSnap = await get(dbRef(db, `departments_data/${deptId}`));
                if (deptSnap.exists()) {
                    const data = deptSnap.val();
                    const rawList = data?.course_list;
                    let list: Course[] = Array.isArray(rawList) ? rawList : Object.values(rawList || {});

                    const updatedList = list.map((c) => {
                        if (c.course_id === course.course_id) {
                            return { ...c, topics: processedTopics };
                        }
                        return c;
                    });

                    updates[`departments_data/${deptId}/course_list`] = updatedList;
                }
            }

            await update(dbRef(db), updates);

            await onTopicsUpdated(processedTopics);
            addToast(`Successfully merged topics (${isGlobalSync ? 'Global Sync' : 'Local Override'})!`, 'success');
            setIsScopeModalOpen(false);
            setApprovedMergesToExecute([]);
        } catch (error: any) {
            console.error('Error executing topic merge:', error);
            addToast('Failed to execute topic merge: ' + error.message, 'error');
        } finally {
            setIsExecutingMerge(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={handleTriggerCleanTopics}
                disabled={isAnalyzing || topics.length < 2}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-50"
            >
                {isAnalyzing ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Analyzing Topics...</span>
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4 text-slate-950" />
                        <span>✨ Clean Topics</span>
                    </>
                )}
            </button>

            {/* Shimmering Skeleton Loader overlay when analyzing */}
            {isAnalyzing && (
                <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 space-y-3 animate-pulse">
                    <div className="flex items-center justify-between">
                        <div className="h-4 w-1/3 bg-amber-200 dark:bg-amber-900/60 rounded-lg"></div>
                        <div className="h-4 w-12 bg-amber-200 dark:bg-amber-900/60 rounded-lg"></div>
                    </div>
                    <div className="space-y-2">
                        <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                        <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                    </div>
                </div>
            )}

            {/* Merge Review Modal */}
            <MergeReviewModal
                isOpen={isMergeModalOpen}
                onClose={() => setIsMergeModalOpen(false)}
                suggestedMerges={suggestedMerges}
                onConfirmMerges={handleConfirmMergesInReview}
            />

            {/* Scope Selection Modal */}
            <ScopeSelectionModal
                isOpen={isScopeModalOpen}
                title="Confirm Merge Scope"
                description={`Choose whether to apply topic merge across all departments offering ${course.course_code || course.course_name} or isolate locally.`}
                courseCode={course.course_code}
                linkedDeptsCount={course.linked_departments?.length || 1}
                isProcessing={isExecutingMerge}
                onSelectScope={handleExecuteScopeMerge}
                onClose={() => setIsScopeModalOpen(false)}
            />
        </>
    );
};
