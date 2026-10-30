-- How a door tablet updates when its host asks (src/lib/app-update.ts):
-- "now" reloads straight away, "idle" waits until nobody has used it for
-- 15 minutes. Additive.
alter table public.kiosk_devices add column if not exists update_mode text check (update_mode is null or update_mode in ('now', 'idle'));
