-- Invoices for direct stays. Nothing is generated until a guest (from their
-- guest guide) or the host asks for one. A guest may correct their email
-- and postal address once, then the invoice is locked to them; the host can
-- amend it at any time. Rules in src/lib/invoice.ts.

alter table public.hosts
  add column if not exists invoices_enabled boolean not null default false,
  add column if not exists tax_number text check (tax_number is null or char_length(tax_number) <= 40),
  add column if not exists invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9-]{1,12}$'),
  add column if not exists invoice_counter integer not null default 0;

-- What the guest paid for the stay, as the host entered it.
alter table public.bookings
  add column if not exists stay_amount_pence integer check (stay_amount_pence is null or stay_amount_pence between 0 and 100000000),
  add column if not exists stay_amount_includes_tax boolean;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  -- Kept when the stay is deleted: issued invoices are financial records.
  booking_id uuid references public.bookings(id) on delete set null,
  number text not null,
  issued_on date not null,
  -- The private link the guest and host share; anyone with it can view.
  access_token text not null unique check (char_length(access_token) >= 24),
  title text not null default 'Invoice' check (char_length(title) <= 40),
  seller_name text not null check (char_length(seller_name) <= 200),
  seller_room text check (seller_room is null or char_length(seller_room) <= 120),
  seller_address text check (seller_address is null or char_length(seller_address) <= 400),
  seller_tax_label text check (seller_tax_label is null or char_length(seller_tax_label) <= 40),
  seller_tax_number text check (seller_tax_number is null or char_length(seller_tax_number) <= 40),
  buyer_name text not null check (char_length(buyer_name) <= 200),
  buyer_email text check (buyer_email is null or char_length(buyer_email) <= 254),
  buyer_address text check (buyer_address is null or char_length(buyer_address) <= 400),
  description text not null check (char_length(description) <= 300),
  check_in_date date,
  check_out_date date,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tax_name text check (tax_name is null or char_length(tax_name) <= 20),
  tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
  net_pence integer not null check (net_pence >= 0),
  tax_pence integer not null check (tax_pence >= 0),
  total_pence integer not null check (total_pence = net_pence + tax_pence),
  -- Set when the guest creates it; after that only the host changes it.
  guest_locked_at timestamptz,
  amended_at timestamptz,
  created_by text not null check (created_by in ('guest', 'host')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (host_id, number)
);
create unique index if not exists invoices_booking_idx on public.invoices(booking_id) where booking_id is not null;
create index if not exists invoices_host_idx on public.invoices(host_id, issued_on desc);

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

alter table public.invoices enable row level security;
grant all on public.invoices to service_role;
grant select on public.invoices to authenticated;
-- Staff read them; every write goes through Latchkey's server after its own checks.
drop policy if exists invoices_staff_read on public.invoices;
create policy invoices_staff_read on public.invoices for select to authenticated
  using (public.is_host_staff(host_id));

-- Invoice numbers run in sequence per business, with no gaps or repeats.
create or replace function public.claim_invoice_number(_host_id uuid)
returns integer language sql security definer set search_path = public as $$
  update public.hosts set invoice_counter = invoice_counter + 1 where id = _host_id returning invoice_counter
$$;
revoke all on function public.claim_invoice_number(uuid) from public, anon, authenticated;
grant execute on function public.claim_invoice_number(uuid) to service_role;

drop trigger if exists audit_row on public.invoices;
create trigger audit_row after update or delete on public.invoices
  for each row execute function public.audit_row();

-- Amendments are logged without copying the guest's details or the link.
create or replace function public.audit_redacted(_key text)
returns boolean language sql immutable as $$
  select _key in ('check_in_pin', 'wifi_password', 'feed_token', 'token_hash', 'bank_details',
                  'reservation_code', 'phone_last4', 'notes',
                  'full_name', 'document_number', 'place_of_issue', 'next_destination', 'next_address',
                  'date_of_birth', 'document_last4',
                  'access_token', 'buyer_name', 'buyer_address')
      or _key like '%\_url' or _key like 'guest\_%' or _key like '%password%'
      or _key like '%secret%' or _key like '%email%' or _key like '%phone%'
$$;
