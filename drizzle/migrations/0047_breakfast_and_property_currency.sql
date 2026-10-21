-- Regional pricing: a property can price its extras (and breakfast) in its
-- own currency; null uses the business's.
alter table public.properties add column if not exists currency text check (currency is null or currency ~ '^[A-Z]{3}$');

-- Breakfast orders (src/lib/extras.ts BREAKFAST_STYLES): which morning and
-- time, and how it's served. The dishes are the request's items, priced from
-- the extras price list (extras_catalogue.options.breakfast).
alter table public.requests
  add column if not exists breakfast_at timestamptz,
  add column if not exists breakfast_style text check (breakfast_style is null or breakfast_style in ('packed', 'delivered', 'dining'));
