-- Room lights through TP-Link Tapo's cloud as well as SmartThings (Latchkey admin picks which hosts
-- connect with). Additive: wider provider checks and new nullable columns; existing rows unchanged.

alter table public.smart_home_links drop constraint if exists smart_home_links_provider_check;
alter table public.smart_home_links
  add constraint smart_home_links_provider_check check (provider in ('smartthings', 'tapo'));
alter table public.smart_home_links alter column refresh_token drop not null;
-- Tapo: the account's email (shown to the host), its password sealed with the server's key
-- (TP-Link's sign-ins end, so Latchkey signs in again), and this connection's own terminal id.
alter table public.smart_home_links add column if not exists account_email text;
alter table public.smart_home_links add column if not exists secret_sealed text;
alter table public.smart_home_links add column if not exists terminal_id text;

alter table public.room_devices drop constraint if exists room_devices_provider_check;
alter table public.room_devices
  add constraint room_devices_provider_check check (provider in ('smartthings', 'tapo'));
-- Tapo: the regional server that reaches the device, and its model (L530, P110…).
alter table public.room_devices add column if not exists server_url text;
alter table public.room_devices add column if not exists model text;
