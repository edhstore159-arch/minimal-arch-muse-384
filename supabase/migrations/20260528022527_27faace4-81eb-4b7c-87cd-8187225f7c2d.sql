INSERT INTO public.svc_categories (slug, name, icon, sort_order)
VALUES
  ('reformas', 'Reformas', '🔨', 10),
  ('pintura', 'Pintura', '🎨', 20),
  ('eletrica', 'Elétrica', '💡', 30),
  ('hidraulica', 'Hidráulica', '🚰', 40),
  ('marcenaria', 'Marcenaria', '🪚', 50),
  ('pedreiro', 'Pedreiro', '🧱', 60),
  ('limpeza', 'Limpeza', '🧹', 70),
  ('jardinagem', 'Jardinagem', '🌱', 80),
  ('transporte', 'Transporte/Frete', '🚛', 90),
  ('mecanica', 'Mecânica', '🔧', 100),
  ('outros', 'Outros', '🧰', 999)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

CREATE OR REPLACE FUNCTION public.ensure_svc_category(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
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
  ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name;

  RETURN slug_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_svc_category(text) TO authenticated;