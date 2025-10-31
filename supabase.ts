import { createClient } from '@supabase/supabase-js';

// These variables are expected to be injected into the global scope by index.html
// In a real build process, they would come from environment variables.
declare var __supabase_url: string;
declare var __supabase_anon_key: string;

// NOTE: The error "new row violates row-level security policy" indicates that your
// Supabase Storage buckets are not configured correctly. Please follow these steps
// in your Supabase project dashboard to fix the issue.
//
// STEP 1: MAKE BUCKETS PUBLIC
// This application uses public URLs for images and audio. You must make your buckets public.
// Go to Storage -> Buckets. For EACH of the buckets below, do the following:
//   - `profile-pictures`
//   - `chat-media`
//   - `private-chats`
//
// 1. Click the three-dots menu (...) next to the bucket name.
// 2. Click "Bucket settings".
// 3. Toggle ON the "This bucket is public" option and save.
//
// STEP 2: ENABLE ROW LEVEL SECURITY (RLS)
// This secures your buckets so only authorized users can upload files.
// 1. Go to your project's "Database" section.
// 2. In the sidebar, click "Policies".
// 3. Find the `objects` table under the `storage` schema.
// 4. If RLS is disabled, click "Enable RLS".
//
// STEP 3: CREATE UPLOAD POLICIES
// Click "New Policy" -> "Create a new policy from scratch" and create the following policies for the `storage.objects` table.
//
// --- Policy 1: Allow users to manage their own profile picture ---
//   - Policy Name: Allow users to manage their own profile pictures
//   - Allowed operation: ALL
//   - Target roles: authenticated
//   - USING expression: (bucket_id = 'profile-pictures' AND auth.uid()::text = name)
//   - WITH CHECK expression: (bucket_id = 'profile-pictures' AND auth.uid()::text = name)
//
// --- Policy 2: Allow users to upload to their general chat media folder ---
//   - Policy Name: Allow authenticated uploads to chat-media
//   - Allowed operation: INSERT
//   - Target roles: authenticated
//   - WITH CHECK expression: (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text)
//
// --- Policy 3: Allow members of a private chat to upload media ---
//   - Policy Name: Allow member uploads to private-chats
//   - Allowed operation: INSERT
//   - Target roles: authenticated
//   - WITH CHECK expression: (bucket_id = 'private-chats' AND auth.uid()::text = ANY(string_to_array((storage.foldername(name))[1], '_')))
//
// After completing these steps, the file upload errors will be resolved.

export const supabase = createClient(__supabase_url, __supabase_anon_key);
