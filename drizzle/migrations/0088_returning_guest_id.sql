-- Returning guests (rules in src/lib/returning-trust.ts). A host's switch, off by default, and a
-- small record of a passed ID check so the guest needn't photograph their ID again within 12 months.
-- No photos and no document number: only scrambled contact details, the name on the ID and its
-- expiry date. Written only by the server; made only while the host's switch is on. Additive.

alter table public.properties add column if not exists returning_trust boolean not null default false;

create table if not exists public.guest_id_passes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  email_hash text,
  phone_hash text,
  full_name text not null check (char_length(full_name) <= 120),
  document_expiry date not null,
  verified_at timestamptz not null default now(),
  keep_until date not null,
  constraint guest_id_passes_has_contact check (email_hash is not null or phone_hash is not null)
);
create index if not exists guest_id_passes_email_idx on public.guest_id_passes(host_id, email_hash);
create index if not exists guest_id_passes_phone_idx on public.guest_id_passes(host_id, phone_hash);
create index if not exists guest_id_passes_keep_idx on public.guest_id_passes(keep_until);

alter table public.guest_id_passes enable row level security;
revoke all on public.guest_id_passes from anon, authenticated;
grant all on public.guest_id_passes to service_role;
