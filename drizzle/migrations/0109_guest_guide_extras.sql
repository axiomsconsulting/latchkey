-- Guest guide extras: property information items (icons that open to notes, fields and photos),
-- the local area card's settings and its cached places and events, and floor plans with the
-- host's marks (entrance, stairs, lift, rooms) for the way to each room. Additive.
alter table public.properties add column if not exists property_info jsonb;
alter table public.properties add column if not exists local_guide jsonb;

-- Places from OpenStreetMap and events, read at most weekly per property. Server only.
create table if not exists public.local_places (
  property_id uuid primary key references public.properties(id) on delete cascade,
  lat double precision,
  lng double precision,
  places jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  error text
);
alter table public.local_places enable row level security;
grant all on public.local_places to service_role;

-- One row per floor: the plan's picture (private "guides" bucket) and the host's marks. Members
-- read; only the server writes.
create table if not exists public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  level smallint not null default 0 check (level between -3 and 30),
  label text check (label is null or char_length(label) <= 60),
  image_path text not null check (char_length(image_path) between 10 and 300),
  pins jsonb not null default '{"rooms":{}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists floor_plans_property on public.floor_plans (property_id, level);
alter table public.floor_plans enable row level security;
grant all on public.floor_plans to service_role;
grant select on public.floor_plans to authenticated;
drop policy if exists floor_plans_read on public.floor_plans;
create policy floor_plans_read on public.floor_plans for select to authenticated
  using (public.is_host_member(public.property_host_id(property_id)));
drop policy if exists floor_plans_property_scope on public.floor_plans;
create policy floor_plans_property_scope on public.floor_plans as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));
