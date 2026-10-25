-- Opening a guest's own guide from the QR code in their room before check-in
-- is finished, when the host allows it (properties.stay_access, normalised by
-- src/lib/stay-access.ts), and per-room Wi-Fi.
alter table public.properties add column if not exists stay_access jsonb not null default '{}'::jsonb;

-- A room can have its own network; empty means the property's.
alter table public.rooms add column if not exists wifi_name text check (wifi_name is null or char_length(wifi_name) <= 64);
alter table public.rooms add column if not exists wifi_password text check (wifi_password is null or char_length(wifi_password) <= 128);

-- Door tablets paired with a property (by the host's PIN on the tablet, or
-- the host signed in on it). Each reports where it is now and then: a
-- one-day pseudonym of its internet connection (never the address) and,
-- if allowed, its location rounded to about 10 m. A guest's phone on the
-- same connection, or near that location, is at the property. Written only
-- by the server; hosts see and remove their tablets.
create table if not exists public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  token_hash text not null unique,
  paired_by text not null default 'pin' check (paired_by in ('pin', 'host')),
  net_hash text,
  net_day text,
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  accuracy_m int check (accuracy_m is null or accuracy_m between 0 and 100000),
  located_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kiosk_devices_property_idx on public.kiosk_devices(property_id, last_seen_at desc);
alter table public.kiosk_devices enable row level security;
grant all on public.kiosk_devices to service_role;
grant select, delete on public.kiosk_devices to authenticated;
drop policy if exists kiosk_devices_read on public.kiosk_devices;
create policy kiosk_devices_read on public.kiosk_devices for select to authenticated using (public.is_host_member(public.property_host_id(property_id)));
drop policy if exists kiosk_devices_delete on public.kiosk_devices;
create policy kiosk_devices_delete on public.kiosk_devices for delete to authenticated using (public.can_write_host(public.property_host_id(property_id)));
drop policy if exists kiosk_devices_property_scope on public.kiosk_devices;
create policy kiosk_devices_property_scope on public.kiosk_devices as restrictive for all to authenticated using (public.property_visible(property_id)) with check (public.property_visible(property_id));
