-- One direct reservation can hold several rooms (one booking per room, so
-- each room is held and shows on its own calendar). room_list lists them:
-- [{room_id, booking_id, name, guests, total_pence}]; room_id/booking_id stay
-- the first room's for older code. children: how many of the guests are
-- children, when the host asks (properties.direct_booking.children).
alter table public.direct_reservations add column if not exists room_list jsonb not null default '[]'::jsonb;
alter table public.direct_reservations add column if not exists children int not null default 0 check (children between 0 and 19);
