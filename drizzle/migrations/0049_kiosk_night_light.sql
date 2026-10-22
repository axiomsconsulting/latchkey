-- What a door kiosk shows at rest, per property (normalised by
-- src/lib/kiosk-rest.ts): a night light of softly changing colours, or the
-- clock screensaver (optionally with the check-in QR code), or nothing. The
-- host sets it on the Properties page or Today's kiosk card; the kiosk reads
-- it through the server by property code.
alter table public.properties add column if not exists kiosk_rest jsonb not null default '{}'::jsonb;

-- The night light's own look, changed with the bands on it (brightness on the
-- left, colour depth on the right), kept for all the host's kiosks beside the
-- clock screensaver's look. Written only by the server.
alter table public.kiosk_looks
  add column if not exists night_brightness numeric(4,2) check (night_brightness is null or night_brightness between 0.05 and 1),
  add column if not exists night_depth numeric(4,2) check (night_depth is null or night_depth between 0 and 1);
