-- The check-in journey (src/lib/checkin-flow.ts): the steps a host ticks on
-- or off per property, Latchkey's starting journey for new properties with
-- steps required or removed for everyone, and each paired door tablet's
-- display and screen calibration. Additive only.

-- null = follows Latchkey's starting journey (site_settings.checkin_flow.defaults).
alter table public.properties add column if not exists checkin_flow jsonb;

-- Properties set up before the journey keep exactly what they ask today:
-- the same switches from checkin_methods and guest_records, with the new
-- steps on (the welcome's Check in button, "Is this you?", three check-out
-- choices, the front camera on a door tablet).
update public.properties
set checkin_flow = jsonb_build_object(
  'steps', jsonb_build_object(
    'welcome_go', true,
    'find_letter', true,
    'find_checkout', true,
    'find_confirm', true,
    'party', coalesce((guest_records->>'askWhoIsStaying')::boolean, true),
    'lead_id', coalesce((checkin_methods->'enabled'->>'photo_id')::boolean, true),
    'keep_id', coalesce((guest_records->>'idPhoto')::boolean, false),
    'every_adult_id', coalesce((guest_records->>'checkEveryAdult')::boolean, true),
    'selfie', coalesce((guest_records->>'facePhoto')::boolean, false),
    'register', true,
    'last4', coalesce((checkin_methods->'enabled'->>'last4')::boolean, true),
    'self_declare', true
  ),
  'checkout', 'three',
  'idCamera', 'front',
  'selfieCamera', 'front'
)
where checkin_flow is null;

-- Latchkey admin: { defaults, required: [step], removed: [step] }.
alter table public.site_settings add column if not exists checkin_flow jsonb not null default '{}'::jsonb;

-- What each paired tablet last reported about its display (page and screen size, way up),
-- and the host's calibration per way up ({ landscape?, portrait? }), written by the server only.
alter table public.kiosk_devices add column if not exists display jsonb;
alter table public.kiosk_devices add column if not exists calibration jsonb not null default '{}'::jsonb;
alter table public.kiosk_devices add column if not exists label text check (label is null or char_length(label) <= 40);

comment on column public.bookings.id_check_status is 'matched | partial | not_matched | photo_only | last4 | self_declared. photo_only: the ID photo was kept but could not be read automatically. Result only, never the ID image.';
