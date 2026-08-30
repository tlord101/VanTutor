import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eywpksapztzbnthlgfhd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5d3Brc2FwenR6Ym50aGxnZmhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODAyNzkzNiwiZXhwIjoyMTAzNjAzOTM2fQ.nFcGWEvj9H0MTlksKR48ldaK3_q9yGsZkeo6WMsuZZ4';

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkColumns() {
  console.log('Testing inserting a sample school...');
  const { data: school, error: sErr } = await adminClient.from('schools').upsert({
    id: 'fupre',
    name: 'Federal University of Petroleum Resources Effurun',
    short_name: 'FUPRE',
    state: 'Delta',
    country: 'Nigeria'
  }).select();

  console.log('School insert result:', sErr ? sErr.message : 'SUCCESS', school);

  console.log('\nTesting inserting a sample department...');
  const { data: dept, error: dErr } = await adminClient.from('departments').upsert({
    id: 'computer_engineering_',
    school_id: 'fupre',
    name: 'Computer Engineering',
    short_name: 'CPE'
  }).select();

  console.log('Dept insert result:', dErr ? dErr.message : 'SUCCESS', dept);
}

checkColumns();
