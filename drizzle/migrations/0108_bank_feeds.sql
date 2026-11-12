-- Bank transfers received (src/lib/bank-match.ts): the host's own bank account read for money in, so
-- direct bookings paid by bank transfer are marked paid. bank_feeds holds a bank connection (the
-- read-only token sealed); bank_receipts each payment in that was read (from a statement upload or
-- the bank) and what it matched. Server only: hosts see them through server functions. Additive.
create table if not exists public.bank_feeds (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  provider text not null check (provider in ('starling')),
  label text,
  secret_sealed text not null,
  account_uid text,
  category_uid text,
  currency text not null default 'GBP',
  last_read_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (host_id, provider)
);
alter table public.bank_feeds enable row level security;
grant all on public.bank_feeds to service_role;

create table if not exists public.bank_receipts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  source text not null check (char_length(source) between 1 and 40),
  source_id text not null check (char_length(source_id) between 1 and 200),
  received_on date not null,
  amount_pence integer not null check (amount_pence > 0),
  currency text not null default 'GBP',
  payer text,
  details text,
  reservation_id uuid references public.direct_reservations(id) on delete set null,
  match text not null default 'none' check (match in ('paid', 'check', 'none', 'ignored')),
  created_at timestamptz not null default now(),
  unique (host_id, source_id)
);
create index if not exists bank_receipts_host on public.bank_receipts (host_id, received_on desc);
alter table public.bank_receipts enable row level security;
grant all on public.bank_receipts to service_role;
