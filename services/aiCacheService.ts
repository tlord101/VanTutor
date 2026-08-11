import { runQuery, runStatement } from '../lib/sqlite/sqliteService';

export interface CachedAICacheEntry {
  query_hash: string;
  query_text: string;
  course_key?: string | null;
  context_type: string;
  result_json: string;
  hit_count: number;
  created_at: number;
  expires_at: number;
}

const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate a consistent, fast normalized hash key from query and parameters.
 */
export function generateQueryHash(text: string, contextKey: string = '', contextType: string = 'semantic'): string {
  const normalized = `${contextType}:${contextKey.trim().toLowerCase()}:${text.trim().toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `h_${contextType}_${Math.abs(hash)}_${normalized.length}`;
}

/**
 * Retrieve cached Pinecone semantic search results from local SQLite.
 * Returns null if no valid cache entry exists or if it has expired.
 */
export async function getCachedSemanticSearch(
  query: string,
  courseKey?: string
): Promise<{ success: boolean; results: any[]; cached: boolean } | null> {
  if (!query || !query.trim()) return null;

  try {
    const queryHash = generateQueryHash(query, courseKey || '', 'semantic_search');
    const now = Date.now();

    const sql = `
      SELECT query_hash, query_text, course_key, context_type, result_json, hit_count, created_at, expires_at
      FROM ai_semantic_cache
      WHERE query_hash = ? AND expires_at > ?
      LIMIT 1
    `;

    const rows = await runQuery<CachedAICacheEntry>(sql, [queryHash, now]);

    if (rows && rows.length > 0) {
      const entry = rows[0];
      const parsedResults = JSON.parse(entry.result_json);

      // Increment hit count asynchronously
      void runStatement(
        `UPDATE ai_semantic_cache SET hit_count = hit_count + 1 WHERE query_hash = ?`,
        [queryHash]
      );

      console.log(`[AICache] SQLite Semantic Cache HIT for query: "${query.substring(0, 30)}..." (Hits: ${entry.hit_count + 1})`);
      return {
        success: true,
        results: parsedResults,
        cached: true
      };
    }

    return null;
  } catch (error) {
    console.warn('[AICache] Failed to read semantic search cache from SQLite:', error);
    return null;
  }
}

/**
 * Store Pinecone semantic search results into local SQLite.
 */
export async function setCachedSemanticSearch(
  query: string,
  courseKey: string | undefined,
  results: any[],
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): Promise<void> {
  if (!query || !query.trim() || !results || results.length === 0) return;

  try {
    const queryHash = generateQueryHash(query, courseKey || '', 'semantic_search');
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const resultJson = JSON.stringify(results);

    const sql = `
      INSERT OR REPLACE INTO ai_semantic_cache (
        query_hash, query_text, course_key, context_type, result_json, hit_count, created_at, expires_at
      ) VALUES (?, ?, ?, 'semantic_search', ?, 1, ?, ?)
    `;

    await runStatement(sql, [
      queryHash,
      query.trim(),
      courseKey || null,
      resultJson,
      now,
      expiresAt
    ]);

    console.log(`[AICache] Saved ${results.length} semantic chunks to SQLite cache for query: "${query.substring(0, 30)}..."`);
  } catch (error) {
    console.warn('[AICache] Failed to save semantic search results to SQLite:', error);
  }
}

/**
 * Retrieve a cached AI assistant reply for frequent/identical questions.
 */
export async function getCachedAIResponse(
  prompt: string,
  model: string,
  courseContext?: string
): Promise<string | null> {
  if (!prompt || !prompt.trim()) return null;

  try {
    const queryHash = generateQueryHash(prompt, `${model}:${courseContext || ''}`, 'ai_response');
    const now = Date.now();

    const sql = `
      SELECT result_json, hit_count
      FROM ai_semantic_cache
      WHERE query_hash = ? AND expires_at > ?
      LIMIT 1
    `;

    const rows = await runQuery<CachedAICacheEntry>(sql, [queryHash, now]);

    if (rows && rows.length > 0) {
      const entry = rows[0];
      const parsed = JSON.parse(entry.result_json);

      // Increment hit count
      void runStatement(
        `UPDATE ai_semantic_cache SET hit_count = hit_count + 1 WHERE query_hash = ?`,
        [queryHash]
      );

      console.log(`[AICache] SQLite AI Response Cache HIT for prompt: "${prompt.substring(0, 30)}..."`);
      return parsed.responseText || parsed;
    }

    return null;
  } catch (error) {
    console.warn('[AICache] Failed to read AI response cache from SQLite:', error);
    return null;
  }
}

/**
 * Cache an AI assistant response in SQLite.
 */
export async function setCachedAIResponse(
  prompt: string,
  model: string,
  courseContext: string | undefined,
  responseText: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): Promise<void> {
  if (!prompt || !prompt.trim() || !responseText || !responseText.trim()) return;

  try {
    const queryHash = generateQueryHash(prompt, `${model}:${courseContext || ''}`, 'ai_response');
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const resultJson = JSON.stringify({ responseText: responseText.trim() });

    const sql = `
      INSERT OR REPLACE INTO ai_semantic_cache (
        query_hash, query_text, course_key, context_type, result_json, hit_count, created_at, expires_at
      ) VALUES (?, ?, ?, 'ai_response', ?, 1, ?, ?)
    `;

    await runStatement(sql, [
      queryHash,
      prompt.trim(),
      courseContext || null,
      resultJson,
      now,
      expiresAt
    ]);
  } catch (error) {
    console.warn('[AICache] Failed to cache AI response in SQLite:', error);
  }
}

/**
 * Remove stale or expired cache items from SQLite.
 */
export async function cleanExpiredAICache(): Promise<void> {
  try {
    const now = Date.now();
    await runStatement(`DELETE FROM ai_semantic_cache WHERE expires_at <= ?`, [now]);
  } catch (error) {
    console.warn('[AICache] Error cleaning expired AI cache:', error);
  }
}
