import { createClient } from '@supabase/supabase-js';

// These variables are expected to be injected into the global scope by index.html
// In a real build process, they would come from environment variables.
declare var __supabase_url: string;
declare var __supabase_anon_key: string;

// NOTE: For this implementation to work, you must create public buckets
// in your Supabase project named:
// - 'profile-pictures'
// - 'chat-media'
// - 'private-chats'
// Make sure to set up appropriate Row Level Security (RLS) policies if needed.
export const supabase = createClient(__supabase_url, __supabase_anon_key);
