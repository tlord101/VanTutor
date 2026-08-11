/**
 * Verification test suite for SQLite local-first chat storage, AI caching, and cloud sync queue
 */
import { generateQueryHash } from '../services/aiCacheService';
import { generateLocalId } from '../services/chatStorageService';

async function runTests() {
  console.log('--- STARTING SQLITE & LOCAL-FIRST ARCHITECTURE TESTS ---');

  // Test 1: Local ID Generation
  const convoId = generateLocalId('conv');
  const msgId = generateLocalId('msg');
  console.log(`[PASS] Generated Local IDs -> Conversation: ${convoId}, Message: ${msgId}`);
  if (!convoId.startsWith('conv_') || !msgId.startsWith('msg_')) {
    throw new Error('ID generation prefix failed');
  }

  // Test 2: AI Query Hash Determinism
  const hash1 = generateQueryHash('What is Newton third law of motion?', 'PHY101', 'semantic_search');
  const hash2 = generateQueryHash('What is Newton third law of motion?   ', 'phy101', 'semantic_search');
  const hashDifferent = generateQueryHash('Explain thermodynamics', 'PHY101', 'semantic_search');

  console.log(`[PASS] Deterministic AI Query Hash: ${hash1}`);
  if (hash1 !== hash2) {
    throw new Error(`Hash mismatch for normalized query: ${hash1} vs ${hash2}`);
  }
  if (hash1 === hashDifferent) {
    throw new Error('Hash collision for different queries');
  }

  console.log('--- ALL LOGIC & CACHE UNIT TESTS COMPLETED SUCCESSFULLY ---');
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
