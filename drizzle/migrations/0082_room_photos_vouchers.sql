-- Room photos grouped by space for the booking page (room_photos), the AI photo sorting trial
-- (ai_feature_trials, server only), and Loyalty discount vouchers for direct stays
-- (direct_vouchers). Additive only.

create table if not exists public.room_photos (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  -- null: a shared space of the property (garden, kitchen, outside).
  room_id uuid references public.rooms(id) on delete cascade,
  space text not null default 'other' check (char_length(space) between 1 and 40),
  caption text check (caption is null or char_length(caption) <= 140),
  path text not null,
  url text not null,
  position integer not null default 0,
  ai_sorted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists room_photos_room on public.room_photos (property_id, room_id, position);

alter table public.room_photos enable row level security;
grant all on public.room_photos to service_role;
grant select on public.room_photos to authenticated;
drop policy if exists room_photos_read on public.room_photos;
create policy room_photos_read on public.room_photos for select to authenticated using (public.is_host_member(host_id));
drop policy if exists room_photos_property_scope on public.room_photos;
create policy room_photos_property_scope on public.room_photos as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));

-- Which rooms a business has tried an AI feature on (the free trial without the AI add-on).
create table if not exists public.ai_feature_trials (
  host_id uuid not null references public.hosts(id) on delete cascade,
  feature text not null,
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (host_id, feature, subject_id)
);
alter table public.ai_feature_trials enable row level security;
grant all on public.ai_feature_trials to service_role;

create table if not exists public.direct_vouchers (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9-]{4,24}$'),
  guest_name text not null check (char_length(guest_name) between 2 and 120),
  guest_email text,
  guest_phone text,
  room_ids uuid[] not null,
  -- [{from, to}] stay dates (inclusive nights) the voucher covers.
  periods jsonb not null default '[]'::jsonb,
  kind text not null check (kind in ('percent', 'price')),
  -- Percent off (1-100), or the price per night in hundredths of the currency.
  value integer not null check (value > 0),
  currency text not null default 'GBP',
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'active' check (status in ('active', 'used', 'cancelled')),
  used_at timestamptz,
  reservation_id uuid references public.direct_reservations(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (property_id, code)
);
create index if not exists direct_vouchers_host on public.direct_vouchers (host_id, created_at desc);

alter table public.direct_vouchers enable row level security;
grant all on public.direct_vouchers to service_role;
grant select on public.direct_vouchers to authenticated;
drop policy if exists direct_vouchers_read on public.direct_vouchers;
create policy direct_vouchers_read on public.direct_vouchers for select to authenticated using (public.can_read_private(host_id));
drop policy if exists direct_vouchers_property_scope on public.direct_vouchers;
create policy direct_vouchers_property_scope on public.direct_vouchers as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));
