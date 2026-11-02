-- Terms for direct stays (src/lib/stay-terms.ts): each guest's acceptance of the booking terms,
-- and for longer stays the signed licence to occupy with their declared permanent home and the
-- purpose of the stay. The exact text shown is kept with its SHA-256 (checked here), with when,
-- the IP address and browser, the ticks, and the drawn signature and signed PDF in the private
-- store (Google Drive). Nothing about the signing can be changed afterwards; the records are kept
-- until keep_until (six years after check-out) and then deleted by the daily clean-up (only the
-- server can delete; the host's team can only read).
-- stay_agreement_links: a host's link asking a guest to sign for a stay booked another way.
-- Written by the server only; the host's team reads its own (can_read_private). Additive.
create table if not exists public.stay_agreements (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  reservation_id uuid references public.direct_reservations(id) on delete set null,
  reference text,
  kind text not null check (kind in ('terms', 'licence')),
  version text not null,
  rendered_text text not null check (char_length(rendered_text) <= 40000),
  rendered_sha256 text not null,
  property_name text not null,
  guest_name text not null,
  guest_email text,
  guest_phone text,
  check_in date not null,
  check_out date not null,
  nights integer not null check (nights > 0),
  home_address jsonb,
  purpose text,
  ticks text[] not null default '{}',
  typed_name text,
  signature_path text,
  pdf_path text,
  pdf_sha256 text,
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  keep_until date not null,
  created_at timestamptz not null default now()
);
create index if not exists stay_agreements_booking on public.stay_agreements (booking_id);
create index if not exists stay_agreements_host on public.stay_agreements (host_id, signed_at desc);
create index if not exists stay_agreements_keep on public.stay_agreements (keep_until);

create or replace function public.stay_agreements_check() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.rendered_sha256 is distinct from encode(sha256(convert_to(new.rendered_text, 'UTF8')), 'hex') then
      raise exception 'rendered_sha256 must be the SHA-256 of rendered_text';
    end if;
    return new;
  end if;
  -- Only the stored files can be added later (once each); links to a deleted stay, property or
  -- reservation may clear, never point somewhere else.
  if (new.host_id, new.kind, new.version, new.rendered_text, new.rendered_sha256, new.property_name,
      new.guest_name, new.guest_email, new.guest_phone, new.check_in, new.check_out, new.nights,
      new.home_address, new.purpose, new.ticks, new.typed_name, new.signed_at, new.ip, new.user_agent,
      new.keep_until, new.created_at, new.reference)
     is distinct from
     (old.host_id, old.kind, old.version, old.rendered_text, old.rendered_sha256, old.property_name,
      old.guest_name, old.guest_email, old.guest_phone, old.check_in, old.check_out, old.nights,
      old.home_address, old.purpose, old.ticks, old.typed_name, old.signed_at, old.ip, old.user_agent,
      old.keep_until, old.created_at, old.reference)
     or (new.booking_id is not null and new.booking_id is distinct from old.booking_id)
     or (new.property_id is not null and new.property_id is distinct from old.property_id)
     or (new.reservation_id is not null and new.reservation_id is distinct from old.reservation_id)
     or (old.pdf_sha256 is not null and new.pdf_sha256 is distinct from old.pdf_sha256) then
    raise exception 'A signed stay agreement can''t be changed';
  end if;
  return new;
end $$;
drop trigger if exists stay_agreements_check on public.stay_agreements;
create trigger stay_agreements_check before insert or update on public.stay_agreements
  for each row execute function public.stay_agreements_check();

alter table public.stay_agreements enable row level security;
grant all on public.stay_agreements to service_role;
grant select on public.stay_agreements to authenticated;
drop policy if exists stay_agreements_read on public.stay_agreements;
create policy stay_agreements_read on public.stay_agreements for select to authenticated
  using (public.can_read_private(host_id));
drop policy if exists stay_agreements_property_scope on public.stay_agreements;
create policy stay_agreements_property_scope on public.stay_agreements as restrictive for all to authenticated
  using (property_id is null or public.property_visible(property_id))
  with check (property_id is null or public.property_visible(property_id));

create table if not exists public.stay_agreement_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists stay_agreement_links_booking on public.stay_agreement_links (booking_id);
alter table public.stay_agreement_links enable row level security;
grant all on public.stay_agreement_links to service_role;
drop policy if exists stay_agreement_links_property_scope on public.stay_agreement_links;
create policy stay_agreement_links_property_scope on public.stay_agreement_links as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));
