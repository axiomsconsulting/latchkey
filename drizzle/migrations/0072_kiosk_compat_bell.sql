-- Door tablets: compatibility mode for older tablets (src/lib/kiosk-compat.ts)
-- and the bell on the kiosk that puts today's guest cards up (src/lib/kiosk-picker.ts).
-- compat: the host's choice (null = follow what the tablet detected);
-- compat_detected / compat_reason: what the tablet's browser said about itself.
-- Additive.
alter table public.kiosk_devices add column if not exists compat boolean;
alter table public.kiosk_devices add column if not exists compat_detected boolean not null default false;
alter table public.kiosk_devices add column if not exists compat_reason text check (compat_reason is null or char_length(compat_reason) <= 120);
alter table public.properties add column if not exists kiosk_card_picker boolean not null default true;
