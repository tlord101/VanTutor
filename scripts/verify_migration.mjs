import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eywpksapztzbnthlgfhd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5d3Brc2FwenR6Ym50aGxnZmhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODAyNzkzNiwiZXhwIjoyMTAzNjAzOTM2fQ.nFcGWEvj9H0MTlksKR48ldaK3_q9yGsZkeo6WMsuZZ4';

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifyCounts() {
  console.log('--- SUPABASE DATABASE AUDIT ---');
  
  const tables = ['schools', 'colleges', 'departments', 'courses', 'topics', 'past_questions', 'app_settings', 'profiles', 'subscriptions'];
  for (const t of tables) {
    const { count, error } = await adminClient.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table '${t}': error ->`, error.message);
    } else {
      console.log(`Table '${t}': ${count} records present`);
    }
  }

  // Print sample courses
  const { data: courses } = await adminClient.from('courses').select('id, code, title, level, semester').limit(5);
  console.log('\nSample migrated courses in Supabase:', courses);
}

verifyCounts();
