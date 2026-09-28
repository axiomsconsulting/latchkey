-- ============ ENUMS ============
create type public.host_role as enum ('owner','co_host','cleaner');
create type public.booking_channel as enum ('airbnb','booking_com','homestay','direct','other');
create type public.booking_status as enum ('needs_details','upcoming','checked_in','checked_out','cancelled','flagged');
create type public.booking_source as enum ('ical','manual','csv','api');
create type public.presence_event as enum ('arrived','left','returned','checked_out');
create type public.sync_status as enum ('never','ok','warning','error');

-- ============ HOSTS / MEMBERS ============
create table public.hosts (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_phone text,
  contact_email text,
  currency text not null default 'GBP',
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now()
);

create table public.host_members (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  user_id uuid not null,
  role public.host_role not null default 'owner',
  created_at timestamptz not null default now(),
  unique (host_id, user_id)
);
create index host_members_user_idx on public.host_members(user_id);

create or replace function public.is_host_member(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.host_members m where m.host_id = _host_id and m.user_id = auth.uid())
$$;

create or replace function public.has_host_role(_host_id uuid, _role public.host_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.host_members m where m.host_id = _host_id and m.user_id = auth.uid() and m.role = _role)
$$;

create or replace function public.is_host_staff(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.host_members m where m.host_id = _host_id and m.user_id = auth.uid() and m.role in ('owner','co_host'))
$$;

-- ============ PROPERTIES ============
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  name text not null,
  address text,
  postcode text,
  short_code text not null unique,
  check_in_pin text,
  timezone text,
  default_check_in_time time not null default '15:00',
  default_check_out_time time not null default '11:00',
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  parking_notes text,
  wifi_name text,
  wifi_password text,
  host_contact_name text,
  host_contact_phone text,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index properties_active_pin_idx on public.properties(check_in_pin) where active and check_in_pin is not null;
create index properties_host_idx on public.properties(host_id);

create or replace function public.property_host_id(_property_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.host_id from public.properties p where p.id = _property_id
$$;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_number text,
  display_name text not null,
  public_title text,
  description text,
  photo_url text,
  max_guests integer not null default 2,
  has_ensuite boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index rooms_property_idx on public.rooms(property_id);

-- ============ CONNECTIONS + SECRETS ============
create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  channel public.booking_channel not null,
  listing_name text,
  masked_url text,
  url_fingerprint text,
  last_synced_at timestamptz,
  sync_status public.sync_status not null default 'never',
  last_error text,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index channel_connections_property_idx on public.channel_connections(property_id);
create unique index channel_connections_fingerprint_idx on public.channel_connections(property_id, url_fingerprint) where url_fingerprint is not null;

create table public.connection_secrets (
  connection_id uuid primary key references public.channel_connections(id) on delete cascade,
  ical_url text not null,
  created_at timestamptz not null default now()
);

create table public.room_listings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  channel public.booking_channel not null,
  external_listing_id text,
  external_listing_title text,
  connection_id uuid references public.channel_connections(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index room_listings_external_idx on public.room_listings(room_id, channel, external_listing_id) where external_listing_id is not null;

-- ============ BOOKINGS ============
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  listing_id uuid references public.room_listings(id) on delete set null,
  connection_id uuid references public.channel_connections(id) on delete set null,
  source public.booking_source not null default 'manual',
  channel public.booking_channel not null default 'direct',
  external_uid text,
  reservation_code text,
  guest_full_name text,
  guest_surname_initial text generated always as (
    upper(substring(regexp_replace(btrim(coalesce(guest_full_name,'')), '^.*\s', '') from 1 for 1))
  ) stored,
  guest_count integer not null default 1,
  phone_last4 text,
  check_in_date date not null,
  check_out_date date not null,
  check_in_time time,
  check_out_time time,
  status public.booking_status not null default 'upcoming',
  notes text,
  manual_fields text[] not null default '{}',
  last_synced_at timestamptz,
  anonymised_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index bookings_external_idx on public.bookings(property_id, channel, external_uid) where external_uid is not null;
create index bookings_property_dates_idx on public.bookings(property_id, check_in_date, check_out_date);
create index bookings_room_idx on public.bookings(room_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create trigger bookings_touch before update on public.bookings
for each row execute function public.touch_updated_at();

-- ============ UNAVAILABILITY ============
create table public.unavailability_windows (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  reason text,
  starts_at timestamptz,
  ends_at timestamptz,
  day_of_week smallint,
  start_time time,
  end_time time,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint unavailability_shape check (
    (starts_at is not null and ends_at is not null and day_of_week is null)
    or (day_of_week is not null and start_time is not null and end_time is not null and starts_at is null)
  ),
  constraint unavailability_dow check (day_of_week is null or (day_of_week between 0 and 6))
);
create index unavailability_property_idx on public.unavailability_windows(property_id);

-- ============ PRESENCE + SYNC LOG ============
create table public.presence_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event public.presence_event not null,
  at timestamptz not null default now(),
  source text not null default 'host'
);
create index presence_log_booking_idx on public.presence_log(booking_id);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.channel_connections(id) on delete cascade,
  status public.sync_status not null default 'ok',
  created_count integer not null default 0,
  updated_count integer not null default 0,
  cancelled_count integer not null default 0,
  skipped_count integer not null default 0,
  warnings text[] not null default '{}',
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index sync_runs_connection_idx on public.sync_runs(connection_id, started_at desc);

-- ============ PLACEHOLDER TABLES (later stages) ============
create table public.guides (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  title text not null,
  summary text,
  sort_order integer not null default 0,
  published boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.guide_steps (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  heading text not null,
  body text,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.extras_catalogue (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  description text,
  price_pence integer not null default 0,
  currency text not null default 'GBP',
  requires_approval boolean not null default true,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  extra_id uuid references public.extras_catalogue(id) on delete set null,
  kind text not null default 'extra',
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  request_id uuid references public.requests(id) on delete set null,
  amount_pence integer not null default 0,
  currency text not null default 'GBP',
  provider text not null default 'stripe',
  provider_ref text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  direction text not null default 'outbound',
  channel text not null default 'app',
  body text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.check_in_attempts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  surname_attempt text,
  code_last4 text,
  succeeded boolean not null default false,
  ip_hash text,
  created_at timestamptz not null default now()
);
create table public.verification_results (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  method text not null default 'surname_code',
  passed boolean not null default false,
  detail text,
  delete_after date,
  created_at timestamptz not null default now()
);

-- ============ GRANTS ============
grant select, insert, update, delete on
  public.hosts, public.host_members, public.properties, public.rooms,
  public.channel_connections, public.room_listings, public.bookings,
  public.unavailability_windows, public.presence_log, public.sync_runs,
  public.guides, public.guide_steps, public.extras_catalogue,
  public.requests, public.payments, public.messages,
  public.check_in_attempts, public.verification_results
to authenticated;

grant all on
  public.hosts, public.host_members, public.properties, public.rooms,
  public.channel_connections, public.connection_secrets, public.room_listings,
  public.bookings, public.unavailability_windows, public.presence_log, public.sync_runs,
  public.guides, public.guide_steps, public.extras_catalogue,
  public.requests, public.payments, public.messages,
  public.check_in_attempts, public.verification_results
to service_role;

revoke all on public.connection_secrets from anon, authenticated;

-- ============ RLS ============
alter table public.hosts enable row level security;
alter table public.host_members enable row level security;
alter table public.properties enable row level security;
alter table public.rooms enable row level security;
alter table public.channel_connections enable row level security;
alter table public.connection_secrets enable row level security;
alter table public.room_listings enable row level security;
alter table public.bookings enable row level security;
alter table public.unavailability_windows enable row level security;
alter table public.presence_log enable row level security;
alter table public.sync_runs enable row level security;
alter table public.guides enable row level security;
alter table public.guide_steps enable row level security;
alter table public.extras_catalogue enable row level security;
alter table public.requests enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;
alter table public.check_in_attempts enable row level security;
alter table public.verification_results enable row level security;

create policy hosts_select on public.hosts for select to authenticated using (public.is_host_member(id));
create policy hosts_insert on public.hosts for insert to authenticated with check (true);
create policy hosts_update on public.hosts for update to authenticated using (public.has_host_role(id,'owner'));
create policy hosts_delete on public.hosts for delete to authenticated using (public.has_host_role(id,'owner'));

create policy host_members_select on public.host_members for select to authenticated
  using (user_id = auth.uid() or public.is_host_staff(host_id));
create policy host_members_insert on public.host_members for insert to authenticated
  with check (user_id = auth.uid() or public.has_host_role(host_id,'owner'));
create policy host_members_update on public.host_members for update to authenticated
  using (public.has_host_role(host_id,'owner'));
create policy host_members_delete on public.host_members for delete to authenticated
  using (public.has_host_role(host_id,'owner'));

create policy properties_select on public.properties for select to authenticated using (public.is_host_member(host_id));
create policy properties_insert on public.properties for insert to authenticated with check (public.is_host_staff(host_id));
create policy properties_update on public.properties for update to authenticated using (public.is_host_staff(host_id));
create policy properties_delete on public.properties for delete to authenticated using (public.has_host_role(host_id,'owner'));

create policy rooms_select on public.rooms for select to authenticated
  using (public.is_host_member(public.property_host_id(property_id)));
create policy rooms_write on public.rooms for all to authenticated
  using (public.is_host_staff(public.property_host_id(property_id)))
  with check (public.is_host_staff(public.property_host_id(property_id)));

create policy unavail_select on public.unavailability_windows for select to authenticated
  using (public.is_host_member(public.property_host_id(property_id)));
create policy unavail_write on public.unavailability_windows for all to authenticated
  using (public.is_host_staff(public.property_host_id(property_id)))
  with check (public.is_host_staff(public.property_host_id(property_id)));

create policy conn_all on public.channel_connections for all to authenticated
  using (public.is_host_staff(public.property_host_id(property_id)))
  with check (public.is_host_staff(public.property_host_id(property_id)));

create policy secrets_no_access on public.connection_secrets for all to authenticated using (false) with check (false);

create policy listings_all on public.room_listings for all to authenticated
  using (public.is_host_staff(public.property_host_id((select r.property_id from public.rooms r where r.id = room_id))))
  with check (public.is_host_staff(public.property_host_id((select r.property_id from public.rooms r where r.id = room_id))));

create policy bookings_all on public.bookings for all to authenticated
  using (public.is_host_staff(public.property_host_id(property_id)))
  with check (public.is_host_staff(public.property_host_id(property_id)));

create policy presence_all on public.presence_log for all to authenticated
  using (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))))
  with check (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))));

create policy sync_runs_all on public.sync_runs for all to authenticated
  using (public.is_host_staff(public.property_host_id((select c.property_id from public.channel_connections c where c.id = connection_id))))
  with check (public.is_host_staff(public.property_host_id((select c.property_id from public.channel_connections c where c.id = connection_id))));

create policy guides_all on public.guides for all to authenticated
  using (public.is_host_staff(public.property_host_id(property_id)))
  with check (public.is_host_staff(public.property_host_id(property_id)));

create policy guide_steps_all on public.guide_steps for all to authenticated
  using (public.is_host_staff(public.property_host_id((select g.property_id from public.guides g where g.id = guide_id))))
  with check (public.is_host_staff(public.property_host_id((select g.property_id from public.guides g where g.id = guide_id))));

create policy extras_all on public.extras_catalogue for all to authenticated
  using (public.is_host_staff(public.property_host_id(property_id)))
  with check (public.is_host_staff(public.property_host_id(property_id)));

create policy requests_all on public.requests for all to authenticated
  using (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))))
  with check (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))));

create policy payments_all on public.payments for all to authenticated
  using (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))))
  with check (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))));

create policy messages_all on public.messages for all to authenticated
  using (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))))
  with check (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))));

create policy attempts_all on public.check_in_attempts for all to authenticated
  using (public.is_host_staff(public.property_host_id(property_id)))
  with check (public.is_host_staff(public.property_host_id(property_id)));

create policy verifications_all on public.verification_results for all to authenticated
  using (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))))
  with check (public.is_host_staff(public.property_host_id((select b.property_id from public.bookings b where b.id = booking_id))));

-- ============ CLEANER VIEW ============
create view public.cleaner_schedule
with (security_invoker = false) as
select
  b.id as booking_id,
  b.property_id,
  b.room_id,
  r.display_name as room_name,
  b.check_in_date,
  b.check_out_date,
  b.check_in_time,
  b.check_out_time,
  b.status,
  b.guest_count
from public.bookings b
left join public.rooms r on r.id = b.room_id
where b.status <> 'cancelled'
  and public.is_host_member(public.property_host_id(b.property_id));

grant select on public.cleaner_schedule to authenticated;