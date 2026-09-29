ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS section_key text;
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS is_starter boolean NOT NULL DEFAULT false;
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS guides_section_scope_uidx
  ON public.guides (property_id, COALESCE(room_id, '00000000-0000-0000-0000-000000000000'::uuid), section_key)
  WHERE section_key IS NOT NULL;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS guide_mode text NOT NULL DEFAULT 'detailed' CHECK (guide_mode IN ('basic','detailed'));
ALTER TABLE public.stay_tokens ADD COLUMN IF NOT EXISTS valid_from timestamptz;
