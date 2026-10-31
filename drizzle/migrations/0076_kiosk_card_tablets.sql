-- Guest cards on chosen door tablets, and a quick "cards changed" stamp (src/lib/kiosk-picker.ts).
-- welcome_card_devices / goodbye_card_devices: the kiosk_devices ids the card shows on (null = every tablet).
-- kiosk_cards_at: bumped whenever the host shows or takes off a card, so tablets that check often
-- (older tablets, or ones whose live connection dropped) react within seconds. Additive.
alter table public.bookings add column if not exists welcome_card_devices uuid[];
alter table public.bookings add column if not exists goodbye_card_devices uuid[];
alter table public.properties add column if not exists kiosk_cards_at timestamptz;
