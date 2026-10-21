-- Repeat direct stays (src/lib/direct.ts).
--
-- guest_contacts: guests who chose to hear from the business about future
-- stays. The exact words they agreed to are kept with the date; withdrawing
-- (by the link, or the host removing them) deletes the row. Written only by
-- the server; owners and managers read and remove them.
create table if not exists public.guest_contacts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  name text check (name is null or char_length(name) <= 120),
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  consent_text text not null,
  consent_at timestamptz not null default now(),
  source text not null default 'stay_page' check (source in ('stay_page', 'enquiry')),
  withdraw_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
create unique index if not exists guest_contacts_host_email_idx on public.guest_contacts(host_id, email);
alter table public.guest_contacts enable row level security;
grant all on public.guest_contacts to service_role;
grant select, delete on public.guest_contacts to authenticated;
drop policy if exists guest_contacts_read on public.guest_contacts;
create policy guest_contacts_read on public.guest_contacts for select to authenticated using (public.can_read_private(host_id));
drop policy if exists guest_contacts_remove on public.guest_contacts;
create policy guest_contacts_remove on public.guest_contacts for delete to authenticated using (public.can_write_host(host_id));

-- direct_enquiries: someone asking about dates on the property's enquiry
-- page. The host replies from their own mailbox and may turn it into a
-- direct stay (booking_id). Removed a year after it arrived.
create table if not exists public.direct_enquiries (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) <= 30),
  check_in date not null,
  check_out date not null,
  guests int not null check (guests between 1 and 20),
  message text check (message is null or char_length(message) <= 2000),
  is_returning boolean not null default false,
  status text not null default 'new' check (status in ('new', 'offered', 'booked', 'declined')),
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists direct_enquiries_host_idx on public.direct_enquiries(host_id, created_at desc);
alter table public.direct_enquiries enable row level security;
grant all on public.direct_enquiries to service_role;
grant select, update, delete on public.direct_enquiries to authenticated;
drop policy if exists direct_enquiries_read on public.direct_enquiries;
create policy direct_enquiries_read on public.direct_enquiries for select to authenticated using (public.can_read_private(host_id));
drop policy if exists direct_enquiries_write on public.direct_enquiries;
create policy direct_enquiries_write on public.direct_enquiries for update to authenticated using (public.can_write_host(host_id)) with check (public.can_write_host(host_id));
drop policy if exists direct_enquiries_remove on public.direct_enquiries;
create policy direct_enquiries_remove on public.direct_enquiries for delete to authenticated using (public.can_write_host(host_id));
