-- Door tablets know what they are (src/lib/device-model.ts: maker, model, variant, size, OS,
-- browser) and how often they're used (seen_days: distinct days reported), so tablets opened
-- once or twice and never again are removed by the daily sweep (forgetDevice in
-- src/lib/kiosk-devices.ts). Visits keep the page's host, so preview and local builds can be
-- told apart in visitor analytics (teamReason in src/lib/analytics.ts). Additive.
alter table public.kiosk_devices add column if not exists device_info jsonb;
alter table public.kiosk_devices add column if not exists seen_days integer not null default 1
  check (seen_days >= 0);
alter table public.kiosk_devices add column if not exists last_day date;
-- Tablets already in use across more than two days count as kept, never as temporary.
update public.kiosk_devices
  set seen_days = 3, last_day = (last_seen_at at time zone 'utc')::date
  where last_day is null and last_seen_at is not null and last_seen_at - created_at > interval '2 days';
update public.kiosk_devices
  set last_day = (last_seen_at at time zone 'utc')::date
  where last_day is null and last_seen_at is not null;

alter table public.analytics_visits add column if not exists page_host text
  check (page_host is null or char_length(page_host) <= 120);
