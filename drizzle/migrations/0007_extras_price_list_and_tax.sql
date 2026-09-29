ALTER TABLE public.extras_catalogue
  ADD COLUMN IF NOT EXISTS item_key text,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'item',
  ADD COLUMN IF NOT EXISTS max_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_approve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_loan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS extras_catalogue_property_key ON public.extras_catalogue(property_id, item_key) WHERE item_key IS NOT NULL;

ALTER TABLE public.hosts
  ADD COLUMN IF NOT EXISTS tax_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_label text NOT NULL DEFAULT 'VAT',
  ADD COLUMN IF NOT EXISTS tax_rate_bp integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS prices_include_tax boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_details text,
  ADD COLUMN IF NOT EXISTS out_until timestamptz;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS time_window text,
  ADD COLUMN IF NOT EXISTS total_pence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_by timestamptz,
  ADD COLUMN IF NOT EXISTS suggested_window text,
  ADD COLUMN IF NOT EXISTS suggestion_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_until time,
  ADD COLUMN IF NOT EXISTS early_from time;