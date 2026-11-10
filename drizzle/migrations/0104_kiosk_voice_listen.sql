-- Voice check-in per door tablet: whether the concierge also listens to the guest (true), or
-- only talks them through the screens they tap (false: no microphone at all). Additive.
alter table public.kiosk_devices add column if not exists voice_listen boolean not null default true;
