-- ==============================================================================
-- AVELUT COMPLETE SUPABASE SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Profiles Table (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    username TEXT UNIQUE,
    avatar_url TEXT,
    school_id TEXT,
    school_name TEXT,
    college_id TEXT,
    department_id TEXT,
    department_name TEXT,
    level TEXT,
    xp INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_active_date DATE DEFAULT CURRENT_DATE,
    ai_credits INTEGER DEFAULT 50,
    is_admin BOOLEAN DEFAULT FALSE,
    is_paid_subscriber BOOLEAN DEFAULT FALSE,
    fcm_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to automatically create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id, 
        email, 
        full_name, 
        avatar_url,
        username,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        LOWER(COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || '_' || SUBSTRING(NEW.id::text FROM 1 FOR 6))),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Academic Hierarchy Tables
CREATE TABLE IF NOT EXISTS public.schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    state TEXT,
    country TEXT DEFAULT 'Nigeria',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.colleges (
    id TEXT PRIMARY KEY,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    short_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.departments (
    id TEXT PRIMARY KEY,
    college_id TEXT REFERENCES public.colleges(id) ON DELETE CASCADE,
    school_id TEXT REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    short_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.courses (
    id TEXT PRIMARY KEY,
    department_id TEXT REFERENCES public.departments(id) ON DELETE SET NULL,
    school_id TEXT REFERENCES public.schools(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    level TEXT NOT NULL,
    semester INTEGER DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.topics (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES public.courses(id) ON DELETE CASCADE,
    topic_name TEXT NOT NULL,
    topic_order INTEGER DEFAULT 1,
    overview_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Past Questions Repository
CREATE TABLE IF NOT EXISTS public.past_questions (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL,
    level TEXT NOT NULL,
    course_id TEXT NOT NULL,
    year TEXT NOT NULL,
    questions_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dynamic System App Settings
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User Progress & Learning Memory
CREATE TABLE IF NOT EXISTS public.user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id TEXT REFERENCES public.courses(id) ON DELETE CASCADE,
    topic_id TEXT REFERENCES public.topics(id) ON DELETE CASCADE,
    completed_boards INTEGER DEFAULT 0,
    total_boards INTEGER DEFAULT 10,
    is_mastered BOOLEAN DEFAULT FALSE,
    score INTEGER DEFAULT 0,
    last_studied_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS public.exam_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    department_id TEXT,
    course_id TEXT,
    exam_type TEXT,
    score INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    questions_json JSONB NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    metadata_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Messenger & Social Collaboration
CREATE TABLE IF NOT EXISTS public.messenger_conversations (
    id TEXT PRIMARY KEY,
    user1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message_preview TEXT,
    last_message_sender UUID REFERENCES public.profiles(id),
    last_message_time TIMESTAMPTZ DEFAULT NOW(),
    unread_user1 INTEGER DEFAULT 0,
    unread_user2 INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messenger_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_type TEXT DEFAULT 'text', -- 'text' | 'image' | 'voice' | 'file'
    text_content TEXT,
    media_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_delivered BOOLEAN DEFAULT FALSE,
    is_read BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.study_partners (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, partner_id)
);

-- 7. Subscriptions, Daily Topic Allowance & Paystack Tracking
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    plan_type TEXT DEFAULT 'free', -- 'free' | 'weekly' | 'monthly' | 'semester'
    status TEXT DEFAULT 'active', -- 'active' | 'expired' | 'cancelled'
    daily_topic_allowance INTEGER DEFAULT 1,
    topics_used_today INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    unlocked_topics_pack INTEGER DEFAULT 0,
    paystack_reference TEXT,
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- 8. Feedback & Support Reports
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- 'bug' | 'content_error' | 'feature_request' | 'feedback'
    title TEXT,
    details TEXT NOT NULL,
    context_data JSONB,
    status TEXT DEFAULT 'pending', -- 'pending' | 'reviewed' | 'resolved'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES FOR HIGH QUERY PERFORMANCE
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_school_dept ON public.profiles(school_id, department_id);
CREATE INDEX IF NOT EXISTS idx_topics_course ON public.topics(course_id, topic_order);
CREATE INDEX IF NOT EXISTS idx_courses_dept ON public.courses(department_id, level);
CREATE INDEX IF NOT EXISTS idx_user_progress_user ON public.user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_history_user ON public.exam_history(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_convo ON public.messenger_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messenger_conv_users ON public.messenger_conversations(user1_id, user2_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by authenticated users" 
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Course Structure Policies (Public read for authenticated users)
CREATE POLICY "Schools readable by all authenticated" ON public.schools FOR SELECT TO authenticated USING (true);
CREATE POLICY "Colleges readable by all authenticated" ON public.colleges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Departments readable by all authenticated" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Courses readable by all authenticated" ON public.courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Topics readable by all authenticated" ON public.topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Past questions readable by authenticated" ON public.past_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "App settings readable by authenticated" ON public.app_settings FOR SELECT TO authenticated USING (true);

-- User Progress Policies
CREATE POLICY "Users can manage their own progress" 
ON public.user_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Exam History Policies
CREATE POLICY "Users can manage their own exam history" 
ON public.exam_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Notifications Policies
CREATE POLICY "Users can view and update their own notifications" 
ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Messenger Conversations Policies
CREATE POLICY "Users can view conversations they belong to" 
ON public.messenger_conversations FOR SELECT TO authenticated 
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create or update their conversations" 
ON public.messenger_conversations FOR ALL TO authenticated 
USING (auth.uid() = user1_id OR auth.uid() = user2_id)
WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Messenger Messages Policies
CREATE POLICY "Users can view messages sent or received" 
ON public.messenger_messages FOR SELECT TO authenticated 
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send messages" 
ON public.messenger_messages FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update received messages" 
ON public.messenger_messages FOR UPDATE TO authenticated 
USING (auth.uid() = recipient_id OR auth.uid() = sender_id);

-- Study Partners Policies
CREATE POLICY "Users can manage their study partners" 
ON public.study_partners FOR ALL TO authenticated 
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Subscriptions Policies
CREATE POLICY "Users can view their own subscription" 
ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own subscription" 
ON public.subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reports Policies
CREATE POLICY "Users can submit reports" 
ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Admins can view reports" 
ON public.reports FOR SELECT TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ==============================================================================
-- 9. STORAGE BUCKETS & STORAGE POLICIES
-- ==============================================================================

-- A. Profile Avatars Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile_avatars', 'profile_avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'profile_avatars');

CREATE POLICY "Users can upload their own avatar" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'profile_avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own avatar" 
ON storage.objects FOR UPDATE TO authenticated 
USING (bucket_id = 'profile_avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own avatar" 
ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'profile_avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- B. Solution Shares Bucket (For Visual Solver solution forwarding)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('solution_shares', 'solution_shares', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Solution share images are viewable by authenticated users" 
ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'solution_shares');

CREATE POLICY "Users can upload solution share images" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'solution_shares' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ==============================================================================
-- 10. ENABLE SUPABASE REALTIME BROADCASTING
-- ==============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
