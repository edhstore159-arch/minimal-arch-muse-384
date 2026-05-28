GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT ON public.svc_profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.svc_profiles TO authenticated;
GRANT ALL ON public.svc_profiles TO service_role;

GRANT SELECT ON public.svc_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.svc_posts TO authenticated;
GRANT ALL ON public.svc_posts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.svc_subscriptions TO authenticated;
GRANT ALL ON public.svc_subscriptions TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'svc_posts'
      AND policyname = 'Admins can manage all posts'
  ) THEN
    CREATE POLICY "Admins can manage all posts"
    ON public.svc_posts
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

UPDATE public.svc_profiles
SET role = 'admin', updated_at = now()
WHERE user_id IN (
  SELECT u.id
  FROM auth.users u
  WHERE lower(u.email) = 'admin@pertodemim.app'
);