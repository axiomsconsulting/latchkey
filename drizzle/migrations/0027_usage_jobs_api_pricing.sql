-- Usage counters, routine controls, the API and MCP server, and plans.

-- ============ USAGE ============
-- Daily counts of everything that costs Lovable Run credits, per business
-- (host_id null for site-wide work such as scheduled jobs).
create table if not exists public.usage_daily (
  day date not null default current_date,
  host_id uuid references public.hosts(id) on delete cascade,
  metric text not null check (metric ~ '^[a-z0-9_:.-]{2,60}$'),
  count bigint not null default 0,
  unique nulls not distinct (day, host_id, metric)
);
create index if not exists usage_daily_metric_idx on public.usage_daily(metric, day desc);
alter table public.usage_daily enable row level security;
grant all on public.usage_daily to service_role;
grant select on public.usage_daily to authenticated;
drop policy if exists usage_daily_read on public.usage_daily;
create policy usage_daily_read on public.usage_daily for select to authenticated
  using (public.is_super_admin() or (host_id is not null and public.is_host_member(host_id)));

create or replace function public.bump_usage(_host_id uuid, _metric text, _n bigint default 1)
returns void language sql security definer set search_path = public as $$
  insert into public.usage_daily (day, host_id, metric, count) values (current_date, _host_id, _metric, _n)
  on conflict (day, host_id, metric) do update set count = public.usage_daily.count + excluded.count
$$;
revoke all on function public.bump_usage(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, text, bigint) to service_role;

-- ============ ROUTINES ============
-- Every scheduled job and credit-using feature, with an on/off switch and,
-- for scheduled ones, how often it may actually run. Lovable's scheduler
-- still wakes the cron route; a job that is off or not yet due is skipped.
create table if not exists public.job_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  enabled boolean not null default true,
  every_minutes integer check (every_minutes is null or every_minutes between 5 and 44640),
  last_run_at timestamptz,
  last_status text check (last_status is null or char_length(last_status) <= 300),
  last_duration_ms integer,
  updated_at timestamptz not null default now()
);
alter table public.job_settings enable row level security;
grant all on public.job_settings to service_role;
grant select, update on public.job_settings to authenticated;
drop policy if exists job_settings_admin on public.job_settings;
create policy job_settings_admin on public.job_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ============ PLANS AND THE API ADD-ON ============
alter table public.hosts
  add column if not exists plan_key text not null default 'grow' check (plan_key ~ '^[a-z0-9_]{2,30}$'),
  add column if not exists api_addon boolean not null default false;

-- The pricing studio: plans and features, the cost model, and projections.
alter table public.site_settings
  add column if not exists pricing_model jsonb,
  add column if not exists cost_model jsonb,
  add column if not exists projection jsonb;

-- ============ API KEYS ============
-- Shown once when made; only a hash is kept. "read" lists things; "write"
-- also creates and changes bookings and sends guests messages.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prefix text not null check (char_length(prefix) between 8 and 20),
  key_hash text not null unique,
  scopes text[] not null default '{read}' check (scopes <@ array['read', 'write']::text[]),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_host_idx on public.api_keys(host_id);
alter table public.api_keys enable row level security;
grant all on public.api_keys to service_role;
grant select on public.api_keys to authenticated;
drop policy if exists api_keys_read on public.api_keys;
create policy api_keys_read on public.api_keys for select to authenticated
  using (public.can_write_host(host_id) or public.is_super_admin());

-- Plan and add-on are billing fields: only Latchkey's server or the super admin sets them.
create or replace function public.protect_billing_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  new.subscription_status := old.subscription_status;
  new.trial_started_at := old.trial_started_at;
  new.trial_ends_at := old.trial_ends_at;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.current_period_end := old.current_period_end;
  new.canceled_at := old.canceled_at;
  new.stripe_account_id := old.stripe_account_id;
  new.stripe_account_ready := old.stripe_account_ready;
  new.stripe_account_checked_at := old.stripe_account_checked_at;
  new.uses_platform_stripe := old.uses_platform_stripe;
  new.plan_key := old.plan_key;
  new.api_addon := old.api_addon;
  if new.support_access_until is not null and new.support_access_until > now() + interval '30 days 1 minute' then
    new.support_access_until := now() + interval '30 days';
  end if;
  return new;
end $$;
