-- Smart Screensaver's low power look by day, changed with the edge bands on the tablet (brightness on the
-- left, contrast on the right), kept for all the host's kiosks. Written only by the server. Additive.
alter table public.kiosk_looks
  add column if not exists day_brightness numeric(4,2) check (day_brightness is null or day_brightness between 0 and 1),
  add column if not exists day_contrast numeric(4,2) check (day_contrast is null or day_contrast between 0 and 2);
