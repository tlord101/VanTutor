import { runQuery, runStatement } from '../lib/sqlite/sqliteService';
import { readCachedJson, writeCachedJson } from '../utils/cache';

export interface LocalVoiceTutorialRecord {
  id: string;
  user_id: string;
  course_id: string;
  topic_id: string;
  concept_idx: number;
  sub_step: string;
  is_completed: number;
  blueprint_json: string;
  updated_at: number;
  sync_status?: string;
}

/**
 * Generate primary key ID for local SQLite voice tutorial record.
 */
function getRecordId(userId: string, courseId: string, topicId: string): string {
  return `vt_${userId}_${courseId}_${topicId}`;
}

/**
 * Saves current Voice Tutorial progress & blueprint to local SQLite and instant local cache.
 */
export async function saveLocalVoiceTutorialProgress(
  userId: string,
  courseId: string,
  topicId: string,
  conceptIdx: number,
  subStep: string,
  isCompleted: boolean,
  blueprint: any
): Promise<void> {
  const uid = userId || 'anon';
  const cid = courseId || 'general';
  const tid = topicId || 'core';
  const id = getRecordId(uid, cid, tid);
  const blueprintJson = typeof blueprint === 'string' ? blueprint : JSON.stringify(blueprint || {});
  const now = Date.now();
  const completedFlag = isCompleted ? 1 : 0;

  // 1. Instant synchronous local cache write
  const bpKey = `vt_blueprint_v6_${uid}_${cid}_${tid}`;
  const prKey = `vt_progress_v6_${uid}_${cid}_${tid}`;
  await writeCachedJson(bpKey, typeof blueprint === 'object' ? blueprint : JSON.parse(blueprintJson || '{}'), uid);
  await writeCachedJson(prKey, { conceptIdx, subStep, isCompleted }, uid);

  // 2. Persistent SQLite write
  try {
    const sql = `
      INSERT OR REPLACE INTO voice_tutorials (
        id, user_id, course_id, topic_id, concept_idx, sub_step, is_completed, blueprint_json, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await runStatement(sql, [
      id,
      uid,
      cid,
      tid,
      conceptIdx,
      subStep,
      completedFlag,
      blueprintJson,
      now,
      'synced'
    ]);
  } catch (err) {
    console.warn('[SQLite] Error saving voice tutorial to database:', err);
  }
}

/**
 * Retrieves saved Voice Tutorial progress and blueprint from local SQLite (or cache fallback).
 */
export async function getLocalVoiceTutorialProgress(
  userId: string,
  courseId: string,
  topicId: string
): Promise<{
  conceptIdx: number;
  subStep: string;
  isCompleted: boolean;
  blueprint: any | null;
} | null> {
  const uid = userId || 'anon';
  const cid = courseId || 'general';
  const tid = topicId || 'core';

  // 1. Try SQLite
  try {
    const sql = `
      SELECT id, user_id, course_id, topic_id, concept_idx, sub_step, is_completed, blueprint_json, updated_at
      FROM voice_tutorials
      WHERE user_id = ? AND course_id = ? AND topic_id = ?
      LIMIT 1
    `;
    const rows = await runQuery<LocalVoiceTutorialRecord>(sql, [uid, cid, tid]);
    if (rows && rows.length > 0) {
      const row = rows[0];
      let bp: any = null;
      try {
        bp = row.blueprint_json ? JSON.parse(row.blueprint_json) : null;
      } catch (_) {
        bp = null;
      }

      return {
        conceptIdx: row.concept_idx ?? 0,
        subStep: row.sub_step || 'definition',
        isCompleted: row.is_completed === 1,
        blueprint: bp,
      };
    }
  } catch (err) {
    console.warn('[SQLite] Error reading voice tutorial progress:', err);
  }

  // 2. Fallback to cache
  const bpKey = `vt_blueprint_v6_${uid}_${cid}_${tid}`;
  const prKey = `vt_progress_v6_${uid}_${cid}_${tid}`;
  const cachedBp = readCachedJson<any | null>(bpKey, null);
  const cachedPr = readCachedJson<{ conceptIdx: number; subStep: string; isCompleted?: boolean } | null>(prKey, null);

  if (cachedBp) {
    return {
      conceptIdx: cachedPr?.conceptIdx ?? 0,
      subStep: cachedPr?.subStep || 'definition',
      isCompleted: cachedPr?.isCompleted || false,
      blueprint: cachedBp,
    };
  }

  return null;
}
