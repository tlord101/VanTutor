/**
 * spacedReviewService.ts — Dimension-Aware Spaced Repetition (SM-2 Algorithm)
 *
 * Implements SuperMemo SM-2 spaced repetition with dimensional targeting:
 * When scheduling reviews, we snapshot student dimensional mastery so subsequent
 * retrieval sessions can target the specific weakest dimension (e.g. transfer vs procedure).
 */

import { readCachedJson, writeCachedJson } from '../utils/cache';
import { runQuery, runStatement } from '../lib/sqlite/sqliteService';
import type { DimensionalMastery } from './masteryModel';

export interface SpacedReviewItem {
    id: string; // vt_review_<uid>_<topicId>_<conceptName>
    userId: string;
    courseId: string;
    courseName: string;
    topicId: string;
    topicName: string;
    conceptName: string;
    intervalDays: number;
    repetitions: number;
    easeFactor: number;
    nextReviewTimestamp: number;
    lastReviewedTimestamp: number;
    weakestDimension: 'conceptualUnderstanding' | 'proceduralFluency' | 'transferAbility' | 'retrievalStrength';
    retrievalPrompts: string[];
}

export function calculateInitialReview(
    userId: string,
    courseId: string,
    courseName: string,
    topicId: string,
    topicName: string,
    conceptName: string,
    mastery: DimensionalMastery,
    retrievalPrompts: string[]
): SpacedReviewItem {
    // Find weakest dimension to target in future reviews
    const dims: { key: SpacedReviewItem['weakestDimension']; val: number }[] = [
        { key: 'conceptualUnderstanding', val: mastery.conceptualUnderstanding },
        { key: 'proceduralFluency', val: mastery.proceduralFluency },
        { key: 'transferAbility', val: mastery.transferAbility },
        { key: 'retrievalStrength', val: mastery.retrievalStrength },
    ];
    dims.sort((a, b) => a.val - b.val);
    const weakestDimension = dims[0]?.key || 'conceptualUnderstanding';

    const now = Date.now();
    const intervalDays = 1; // Initial review in 24 hours
    const nextReviewTimestamp = now + intervalDays * 24 * 60 * 60 * 1000;

    return {
        id: `vt_review_${userId}_${topicId}_${encodeURIComponent(conceptName)}`,
        userId,
        courseId,
        courseName,
        topicId,
        topicName,
        conceptName,
        intervalDays,
        repetitions: 1,
        easeFactor: 2.5,
        nextReviewTimestamp,
        lastReviewedTimestamp: now,
        weakestDimension,
        retrievalPrompts: retrievalPrompts.length > 0 ? retrievalPrompts : [`Explain the core mechanism of ${conceptName}.`],
    };
}

/**
 * Updates SM-2 review schedule after a retrieval check.
 * Quality rating: 0 (total blackout) to 5 (flawless recall)
 */
export function updateReviewScheduleSM2(
    item: SpacedReviewItem,
    qualityRating: number, // 0..5
    updatedMastery?: DimensionalMastery
): SpacedReviewItem {
    const q = Math.max(0, Math.min(5, Math.round(qualityRating)));
    let { repetitions, intervalDays, easeFactor } = item;

    if (q >= 3) {
        // Success
        if (repetitions === 0) {
            intervalDays = 1;
        } else if (repetitions === 1) {
            intervalDays = 3;
        } else {
            intervalDays = Math.round(intervalDays * easeFactor);
        }
        repetitions += 1;
    } else {
        // Failure / Forgotten -> reset interval to 1 day for reinforcement
        repetitions = 0;
        intervalDays = 1;
    }

    // Update Ease Factor (standard SM-2 formula)
    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const now = Date.now();
    const nextReviewTimestamp = now + intervalDays * 24 * 60 * 60 * 1000;

    let weakestDimension = item.weakestDimension;
    if (updatedMastery) {
        const dims: { key: SpacedReviewItem['weakestDimension']; val: number }[] = [
            { key: 'conceptualUnderstanding', val: updatedMastery.conceptualUnderstanding },
            { key: 'proceduralFluency', val: updatedMastery.proceduralFluency },
            { key: 'transferAbility', val: updatedMastery.transferAbility },
            { key: 'retrievalStrength', val: updatedMastery.retrievalStrength },
        ];
        dims.sort((a, b) => a.val - b.val);
        weakestDimension = dims[0]?.key || weakestDimension;
    }

    return {
        ...item,
        repetitions,
        intervalDays,
        easeFactor,
        lastReviewedTimestamp: now,
        nextReviewTimestamp,
        weakestDimension,
    };
}

/**
 * Saves a review item to cache and SQLite.
 */
export async function saveSpacedReviewItem(item: SpacedReviewItem): Promise<void> {
    if (!item?.userId) return;
    const cacheKey = `vt_spaced_reviews_${item.userId}`;
    const existing = readCachedJson<SpacedReviewItem[]>(cacheKey, []) || [];
    const filtered = existing.filter(r => r.id !== item.id);
    filtered.push(item);
    await writeCachedJson(cacheKey, filtered, item.userId);

    // Save to SQLite
    try {
        const sql = `
            INSERT OR REPLACE INTO spaced_reviews (
                id, user_id, course_id, course_name, topic_id, topic_name, concept_name,
                interval_days, repetitions, ease_factor, next_review_ts, last_reviewed_ts,
                weakest_dimension, prompts_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await runStatement(sql, [
            item.id,
            item.userId,
            item.courseId,
            item.courseName,
            item.topicId,
            item.topicName,
            item.conceptName,
            item.intervalDays,
            item.repetitions,
            item.easeFactor,
            item.nextReviewTimestamp,
            item.lastReviewedTimestamp,
            item.weakestDimension,
            JSON.stringify(item.retrievalPrompts),
        ]);
    } catch (err) {
        // SQLite table might not exist yet; gracefully fallback to cache
    }
}

/**
 * Returns all reviews currently due (nextReviewTimestamp <= now).
 */
export async function getDueSpacedReviews(userId: string): Promise<SpacedReviewItem[]> {
    if (!userId) return [];
    const now = Date.now();
    const cacheKey = `vt_spaced_reviews_${userId}`;
    const cached = readCachedJson<SpacedReviewItem[]>(cacheKey, []) || [];
    
    // Check SQLite
    try {
        const sql = `SELECT * FROM spaced_reviews WHERE user_id = ? AND next_review_ts <= ? ORDER BY next_review_ts ASC`;
        const rows = await runQuery<any>(sql, [userId, now]);
        if (rows && rows.length > 0) {
            return rows.map(r => ({
                id: r.id,
                userId: r.user_id,
                courseId: r.course_id,
                courseName: r.course_name,
                topicId: r.topic_id,
                topicName: r.topic_name,
                conceptName: r.concept_name,
                intervalDays: r.interval_days,
                repetitions: r.repetitions,
                easeFactor: r.ease_factor,
                nextReviewTimestamp: r.next_review_ts,
                lastReviewedTimestamp: r.last_reviewed_ts,
                weakestDimension: r.weakest_dimension,
                retrievalPrompts: r.prompts_json ? JSON.parse(r.prompts_json) : [],
            }));
        }
    } catch (_) {}

    return cached.filter(r => r.nextReviewTimestamp <= now);
}

/**
 * Convenience helper to calculate and save a spaced review item.
 */
export async function scheduleSpacedReviewItem(
    userId: string,
    courseId: string,
    topicId: string,
    conceptName: string,
    mastery: DimensionalMastery,
    qualityRating: number = 4
): Promise<void> {
    const item = calculateInitialReview(
        userId,
        courseId,
        'Course',
        topicId,
        'Topic',
        conceptName,
        mastery,
        [`Explain the core physical mechanism of ${conceptName}.`]
    );
    const updated = updateReviewScheduleSM2(item, qualityRating, mastery);
    await saveSpacedReviewItem(updated);
}
