-- The super admin's say over the app's shape for every host: menu items
-- (order, shown, their own items and icons) and each page's sections
-- (order, shown). Normalised by src/lib/ui-config.ts.
alter table public.site_settings add column if not exists ui jsonb not null default '{}'::jsonb;

-- Starter guide sections the super admin has taken out for NEW hosts:
-- { "removed": { "<section_key>": "<when>" } }. Hosts who signed up before
-- that moment keep the section (src/lib/guide.ts startersOffFor).
alter table public.site_settings add column if not exists guide_starters jsonb not null default '{}'::jsonb;

-- Secrets only the server reads (e.g. the Google Drive connection). No policies.
create table if not exists public.platform_secrets (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.platform_secrets enable row level security;
grant all on public.platform_secrets to service_role;

-- Each host's own folder in the attachments store. Server only.
create table if not exists public.host_storage (
  host_id uuid primary key references public.hosts(id) on delete cascade,
  provider text not null default 'google_drive',
  folder_id text not null,
  created_at timestamptz not null default now()
);
alter table public.host_storage enable row level security;
grant all on public.host_storage to service_role;

-- Photos and documents attached to a guide section, kept in the host's own
-- folder (named <section_key>-<id>). Guests see them through short-lived
-- signed links only. Written by the server.
create table if not exists public.guide_attachments (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  section_key text not null,
  provider text not null default 'google_drive',
  file_id text not null,
  name text not null check (char_length(name) between 1 and 200),
  mime text not null,
  /** How guests see it: image, pdf, or a converted office document (shown as PDF). */
  kind text not null check (kind in ('image', 'pdf', 'doc')),
  size_bytes integer not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists guide_attachments_section_idx on public.guide_attachments(property_id, section_key);
alter table public.guide_attachments enable row level security;
grant all on public.guide_attachments to service_role;
grant select on public.guide_attachments to authenticated;
drop policy if exists guide_attachments_read on public.guide_attachments;
create policy guide_attachments_read on public.guide_attachments for select to authenticated
  using (public.is_host_member(host_id));
