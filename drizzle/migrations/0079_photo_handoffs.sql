-- Photos on a phone during a check-in at the door tablet (src/lib/photo-handoff.ts).
-- One row per check-in at a kiosk: the kiosk's and the phone's secrets are kept only as
-- hashes, the task the kiosk is waiting on and the phone's answer to it (the same answer
-- the kiosk's own camera would get; a stay found from the ID carries its check-in token
-- encrypted with the server's signing secret, as is the phone's link so it can be texted). No photos are kept here. Rows end after
-- 30 minutes and are deleted by the daily clean-up. Server only (no policies). Additive.
create table if not exists public.photo_handoffs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  kiosk_hash text not null unique,
  phone_hash text not null unique,
  phone_sealed text,
  channel text not null check (channel ~ '^[0-9a-f]{32}$'),
  device_id text not null,
  session_id uuid references public.checkin_sessions(id) on delete cascade,
  task jsonb,
  result jsonb,
  opened_at timestamptz,
  phone_seen_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists photo_handoffs_expires on public.photo_handoffs (expires_at);
alter table public.photo_handoffs enable row level security;
grant all on public.photo_handoffs to service_role;
drop policy if exists photo_handoffs_property_scope on public.photo_handoffs;
create policy photo_handoffs_property_scope on public.photo_handoffs as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));
