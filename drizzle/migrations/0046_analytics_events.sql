-- Launch funnel analytics (src/lib/analytics.ts EVENT_NAMES), the full utm_*
-- set on visits, and no more raw IP addresses: visits keep a one-day hash
-- (src/lib/ip-hash.server.ts), country and region only.
alter table public.analytics_visits
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists ip_hash text;

-- Addresses and towns already stored are cleared now.
update public.analytics_visits set ip = null, city = null where ip is not null or city is not null;

create table if not exists public.analytics_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  visitor_id uuid,
  visit_id uuid,
  name text not null check (name in ('tour_view', 'tour_complete', 'demo_host_view', 'trial_signup_started', 'trial_signup_completed')),
  path text check (path is null or char_length(path) <= 300),
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 2048)
);
create index if not exists analytics_events_name_at_idx on public.analytics_events (name, at desc);
create index if not exists analytics_events_at_idx on public.analytics_events (at desc);

-- Same as the other analytics tables (0028): written by the server, read by super admins.
alter table public.analytics_events enable row level security;
grant all on public.analytics_events to service_role;
grant usage, select on sequence public.analytics_events_id_seq to service_role;
grant select on public.analytics_events to authenticated;
drop policy if exists analytics_events_admin on public.analytics_events;
create policy analytics_events_admin on public.analytics_events for select to authenticated using (public.is_super_admin());
