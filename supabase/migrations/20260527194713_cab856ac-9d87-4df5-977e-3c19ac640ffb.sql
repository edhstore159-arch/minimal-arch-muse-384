DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'social_platform') THEN
    CREATE TYPE public.social_platform AS ENUM ('instagram', 'facebook');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'post_status') THEN
    CREATE TYPE public.post_status AS ENUM ('draft', 'scheduled', 'publishing', 'published', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform public.social_platform NOT NULL,
  account_name text NOT NULL,
  account_handle text NOT NULL,
  is_connected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_accounts TO authenticated;
GRANT ALL ON public.social_accounts TO service_role;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own social accounts" ON public.social_accounts;
CREATE POLICY "Users view own social accounts" ON public.social_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own social accounts" ON public.social_accounts;
CREATE POLICY "Users insert own social accounts" ON public.social_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own social accounts" ON public.social_accounts;
CREATE POLICY "Users update own social accounts" ON public.social_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own social accounts" ON public.social_accounts;
CREATE POLICY "Users delete own social accounts" ON public.social_accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  caption text NOT NULL,
  hashtags text,
  media_url text,
  platforms public.social_platform[] NOT NULL DEFAULT '{}',
  scheduled_for timestamptz,
  status public.post_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_posts TO authenticated;
GRANT ALL ON public.scheduled_posts TO service_role;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own posts" ON public.scheduled_posts;
CREATE POLICY "Users view own posts" ON public.scheduled_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own posts" ON public.scheduled_posts;
CREATE POLICY "Users insert own posts" ON public.scheduled_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own posts" ON public.scheduled_posts;
CREATE POLICY "Users update own posts" ON public.scheduled_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own posts" ON public.scheduled_posts;
CREATE POLICY "Users delete own posts" ON public.scheduled_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_scheduled_posts_updated_at ON public.scheduled_posts;
CREATE TRIGGER update_scheduled_posts_updated_at
  BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due ON public.scheduled_posts (scheduled_for, status) WHERE status = 'scheduled';

INSERT INTO storage.buckets (id, name, public) VALUES ('social-media', 'social-media', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Public read social media" ON storage.objects;
DROP POLICY IF EXISTS "Users read own social media" ON storage.objects;
CREATE POLICY "Users read own social media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'social-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users upload own social media" ON storage.objects;
CREATE POLICY "Users upload own social media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'social-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users update own social media" ON storage.objects;
CREATE POLICY "Users update own social media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'social-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users delete own social media" ON storage.objects;
CREATE POLICY "Users delete own social media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'social-media' AND auth.uid()::text = (storage.foldername(name))[1]);