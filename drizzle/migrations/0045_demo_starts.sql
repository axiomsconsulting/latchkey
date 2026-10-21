-- Public demo rate limit: one row per demo start, by a one-day hash of the
-- visitor's IP (never the address). Server only; cleared after a day.
create table if not exists public.demo_starts (
  id bigserial primary key,
  ip_hash text not null,
  kind text not null check (kind in ('host', 'guest')),
  at timestamptz not null default now()
);
create index if not exists demo_starts_ip_at_idx on public.demo_starts(ip_hash, at desc);
alter table public.demo_starts enable row level security;
grant all on public.demo_starts to service_role;
grant usage, select on sequence public.demo_starts_id_seq to service_role;
