import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'avelut_local';
const DB_VERSION = 1;

let sqliteConnection: SQLiteConnection | null = null;
let dbConnection: SQLiteDBConnection | null = null;
let isInitializing = false;
let initPromise: Promise<SQLiteDBConnection | null> | null = null;

/**
 * Initialize jeep-sqlite web component for web / dev preview environments.
 */
async function setupWebJeepSqlite(): Promise<void> {
  if (typeof window === 'undefined' || Capacitor.isNativePlatform()) return;

  try {
    const { defineCustomElements } = await import('jeep-sqlite/loader');
    await defineCustomElements(window);

    // Wait until jeep-sqlite custom element is present in DOM
    let jeepSqliteEl = document.querySelector('jeep-sqlite');
    if (!jeepSqliteEl) {
      jeepSqliteEl = document.createElement('jeep-sqlite');
      document.body.appendChild(jeepSqliteEl);
      await customElements.whenDefined('jeep-sqlite');
    }
  } catch (err) {
    console.warn('[SQLite] jeep-sqlite initialization warning (may be running in test or node):', err);
  }
}

/**
 * Database schema initialization scripts.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_updated_at INTEGER NOT NULL,
  sync_status TEXT DEFAULT 'pending',
  is_deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, last_updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  attachments_json TEXT,
  image_url TEXT,
  timestamp INTEGER NOT NULL,
  sync_status TEXT DEFAULT 'pending',
  is_deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id, timestamp ASC);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS ai_semantic_cache (
  query_hash TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  course_key TEXT,
  context_type TEXT NOT NULL,
  result_json TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_semantic_cache(expires_at);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at ASC);
`;

/**
 * Initialize SQLite database connection and run schema creation.
 */
export async function getDatabaseConnection(): Promise<SQLiteDBConnection | null> {
  if (dbConnection) {
    return dbConnection;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      isInitializing = true;
      const isNative = Capacitor.isNativePlatform();

      if (!isNative) {
        await setupWebJeepSqlite();
      }

      sqliteConnection = new SQLiteConnection(CapacitorSQLite);

      if (!isNative) {
        await sqliteConnection.initWebStore();
      }

      const retCC = (await sqliteConnection.checkConnectionsConsistency()).result;
      const isConn = (await sqliteConnection.isConnection(DB_NAME, false)).result;

      if (retCC && isConn) {
        dbConnection = await sqliteConnection.retrieveConnection(DB_NAME, false);
      } else {
        dbConnection = await sqliteConnection.createConnection(
          DB_NAME,
          false,
          'no-encryption',
          DB_VERSION,
          false
        );
      }

      await dbConnection.open();

      // Execute schema creation
      await dbConnection.execute(SCHEMA_SQL);

      if (!isNative) {
        await sqliteConnection.saveToStore(DB_NAME);
      }

      console.log('[SQLite] Local database initialized successfully.');
      return dbConnection;
    } catch (error) {
      console.error('[SQLite] Failed to initialize SQLite database:', error);
      return null;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * Save store on Web (IndexedDB backing) after write operations.
 */
export async function persistWebStore(): Promise<void> {
  if (!Capacitor.isNativePlatform() && sqliteConnection) {
    try {
      await sqliteConnection.saveToStore(DB_NAME);
    } catch (e) {
      // Non-critical, ignore silent save errors
    }
  }
}

/**
 * Safe query execution helper that returns rows as an array of objects.
 */
export async function runQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const db = await getDatabaseConnection();
    if (!db) {
      return runFallbackQuery<T>(sql, params);
    }
    const res = await db.query(sql, params);
    return (res.values as T[]) || [];
  } catch (error) {
    console.error(`[SQLite] Query error (${sql}):`, error);
    return runFallbackQuery<T>(sql, params);
  }
}

/**
 * Safe run statement helper for INSERT, UPDATE, DELETE.
 */
export async function runStatement(sql: string, params: any[] = []): Promise<{ changes?: number; lastId?: number }> {
  try {
    const db = await getDatabaseConnection();
    if (!db) {
      return runFallbackStatement(sql, params);
    }
    const res = await db.run(sql, params);
    await persistWebStore();
    return {
      changes: res.changes?.changes || 0,
      lastId: res.changes?.lastId,
    };
  } catch (error) {
    console.error(`[SQLite] Statement execution error (${sql}):`, error);
    return runFallbackStatement(sql, params);
  }
}

/**
 * Execute batch statements in transaction.
 */
export async function runBatch(statements: string): Promise<void> {
  try {
    const db = await getDatabaseConnection();
    if (!db) return;
    await db.execute(statements);
    await persistWebStore();
  } catch (error) {
    console.error('[SQLite] Batch execution error:', error);
  }
}

// =========================================================================
// IN-MEMORY / LOCAL STORAGE HYBRID FALLBACK FOR ZERO-CRASH TOLERANCE
// =========================================================================
const memoryFallbackStore: Record<string, any[]> = {
  conversations: [],
  messages: [],
  app_state: [],
  ai_semantic_cache: [],
  sync_queue: []
};

function runFallbackQuery<T>(sql: string, params: any[]): T[] {
  const lower = sql.toLowerCase();
  if (lower.includes('from conversations')) {
    const userId = params[0];
    let items = (memoryFallbackStore.conversations || []).filter(c => !c.is_deleted);
    if (userId) items = items.filter(c => c.user_id === userId);
    return items.sort((a, b) => (b.last_updated_at || 0) - (a.last_updated_at || 0)) as unknown as T[];
  }
  if (lower.includes('from messages')) {
    const convoId = params[0];
    let items = (memoryFallbackStore.messages || []).filter(m => !m.is_deleted);
    if (convoId) items = items.filter(m => m.conversation_id === convoId);
    return items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)) as unknown as T[];
  }
  if (lower.includes('from ai_semantic_cache')) {
    const hash = params[0];
    const now = Date.now();
    const hit = (memoryFallbackStore.ai_semantic_cache || []).find(
      c => c.query_hash === hash && c.expires_at > now
    );
    return (hit ? [hit] : []) as unknown as T[];
  }
  if (lower.includes('from sync_queue')) {
    return (memoryFallbackStore.sync_queue || []) as unknown as T[];
  }
  return [];
}

function runFallbackStatement(sql: string, params: any[]): { changes: number } {
  const lower = sql.toLowerCase();
  if (lower.includes('insert or replace into conversations') || lower.includes('insert into conversations')) {
    const [id, user_id, title, created_at, last_updated_at, sync_status, is_deleted] = params;
    const existingIdx = memoryFallbackStore.conversations.findIndex(c => c.id === id);
    const item = { id, user_id, title, created_at, last_updated_at, sync_status, is_deleted: is_deleted || 0 };
    if (existingIdx >= 0) memoryFallbackStore.conversations[existingIdx] = item;
    else memoryFallbackStore.conversations.push(item);
    return { changes: 1 };
  }
  if (lower.includes('insert or replace into messages') || lower.includes('insert into messages')) {
    const [id, conversation_id, user_id, sender, text, attachments_json, image_url, timestamp, sync_status, is_deleted] = params;
    const existingIdx = memoryFallbackStore.messages.findIndex(m => m.id === id);
    const item = { id, conversation_id, user_id, sender, text, attachments_json, image_url, timestamp, sync_status, is_deleted: is_deleted || 0 };
    if (existingIdx >= 0) memoryFallbackStore.messages[existingIdx] = item;
    else memoryFallbackStore.messages.push(item);
    return { changes: 1 };
  }
  if (lower.includes('insert or replace into ai_semantic_cache')) {
    const [query_hash, query_text, course_key, context_type, result_json, hit_count, created_at, expires_at] = params;
    const idx = memoryFallbackStore.ai_semantic_cache.findIndex(c => c.query_hash === query_hash);
    const item = { query_hash, query_text, course_key, context_type, result_json, hit_count, created_at, expires_at };
    if (idx >= 0) memoryFallbackStore.ai_semantic_cache[idx] = item;
    else memoryFallbackStore.ai_semantic_cache.push(item);
    return { changes: 1 };
  }
  if (lower.includes('insert or replace into sync_queue') || lower.includes('insert into sync_queue')) {
    const [id, entity_type, entity_id, action, payload_json, retry_count, created_at, last_error] = params;
    memoryFallbackStore.sync_queue.push({ id, entity_type, entity_id, action, payload_json, retry_count, created_at, last_error });
    return { changes: 1 };
  }
  if (lower.includes('delete from sync_queue')) {
    const id = params[0];
    memoryFallbackStore.sync_queue = memoryFallbackStore.sync_queue.filter(q => q.id !== id);
    return { changes: 1 };
  }
  return { changes: 0 };
}
