CREATE TABLE public.debug_instructions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  instruction TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.debug_instructions TO authenticated;
GRANT ALL ON public.debug_instructions TO service_role;

ALTER TABLE public.debug_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage debug instructions"
ON public.debug_instructions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_debug_instructions_updated_at
BEFORE UPDATE ON public.debug_instructions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_debug_instructions_created_at ON public.debug_instructions (created_at DESC);
CREATE INDEX idx_debug_instructions_status ON public.debug_instructions (status);