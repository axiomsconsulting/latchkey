-- Other guests on the same booking can fill in their own details on their
-- own phones while the lead guest checks in. The lead's screen shows a
-- square whose code is share_hash; each phone that scans it picks adult or
-- child and claims one guest slot (position) with its own token, which only
-- lets it fill in that one guest. Server only: no policies.
alter table public.checkin_sessions add column if not exists share_hash text;
create index if not exists checkin_sessions_share_idx on public.checkin_sessions(share_hash) where share_hash is not null;

create table if not exists public.checkin_joins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.checkin_sessions(id) on delete cascade,
  position integer not null check (position between 1 and 29),
  kind text not null check (kind in ('adult', 'child')),
  token_hash text not null unique,
  claimed_at timestamptz not null default now(),
  done_at timestamptz
);
create unique index if not exists checkin_joins_slot_idx on public.checkin_joins(session_id, position);
alter table public.checkin_joins enable row level security;
grant all on public.checkin_joins to service_role;
