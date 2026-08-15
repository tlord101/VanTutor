import { runQuery, runStatement } from '../lib/sqlite/sqliteService';
import { Question } from '../types';
import { saveLocalAppState, getLocalAppState } from './chatStorageService';

export interface LocalPQRow {
  id: string;
  user_id: string | null;
  department_id: string;
  level: string;
  course_id: string;
  year: string;
  questions_json: string;
  updated_at: number;
}

/**
 * Generate standard composite key for a past question set.
 */
export function getPQStorageKey(departmentId: string, level: string, courseId: string, year: string): string {
  return `${departmentId}_${level}_${courseId}_${year}`.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Save past questions for a course and year locally in SQLite for offline test taking.
 */
export async function saveLocalPastQuestions(
  userId: string,
  departmentId: string,
  level: string,
  courseId: string,
  year: string,
  questions: Question[]
): Promise<void> {
  if (!departmentId || !level || !courseId || !year || !questions.length) return;
  const id = getPQStorageKey(departmentId, level, courseId, year);
  const now = Date.now();
  const questionsJson = JSON.stringify(questions);

  const sql = `
    INSERT OR REPLACE INTO past_questions (id, user_id, department_id, level, course_id, year, questions_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await runStatement(sql, [
    id,
    userId || null,
    departmentId,
    level,
    courseId,
    year,
    questionsJson,
    now
  ]);
}

/**
 * Retrieve cached past questions for a course and year from SQLite.
 */
export async function getLocalPastQuestions(
  departmentId: string,
  level: string,
  courseId: string,
  year: string
): Promise<Question[]> {
  const id = getPQStorageKey(departmentId, level, courseId, year);
  const sql = `
    SELECT id, user_id, department_id, level, course_id, year, questions_json, updated_at
    FROM past_questions
    WHERE id = ?
    LIMIT 1
  `;
  const rows = await runQuery<LocalPQRow>(sql, [id]);
  if (rows.length === 0 || !rows[0].questions_json) return [];
  try {
    return JSON.parse(rows[0].questions_json) as Question[];
  } catch {
    return [];
  }
}

/**
 * Cache list of available PQ subjects and year listings in SQLite.
 */
export async function saveLocalPQSubjects(
  departmentId: string,
  level: string,
  subjects: string[],
  years: { year: string; course_id: string; course_name: string }[]
): Promise<void> {
  const subjectsKey = `pq_subjects_${departmentId}_${level}`.toLowerCase().replace(/\s+/g, '_');
  const yearsKey = `pq_years_${departmentId}_${level}`.toLowerCase().replace(/\s+/g, '_');
  await saveLocalAppState(subjectsKey, 'system', 'pq_meta', subjects);
  await saveLocalAppState(yearsKey, 'system', 'pq_meta', years);
}

/**
 * Get cached PQ subjects & years for offline dropdown selection.
 */
export async function getLocalPQSubjects(
  departmentId: string,
  level: string
): Promise<{ subjects: string[]; years: { year: string; course_id: string; course_name: string }[] }> {
  const subjectsKey = `pq_subjects_${departmentId}_${level}`.toLowerCase().replace(/\s+/g, '_');
  const yearsKey = `pq_years_${departmentId}_${level}`.toLowerCase().replace(/\s+/g, '_');
  const subjects = await getLocalAppState<string[]>(subjectsKey, []);
  const years = await getLocalAppState<{ year: string; course_id: string; course_name: string }[]>(yearsKey, []);
  return { subjects, years };
}
