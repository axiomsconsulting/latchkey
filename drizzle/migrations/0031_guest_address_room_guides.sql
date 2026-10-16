-- The guest's postal address (0030 was applied before this part was added).
alter table public.bookings
  add column if not exists guest_address text check (guest_address is null or char_length(guest_address) <= 400);

-- In-room guides: each room's own QR code opens /room/<guide_code>, a guide
-- for that room without the door codes. Random, so codes can't be guessed.
alter table public.rooms
  add column if not exists guide_code text unique check (guide_code is null or guide_code ~ '^[a-z0-9]{10,24}$');
