
DROP POLICY IF EXISTS "Profiles public read" ON public.svc_profiles;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_svc_profile() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.svc_bump_conversation() FROM anon, authenticated, public;

UPDATE storage.buckets SET public = false WHERE id = 'svc-chat';
