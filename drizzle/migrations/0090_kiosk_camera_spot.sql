-- Where each door tablet's front camera is, for each way up ({landscape:{x,y},portrait:{x,y}}, 0 to 1
-- across the screen), so the photo preview opens beside it. Null: the suggestion for that kind of
-- device (src/lib/kiosk-camera-spot.ts). Additive.
alter table public.kiosk_devices add column if not exists camera_spot jsonb;
