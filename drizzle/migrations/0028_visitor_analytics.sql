-- Visitor analytics for the super admin, CDP style:
--  - analytics_visitors: one per browser (a random id kept in that browser)
--  - analytics_visits: page views 30 minutes apart or less are one visit
--  - analytics_views: each page, with how long it was looked at
--  - analytics_profiles + analytics_identities: people. Deterministic
--    matching on user id and email (hashed) joins browsers to one person
--    and merges profiles that turn out to be the same person.
-- Only the service role writes; only super admins read.

create table if not exists public.analytics_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email text check (email is null or char_length(email) <= 254),
  host_id uuid references public.hosts(id) on delete set null,
  -- When the person first gave an email (anonymous → known).
  known_at timestamptz,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.analytics_identities (
  kind text not null check (kind in ('user_id', 'email')),
  value_hash text not null check (char_length(value_hash) = 64),
  profile_id uuid not null references public.analytics_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, value_hash)
);
create index if not exists analytics_identities_profile on public.analytics_identities (profile_id);

create table if not exists public.analytics_visitors (
  id uuid primary key,
  profile_id uuid references public.analytics_profiles(id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  browser text,
  os text,
  device text,
  language text,
  timezone text,
  is_bot boolean not null default false,
  bot_reason text,
  first_referrer text,
  first_path text
);
create index if not exists analytics_visitors_profile on public.analytics_visitors (profile_id);

create table if not exists public.analytics_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.analytics_visitors(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  pages integer not null default 0,
  duration_ms bigint not null default 0,
  entry_path text,
  exit_path text,
  referrer text,
  utm_source text,
  ip text,
  country text,
  region text,
  city text,
  is_bot boolean not null default false
);
create index if not exists analytics_visits_started on public.analytics_visits (started_at desc);
create index if not exists analytics_visits_visitor on public.analytics_visits (visitor_id, last_at desc);

create table if not exists public.analytics_views (
  id uuid primary key,
  visit_id uuid not null references public.analytics_visits(id) on delete cascade,
  visitor_id uuid not null references public.analytics_visitors(id) on delete cascade,
  path text not null check (char_length(path) <= 300),
  title text check (title is null or char_length(title) <= 200),
  at timestamptz not null default now(),
  duration_ms integer not null default 0
);
create index if not exists analytics_views_at on public.analytics_views (at desc);
create index if not exists analytics_views_visit on public.analytics_views (visit_id);

do $$
declare t text;
begin
  foreach t in array array['analytics_profiles', 'analytics_identities', 'analytics_visitors', 'analytics_visits', 'analytics_views'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_super_admin())', t || '_admin', t);
  end loop;
end $$;

-- How long a page was looked at. The browser sends the running total, so
-- repeats only add what's new to the visit.
create or replace function public.analytics_leave(_view uuid, _visitor uuid, _ms integer)
returns void language plpgsql security definer set search_path = public as $$
declare old integer; v uuid;
begin
  select duration_ms, visit_id into old, v from analytics_views where id = _view and visitor_id = _visitor;
  if v is null or _ms <= old then return; end if;
  update analytics_views set duration_ms = _ms where id = _view;
  update analytics_visits set duration_ms = duration_ms + (_ms - old) where id = v;
end $$;

-- Deterministic identity matching. Profiles found by user id, by email, or
-- through this browser are one person and merge into the oldest. A browser
-- last used by a different account is moved to this person, never merged.
create or replace function public.analytics_identify(
  _visitor uuid, _user_id uuid, _user_hash text, _email text, _email_hash text, _host_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  p_user uuid; p_email uuid; p_vis uuid; vis_user uuid; survivor uuid;
  first_ts timestamptz; known_ts timestamptz;
begin
  select profile_id into p_user from analytics_identities where kind = 'user_id' and value_hash = _user_hash;
  if _email_hash is not null then
    select profile_id into p_email from analytics_identities where kind = 'email' and value_hash = _email_hash;
  end if;
  select profile_id into p_vis from analytics_visitors where id = _visitor;
  if p_vis is not null then
    select user_id into vis_user from analytics_profiles where id = p_vis;
    if vis_user is not null and vis_user <> _user_id then p_vis := null; end if;
  end if;

  select id into survivor from analytics_profiles where id in (p_user, p_email, p_vis) order by first_seen limit 1;
  if survivor is null then
    insert into analytics_profiles default values returning id into survivor;
  end if;

  select min(first_seen), min(known_at) into first_ts, known_ts from analytics_profiles where id in (survivor, p_user, p_email, p_vis);
  update analytics_visitors set profile_id = survivor where profile_id in (p_user, p_email, p_vis) and profile_id <> survivor;
  update analytics_identities set profile_id = survivor where profile_id in (p_user, p_email, p_vis) and profile_id <> survivor;
  delete from analytics_profiles where id in (p_user, p_email, p_vis) and id <> survivor;

  -- The browser's own first visit counts too, so anonymous time is kept.
  select least(first_ts, (select first_seen from analytics_visitors where id = _visitor)) into first_ts;
  update analytics_profiles set
    user_id = _user_id,
    email = coalesce(_email, email),
    host_id = coalesce(_host_id, host_id),
    known_at = coalesce(known_ts, case when _email is not null then now() end),
    first_seen = coalesce(first_ts, first_seen),
    last_seen = now()
  where id = survivor;

  insert into analytics_identities (kind, value_hash, profile_id) values ('user_id', _user_hash, survivor)
    on conflict (kind, value_hash) do update set profile_id = excluded.profile_id;
  if _email_hash is not null then
    insert into analytics_identities (kind, value_hash, profile_id) values ('email', _email_hash, survivor)
      on conflict (kind, value_hash) do update set profile_id = excluded.profile_id;
  end if;

  insert into analytics_visitors (id, profile_id) values (_visitor, survivor)
    on conflict (id) do update set profile_id = excluded.profile_id, last_seen = now();
  return survivor;
end $$;

revoke all on function public.analytics_leave(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.analytics_identify(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.analytics_leave(uuid, uuid, integer) to service_role;
grant execute on function public.analytics_identify(uuid, uuid, text, text, text, uuid) to service_role;
