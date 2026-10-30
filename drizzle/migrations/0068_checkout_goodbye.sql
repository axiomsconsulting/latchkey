-- The check-out goodbye (src/lib/checkout-goodbye.ts): the host's goodbye,
-- key drop and timing per property, and when a stay's goodbye was taken off
-- the door tablet (the host dismissed it, or the guest used Express
-- check-out). Additive.
alter table public.properties add column if not exists checkout_goodbye jsonb;
alter table public.bookings add column if not exists goodbye_dismissed_at timestamptz;
alter table public.bookings add column if not exists checked_out_at timestamptz;
