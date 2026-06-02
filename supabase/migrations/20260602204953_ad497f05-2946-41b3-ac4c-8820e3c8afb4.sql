DO $$
BEGIN
  ALTER TYPE public.social_platform ADD VALUE IF NOT EXISTS 'linkedin';
  ALTER TYPE public.social_platform ADD VALUE IF NOT EXISTS 'tiktok';
  ALTER TYPE public.social_platform ADD VALUE IF NOT EXISTS 'youtube';
  ALTER TYPE public.social_platform ADD VALUE IF NOT EXISTS 'x';
  ALTER TYPE public.social_platform ADD VALUE IF NOT EXISTS 'pinterest';
  ALTER TYPE public.social_platform ADD VALUE IF NOT EXISTS 'whatsapp';
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS creative_id text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS image_b64 text,
  ADD COLUMN IF NOT EXISTS platform_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_status
ON public.scheduled_posts (user_id, status, scheduled_for);