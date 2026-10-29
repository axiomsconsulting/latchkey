-- Short, easy-to-remember links to a guest's stay guide (/g/<three-words>),
-- shown on the door tablet when check-in ends so the guest can photograph
-- the QR or note the words. A visit mints a fresh stay token for the stay's
-- guide window (only token hashes are ever stored). Server only: no access
-- for signed-in users or the public. Additive.
create table if not exists public.stay_short_links (
  code text primary key check (code ~ '^[a-z]{3,11}-[a-z]{3,11}-[a-z]{3,11}$'),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists stay_short_links_booking_idx on public.stay_short_links(booking_id);
create index if not exists stay_short_links_expires_idx on public.stay_short_links(expires_at);
alter table public.stay_short_links enable row level security;
grant all on public.stay_short_links to service_role;
