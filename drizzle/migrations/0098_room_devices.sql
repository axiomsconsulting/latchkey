-- Room devices (lights and switches) guests control from their own stay guide, through the
-- host's SmartThings account. Additive: three new tables, nothing existing changes.

-- One SmartThings connection per business. Tokens: server only (no policies, service role).
create table if not exists public.smart_home_links (
  host_id uuid primary key references public.hosts(id) on delete cascade,
  provider text not null default 'smartthings' check (provider in ('smartthings')),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  installed_app_id text,
  scope text,
  -- Refresh tokens are single use: one refresh at a time per business.
  refreshing_until timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text
);
alter table public.smart_home_links enable row level security;
grant all on public.smart_home_links to service_role;

-- A device linked to a room. Members read; changes go through the server (owners and managers).
create table if not exists public.room_devices (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  provider text not null default 'smartthings' check (provider in ('smartthings')),
  device_id text not null check (char_length(device_id) between 1 and 100),
  label text not null check (char_length(label) between 1 and 80),
  capabilities text[] not null default '{}',
  -- The host can link a device without offering it to guests yet.
  guest_on boolean not null default true,
  -- Demo mode only: the pretend state of the light.
  demo_state jsonb,
  created_at timestamptz not null default now(),
  unique (room_id, device_id)
);
create index if not exists room_devices_room on public.room_devices (property_id, room_id);
alter table public.room_devices enable row level security;
grant all on public.room_devices to service_role;
grant select on public.room_devices to authenticated;
drop policy if exists room_devices_read on public.room_devices;
create policy room_devices_read on public.room_devices for select to authenticated
  using (public.is_host_member(host_id));
drop policy if exists room_devices_property_scope on public.room_devices;
create policy room_devices_property_scope on public.room_devices as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));

-- Each guest tap, for the rate limit. Server only; kept 7 days (retention sweep).
create table if not exists public.room_device_uses (
  id bigserial primary key,
  device_id uuid not null references public.room_devices(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists room_device_uses_booking on public.room_device_uses (booking_id, at);
alter table public.room_device_uses enable row level security;
grant all on public.room_device_uses to service_role;
