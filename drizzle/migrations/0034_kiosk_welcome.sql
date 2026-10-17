-- A welcome the host puts on the front-door kiosk for a guest about to
-- arrive: full screen, tap to dismiss and check in. One per property; the
-- host can change or remove it while it shows. version goes up on every
-- change so a kiosk shows an updated message again even after a tap.
create table if not exists public.kiosk_messages (
  property_id uuid primary key references public.properties(id) on delete cascade,
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
alter table public.kiosk_messages enable row level security;
grant all on public.kiosk_messages to service_role;
grant select, insert, update, delete on public.kiosk_messages to authenticated;
drop policy if exists kiosk_messages_read on public.kiosk_messages;
create policy kiosk_messages_read on public.kiosk_messages for select to authenticated
  using (public.is_host_member(public.property_host_id(property_id)));
drop policy if exists kiosk_messages_write on public.kiosk_messages;
create policy kiosk_messages_write on public.kiosk_messages for all to authenticated
  using (public.can_write_host(public.property_host_id(property_id)))
  with check (public.can_write_host(public.property_host_id(property_id)));
