-- The property's best reviews from its own listing pages, quoted word for word, shown on the door
-- tablet while an ID or selfie is checked (src/lib/kiosk-reviews.ts). Members read (the host's list
-- in Settings); only the server writes. Additive.
create table if not exists public.kiosk_reviews (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  site text not null check (char_length(site) between 1 and 40),
  first_name text not null check (char_length(first_name) between 1 and 40),
  rating numeric(3,1) not null,
  out_of smallint not null check (out_of in (5, 10)),
  review_date text,
  quote text not null check (char_length(quote) between 1 and 300),
  review_key text not null,
  source_url text,
  hidden boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (property_id, review_key)
);
alter table public.kiosk_reviews enable row level security;
grant all on public.kiosk_reviews to service_role;
grant select on public.kiosk_reviews to authenticated;
drop policy if exists kiosk_reviews_read on public.kiosk_reviews;
create policy kiosk_reviews_read on public.kiosk_reviews for select to authenticated
  using (public.is_host_member(public.property_host_id(property_id)));
drop policy if exists kiosk_reviews_property_scope on public.kiosk_reviews;
create policy kiosk_reviews_property_scope on public.kiosk_reviews as restrictive for all to authenticated
  using (public.property_visible(property_id)) with check (public.property_visible(property_id));

-- When each property's reviews were last read (even when none qualified), so the scheduled refresh
-- (every N days, set in Latchkey admin) knows what's due. Server only.
create table if not exists public.kiosk_review_fetches (
  property_id uuid primary key references public.properties(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  pages integer not null default 0,
  kept integer not null default 0,
  error text
);
alter table public.kiosk_review_fetches enable row level security;
grant all on public.kiosk_review_fetches to service_role;
