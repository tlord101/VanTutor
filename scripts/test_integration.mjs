import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eywpksapztzbnthlgfhd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5d3Brc2FwenR6Ym50aGxnZmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMjc5MzYsImV4cCI6MjEwMzYwMzkzNn0.uLZ-LBLWBmcgZYHnSDkbMV-BJA26I9x-pGDTZZxzyPI';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5d3Brc2FwenR6Ym50aGxnZmhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODAyNzkzNiwiZXhwIjoyMTAzNjAzOTM2fQ.nFcGWEvj9H0MTlksKR48ldaK3_q9yGsZkeo6WMsuZZ4';

const ALIBABA_API_KEY = 'sk-ws-H.DDDDYYH.77I2.MEUCIQDFmMXN1sJiSo1GSM17A-65_s-fgtJY_BICS4RqTZXM4QIgclZDSyfzQqiHHQHlnAFWiu_9RIcJNvaM2TgL7kBRr9E';
const ALIBABA_CHAT_URL = 'https://ws-o3v6mh0i8y9tqdfx.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions';

async function testSupabase() {
  console.log('========================================');
  console.log('1. TESTING SUPABASE CONNECTIVITY');
  console.log('========================================');

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    console.log('Checking database tables...');
    const { data: profiles, error: profileErr } = await adminClient.from('profiles').select('id, full_name, email').limit(5);
    if (profileErr) {
      console.log('profiles status:', profileErr.message);
    } else {
      console.log('SUCCESS: profiles table accessible. Current rows:', profiles?.length);
    }

    const { data: schools, error: schoolErr } = await adminClient.from('schools').select('id, name').limit(5);
    if (schoolErr) {
      console.log('schools status:', schoolErr.message);
    } else {
      console.log('SUCCESS: schools table accessible. Current rows:', schools?.length);
    }

    const { data: courses, error: courseErr } = await adminClient.from('courses').select('id, code, title').limit(5);
    if (courseErr) {
      console.log('courses status:', courseErr.message);
    } else {
      console.log('SUCCESS: courses table accessible. Current rows:', courses?.length);
    }

    const { data: subs, error: subErr } = await adminClient.from('subscriptions').select('id, user_id, plan_type').limit(5);
    if (subErr) {
      console.log('subscriptions status:', subErr.message);
    } else {
      console.log('SUCCESS: subscriptions table accessible. Current rows:', subs?.length);
    }

    // Check storage buckets
    const { data: buckets, error: bucketErr } = await adminClient.storage.listBuckets();
    if (bucketErr) {
      console.log('Storage buckets check error:', bucketErr.message);
    } else {
      console.log('SUCCESS: Storage buckets detected:', buckets?.map(b => b.name).join(', ') || '(None yet)');
    }

  } catch (err) {
    console.error('Supabase exception:', err.message);
  }
}

async function testAlibabaAI() {
  console.log('\n========================================');
  console.log('2. TESTING ALIBABA CLOUD AI (QWEN3.7-FLASH)');
  console.log('========================================');

  try {
    console.log('Sending test prompt to Qwen3.7-Flash...');
    const response = await fetch(ALIBABA_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ALIBABA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen3.7-flash',
        messages: [
          { role: 'system', content: 'You are Avelut AI tutor. Respond briefly.' },
          { role: 'user', content: 'Say "Avelut Supabase & Alibaba AI integration is active!" in one sentence.' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    console.log('Alibaba HTTP Status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('AI Response:', data?.choices?.[0]?.message?.content);
      console.log('Usage Tokens:', data?.usage);
    } else {
      const errText = await response.text();
      console.log('Alibaba Error:', errText);
    }
  } catch (err) {
    console.error('Alibaba AI Exception:', err.message);
  }
}

async function main() {
  await testSupabase();
  await testAlibabaAI();
}

main();
