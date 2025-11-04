import { createClient } from '@supabase/supabase-js';

// These variables are expected to be injected into the global scope by index.html
// In a real build process, they would come from environment variables.
declare var __supabase_url: string;
declare var __supabase_anon_key: string;

export const supabase = createClient(__supabase_url, __supabase_anon_key);

/*
/**************************************************************************************************
 *                                                                                                *
 *   IIIII M   M PPPP   OOO   RRRR   TTTTT   AAA   N   N TTTTT   Read The Instructions Below        *
 *     I   MM MM P   P O   O  R   R    T    A   A  NN  N   T                                        *
 *     I   M M M PPPP  O   O  RRRR     T    AAAAA  N N N   T     This app will NOT work without     *
 *     I   M   M P     O   O  R R      T    A   A  N  NN   T     correct database setup.            *
 *   IIIII M   M P      OOO   R  R     T    A   A  N   N   T                                        *
 *                                                                                                *
 **************************************************************************************************
 *                                                                                                *
 *   >>> ACTION REQUIRED: You must run the setup script below. <<<                                *
 *                                                                                                *
 *   The error 'relation "public.some_table" does not exist' means the database has not been set  *
 *   up. Please follow these steps exactly:                                                       *
 *                                                                                                *
 *   1. Go to your Supabase project dashboard.                                                    *
 *   2. In the left menu, find the "SQL Editor" (it has a database icon).                         *
 *   3. Click the "+ New query" button.                                                           *
 *   4. Copy the ENTIRE SQL script from "STEP 1" below.                                           *
 *   5. Paste the script into the SQL Editor and click the green "RUN" button.                    *
 *   6. Follow the instructions for "STEP 2", "STEP 3", and "STEP 4" to configure security.       *
 *                                                                                                *
 **************************************************************************************************
 * =================================================================================================
 * =================================================================================================
 * 
 *     ███████╗██╗  ██╗██████╗ ██████╗  █████╗ ███████╗███████╗    ██████╗  ██████╗ ██╗   ██╗
 *     ██╔════╝██║  ██║██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔════╝    ██╔══██╗██╔═══██╗╚██╗ ██╔╝
 *     ███████╗███████║██████╔╝██████╔╝███████║███████╗███████╗    ██████╔╝██║   ██║ ╚████╔╝ 
 *     ╚════██║██╔══██║██╔═══╝ ██╔═══╝ ██╔══██║╚════██║╚════██║    ██╔═══╝ ██║   ██║  ╚██╔╝  
 *     ███████║██║  ██║██║     ██║     ██║  ██║███████║███████║    ██║     ╚██████╔╝   ██║   
 *     ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝    ╚═╝      ╚═════╝    ╚═╝   
 *
 * =================================================================================================
 * =================================================================================================
 * 
 * IMPORTANT: This application has been migrated from Firebase to Supabase.
 * For the application to work, you MUST set up your Supabase project correctly.
 * Please follow these steps carefully in your Supabase project dashboard.
 * 
 * -------------------------------------------------------------------------------------------------
 * 
 * 
 * 
 * 
 /**************************************************************************************************
 *  STEP 1: DATABASE SETUP (SQL SCRIPT)
 * 
 *  Go to the "SQL Editor" in your Supabase dashboard and run the following SQL queries to create
 *  the necessary tables and functions for the application.
 * 
 *  --- Copy and run the entire SQL block below ---
 ************************************************************************************************** /
 
-- Drop existing functions/triggers if they exist to ensure a clean setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_xp_earned(uuid, integer, text);
DROP FUNCTION IF EXISTS public.mark_topic_complete(uuid, text);
DROP FUNCTION IF EXISTS public.mark_topic_complete(text, uuid);
DROP FUNCTION IF EXISTS public.append_to_viewed_by(uuid, uuid);

-- Enable uuid-ossp extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- =================================== TABLES & SCHEMAS ===================================

-- 1. Create the 'users' table to store public profile information.
CREATE TABLE public.users (
    uid uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text,
    photo_url text,
    course_id text,
    level text,
    total_xp integer DEFAULT 0 NOT NULL,
    total_test_xp integer DEFAULT 0 NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    last_activity_date bigint,
    notifications_enabled boolean DEFAULT false NOT NULL,
    is_online boolean DEFAULT false,
    last_seen bigint,
    privacy_consent jsonb,
    has_completed_tour boolean DEFAULT false
);
COMMENT ON TABLE public.users IS 'Stores public user profile information.';

-- 2. Create tables for user progress and history.
CREATE TABLE public.user_progress (
    user_id uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    topic_id text NOT NULL,
    is_complete boolean DEFAULT false NOT NULL,
    xp_earned integer DEFAULT 0 NOT NULL,
    PRIMARY KEY (user_id, topic_id)
);
COMMENT ON TABLE public.user_progress IS 'Tracks user completion status for study guide topics.';

CREATE TABLE public.exam_history (
    id uuid NOT NULL PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    course_id text,
    score integer,
    total_questions integer,
    xp_earned integer,
    "timestamp" bigint,
    questions jsonb
);
COMMENT ON TABLE public.exam_history IS 'Stores results of completed exams for each user.';

CREATE TABLE public.xp_history (
    user_id uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    "date" date NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    PRIMARY KEY (user_id, "date")
);
COMMENT ON TABLE public.xp_history IS 'Aggregates daily XP earned by users for charting.';

-- 3. Create table for in-app notifications.
CREATE TABLE public.notifications (
    id uuid NOT NULL PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    "type" text,
    title text,
    message text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    link text
);
COMMENT ON TABLE public.notifications IS 'Stores in-app notifications for users.';

-- 4. Create tables for AI Chat history.
CREATE TABLE public.chat_conversations (
    id uuid NOT NULL PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    title text,
    created_at bigint,
    last_updated_at bigint
);
COMMENT ON TABLE public.chat_conversations IS 'Stores metadata for AI tutor chat sessions.';

CREATE TABLE public.chat_messages (
    id uuid NOT NULL PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    sender text,
    "text" text,
    image_url text,
    audio_url text,
    audio_duration integer,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.chat_messages IS 'Stores individual messages within an AI chat session.';

-- 5. Create table for Study Guide chat history.
CREATE TABLE public.study_guide_messages (
    id uuid NOT NULL PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    topic_id text NOT NULL,
    sender text NOT NULL,
    text text,
    image_url text,
    timestamp timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.study_guide_messages IS 'Stores messages for user-specific study guide topic chats.';

-- 6. Create tables for Private Messenger.
CREATE TABLE public.private_chats (
    id text NOT NULL PRIMARY KEY,
    members uuid[],
    member_info jsonb,
    last_message jsonb,
    created_at bigint,
    last_activity_timestamp bigint,
    typing uuid[]
);
COMMENT ON TABLE public.private_chats IS 'Stores metadata for private user-to-user chats.';

CREATE TABLE public.private_messages (
    id uuid NOT NULL PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    chat_id text NOT NULL REFERENCES public.private_chats(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL,
    "text" text,
    image_url text,
    audio_url text,
    audio_duration integer,
    is_edited boolean DEFAULT false,
    is_one_time_view boolean DEFAULT false,
    viewed_by uuid[],
    reply_to jsonb,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.private_messages IS 'Stores individual messages for private chats.';

-- 7. Create tables for Leaderboards.
CREATE TABLE public.leaderboard_overall (
    user_id uuid NOT NULL PRIMARY KEY REFERENCES public.users(uid) ON DELETE CASCADE,
    display_name text,
    photo_url text,
    xp bigint DEFAULT 0
);
COMMENT ON TABLE public.leaderboard_overall IS 'Stores the all-time XP leaderboard.';

CREATE TABLE public.leaderboard_weekly (
    user_id uuid NOT NULL,
    week_id text NOT NULL,
    display_name text,
    photo_url text,
    xp integer DEFAULT 0,
    PRIMARY KEY (user_id, week_id)
);
COMMENT ON TABLE public.leaderboard_weekly IS 'Stores weekly XP leaderboard data.';

-- 8. Create table for public course data (replace artifact store)
CREATE TABLE public.courses_data (
    id text NOT NULL PRIMARY KEY,
    course_name text,
    levels text[],
    subject_list jsonb
);
COMMENT ON TABLE public.courses_data IS 'Publicly accessible course data. App will fail if empty.';

-- =================================== SAMPLE DATA (REQUIRED) ===================================
INSERT INTO public.courses_data (id, course_name, levels, subject_list)
VALUES
('math_algebra_1', 'Math - Algebra 1', '{"Beginner", "Intermediate", "Advanced"}', '[
  { "subject_id": "alg1_intro", "subject_name": "Foundations of Algebra", "level": "Beginner", "semester": "first", "topics": [
      { "topic_id": "alg1_intro_1", "topic_name": "Understanding Variables" }, { "topic_id": "alg1_intro_2", "topic_name": "Order of Operations (PEMDAS)" }, { "topic_id": "alg1_intro_3", "topic_name": "Properties of Real Numbers" } ]},
  { "subject_id": "alg1_equations", "subject_name": "Solving Linear Equations", "level": "Beginner", "semester": "first", "topics": [
      { "topic_id": "alg1_eq_1", "topic_name": "One-Step Equations" }, { "topic_id": "alg1_eq_2", "topic_name": "Two-Step Equations" }, { "topic_id": "alg1_eq_3", "topic_name": "Equations with Variables on Both Sides" } ]},
  { "subject_id": "alg1_functions", "subject_name": "Introduction to Functions", "level": "Intermediate", "semester": "second", "topics": [
      { "topic_id": "alg1_func_1", "topic_name": "What is a Function?" }, { "topic_id": "alg1_func_2", "topic_name": "Domain and Range" }, { "topic_id": "alg1_func_3", "topic_name": "Graphing Linear Functions" } ]}
]'),
('science_biology', 'Science - Biology', '{"High School", "College Prep"}', '[
  { "subject_id": "bio_cells", "subject_name": "Cellular Biology", "level": "High School", "semester": "first", "topics": [
      { "topic_id": "bio_cell_1", "topic_name": "Prokaryotic vs. Eukaryotic Cells" }, { "topic_id": "bio_cell_2", "topic_name": "Cell Organelles" }, { "topic_id": "bio_cell_3", "topic_name": "Cell Membrane and Transport" } ]},
  { "subject_id": "bio_genetics", "subject_name": "Genetics", "level": "College Prep", "semester": "second", "topics": [
      { "topic_id": "bio_gen_1", "topic_name": "Mendelian Genetics" }, { "topic_id": "bio_gen_2", "topic_name": "DNA Structure and Replication" }, { "topic_id": "bio_gen_3", "topic_name": "Protein Synthesis" } ]}
]');

-- =================================== FUNCTIONS & TRIGGERS ===================================

-- 1. Function to create a public user profile automatically when a new user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (uid, display_name, photo_url)
    VALUES (
        new.id, 
        COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'New User'),
        COALESCE(new.raw_user_meta_data->>'photo_url', new.raw_user_meta_data->>'avatar_url')
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute the function on new user creation.
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Function to handle XP updates atomically (RPC).
CREATE OR REPLACE FUNCTION public.handle_xp_earned(p_user_id uuid, p_xp_amount integer, p_xp_type text)
RETURNS void AS $$
DECLARE
    v_total_xp integer; v_total_test_xp integer; v_display_name text; v_photo_url text;
    v_current_overall_xp bigint; v_today date := current_date;
    v_week_id text := to_char(now() at time zone 'utc', 'IYYY-IW');
BEGIN
    IF p_xp_type = 'test' THEN UPDATE public.users SET total_test_xp = total_test_xp + p_xp_amount WHERE uid = p_user_id;
    ELSE UPDATE public.users SET total_xp = total_xp + p_xp_amount WHERE uid = p_user_id; END IF;
    INSERT INTO public.xp_history (user_id, date, xp) VALUES (p_user_id, v_today, p_xp_amount)
    ON CONFLICT (user_id, date) DO UPDATE SET xp = xp_history.xp + p_xp_amount;
    SELECT display_name, photo_url, total_xp, total_test_xp INTO v_display_name, v_photo_url, v_total_xp, v_total_test_xp
    FROM public.users WHERE uid = p_user_id;
    v_current_overall_xp := v_total_xp + v_total_test_xp;
    INSERT INTO public.leaderboard_overall (user_id, display_name, photo_url, xp) VALUES (p_user_id, v_display_name, v_photo_url, v_current_overall_xp)
    ON CONFLICT (user_id) DO UPDATE SET xp = v_current_overall_xp, display_name = v_display_name, photo_url = v_photo_url;
    INSERT INTO public.leaderboard_weekly (user_id, week_id, display_name, photo_url, xp) VALUES (p_user_id, v_week_id, v_display_name, v_photo_url, p_xp_amount)
    ON CONFLICT (user_id, week_id) DO UPDATE SET xp = leaderboard_weekly.xp + p_xp_amount, display_name = v_display_name, photo_url = v_photo_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to mark a topic as complete and award XP atomically (RPC).
--    NOTE: Parameter order is p_topic_id, p_user_id to match client library's alphabetical sorting.
CREATE OR REPLACE FUNCTION public.mark_topic_complete(p_topic_id text, p_user_id uuid)
RETURNS void AS $$
DECLARE
    v_xp_amount integer := 2;
    v_already_complete boolean;
BEGIN
    -- Check if the topic is already complete to avoid re-awarding XP.
    SELECT is_complete INTO v_already_complete
    FROM public.user_progress
    WHERE user_id = p_user_id AND topic_id = p_topic_id;

    IF COALESCE(v_already_complete, false) THEN
        RETURN;
    END IF;
    
    -- Upsert the user progress
    INSERT INTO public.user_progress(user_id, topic_id, is_complete, xp_earned)
    VALUES (p_user_id, p_topic_id, true, v_xp_amount)
    ON CONFLICT (user_id, topic_id) DO UPDATE 
    SET is_complete = true, xp_earned = v_xp_amount;

    -- Call the existing XP handling function
    PERFORM public.handle_xp_earned(p_user_id, v_xp_amount, 'lesson');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to update one-time-view images (RPC).
CREATE OR REPLACE FUNCTION public.append_to_viewed_by(message_id uuid, user_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.private_messages
    SET viewed_by = array_append(viewed_by, user_id)
    WHERE id = message_id AND NOT (viewed_by @> ARRAY[user_id]);
END;
$$ LANGUAGE plpgsql;

-- =================================== API PERMISSIONS ===================================
-- Grant basic permissions for API access. RLS policies below will secure the data.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant PostgREST schema cache access to the anon role. CRITICAL for the API to see tables.
GRANT SELECT ON TABLE public.users TO anon;
GRANT SELECT ON TABLE public.user_progress TO anon;
GRANT SELECT ON TABLE public.exam_history TO anon;
GRANT SELECT ON TABLE public.xp_history TO anon;
GRANT SELECT ON TABLE public.notifications TO anon;
GRANT SELECT ON TABLE public.chat_conversations TO anon;
GRANT SELECT ON TABLE public.chat_messages TO anon;
GRANT SELECT ON TABLE public.study_guide_messages TO anon;
GRANT SELECT ON TABLE public.private_chats TO anon;
GRANT SELECT ON TABLE public.private_messages TO anon;
GRANT SELECT ON TABLE public.leaderboard_overall TO anon;
GRANT SELECT ON TABLE public.leaderboard_weekly TO anon;
GRANT SELECT ON TABLE public.courses_data TO anon;


/**************************************************************************************************
 *  STEP 2: ROW LEVEL SECURITY (RLS) POLICIES
 * 
 *  For each table created above, you MUST enable Row Level Security and create policies.
 *  Go to "Authentication" > "Policies" in your Supabase dashboard.
 *  Find each table and perform the following steps:
 * 
 *  1. Click "Enable RLS"
 *  2. Click "New Policy" > "Get started quickly"
 *  3. Use the templates below, copying the name and policy definitions.
 ************************************************************************************************** /

-- Table: users
-- Policy Name: "Users can view all profiles but only update their own."
-- Policy Type: ALL
-- USING expression: true
-- WITH CHECK expression: (auth.uid() = uid)

-- Table: user_progress
-- Policy Name: "Users can manage their own progress."
-- Policy Type: ALL
-- USING expression: (auth.uid() = user_id)
-- WITH CHECK expression: (auth.uid() = user_id)

-- Table: exam_history
-- Policy Name: "Users can manage their own exam history."
-- Policy Type: ALL
-- USING expression: (auth.uid() = user_id)
-- WITH CHECK expression: (auth.uid() = user_id)

-- Table: xp_history
-- Policy Name: "Users can manage their own XP history."
-- Policy Type: ALL
-- USING expression: (auth.uid() = user_id)
-- WITH CHECK expression: (auth.uid() = user_id)

-- Table: notifications
-- Policy Name: "Users can manage their own notifications."
-- Policy Type: ALL
-- USING expression: (auth.uid() = user_id)
-- WITH CHECK expression: (auth.uid() = user_id)

-- Table: chat_conversations
-- Policy Name: "Users can manage their own chat conversations."
-- Policy Type: ALL
-- USING expression: (auth.uid() = user_id)
-- WITH CHECK expression: (auth.uid() = user_id)

-- Table: chat_messages
-- Policy Name: "Users can access messages in their own conversations."
-- Policy Type: ALL
-- USING expression: (auth.uid() = ( SELECT user_id FROM chat_conversations WHERE id = conversation_id ))
-- WITH CHECK expression: (auth.uid() = ( SELECT user_id FROM chat_conversations WHERE id = conversation_id ))

-- Table: study_guide_messages
-- Policy Name: "Users can manage their own study guide messages."
-- Policy Type: ALL
-- USING expression: (auth.uid() = user_id)
-- WITH CHECK expression: (auth.uid() = user_id)

-- Table: private_chats
-- Policy Name: "Users can access chats they are a member of."
-- Policy Type: ALL
-- USING expression: (auth.uid() = ANY (members))
-- WITH CHECK expression: (auth.uid() = ANY (members))

-- Table: private_messages
-- Policy Name: "Users can access messages in chats they are a member of."
-- Policy Type: ALL
-- USING expression: (auth.uid() = ANY (( SELECT members FROM private_chats WHERE id = chat_id )))
-- WITH CHECK expression: (auth.uid() = ANY (( SELECT members FROM private_chats WHERE id = chat_id )))

-- Table: leaderboard_overall
-- Policy Name: "All users can view the leaderboard."
-- Policy Type: SELECT
-- USING expression: true

-- Table: leaderboard_weekly
-- Policy Name: "All users can view the weekly leaderboard."
-- Policy Type: SELECT
-- USING expression: true

-- Table: courses_data
-- Policy Name: "All users can view course data."
-- Policy Type: SELECT
-- USING expression: true


/**************************************************************************************************
 *  STEP 3: EDGE FUNCTIONS
 * 
 *  The app requires two server-side functions for account management and cleanup.
 *  You must deploy these from your local machine using the Supabase CLI.
 * 
 *  FIRST, create the shared CORS file. This is critical for the functions to work.
 *     - Create a file at `supabase/functions/_shared/cors.ts`
 *     - Paste the code below into this file.
 * 
 *  --- Code for `supabase/functions/_shared/cors.ts` ---
 *  export const corsHeaders = {
 *    'Access-Control-Allow-Origin': '*',
 *    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 *  }
 *  --- End of code ---
 * 
 *  NOW, create the functions:
 * 
 *  1. Account Deletion Function (`delete-user`):
 *     - Create a file at `supabase/functions/delete-user/index.ts`
 *     - Paste the code below into the file.
 *     - Deploy with the command: `supabase functions deploy delete-user`
 * 
 *  2. Media Cleanup Cron Job (`delete-old-media`):
 *     - Create a file at `supabase/functions/delete-old-media/index.ts`
 *     - Paste the code from `cron/delete-old-media.ts` in the project into this file.
 *     - Deploy with the command: `supabase functions deploy delete-old-media --schedule "0 0 * * *"`
 ************************************************************************************************** /

-- Code for `delete-user/index.ts`:

/ *
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
        });
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    
    // Also remove user's profile picture from storage
    await supabaseAdmin.storage.from('profile-pictures').remove([user.id]);

    return new Response(JSON.stringify({ message: 'User deleted successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
* /

/**************************************************************************************************
 *  STEP 4: STORAGE SETUP
 * 
 *  Go to "Storage" in your Supabase dashboard to create buckets and set policies.
 * 
 *  1. Create Buckets:
 *     - Click "New bucket" and create the following three buckets:
 *       - `profile-pictures` (make this a Public bucket)
 *       - `chat-media` (leave this as a Private bucket)
 *       - `private-chats` (leave this as a Private bucket)
 * 
 *  2. Set Storage Policies:
 *     - Go to "Storage" > "Policies".
 *     - For each bucket, create the policies described below.
 ************************************************************************************************** /

-- Bucket: `profile-pictures`
-- Policy Name: "Users can manage their own profile picture."
-- Allowed operations: SELECT, INSERT, UPDATE
-- Policy definition: (bucket_id = 'profile-pictures' AND auth.uid()::text = name)

-- Bucket: `chat-media`
-- Policy Name: "Authenticated users can upload media to their chat folders."
-- Allowed operations: INSERT
-- Policy definition: (bucket_id = 'chat-media' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text)
-- Policy Name: "Users can view media from their own chats."
-- Allowed operations: SELECT
-- Policy definition: (bucket_id = 'chat-media' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text)

-- Bucket: `private-chats`
-- Policy Name: "Authenticated users can upload media to private chats they are in."
-- Allowed operations: INSERT
-- Policy definition: (bucket_id = 'private-chats' AND auth.role() = 'authenticated') -- Note: App logic should enforce folder access.
-- Policy Name: "Users can view media from private chats they are in."
-- Allowed operations: SELECT
-- Policy definition: (bucket_id = 'private-chats' AND auth.role() = 'authenticated' AND auth.uid()::text IN ( SELECT unnest(members) FROM public.private_chats WHERE id = (storage.foldername(name))[1] ))

-- ================================= END OF SETUP INSTRUCTIONS ==================================
* /
*/