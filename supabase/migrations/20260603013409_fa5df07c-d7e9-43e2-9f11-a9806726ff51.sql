
CREATE POLICY "auth upload client-docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'client-docs');

CREATE POLICY "auth read own client-docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'client-docs' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "admins delete client-docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'client-docs' AND public.has_role(auth.uid(), 'admin'::app_role));
