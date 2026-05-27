DROP POLICY IF EXISTS "svc photos public read" ON storage.objects;
DROP POLICY IF EXISTS "svc photos auth read own" ON storage.objects;
CREATE POLICY "svc photos auth read own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'svc-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "svc chat public read" ON storage.objects;
DROP POLICY IF EXISTS "svc chat auth read own" ON storage.objects;
CREATE POLICY "svc chat auth read own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'svc-chat' AND auth.uid()::text = (storage.foldername(name))[1]);