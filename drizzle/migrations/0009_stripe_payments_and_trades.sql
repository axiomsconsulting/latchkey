alter table public.extras_catalogue
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_synced_at timestamptz;

alter table public.requests
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text,
  add column if not exists paid_at timestamptz;

create index if not exists requests_stripe_session_idx on public.requests (stripe_session_id) where stripe_session_id is not null;

alter table public.hosts
  add column if not exists stripe_mode text not null default 'test',
  add column if not exists stripe_account_label text,
  add column if not exists stripe_checked_at timestamptz;
