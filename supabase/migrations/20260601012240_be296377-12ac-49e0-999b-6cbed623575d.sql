
-- Tighten conversations: restrict to authenticated owners
DROP POLICY IF EXISTS "Users view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Anyone can insert conversations" ON public.conversations;

CREATE POLICY "Users view own conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

-- Remove anonymous access to volunteer posts (which include address/lat/lng)
DROP POLICY IF EXISTS "Offers public read" ON public.svc_posts;
