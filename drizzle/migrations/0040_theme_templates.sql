-- Saved looks any host can start from. host_id null = shared by the platform
-- (super admin) with every host; otherwise the host's own. The look itself
-- is a theme (normalised by src/lib/theme.ts). Written by the server only.
create table if not exists public.theme_templates (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references public.hosts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  blurb text not null default '' check (char_length(blurb) <= 140),
  config jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists theme_templates_host_idx on public.theme_templates(host_id);
alter table public.theme_templates enable row level security;
grant all on public.theme_templates to service_role;
grant select on public.theme_templates to authenticated;
drop policy if exists theme_templates_read on public.theme_templates;
create policy theme_templates_read on public.theme_templates for select to authenticated
  using (host_id is null or public.is_host_member(host_id));
