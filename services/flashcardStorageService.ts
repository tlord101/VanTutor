import { runQuery, runStatement } from '../lib/sqlite/sqliteService';
import { enqueueSyncAction, generateLocalId } from './chatStorageService';

export interface FlashcardCard {
  front: string;
  back: string;
}

export interface FlashcardDeck {
  id: string;
  user_id: string;
  title: string;
  course_id?: string;
  department_id?: string;
  level?: string;
  cards: FlashcardCard[];
  created_at: number;
  sync_status?: 'synced' | 'pending' | 'syncing' | 'error';
}

export interface LocalFlashcardRow {
  id: string;
  user_id: string;
  title: string;
  course_id: string | null;
  department_id: string | null;
  level: string | null;
  cards_json: string;
  created_at: number;
  sync_status: 'synced' | 'pending' | 'syncing' | 'error';
  is_deleted: number;
}

function mapRowToDeck(row: LocalFlashcardRow): FlashcardDeck {
  let cards: FlashcardCard[] = [];
  try {
    cards = JSON.parse(row.cards_json || '[]');
  } catch {
    cards = [];
  }
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    course_id: row.course_id || undefined,
    department_id: row.department_id || undefined,
    level: row.level || undefined,
    cards,
    created_at: row.created_at,
    sync_status: row.sync_status,
  };
}

/**
 * Save a flashcard deck locally in SQLite per user and enqueue for sync.
 */
export async function saveLocalFlashcardDeck(
  userId: string,
  deck: {
    id?: string;
    title: string;
    course_id?: string;
    department_id?: string;
    level?: string;
    cards: FlashcardCard[];
    created_at?: number;
  },
  enqueueSync: boolean = true
): Promise<string> {
  if (!userId) return '';
  const deckId = deck.id || generateLocalId('fc');
  const now = deck.created_at || Date.now();
  const cardsJson = JSON.stringify(deck.cards || []);
  const syncStatus = enqueueSync ? 'pending' : 'synced';

  const sql = `
    INSERT OR REPLACE INTO flashcards (id, user_id, title, course_id, department_id, level, cards_json, created_at, sync_status, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `;

  await runStatement(sql, [
    deckId,
    userId,
    deck.title,
    deck.course_id || null,
    deck.department_id || null,
    deck.level || null,
    cardsJson,
    now,
    syncStatus,
  ]);

  if (enqueueSync) {
    await enqueueSyncAction('flashcard', deckId, 'create', {
      id: deckId,
      user_id: userId,
      title: deck.title,
      course_id: deck.course_id || null,
      department_id: deck.department_id || null,
      level: deck.level || null,
      cards: deck.cards || [],
      created_at: now,
    });
  }

  return deckId;
}

/**
 * Get all flashcard decks for a user from SQLite.
 */
export async function getLocalFlashcardDecks(userId: string): Promise<FlashcardDeck[]> {
  if (!userId) return [];
  const sql = `
    SELECT id, user_id, title, course_id, department_id, level, cards_json, created_at, sync_status, is_deleted
    FROM flashcards
    WHERE user_id = ? AND is_deleted = 0
    ORDER BY created_at DESC
  `;
  const rows = await runQuery<LocalFlashcardRow>(sql, [userId]);
  return rows.map(mapRowToDeck);
}

/**
 * Get a specific flashcard deck by ID.
 */
export async function getLocalFlashcardDeckById(deckId: string): Promise<FlashcardDeck | null> {
  if (!deckId) return null;
  const sql = `
    SELECT id, user_id, title, course_id, department_id, level, cards_json, created_at, sync_status, is_deleted
    FROM flashcards
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `;
  const rows = await runQuery<LocalFlashcardRow>(sql, [deckId]);
  if (rows.length === 0) return null;
  return mapRowToDeck(rows[0]);
}

/**
 * Soft delete a flashcard deck.
 */
export async function deleteLocalFlashcardDeck(deckId: string, userId: string): Promise<void> {
  if (!deckId) return;
  await runStatement(`UPDATE flashcards SET is_deleted = 1, sync_status = 'pending' WHERE id = ?`, [deckId]);
  await enqueueSyncAction('flashcard', deckId, 'delete', { id: deckId, user_id: userId });
}

/**
 * Bulk upsert remote flashcards down to local SQLite.
 */
export async function bulkUpsertRemoteFlashcards(userId: string, decks: FlashcardDeck[]): Promise<void> {
  if (!userId || !decks.length) return;
  for (const deck of decks) {
    if (!deck.id) continue;
    const cardsJson = JSON.stringify(deck.cards || []);
    const sql = `
      INSERT INTO flashcards (id, user_id, title, course_id, department_id, level, cards_json, created_at, sync_status, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', 0)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        cards_json = excluded.cards_json,
        created_at = excluded.created_at,
        sync_status = 'synced'
    `;
    await runStatement(sql, [
      deck.id,
      userId,
      deck.title,
      deck.course_id || null,
      deck.department_id || null,
      deck.level || null,
      cardsJson,
      deck.created_at || Date.now(),
    ]);
  }
}
