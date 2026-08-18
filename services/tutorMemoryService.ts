import { readCachedJson, writeCachedJson } from '../utils/cache';

export interface StudentTopicMemory {
    topicId: string;
    topicName: string;
    courseName: string;
    lastVisited: number;
    masteredConcepts: string[];
    struggledConcepts: string[];
    commonPitfalls: string[];
    notes: string[];
}

export interface StudentCognitiveProfile {
    uid: string;
    lastTopicTaught?: {
        topicId: string;
        topicName: string;
        courseName: string;
        summary: string;
        struggledKeyPoints: string[];
        timestamp: number;
    };
    overallMasteries: string[];
    overallWeakPoints: string[];
    preferredPacing: 'fast' | 'detailed_step_by_step' | 'visual_first';
    totalSessionsCompleted: number;
    topics: Record<string, StudentTopicMemory>;
}

const DEFAULT_PROFILE = (uid: string): StudentCognitiveProfile => ({
    uid,
    overallMasteries: [],
    overallWeakPoints: [],
    preferredPacing: 'detailed_step_by_step',
    totalSessionsCompleted: 0,
    topics: {},
});

/**
 * Loads the student's persistent cognitive memory profile.
 */
export async function getStudentCognitiveProfile(uid: string): Promise<StudentCognitiveProfile> {
    if (!uid) return DEFAULT_PROFILE('anon');
    const key = `avelut_tutor_cognitive_memory_${uid}`;
    const cached = readCachedJson<StudentCognitiveProfile>(key, DEFAULT_PROFILE(uid));
    if (cached && cached.uid) {
        return cached;
    }
    return DEFAULT_PROFILE(uid);
}

/**
 * Saves the updated student cognitive memory profile to local cache & persistent storage.
 */
export async function saveStudentCognitiveProfile(profile: StudentCognitiveProfile): Promise<void> {
    if (!profile || !profile.uid) return;
    const key = `avelut_tutor_cognitive_memory_${profile.uid}`;
    await writeCachedJson(key, profile, profile.uid);
}

/**
 * Records a student struggling with or mastering a specific concept.
 */
export async function recordConceptProgress(
    uid: string,
    topicId: string,
    topicName: string,
    courseName: string,
    conceptName: string,
    isMastered: boolean,
    struggledDetail?: string
): Promise<void> {
    const profile = await getStudentCognitiveProfile(uid);
    if (!profile.topics[topicId]) {
        profile.topics[topicId] = {
            topicId,
            topicName,
            courseName,
            lastVisited: Date.now(),
            masteredConcepts: [],
            struggledConcepts: [],
            commonPitfalls: [],
            notes: [],
        };
    }

    const tMem = profile.topics[topicId];
    tMem.lastVisited = Date.now();

    if (isMastered) {
        if (!tMem.masteredConcepts.includes(conceptName)) {
            tMem.masteredConcepts.push(conceptName);
        }
        tMem.struggledConcepts = tMem.struggledConcepts.filter(c => c !== conceptName);
        if (!profile.overallMasteries.includes(conceptName)) {
            profile.overallMasteries.push(conceptName);
        }
        profile.overallWeakPoints = profile.overallWeakPoints.filter(c => c !== conceptName);
    } else {
        if (!tMem.struggledConcepts.includes(conceptName)) {
            tMem.struggledConcepts.push(conceptName);
        }
        if (struggledDetail && !tMem.commonPitfalls.includes(struggledDetail)) {
            tMem.commonPitfalls.push(struggledDetail);
        }
        if (!profile.overallWeakPoints.includes(conceptName)) {
            profile.overallWeakPoints.push(conceptName);
        }
    }

    await saveStudentCognitiveProfile(profile);
}

/**
 * Records the completion of a tutoring session to maintain warm continuity across lessons.
 */
export async function recordSessionCompletion(
    uid: string,
    topicId: string,
    topicName: string,
    courseName: string,
    summary: string,
    struggledPoints: string[]
): Promise<void> {
    const profile = await getStudentCognitiveProfile(uid);
    profile.totalSessionsCompleted += 1;
    profile.lastTopicTaught = {
        topicId,
        topicName,
        courseName,
        summary,
        struggledKeyPoints: struggledPoints,
        timestamp: Date.now(),
    };
    await saveStudentCognitiveProfile(profile);
}
