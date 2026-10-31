-- What each door tablet shows right now (src/lib/kiosk-screen.ts), for the
-- host's live view: the screen (welcome, cards, the host's welcome, at rest,
-- a check-in step), whether it's full screen, and when it changed. No guest
-- details. Additive.
alter table public.kiosk_devices add column if not exists screen jsonb;
