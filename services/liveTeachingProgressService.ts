/**
 * Persist live teaching engine progress so long lessons (esp. 60 min) can resume.
 */
import { readCachedJson, writeCachedJson } from '../utils/cache';
import type { LessonDurationMode } from '../components/tutorial/LessonDurationModal';
import type { TeachingStructure, TeachingBoardPerformance } from '../types/teachingScript';

export interface LiveTeachingProgress {
  topicKey: string;
  topicTitle: string;
  courseName?: string;
  durationMode: LessonDurationMode;
  boardIndex: number;
  totalBoards: number;
  chapterTitle?: string;
  structure?: TeachingStructure | null;
  lastBoardTitle?: string;
  isCompleted: boolean;
  updatedAt: number;
}

function progressKey(userId: string, topicKey: string): string {
  return `live_teach_progress_v1_${userId || 'anon'}_${topicKey}`;
}

function structureKey(userId: string, topicKey: string, mode: LessonDurationMode): string {
  return `live_teach_structure_v1_${userId || 'anon'}_${topicKey}_${mode}`;
}

export function topicKeyFromTitle(topicTitle: string, courseName?: string): string {
  const raw = `${courseName || ''}_${topicTitle}`;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 80);
}

export async function saveLiveTeachingProgress(
  userId: string,
  progress: Omit<LiveTeachingProgress, 'updatedAt'>
): Promise<void> {
  const payload: LiveTeachingProgress = { ...progress, updatedAt: Date.now() };
  await writeCachedJson(progressKey(userId, progress.topicKey), payload, userId || 'anon');
  if (progress.structure) {
    await writeCachedJson(
      structureKey(userId, progress.topicKey, progress.durationMode),
      progress.structure,
      userId || 'anon'
    );
  }
}

export function getLiveTeachingProgress(
  userId: string,
  topicKey: string
): LiveTeachingProgress | null {
  return readCachedJson<LiveTeachingProgress | null>(progressKey(userId, topicKey), null);
}

export function getSavedTeachingStructure(
  userId: string,
  topicKey: string,
  mode: LessonDurationMode
): TeachingStructure | null {
  return readCachedJson<TeachingStructure | null>(structureKey(userId, topicKey, mode), null);
}

export function formatResumeLabel(p: LiveTeachingProgress): string {
  const part = p.chapterTitle ? `${p.chapterTitle} · ` : '';
  return `${part}Board ${p.boardIndex + 1}/${p.totalBoards} · ${p.durationMode} min mode`;
}
