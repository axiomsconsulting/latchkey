-- White label: the product's name, tagline and footer, set by the super admin
-- (normalised by src/lib/brand.ts). Empty means the defaults.
alter table public.site_settings add column if not exists brand jsonb not null default '{}'::jsonb;

-- A host's own domain or subdomain (e.g. stay.hillsuites.co.uk) for their
-- guests: guest pages there carry the host's name, and "/" opens their
-- property. The owner proves the domain is theirs with a DNS TXT record
-- (verified_at); the super admin then connects it on the hosting (live_at).
-- Written by the server only.
create table if not exists public.host_domains (
  domain text primary key check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' and char_length(domain) <= 253),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  verify_token text not null,
  verified_at timestamptz,
  live_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists host_domains_host_idx on public.host_domains(host_id);
alter table public.host_domains enable row level security;
grant all on public.host_domains to service_role;
grant select on public.host_domains to authenticated;
drop policy if exists host_domains_read on public.host_domains;
create policy host_domains_read on public.host_domains for select to authenticated
  using (public.is_host_member(host_id));
