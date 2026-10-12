-- The UK guest register (Immigration (Hotel Records) Order 1972): full name
-- and nationality of everyone aged 16 or over, plus document number, place
-- of issue and next destination for guests who aren't British, Irish or
-- Commonwealth citizens, with the arrival date. Kept for at least 12 months
-- and open to inspection, so an entry outlives the stay, room or property
-- it came from: it keeps its own copy of their names. Rules in
-- src/lib/hotel-register.ts.

create table if not exists public.guest_register (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  property_name text not null check (char_length(property_name) <= 200),
  booking_id uuid references public.bookings(id) on delete set null,
  room_name text check (room_name is null or char_length(room_name) <= 120),
  -- Matches guest_ids.position for the same stay; null for host-added entries.
  position smallint check (position is null or position between 0 and 29),
  arrival_date date not null,
  full_name text not null check (char_length(full_name) between 3 and 120),
  nationality text not null check (nationality ~ '^(GB(-[A-Z]{3})?|[A-Z]{2})$'),
  is_alien boolean not null,
  document_number text check (document_number is null or char_length(document_number) <= 40),
  place_of_issue text check (place_of_issue is null or char_length(place_of_issue) <= 80),
  next_destination text check (next_destination is null or char_length(next_destination) <= 120),
  next_address text check (next_address is null or char_length(next_address) <= 300),
  source text not null default 'guest' check (source in ('guest', 'host')),
  keep_until date not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Aliens must give all three; others give none of them.
  constraint guest_register_alien_details check (
    (is_alien and document_number is not null and place_of_issue is not null and next_destination is not null)
    or (not is_alien and document_number is null and place_of_issue is null and next_destination is null and next_address is null)
  )
);
create unique index if not exists guest_register_stay_position_idx
  on public.guest_register(booking_id, position) where booking_id is not null and position is not null;
create index if not exists guest_register_host_arrival_idx on public.guest_register(host_id, arrival_date desc);
create index if not exists guest_register_keep_until_idx on public.guest_register(keep_until);

drop trigger if exists guest_register_touch on public.guest_register;
create trigger guest_register_touch before update on public.guest_register
  for each row execute function public.touch_updated_at();

alter table public.guest_register enable row level security;
grant all on public.guest_register to service_role;
grant select, insert, update on public.guest_register to authenticated;

-- Staff read and correct it; read-only viewers don't see it. Nobody deletes
-- from the browser: entries are removed by the daily sweep after 12 months.
drop policy if exists guest_register_staff_read on public.guest_register;
create policy guest_register_staff_read on public.guest_register for select to authenticated
  using (public.is_host_staff(host_id));
drop policy if exists guest_register_staff_insert on public.guest_register;
create policy guest_register_staff_insert on public.guest_register for insert to authenticated
  with check (public.can_write_host(host_id) and source = 'host'
              and keep_until >= (arrival_date + interval '12 months')::date);
drop policy if exists guest_register_staff_update on public.guest_register;
create policy guest_register_staff_update on public.guest_register for update to authenticated
  using (public.can_write_host(host_id))
  with check (public.can_write_host(host_id) and keep_until >= (arrival_date + interval '12 months')::date);

-- The shared demo account can look but not change anything.
drop trigger if exists shared_demo_read_only on public.guest_register;
create trigger shared_demo_read_only before insert or update or delete on public.guest_register
  for each row execute function public.block_shared_demo_writes();

-- Corrections are logged, without copying anyone's details into the log.
create or replace function public.audit_redacted(_key text)
returns boolean language sql immutable as $$
  select _key in ('check_in_pin', 'wifi_password', 'feed_token', 'token_hash', 'bank_details',
                  'reservation_code', 'phone_last4', 'notes',
                  'full_name', 'document_number', 'place_of_issue', 'next_destination', 'next_address',
                  'date_of_birth', 'document_last4')
      or _key like '%\_url' or _key like 'guest\_%' or _key like '%password%'
      or _key like '%secret%' or _key like '%email%' or _key like '%phone%'
$$;
drop trigger if exists audit_row on public.guest_register;
create trigger audit_row after update or delete on public.guest_register
  for each row execute function public.audit_row();
