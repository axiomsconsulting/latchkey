-- Fix: 0092's foreign key from bookings.test_room_id gave bookings two links to rooms, so every
-- query embedding rooms(...) from bookings failed ("more than one relationship was found").
-- test_room_id stays as a plain column; code treats a room that no longer exists as no room.
alter table public.bookings drop constraint if exists bookings_test_room_id_fkey;
notify pgrst, 'reload schema';
