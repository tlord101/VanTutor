import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eywpksapztzbnthlgfhd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5d3Brc2FwenR6Ym50aGxnZmhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODAyNzkzNiwiZXhwIjoyMTAzNjAzOTM2fQ.nFcGWEvj9H0MTlksKR48ldaK3_q9yGsZkeo6WMsuZZ4';

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testHierarchy() {
  console.log('Querying full academic hierarchy in 1 clean relational query:');
  const { data, error } = await adminClient
    .from('schools')
    .select(`
      id,
      name,
      colleges (
        id,
        name,
        departments (
          id,
          name,
          courses (
            id,
            code,
            title,
            level,
            semester,
            topics (
              id,
              topic_name,
              topic_order
            )
          )
        )
      )
    `)
    .eq('id', 'fupre');

  if (error) {
    console.error('Query error:', error.message);
  } else {
    console.log('Result hierarchy:');
    console.log(JSON.stringify(data, null, 2).slice(0, 1500) + '\n...');
  }
}

testHierarchy();
