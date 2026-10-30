-- Check-in cards (src/lib/checkout-goodbye.ts): the host's welcome for guests
-- arriving today on the door tablet, the same shape as the check-out
-- goodbye; and the host showing a guest's card now, or taking it off, from
-- Today. Additive.
alter table public.properties add column if not exists checkin_welcome jsonb;
alter table public.bookings add column if not exists welcome_card_dismissed_at timestamptz;
alter table public.bookings add column if not exists welcome_now_at timestamptz;
alter table public.bookings add column if not exists goodbye_now_at timestamptz;
