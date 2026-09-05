-- ==============================================================================
-- Migration: Create app_kv table for key-value storage and settings
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_kv (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_kv ENABLE ROW LEVEL SECURITY;

-- Allow public read access to app_kv
CREATE POLICY "Allow public read on app_kv" 
ON public.app_kv FOR SELECT USING (true);

-- Allow authenticated users to insert/update app_kv
CREATE POLICY "Allow authenticated insert/update on app_kv" 
ON public.app_kv FOR ALL TO authenticated 
USING (true) 
WITH CHECK (true);

-- Allow anon to read/write app_kv if needed (e.g. app_updates, theme before login)
CREATE POLICY "Allow anon insert/update on app_kv" 
ON public.app_kv FOR ALL TO anon 
USING (true) 
WITH CHECK (true);
