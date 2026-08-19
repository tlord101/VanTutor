import { runQuery, runStatement } from '../lib/sqlite/sqliteService';
import { readCachedJson, writeCachedJson } from '../utils/cache';

export interface LocalCreditRecord {
  user_id: string;
  balance: number;
  subscription_status: string;
  last_synced: number;
}

export interface LocalCreditUsageLog {
  id: string;
  user_id: string;
  feature: string;
  deduction: number;
  timestamp: number;
}

/**
 * Initializes the SQLite credits table and usage logs table if not present.
 */
export async function initLocalCreditsTable(): Promise<void> {
  try {
    await runStatement(`
      CREATE TABLE IF NOT EXISTS user_credits (
        user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 15,
        subscription_status TEXT DEFAULT 'free',
        last_synced INTEGER NOT NULL
      )
    `);
    await runStatement(`
      CREATE TABLE IF NOT EXISTS credit_usage_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        feature TEXT NOT NULL,
        deduction INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
  } catch (err) {
    console.warn('[CreditsStorage] Table init error:', err);
  }
}

/**
 * Mirrors the latest credit balance to SQLite and fast local cache.
 */
export async function saveLocalCredits(
  userId: string,
  balance: number,
  subscriptionStatus: string = 'free'
): Promise<void> {
  if (!userId) return;
  const now = Date.now();

  // Fast synchronous cache
  writeCachedJson(`local_credits_${userId}`, {
    user_id: userId,
    balance,
    subscription_status: subscriptionStatus,
    last_synced: now,
  });

  try {
    await initLocalCreditsTable();
    await runStatement(
      `INSERT OR REPLACE INTO user_credits (user_id, balance, subscription_status, last_synced) VALUES (?, ?, ?, ?)`,
      [userId, balance, subscriptionStatus, now]
    );
  } catch (err) {
    console.warn('[CreditsStorage] SQLite save credits error:', err);
  }
}

/**
 * Retrieves the local credit record from cache or SQLite.
 */
export async function getLocalCredits(userId: string): Promise<LocalCreditRecord | null> {
  if (!userId) return null;

  // 1. Fast cache lookup
  const cached = readCachedJson<LocalCreditRecord>(`local_credits_${userId}`);
  if (cached && typeof cached.balance === 'number') {
    return cached;
  }

  // 2. SQLite lookup
  try {
    await initLocalCreditsTable();
    const rows = await runQuery<LocalCreditRecord>(
      `SELECT user_id, balance, subscription_status, last_synced FROM user_credits WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (rows && rows.length > 0) {
      writeCachedJson(`local_credits_${userId}`, rows[0]);
      return rows[0];
    }
  } catch (err) {
    console.warn('[CreditsStorage] SQLite get credits error:', err);
  }

  return null;
}

/**
 * Logs a local credit deduction into the SQLite ledger.
 */
export async function recordLocalCreditDeduction(
  userId: string,
  deduction: number,
  feature: string
): Promise<void> {
  if (!userId) return;
  const now = Date.now();
  const id = `cul_${userId}_${now}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    await initLocalCreditsTable();
    await runStatement(
      `INSERT INTO credit_usage_logs (id, user_id, feature, deduction, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [id, userId, feature, deduction, now]
    );
  } catch (err) {
    console.warn('[CreditsStorage] SQLite record deduction error:', err);
  }
}
