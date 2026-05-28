DROP POLICY IF EXISTS "Authenticated users can create custom categories" ON public.svc_categories;

GRANT INSERT ON public.svc_categories TO authenticated;

CREATE POLICY "Authenticated users can create custom categories"
ON public.svc_categories
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND length(trim(name)) BETWEEN 2 AND 40
  AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND icon = '🧰'
  AND sort_order >= 1000
);

CREATE OR REPLACE FUNCTION public.ensure_svc_category(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public
AS $$
DECLARE
  clean_name text;
  slug_value text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É preciso estar autenticado para criar categoria';
  END IF;

  clean_name := trim(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g'));

  IF length(clean_name) < 2 OR length(clean_name) > 40 THEN
    RAISE EXCEPTION 'Informe uma categoria entre 2 e 40 caracteres';
  END IF;

  slug_value := lower(clean_name);
  slug_value := translate(slug_value, 'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN');
  slug_value := regexp_replace(slug_value, '[^a-z0-9]+', '-', 'g');
  slug_value := regexp_replace(slug_value, '(^-|-$)', '', 'g');

  IF slug_value = '' THEN
    RAISE EXCEPTION 'Informe uma categoria válida';
  END IF;

  INSERT INTO public.svc_categories (slug, name, icon, sort_order)
  VALUES (
    slug_value,
    initcap(clean_name),
    '🧰',
    coalesce((SELECT max(sort_order) + 1 FROM public.svc_categories), 1000)
  )
  ON CONFLICT (slug) DO NOTHING;

  RETURN slug_value;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_svc_category(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_svc_category(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_svc_category(text) TO authenticated;