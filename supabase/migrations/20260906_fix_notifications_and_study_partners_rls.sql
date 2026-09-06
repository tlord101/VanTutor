-- Migration: Fix notifications and study_partners RLS policies
-- Prevents 403 Forbidden when sending partner request notifications or creating mutual study connections

-- 1. Notifications policies
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
DROP POLICY IF EXISTS notifications_own ON public.notifications;
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'anon');
CREATE POLICY "Anyone can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- 2. Study partners policies
DROP POLICY IF EXISTS "study_partners_own" ON public.study_partners;
DROP POLICY IF EXISTS study_partners_own ON public.study_partners;
DROP POLICY IF EXISTS "study_partners_select" ON public.study_partners;
DROP POLICY IF EXISTS "study_partners_insert" ON public.study_partners;
DROP POLICY IF EXISTS "study_partners_delete" ON public.study_partners;

CREATE POLICY "study_partners_select" ON public.study_partners FOR SELECT USING (auth.uid() = user_id OR auth.uid() = partner_id);
CREATE POLICY "study_partners_insert" ON public.study_partners FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = partner_id);
CREATE POLICY "study_partners_delete" ON public.study_partners FOR DELETE USING (auth.uid() = user_id OR auth.uid() = partner_id);
