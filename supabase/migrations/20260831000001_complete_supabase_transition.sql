-- ==============================================================================
-- AVELUT COMPLETE SUPABASE TRANSITION MIGRATION
-- ==============================================================================

-- 1. App Settings Table
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App settings readable by all" 
ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Admins can update app settings" 
ON public.app_settings FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 2. Textbooks & Course Materials Table
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    course_code TEXT,
    course_id TEXT REFERENCES public.courses(id) ON DELETE SET NULL,
    department_id TEXT REFERENCES public.departments(id) ON DELETE SET NULL,
    school_id TEXT REFERENCES public.schools(id) ON DELETE SET NULL,
    level TEXT,
    file_url TEXT NOT NULL,
    file_type TEXT DEFAULT 'pdf', -- 'pdf' | 'epub' | 'docx' | 'image'
    file_size_bytes BIGINT,
    page_count INTEGER,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploader_name TEXT,
    download_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Materials are viewable by all authenticated users" 
ON public.materials FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can upload course materials" 
ON public.materials FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update their own materials or admins" 
ON public.materials FOR UPDATE TO authenticated 
USING (auth.uid() = uploaded_by OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 3. Usage & AI Credits Audit Log Table
CREATE TABLE IF NOT EXISTS public.usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    credits_spent INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    model TEXT,
    provider TEXT,
    details_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage records" 
ON public.usage_records FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage records" 
ON public.usage_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 4. Atomic PostgreSQL RPC Functions for Credits, XP, and Streaks

-- A. Deduct AI Credits atomically
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
    p_user_id UUID,
    p_amount INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_current_credits INT;
    v_new_credits INT;
    v_is_admin BOOLEAN;
BEGIN
    SELECT ai_credits, is_admin INTO v_current_credits, v_is_admin
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    -- Admins have unlimited credits
    IF v_is_admin IS TRUE THEN
        RETURN jsonb_build_object('success', true, 'remaining_credits', v_current_credits, 'unlimited', true);
    END IF;

    IF v_current_credits < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient credits', 'current_credits', v_current_credits);
    END IF;

    v_new_credits := v_current_credits - p_amount;

    UPDATE public.profiles
    SET ai_credits = v_new_credits, updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'remaining_credits', v_new_credits);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Increment AI Credits atomically (e.g. refills, rewards)
CREATE OR REPLACE FUNCTION public.increment_user_credits(
    p_user_id UUID,
    p_amount INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_new_credits INT;
BEGIN
    UPDATE public.profiles
    SET ai_credits = COALESCE(ai_credits, 0) + p_amount, updated_at = NOW()
    WHERE id = p_user_id
    RETURNING ai_credits INTO v_new_credits;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    RETURN jsonb_build_object('success', true, 'credits', v_new_credits);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. Increment User XP atomically
CREATE OR REPLACE FUNCTION public.increment_user_xp(
    p_user_id UUID,
    p_amount INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_new_xp INT;
BEGIN
    UPDATE public.profiles
    SET xp = COALESCE(xp, 0) + p_amount, updated_at = NOW()
    WHERE id = p_user_id
    RETURNING xp INTO v_new_xp;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    RETURN jsonb_build_object('success', true, 'xp', v_new_xp);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. Update Daily Streak atomically
CREATE OR REPLACE FUNCTION public.update_daily_streak(
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_last_active DATE;
    v_streak INT;
    v_today DATE := CURRENT_DATE;
BEGIN
    SELECT last_active_date, COALESCE(streak, 0) INTO v_last_active, v_streak
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_last_active IS NULL OR v_last_active < v_today - INTERVAL '1 day' THEN
        -- Streak broke or first activity
        v_streak := 1;
    ELSIF v_last_active = v_today - INTERVAL '1 day' THEN
        -- Consecutive active day
        v_streak := v_streak + 1;
    END IF;
    -- If v_last_active = v_today, streak remains unchanged

    UPDATE public.profiles
    SET streak = v_streak, last_active_date = v_today, updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'streak', v_streak, 'last_active_date', v_today);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Course Materials Storage Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('materials', 'materials', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Materials files are publicly readable" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'materials');

CREATE POLICY "Authenticated users can upload materials" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'materials');

CREATE POLICY "Users can manage their uploaded materials" 
ON storage.objects FOR ALL TO authenticated 
USING (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 6. Add Realtime Publications
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.materials;
