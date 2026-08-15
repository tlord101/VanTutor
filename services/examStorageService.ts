import { runQuery, runStatement } from '../lib/sqlite/sqliteService';
import { enqueueSyncAction, generateLocalId } from './chatStorageService';
import { ExamHistoryItem } from '../types';

export interface LocalExamRow {
  id: string;
  user_id: string;
  department_id: string;
  exam_type: 'objective' | 'theory';
  score: number;
  total_questions: number;
  questions_json: string;
  timestamp: number;
  sync_status: 'synced' | 'pending' | 'syncing' | 'error';
  is_deleted: number;
}

function mapRowToExam(row: LocalExamRow): ExamHistoryItem {
  let questions: any[] = [];
  try {
    questions = JSON.parse(row.questions_json || '[]');
  } catch {
    questions = [];
  }
  return {
    id: row.id,
    user_id: row.user_id,
    department_id: row.department_id || '',
    examType: row.exam_type || 'objective',
    score: row.score || 0,
    total_questions: row.total_questions || questions.length,
    timestamp: row.timestamp,
    questions,
  };
}

/**
 * Save an exam to SQLite per user for instant offline persistence and enqueue for sync.
 */
export async function saveLocalExam(
  userId: string,
  exam: Omit<ExamHistoryItem, 'id'> & { id?: string },
  enqueueSync: boolean = true
): Promise<string> {
  if (!userId) return '';
  const examId = exam.id || generateLocalId('exam');
  const now = exam.timestamp || Date.now();
  const questionsJson = JSON.stringify(exam.questions || []);
  const syncStatus = enqueueSync ? 'pending' : 'synced';

  const sql = `
    INSERT OR REPLACE INTO exams (id, user_id, department_id, exam_type, score, total_questions, questions_json, timestamp, sync_status, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `;

  await runStatement(sql, [
    examId,
    userId,
    exam.department_id || '',
    exam.examType || 'objective',
    exam.score || 0,
    exam.total_questions || (exam.questions ? exam.questions.length : 0),
    questionsJson,
    now,
    syncStatus,
  ]);

  if (enqueueSync) {
    await enqueueSyncAction('exam', examId, 'create', {
      id: examId,
      user_id: userId,
      department_id: exam.department_id || '',
      examType: exam.examType || 'objective',
      score: exam.score || 0,
      total_questions: exam.total_questions || (exam.questions ? exam.questions.length : 0),
      timestamp: now,
      questions: exam.questions || [],
    });
  }

  return examId;
}

/**
 * Fetch all exams for a specific user from SQLite in reverse chronological order.
 */
export async function getLocalExams(userId: string): Promise<ExamHistoryItem[]> {
  if (!userId) return [];
  const sql = `
    SELECT id, user_id, department_id, exam_type, score, total_questions, questions_json, timestamp, sync_status, is_deleted
    FROM exams
    WHERE user_id = ? AND is_deleted = 0
    ORDER BY timestamp DESC
  `;
  const rows = await runQuery<LocalExamRow>(sql, [userId]);
  return rows.map(mapRowToExam);
}

/**
 * Fetch a single exam by ID.
 */
export async function getLocalExamById(examId: string): Promise<ExamHistoryItem | null> {
  if (!examId) return null;
  const sql = `
    SELECT id, user_id, department_id, exam_type, score, total_questions, questions_json, timestamp, sync_status, is_deleted
    FROM exams
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `;
  const rows = await runQuery<LocalExamRow>(sql, [examId]);
  if (rows.length === 0) return null;
  return mapRowToExam(rows[0]);
}

/**
 * Soft delete an exam from SQLite.
 */
export async function deleteLocalExam(examId: string, userId: string): Promise<void> {
  if (!examId) return;
  await runStatement(`UPDATE exams SET is_deleted = 1, sync_status = 'pending' WHERE id = ?`, [examId]);
  await enqueueSyncAction('exam', examId, 'delete', { id: examId, user_id: userId });
}

/**
 * Bulk upsert remote exams pulled from Firebase into local SQLite.
 */
export async function bulkUpsertRemoteExams(userId: string, exams: ExamHistoryItem[]): Promise<void> {
  if (!userId || !exams.length) return;
  for (const exam of exams) {
    if (!exam.id) continue;
    const questionsJson = JSON.stringify(exam.questions || []);
    const sql = `
      INSERT INTO exams (id, user_id, department_id, exam_type, score, total_questions, questions_json, timestamp, sync_status, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', 0)
      ON CONFLICT(id) DO UPDATE SET
        score = excluded.score,
        total_questions = excluded.total_questions,
        questions_json = excluded.questions_json,
        timestamp = excluded.timestamp,
        sync_status = 'synced'
    `;
    await runStatement(sql, [
      exam.id,
      userId,
      exam.department_id || '',
      exam.examType || 'objective',
      exam.score || 0,
      exam.total_questions || (exam.questions ? exam.questions.length : 0),
      questionsJson,
      exam.timestamp || Date.now(),
    ]);
  }
}
