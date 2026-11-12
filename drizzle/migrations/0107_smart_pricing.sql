-- Smart pricing for direct stays (src/lib/smart-pricing.ts). properties.smart_pricing holds the
-- host's settings (schedule, where the direct price sits, each room's lowest price, site
-- commissions and discounts, other properties' links). rate_readings keeps the prices Latchkey read
-- on the booking sites for sample stays: members read them; only the server writes. Additive.
alter table public.properties add column if not exists smart_pricing jsonb;

create table if not exists public.rate_readings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid,
  kind text not null check (kind in ('own', 'market')),
  site text not null check (char_length(site) between 1 and 40),
  url text not null check (char_length(url) between 8 and 600),
  label text,
  check_in date not null,
  nights smallint not null check (nights between 1 and 30),
  nightly_pence integer check (nightly_pence is null or nightly_pence >= 0),
  currency text,
  available boolean,
  note text,
  seen_at timestamptz not null default now()
);
create index if not exists rate_readings_property_seen on public.rate_readings (property_id, seen_at desc);
alter table public.rate_readings enable row level security;
grant all on public.rate_readings to service_role;
grant select on public.rate_readings to authenticated;
drop policy if exists rate_readings_read on public.rate_readings;
create policy rate_readings_read on public.rate_readings for select to authenticated
  using (public.is_host_member(public.property_host_id(property_id)));
drop policy if exists rate_readings_property_scope on public.rate_readings;
create policy rate_readings_property_scope on public.rate_readings as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));
