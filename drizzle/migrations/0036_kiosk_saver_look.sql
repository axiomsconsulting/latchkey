-- Kiosk screensaver look. The super admin sets the starting brightness and the
-- smallest and largest clock size for every kiosk (site_settings.kiosk_saver,
-- normalised by src/lib/kiosk-saver.ts). Each host's own choice, made with the
-- bands on the screensaver, is one row here and applies to all their kiosks.
-- The kiosk is signed out, so it saves through the server (service role) by
-- property code; values are kept inside the limits there and by these checks.
alter table public.site_settings add column if not exists kiosk_saver jsonb not null default '{}'::jsonb;

create table if not exists public.kiosk_looks (
  host_id uuid primary key references public.hosts(id) on delete cascade,
  brightness numeric(4,2) check (brightness is null or brightness between 0.5 and 3),
  size numeric(4,2) check (size is null or size between 0.6 and 2.5),
  updated_at timestamptz not null default now()
);
alter table public.kiosk_looks enable row level security;
grant all on public.kiosk_looks to service_role;
grant select on public.kiosk_looks to authenticated;
drop policy if exists kiosk_looks_read on public.kiosk_looks;
create policy kiosk_looks_read on public.kiosk_looks for select to authenticated
  using (public.is_host_member(host_id));
