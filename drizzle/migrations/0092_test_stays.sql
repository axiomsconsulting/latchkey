-- A host's own test of the check-in, from Today. A test stay never holds a room: room_id stays empty
-- (the check below makes that certain), so no calendar, availability, housekeeping or report that goes
-- by room can ever count it. The room the host wants to try is kept apart in test_room_id, which only
-- the guest's own screens read. One per property. Rules in src/lib/test-stay.ts. Additive.
alter table public.bookings
  add column if not exists is_test boolean not null default false,
  add column if not exists test_room_id uuid references public.rooms(id) on delete set null;
alter table public.bookings drop constraint if exists bookings_test_has_no_room;
alter table public.bookings add constraint bookings_test_has_no_room
  check (not is_test or room_id is null);
create unique index if not exists bookings_one_test_per_property
  on public.bookings(property_id) where is_test;
