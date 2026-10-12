-- Who's staying: the guest says how many adults and children arrived, each
-- extra adult can show photo ID after the lead booker, and children only give
-- an age. Rooms say how many people they sleep and whether children may stay.
-- Hosts can also add their own booking sites with a name and a small icon.

-- ============ ROOMS ============
alter table public.rooms add column if not exists children_allowed boolean not null default true;
alter table public.rooms drop constraint if exists rooms_max_guests_range;
-- Not valid: checks new and edited rooms without failing on any old odd value.
alter table public.rooms add constraint rooms_max_guests_range check (max_guests between 1 and 30) not valid;

-- ============ PROPERTY SETTINGS ============
-- Normalised in src/lib/guest-records.ts. Photos are only kept when the host
-- confirms they are registered with the data regulator.
alter table public.properties add column if not exists guest_records jsonb not null default '{}'::jsonb;

-- ============ WHO ARRIVED ============
alter table public.bookings
  add column if not exists arrived_adults integer check (arrived_adults is null or arrived_adults between 1 and 30),
  add column if not exists arrived_children integer check (arrived_children is null or arrived_children between 0 and 30),
  add column if not exists site_key text check (site_key is null or site_key ~ '^site_[a-z0-9]{4,24}$');
alter table public.checkin_sessions
  add column if not exists adults integer,
  add column if not exists children integer,
  add column if not exists companion_attempts integer not null default 0;
alter table public.channel_connections
  add column if not exists site_key text check (site_key is null or site_key ~ '^site_[a-z0-9]{4,24}$');

-- One row per person on a stay. Position 0 is the lead booker. Children have
-- an age and nothing else. Photos are low-resolution copies in the private
-- "guest-ids" bucket, referenced by path and shown through short-lived links.
create table if not exists public.guest_ids (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  position smallint not null check (position between 0 and 29),
  kind text not null check (kind in ('adult', 'child')),
  age smallint check (age is null or age between 0 and 17),
  full_name text check (full_name is null or char_length(full_name) <= 120),
  document_type text check (document_type is null or document_type in ('passport', 'driving_licence', 'national_id', 'residence_permit', 'other')),
  issuing_country text check (issuing_country is null or char_length(issuing_country) <= 60),
  date_of_birth date,
  document_expiry date,
  document_last4 text check (document_last4 is null or char_length(document_last4) <= 4),
  name_match text check (name_match is null or name_match in ('matched', 'partial', 'not_matched')),
  id_checked boolean not null default false,
  skipped boolean not null default false,
  id_photo_path text,
  face_photo_path text,
  delete_after date not null,
  created_at timestamptz not null default now(),
  unique (booking_id, position)
);
create index if not exists guest_ids_booking_idx on public.guest_ids(booking_id);
create index if not exists guest_ids_delete_after_idx on public.guest_ids(delete_after);

alter table public.guest_ids enable row level security;
grant all on public.guest_ids to service_role;
grant select, delete on public.guest_ids to authenticated;
-- ID details are for the people running the property, not read-only viewers.
drop policy if exists guest_ids_staff_read on public.guest_ids;
create policy guest_ids_staff_read on public.guest_ids for select to authenticated
  using (public.is_host_staff(public.property_host_id(property_id)));
drop policy if exists guest_ids_staff_delete on public.guest_ids;
create policy guest_ids_staff_delete on public.guest_ids for delete to authenticated
  using (public.can_write_host(public.property_host_id(property_id)));

-- ============ BOOKING SITES ============
-- Hosts add sites as they come up ("Expedia", "Our Instagram"). Built-in
-- platforms keep their fixed ids; added ones are stored as channel 'other'
-- plus a site_key. Shape: [{ key, label, icon_url }].
alter table public.hosts add column if not exists booking_sites jsonb not null default '[]'::jsonb;

create or replace function public.update_host_sites(_host_id uuid, _channel_labels jsonb, _booking_sites jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_host(_host_id) then
    raise exception 'You have read-only access.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(_booking_sites) <> 'array' or jsonb_array_length(_booking_sites) > 30 then
    raise exception 'Up to 30 booking sites, please.' using errcode = 'P0001';
  end if;
  update public.hosts set channel_labels = _channel_labels, booking_sites = _booking_sites where id = _host_id;
end $$;
revoke all on function public.update_host_sites(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_host_sites(uuid, jsonb, jsonb) to authenticated;
