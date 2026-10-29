-- Door tablets (src/lib/kiosk-devices.ts): numbered and named per property,
-- joining by themselves (pending with a setup code the host types into the
-- dashboard, or automatically on the same Wi-Fi as a tablet already in use,
-- when the host allows it), a welcome per tablet, the app version each one
-- runs, and an optional camera view for the host (latest snapshot only,
-- only while the host is watching, only on tablets the host switched it on
-- for). Additive; the paired_by check is only widened.

alter table public.kiosk_devices add column if not exists number smallint check (number is null or number between 1 and 99);
alter table public.kiosk_devices add column if not exists status text not null default 'confirmed' check (status in ('pending', 'confirmed'));
alter table public.kiosk_devices add column if not exists pair_code text check (pair_code is null or pair_code ~ '^[0-9]{6}$');
alter table public.kiosk_devices add column if not exists pair_code_expires_at timestamptz;
alter table public.kiosk_devices add column if not exists app_version text check (app_version is null or char_length(app_version) <= 20);
alter table public.kiosk_devices add column if not exists camera_allowed boolean not null default false;
alter table public.kiosk_devices add column if not exists watch_until timestamptz;
alter table public.kiosk_devices drop constraint if exists kiosk_devices_paired_by_check;
alter table public.kiosk_devices add constraint kiosk_devices_paired_by_check
  check (paired_by in ('pin', 'host', 'code', 'network', 'pending'));

-- Tablets already paired are numbered in the order they were paired.
with numbered as (
  select id, row_number() over (partition by property_id order by created_at) as n
  from public.kiosk_devices where number is null
)
update public.kiosk_devices d set number = least(n, 99) from numbered where d.id = numbered.id;

-- Pair new tablets that open the kiosk on the same Wi-Fi (or close by) as one already in use.
alter table public.properties add column if not exists kiosk_auto_pair boolean not null default true;

-- A welcome for one tablet; the property's own row in kiosk_messages is for all of them.
create table if not exists public.kiosk_device_messages (
  device_id uuid primary key references public.kiosk_devices(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  headline text not null check (char_length(headline) between 1 and 80),
  body text check (body is null or char_length(body) <= 300),
  booking_id uuid references public.bookings(id) on delete set null,
  version integer not null default 1,
  created_by uuid,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  cleared_at timestamptz,
  dismissed_at timestamptz,
  dismissed_version integer
);
create index if not exists kiosk_device_messages_property_idx on public.kiosk_device_messages(property_id);
alter table public.kiosk_device_messages enable row level security;
grant all on public.kiosk_device_messages to service_role;
grant select on public.kiosk_device_messages to authenticated;
drop policy if exists kiosk_device_messages_read on public.kiosk_device_messages;
create policy kiosk_device_messages_read on public.kiosk_device_messages for select to authenticated
  using (public.is_host_member(public.property_host_id(property_id)));
drop policy if exists kiosk_device_messages_property_scope on public.kiosk_device_messages;
create policy kiosk_device_messages_property_scope on public.kiosk_device_messages as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));

-- The latest camera snapshot from a tablet while its host watches; overwritten each time, cleared when they stop.
create table if not exists public.kiosk_snapshots (
  device_id uuid primary key references public.kiosk_devices(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  image text not null check (char_length(image) <= 300000),
  taken_at timestamptz not null default now()
);
alter table public.kiosk_snapshots enable row level security;
grant all on public.kiosk_snapshots to service_role;
