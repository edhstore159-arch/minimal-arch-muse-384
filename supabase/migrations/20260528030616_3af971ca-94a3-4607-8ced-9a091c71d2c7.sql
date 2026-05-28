DROP POLICY IF EXISTS "Help requests viewable by owner" ON public.svc_posts;
DROP POLICY IF EXISTS "Help requests viewable by volunteers" ON public.svc_posts;

CREATE POLICY "Open paid job posts viewable by authenticated users"
ON public.svc_posts
FOR SELECT
TO authenticated
USING (post_type <> 'volunteer'::text AND status = 'open'::text);

CREATE POLICY "Owners view their non-volunteer posts"
ON public.svc_posts
FOR SELECT
TO authenticated
USING (post_type <> 'volunteer'::text AND auth.uid() = user_id);