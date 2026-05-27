
CREATE OR REPLACE FUNCTION public.is_volunteer_or_helper(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.svc_profiles
    WHERE user_id = _uid AND role IN ('volunteer','helper')
  ) OR public.has_role(_uid, 'admin'::app_role);
$$;

DROP POLICY IF EXISTS "Posts public read" ON public.svc_posts;
DROP POLICY IF EXISTS "Posts viewable by authenticated" ON public.svc_posts;

CREATE POLICY "Offers public read"
ON public.svc_posts FOR SELECT TO anon
USING (post_type = 'volunteer');

CREATE POLICY "Offers viewable by authenticated"
ON public.svc_posts FOR SELECT TO authenticated
USING (post_type = 'volunteer');

CREATE POLICY "Help requests viewable by owner"
ON public.svc_posts FOR SELECT TO authenticated
USING (post_type <> 'volunteer' AND auth.uid() = user_id);

CREATE POLICY "Help requests viewable by volunteers"
ON public.svc_posts FOR SELECT TO authenticated
USING (post_type <> 'volunteer' AND public.is_volunteer_or_helper(auth.uid()));
