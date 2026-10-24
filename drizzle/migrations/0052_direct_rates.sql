-- The "Stay with us" page as a hotel-style booking request: each room's base
-- nightly rate (hundredths of the property's currency), seasonal offers set by
-- the host (properties.direct_offers [{id, label, from, to, percent, roomIds}],
-- normalised by src/lib/direct-rates.ts), and which room and estimated total a
-- guest asked about. Nothing is booked or paid on the page: the host confirms.
alter table public.rooms add column if not exists base_rate_pence int check (base_rate_pence is null or base_rate_pence between 0 and 100000000);
alter table public.properties add column if not exists direct_offers jsonb not null default '[]'::jsonb;
alter table public.direct_enquiries
  add column if not exists room_id uuid references public.rooms(id) on delete set null,
  add column if not exists quoted_pence int check (quoted_pence is null or quoted_pence >= 0),
  add column if not exists currency text check (currency is null or currency ~ '^[A-Z]{3}$');
