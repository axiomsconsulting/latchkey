-- Subscriptions, the super admin, support access, announcements, site
-- settings, trial-abuse flags and feedback.

-- ============ SUPER ADMIN ============
-- Listed by email and only once that email is confirmed.
create table if not exists public.super_admins (email text primary key check (email = lower(email)));
insert into public.super_admins (email) values ('swapnil.kashyap@gmail.com') on conflict do nothing;
alter table public.super_admins enable row level security;
revoke all on public.super_admins from anon, authenticated;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u join public.super_admins s on s.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;
grant execute on function public.is_super_admin() to authenticated;

-- ============ SUBSCRIPTIONS ============
-- trialing until trial_ends_at; active while Stripe bills; past_due while
-- Stripe retries a failed payment; canceled or expired means no access;
-- comped is free (the shared demo, the super admin's own, or by hand).
alter table public.hosts
  add column if not exists subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'comped')),
  add column if not exists trial_started_at timestamptz not null default now(),
  add column if not exists trial_ends_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists canceled_at timestamptz,
  -- The owner lets support make changes until then; null means read only.
  add column if not exists support_access_until timestamptz;

create or replace function public.platform_trial_days()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select trial_days from public.platform_pricing where id = 1), 30)
$$;

-- Hosts already here get the full trial from when they joined, and at least
-- two weeks from today, so nobody is locked out by this update.
update public.hosts
  set trial_started_at = created_at,
      trial_ends_at = greatest(created_at + make_interval(days => public.platform_trial_days()), now() + interval '14 days')
  where trial_ends_at is null;
update public.hosts set subscription_status = 'comped' where contact_email = 'demo@latchkey.omsestates.uk';

create or replace function public.start_host_trial()
returns trigger language plpgsql set search_path = public as $$
begin
  new.trial_started_at := now();
  new.trial_ends_at := now() + make_interval(days => public.platform_trial_days());
  new.subscription_status := 'trialing';
  return new;
end $$;
drop trigger if exists start_host_trial on public.hosts;
create trigger start_host_trial before insert on public.hosts for each row execute function public.start_host_trial();

-- Only Latchkey's server and the super admin set billing fields; an owner
-- editing their business details can't give themselves a free plan.
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
  -- Support access is the owner's to give, and never for more than 30 days.
  if new.support_access_until is not null and new.support_access_until > now() + interval '30 days 1 minute' then
    new.support_access_until := now() + interval '30 days';
  end if;
  return new;
end $$;
drop trigger if exists protect_billing_fields on public.hosts;
create trigger protect_billing_fields before update on public.hosts for each row execute function public.protect_billing_fields();

create or replace function public.host_has_access(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select h.subscription_status in ('active', 'past_due', 'comped')
        or (h.subscription_status = 'trialing' and (h.trial_ends_at is null or h.trial_ends_at > now()))
    from public.hosts h where h.id = _host_id
  ), false)
$$;
grant execute on function public.host_has_access(uuid) to anon, authenticated;

-- ============ ACCESS: MEMBERS, SUPPORT, SUBSCRIPTION ============
create or replace function public.host_writer(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.host_members m
    where m.host_id = _host_id and m.user_id = auth.uid() and m.role::text in ('owner', 'manager', 'co_host'))
$$;

/** The super admin acting as support, while the host allows it. */
create or replace function public.support_can_write(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
     and exists (select 1 from public.hosts h where h.id = _host_id and h.support_access_until > now())
$$;

-- Everyone on the team can read; the super admin can always look.
create or replace function public.is_host_member(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.host_members m where m.host_id = _host_id and m.user_id = auth.uid())
      or public.is_super_admin()
$$;

-- Changes need a paid-up (or trialing) account, or support access.
create or replace function public.can_write_host(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.host_writer(_host_id) and public.host_has_access(_host_id))
      or public.support_can_write(_host_id)
$$;

-- Guests' ID records, the register and invoices: the host's own staff even
-- after their subscription ends (the register must be kept), and support
-- only while the host allows it.
create or replace function public.can_read_private(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.host_writer(_host_id) or public.support_can_write(_host_id)
$$;
grant execute on function public.can_read_private(uuid) to authenticated;

drop policy if exists guest_ids_staff_read on public.guest_ids;
create policy guest_ids_staff_read on public.guest_ids for select to authenticated
  using (public.can_read_private(public.property_host_id(property_id)));
drop policy if exists guest_register_staff_read on public.guest_register;
create policy guest_register_staff_read on public.guest_register for select to authenticated
  using (public.can_read_private(host_id));
drop policy if exists invoices_staff_read on public.invoices;
create policy invoices_staff_read on public.invoices for select to authenticated
  using (public.can_read_private(host_id));

-- The super admin picks which host to look at in the dashboard.
alter table public.user_prefs add column if not exists support_host_id uuid references public.hosts(id) on delete set null;

-- ============ SITE SETTINGS ============
create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  signups_open boolean not null default true,
  support_email text check (support_email is null or char_length(support_email) <= 254),
  notice text check (notice is null or char_length(notice) <= 300),
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict do nothing;
alter table public.site_settings enable row level security;
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists site_settings_admin on public.site_settings;
create policy site_settings_admin on public.site_settings for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ============ ANNOUNCEMENTS AND MESSAGES ============
-- host_id null: everyone. Each person sees each one once, then dismisses it.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references public.hosts(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.announcement_dismissals (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.announcements enable row level security;
alter table public.announcement_dismissals enable row level security;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert on public.announcement_dismissals to authenticated;
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (public.is_super_admin() or (active and (expires_at is null or expires_at > now())
         and (host_id is null or exists (select 1 from public.host_members m where m.host_id = announcements.host_id and m.user_id = auth.uid()))));
drop policy if exists announcements_admin on public.announcements;
create policy announcements_admin on public.announcements for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists dismissals_own on public.announcement_dismissals;
create policy dismissals_own on public.announcement_dismissals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ TRIAL ABUSE FLAGS ============
create table if not exists public.trial_flags (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  matched_host_id uuid references public.hosts(id) on delete set null,
  reason text not null check (reason in ('same_address', 'same_email')),
  detail text not null check (char_length(detail) <= 400),
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 400),
  created_at timestamptz not null default now(),
  unique (host_id, matched_host_id, reason)
);
alter table public.trial_flags enable row level security;
grant select, update on public.trial_flags to authenticated;
drop policy if exists trial_flags_admin on public.trial_flags;
create policy trial_flags_admin on public.trial_flags for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.address_key(_address text, _postcode text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(_postcode, ''), '[^A-Za-z0-9]', '', 'g')), '')
      || ':' || left(lower(regexp_replace(coalesce(_address, ''), '[^A-Za-z0-9]', '', 'g')), 16)
$$;

-- A property at an address another business already used means someone
-- may be starting a fresh trial for the same place.
create or replace function public.flag_repeat_property()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  other record;
begin
  if public.address_key(new.address, new.postcode) is null or new.is_demo then
    return new;
  end if;
  for other in
    select p.host_id, p.name from public.properties p
    where p.host_id <> new.host_id and not p.is_demo
      and public.address_key(p.address, p.postcode) = public.address_key(new.address, new.postcode)
  loop
    insert into public.trial_flags (host_id, matched_host_id, reason, detail)
    values (new.host_id, other.host_id, 'same_address',
            format('"%s" at %s %s matches "%s" from another account.', new.name, coalesce(new.address, ''), coalesce(new.postcode, ''), other.name))
    on conflict do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists flag_repeat_property on public.properties;
create trigger flag_repeat_property after insert or update of address, postcode on public.properties
  for each row execute function public.flag_repeat_property();

create or replace function public.flag_repeat_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  other record;
begin
  if new.contact_email is null or new.contact_email = '' or new.contact_email = 'demo@latchkey.omsestates.uk' then
    return new;
  end if;
  for other in
    select h.id from public.hosts h where h.id <> new.id and lower(h.contact_email) = lower(new.contact_email)
  loop
    insert into public.trial_flags (host_id, matched_host_id, reason, detail)
    values (new.id, other.id, 'same_email', format('Contact email %s is already used by another account.', new.contact_email))
    on conflict do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists flag_repeat_email on public.hosts;
create trigger flag_repeat_email after insert or update of contact_email on public.hosts
  for each row execute function public.flag_repeat_email();

-- ============ FEEDBACK ============
-- guest_review: from a guest's guest guide, for their host.
-- host_rating, feature, bug: from a host, for the super admin.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('guest_review', 'host_rating', 'feature', 'bug')),
  rating smallint check (rating is null or rating between 1 and 5),
  message text check (message is null or char_length(message) <= 2000),
  host_id uuid references public.hosts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  page text check (page is null or char_length(page) <= 300),
  status text not null default 'new' check (status in ('new', 'seen', 'planned', 'done')),
  created_at timestamptz not null default now(),
  constraint feedback_has_something check (rating is not null or (message is not null and message <> ''))
);
create index if not exists feedback_host_idx on public.feedback(host_id, created_at desc);
alter table public.feedback enable row level security;
grant select, insert, update on public.feedback to authenticated;
grant all on public.feedback to service_role;
drop policy if exists feedback_host_send on public.feedback;
create policy feedback_host_send on public.feedback for insert to authenticated
  with check (kind in ('host_rating', 'feature', 'bug') and user_id = auth.uid()
              and (host_id is null or public.is_host_member(host_id)));
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid()
         or (kind = 'guest_review' and exists (select 1 from public.host_members m where m.host_id = feedback.host_id and m.user_id = auth.uid())));
drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ============ ANALYTICS ============
-- One row per business for the super admin: size, use and billing.
create or replace function public.admin_host_stats()
returns table (
  host_id uuid,
  business_name text,
  owner_email text,
  created_at timestamptz,
  subscription_status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  support_access_until timestamptz,
  properties integer,
  rooms_per_property integer[],
  bookings_total integer,
  bookings_30d integer,
  checkins_30d integer,
  channels jsonb,
  last_sign_in_at timestamptz,
  is_demo boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super admin only.' using errcode = 'P0001';
  end if;
  return query
  select h.id, h.business_name,
    (select u.email::text from public.host_members m join auth.users u on u.id = m.user_id
       where m.host_id = h.id and m.role::text = 'owner' order by m.created_at limit 1),
    h.created_at, h.subscription_status, h.trial_ends_at, h.current_period_end, h.support_access_until,
    (select count(*)::int from public.properties p where p.host_id = h.id and not p.is_demo),
    coalesce((select array_agg(greatest(1, (select count(*) from public.rooms r where r.property_id = p.id and r.active))::int order by p.created_at)
       from public.properties p where p.host_id = h.id and not p.is_demo), '{}'),
    (select count(*)::int from public.bookings b join public.properties p on p.id = b.property_id where p.host_id = h.id and not b.is_demo),
    (select count(*)::int from public.bookings b join public.properties p on p.id = b.property_id
       where p.host_id = h.id and not b.is_demo and b.created_at > now() - interval '30 days'),
    (select count(*)::int from public.bookings b join public.properties p on p.id = b.property_id
       where p.host_id = h.id and b.checked_in_at > now() - interval '30 days'),
    coalesce((select jsonb_object_agg(c.channel, c.n) from (
       select b.channel::text as channel, count(*) as n from public.bookings b join public.properties p on p.id = b.property_id
       where p.host_id = h.id and not b.is_demo group by b.channel) c), '{}'::jsonb),
    (select max(u.last_sign_in_at) from public.host_members m join auth.users u on u.id = m.user_id where m.host_id = h.id),
    h.contact_email = 'demo@latchkey.omsestates.uk'
  from public.hosts h
  order by h.created_at desc;
end $$;
revoke all on function public.admin_host_stats() from public, anon;
grant execute on function public.admin_host_stats() to authenticated;

-- ============ CLEAR REASONS WHEN A CHANGE IS REFUSED ============
create or replace function public.require_host_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  h uuid;
begin
  -- Latchkey's server (service role) has no user and is never limited here.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  h := public.row_host_id(tg_table_name, r);
  if h is not null and public.is_host_member(h) and not public.can_write_host(h) then
    if public.host_writer(h) and not public.host_has_access(h) then
      raise exception 'Your Latchkey trial or subscription has ended. Subscribe in Billing to make changes.' using errcode = 'P0001';
    elsif public.is_super_admin() and not public.host_writer(h) then
      raise exception 'Support view is read-only until this host allows support access in their settings.' using errcode = 'P0001';
    end if;
    raise exception 'You have read-only access to this host.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
