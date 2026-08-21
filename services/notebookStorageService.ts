import { runQuery, runStatement } from '../lib/sqlite/sqliteService';
import { readCachedJson, writeCachedJson } from '../utils/cache';

export interface NotebookChapter {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  wordCount: number;
  contentSnippet?: string;
}

export interface Notebook {
  id: string;
  user_id: string;
  title: string;
  file_name: string;
  file_size: number;
  total_pages: number;
  chapter_count: number;
  chapters: NotebookChapter[];
  created_at: number;
  is_deleted?: number;
}

export interface NotebookChunk {
  id: string;
  notebook_id: string;
  user_id: string;
  page_number: number;
  chapter_title: string;
  content: string;
  word_count: number;
  created_at: number;
}

const getLocalNotebooksCacheKey = (userId: string) => `avelut_notebooks_${userId}`;
const getLocalChunksCacheKey = (notebookId: string) => `avelut_chunks_${notebookId}`;

// ── Native IndexedDB Helper for Storing PDF Binary (Zero External Dependencies) ──
const IDB_DB_NAME = 'avelut_pdf_store';
const IDB_STORE_NAME = 'pdf_binaries';

function getIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(IDB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setPdfBinary(key: string, value: ArrayBuffer | Uint8Array | Blob): Promise<void> {
  try {
    const db = await getIndexedDB();
    const blob = value instanceof Blob ? value : new Blob([value], { type: 'application/pdf' });
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        tx.objectStore(IDB_STORE_NAME).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => {
          console.warn('[NotebookStorage] IDB transaction put error:', e);
          resolve();
        };
      } catch (e) {
        console.warn('[NotebookStorage] IDB put sync error:', e);
        resolve();
      }
    });
  } catch (err) {
    console.warn('[NotebookStorage] IDB set error:', err);
  }
}

async function deletePdfBinary(key: string): Promise<void> {
  try {
    const db = await getIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

/**
 * Save a newly uploaded & extracted notebook into SQLite, local cache, and IndexedDB for PDF binary.
 */
export async function saveNotebook(
  userId: string,
  data: {
    title: string;
    fileName: string;
    fileSize: number;
    totalPages: number;
    chapters: Array<{ id: string; title: string; startPage: number; endPage: number; content: string; wordCount: number }>;
    pages: Array<{ pageNumber: number; text: string; wordCount: number }>;
    pdfBinary?: ArrayBuffer;
  }
): Promise<Notebook> {
  const notebookId = `nb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const chaptersMeta: NotebookChapter[] = data.chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    startPage: ch.startPage,
    endPage: ch.endPage,
    wordCount: ch.wordCount,
    contentSnippet: ch.content.slice(0, 200),
  }));

  const notebook: Notebook = {
    id: notebookId,
    user_id: userId,
    title: data.title,
    file_name: data.fileName,
    file_size: data.fileSize,
    total_pages: data.totalPages,
    chapter_count: chaptersMeta.length,
    chapters: chaptersMeta,
    created_at: now,
    is_deleted: 0,
  };

  // 1. Store raw PDF binary in IndexedDB for offline viewing
  if (data.pdfBinary) {
    await setPdfBinary(`pdf_blob_${notebookId}`, data.pdfBinary);
  }

  // 2. Persist to SQLite
  try {
    await runStatement(
      `INSERT INTO notebooks (id, user_id, title, file_name, file_size, total_pages, chapter_count, chapters_json, created_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
      [
        notebook.id,
        notebook.user_id,
        notebook.title,
        notebook.file_name,
        notebook.file_size,
        notebook.total_pages,
        notebook.chapter_count,
        JSON.stringify(notebook.chapters),
        notebook.created_at,
      ]
    );

    // Save chunks to SQLite
    for (const page of data.pages) {
      const parentChapter = data.chapters.find(
        (ch) => page.pageNumber >= ch.startPage && page.pageNumber <= ch.endPage
      );
      const chapterTitle = parentChapter ? parentChapter.title : 'General';
      const chunkId = `chk_${notebookId}_${page.pageNumber}`;

      await runStatement(
        `INSERT INTO notebook_chunks (id, notebook_id, user_id, page_number, chapter_title, content, word_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          chunkId,
          notebookId,
          userId,
          page.pageNumber,
          chapterTitle,
          page.text,
          page.wordCount,
          now,
        ]
      );
    }
  } catch (err) {
    console.warn('[NotebookStorage] SQLite insert error, falling back to local cache:', err);
  }

  // 3. Fast memory / localStorage cache mirror
  const cachedList = readCachedJson<Notebook[]>(getLocalNotebooksCacheKey(userId), []);
  const updatedList = [notebook, ...cachedList.filter((n) => n.id !== notebook.id)];
  writeCachedJson(getLocalNotebooksCacheKey(userId), updatedList);

  // Cache full chapters content
  const chaptersFullMap: Record<string, { title: string; content: string; startPage: number; endPage: number }> = {};
  data.chapters.forEach((ch) => {
    chaptersFullMap[ch.id] = {
      title: ch.title,
      content: ch.content,
      startPage: ch.startPage,
      endPage: ch.endPage,
    };
  });
  writeCachedJson(getLocalChunksCacheKey(notebookId), chaptersFullMap);

  return notebook;
}

/**
 * Fetch all notebooks for a given user.
 */
export async function getNotebooks(userId: string): Promise<Notebook[]> {
  // 1. Check fast cache first
  const cached = readCachedJson<Notebook[]>(getLocalNotebooksCacheKey(userId), []);

  // 2. Query SQLite
  try {
    const rows = await runQuery<{
      id: string;
      user_id: string;
      title: string;
      file_name: string;
      file_size: number;
      total_pages: number;
      chapter_count: number;
      chapters_json: string;
      created_at: number;
      is_deleted: number;
    }>(
      `SELECT * FROM notebooks WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC;`,
      [userId]
    );

    if (rows && rows.length > 0) {
      const sqliteNotebooks: Notebook[] = rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        title: r.title,
        file_name: r.file_name,
        file_size: r.file_size,
        total_pages: r.total_pages,
        chapter_count: r.chapter_count,
        chapters: JSON.parse(r.chapters_json || '[]'),
        created_at: r.created_at,
        is_deleted: r.is_deleted,
      }));

      // Merge and update cache
      writeCachedJson(getLocalNotebooksCacheKey(userId), sqliteNotebooks);
      return sqliteNotebooks;
    }
  } catch (err) {
    console.warn('[NotebookStorage] SQLite get error, using cache:', err);
  }

  return cached;
}

/**
 * Get full text content for a specific chapter in a notebook.
 */
export async function getChapterContent(notebookId: string, chapterId: string): Promise<string> {
  // 1. Try memory / localStorage cache
  const cachedMap = readCachedJson<Record<string, { title: string; content: string }>>(
    getLocalChunksCacheKey(notebookId),
    {}
  );
  if (cachedMap && cachedMap[chapterId] && cachedMap[chapterId].content) {
    return cachedMap[chapterId].content;
  }

  // 2. Try SQLite
  try {
    const rows = await runQuery<{ content: string }>(
      `SELECT content FROM notebook_chunks WHERE notebook_id = ? ORDER BY page_number ASC;`,
      [notebookId]
    );
    if (rows && rows.length > 0) {
      return rows.map((r) => r.content).join('\n\n');
    }
  } catch (err) {
    console.warn('[NotebookStorage] SQLite chapter read error:', err);
  }

  return '';
}

/**
 * Delete a notebook and all associated chunks.
 */
export async function deleteNotebook(userId: string, notebookId: string): Promise<void> {
  // 1. Update SQLite
  try {
    await runStatement(`UPDATE notebooks SET is_deleted = 1 WHERE id = ? AND user_id = ?;`, [
      notebookId,
      userId,
    ]);
    await runStatement(`DELETE FROM notebook_chunks WHERE notebook_id = ?;`, [notebookId]);
  } catch (err) {
    console.warn('[NotebookStorage] SQLite delete error:', err);
  }

  // 2. Clear IndexedDB PDF binary
  await deletePdfBinary(`pdf_blob_${notebookId}`);

  // 3. Update cache
  const cachedList = readCachedJson<Notebook[]>(getLocalNotebooksCacheKey(userId), []);
  const updatedList = cachedList.filter((n) => n.id !== notebookId);
  writeCachedJson(getLocalNotebooksCacheKey(userId), updatedList);
}

/**
 * Free keyword search across notebook chunks for context retrieval during teaching.
 */
export async function searchNotebookChunks(
  notebookId: string,
  query: string,
  limit = 5
): Promise<Array<{ pageNumber: number; chapterTitle: string; content: string; score: number }>> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (terms.length === 0) return [];

  try {
    const rows = await runQuery<{ page_number: number; chapter_title: string; content: string }>(
      `SELECT page_number, chapter_title, content FROM notebook_chunks WHERE notebook_id = ?;`,
      [notebookId]
    );

    if (rows && rows.length > 0) {
      const scored = rows.map((r) => {
        const textLower = r.content.toLowerCase();
        let matchScore = 0;
        for (const term of terms) {
          const matches = (textLower.match(new RegExp(term, 'g')) || []).length;
          matchScore += matches;
        }
        return {
          pageNumber: r.page_number,
          chapterTitle: r.chapter_title,
          content: r.content,
          score: matchScore,
        };
      });

      return scored
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }
  } catch (err) {
    console.warn('[NotebookStorage] Search query error:', err);
  }

  return [];
}
