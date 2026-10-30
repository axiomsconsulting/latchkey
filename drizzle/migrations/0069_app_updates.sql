-- App updates (src/lib/app-update.ts): Latchkey admin's update requests for
-- every host dashboard and every door tablet ({ hosts, kiosks }: when, now or
-- scheduled), and a host's request for their own tablets. Devices reload by
-- themselves once nobody has used them for 15 minutes. Additive.
alter table public.site_settings add column if not exists app_updates jsonb not null default '{}'::jsonb;
alter table public.kiosk_devices add column if not exists update_requested_at timestamptz;
