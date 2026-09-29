-- Regional terminology: which country a property sits in.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB';

-- Read tracking so both sides can show an unread badge.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_by_guest_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_by_host_at timestamptz;

-- Host's own address book of tradespeople.
CREATE TABLE IF NOT EXISTS public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text,
  category text NOT NULL DEFAULT 'handyman',
  phone text,
  whatsapp_phone text,
  email text,
  website text,
  area text,
  notes text,
  rating numeric(2,1),
  source text NOT NULL DEFAULT 'manual',
  is_preferred boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trades_host_idx ON public.trades (host_id, category);
CREATE INDEX IF NOT EXISTS trades_property_idx ON public.trades (property_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host staff read their trades"
  ON public.trades FOR SELECT TO authenticated
  USING (public.is_host_staff(host_id));

CREATE POLICY "Host members insert trades"
  ON public.trades FOR INSERT TO authenticated
  WITH CHECK (public.is_host_member(host_id));

CREATE POLICY "Host members update trades"
  ON public.trades FOR UPDATE TO authenticated
  USING (public.is_host_member(host_id))
  WITH CHECK (public.is_host_member(host_id));

CREATE POLICY "Host members delete trades"
  ON public.trades FOR DELETE TO authenticated
  USING (public.is_host_member(host_id));

DROP TRIGGER IF EXISTS trades_touch ON public.trades;
CREATE TRIGGER trades_touch BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- AI trade suggestions are generated once per property; remember when.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS trades_ai_at timestamptz;