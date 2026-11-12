-- The AI receptionist (src/lib/receptionist.ts): each property's settings (on, guests' phones,
-- voice matching, topics, detail, name, the host's instructions) and, per door tablet, whether it
-- runs there. Off everywhere until the host turns it on. Additive.
alter table public.properties add column if not exists receptionist jsonb;
alter table public.kiosk_devices add column if not exists receptionist boolean not null default false;
