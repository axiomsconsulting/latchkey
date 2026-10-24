-- Direct booking and payment on the "Stay with us" page, when the host allows
-- it (properties.direct_booking, normalised by src/lib/direct-booking.ts):
-- instant booking when a room is free, refundable and non-refundable rates,
-- and how guests may pay (card through the host's Stripe account, bank
-- transfer, or at the property). Bank details are structured per country
-- (hosts.bank_account, src/lib/bank-details.ts) instead of a text box.
alter table public.properties add column if not exists direct_booking jsonb not null default '{}'::jsonb;
alter table public.hosts add column if not exists bank_account jsonb not null default '{}'::jsonb;

-- One row per direct reservation made on the page. The booking it creates
-- holds the room; payment state lives here. Written only by the server.
create table if not exists public.direct_reservations (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  reference text not null unique check (reference ~ '^[A-Z0-9]{6,12}$'),
  access_token text not null unique check (char_length(access_token) between 24 and 80),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) <= 30),
  guest_country text check (guest_country is null or guest_country ~ '^[A-Z]{2}$'),
  check_in date not null,
  check_out date not null,
  guests int not null check (guests between 1 and 20),
  plan text not null check (plan in ('flex', 'nonref')),
  method text not null check (method in ('card', 'bank', 'property')),
  total_pence int not null check (total_pence >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  free_cancel_until date,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'paid', 'cancelled', 'expired')),
  stripe_session_id text,
  stripe_account_id text,
  stripe_payment_intent text,
  pay_by timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists direct_reservations_host_idx on public.direct_reservations(host_id, created_at desc);
alter table public.direct_reservations enable row level security;
grant all on public.direct_reservations to service_role;
grant select, update on public.direct_reservations to authenticated;
drop policy if exists direct_reservations_read on public.direct_reservations;
create policy direct_reservations_read on public.direct_reservations for select to authenticated using (public.can_read_private(host_id));
drop policy if exists direct_reservations_write on public.direct_reservations;
create policy direct_reservations_write on public.direct_reservations for update to authenticated using (public.can_write_host(host_id)) with check (public.can_write_host(host_id));
drop policy if exists direct_reservations_property_scope on public.direct_reservations;
create policy direct_reservations_property_scope on public.direct_reservations as restrictive for all to authenticated using (public.property_visible(property_id)) with check (public.property_visible(property_id));
