-- Host notifications beyond email, and booking-site messages by email.
--  - hosts.notify_prefs: where each business wants alerts (email, push,
--    Telegram, SMS) and which kinds go by SMS.
--  - push_subscriptions: browsers/devices that asked for push alerts.
--  - telegram_links / telegram_link_codes: chats linked to a business.
--  - hosts.inbound_code: the private part of the business's forwarding
--    address for Airbnb / Booking.com message emails.
--  - inbound_emails: every forwarded email, matched to a stay when possible;
--    matched ones also become rows in messages (channel 'platform').

alter table public.hosts
  add column if not exists notify_prefs jsonb not null default '{}'::jsonb,
  add column if not exists inbound_code text unique check (inbound_code is null or inbound_code ~ '^[a-z0-9]{8,24}$');

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  user_id uuid not null,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  -- The service worker asks for the latest alert with this (hashed) token.
  token_hash text not null unique check (char_length(token_hash) = 64),
  device text check (device is null or char_length(device) <= 120),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failed_at timestamptz
);
create index if not exists push_subscriptions_host on public.push_subscriptions (host_id);

create table if not exists public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  user_id uuid,
  chat_id bigint not null,
  username text check (username is null or char_length(username) <= 64),
  linked_at timestamptz not null default now(),
  unique (host_id, chat_id)
);

create table if not exists public.telegram_link_codes (
  code text primary key check (code ~ '^[a-z0-9]{12,32}$'),
  host_id uuid not null references public.hosts(id) on delete cascade,
  user_id uuid not null,
  expires_at timestamptz not null
);

alter table public.messages
  add column if not exists platform text check (platform is null or char_length(platform) <= 30),
  add column if not exists reply_to text check (reply_to is null or char_length(reply_to) <= 320),
  add column if not exists external_id text check (external_id is null or char_length(external_id) <= 300);
create unique index if not exists messages_external_id on public.messages (external_id) where external_id is not null;

create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  received_at timestamptz not null default now(),
  platform text,
  from_addr text,
  reply_to text,
  subject text check (subject is null or char_length(subject) <= 500),
  guest_name text,
  reservation_code text,
  body text check (body is null or char_length(body) <= 20000),
  message_id text unique check (message_id is null or char_length(message_id) <= 300)
);
create index if not exists inbound_emails_host on public.inbound_emails (host_id, received_at desc);

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'telegram_links', 'telegram_link_codes', 'inbound_emails'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- People see and remove their own devices; owners and managers see the business's.
grant select, delete on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid() or public.can_write_host(host_id));
drop policy if exists push_subscriptions_remove on public.push_subscriptions;
create policy push_subscriptions_remove on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid() or public.can_write_host(host_id));

grant select, delete on public.telegram_links to authenticated;
drop policy if exists telegram_links_read on public.telegram_links;
create policy telegram_links_read on public.telegram_links for select to authenticated
  using (public.is_host_member(host_id));
drop policy if exists telegram_links_remove on public.telegram_links;
create policy telegram_links_remove on public.telegram_links for delete to authenticated
  using (user_id = auth.uid() or public.can_write_host(host_id));

grant select on public.inbound_emails to authenticated;
drop policy if exists inbound_emails_read on public.inbound_emails;
create policy inbound_emails_read on public.inbound_emails for select to authenticated
  using (public.can_write_host(host_id));

-- Latchkey-wide integration settings that aren't secrets (e.g. the inbound address pattern).
alter table public.site_settings add column if not exists integrations jsonb not null default '{}'::jsonb;
